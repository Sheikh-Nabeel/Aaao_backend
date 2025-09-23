import asyncHandler from "express-async-handler";
import { calculateShiftingMoversFare } from '../utils/fareCalculator.js';
import FareCalculator from '../utils/fareCalculator.js';
import { calculateComprehensiveFare } from '../utils/comprehensiveFareCalculator.js';
import PricingConfig from '../models/pricingModel.js';
import ComprehensivePricing from '../models/comprehensivePricingModel.js';
import User from '../models/userModel.js';
import { calculateDistance } from '../utils/distanceCalculator.js';
import Booking from '../models/bookingModel.js';

// Find qualified drivers and vehicles for fare estimation
const findQualifiedDriversForEstimation = async (pickupLocation, serviceType, vehicleType, driverPreference = 'nearby') => {
  try {
    console.log('=== FINDING QUALIFIED DRIVERS FOR ESTIMATION ===');
    console.log('Service Type:', serviceType);
    console.log('Vehicle Type:', vehicleType);
    console.log('Driver Preference:', driverPreference);
    
    let driverQuery = {
      role: 'driver',
      kycLevel: 2,
      kycStatus: 'approved',
      isActive: true,
      driverStatus: 'online'
    };

    // Handle Pink Captain preferences
    if (driverPreference === 'pink_captain') {
      driverQuery.gender = 'female';
      console.log('Pink Captain requested - filtering for female drivers');
    }

    console.log('Driver Query:', driverQuery);

    // Find drivers based on query
    const drivers = await User.find(driverQuery).select(
      'firstName lastName email phoneNumber currentLocation gender driverSettings vehicleDetails profilePicture rating totalRides'
    );
    console.log(`Found ${drivers.length} potential drivers`);

    if (drivers.length === 0) {
      console.log('No drivers found matching criteria');
      return [];
    }

    // Get driver IDs for vehicle lookup
    const driverIds = drivers.map(driver => driver._id);
    
    // Find vehicles that match the service type and vehicle type
    let vehicleQuery = {
      userId: { $in: driverIds },
      serviceType: serviceType
    };
    
    // Add vehicle type filter if specified
    if (vehicleType && vehicleType !== 'any') {
      vehicleQuery.vehicleType = vehicleType;
    }
    
    console.log('Vehicle Query:', vehicleQuery);
    
    // Import Vehicle model
    const Vehicle = (await import('../models/vehicleModel.js')).default;
    
    // Find matching vehicles
    const vehicles = await Vehicle.find(vehicleQuery).select('userId vehicleType serviceType');
    console.log(`Found ${vehicles.length} matching vehicles`);
    
    if (vehicles.length === 0) {
      console.log('No vehicles found matching service and vehicle type criteria');
      return [];
    }
    
    // Get driver IDs that have matching vehicles
    const qualifiedDriverIds = vehicles.map(vehicle => vehicle.userId.toString());
    
    // Filter drivers to only those with matching vehicles
    const qualifiedDrivers = drivers.filter(driver => 
      qualifiedDriverIds.includes(driver._id.toString())
    );
    
    console.log(`Found ${qualifiedDrivers.length} drivers with matching vehicles`);

    if (qualifiedDrivers.length === 0) {
      console.log('No qualified drivers found with matching vehicles');
      return [];
    }

    // Calculate distances and filter by radius
    const driversWithDistance = [];
    const maxRadius = driverPreference === 'pink_captain' ? 50 : 10; // 50km for Pink Captain, 10km for estimation

    for (const driver of qualifiedDrivers) {
      if (driver.currentLocation && driver.currentLocation.coordinates) {
        const distance = calculateDistance(
          { lat: pickupLocation.coordinates[1], lng: pickupLocation.coordinates[0] },
          { lat: driver.currentLocation.coordinates[1], lng: driver.currentLocation.coordinates[0] }
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
              lastUpdated: driver.currentLocation.lastUpdated
            },
            distance: Math.round(distance * 100) / 100,
            estimatedArrival: Math.ceil(distance / 0.5) // Assuming 30km/h average speed in city
          });
        }
      }
    }

    // Filter Pink Captain drivers based on their preferences
    let filteredDrivers = driversWithDistance;
    if (driverPreference === 'pink_captain') {
      console.log('Filtering Pink Captain drivers based on preferences...');
      
      filteredDrivers = driversWithDistance.filter(driver => {
        const driverData = qualifiedDrivers.find(d => d._id.toString() === driver.id.toString());
        const driverPrefs = driverData?.driverSettings?.ridePreferences;
        return driverPrefs && driverPrefs.pinkCaptainMode;
      });
      
      console.log(`Filtered to ${filteredDrivers.length} Pink Captain drivers`);
    }

    // Sort by distance and limit to top 10
    filteredDrivers.sort((a, b) => a.distance - b.distance);
    const topDrivers = filteredDrivers.slice(0, 10);
    
    console.log(`Returning ${topDrivers.length} qualified drivers within ${maxRadius}km radius`);
    return topDrivers;

  } catch (error) {
    console.error('Error finding qualified drivers for estimation:', error);
    return [];
  }
};

// Get fare adjustment settings
const getFareAdjustmentSettings = async (serviceType) => {
  try {
    const config = await PricingConfig.findOne({ 
      serviceType: serviceType === 'shifting & movers' ? 'shifting_movers' : serviceType.replace(' ', '_'),
      isActive: true 
    });
    
    if (config && config.fareAdjustmentSettings) {
      return config.fareAdjustmentSettings;
    }
    
    // Default settings if no config found
    return {
      allowedAdjustmentPercentage: 3,
      enableUserFareAdjustment: true,
      enablePendingBookingFareIncrease: true
    };
  } catch (error) {
    console.error('Error fetching fare adjustment settings:', error);
    return {
      allowedAdjustmentPercentage: 3,
      enableUserFareAdjustment: true,
      enablePendingBookingFareIncrease: true
    };
  }
};

// Calculate fare by service type using comprehensive system
const calculateFareByServiceType = async (serviceType, vehicleType, distance, routeType, additionalData = {}) => {
  const distanceInKm = distance / 1000;
  
  // Check if comprehensive pricing is available
  const comprehensiveConfig = await ComprehensivePricing.findOne({ isActive: true });
  
  if (comprehensiveConfig && (serviceType === "car cab" || serviceType === "bike" || serviceType === "car recovery")) {
    // Use comprehensive fare calculation
    const bookingData = {
      serviceType: serviceType.replace(' ', '_'),
      vehicleType,
      distance: distanceInKm,
      routeType,
      demandRatio: additionalData.demandRatio || 1,
      waitingMinutes: additionalData.waitingMinutes || 0,
      estimatedDuration: additionalData.estimatedDuration || 0
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
      return (baseFare + (distanceInKm * perKmRate)) * multiplier;
    
    case "shifting & movers":
      return calculateShiftingMoversFare({
        vehicleType,
        distance: distanceInKm,
        routeType,
        serviceDetails: {},
        itemDetails: [],
        serviceOptions: {}
      });
    
    case "car recovery":
      // Prefer Admin PricingConfig (carRecoveryConfig); fallback to calculator
      const mapToCalcType = (cat) => {
        const v = String(cat || '').toLowerCase();
        if (v.includes('towing')) return 'towing';
        if (v.includes('winching')) return 'winching';
        if (v.includes('roadside')) return 'roadside_assistance';
        if (v.includes('key')) return 'key_unlock';
        return 'specialized_recovery';
      };
      try {
        const cfg = await PricingConfig.findOne({ serviceType: 'car_recovery', isActive: true }).lean();
        const admin = cfg?.carRecoveryConfig;
        if (admin?.serviceCharges) {
          const subtype = mapToCalcType(additionalData?.serviceCategory || serviceType);
          const sc = admin.serviceCharges[subtype] || admin.serviceCharges.default || {};
          const baseKm = Number(sc.baseKm ?? 6);
          const baseFare = Number(sc.baseFare ?? 50);
          const perKm = Number(sc.perKm ?? 7.5);
          const platformPct = Number(admin.platformCharges?.percentage ?? 0);
          const vatPct = Number(process.env.VAT_PERCENT || 0);
          const d = Math.max(0, distanceInKm);
          const extraKm = Math.max(0, d - baseKm);
          const distanceFare = Math.round(extraKm * perKm);
          const subtotal = Math.round(baseFare + distanceFare);
          const platformFee = Math.round((subtotal * platformPct) / 100);
          const subtotalWithPlatform = subtotal + platformFee;
          const vatAmount = Math.round((subtotalWithPlatform * vatPct) / 100);
          const totalFare = subtotalWithPlatform + vatAmount;
          return {
            currency: 'AED',
            baseFare,
            distanceFare,
            platformFee,
            vatAmount,
            subtotal: subtotalWithPlatform,
            totalFare,
            breakdown: { baseKm, perKm, distanceInKm: d },
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
          waitingTime: Number(additionalData.waitingMinutes || 0)
        });
        const estimatedFare = (fare.totalWithVat ?? fare.totalFare ?? 0);
        return {
          currency: 'AED',
          breakdown: fare.fareBreakdown,
          baseFare: fare.baseFare,
          distanceFare: fare.distanceFare,
          platformFee: fare.platformFee?.amount,
          nightCharges: fare.nightSurcharge,
          surgeCharges: undefined,
          waitingCharges: fare.waitingCharges,
          vatAmount: fare.vat?.amount,
          subtotal: fare.subtotal,
          totalFare: estimatedFare
        };
      }
    
    default:
      return 20; // Default minimum fare
  }
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
    paymentMethod = "cash"
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
    const x = String(st).toLowerCase().replace(/\s+/g, '_');
    if (["towing", "flatbed", "wheel_lift"].includes(x)) return { type: 'car recovery', category: 'towing services' };
    if (["winching", "on-road_winching", "off-road_winching", "on_road_winching", "off_road_winching"].includes(x)) return { type: 'car recovery', category: 'winching services' };
    if (["roadside_assistance", "battery_jump_start", "fuel_delivery", "roadside"].includes(x)) return { type: 'car recovery', category: 'roadside assistance' };
    if (["key_unlock", "key", "unlock"].includes(x)) return { type: 'car recovery', category: 'roadside assistance' };
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
  const REQUIRE_KYC = (process.env.FARE_ESTIMATE_REQUIRE_KYC || 'true').toLowerCase() !== 'false';
  if (REQUIRE_KYC && !requestId && (req.user.kycLevel < 1 || req.user.kycStatus !== 'approved')) {
    return res.status(403).json({
      success: false,
      message: "KYC Level 1 must be approved to get fare estimation.",
      token: req.cookies.token,
    });
  }

  // Branch A: requestId path (generic, works for any module with a Booking). When provided, KYC requirement is bypassed after auth.
  if (requestId) {
    try {
      const booking = await Booking.findById(requestId).select('user driver serviceType serviceCategory vehicleType pickupLocation dropoffLocation routeType');
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found', token: req.cookies.token });
      }

      // Authorization: user, driver or admin
      const reqUserIdStr = String(req.user._id);
      const isOwner = String(booking.user) === reqUserIdStr;
      const isDriver = booking.driver && String(booking.driver) === reqUserIdStr;
      const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
      if (!isOwner && !isDriver && !isAdmin) {
        return res.status(403).json({ success: false, message: 'Not authorized for this booking', token: req.cookies.token });
      }

      // Normalize GeoJSON to lat/lng
      const toLatLng = (geo) => ({ lat: geo.coordinates?.[1], lng: geo.coordinates?.[0] });
      const pickup = toLatLng(booking.pickupLocation);
      const dropoff = toLatLng(booking.dropoffLocation);
      const distanceKm = calculateDistance(pickup, dropoff);
      const distanceMeters = Math.round(distanceKm * 1000);
      const avgSpeedKmh = 30;
      const durationMinutes = Math.ceil((distanceKm / avgSpeedKmh) * 60);

      // Map car recovery categories to calculator serviceType
      const mapToCalcType = (cat) => {
        const v = String(cat || '').toLowerCase();
        if (v.includes('towing')) return 'towing';
        if (v.includes('winching')) return 'winching';
        if (v.includes('roadside')) return 'roadside_assistance';
        if (v.includes('key')) return 'key_unlock';
        return 'specialized_recovery';
      };

      let fareResult;
      let estimatedFare;
      if (booking.serviceType === 'car recovery') {
        // Prefer Admin PricingConfig (carRecoveryConfig); fallback to calculator
        const mapToCalcType = (cat) => {
          const v = String(cat || '').toLowerCase();
          if (v.includes('towing')) return 'towing';
          if (v.includes('winching')) return 'winching';
          if (v.includes('roadside')) return 'roadside_assistance';
          if (v.includes('key')) return 'key_unlock';
          return 'specialized_recovery';
        };
        let usedAdmin = false;
        try {
          const cfg = await PricingConfig.findOne({ serviceType: 'car_recovery', isActive: true }).lean();
          const admin = cfg?.carRecoveryConfig;
          if (admin?.serviceCharges) {
            usedAdmin = true;
            const subtype = mapToCalcType(booking.serviceCategory);
            const sc = admin.serviceCharges[subtype] || admin.serviceCharges.default || {};
            const baseKm = Number(sc.baseKm ?? 6);
            const baseFare = Number(sc.baseFare ?? 50);
            const perKm = Number(sc.perKm ?? 7.5);
            const platformPct = Number(admin.platformCharges?.percentage ?? 0);
            const vatPct = Number(process.env.VAT_PERCENT || 0);
            const d = Math.max(0, distanceKm);
            const extraKm = Math.max(0, d - baseKm);
            const distanceFare = Math.round(extraKm * perKm);
            const subtotal = Math.round(baseFare + distanceFare);
            const platformFee = Math.round((subtotal * platformPct) / 100);
            const subtotalWithPlatform = subtotal + platformFee;
            const vatAmount = Math.round((subtotalWithPlatform * vatPct) / 100);
            const totalFare = subtotalWithPlatform + vatAmount;
            estimatedFare = totalFare;
            fareResult = {
              currency: 'AED',
              baseFare,
              distanceFare,
              platformFee,
              vatAmount,
              subtotal: subtotalWithPlatform,
              totalFare,
              breakdown: { baseKm, perKm, distanceInKm: d }
            };
          }
        } catch (_) {}
        if (!usedAdmin) {
          const fare = await FareCalculator.calculateRecoveryFare({
            vehicleType: booking.vehicleType || 'car',
            serviceType: mapToCalcType(booking.serviceCategory),
            distance: distanceKm,
            duration: durationMinutes,
            startTime: new Date(),
            waitingTime: Number(req.body?.options?.waitingTime || 0)
          });
          const roundTrip = booking.routeType === 'two_way' || !!req.body?.options?.roundTrip;
          const discount = roundTrip ? Number(process.env.ROUND_TRIP_DISCOUNT_AED || 10) : 0;
          const finalAmount = Math.max(0, (fare.totalWithVat ?? fare.totalFare ?? 0) - discount);
          estimatedFare = finalAmount;
          fareResult = {
            currency: 'AED',
            breakdown: fare.fareBreakdown,
            baseFare: fare.baseFare,
            distanceFare: fare.distanceFare,
            platformFee: fare.platformFee?.amount,
            nightCharges: fare.nightSurcharge,
            surgeCharges: undefined,
            waitingCharges: fare.waitingCharges,
            vatAmount: fare.vat?.amount,
            subtotal: fare.subtotal,
            totalFare: finalAmount
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
            waitingMinutes: Number(req.body?.options?.waitingTime || 0)
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
        estimatedFare: Math.round(estimatedFare * 100) / 100,
        currency: fareResult.currency || 'AED',
        adjustmentSettings: {
          allowedPercentage: adjustmentPercentage,
          minFare: Math.round(minFare * 100) / 100,
          maxFare: Math.round(maxFare * 100) / 100,
          canAdjustFare: fareSettings.enableUserFareAdjustment
        },
        qualifiedDrivers: [],
        driversCount: 0,
        tripDetails: {
          distance: `${distanceKm.toFixed(2)} km`,
          serviceType: booking.serviceType,
          serviceCategory: booking.serviceCategory,
          vehicleType: booking.vehicleType,
          routeType: booking.routeType,
          paymentMethod
        }
      };

      if (fareResult.breakdown) {
        responseData.fareBreakdown = {
          baseFare: fareResult.baseFare,
          distanceFare: fareResult.distanceFare,
          platformFee: fareResult.platformFee,
          nightCharges: fareResult.nightCharges,
          surgeCharges: fareResult.surgeCharges,
          waitingCharges: fareResult.waitingCharges,
          vatAmount: fareResult.vatAmount,
          subtotal: fareResult.subtotal,
          totalFare: fareResult.totalFare,
          breakdown: fareResult.breakdown
        };
      }

      return res.status(200).json({ success: true, message: 'Fare estimation calculated successfully', data: responseData, token: req.cookies.token });
    } catch (e) {
      console.error('Fare estimation by requestId error:', e);
      return res.status(500).json({ success: false, message: 'Error calculating fare estimation by requestId', error: e.message, token: req.cookies.token });
    }
  }

  // Branch B: Original body-based estimation (no requestId provided)
  // Accept either coordinates as {lat,lng} or GeoJSON [lng,lat]. Compute distance if not provided.
  const extractLatLng = (loc) => {
    if (!loc) return null;
    if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
      return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
    }
    if (loc.coordinates && typeof loc.coordinates.lat === 'number' && typeof loc.coordinates.lng === 'number') {
      return { lat: loc.coordinates.lat, lng: loc.coordinates.lng };
    }
    if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
  };

  const pickupLatLng = extractLatLng(pickupLocation);
  const dropoffLatLng = extractLatLng(dropoffLocation);

  if (!serviceType) {
    return res.status(400).json({ message: "serviceType is required", token: req.cookies.token });
  }

  let computedDistanceMeters = distanceInMeters;
  if ((!computedDistanceMeters || Number(computedDistanceMeters) <= 0) && pickupLatLng && dropoffLatLng) {
    const dKm = calculateDistance(pickupLatLng, dropoffLatLng);
    computedDistanceMeters = Math.round(dKm * 1000);
  }
  if (!computedDistanceMeters) {
    return res.status(400).json({ message: "distanceInMeters is required if coordinates are not provided", token: req.cookies.token });
  }
  
  // Vehicle type validation for proper driver matching (skip strict check for car recovery)
  if (!vehicleType && serviceType !== 'car recovery') {
    return res.status(400).json({
      message: "Vehicle type is required for fare estimation and driver matching",
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
        serviceOptions
      });
      estimatedFare = fareData?.totalCalculatedFare || fareData?.totalFare || 0;
      fareResult = fareData;
    } else if (serviceType === "car recovery") {
      // Prefer Admin PricingConfig (carRecoveryConfig); fallback to calculator
      const mapToCalcType = (cat) => {
        const v = String(cat || '').toLowerCase();
        if (v.includes('towing')) return 'towing';
        if (v.includes('winching')) return 'winching';
        if (v.includes('roadside')) return 'roadside_assistance';
        if (v.includes('key')) return 'key_unlock';
        return 'specialized_recovery';
      };
      let usedAdmin = false;
      try {
        const cfg = await PricingConfig.findOne({ serviceType: 'car_recovery', isActive: true }).lean();
        const admin = cfg?.carRecoveryConfig;
        if (admin?.serviceCharges) {
          usedAdmin = true;
          const subtype = mapToCalcType(serviceCategory);
          const sc = admin.serviceCharges[subtype] || admin.serviceCharges.default || {};
          const baseKm = Number(sc.baseKm ?? 6);
          const baseFare = Number(sc.baseFare ?? 50);
          const perKm = Number(sc.perKm ?? 7.5);
          const platformPct = Number(admin.platformCharges?.percentage ?? 0);
          const vatPct = Number(process.env.VAT_PERCENT || 0);
          const d = Math.max(0, computedDistanceMeters / 1000);
          const extraKm = Math.max(0, d - baseKm);
          const distanceFare = Math.round(extraKm * perKm);
          const subtotal = Math.round(baseFare + distanceFare);
          const platformFee = Math.round((subtotal * platformPct) / 100);
          const subtotalWithPlatform = subtotal + platformFee;
          const vatAmount = Math.round((subtotalWithPlatform * vatPct) / 100);
          const totalFare = subtotalWithPlatform + vatAmount;
          estimatedFare = totalFare;
          fareResult = {
            currency: 'AED',
            baseFare,
            distanceFare,
            platformFee,
            vatAmount,
            subtotal: subtotalWithPlatform,
            totalFare,
            breakdown: { baseKm, perKm, distanceInKm: d }
          };
        }
      } catch (_) {}
      if (!usedAdmin) {
        const fare = await FareCalculator.calculateRecoveryFare({
          vehicleType: vehicleType,
          serviceType: mapToCalcType(serviceCategory),
          distance: computedDistanceMeters / 1000,
          duration: Math.ceil((computedDistanceMeters / 1000) / 30 * 60),
          startTime: req.body.startTime ? new Date(req.body.startTime) : new Date(),
          waitingTime: Number(req.body.waitingMinutes || 0)
        });
        estimatedFare = (fare.totalWithVat ?? fare.totalFare ?? 0);
        fareResult = {
          currency: 'AED',
          breakdown: fare.fareBreakdown,
          baseFare: fare.baseFare,
          distanceFare: fare.distanceFare,
          platformFee: fare.platformFee?.amount,
          nightCharges: fare.nightSurcharge,
          surgeCharges: undefined,
          waitingCharges: fare.waitingCharges,
          vatAmount: fare.vat?.amount,
          subtotal: fare.subtotal,
          totalFare: estimatedFare
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
          estimatedDuration: req.body.estimatedDuration || Math.ceil((computedDistanceMeters / 1000) / 40 * 60) // Estimate based on 40km/h average speed
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
      estimatedFare: Math.round(estimatedFare * 100) / 100,
      currency: fareResult.currency || "AED",
      adjustmentSettings: {
        allowedPercentage: adjustmentPercentage,
        minFare: Math.round(minFare * 100) / 100,
        maxFare: Math.round(maxFare * 100) / 100,
        canAdjustFare: fareSettings.enableUserFareAdjustment
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
        driverPreference: req.body.driverPreference
      }
    };
    
    // Add detailed breakdown if available (from comprehensive calculation)
    if (fareResult.breakdown) {
      responseData.fareBreakdown = {
        baseFare: fareResult.baseFare,
        distanceFare: fareResult.distanceFare,
        platformFee: fareResult.platformFee,
        nightCharges: fareResult.nightCharges,
        surgeCharges: fareResult.surgeCharges,
        waitingCharges: fareResult.waitingCharges,
        vatAmount: fareResult.vatAmount,
        subtotal: fareResult.subtotal,
        totalFare: fareResult.totalFare,
        breakdown: fareResult.breakdown
      };
    }
    
    // Add alerts if available
    if (fareResult.alerts && fareResult.alerts.length > 0) {
      responseData.alerts = fareResult.alerts;
    }

    res.status(200).json({
      success: true,
      message: "Fare estimation calculated successfully",
      data: responseData,
      token: req.cookies.token
    });

  } catch (error) {
    console.error('Fare estimation error:', error);
    res.status(500).json({
      success: false,
      message: "Error calculating fare estimation",
      error: error.message,
      token: req.cookies.token
    });
  }
});

// Adjust fare estimation
const adjustFareEstimation = asyncHandler(async (req, res) => {
  const {
    originalFare,
    adjustedFare,
    serviceType
  } = req.body;
  
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
        message: `Adjusted fare must be between ${minAllowedFare.toFixed(2)} and ${maxAllowedFare.toFixed(2)} AED (±${adjustmentPercentage}% of original fare)`,
        token: req.cookies.token,
      });
    }

    res.status(200).json({
      success: true,
      message: "Fare adjustment validated successfully",
      data: {
        originalFare: Math.round(originalFare * 100) / 100,
        adjustedFare: Math.round(adjustedFare * 100) / 100,
        adjustmentAmount: Math.round((adjustedFare - originalFare) * 100) / 100,
        adjustmentPercentage: Math.round(((adjustedFare - originalFare) / originalFare) * 100 * 100) / 100,
        currency: "AED"
      },
      token: req.cookies.token
    });

  } catch (error) {
    console.error('Fare adjustment error:', error);
    res.status(500).json({
      success: false,
      message: "Error validating fare adjustment",
      error: error.message,
      token: req.cookies.token
    });
  }
});

export {
  getFareEstimation,
  adjustFareEstimation,
  findQualifiedDriversForEstimation
};