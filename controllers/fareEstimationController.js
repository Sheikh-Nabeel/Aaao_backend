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
      kycLevel: { $gte: 2 },
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

    // If no vehicles found, for car recovery allow fallback to drivers list
    if (vehicles.length === 0) {
      const st = String(serviceType || "").toLowerCase();
      if (st !== "car recovery") {
        console.log(
          "No vehicles found matching service and vehicle type criteria"
        );
        return [];
      }
    }

    // Get driver IDs that have matching vehicles
    const qualifiedDriverIds = vehicles.length
      ? vehicles.map((vehicle) => vehicle.userId.toString())
      : driverIds.map((id) => id.toString()); // fallback for car recovery when vehicles empty

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

    // Normalize pickup coordinates
    const pickLat = Array.isArray(pickupLocation?.coordinates)
      ? pickupLocation.coordinates[1]
      : pickupLocation?.coordinates?.lat ?? pickupLocation?.lat;
    const pickLng = Array.isArray(pickupLocation?.coordinates)
      ? pickupLocation.coordinates[0]
      : pickupLocation?.coordinates?.lng ?? pickupLocation?.lng;

    // Calculate distances and filter by radius
    const driversWithDistance = [];
    const maxRadius = driverPreference === "pink_captain" ? 50 : 10; // 50km for Pink Captain, 10km for estimation

    for (const driver of qualifiedDrivers) {
      if (
        driver.currentLocation &&
        driver.currentLocation.coordinates &&
        typeof pickLat === "number" &&
        typeof pickLng === "number"
      ) {
        const distance = calculateDistance(
          { lat: pickLat, lng: pickLng },
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

// Helpers for recovery sub-service/category normalization
const normalizeRecoverySubService = (s) => {
  const raw = String(s || "")
    .trim()
    .toLowerCase();
  const base = raw
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "_");
  const table = {
    // Towing
    flatbed_towing: "flatbed_towing",
    wheel_lift_towing: "wheel_lift_towing",
    // Winching
    on_road_winching: "on_road_winching",
    off_road_winching: "off_road_winching",
    // Roadside
    battery_jump_start: "battery_jump_start",
    fuel_delivery: "fuel_delivery",
    key_unlock: "key_unlock",
    // Specialized/Heavy
    luxury_and_exotic_car_recovery: "luxury_exotic",
    luxury_exotic: "luxury_exotic",
    accident_and_collision_recovery: "accident_collision",
    accident_collision: "accident_collision",
    heavy_duty_vehicle_recovery: "heavy_duty",
    heavy_duty: "heavy_duty",
    basement_pull_out: "basement_pull_out",
  };
  return table[base] || base;
};

const normalizeRecoveryCategoryBucket = (c) => {
  if (!c) return null;
  const v = String(c || "")
    .toLowerCase()
    .trim();
  // Exact flow labels
  if (v === "towing services" || v === "towing") return "towing";
  if (v === "winching services" || v === "winching") return "winching";
  if (
    v === "roadside assistance" ||
    v === "roadside_assistance" ||
    v === "roadside"
  )
    return "roadside_assistance";
  if (
    v === "specialized/heavy recovery" ||
    v.includes("specialized") ||
    v.includes("heavy")
  )
    return "specialized_recovery";
  // Fallbacks
  if (v.includes("towing")) return "towing";
  if (v.includes("winching")) return "winching";
  if (v.includes("roadside")) return "roadside_assistance";
  if (v.includes("key")) return "key_unlock";
  return "specialized_recovery";
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
      serviceType === "car recovery" ||
      serviceType === "shifting & movers")
  ) {
    // Normalize serviceType to calculator keys
    const normalizedServiceType = (() => {
      const s = String(serviceType || "")
        .toLowerCase()
        .replace(/\s+/g, "_");
      if (s === "shifting_&_movers") return "shifting_movers";
      return s;
    })();

    const bookingData = {
      serviceType: normalizedServiceType, // e.g., car_cab, bike, car_recovery, shifting_movers
      vehicleType,
      distance: distanceInKm,
      routeType,
      demandRatio: additionalData.demandRatio || 1,
      waitingMinutes: additionalData.waitingMinutes || 0,
      estimatedDuration: additionalData.estimatedDuration || 0,
      serviceDetails: additionalData.serviceDetails || {},
      itemDetails: additionalData.itemDetails || [],
      serviceOptions: additionalData.serviceOptions || {},
    };

    const fareResult = await calculateComprehensiveFare(bookingData);
    return fareResult;
  }

  // Optional legacy fallbacks (remove once comprehensive covers everything)
  switch (serviceType) {
    case "shifting & movers":
      return calculateShiftingMoversFare({
        vehicleType,
        distance: distanceInKm,
        routeType,
        serviceDetails: {},
        itemDetails: [],
        serviceOptions: {},
      });

    default:
      // Explicitly avoid hardcoded numbers. If comprehensive not active and no legacy supported, fail loudly.
      throw new Error(
        `Pricing not configured for serviceType '${serviceType}'. Please activate ComprehensivePricing.`
      );
  }
};

// Compute demand/supply ratio around pickup to drive auto-surge
const computeDemandRatio = async ({
  pickupLocation,
  serviceType,
  vehicleType,
}) => {
  try {
    const radiusKm = 10; // search radius
    const timeWindowMin = 30; // recent demand window
    const now = new Date();
    const windowStart = new Date(now.getTime() - timeWindowMin * 60 * 1000);

    // Supply: online drivers with matching service (and vehicleType if provided)
    const driverQuery = {
      role: "driver",
      kycLevel: { $gte: 2 },
      kycStatus: "approved",
      isActive: true,
      driverStatus: "online",
      "currentLocation.coordinates": { $exists: true },
    };
    if (vehicleType && vehicleType !== "any") {
      driverQuery["vehicleDetails.vehicleType"] = vehicleType;
    }
    const drivers = await User.find(driverQuery).select(
      "currentLocation.coordinates vehicleDetails"
    );
    const supply = drivers.filter((d) => {
      const c = d.currentLocation?.coordinates;
      if (!Array.isArray(c) || c.length < 2) return false;
      const dist = calculateDistance(
        {
          lat: pickupLocation.coordinates?.[1],
          lng: pickupLocation.coordinates?.[0],
        },
        { lat: c[1], lng: c[0] }
      );
      return dist <= radiusKm;
    }).length;

    // Demand: active bookings near pickup in window
    const activeStatuses = ["pending", "searching", "finding_driver"];
    const recentBookings = await Booking.find({
      serviceType,
      status: { $in: activeStatuses },
      createdAt: { $gte: windowStart },
    }).select("pickupLocation.coordinates");
    const demand = recentBookings.filter((b) => {
      const c = b.pickupLocation?.coordinates;
      if (!Array.isArray(c) || c.length < 2) return false;
      const dist = calculateDistance(
        {
          lat: pickupLocation.coordinates?.[1],
          lng: pickupLocation.coordinates?.[0],
        },
        { lat: c[1], lng: c[0] }
      );
      return dist <= radiusKm;
    }).length;

    const ratio = supply > 0 ? demand / supply : demand > 0 ? Infinity : 1;
    return { demand, supply, ratio };
  } catch (e) {
    return { demand: 0, supply: 0, ratio: 1 };
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

  // Normalize underscore variants to canonical labels expected by calculators
  const normSt = String(serviceType || serviceTypeRaw || "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (normSt === "car_recovery") {
    serviceType = "car recovery";
  } else if (normSt === "car_cab") {
    serviceType = "car cab";
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
        const v = String(cat || "")
          .toLowerCase()
          .trim();
        // Exact flow labels
        if (v === "towing services" || v === "towing") return "towing";
        if (v === "winching services" || v === "winching") return "winching";
        if (
          v === "roadside assistance" ||
          v === "roadside_assistance" ||
          v === "roadside"
        )
          return "roadside_assistance";
        if (
          v === "specialized/heavy recovery" ||
          v.includes("specialized") ||
          v.includes("heavy")
        )
          return "specialized_recovery";
        // Fallbacks
        if (v.includes("towing")) return "towing";
        if (v.includes("winching")) return "winching";
        if (v.includes("roadside")) return "roadside_assistance";
        if (v.includes("key")) return "key_unlock";
        return "specialized_recovery";
      };
      let fareResult;
      let estimatedFare;
      let dynamic = {
        demand: 0,
        supply: 0,
        surgePercent: 0,
        surgeType: "none",
      };

      if (booking.serviceType === "car recovery") {
        // Validate enums strictly when service/sub-service provided in booking
        try {
          validateRecoveryService(
            booking.serviceCategory /* may carry type like 'towing' */,
            req.body.subService
          );
        } catch (e) {
          return res
            .status(e.code || 400)
            .json({ success: false, error: e.message });
        }

        // Map recovery sub-service/category to comprehensive vehicleType
        const mapRecoveryVehicleType = (subService, category) => {
          const raw = String(subService || category || "").toLowerCase();
          if (raw.includes("flatbed")) return "flatbed";
          if (raw.includes("wheel")) return "wheelLift";
          if (raw.includes("jump")) return "jumpstart";
          if (raw.includes("fuel")) return "fuelDelivery";
          if (raw.includes("tire")) return "tirePunctureRepair";
          if (raw.includes("battery")) return "batteryReplacement";
          if (raw.includes("key") || raw.includes("unlock"))
            return "keyUnlocker";
          return null;
        };

        const recoveryVehicleType =
          mapRecoveryVehicleType(
            req.body.subService,
            booking.serviceCategory
          ) ||
          booking.vehicleType ||
          null;

        fareResult = await calculateComprehensiveFare({
          serviceType: "car recovery",
          vehicleType: recoveryVehicleType,
          distance: distanceKm,
          routeType,
          estimatedDuration: durationMinutes,
          waitingMinutes: Number(
            req.body?.options?.waitingTime || req.body.waitingMinutes || 0
          ),
        });
        estimatedFare = Number(fareResult?.totalFare || 0);

        // Fixed pricing override per sub-service (if configured)
        try {
          const fixed = await resolveFixedSubServicePrice(req.body.subService);
          if (fixed !== null) {
            estimatedFare = fixed;
          }
        } catch {}

        // Compute demand/supply around pickup and adjust fare (car recovery only)
        try {
          const ds = await (async () => {
            // Count online drivers and recent nearby passengers
            const radiusKm = 10;
            const timeWindowMin = 30;
            const now = new Date();
            const windowStart = new Date(
              now.getTime() - timeWindowMin * 60 * 1000
            );
            // Supply: drivers online near pickup
            const driverQuery = {
              role: "driver",
              kycLevel: { $gte: 2 },
              kycStatus: "approved",
              isActive: true,
              driverStatus: "online",
              "currentLocation.coordinates": { $exists: true },
            };
            const drivers = await User.find(driverQuery).select(
              "currentLocation.coordinates"
            );
            const supply = drivers.filter((d) => {
              const c = d.currentLocation?.coordinates;
              if (!Array.isArray(c) || c.length < 2) return false;
              const dist = calculateDistance(
                { lat: pickup.lat, lng: pickup.lng },
                { lat: c[1], lng: c[0] }
              );
              return dist <= radiusKm;
            }).length;
            // Demand: recent car recovery bookings near pickup
            const recent = await Booking.find({
              serviceType: "car recovery",
              status: { $in: ["pending", "searching", "finding_driver"] },
              createdAt: { $gte: windowStart },
            }).select("pickupLocation.coordinates");
            const demand = recent.filter((b) => {
              const c = b.pickupLocation?.coordinates;
              if (!Array.isArray(c) || c.length < 2) return false;
              const dist = calculateDistance(
                { lat: pickup.lat, lng: pickup.lng },
                { lat: c[1], lng: c[0] }
              );
              return dist <= radiusKm;
            }).length;
            return { demand, supply };
          })();
          dynamic.demand = ds.demand;
          dynamic.supply = ds.supply;
          // Continuous surge: factor = clamp(1 + 0.15*(ratio-1), 0.85, 1.15), where ratio = demand/supply
          const ratioA = (ds.demand || 0) / Math.max(1, ds.supply || 0);
          const rawFactorA = 1 + 0.15 * (ratioA - 1); // linear around 1.0
          const factorA = Math.max(0.85, Math.min(1.15, rawFactorA));
          dynamic.surgePercent = Math.round((factorA - 1) * 100);
          dynamic.surgeType =
            dynamic.surgePercent > 0
              ? "increase"
              : dynamic.surgePercent < 0
              ? "decrease"
              : "none";
          if (dynamic.surgePercent !== 0) {
            const mult = 1 + dynamic.surgePercent / 100;
            estimatedFare = Math.max(
              0,
              Math.round(estimatedFare * mult * 100) / 100
            );
          }
        } catch (e) {
          // non-fatal
        }
      } else {
        // Use existing comprehensive flow for cab/bike/etc.
        try {
          validateCabBike(booking.serviceType, booking.vehicleType);
        } catch (e) {
          return res
            .status(e.code || 400)
            .json({ success: false, error: e.message });
        }

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

        // Optional fixed pricing override per vehicleType for car cab/bike
        try {
          const fixed = await resolveFixedVehiclePrice(
            booking.serviceType,
            booking.vehicleType
          );
          if (fixed !== null) {
            estimatedFare = fixed;
          }
        } catch {}
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
        onlineDriversCount: dynamic.supply,
        nearbyPassengersCount: dynamic.demand,
        dynamicAdjustment: {
          surgePercent: dynamic.surgePercent,
          type: dynamic.surgeType,
        },
        validatedVehicleType: booking.vehicleType || null,
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
    let dynamic = { demand: 0, supply: 0, surgePercent: 0, surgeType: "none" };

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
      // Strict enum validation for request body
      try {
        validateRecoveryService(req.body.serviceCategory, req.body.subService);
      } catch (e) {
        return res
          .status(e.code || 400)
          .json({ success: false, error: e.message });
      }

      fareResult = await computeAdminCarRecoveryFare({
        distanceKm: computedDistanceMeters / 1000,
        routeType,
        startTime: req.body.startTime,
        pickupLocation,
        vehicleType,
        serviceCategory,
        subService: req.body.subService,
        helper: req.body.helper || req.body.options?.helper,
        waitingMinutes:
          req.body.options?.waitingTime || req.body.waitingMinutes || 0,
      });
      estimatedFare = fareResult.totalFare || 0;

      // Fixed pricing override per sub-service (if configured)
      try {
        const fixed = await resolveFixedSubServicePrice(req.body.subService);
        if (fixed !== null) {
          estimatedFare = fixed;
        }
      } catch {}

      // Compute demand/supply around pickup and adjust fare (car recovery only)
      try {
        const pick = (() => {
          // Normalize to { coordinates: [lng, lat] }
          if (Array.isArray(pickupLocation?.coordinates))
            return { coordinates: pickupLocation.coordinates };
          const plat = pickupLocation?.coordinates?.lat ?? pickupLocation?.lat;
          const plng = pickupLocation?.coordinates?.lng ?? pickupLocation?.lng;
          if (typeof plat === "number" && typeof plng === "number")
            return { coordinates: [plng, plat] };
          return null;
        })();
        if (
          pick &&
          Array.isArray(pick.coordinates) &&
          pick.coordinates.length >= 2
        ) {
          const lat = pick.coordinates[1];
          const lng = pick.coordinates[0];
          const radiusKm = 10;
          const timeWindowMin = 30;
          const now = new Date();
          const windowStart = new Date(
            now.getTime() - timeWindowMin * 60 * 1000
          );
          // Supply: drivers online near pickup
          const driverQuery = {
            role: "driver",
            kycLevel: { $gte: 2 },
            kycStatus: "approved",
            isActive: true,
            driverStatus: "online",
            "currentLocation.coordinates": { $exists: true },
          };
          const drivers = await User.find(driverQuery).select(
            "currentLocation.coordinates"
          );
          const supply = drivers.filter((d) => {
            const c = d.currentLocation?.coordinates;
            if (!Array.isArray(c) || c.length < 2) return false;
            const dist = calculateDistance(
              { lat, lng },
              { lat: c[1], lng: c[0] }
            );
            return dist <= radiusKm;
          }).length;
          // Demand: recent car recovery bookings near pickup
          const recent = await Booking.find({
            serviceType: "car recovery",
            status: { $in: ["pending", "searching", "finding_driver"] },
            createdAt: { $gte: windowStart },
          }).select("pickupLocation.coordinates");
          const demand = recent.filter((b) => {
            const c = b.pickupLocation?.coordinates;
            if (!Array.isArray(c) || c.length < 2) return false;
            const dist = calculateDistance(
              { lat, lng },
              { lat: c[1], lng: c[0] }
            );
            return dist <= radiusKm;
          }).length;
          dynamic.demand = demand;
          dynamic.supply = supply;
          // Continuous surge: factor = clamp(1 + 0.15*(ratio-1), 0.85, 1.15), where ratio = demand/supply
          const ratioB = (demand || 0) / Math.max(1, supply || 0);
          const rawFactorB = 1 + 0.15 * (ratioB - 1);
          const factorB = Math.max(0.85, Math.min(1.15, rawFactorB));
          dynamic.surgePercent = Math.round((factorB - 1) * 100);
          dynamic.surgeType =
            dynamic.surgePercent > 0
              ? "increase"
              : dynamic.surgePercent < 0
              ? "decrease"
              : "none";
          if (dynamic.surgePercent !== 0) {
            const mult = 1 + dynamic.surgePercent / 100;
            estimatedFare = Math.max(
              0,
              Math.round(estimatedFare * mult * 100) / 100
            );
          }
        }
      } catch (e) {
        // non-fatal
      }
    } else {
      // Use comprehensive fare calculation for car cab and bike only
      try {
        validateCabBike(serviceType, vehicleType);
      } catch (e) {
        return res
          .status(e.code || 400)
          .json({ success: false, error: e.message });
      }

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
            Math.ceil((computedDistanceMeters / 1000 / 40) * 60),
        }
      );

      // Handle both old and new fare calculation formats
      estimatedFare = fareResult.totalFare || fareResult;

      // Optional fixed pricing override per vehicleType for car cab/bike
      try {
        const fixed = await resolveFixedVehiclePrice(serviceType, vehicleType);
        if (fixed !== null) {
          estimatedFare = fixed;
        }
      } catch {}
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
      onlineDriversCount: dynamic.supply,
      nearbyPassengersCount: dynamic.demand,
      dynamicAdjustment: {
        surgePercent: dynamic.surgePercent,
        type: dynamic.surgeType,
      },
      tripDetails: {
        distance: `${(computedDistanceMeters / 1000).toFixed(2)} km`,
        serviceType,
        serviceCategory,
        vehicleType,
        routeType,
        paymentMethod,
        driverPreference: req.body.driverPreference,
      },
      validatedVehicleType: vehicleType || null,
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

// Clean Admin-only calculator for Car Recovery (winching, towing, roadside, etc.)
async function computeAdminCarRecoveryFare({
  distanceKm,
  routeType,
  startTime,
  pickupLocation,
  vehicleType,
  serviceCategory,
  subService,
  helper,
  waitingMinutes,
}) {
  // Hardcoded Admin Defaults (mirror pricingModel.js schema defaults)
  const admin = {
    serviceCharges: {
      default: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      towing: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      winching: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      roadside_assistance: { baseKm: 0, baseFare: 45, perKm: 6 },
      key_unlock: { baseKm: 0, baseFare: 80, perKm: 6 },
      specialized_recovery: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      flatbed_towing: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      wheel_lift_towing: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      on_road_winching: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      off_road_winching: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      battery_jump_start: { baseKm: 0, baseFare: 50, perKm: 6 },
      fuel_delivery: { baseKm: 0, baseFare: 45, perKm: 6 },
      luxury_exotic: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      accident_collision: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      heavy_duty: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      basement_pull_out: { baseKm: 6, baseFare: 50, perKm: 7.5 },
    },
    serviceChargesByCategory: {
      towing: {
        default: {
          baseKm: 6,
          baseFare: 50,
          perKm: 7.5,
          convenienceFee: 0,
          minArrivalFee: 0,
        },
        subServices: {
          flatbed_towing: {
            baseKm: 6,
            baseFare: 50,
            perKm: 7.5,
            convenienceFee: 0,
            minArrivalFee: 0,
          },
          wheel_lift_towing: {
            baseKm: 6,
            baseFare: 50,
            perKm: 7.5,
            convenienceFee: 0,
            minArrivalFee: 0,
          },
        },
      },
      winching: {
        default: {
          baseKm: 6,
          baseFare: 50,
          perKm: 7.5,
          convenienceFee: 0,
          minArrivalFee: 5,
        },
        subServices: {
          on_road_winching: {
            baseKm: 6,
            baseFare: 50,
            perKm: 7.5,
            convenienceFee: 0,
            minArrivalFee: 5,
          },
          off_road_winching: {
            baseKm: 6,
            baseFare: 50,
            perKm: 7.5,
            convenienceFee: 0,
            minArrivalFee: 5,
          },
        },
      },
      roadside_assistance: {
        default: {
          baseKm: 0,
          baseFare: 45,
          perKm: 6,
          convenienceFee: 0,
          minArrivalFee: 5,
        },
        subServices: {
          battery_jump_start: {
            baseKm: 0,
            baseFare: 50,
            perKm: 6,
            convenienceFee: 0,
            minArrivalFee: 5,
          },
          fuel_delivery: {
            baseKm: 0,
            baseFare: 45,
            perKm: 6,
            convenienceFee: 0,
            minArrivalFee: 5,
          },
          key_unlock: {
            baseKm: 0,
            baseFare: 80,
            perKm: 6,
            convenienceFee: 0,
            minArrivalFee: 5,
          },
        },
      },
      specialized_recovery: {
        default: {
          baseKm: 6,
          baseFare: 50,
          perKm: 7.5,
          convenienceFee: 0,
          minArrivalFee: 0,
        },
        subServices: {
          luxury_exotic: {
            baseKm: 6,
            baseFare: 50,
            perKm: 7.5,
            convenienceFee: 0,
            minArrivalFee: 0,
          },
          accident_collision: {
            baseKm: 6,
            baseFare: 50,
            perKm: 7.5,
            convenienceFee: 0,
            minArrivalFee: 0,
          },
          heavy_duty: {
            baseKm: 6,
            baseFare: 50,
            perKm: 7.5,
            convenienceFee: 0,
            minArrivalFee: 0,
          },
          basement_pull_out: {
            baseKm: 6,
            baseFare: 50,
            perKm: 7.5,
            convenienceFee: 0,
            minArrivalFee: 0,
          },
        },
      },
      default: {
        default: {
          baseKm: 6,
          baseFare: 50,
          perKm: 7.5,
          convenienceFee: 0,
          minArrivalFee: 0,
        },
        subServices: {},
      },
    },
    platformCharges: {
      percentage: 15,
      splitRatio: { customer: 50, serviceProvider: 50 },
    },
  };

  const mapToCalcType = (cat) => {
    const v = String(cat || "")
      .toLowerCase()
      .trim();
    // Exact flow labels
    if (v === "towing services" || v === "towing") return "towing";
    if (v === "winching services" || v === "winching") return "winching";
    if (
      v === "roadside assistance" ||
      v === "roadside_assistance" ||
      v === "roadside"
    )
      return "roadside_assistance";
    if (
      v === "specialized/heavy recovery" ||
      v.includes("specialized") ||
      v.includes("heavy")
    )
      return "specialized_recovery";
    // Fallbacks
    if (v.includes("towing")) return "towing";
    if (v.includes("winching")) return "winching";
    if (v.includes("roadside")) return "roadside_assistance";
    if (v.includes("key")) return "key_unlock";
    return "specialized_recovery";
  };
  const normalizeRecoverySubService = (s) => {
    const raw = String(s || "")
      .trim()
      .toLowerCase();
    // Remove special chars, normalize hyphens/spaces to underscore
    const base = raw
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s-]+/g, "_");
    // Map specific flow labels to canonical keys
    const table = {
      // Towing
      flatbed_towing: "flatbed_towing",
      wheel_lift_towing: "wheel_lift_towing",
      // Winching
      on_road_winching: "on_road_winching",
      off_road_winching: "off_road_winching",
      // Roadside
      battery_jump_start: "battery_jump_start",
      fuel_delivery: "fuel_delivery",
      key_unlock: "key_unlock",
      // Specialized/Heavy
      luxury_and_exotic_car_recovery: "luxury_exotic",
      luxury_exotic: "luxury_exotic",
      accident_and_collision_recovery: "accident_collision",
      accident_collision: "accident_collision",
      heavy_duty_vehicle_recovery: "heavy_duty",
      heavy_duty: "heavy_duty",
      basement_pull_out: "basement_pull_out",
    };
    return table[base] || base;
  };
  const normalizeRecoveryCategoryBucket = (s) => mapToCalcType(s);
  const isRoundTrip = routeType === "two_way" || routeType === "round_trip";
  const dEff = Math.max(0, isRoundTrip ? distanceKm * 2 : distanceKm);
  const legMultiplier = isRoundTrip ? 2 : 1;

  // Resolve charges (prefer structured, then flat)
  const preferredSub = normalizeRecoverySubService(subService);
  const broad = normalizeRecoveryCategoryBucket(serviceCategory);
  let sc = {};
  const byCat = admin.serviceChargesByCategory;
  if (byCat && (byCat[broad] || byCat.default)) {
    const bucket = byCat[broad] || byCat.default;
    sc =
      (bucket.subServices && bucket.subServices[preferredSub]) ||
      bucket.default ||
      {};
  }
  if (!sc || Object.keys(sc).length === 0) {
    sc =
      admin.serviceCharges[preferredSub] ||
      admin.serviceCharges[broad] ||
      admin.serviceCharges.default ||
      {};
  }

  // No city/comprehensive overrides: use admin hardcoded values only

  const baseKm = Number(sc.baseKm ?? 6);
  const baseFare = Number(sc.baseFare ?? 50);
  const perKm = Number(sc.perKm ?? 7.5);
  const convenienceFee = Number(sc.convenienceFee || 0);
  const minArrivalFee = Number(sc.minArrivalFee || 0);
  const platformPct = Number(admin.platformCharges?.percentage ?? 15);
  const vatPct = Number(process.env.VAT_PERCENT || 0);

  const extraKm = Math.max(0, dEff - baseKm);
  const distanceFare = Math.round(extraKm * perKm);

  // No night/surge when using hardcoded admin-only pricing
  const nightCharge = 0;
  const nightMultiplier = 1;
  const surgeMultiplier = 1;

  // Subtotal core
  let subtotalCore = Math.round(
    baseFare * legMultiplier +
      distanceFare +
      convenienceFee * legMultiplier +
      minArrivalFee * legMultiplier
  );
  subtotalCore = Math.round(
    (subtotalCore + nightCharge) * nightMultiplier * surgeMultiplier
  );

  // Waiting and helper
  // Waiting charges: free 5 minutes, then AED 2/min, capped at AED 20
  const waitFree = 5;
  const waitPerMinute = 2;
  const waitCap = 20;
  const wm = Math.max(0, Number(waitingMinutes || 0));
  const billable = Math.max(0, wm - waitFree);
  const rawWait = billable * waitPerMinute;
  const waitCharge = Math.min(waitCap, rawWait);
  const wc = {
    freeMinutes: waitFree,
    billableMinutes: billable,
    perMinute: waitPerMinute,
    waitingCharges: waitCharge,
  };
  const helperEnabled = !!helper;
  const helperFeeAed = helperEnabled
    ? Number(process.env.HELPER_FEE_AED || 25)
    : 0;

  // Platform after waiting/helper
  const preVatTotalBeforePlatform =
    subtotalCore + wc.waitingCharges + helperFeeAed;
  const platformFee = Math.round(
    (preVatTotalBeforePlatform * platformPct) / 100
  );
  const platformCustomer = Math.round(platformFee / 2);
  const platformDriver = platformFee - platformCustomer;
  const subtotalWithPlatform = preVatTotalBeforePlatform + platformFee;
  const vatAmount = Math.round((subtotalWithPlatform * vatPct) / 100);

  // Round-trip discount
  const rtDiscount = 0;
  let totalFare = Math.max(0, subtotalWithPlatform + vatAmount - rtDiscount);

  // Monotonicity guard: two_way >= one_way
  if (isRoundTrip) {
    const d1 = Math.max(0, dEff / 2);
    const extraKm1 = Math.max(0, d1 - baseKm);
    const distanceFare1 = Math.round(extraKm1 * perKm);
    let subtotalCore1 = Math.round(
      baseFare + distanceFare1 + convenienceFee + minArrivalFee
    );
    subtotalCore1 = Math.round(
      (subtotalCore1 + nightCharge) * nightMultiplier * surgeMultiplier
    );
    const preVatBeforePlatform1 = subtotalCore1; // waiting/helper assumed 0 for one-way baseline guard
    const platformFee1 = Math.round(
      (preVatBeforePlatform1 * platformPct) / 100
    );
    const subtotalWithPlatform1 = preVatBeforePlatform1 + platformFee1;
    const vatAmount1 = Math.round((subtotalWithPlatform1 * vatPct) / 100);
    const oneWayTotal = Math.max(0, subtotalWithPlatform1 + vatAmount1);
    if (totalFare < oneWayTotal) totalFare = oneWayTotal;
  }

  return {
    currency: "AED",
    baseFare,
    distanceFare,
    platformFee,
    platformFeeSplit: { customer: platformCustomer, driver: platformDriver },
    nightCharge: nightCharge || undefined,
    nightCharges: nightCharge || undefined,
    nightMultiplier: nightMultiplier !== 1 ? nightMultiplier : undefined,
    surgeMultiplier: surgeMultiplier !== 1 ? surgeMultiplier : undefined,
    cityOverridePerKm: undefined,
    waiting: wc,
    helper: { enabled: helperEnabled, fee: helperFeeAed },
    roundTripDiscount: rtDiscount || undefined,
    vatAmount,
    subtotal: subtotalWithPlatform,
    totalFare,
    breakdown: {
      baseKm,
      perKm,
      distanceInKm: dEff,
      effectiveDistanceKm: dEff,
      perKmUsed: perKm,
      routeType,
      usedSubService: preferredSub || broad,
    },
  };
}

// Enums for car cab and bike vehicle types
const CAR_CAB_VEHICLE_TYPES = new Set([
  "economy",
  "premium",
  "luxury",
  "xl",
  "family",
]);
const BIKE_VEHICLE_TYPES = new Set(["economy", "premium", "vip"]);

function validateCabBike(serviceType, vehicleType) {
  const st = String(serviceType || "")
    .trim()
    .toLowerCase();
  const vt = String(vehicleType || "")
    .trim()
    .toLowerCase();
  if (st === "car cab") {
    if (!CAR_CAB_VEHICLE_TYPES.has(vt)) {
      const allowed = Array.from(CAR_CAB_VEHICLE_TYPES).join(", ");
      const err = new Error(
        `Invalid car cab vehicleType '${vt}'. Allowed: ${allowed}`
      );
      err.code = 400;
      throw err;
    }
  } else if (st === "bike") {
    if (!BIKE_VEHICLE_TYPES.has(vt)) {
      const allowed = Array.from(BIKE_VEHICLE_TYPES).join(", ");
      const err = new Error(
        `Invalid bike vehicleType '${vt}'. Allowed: ${allowed}`
      );
      err.code = 400;
      throw err;
    }
  }
}

async function resolveFixedVehiclePrice(serviceType, vehicleType) {
  try {
    const st = String(serviceType || "")
      .trim()
      .toLowerCase();
    const vt = String(vehicleType || "")
      .trim()
      .toLowerCase();
    if (!vt) return null;
    const comp = await ComprehensivePricing.findOne({ isActive: true })
      .select("serviceTypes")
      .lean();
    if (st === "car cab") {
      const fixed = comp?.serviceTypes?.carCab?.vehicleTypes?.[vt]?.fixedPrice;
      return typeof fixed === "number" && fixed >= 0 ? fixed : null;
    }
    if (st === "bike") {
      const fixed = comp?.serviceTypes?.bike?.vehicleTypes?.[vt]?.fixedPrice;
      return typeof fixed === "number" && fixed >= 0 ? fixed : null;
    }
    return null;
  } catch {
    return null;
  }
}

// Allowed enums for car recovery services and sub-services
const RECOVERY_SERVICE_TYPES = new Set([
  "towing",
  "winching",
  "roadside_assistance",
  "key_unlock",
  "car recovery", // legacy label used elsewhere; we still validate subService separately
]);

const RECOVERY_SUB_SERVICES = new Set([
  "flatbed_towing",
  "wheel_lift_towing",
  "on_road_winching",
  "off_road_winching",
  "battery_jump_start",
  "fuel_delivery",
  "luxury_car_recovery",
  "accident_recovery",
  "heavy_duty_recovery",
  "basement_pull_out",
]);

// Mapping which sub-services belong to which serviceType (for car recovery)
const SERVICE_TO_SUBSERVICES = {
  towing: ["flatbed_towing", "wheel_lift_towing"],
  winching: ["on_road_winching", "off_road_winching", "basement_pull_out"],
  roadside_assistance: ["battery_jump_start", "fuel_delivery"],
  key_unlock: [],
};

// Helper to validate service/sub-service names strictly
function validateRecoveryService(serviceType, subService) {
  const sType = typeof serviceType === "string" ? serviceType.trim() : "";
  const sSub = typeof subService === "string" ? subService.trim() : "";
  if (sType && !RECOVERY_SERVICE_TYPES.has(sType)) {
    const allowed = Array.from(RECOVERY_SERVICE_TYPES).join(", ");
    const err = new Error(
      `Invalid serviceType '${sType}'. Allowed: ${allowed}`
    );
    err.code = 400;
    throw err;
  }
  if (sSub && !RECOVERY_SUB_SERVICES.has(sSub)) {
    const allowed = Array.from(RECOVERY_SUB_SERVICES).join(", ");
    const err = new Error(`Invalid subService '${sSub}'. Allowed: ${allowed}`);
    err.code = 400;
    throw err;
  }
  if (sType && sSub) {
    const allowedSubs = SERVICE_TO_SUBSERVICES[sType] || [];
    if (!allowedSubs.includes(sSub)) {
      const err = new Error(
        `Sub-service '${sSub}' does not belong to serviceType '${sType}'`
      );
      err.code = 400;
      throw err;
    }
  }
}

// Try to read a fixed price for a sub-service from ComprehensivePricing if configured
async function resolveFixedSubServicePrice(subService) {
  try {
    if (!subService) return null;
    const comp = await ComprehensivePricing.findOne({ isActive: true })
      .select("subServicePricing")
      .lean();
    // Expected shape: comp.subServicePricing.car_recovery.<subService>.fixedPrice
    const fixed =
      comp?.subServicePricing?.car_recovery?.[subService]?.fixedPrice;
    if (typeof fixed === "number" && fixed >= 0) return fixed;
    return null;
  } catch {
    return null;
  }
}

export {
  getFareEstimation,
  adjustFareEstimation,
  findQualifiedDriversForEstimation,
  computeAdminCarRecoveryFare,
};
