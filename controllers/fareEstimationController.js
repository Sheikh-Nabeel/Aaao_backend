import asyncHandler from "express-async-handler";
import { calculateShiftingMoversFare, calculateCarRecoveryFare } from '../utils/fareCalculator.js';
import { calculateComprehensiveFare } from '../utils/comprehensiveFareCalculator.js';
import PricingConfig from '../models/pricingModel.js';
import ComprehensivePricing from '../models/comprehensivePricingModel.js';
import User from '../models/userModel.js';
import { calculateDistance } from '../utils/distanceCalculator.js';

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
       return calculateCarRecoveryFare({
         vehicleType: vehicleType,
         serviceCategory: serviceCategory || vehicleType,
         distance: distanceInKm,
         serviceDetails: {}
       });
    
    default:
      return 20; // Default minimum fare
  }
};

// Get fare estimation
const getFareEstimation = asyncHandler(async (req, res) => {
  const {
    pickupLocation,
    dropoffLocation,
    serviceType,
    serviceCategory,
    vehicleType,
    routeType = "one_way",
    distanceInMeters,
    serviceDetails = {},
    itemDetails = [],
    serviceOptions = {},
    paymentMethod = "cash"
  } = req.body;
  
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
  if (req.user.kycLevel < 1 || req.user.kycStatus !== 'approved') {
    return res.status(403).json({
      success: false,
      message: "KYC Level 1 must be approved to get fare estimation.",
      token: req.cookies.token,
    });
  }

  // Validation
  if (
    !pickupLocation?.coordinates?.[0] ||
    !pickupLocation?.coordinates?.[1] ||
    !dropoffLocation?.coordinates?.[0] ||
    !dropoffLocation?.coordinates?.[1] ||
    !pickupLocation?.address ||
    !dropoffLocation?.address ||
    !serviceType ||
    !distanceInMeters
  ) {
    return res.status(400).json({
      message: "Pickup and dropoff coordinates, addresses, service type, and distance are required",
      token: req.cookies.token,
    });
  }
  
  // Vehicle type validation for proper driver matching
  if (!vehicleType) {
    return res.status(400).json({
      message: "Vehicle type is required for fare estimation and driver matching",
      token: req.cookies.token,
    });
  }

  // Import vehicle options to ensure consistency
  const VALID_SERVICE_TYPES = {
    "car cab": ["economy", "premium", "xl", "family", "luxury"],
    "bike": ["economy", "premium", "vip"],
    "car recovery": [
      "flatbed towing",
      "wheel lift towing",
      "on-road winching",
      "off-road winching",
      "battery jump start",
      "fuel delivery",
      "luxury & exotic car recovery",
      "accident & collision recovery",
      "heavy-duty vehicle recovery",
      "basement pull-out",
    ],
    "shifting & movers": [
      "mini pickup",
      "suzuki carry",
      "small van",
      "medium truck",
      "mazda",
      "covered van",
      "large truck",
      "6-wheeler",
      "container truck",
    ],
  };

  const SERVICE_CATEGORY_MAP = {
    "car recovery": {
      "towing services": ["flatbed towing", "wheel lift towing"],
      "winching services": ["on-road winching", "off-road winching"],
      "roadside assistance": ["battery jump start", "fuel delivery"],
      "specialized/heavy recovery": [
        "luxury & exotic car recovery",
        "accident & collision recovery",
        "heavy-duty vehicle recovery",
        "basement pull-out",
      ],
    },
    "shifting & movers": {
      "small mover": ["mini pickup", "suzuki carry", "small van"],
      "medium mover": ["medium truck", "mazda", "covered van"],
      "heavy mover": ["large truck", "6-wheeler", "container truck"],
    },
  };

  if (!Object.keys(VALID_SERVICE_TYPES).includes(serviceType)) {
    return res.status(400).json({
      message: `Invalid service type. Valid options are: ${Object.keys(VALID_SERVICE_TYPES).join(", ")}`,
      token: req.cookies.token,
    });
  }

  // Validate vehicleType if provided
  if (vehicleType && !VALID_SERVICE_TYPES[serviceType]?.includes(vehicleType)) {
    return res.status(400).json({
      message: `Invalid vehicleType '${vehicleType}' for serviceType '${serviceType}'. Valid options are: ${VALID_SERVICE_TYPES[serviceType].join(", ")}`,
      token: req.cookies.token,
    });
  }

  // Validate serviceCategory if provided
  if (serviceCategory && SERVICE_CATEGORY_MAP[serviceType]) {
    const categoryKey = serviceCategory.toLowerCase();
    const mapKeys = Object.keys(SERVICE_CATEGORY_MAP[serviceType]);
    const foundKey = mapKeys.find((k) => k.toLowerCase() === categoryKey);
    const allowed = foundKey ? SERVICE_CATEGORY_MAP[serviceType][foundKey] : null;
    if (allowed && vehicleType && !allowed.includes(vehicleType)) {
      return res.status(400).json({
        message: `vehicleType '${vehicleType}' does not belong to serviceCategory '${serviceCategory}'`,
        token: req.cookies.token,
      });
    }
  }

  try {
    let fareResult;
    let estimatedFare;
    
         // Calculate fare based on service type
     if (serviceType === "shifting & movers") {
       const fareData = await calculateShiftingMoversFare({
         vehicleType,
         distance: distanceInMeters / 1000,
         routeType,
         serviceDetails,
         furnitureDetails: req.body.furnitureDetails || {},
         itemDetails,
         serviceOptions
       });
       estimatedFare = fareData?.totalCalculatedFare || fareData?.totalFare || 0;
       fareResult = fareData;
    } else if (serviceType === "car recovery") {
      const fareData = await calculateCarRecoveryFare({
        vehicleType: vehicleType,
        serviceCategory: serviceCategory,
        distance: distanceInMeters / 1000,
        serviceDetails,
        routeType,
        startTime: req.body.startTime ? new Date(req.body.startTime) : new Date(),
        waitingMinutes: req.body.waitingMinutes || 0,
        demandRatio: req.body.demandRatio || 1,
        cityCode: req.body.cityCode || 'default'
      });
      estimatedFare = fareData?.totalCalculatedFare || fareData?.totalFare || 0;
      fareResult = fareData;
    } else {
      // Use comprehensive fare calculation for car cab, bike, and car recovery
      fareResult = await calculateFareByServiceType(
        serviceType,
        vehicleType,
        distanceInMeters,
        routeType,
        {
          demandRatio: req.body.demandRatio || 1,
          waitingMinutes: req.body.waitingMinutes || 0,
          estimatedDuration: req.body.estimatedDuration || Math.ceil((distanceInMeters / 1000) / 40 * 60) // Estimate based on 40km/h average speed
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
        distance: `${(distanceInMeters / 1000).toFixed(2)} km`,
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