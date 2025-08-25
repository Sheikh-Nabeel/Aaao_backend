import PricingConfig from '../models/pricingModel.js';

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

// Calculate fare for car recovery service - ALL services now use dynamic pricing
const calculateCarRecoveryFare = async (bookingData) => {
  try {
    const { 
      vehicleType, 
      serviceCategory, 
      distance, 
      serviceDetails, 
      routeType = 'one_way',
      startTime = new Date(),
      waitingMinutes = 0,
      demandRatio = 1,
      cityCode = 'default'
    } = bookingData;
    
    // ALL car recovery services now use dynamic pricing
    return await calculateDynamicCarRecoveryFare(bookingData);
  } catch (error) {
    throw new Error(`Car recovery fare calculation error: ${error.message}`);
  }
};

// Calculate fare for ALL car recovery services with dynamic pricing
const calculateDynamicCarRecoveryFare = async (bookingData) => {
  try {
    const { 
      vehicleType, 
      serviceCategory, 
      distance, 
      serviceDetails, 
      routeType = 'one_way',
      startTime = new Date(),
      waitingMinutes = 0,
      demandRatio = 1,
      cityCode = 'default'
    } = bookingData;
    
    // 1. Base Fare: Always apply AED 50 for first 6 km
    const baseFare = 50;
    
    // 2. Per KM Rate: After 6 km, charge AED 7.5 per km
    const perKmRate = 7.5;
    const distanceFare = distance > 6 ? (distance - 6) * perKmRate : 0;
    
    // 3. Minimum Fare: If total trip < 6 km → still charge AED 50 minimum
    const subtotal = baseFare + distanceFare;
    const minimumFare = 50;
    const adjustedSubtotal = Math.max(subtotal, minimumFare);
    
    // 4. Platform Fee: Deduct 15% of total fare (7.5% driver, 7.5% customer)
    const platformFeePercentage = 15;
    const platformFeeAmount = (adjustedSubtotal * platformFeePercentage) / 100;
    const customerPlatformFee = platformFeeAmount * 0.5; // 7.5%
    const driverPlatformFee = platformFeeAmount * 0.5; // 7.5%
    
    // 5. Night Charges: If ride start time between 22:00–06:00 → add AED 10
    const hour = startTime.getHours();
    const isNightTime = hour >= 22 || hour < 6;
    const nightCharges = isNightTime ? 10 : 0;
    
    // 6. Surge Pricing: Based on demand/supply ratio
    let surgeMultiplier = 1;
    let surgeCharges = 0;
    if (demandRatio >= 3) {
      surgeMultiplier = 2.0; // 2.0x if demand = 3x cars
    } else if (demandRatio >= 2) {
      surgeMultiplier = 1.5; // 1.5x if demand = 2x cars
    }
    surgeCharges = (adjustedSubtotal + nightCharges) * (surgeMultiplier - 1);
    
    // 7. City-wise Pricing: If trip >10 km in specific city → apply AED 5/km instead of default
    let cityCharges = 0;
    if (distance > 10 && cityCode !== 'default') {
      const citySpecificRate = 5; // AED 5/km for city trips
      cityCharges = distance * citySpecificRate;
    }
    
    // 8. Waiting Charges: Free wait: 5 minutes, After 5 mins → AED 2/minute, Stop charging after AED 20 cap
    const freeWaitMinutes = 5;
    const waitingRatePerMinute = 2;
    const maxWaitingCharges = 20;
    let waitingCharges = 0;
    if (waitingMinutes > freeWaitMinutes) {
      waitingCharges = Math.min((waitingMinutes - freeWaitMinutes) * waitingRatePerMinute, maxWaitingCharges);
    }
    
    // 9. Convenience Fee: Based on service type
    let convenienceFee = 0;
    if (serviceCategory === 'winching services') {
      convenienceFee = 50; // AED 50 for winching services
    } else if (serviceCategory === 'roadside assistance') {
      convenienceFee = 100; // AED 100 for roadside assistance
    } else if (serviceCategory === 'towing services') {
      convenienceFee = 25; // AED 25 for towing services
    } else if (serviceCategory === 'specialized/heavy recovery') {
      convenienceFee = 75; // AED 75 for specialized/heavy recovery
    }
    
    // 10. VAT: Apply country-based VAT on total fare
    const vatRate = 5; // 5% VAT for UAE
    const subtotalBeforeVat = adjustedSubtotal + nightCharges + surgeCharges + cityCharges + waitingCharges + convenienceFee;
    const vatAmount = (subtotalBeforeVat * vatRate) / 100;
    
    // Calculate total fare
    const totalFare = subtotalBeforeVat + vatAmount;
    
    // 11. Refreshment Alert: Trigger if ride >20 km OR >30 minutes
    const refreshmentAlert = distance > 20 || (waitingMinutes + (distance * 2)) > 30; // Rough estimate for trip duration
    
    // 12. Free Stay Minutes (Round Trips only)
    let freeStayMinutes = 0;
    if (routeType === 'round_trip') {
      freeStayMinutes = Math.min(distance * 0.5, 30); // 0.5 min per km, max 30 minutes
    }
    
    let fareBreakdown = {
      baseFare,
      distanceFare,
      minimumFare,
      subtotal: adjustedSubtotal,
      nightCharges,
      surgeCharges,
      surgeMultiplier,
      cityCharges,
      waitingCharges,
      convenienceFee,
      platformCharges: {
        percentage: platformFeePercentage,
        amount: platformFeeAmount,
        customerShare: customerPlatformFee,
        driverShare: driverPlatformFee,
        splitRatio: {
          customer: 50,
          serviceProvider: 50
        }
      },
      vatAmount,
      vatRate,
      totalCalculatedFare: totalFare,
      refreshmentAlert,
      freeStayMinutes,
      vehicleType,
      serviceCategory,
      pricingDetails: {
        perKmRate,
        freeWaitMinutes,
        waitingRatePerMinute,
        maxWaitingCharges,
        nightTimeHours: '22:00-06:00',
        surgePricing: {
          enabled: true,
          thresholds: {
            '1.5x': 2,
            '2.0x': 3
          }
        }
      }
    };
    
    return fareBreakdown;
  } catch (error) {
    throw new Error(`Winching/Roadside fare calculation error: ${error.message}`);
  }
};

// Calculate fare for key unlocker service
const calculateKeyUnlockerFare = async (bookingData) => {
  try {
    const config = await PricingConfig.findOne({ 
      serviceType: 'key_unlocker', 
      isActive: true 
    });
    
    if (!config || !config.keyUnlockerConfig) {
      throw new Error('Key unlocker pricing configuration not found');
    }
    
    const pricing = config.keyUnlockerConfig;
    const serviceCharges = pricing.serviceCharges;
    const platformChargesAmount = (serviceCharges * pricing.platformCharges.percentage) / 100;
    
    let fareBreakdown = {
      baseFare: serviceCharges,
      distanceFare: 0,
      serviceFees: {
        keyUnlockerService: serviceCharges
      },
      locationCharges: {},
      itemCharges: 0,
      platformCharges: {
        percentage: pricing.platformCharges.percentage,
        amount: platformChargesAmount,
        splitRatio: pricing.platformCharges.splitRatio,
        customerShare: platformChargesAmount * (pricing.platformCharges.splitRatio / 100),
        providerShare: platformChargesAmount * ((100 - pricing.platformCharges.splitRatio) / 100)
      },
      totalCalculatedFare: serviceCharges + platformChargesAmount
    };
    
    return fareBreakdown;
  } catch (error) {
    throw new Error(`Key unlocker fare calculation error: ${error.message}`);
  }
};

// Calculate fare for appointment-based services
const calculateAppointmentServiceFare = async (bookingData) => {
  try {
    const config = await PricingConfig.findOne({ 
      serviceType: 'appointment_based', 
      isActive: true 
    });
    
    if (!config || !config.appointmentServiceConfig) {
      throw new Error('Appointment service pricing configuration not found');
    }
    
    const pricing = config.appointmentServiceConfig;
    
    let fareBreakdown = {
      baseFare: 0, // No upfront fare for appointment-based services
      distanceFare: 0,
      serviceFees: {},
      locationCharges: {},
      itemCharges: 0,
      platformCharges: {
        percentage: 0,
        amount: pricing.fixedAppointmentFee // Only charged on successful appointment
      },
      totalCalculatedFare: 0 // No upfront payment
    };
    
    return fareBreakdown;
  } catch (error) {
    throw new Error(`Appointment service fare calculation error: ${error.message}`);
  }
};

// Helper functions
const getTotalItemCount = (furnitureDetails) => {
  if (!furnitureDetails) return 0;
  
  let total = 0;
  
  // Count predefined furniture items
  if (furnitureDetails) {
    total += Object.values(furnitureDetails).reduce((sum, count) => {
      return sum + (typeof count === 'number' ? count : 0);
    }, 0);
  }
  
  return total;
};

const getAverageItemFare = (itemPricing, fareType) => {
  if (!itemPricing || itemPricing.length === 0) return 0;
  
  const totalFare = itemPricing.reduce((sum, item) => sum + (item[fareType] || 0), 0);
  return totalFare / itemPricing.length;
};

const calculateItemBasedFare = (furnitureDetails, itemPricing, fareType) => {
  if (!itemPricing) return 0;
  
  let totalFare = 0;
  
  // Calculate fare for predefined furniture items
  if (furnitureDetails) {
    Object.entries(furnitureDetails).forEach(([itemName, quantity]) => {
      if (typeof quantity === 'number' && quantity > 0) {
        const itemConfig = itemPricing.find(item => 
          item.itemName.toLowerCase() === itemName.toLowerCase()
        );
        
        if (itemConfig && itemConfig[fareType]) {
          totalFare += itemConfig[fareType] * quantity;
        }
      }
    });
  }
  
  return totalFare;
};

const calculateStairsCharges = (furnitureDetails, itemPricing, floors) => {
  if (!itemPricing || floors <= 0) return 0;
  
  let totalCharge = 0;
  
  // Calculate stairs charges for predefined furniture items
  if (furnitureDetails) {
    Object.entries(furnitureDetails).forEach(([itemName, quantity]) => {
      if (typeof quantity === 'number' && quantity > 0) {
        const itemConfig = itemPricing.find(item => 
          item.itemName.toLowerCase() === itemName.toLowerCase()
        );
        
        if (itemConfig && itemConfig.stairsFarePerFloor) {
          totalCharge += itemConfig.stairsFarePerFloor * quantity * floors;
        }
      }
    });
  }
  
  return totalCharge;
};

const calculateLiftCharges = (furnitureDetails, itemPricing) => {
  if (!itemPricing) return 0;
  
  let totalCharge = 0;
  
  // Calculate lift charges for predefined furniture items
  if (furnitureDetails) {
    Object.entries(furnitureDetails).forEach(([itemName, quantity]) => {
      if (typeof quantity === 'number' && quantity > 0) {
        const itemConfig = itemPricing.find(item => 
          item.itemName.toLowerCase() === itemName.toLowerCase()
        );
        
        if (itemConfig && itemConfig.liftFarePerItem) {
          totalCharge += itemConfig.liftFarePerItem * quantity;
        }
      }
    });
  }
  
  return totalCharge;
};

// Main fare calculation function
const calculateFare = async (bookingData) => {
  try {
    const { serviceType } = bookingData;
    
    switch (serviceType) {
      case 'shifting & movers':
        return await calculateShiftingMoversFare(bookingData);
      case 'car recovery':
        return await calculateCarRecoveryFare(bookingData);
      case 'key_unlocker':
        return await calculateKeyUnlockerFare(bookingData);
      case 'appointment_based':
        return await calculateAppointmentServiceFare(bookingData);
      case 'car cab':
      case 'bike':
        // For cab and bike, use existing fare calculation logic
        return {
          baseFare: bookingData.fare || 0,
          distanceFare: 0,
          serviceFees: {},
          locationCharges: {},
          itemCharges: 0,
          platformCharges: { percentage: 0, amount: 0 },
          totalCalculatedFare: bookingData.fare || 0
        };
      default:
        throw new Error(`Unsupported service type: ${serviceType}`);
    }
  } catch (error) {
    throw new Error(`Fare calculation failed: ${error.message}`);
  }
};

export {
  calculateFare,
  calculateShiftingMoversFare,
  calculateCarRecoveryFare,
  calculateKeyUnlockerFare,
  calculateAppointmentServiceFare
};