import asyncHandler from "express-async-handler";
import { calculateShiftingMoversFare, calculateCarRecoveryFare } from '../utils/fareCalculator.js';
import { calculateComprehensiveFare } from '../utils/comprehensiveFareCalculator.js';
import PricingConfig from '../models/pricingModel.js';
import ComprehensivePricing from '../models/comprehensivePricingModel.js';

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
        serviceCategory: vehicleType,
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
  
  const userId = req.user._id;

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

  if (![
    "car cab", 
    "bike", 
    "car recovery", 
    "shifting & movers"
  ].includes(serviceType)) {
    return res.status(400).json({
      message: "Invalid service type",
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
        serviceCategory: serviceCategory || vehicleType,
        distance: distanceInMeters / 1000,
        serviceDetails
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
      tripDetails: {
        distance: `${(distanceInMeters / 1000).toFixed(2)} km`,
        serviceType,
        serviceCategory,
        vehicleType,
        routeType,
        paymentMethod
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
  adjustFareEstimation
};