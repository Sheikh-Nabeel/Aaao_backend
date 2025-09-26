import asyncHandler from "express-async-handler";
import { calculateShiftingMoversFare } from "../utils/fareCalculator.js";
import FareCalculator from "../utils/fareCalculator.js";
import { calculateComprehensiveFare } from "../utils/comprehensiveFareCalculator.js";
import PricingConfig from "../models/pricingModel.js";
import ComprehensivePricing from "../models/comprehensivePricingModel.js";
import User from "../models/userModel.js";
import { calculateDistance } from "../utils/distanceCalculator.js";
import Booking from "../models/bookingModel.js";

// Find qualified drivers and vehicles for fare estimation
const findQualifiedDriversForEstimation = async (
  pickupLocation,
  serviceType,
  vehicleType,
  driverPreference = "nearby"
) => {
  try {
    console.log("=== FINDING QUALIFIED DRIVERS FOR ESTIMATION ===");
    console.log("Service Type:", serviceType);
    console.log("Vehicle Type:", vehicleType);
    console.log("Driver Preference:", driverPreference);

    let driverQuery = {
      role: "driver",
      kycLevel: 2,
      kycStatus: "approved",
      isActive: true,
      driverStatus: "online",
    };

    // Handle Pink Captain preferences (only for car cab and bike)
    if (driverPreference === "pink_captain") {
      const st = String(serviceType || "").toLowerCase();
      const allowed = st === "car cab" || st === "bike";
      if (allowed) {
        driverQuery.gender = "female";
        console.log("Pink Captain requested - filtering for female drivers");
      } else {
        console.log(
          "Pink Captain ignored: only applicable for car cab and bike"
        );
      }
    }

    console.log("Driver Query:", driverQuery);

    // Find drivers based on query
    const drivers = await User.find(driverQuery).select(
      "firstName lastName email phoneNumber currentLocation gender driverSettings vehicleDetails profilePicture rating totalRides"
    );
    console.log(`Found ${drivers.length} potential drivers`);

    if (drivers.length === 0) {
      console.log("No drivers found matching criteria");
      return [];
    }

    // Get driver IDs for vehicle lookup
    const driverIds = drivers.map((driver) => driver._id);

    // Find vehicles that match the service type and vehicle type
    let vehicleQuery = {
      userId: { $in: driverIds },
      serviceType: serviceType,
    };

    // Add vehicle type filter if specified
    if (vehicleType && vehicleType !== "any") {
      vehicleQuery.vehicleType = vehicleType;
    }

    console.log("Vehicle Query:", vehicleQuery);

    // Import Vehicle model
    const Vehicle = (await import("../models/vehicleModel.js")).default;

    // Find matching vehicles
    const vehicles = await Vehicle.find(vehicleQuery).select(
      "userId vehicleType serviceType"
    );
    console.log(`Found ${vehicles.length} matching vehicles`);

    if (vehicles.length === 0) {
      console.log(
        "No vehicles found matching service and vehicle type criteria"
      );
      return [];
    }

    // Get driver IDs that have matching vehicles
    const qualifiedDriverIds = vehicles.map((vehicle) =>
      vehicle.userId.toString()
    );

    // Filter drivers to only those with matching vehicles
    const qualifiedDrivers = drivers.filter((driver) =>
      qualifiedDriverIds.includes(driver._id.toString())
    );

    console.log(
      `Found ${qualifiedDrivers.length} drivers with matching vehicles`
    );

    if (qualifiedDrivers.length === 0) {
      console.log("No qualified drivers found with matching vehicles");
      return [];
    }

    // Calculate distances and filter by radius
    const driversWithDistance = [];
    const maxRadius = driverPreference === "pink_captain" ? 50 : 10; // 50km for Pink Captain, 10km for estimation

    for (const driver of qualifiedDrivers) {
      if (driver.currentLocation && driver.currentLocation.coordinates) {
        const distance = calculateDistance(
          {
            lat: pickupLocation.coordinates[1],
            lng: pickupLocation.coordinates[0],
          },
          {
            lat: driver.currentLocation.coordinates[1],
            lng: driver.currentLocation.coordinates[0],
          }
        );

        if (distance <= maxRadius) {
          driversWithDistance.push({
            id: driver._id,
            name: `${driver.firstName} ${driver.lastName}`,
            email: driver.email,
            phoneNumber: driver.phoneNumber,
            vehicleType: driver.vehicleType,
            vehicleDetails: driver.vehicleDetails,
            profilePicture: driver.profilePicture,
            rating: driver.rating || 0,
            totalRides: driver.totalRides || 0,
            gender: driver.gender,
            currentLocation: {
              coordinates: driver.currentLocation.coordinates,
              address: driver.currentLocation.address,
              lastUpdated: driver.currentLocation.lastUpdated,
            },
            distance: Math.round(distance * 100) / 100,
            estimatedArrival: Math.ceil(distance / 0.5), // Assuming 30km/h average speed in city
          });
        }
      }
    }

    // Filter Pink Captain drivers based on their preferences
    let filteredDrivers = driversWithDistance;
    if (
      driverPreference === "pink_captain" &&
      (String(serviceType).toLowerCase() === "car cab" ||
        String(serviceType).toLowerCase() === "bike")
    ) {
      console.log("Filtering Pink Captain drivers based on preferences...");

      filteredDrivers = driversWithDistance.filter((driver) => {
        const driverData = qualifiedDrivers.find(
          (d) => d._id.toString() === driver.id.toString()
        );
        const driverPrefs = driverData?.driverSettings?.ridePreferences;
        return driverPrefs && driverPrefs.pinkCaptainMode;
      });

      console.log(`Filtered to ${filteredDrivers.length} Pink Captain drivers`);
    }

    // Sort by distance and limit to top 10
    filteredDrivers.sort((a, b) => a.distance - b.distance);
    const topDrivers = filteredDrivers.slice(0, 10);

    console.log(
      `Returning ${topDrivers.length} qualified drivers within ${maxRadius}km radius`
    );
    return topDrivers;
  } catch (error) {
    console.error("Error finding qualified drivers for estimation:", error);
    return [];
  }
};

// Get fare adjustment settings
const getFareAdjustmentSettings = async (serviceType) => {
  try {
    const config = await PricingConfig.findOne({
      serviceType:
        serviceType === "shifting & movers"
          ? "shifting_movers"
          : serviceType.replace(" ", "_"),
      isActive: true,
    });

    if (config && config.fareAdjustmentSettings) {
      return config.fareAdjustmentSettings;
    }

    // Default settings if no config found
    return {
      allowedAdjustmentPercentage: 3,
      enableUserFareAdjustment: true,
      enablePendingBookingFareIncrease: true,
    };
  } catch (error) {
    console.error("Error fetching fare adjustment settings:", error);
    return {
      allowedAdjustmentPercentage: 3,
      enableUserFareAdjustment: true,
      enablePendingBookingFareIncrease: true,
    };
  }
};

// Calculate fare by service type using comprehensive system
const calculateFareByServiceType = async (
  serviceType,
  vehicleType,
  distance,
  routeType,
  additionalData = {}
) => {
  const distanceInKm = distance / 1000;

  // Check if comprehensive pricing is available
  const comprehensiveConfig = await ComprehensivePricing.findOne({
    isActive: true,
  });

  if (
    comprehensiveConfig &&
    (serviceType === "car cab" ||
      serviceType === "bike" ||
      serviceType === "car recovery")
  ) {
    // Use comprehensive fare calculation
    const bookingData = {
      serviceType: serviceType.replace(" ", "_"),
      vehicleType,
      distance: distanceInKm,
      routeType,
      demandRatio: additionalData.demandRatio || 1,
      waitingMinutes: additionalData.waitingMinutes || 0,
      estimatedDuration: additionalData.estimatedDuration || 0,
    };

    const fareResult = await calculateComprehensiveFare(bookingData);
    return fareResult;
  }

  // Fallback to old calculation for other services or if comprehensive config not found
  switch (serviceType) {
    case "car cab":
    case "bike":
      // Basic taxi/bike fare calculation
      const baseFare = serviceType === "bike" ? 5 : 10;
      const perKmRate = serviceType === "bike" ? 2 : 3;
      const multiplier = routeType === "round_trip" ? 1.8 : 1;
      return (baseFare + distanceInKm * perKmRate) * multiplier;

    case "shifting & movers":
      return calculateShiftingMoversFare({
        vehicleType,
        distance: distanceInKm,
        routeType,
        serviceDetails: {},
        itemDetails: [],
        serviceOptions: {},
      });

    case "car recovery":
      // Prefer Admin PricingConfig (carRecoveryConfig); fallback to calculator
      const mapToCalcType = (cat) => {
        const v = String(cat || "").toLowerCase();
        if (v.includes("towing")) return "towing";
        if (v.includes("winching")) return "winching";
        if (v.includes("roadside")) return "roadside_assistance";
        if (v.includes("key")) return "key_unlock";
        return "specialized_recovery";
      };
      try {
        const cfg = await PricingConfig.findOne({
          serviceType: "car_recovery",
          isActive: true,
        }).lean();
        const admin = cfg?.carRecoveryConfig;
        const comp = await ComprehensivePricing.findOne({
          isActive: true,
        }).lean();
        if (admin?.serviceCharges) {
          // Prefer explicit subService if provided, else map from serviceCategory
          const preferredSub = String(additionalData?.subService || "")
            .trim()
            .toLowerCase();
          const broad = mapToCalcType(
            additionalData?.serviceCategory || serviceType
          );
          let sc =
            admin.serviceCharges[preferredSub] ||
            admin.serviceCharges[broad] ||
            admin.serviceCharges.default ||
            {};
          const cityRule = comp?.cityPricing?.rules?.find?.(
            (r) => Number(distanceInKm) >= Number(r?.minKm || 0)
          );
          if (cityRule?.perKm) {
            sc = { ...sc, perKm: Number(cityRule.perKm) };
          }
          const baseKm = Number(sc.baseKm ?? 6);
          const baseFare = Number(sc.baseFare ?? 50);
          const perKm = Number(sc.perKm ?? 7.5);
          const platformPct = Number(admin.platformCharges?.percentage ?? 0);
          const vatPct = Number(process.env.VAT_PERCENT || 0);
          const d = Math.max(0, distanceInKm);
          const extraKm = Math.max(0, d - baseKm);
          const distanceFare = Math.round(extraKm * perKm);
          // Night charge and surge multipliers
          const startTime = additionalData.startTime
            ? new Date(additionalData.startTime)
            : new Date();
          const hour = startTime.getHours();
          let nightCharge = 0;
          let nightMultiplier = 1;
          const nightCfg = comp?.nightCharges;
          const inNight = hour >= 22 || hour < 6;
          if (inNight && nightCfg) {
            if (String(nightCfg.mode || "").toLowerCase() === "multiplier")
              nightMultiplier = Number(nightCfg.value || 1.25);
            else nightCharge = Number(nightCfg.value || 10);
          }
          // Surge
          let surgeMultiplier = 1;
          const surge = comp?.surgePricing;
          if (surge?.mode && String(surge.mode).toLowerCase() !== "none") {
            surgeMultiplier =
              surge.mode === "1.5x" ? 1.5 : surge.mode === "2.0x" ? 2.0 : 1;
          }
          let subtotal = Math.round(baseFare + distanceFare);
          subtotal = Math.round(
            (subtotal + nightCharge) * nightMultiplier * surgeMultiplier
          );
          const platformFee = Math.round((subtotal * platformPct) / 100);
          const platformCustomer = Math.round(platformFee / 2);
          const platformDriver = platformFee - platformCustomer;
          const subtotalWithPlatform = subtotal + platformFee;
          const vatAmount = Math.round((subtotalWithPlatform * vatPct) / 100);
          // Round-trip discount
          const roundTrip =
            routeType === "two_way" || routeType === "round_trip";
          const rtDiscount = roundTrip
            ? Number(process.env.ROUND_TRIP_DISCOUNT_AED || 10)
            : 0;
          const totalFare = Math.max(
            0,
            subtotalWithPlatform + vatAmount - rtDiscount
          );
          return {
            currency: "AED",
            baseFare,
            distanceFare,
            platformFee,
            platformFeeSplit: {
              customer: platformCustomer,
              driver: platformDriver,
            },
            nightCharge: nightCharge || undefined,
            nightMultiplier:
              nightMultiplier !== 1 ? nightMultiplier : undefined,
            surgeMultiplier:
              surgeMultiplier !== 1 ? surgeMultiplier : undefined,
            cityOverridePerKm: cityRule?.perKm || undefined,
            roundTripDiscount: rtDiscount || undefined,
            vatAmount,
            subtotal: subtotalWithPlatform,
            totalFare,
            breakdown: {
              baseKm,
              perKm,
              distanceInKm: d,
              usedSubService: preferredSub || broad,
            },
          };
        }
      } catch (_) {}
      // Fallback to unified recovery calculator
      {
        const fare = await FareCalculator.calculateRecoveryFare({
          vehicleType: vehicleType,
          serviceType: mapToCalcType(serviceType),
          distance: distanceInKm,
          duration: Math.ceil((distanceInKm / 30) * 60),
          startTime: new Date(),
          waitingTime: Number(additionalData.waitingMinutes || 0),
        });
        const estimatedFare = fare.totalWithVat ?? fare.totalFare ?? 0;
        return {
          currency: "AED",
          breakdown: fare.fareBreakdown,
          baseFare: fare.baseFare,
          distanceFare: fare.distanceFare,
          platformFee: fare.platformFee?.amount,
          nightCharges: fare.nightSurcharge,
          surgeCharges: undefined,
          waitingCharges: fare.waitingCharges,
          vatAmount: fare.vat?.amount,
          subtotal: fare.subtotal,
          totalFare: estimatedFare,
        };
      }

    default:
      return 20; // Default minimum fare
  }
};

// Helpers
const computeWaitingCharges = (params) => {
  const {
    waitingMinutes = 0,
    isRoundTrip = false,
    distanceKm = 0,
    comp,
  } = params || {};
  // Base free: 5 minutes
  let freeMinutes = 5;
  // Round-trip: +0.5 min per km, with admin cap
  if (isRoundTrip) {
    const extra = 0.5 * Number(distanceKm || 0);
    const cap = Number(comp?.roundTripFreeStay?.maxMinutes ?? 30);
    freeMinutes += Math.min(extra, cap);
  }
  const ratePerMin = 2; // AED 2 per minute
  const capAed = 20; // max AED 20
  const billable = Math.max(
    0,
    Math.ceil(Number(waitingMinutes || 0) - freeMinutes)
  );
  const charges = Math.min(capAed, billable * ratePerMin);
  return { freeMinutes, billableMinutes: billable, waitingCharges: charges };
};

const safeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Try to derive components from a textual breakdown array
const extractNumbersFromBreakdown = (breakdown) => {
  const out = {
    baseFare: 0,
    distanceFare: 0,
    convenienceFee: 0,
    nightCharges: 0,
    surgeCharges: 0,
    platformFee: 0,
    waitingCharges: 0,
    helperFee: 0,
    vatAmount: 0,
    subtotal: 0,
    totalFare: 0,
  };
  if (!Array.isArray(breakdown)) return out;
  const pick = (desc) =>
    breakdown.find((x) =>
      String(x.description || "")
        .toLowerCase()
        .includes(desc)
    );
  out.baseFare = safeNumber(pick("base")?.amount, 0);
  // Distance lines may include km text; just take amount
  out.distanceFare = safeNumber(pick("distance")?.amount, 0);
  out.convenienceFee = safeNumber(pick("convenience")?.amount, 0);
  out.nightCharges = safeNumber(pick("night")?.amount, 0);
  out.surgeCharges = safeNumber(pick("surge")?.amount, 0);
  out.platformFee = safeNumber(pick("platform")?.amount, 0);
  out.waitingCharges = safeNumber(pick("waiting")?.amount, 0);
  out.helperFee = safeNumber(pick("helper")?.amount, 0);
  out.vatAmount = safeNumber(pick("vat")?.amount, 0);
  out.subtotal = safeNumber(pick("sub")?.amount, 0); // matches 'subtotal'
  out.totalFare = safeNumber(pick("total")?.amount, 0);
  return out;
};

// Get fare estimation
const getFareEstimation = asyncHandler(async (req, res) => {
  const {
    requestId, // optional: estimate by existing booking
    pickupLocation: pickupLocationRaw,
    dropoffLocation: dropoffLocationRaw,
    destinationLocation, // alias supported
    serviceType: serviceTypeRaw,
    serviceCategory: serviceCategoryRaw,
    vehicleType: vehicleTypeRaw,
    routeType = "one_way",
    distanceInMeters,
    serviceDetails = {},
    itemDetails = [],
    serviceOptions = {},
    paymentMethod = "cash",
  } = req.body;

  // Input normalization for body-based path
  const dropoffLocation = dropoffLocationRaw || destinationLocation || {};
  const pickupLocation = pickupLocationRaw || {};
  let serviceType = serviceTypeRaw;
  let serviceCategory = serviceCategoryRaw;
  let vehicleType = vehicleTypeRaw;

  // Map short recovery types to car recovery unified type
  const mapShortToRecovery = (st) => {
    if (!st) return null;
    const x = String(st).toLowerCase().replace(/\s+/g, "_");
    if (["towing", "flatbed", "wheel_lift"].includes(x))
      return { type: "car recovery", category: "towing services" };
    if (
      [
        "winching",
        "on-road_winching",
        "off-road_winching",
        "on_road_winching",
        "off_road_winching",
      ].includes(x)
    )
      return { type: "car recovery", category: "winching services" };
    if (
      [
        "roadside_assistance",
        "battery_jump_start",
        "fuel_delivery",
        "roadside",
      ].includes(x)
    )
      return { type: "car recovery", category: "roadside assistance" };
    if (["key_unlock", "key", "unlock"].includes(x))
      return { type: "car recovery", category: "roadside assistance" };
    return null;
  };
  const shortMap = mapShortToRecovery(serviceTypeRaw);
  if (shortMap) {
    serviceType = shortMap.type;
    if (!serviceCategory) serviceCategory = shortMap.category;
  }

  // Authentication validation
  if (!req.user || !req.user._id) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please log in to get fare estimation.",
      token: req.cookies.token,
    });
  }

  const userId = req.user._id;

  // Validate user KYC status for fare estimation
  const REQUIRE_KYC =
    (process.env.FARE_ESTIMATE_REQUIRE_KYC || "true").toLowerCase() !== "false";
  if (
    REQUIRE_KYC &&
    !requestId &&
    (req.user.kycLevel < 1 || req.user.kycStatus !== "approved")
  ) {
    return res.status(403).json({
      success: false,
      message: "KYC Level 1 must be approved to get fare estimation.",
      token: req.cookies.token,
    });
  }

  // Branch A: requestId path (generic, works for any module with a Booking). When provided, KYC requirement is bypassed after auth.
  if (requestId) {
    try {
      const booking = await Booking.findById(requestId).select(
        "user driver serviceType serviceCategory vehicleType pickupLocation dropoffLocation routeType"
      );
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found",
          token: req.cookies.token,
        });
      }

      // Authorization: user, driver or admin
      const reqUserIdStr = String(req.user._id);
      const isOwner = String(booking.user) === reqUserIdStr;
      const isDriver =
        booking.driver && String(booking.driver) === reqUserIdStr;
      const isAdmin =
        req.user.role === "admin" || req.user.role === "superadmin";
      if (!isOwner && !isDriver && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Not authorized for this booking",
          token: req.cookies.token,
        });
      }

      // Normalize GeoJSON to lat/lng
      const toLatLng = (geo) => ({
        lat: geo.coordinates?.[1],
        lng: geo.coordinates?.[0],
      });
      const pickup = toLatLng(booking.pickupLocation);
      const dropoff = toLatLng(booking.dropoffLocation);
      const distanceKm = calculateDistance(pickup, dropoff);
      const distanceMeters = Math.round(distanceKm * 1000);
      const avgSpeedKmh = 30;
      const durationMinutes = Math.ceil((distanceKm / avgSpeedKmh) * 60);

      // Map car recovery categories to calculator serviceType
      const mapToCalcType = (cat) => {
        const v = String(cat || "").toLowerCase();
        if (v.includes("towing")) return "towing";
        if (v.includes("winching")) return "winching";
        if (v.includes("roadside")) return "roadside_assistance";
        if (v.includes("key")) return "key_unlock";
        return "specialized_recovery";
      };

      let fareResult;
      let estimatedFare;
      if (booking.serviceType === "car recovery") {
        // Prefer Admin PricingConfig (carRecoveryConfig); fallback to calculator
        const mapToCalcType = (cat) => {
          const v = String(cat || "").toLowerCase();
          if (v.includes("towing")) return "towing";
          if (v.includes("winching")) return "winching";
          if (v.includes("roadside")) return "roadside_assistance";
          if (v.includes("key")) return "key_unlock";
          return "specialized_recovery";
        };
        let usedAdmin = false;
        try {
          const cfg = await PricingConfig.findOne({
            serviceType: "car_recovery",
            isActive: true,
          }).lean();
          const admin = cfg?.carRecoveryConfig;
          const comp = await ComprehensivePricing.findOne({
            isActive: true,
          }).lean();
          if (admin?.serviceCharges) {
            usedAdmin = true;
            console.log(
              "[fare-estimate][car-recovery][admin] using admin pricing (Branch A)"
            );
            // Prefer explicit subService if provided, else map from serviceCategory
            const preferredSub = String(req.body?.subService || "")
              .trim()
              .toLowerCase();
            const broad = mapToCalcType(booking.serviceCategory);
            let sc =
              admin.serviceCharges[preferredSub] ||
              admin.serviceCharges[broad] ||
              admin.serviceCharges.default ||
              {};
            // Effective distance for route type (2x for round-trip)
            const isRoundTrip =
              booking.routeType === "two_way" ||
              booking.routeType === "round_trip" ||
              !!req.body?.options?.roundTrip;
            const dEff = Math.max(0, isRoundTrip ? distanceKm * 2 : distanceKm);
            const cityRule = comp?.cityPricing?.rules?.find?.(
              (r) => Number(dEff) >= Number(r?.minKm || 0)
            );
            if (cityRule?.perKm) {
              sc = { ...sc, perKm: Number(cityRule.perKm) };
            }
            const baseKm = Number(sc.baseKm ?? 6);
            const baseFare = Number(sc.baseFare ?? 50);
            const perKm = Number(sc.perKm ?? 7.5);
            const platformPct = Number(admin.platformCharges?.percentage ?? 15);
            const vatPct = Number(process.env.VAT_PERCENT || 0);
            const d = dEff;
            const extraKm = Math.max(0, d - baseKm);
            const distanceFare = Math.round(extraKm * perKm);
            // Night charge and surge multipliers
            const startTime = new Date();
            const hour = startTime.getHours();
            let nightCharge = 0;
            let nightMultiplier = 1;
            const nightCfg = comp?.nightCharges;
            const inNight = hour >= 22 || hour < 6;
            if (inNight && nightCfg) {
              if (String(nightCfg.mode || "").toLowerCase() === "multiplier")
                nightMultiplier = Number(nightCfg.value || 1.25);
              else nightCharge = Number(nightCfg.value || 10);
            }
            // Surge
            let surgeMultiplier = 1;
            const surge = comp?.surgePricing;
            if (surge?.mode && String(surge.mode).toLowerCase() !== "none") {
              surgeMultiplier =
                surge.mode === "1.5x" ? 1.5 : surge.mode === "2.0x" ? 2.0 : 1;
            }
            let subtotal = Math.round(baseFare + distanceFare);
            subtotal = Math.round(
              (subtotal + nightCharge) * nightMultiplier * surgeMultiplier
            );
            const platformFee = Math.round((subtotal * platformPct) / 100);
            const platformCustomer = Math.round(platformFee / 2);
            const platformDriver = platformFee - platformCustomer;
            const subtotalWithPlatform = subtotal + platformFee;
            const vatAmount = Math.round((subtotalWithPlatform * vatPct) / 100);
            // Round-trip discount
            const roundTrip = isRoundTrip;
            const rtDiscount = roundTrip
              ? Number(process.env.ROUND_TRIP_DISCOUNT_AED || 10)
              : 0;
            const totalFare = Math.max(
              0,
              subtotalWithPlatform + vatAmount - rtDiscount
            );
            estimatedFare = totalFare;
            const helperEnabled = !!(
              req.body?.helper === true || req.body?.options?.helper === true
            );
            const helperFeeAed = helperEnabled
              ? Number(comp?.helper?.fee ?? process.env.HELPER_FEE_AED ?? 25)
              : 0;
            fareResult = {
              currency: "AED",
              baseFare,
              distanceFare,
              platformFee,
              platformFeeSplit: {
                customer: platformCustomer,
                driver: platformDriver,
              },
              nightCharge: nightCharge || undefined,
              nightCharges: nightCharge || undefined,
              nightMultiplier:
                nightMultiplier !== 1 ? nightMultiplier : undefined,
              surgeMultiplier:
                surgeMultiplier !== 1 ? surgeMultiplier : undefined,
              cityOverridePerKm: cityRule?.perKm || undefined,
              roundTripDiscount: rtDiscount || undefined,
              vatAmount,
              subtotal: subtotalWithPlatform,
              totalFare,
              breakdown: {
                baseKm,
                perKm,
                distanceInKm: d,
                usedSubService: preferredSub || broad,
              },
              policies: {
                cancellation: {
                  thresholds: {
                    beforeArrivalAfter25pct: 2,
                    halfWayOrMore: 5,
                    afterArrived: 10,
                  },
                  notes:
                    "Cancellation fees apply based on driver progress. Only charged once rider crosses 25% of driver distance.",
                },
                refreshmentAlert: {
                  triggerDistanceKm: 20,
                  triggerDurationMin: 30,
                  perMinute: 1,
                  per5Min: 5,
                  maxMinutes: 30,
                },
              },
              helper: { enabled: helperEnabled, fee: helperFeeAed },
            };
          }
        } catch (_) {}
        if (!usedAdmin) {
          console.log(
            "[fare-estimate][car-recovery][fallback] using calculator (Branch A)"
          );
          const isRoundTrip =
            booking.routeType === "two_way" || !!req.body?.options?.roundTrip;
          const fare = await FareCalculator.calculateRecoveryFare({
            vehicleType: booking.vehicleType || "car",
            serviceType: mapToCalcType(booking.serviceCategory),
            distance: isRoundTrip ? distanceKm * 2 : distanceKm,
            duration: durationMinutes,
            startTime: new Date(),
            waitingTime: Number(req.body?.options?.waitingTime || 0),
          });
          const calcTotal = Number(fare.totalWithVat ?? fare.totalFare ?? 0);
          const calcVat = Number(fare.vat?.amount ?? fare.vatAmount ?? 0);
          const calcSubtotal = Number(
            fare.subtotal ?? (calcTotal > 0 ? calcTotal - calcVat : 0)
          );
          const calcPlatform = Number(
            fare.platformFee?.amount ?? fare.platformFee ?? 0
          );
          const platformPct = 15;
          // Recompose subtotal with our waiting/helper/platform policy
          const comp = await ComprehensivePricing.findOne({
            isActive: true,
          }).lean();
          const helperEnabled = !!(
            req.body?.helper === true || req.body?.options?.helper === true
          );
          const helperFeeAed = helperEnabled
            ? Number(comp?.helper?.fee ?? process.env.HELPER_FEE_AED ?? 25)
            : 0;
          const wc = computeWaitingCharges({
            waitingMinutes: Number(req.body?.options?.waitingTime || 0),
            isRoundTrip,
            distanceKm: isRoundTrip ? distanceKm * 2 : distanceKm,
            comp,
          });
          const basePlusDistance = Math.max(0, calcSubtotal - calcPlatform);
          const recomputedPlatform = Math.round(
            (basePlusDistance * platformPct) / 100
          );
          const recomposedSubtotal =
            basePlusDistance +
            recomputedPlatform +
            wc.waitingCharges +
            helperFeeAed;
          const vatPct = Number(process.env.VAT_PERCENT || 0);
          const vatAmount = Math.round((recomposedSubtotal * vatPct) / 100);
          const discount = isRoundTrip
            ? Number(process.env.ROUND_TRIP_DISCOUNT_AED || 10)
            : 0;
          const finalAmount = Math.max(
            0,
            recomposedSubtotal + vatAmount - discount
          );
          estimatedFare = finalAmount;
          fareResult = {
            currency: "AED",
            breakdown: fare.fareBreakdown,
            baseFare: Number(fare.baseFare ?? 0),
            distanceFare: Number(fare.distanceFare ?? 0),
            platformFee: recomputedPlatform,
            nightCharges: Number(fare.nightSurcharge ?? fare.nightCharges ?? 0),
            surgeCharges: undefined,
            waitingCharges: wc.waitingCharges,
            vatAmount,
            subtotal: recomposedSubtotal,
            totalFare: finalAmount,
            policies: {
              cancellation: {
                thresholds: {
                  beforeArrivalAfter25pct: 2,
                  halfWayOrMore: 5,
                  afterArrived: 10,
                },
                notes:
                  "Cancellation fees apply based on driver progress. Only charged once rider crosses 25% of driver distance.",
              },
              refreshmentAlert: {
                triggerDistanceKm: 20,
                triggerDurationMin: 30,
                perMinute: 1,
                per5Min: 5,
                maxMinutes: 30,
              },
            },
            helper: { enabled: helperEnabled, fee: helperFeeAed },
          };
        }
      } else {
        // Use existing comprehensive flow for cab/bike/etc.
        fareResult = await calculateFareByServiceType(
          booking.serviceType,
          booking.vehicleType,
          distanceMeters,
          booking.routeType,
          {
            estimatedDuration: durationMinutes,
            waitingMinutes: Number(req.body?.options?.waitingTime || 0),
          }
        );
        estimatedFare = fareResult.totalFare || fareResult;
      }

      // Fare adjustment settings
      const fareSettings = await getFareAdjustmentSettings(booking.serviceType);
      const adjustmentPercentage = fareSettings.allowedAdjustmentPercentage;
      const minFare = estimatedFare * (1 - adjustmentPercentage / 100);
      const maxFare = estimatedFare * (1 + adjustmentPercentage / 100);

      // Prepare response
      const responseData = {
        estimatedFare: safeNumber(Math.round(estimatedFare * 100) / 100, 0),
        currency: fareResult.currency || "AED",
        adjustmentSettings: {
          allowedPercentage: adjustmentPercentage,
          minFare: safeNumber(Math.round(minFare * 100) / 100, 0),
          maxFare: safeNumber(Math.round(maxFare * 100) / 100, 0),
          canAdjustFare: fareSettings.enableUserFareAdjustment,
        },
        qualifiedDrivers: [],
        driversCount: 0,
        tripDetails: {
          distance: `${distanceKm.toFixed(2)} km`,
          serviceType: booking.serviceType,
          serviceCategory: booking.serviceCategory,
          vehicleType: booking.vehicleType,
          routeType: booking.routeType,
          paymentMethod,
        },
      };

      // Always prepare a friendly breakdown array
      const breakdownLinesA = [];
      const derivedA = extractNumbersFromBreakdown(fareResult.breakdown);
      const bBaseA = safeNumber(fareResult.baseFare, derivedA.baseFare);
      const bDistA = safeNumber(fareResult.distanceFare, derivedA.distanceFare);
      const bConvA = safeNumber(
        fareResult.convenienceFee,
        derivedA.convenienceFee
      );
      const bNightA = safeNumber(
        fareResult.nightCharges,
        safeNumber(fareResult.nightCharge, derivedA.nightCharges)
      );
      const bSurgeA = safeNumber(
        fareResult.surgeCharges,
        derivedA.surgeCharges
      );
      const bPlatA = safeNumber(fareResult.platformFee, derivedA.platformFee);
      const bWaitA = safeNumber(
        fareResult.waitingCharges,
        safeNumber(fareResult.waiting?.waitingCharges, derivedA.waitingCharges)
      );
      const bHelperA = safeNumber(fareResult.helper?.fee, derivedA.helperFee);
      const bVatA = safeNumber(fareResult.vatAmount, derivedA.vatAmount);
      const bSubtotalA = safeNumber(fareResult.subtotal, derivedA.subtotal);
      const bTotalA = safeNumber(
        fareResult.totalFare,
        safeNumber(estimatedFare, derivedA.totalFare)
      );
      if (bBaseA)
        breakdownLinesA.push({ description: "Base Fare", amount: bBaseA });
      if (bDistA)
        breakdownLinesA.push({ description: `Distance`, amount: bDistA });
      if (bConvA)
        breakdownLinesA.push({
          description: "Convenience Fee",
          amount: bConvA,
        });
      if (bNightA)
        breakdownLinesA.push({
          description: "Night Surcharge",
          amount: bNightA,
        });
      if (bSurgeA)
        breakdownLinesA.push({ description: "Surge", amount: bSurgeA });
      if (bPlatA)
        breakdownLinesA.push({
          description: "Platform Fee (15%)",
          amount: bPlatA,
        });
      if (bWaitA)
        breakdownLinesA.push({
          description: "Waiting Charges",
          amount: bWaitA,
        });
      if (bHelperA)
        breakdownLinesA.push({ description: "Helper Fee", amount: bHelperA });
      if (bVatA) breakdownLinesA.push({ description: "VAT", amount: bVatA });
      responseData.fareBreakdown = {
        baseFare: bBaseA,
        distanceFare: bDistA,
        platformFee: bPlatA,
        nightCharges: bNightA,
        surgeCharges: bSurgeA,
        waitingCharges: bWaitA,
        vatAmount: bVatA,
        subtotal: bSubtotalA,
        totalFare: bTotalA,
        breakdown: fareResult.breakdown || breakdownLinesA,
      };

      return res.status(200).json({
        success: true,
        message: "Fare estimation calculated successfully",
        data: responseData,
        token: req.cookies.token,
      });
    } catch (e) {
      console.error("Fare estimation by requestId error:", e);
      return res.status(500).json({
        success: false,
        message: "Error calculating fare estimation by requestId",
        error: e.message,
        token: req.cookies.token,
      });
    }
  }

  // Branch B: Original body-based estimation (no requestId provided)
  // Accept either coordinates as {lat,lng} or GeoJSON [lng,lat]. Compute distance if not provided.
  const extractLatLng = (loc) => {
    if (!loc) return null;
    if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
      return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
    }
    if (
      loc.coordinates &&
      typeof loc.coordinates.lat === "number" &&
      typeof loc.coordinates.lng === "number"
    ) {
      return { lat: loc.coordinates.lat, lng: loc.coordinates.lng };
    }
    if (typeof loc.lat === "number" && typeof loc.lng === "number") {
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
  };

  const pickupLatLng = extractLatLng(pickupLocation);
  const dropoffLatLng = extractLatLng(dropoffLocation);

  if (!serviceType) {
    return res
      .status(400)
      .json({ message: "serviceType is required", token: req.cookies.token });
  }

  let computedDistanceMeters = distanceInMeters;
  if (
    (!computedDistanceMeters || Number(computedDistanceMeters) <= 0) &&
    pickupLatLng &&
    dropoffLatLng
  ) {
    const dKm = calculateDistance(pickupLatLng, dropoffLatLng);
    computedDistanceMeters = Math.round(dKm * 1000);
  }
  if (!computedDistanceMeters) {
    return res.status(400).json({
      message: "distanceInMeters is required if coordinates are not provided",
      token: req.cookies.token,
    });
  }

  // Vehicle type validation for proper driver matching (skip strict check for car recovery)
  if (!vehicleType && serviceType !== "car recovery") {
    return res.status(400).json({
      message:
        "Vehicle type is required for fare estimation and driver matching",
      token: req.cookies.token,
    });
  }

  try {
    let fareResult;
    let estimatedFare;

    // Calculate fare based on service type
    if (serviceType === "shifting & movers") {
      const fareData = await calculateShiftingMoversFare({
        vehicleType,
        distance: computedDistanceMeters / 1000,
        routeType,
        serviceDetails,
        furnitureDetails: req.body.furnitureDetails || {},
        itemDetails,
        serviceOptions,
      });
      estimatedFare = fareData?.totalCalculatedFare || fareData?.totalFare || 0;
      fareResult = fareData;
    } else if (serviceType === "car recovery") {
      // Prefer Admin PricingConfig (carRecoveryConfig); fallback to calculator
      const mapToCalcType = (cat) => {
        const v = String(cat || "").toLowerCase();
        if (v.includes("towing")) return "towing";
        if (v.includes("winching")) return "winching";
        if (v.includes("roadside")) return "roadside_assistance";
        if (v.includes("key")) return "key_unlock";
        return "specialized_recovery";
      };
      let usedAdmin = false;
      try {
        const cfg = await PricingConfig.findOne({
          serviceType: "car_recovery",
          isActive: true,
        }).lean();
        const admin = cfg?.carRecoveryConfig;
        const comp = await ComprehensivePricing.findOne({
          isActive: true,
        }).lean();
        if (admin?.serviceCharges) {
          usedAdmin = true;
          console.log(
            "[fare-estimate][car-recovery][admin] using admin pricing (Branch B)"
          );
          // Prefer explicit subService if provided, else map from serviceCategory
          const preferredSub = String(req.body?.subService || "")
            .trim()
            .toLowerCase();
          const broad = mapToCalcType(serviceCategory);
          let sc =
            admin.serviceCharges[preferredSub] ||
            admin.serviceCharges[broad] ||
            admin.serviceCharges.default ||
            {};
          // Effective distance for route type (2x for round-trip)
          const isRoundTrip =
            routeType === "two_way" ||
            routeType === "round_trip" ||
            !!req.body?.options?.roundTrip;
          const dEff = Math.max(
            0,
            isRoundTrip
              ? (computedDistanceMeters / 1000) * 2
              : computedDistanceMeters / 1000
          );
          const cityRule = comp?.cityPricing?.rules?.find?.(
            (r) => Number(dEff) >= Number(r?.minKm || 0)
          );
          if (cityRule?.perKm) sc = { ...sc, perKm: Number(cityRule.perKm) };
          const baseKm = Number(sc.baseKm ?? 6);
          const baseFare = Number(sc.baseFare ?? 50);
          const perKm = Number(sc.perKm ?? 7.5);
          const platformPct = Number(admin.platformCharges?.percentage ?? 15);
          const vatPct = Number(process.env.VAT_PERCENT || 0);
          const d = dEff;
          const extraKm = Math.max(0, d - baseKm);
          const distanceFare = Math.round(extraKm * perKm);
          // Night/surge
          const startTime = req.body.startTime
            ? new Date(req.body.startTime)
            : new Date();
          const hour = startTime.getHours();
          let nightCharge = 0;
          let nightMultiplier = 1;
          const nightCfg = comp?.nightCharges;
          const inNight = hour >= 22 || hour < 6;
          if (inNight && nightCfg) {
            if (String(nightCfg.mode || "").toLowerCase() === "multiplier")
              nightMultiplier = Number(nightCfg.value || 1.25);
            else nightCharge = Number(nightCfg.value || 10);
          }
          let surgeMultiplier = 1;
          const surge = comp?.surgePricing;
          if (surge?.mode && String(surge.mode).toLowerCase() !== "none") {
            surgeMultiplier =
              surge.mode === "1.5x" ? 1.5 : surge.mode === "2.0x" ? 2.0 : 1;
          }
          let subtotalFare = Math.round(baseFare + distanceFare);
          subtotalFare = Math.round(
            (subtotalFare + nightCharge) * nightMultiplier * surgeMultiplier
          );
          // Platform and waiting
          const platformFee = Math.round((subtotalFare * platformPct) / 100);
          const platformCustomer = Math.round(platformFee / 2);
          const platformDriver = platformFee - platformCustomer;
          const wc = computeWaitingCharges({
            waitingMinutes: Number(
              req.body?.options?.waitingTime || req.body.waitingMinutes || 0
            ),
            isRoundTrip,
            distanceKm: isRoundTrip
              ? (computedDistanceMeters / 1000) * 2
              : computedDistanceMeters / 1000,
            comp,
          });
          const helperEnabled = !!(
            req.body?.helper === true || req.body?.options?.helper === true
          );
          const helperFeeAed = helperEnabled
            ? Number(comp?.helper?.fee ?? process.env.HELPER_FEE_AED ?? 25)
            : 0;
          const subtotalWithPlatform =
            subtotalFare + platformFee + wc.waitingCharges + helperFeeAed;
          const vatAmount = Math.round((subtotalWithPlatform * vatPct) / 100);
          // Round-trip discount
          const roundTrip = isRoundTrip;
          const rtDiscount = roundTrip
            ? Number(process.env.ROUND_TRIP_DISCOUNT_AED || 10)
            : 0;
          const totalFare = Math.max(
            0,
            subtotalWithPlatform + vatAmount - rtDiscount
          );
          estimatedFare = totalFare;
          fareResult = {
            currency: "AED",
            baseFare,
            distanceFare,
            platformFee,
            platformFeeSplit: {
              customer: platformCustomer,
              driver: platformDriver,
            },
            nightCharge: nightCharge || undefined,
            nightCharges: nightCharge || undefined,
            nightMultiplier:
              nightMultiplier !== 1 ? nightMultiplier : undefined,
            surgeMultiplier:
              surgeMultiplier !== 1 ? surgeMultiplier : undefined,
            cityOverridePerKm: cityRule?.perKm || undefined,
            waiting: wc,
            helper: { enabled: helperEnabled, fee: helperFeeAed },
            roundTripDiscount: rtDiscount || undefined,
            vatAmount,
            subtotal: subtotalWithPlatform,
            totalFare,
            breakdown: {
              baseKm,
              perKm,
              distanceInKm: d,
              usedSubService: preferredSub || broad,
            },
            policies: {
              cancellation: {
                thresholds: {
                  beforeArrivalAfter25pct: 2,
                  halfWayOrMore: 5,
                  afterArrived: 10,
                },
                notes:
                  "Cancellation fees apply based on driver progress. Only charged once rider crosses 25% of driver distance.",
              },
              refreshmentAlert: {
                triggerDistanceKm: 20,
                triggerDurationMin: 30,
                perMinute: 1,
                per5Min: 5,
                maxMinutes: 30,
              },
            },
          };
        }
      } catch (_) {}
      if (!usedAdmin) {
        console.log(
          "[fare-estimate][car-recovery][fallback] using calculator (Branch B)"
        );
        const isRoundTrip =
          routeType === "two_way" || !!req.body?.options?.roundTrip;
        const fare = await FareCalculator.calculateRecoveryFare({
          vehicleType: vehicleType,
          serviceType: mapToCalcType(serviceCategory),
          distance: isRoundTrip
            ? (computedDistanceMeters / 1000) * 2
            : computedDistanceMeters / 1000,
          duration: Math.ceil((computedDistanceMeters / 1000 / 30) * 60),
          startTime: req.body.startTime
            ? new Date(req.body.startTime)
            : new Date(),
          waitingTime: Number(req.body.waitingMinutes || 0),
        });
        const calcTotal = Number(fare.totalWithVat ?? fare.totalFare ?? 0);
        const calcVat = Number(fare.vat?.amount ?? fare.vatAmount ?? 0);
        const calcSubtotal = Number(
          fare.subtotal ?? (calcTotal > 0 ? calcTotal - calcVat : 0)
        );
        const calcPlatform = Number(
          fare.platformFee?.amount ?? fare.platformFee ?? 0
        );
        const platformPct = 15;
        // Recompose subtotal with our waiting/helper/platform policy
        const comp = await ComprehensivePricing.findOne({
          isActive: true,
        }).lean();
        const helperEnabled = !!(
          req.body?.helper === true || req.body?.options?.helper === true
        );
        const helperFeeAed = helperEnabled
          ? Number(comp?.helper?.fee ?? process.env.HELPER_FEE_AED ?? 25)
          : 0;
        const wc = computeWaitingCharges({
          waitingMinutes: Number(
            req.body?.options?.waitingTime || req.body.waitingMinutes || 0
          ),
          isRoundTrip,
          distanceKm: isRoundTrip
            ? (computedDistanceMeters / 1000) * 2
            : computedDistanceMeters / 1000,
          comp,
        });
        const basePlusDistance = Math.max(0, calcSubtotal - calcPlatform);
        const recomputedPlatform = Math.round(
          (basePlusDistance * platformPct) / 100
        );
        const recomposedSubtotal =
          basePlusDistance +
          recomputedPlatform +
          wc.waitingCharges +
          helperFeeAed;
        const vatPct = Number(process.env.VAT_PERCENT || 0);
        const vatAmount = Math.round((recomposedSubtotal * vatPct) / 100);
        const discount = isRoundTrip
          ? Number(process.env.ROUND_TRIP_DISCOUNT_AED || 10)
          : 0;
        const finalAmount = Math.max(
          0,
          recomposedSubtotal + vatAmount - discount
        );
        estimatedFare = finalAmount;
        fareResult = {
          currency: "AED",
          breakdown: fare.fareBreakdown,
          waiting: wc,
          helper: { enabled: helperEnabled, fee: helperFeeAed },
          vatAmount,
          subtotal: recomposedSubtotal,
          totalFare: finalAmount,
          policies: {
            cancellation: {
              thresholds: {
                beforeArrivalAfter25pct: 2,
                halfWayOrMore: 5,
                afterArrived: 10,
              },
            },
            refreshmentAlert: {
              triggerDistanceKm: 20,
              triggerDurationMin: 30,
              perMinute: 1,
              per5Min: 5,
              maxMinutes: 30,
            },
          },
        };
      }
    } else {
      // Use comprehensive fare calculation for car cab, bike, and car recovery
      fareResult = await calculateFareByServiceType(
        serviceType,
        vehicleType,
        computedDistanceMeters,
        routeType,
        {
          demandRatio: req.body.demandRatio || 1,
          waitingMinutes: req.body.waitingMinutes || 0,
          estimatedDuration:
            req.body.estimatedDuration ||
            Math.ceil((computedDistanceMeters / 1000 / 40) * 60), // Estimate based on 40km/h average speed
        }
      );

      // Handle both old and new fare calculation formats
      estimatedFare = fareResult.totalFare || fareResult;
    }

    // Get fare adjustment settings
    const fareSettings = await getFareAdjustmentSettings(serviceType);

    // Calculate adjustment range
    const adjustmentPercentage = fareSettings.allowedAdjustmentPercentage;
    const minFare = estimatedFare * (1 - adjustmentPercentage / 100);
    const maxFare = estimatedFare * (1 + adjustmentPercentage / 100);

    // Find qualified drivers and vehicles for the estimation
    const qualifiedDrivers = await findQualifiedDriversForEstimation(
      pickupLocation,
      serviceType,
      vehicleType,
      req.body.driverPreference
    );

    // Prepare response data
    const responseData = {
      estimatedFare: safeNumber(Math.round(estimatedFare * 100) / 100, 0),
      currency: fareResult.currency || "AED",
      adjustmentSettings: {
        allowedPercentage: adjustmentPercentage,
        minFare: safeNumber(Math.round(minFare * 100) / 100, 0),
        maxFare: safeNumber(Math.round(maxFare * 100) / 100, 0),
        canAdjustFare: fareSettings.enableUserFareAdjustment,
      },
      qualifiedDrivers: qualifiedDrivers,
      driversCount: qualifiedDrivers.length,
      tripDetails: {
        distance: `${(computedDistanceMeters / 1000).toFixed(2)} km`,
        serviceType,
        serviceCategory,
        vehicleType,
        routeType,
        paymentMethod,
        driverPreference: req.body.driverPreference,
      },
    };

    // Always build a friendly breakdown
    const breakdownLinesB = [];
    const derivedB = extractNumbersFromBreakdown(fareResult.breakdown);
    const bBase = safeNumber(fareResult.baseFare, derivedB.baseFare);
    const bDist = safeNumber(fareResult.distanceFare, derivedB.distanceFare);
    const bConv = safeNumber(
      fareResult.convenienceFee,
      derivedB.convenienceFee
    );
    const bNight = safeNumber(
      fareResult.nightCharges,
      safeNumber(fareResult.nightCharge, derivedB.nightCharges)
    );
    const bSurge = safeNumber(fareResult.surgeCharges, derivedB.surgeCharges);
    const bPlat = safeNumber(fareResult.platformFee, derivedB.platformFee);
    const bWait = safeNumber(
      fareResult.waitingCharges,
      safeNumber(fareResult.waiting?.waitingCharges, derivedB.waitingCharges)
    );
    const bHelper = safeNumber(fareResult.helper?.fee, derivedB.helperFee);
    const bVat = safeNumber(fareResult.vatAmount, derivedB.vatAmount);
    const bSubtotal = safeNumber(fareResult.subtotal, derivedB.subtotal);
    const bTotal = safeNumber(
      fareResult.totalFare,
      safeNumber(estimatedFare, derivedB.totalFare)
    );
    if (bBase)
      breakdownLinesB.push({ description: "Base Fare", amount: bBase });
    if (bDist) breakdownLinesB.push({ description: "Distance", amount: bDist });
    if (bConv)
      breakdownLinesB.push({ description: "Convenience Fee", amount: bConv });
    if (bNight)
      breakdownLinesB.push({ description: "Night Surcharge", amount: bNight });
    if (bSurge) breakdownLinesB.push({ description: "Surge", amount: bSurge });
    if (bPlat)
      breakdownLinesB.push({
        description: "Platform Fee (15%)",
        amount: bPlat,
      });
    if (bWait)
      breakdownLinesB.push({ description: "Waiting Charges", amount: bWait });
    if (bHelper)
      breakdownLinesB.push({ description: "Helper Fee", amount: bHelper });
    if (bVat) breakdownLinesB.push({ description: "VAT", amount: bVat });
    responseData.fareBreakdown = {
      baseFare: bBase,
      distanceFare: bDist,
      platformFee: bPlat,
      nightCharges: bNight,
      surgeCharges: bSurge,
      waitingCharges: bWait,
      vatAmount: bVat,
      subtotal: bSubtotal,
      totalFare: bTotal,
      breakdown: fareResult.breakdown || breakdownLinesB,
    };

    res.status(200).json({
      success: true,
      message: "Fare estimation calculated successfully",
      data: responseData,
      token: req.cookies.token,
    });
  } catch (error) {
    console.error("Fare estimation error:", error);
    res.status(500).json({
      success: false,
      message: "Error calculating fare estimation",
      error: error.message,
      token: req.cookies.token,
    });
  }
});

// Adjust fare estimation
const adjustFareEstimation = asyncHandler(async (req, res) => {
  const { originalFare, adjustedFare, serviceType } = req.body;

  const userId = req.user._id;

  if (!originalFare || !adjustedFare || !serviceType) {
    return res.status(400).json({
      message: "Original fare, adjusted fare, and service type are required",
      token: req.cookies.token,
    });
  }

  try {
    // Get fare adjustment settings
    const fareSettings = await getFareAdjustmentSettings(serviceType);

    if (!fareSettings.enableUserFareAdjustment) {
      return res.status(403).json({
        message: "Fare adjustment is currently disabled by admin",
        token: req.cookies.token,
      });
    }

    // Validate adjustment is within allowed range
    const adjustmentPercentage = fareSettings.allowedAdjustmentPercentage;
    const minAllowedFare = originalFare * (1 - adjustmentPercentage / 100);
    const maxAllowedFare = originalFare * (1 + adjustmentPercentage / 100);

    if (adjustedFare < minAllowedFare || adjustedFare > maxAllowedFare) {
      return res.status(400).json({
        message: `Adjusted fare must be between ${safeNumber(
          Math.round(minAllowedFare * 100) / 100,
          0
        )} and ${safeNumber(
          Math.round(maxAllowedFare * 100) / 100,
          0
        )} AED (±${adjustmentPercentage}% of original fare)`,
        token: req.cookies.token,
      });
    }

    res.status(200).json({
      success: true,
      message: "Fare adjustment validated successfully",
      data: {
        originalFare: safeNumber(Math.round(originalFare * 100) / 100, 0),
        adjustedFare: safeNumber(Math.round(adjustedFare * 100) / 100, 0),
        adjustmentAmount: safeNumber(
          Math.round((adjustedFare - originalFare) * 100) / 100,
          0
        ),
        adjustmentPercentage: safeNumber(
          Math.round(
            ((adjustedFare - originalFare) / originalFare) * 100 * 100
          ) / 100,
          0
        ),
        currency: "AED",
      },
      token: req.cookies.token,
    });
  } catch (error) {
    console.error("Fare adjustment error:", error);
    res.status(500).json({
      success: false,
      message: "Error validating fare adjustment",
      error: error.message,
      token: req.cookies.token,
    });
  }
});

export {
  getFareEstimation,
  adjustFareEstimation,
  findQualifiedDriversForEstimation,
};
