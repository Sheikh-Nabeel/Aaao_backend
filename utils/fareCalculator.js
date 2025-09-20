// Constants
const BASE_DISTANCE_KM = 6;
const BASE_FARE = 50;
const PER_KM_RATE = 7.5;
const FREE_WAITING_MINUTES = 5;
const WAITING_CHARGE_PER_MIN = 2;
const MAX_WAITING_CHARGE = 20;
const FREE_STAY_MIN_PER_KM = 0.5;
const MAX_FREE_STAY_MINUTES = 30;
const NIGHT_HOURS = { start: 22, end: 6 }; // 22:00 to 06:00

// Vehicle type constants
const VEHICLE_TYPES = {
  CAR: 'car',
  SUV: 'suv',
  TRUCK: 'truck',
  MOTORCYCLE: 'motorcycle',
  BUS: 'bus'
};

// Service type constants
const SERVICE_TYPES = {
  TOWING: 'towing',
  WINCHING: 'winching',
  ROADSIDE_ASSISTANCE: 'roadside_assistance',
  SPECIALIZED_RECOVERY: 'specialized_recovery'
};

// Calculate distance fare
const calculateDistanceFare = (distance) => {
  if (distance <= BASE_DISTANCE_KM) {
    return BASE_FARE;
  }
  return BASE_FARE + ((distance - BASE_DISTANCE_KM) * PER_KM_RATE);
};

// Calculate waiting charges
const calculateWaitingCharges = (waitingTime) => {
  if (waitingTime <= FREE_WAITING_MINUTES) return 0;
  const chargeableMinutes = waitingTime - FREE_WAITING_MINUTES;
  return Math.min(chargeableMinutes * WAITING_CHARGE_PER_MIN, MAX_WAITING_CHARGE);
};

// Check if it's night time
const checkNightTime = (dateTime) => {
  const hour = new Date(dateTime).getHours();
  return hour >= NIGHT_HOURS.start || hour < NIGHT_HOURS.end;
};

// Calculate minimum fare
const calculateMinimumFare = (serviceType, vehicleType) => {
  return BASE_FARE; // Can be extended with service/vehicle specific minimums
};

// Calculate cancellation fee
const calculateCancellationFee = (driverProgress) => {
  if (driverProgress < 25) return 2;
  if (driverProgress >= 50) return 5;
  return 0; // No fee between 25% and 50%
};

// Calculate fare for shifting/movers service
const calculateShiftingMoversFare = async (bookingData) => {
  try {
    const {
      distance,
      furnitureDetails,
      serviceDetails,
      vehicleType
    } = bookingData;
    
    // Get pricing configuration for the specific vehicle type
    let config = await PricingConfig.findOne({ 
      serviceType: 'shifting_movers',
      'shiftingMoversConfig.vehicleType': vehicleType,
      isActive: true 
    });
    
    if (!config || !config.shiftingMoversConfig) {
      // If no specific vehicle type config found, try to get default config
      const defaultConfig = await PricingConfig.findOne({ 
        serviceType: 'shifting_movers', 
        isActive: true 
      });
      
      if (!defaultConfig || !defaultConfig.shiftingMoversConfig) {
        throw new Error(`Shifting/Movers pricing configuration not found for vehicle type: ${vehicleType}`);
      }
      
      console.log(`Using default pricing for vehicle type: ${vehicleType}`);
      config = defaultConfig;
    }
    
    const pricing = config.shiftingMoversConfig;
    
    // Validate that the pricing config matches the requested vehicle type
    if (pricing.vehicleType !== vehicleType) {
      console.log(`Warning: Pricing config vehicle type (${pricing.vehicleType}) doesn't match requested vehicle type (${vehicleType})`);
    }
    
    let fareBreakdown = {
      baseFare: 0,
      distanceFare: 0,
      serviceFees: {
        loadingUnloading: 0,
        packing: 0,
        fixing: 0,
        helpers: 0
      },
      locationCharges: {
        pickupStairs: 0,
        pickupLift: 0,
        dropoffStairs: 0,
        dropoffLift: 0
      },
      itemCharges: 0,
      platformCharges: {
        percentage: 0,
        amount: 0
      },
      totalCalculatedFare: 0,
      vehicleType: vehicleType,
      pricingConfig: {
        vehicleType: pricing.vehicleType,
        vehicleStartFare: pricing.vehicleStartFare,
        perKmFare: pricing.perKmFare
      }
    };
    
    // 1. Calculate base fare (covers 5KM)
    fareBreakdown.baseFare = pricing.vehicleStartFare;
    
    // 2. Calculate distance fare (after 5KM)
    if (distance > 5) {
      fareBreakdown.distanceFare = (distance - 5) * pricing.perKmFare;
    }
    
    // 3. Calculate item charges if furniture details provided
    if (furnitureDetails) {
      fareBreakdown.itemCharges = calculateItemBasedFare(
        furnitureDetails, pricing.itemPricing, 'loadingUnloadingFare'
      );
    }
    
    // 4. Calculate service fees
    if (serviceDetails?.shiftingMovers?.selectedServices) {
      const selectedServices = serviceDetails.shiftingMovers.selectedServices;
      
      // Loading/Unloading Helper
      if (selectedServices.loadingUnloading) {
        const totalItems = getTotalItemCount(furnitureDetails);
        if (pricing.basicServices.loadingUnloadingHelper.includeInBasicFare) {
          const baseLimit = pricing.basicServices.loadingUnloadingHelper.baseLimit;
          if (totalItems > baseLimit) {
            fareBreakdown.serviceFees.loadingUnloading = 
              pricing.basicServices.loadingUnloadingHelper.fare + 
              ((totalItems - baseLimit) * getAverageItemFare(pricing.itemPricing, 'loadingUnloadingFare'));
          } else {
            fareBreakdown.serviceFees.loadingUnloading = pricing.basicServices.loadingUnloadingHelper.fare;
          }
        } else {
          fareBreakdown.serviceFees.loadingUnloading = calculateItemBasedFare(
            furnitureDetails, pricing.itemPricing, 'loadingUnloadingFare'
          );
        }
      }
      
      // Packing
      if (selectedServices.packing) {
        const totalItems = getTotalItemCount(furnitureDetails);
        if (pricing.basicServices.packers.includeInBasicFare) {
          const baseLimit = pricing.basicServices.packers.baseLimit;
          if (totalItems > baseLimit) {
            fareBreakdown.serviceFees.packing = 
              pricing.basicServices.packers.fare + 
              ((totalItems - baseLimit) * getAverageItemFare(pricing.itemPricing, 'packingFare'));
          } else {
            fareBreakdown.serviceFees.packing = pricing.basicServices.packers.fare;
          }
        } else {
          fareBreakdown.serviceFees.packing = calculateItemBasedFare(
            furnitureDetails, pricing.itemPricing, 'packingFare'
          );
        }
      }
      
      // Fixing
      if (selectedServices.fixing) {
        const totalItems = getTotalItemCount(furnitureDetails);
        if (pricing.basicServices.fixers.includeInBasicFare) {
          const baseLimit = pricing.basicServices.fixers.baseLimit;
          if (totalItems > baseLimit) {
            fareBreakdown.serviceFees.fixing = 
              pricing.basicServices.fixers.fare + 
              ((totalItems - baseLimit) * getAverageItemFare(pricing.itemPricing, 'fixingFare'));
          } else {
            fareBreakdown.serviceFees.fixing = pricing.basicServices.fixers.fare;
          }
        } else {
          fareBreakdown.serviceFees.fixing = calculateItemBasedFare(
            furnitureDetails, pricing.itemPricing, 'fixingFare'
          );
        }
      }
      
      // Helpers
      if (selectedServices.helpers) {
        fareBreakdown.serviceFees.helpers = pricing.basicServices.loadingUnloadingHelper.fare;
      }
    }
    
    // 5. Calculate location charges (stairs/lift)
    if (serviceDetails?.shiftingMovers) {
      const { pickupFloorDetails, dropoffFloorDetails } = serviceDetails.shiftingMovers;
      
      // Pickup location charges
      if (pickupFloorDetails) {
        // Ground floor extra charge
        if (pickupFloorDetails.floor === 0 && pricing.locationPolicy.groundFloor.extraCharge > 0) {
          fareBreakdown.locationCharges.pickupGroundFloor = pricing.locationPolicy.groundFloor.extraCharge;
        }
        
        // Stairs charges
        if (pickupFloorDetails.accessType === 'stairs' && pickupFloorDetails.floor > 0) {
          const baseCoverageFloors = pricing.locationPolicy.stairs.baseCoverageFloors || 0;
          const extraFloors = Math.max(0, pickupFloorDetails.floor - baseCoverageFloors);
          if (extraFloors > 0) {
            fareBreakdown.locationCharges.pickupStairs = calculateStairsCharges(
              furnitureDetails, pricing.itemPricing, extraFloors
            );
          }
        }
        
        // Lift charges
        if (pickupFloorDetails.accessType === 'lift' && pickupFloorDetails.floor > 0) {
          const baseCoverageFloors = pricing.locationPolicy.lift.baseCoverageFloors || 1;
          if (pickupFloorDetails.floor > baseCoverageFloors) {
            fareBreakdown.locationCharges.pickupLift = calculateLiftCharges(
              furnitureDetails, pricing.itemPricing
            );
          }
        }
      }
      
      // Dropoff location charges
      if (dropoffFloorDetails) {
        // Ground floor extra charge
        if (dropoffFloorDetails.floor === 0 && pricing.locationPolicy.groundFloor.extraCharge > 0) {
          fareBreakdown.locationCharges.dropoffGroundFloor = pricing.locationPolicy.groundFloor.extraCharge;
        }
        
        // Stairs charges
        if (dropoffFloorDetails.accessType === 'stairs' && dropoffFloorDetails.floor > 0) {
          const baseCoverageFloors = pricing.locationPolicy.stairs.baseCoverageFloors || 0;
          const extraFloors = Math.max(0, dropoffFloorDetails.floor - baseCoverageFloors);
          if (extraFloors > 0) {
            fareBreakdown.locationCharges.dropoffStairs = calculateStairsCharges(
              furnitureDetails, pricing.itemPricing, extraFloors
            );
          }
        }
        
        // Lift charges
        if (dropoffFloorDetails.accessType === 'lift' && dropoffFloorDetails.floor > 0) {
          const baseCoverageFloors = pricing.locationPolicy.lift.baseCoverageFloors || 1;
          if (dropoffFloorDetails.floor > baseCoverageFloors) {
            fareBreakdown.locationCharges.dropoffLift = calculateLiftCharges(
              furnitureDetails, pricing.itemPricing
            );
          }
        }
      }
    }
    
    // 6. Calculate platform charges
    const subtotal = 
      fareBreakdown.baseFare +
      fareBreakdown.distanceFare +
      Object.values(fareBreakdown.serviceFees).reduce((sum, fee) => sum + fee, 0) +
      Object.values(fareBreakdown.locationCharges).reduce((sum, charge) => sum + charge, 0) +
      fareBreakdown.itemCharges;
    
    // Apply platform charges (default 10% if not specified)
    const platformPercentage = pricing.platformCharges?.percentage || 10;
    const platformAmount = (subtotal * platformPercentage) / 100;
    
    fareBreakdown.platformCharges = {
      percentage: platformPercentage,
      amount: platformAmount
    };
    
    // 7. Calculate total fare including platform charges
    fareBreakdown.totalCalculatedFare = subtotal + platformAmount;
    
    return fareBreakdown;
  } catch (error) {
    throw new Error(`Fare calculation error: ${error.message}`);
  }
};

// Main car recovery fare calculation
const calculateCarRecoveryFare = async (bookingData) => {
  const {
    distance,
    duration,
    serviceType,
    vehicleType,
    isRoundTrip = false,
    waitingTime = 0,
    startTime = new Date(),
    cancellationReason = null,
    driverDistance = 0,
    totalDriverDistance = 0
  } = bookingData;

  try {
    // Input validation
    if (distance === undefined || duration === undefined) {
      throw new Error('Distance and duration are required');
    }

    // Calculate fare components
    const distanceFare = calculateDistanceFare(distance);
    const waitingCharges = calculateWaitingCharges(waitingTime);
    const isNightTime = checkNightTime(startTime);
    const nightCharges = isNightTime ? 10 : 0;
    
    // Calculate subtotal
    let subtotal = distanceFare + waitingCharges + nightCharges;
    
    // Apply minimum fare
    const minimumFare = calculateMinimumFare(serviceType, vehicleType);
    subtotal = Math.max(subtotal, minimumFare);
    
    // Calculate platform fees (15% total, split 50/50 driver/customer)
    const platformFeePercentage = 15;
    const platformFee = (subtotal * platformFeePercentage) / 100;
    const driverPlatformFee = platformFee / 2;
    const customerPlatformFee = platformFee / 2;
    
    // Calculate total fare
    const totalFare = subtotal + platformFee;
    
    // Calculate cancellation fee if applicable
    let cancellationFee = 0;
    if (cancellationReason && totalDriverDistance > 0) {
      const driverProgress = (driverDistance / totalDriverDistance) * 100;
      cancellationFee = calculateCancellationFee(driverProgress);
    }
    
    // Calculate free stay minutes for round trips
    let freeStayMinutes = 0;
    if (isRoundTrip) {
      freeStayMinutes = Math.min(
        Math.floor(distance * FREE_STAY_MIN_PER_KM),
        MAX_FREE_STAY_MINUTES
      );
    }

    return {
      baseFare: BASE_FARE,
      distance,
      distanceFare,
      waitingTime,
      waitingCharges,
      isNightTime,
      nightCharges,
      platformFee: {
        total: platformFee,
        driver: driverPlatformFee,
        customer: customerPlatformFee,
        percentage: platformFeePercentage
      },
      cancellationFee,
      isRoundTrip,
      freeStayMinutes,
      subtotal,
      total: totalFare,
      currency: 'AED'
    };
  } catch (error) {
    throw new Error(`Car recovery fare calculation error: ${error.message}`);
  }
};

// Main fare calculation function
const calculateFare = async (bookingData) => {
  try {
    const { serviceType } = bookingData;
    
    // Route to the appropriate fare calculator based on service type
    switch (serviceType) {
      case 'car_recovery':
        return await calculateCarRecoveryFare(bookingData);
      case 'shifting & movers':
        return await calculateShiftingMoversFare(bookingData);
      // Add other service types here
      default:
        throw new Error(`Unsupported service type: ${serviceType}`);
    }
  } catch (error) {
    console.error('Error in calculateFare:', error);
    throw new Error(`Fare calculation failed: ${error.message}`);
  }
};

import PricingConfig from '../models/pricingModel.js';

class FareCalculator {
  /**
   * Calculate fare for car recovery service
   * @param {Object} params - Fare calculation parameters
   * @param {string} params.vehicleType - Type of vehicle (car, suv, truck, etc.)
   * @param {string} params.serviceType - Type of service (flatbed towing, winching, etc.)
   * @param {number} params.distance - Distance in kilometers
   * @param {number} params.duration - Duration in minutes
   * @param {Date} [params.startTime] - Start time of the service (for night charges)
   * @param {boolean} [params.hasHelper=false] - Whether a helper is required
   * @param {number} [params.helperCount=0] - Number of helpers
   * @param {number} [params.waitingTime=0] - Waiting time in minutes
   * @returns {Promise<Object>} - Object containing fare details
   */
  static async calculateRecoveryFare({
    vehicleType,
    serviceType,
    distance,
    duration,
    startTime = new Date(),
    hasHelper = false,
    helperCount = 0,
    waitingTime = 0
  }) {
    try {
      // Fallback configuration
      const FALLBACK_CONFIG = {
        vehicleTypes: {
          CAR: { baseFare: 50, perKmRate: 5, minFare: 50, displayName: 'Car' },
          SUV: { baseFare: 75, perKmRate: 7, minFare: 75, displayName: 'SUV' },
          TRUCK: { baseFare: 100, perKmRate: 10, minFare: 100, displayName: 'Truck' },
          MOTORCYCLE: { baseFare: 30, perKmRate: 3, minFare: 30, displayName: 'Motorcycle' }
        },
        serviceTypes: {
          TOWING: { additionalCharge: 50, description: 'Standard towing service' },
          WINCHING: { additionalCharge: 100, description: 'Winching service' },
          ROADSIDE_ASSISTANCE: { flatFee: 75, description: 'Roadside assistance' }
        },
        platformFees: {
          percentage: 15,
          splitRatio: { customer: 50, serviceProvider: 50 }
        },
        waitingCharges: {
          freeMinutes: 5,
          perMinuteAfter: 2,
          maxWaitingCharge: 20
        }
      };

      let config;
      try {
        // Try to get config from database first
        const pricingConfig = await PricingConfig.findOne({ 
          serviceType: 'car_recovery',
          isActive: true 
        });

        if (pricingConfig?.config) {
          console.log('Using pricing config from database');
          config = pricingConfig.config;
        } else {
          console.log('Using fallback pricing config');
          config = FALLBACK_CONFIG;
        }
      } catch (dbError) {
        console.error('Error fetching pricing config from database, using fallback:', dbError);
        config = FALLBACK_CONFIG;
      }
      
      // Normalize vehicle and service types to uppercase for case-insensitive matching
      const normalizedVehicleType = vehicleType?.toUpperCase();
      const normalizedServiceType = serviceType?.toUpperCase().replace(/ /g, '_');
      
      // Get vehicle type configuration with case-insensitive matching
      const vehicleConfig = config.vehicleTypes?.[normalizedVehicleType];
      if (!vehicleConfig) {
        const availableTypes = Object.keys(config.vehicleTypes || {}).join(', ');
        throw new Error(`Pricing not configured for vehicle type: ${vehicleType}. Available types: ${availableTypes}`);
      }

      // Get service type configuration with case-insensitive matching
      const serviceConfig = config.serviceTypes?.[normalizedServiceType];
      if (!serviceConfig) {
        const availableServices = Object.keys(config.serviceTypes || {}).join(', ');
        console.error('Available services:', availableServices);
        throw new Error(`Pricing not configured for service type: ${serviceType}. Available services: ${availableServices}`);
      }

      // Calculate base fare (first 6 km)
      const baseDistance = 6;
      const distanceBeyondBase = Math.max(0, distance - baseDistance);
      
      // Calculate distance-based fare
      let distanceFare = vehicleConfig.baseFare;
      if (distance > baseDistance) {
        distanceFare += Math.ceil(distanceBeyondBase * vehicleConfig.perKmRate);
      }

      // Apply service type charges
      let serviceFare = 0;
      if (serviceConfig.flatFee) {
        serviceFare = serviceConfig.flatFee;
      } else if (serviceConfig.additionalCharge) {
        serviceFare = distanceFare + serviceConfig.additionalCharge;
      } else if (serviceConfig.multiplier) {
        serviceFare = distanceFare * serviceConfig.multiplier;
      } else {
        serviceFare = distanceFare;
      }

      // Calculate waiting charges
      let waitingCharges = 0;
      const { waitingCharges: waitConfig = {} } = config;
      const freeMinutes = waitConfig.freeMinutes || 5;
      const perMinuteAfter = waitConfig.perMinuteAfter || 2;
      const maxWaitingCharge = waitConfig.maxWaitingCharge || 20;
      
      if (waitingTime > freeMinutes) {
        const chargeableMinutes = waitingTime - freeMinutes;
        waitingCharges = Math.min(
          chargeableMinutes * perMinuteAfter,
          maxWaitingCharge
        );
      }

      // Calculate night charges (10 PM to 6 AM)
      let nightSurcharge = 0;
      const { nightCharges = {} } = config;
      if (nightCharges.active) {
        const hour = startTime.getHours();
        const isNightTime = hour >= 22 || hour < 6;
        
        if (isNightTime) {
          nightSurcharge = nightCharges.surcharge || 10;
        }
      }

      // Calculate subtotal
      const subtotal = serviceFare + waitingCharges + nightSurcharge;
      
      // Apply minimum fare
      const totalFare = Math.max(subtotal, vehicleConfig.minFare);

      // Calculate platform fee (15% of total fare, split 50/50 between customer and provider)
      const platformFeePercentage = config.platformFees?.percentage || 15;
      const platformFee = (totalFare * platformFeePercentage) / 100;
      const platformFeeSplit = platformFee / 2;

      // Calculate amount for service provider (after platform fee)
      const providerAmount = totalFare - platformFeeSplit;

      return {
        baseFare: vehicleConfig.baseFare,
        distance,
        distanceFare,
        serviceType,
        serviceCharge: serviceFare - distanceFare,
        waitingCharges,
        nightSurcharge,
        subtotal,
        platformFee: {
          percentage: platformFeePercentage,
          amount: platformFee,
          customerShare: platformFeeSplit,
          providerShare: platformFeeSplit
        },
        totalFare,
        providerAmount,
        currency: 'AED',
        fareBreakdown: [
          { description: 'Base Fare', amount: vehicleConfig.baseFare },
          { 
            description: `Distance (${distance.toFixed(2)} km)`, 
            amount: distanceFare - vehicleConfig.baseFare 
          },
          { 
            description: serviceConfig.description || serviceType, 
            amount: serviceFare - distanceFare 
          },
          ...(waitingCharges > 0 ? [
            { description: 'Waiting Charges', amount: waitingCharges }
          ] : []),
          ...(nightSurcharge > 0 ? [
            { description: 'Night Surcharge', amount: nightSurcharge }
          ] : [])
        ].filter(item => item.amount > 0)
      };
    } catch (error) {
      console.error('Error calculating recovery fare:', error);
      throw error;
    }
  }

  /**
   * Calculate cancellation fee based on driver's progress
   * @param {number} driverProgress - Driver's progress percentage (0-100)
   * @param {Object} config - Pricing configuration
   * @returns {number} - Cancellation fee in AED
   */
  static calculateCancellationFee(driverProgress, config) {
    const { cancellationFees = {} } = config;
    
    if (driverProgress >= 50) {
      return cancellationFees.after50Percent || 5;
    } else if (driverProgress > 0) {
      return cancellationFees.before25Percent || 2;
    }
    
    return 0;
  }
}

export default FareCalculator;

// Export all necessary functions and constants in one place
export {
  // Main fare calculation functions
  calculateFare,
  calculateCarRecoveryFare,
  calculateShiftingMoversFare,
  
  // Helper functions
  calculateDistanceFare,
  calculateWaitingCharges,
  checkNightTime,
  calculateMinimumFare,
  calculateCancellationFee,
  
  // Constants
  VEHICLE_TYPES,
  SERVICE_TYPES,
  BASE_DISTANCE_KM,
  BASE_FARE,
  PER_KM_RATE,
  FREE_WAITING_MINUTES,
  WAITING_CHARGE_PER_MIN,
  MAX_WAITING_CHARGE,
  FREE_STAY_MIN_PER_KM,
  MAX_FREE_STAY_MINUTES,
  NIGHT_HOURS
};