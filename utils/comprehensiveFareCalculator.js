import ComprehensivePricing from '../models/comprehensivePricingModel.js';

// Get current time for night charge calculation
const getCurrentHour = () => {
  return new Date().getHours();
};

// Check if current time is within night hours
const isNightTime = (nightCharges) => {
  const currentHour = getCurrentHour();
  const { startHour, endHour } = nightCharges;
  
  if (startHour > endHour) {
    // Night time spans midnight (e.g., 22:00 to 06:00)
    return currentHour >= startHour || currentHour < endHour;
  } else {
    // Night time within same day
    return currentHour >= startHour && currentHour < endHour;
  }
};

// Calculate surge multiplier based on demand
const calculateSurgeMultiplier = (demandRatio, surgePricing) => {
  if (!surgePricing.enabled) return 1;
  
  // Find appropriate surge level
  const surgeLevel = surgePricing.levels
    .sort((a, b) => b.demandRatio - a.demandRatio)
    .find(level => demandRatio >= level.demandRatio);
  
  return surgeLevel ? surgeLevel.multiplier : 1;
};

// Calculate cancellation charges based on trip progress
const calculateCancellationCharges = (tripProgress, cancellationReason, cancellationCharges) => {
  const { beforeArrival, after25PercentDistance, after50PercentDistance, afterArrival } = cancellationCharges;
  
  // No charge for driver cancellations
  if (cancellationReason === 'driver_cancelled') return 0;
  
  // Customer cancellation charges based on trip progress
  if (cancellationReason === 'customer_cancelled_after_arrival' || tripProgress === 'arrived') {
    return afterArrival;
  }
  if (tripProgress >= 0.5) return after50PercentDistance;
  if (tripProgress >= 0.25) return after25PercentDistance;
  
  // Default charge for early customer cancellation
  return beforeArrival;
};

// Calculate waiting charges
const calculateWaitingCharges = (waitingMinutes, waitingCharges) => {
  const { freeMinutes, perMinuteRate, maximumCharge } = waitingCharges;
  
  if (waitingMinutes <= freeMinutes) return 0;
  
  const chargeableMinutes = waitingMinutes - freeMinutes;
  const calculatedCharge = chargeableMinutes * perMinuteRate;
  
  return Math.min(calculatedCharge, maximumCharge);
};

// Calculate free stay minutes for round trips
const calculateFreeStayMinutes = (distance, roundTripConfig) => {
  if (!roundTripConfig.freeStayMinutes.enabled) return 0;
  
  const calculatedMinutes = distance * roundTripConfig.freeStayMinutes.ratePerKm;
  return Math.min(calculatedMinutes, roundTripConfig.freeStayMinutes.maximumMinutes);
};

// Check if refreshment alert should be shown
const shouldShowRefreshmentAlert = (distance, estimatedDuration, roundTripConfig, serviceType = null, recoveryConfig = null) => {
  // For car recovery services, use specific refreshment alert config
  if (serviceType === 'car recovery' && recoveryConfig && recoveryConfig.refreshmentAlert) {
    if (!recoveryConfig.refreshmentAlert.enabled) return false;
    return distance >= recoveryConfig.refreshmentAlert.minimumDistance || 
           estimatedDuration >= recoveryConfig.refreshmentAlert.minimumDuration;
  }
  
  // Default logic for other services
  if (!roundTripConfig.refreshmentAlert.enabled) return false;
  
  return distance >= roundTripConfig.refreshmentAlert.minimumDistance || 
         estimatedDuration >= roundTripConfig.refreshmentAlert.minimumDuration;
};

// Calculate refreshment/overtime charges for car recovery
const calculateRefreshmentCharges = (overtimeMinutes, refreshmentConfig) => {
  if (!refreshmentConfig.enabled || overtimeMinutes <= 0) return 0;
  
  // Calculate charges based on per minute or per 5-minute blocks
  const perMinuteCharge = overtimeMinutes * refreshmentConfig.perMinuteCharges;
  const per5MinCharge = Math.ceil(overtimeMinutes / 5) * refreshmentConfig.per5MinCharges;
  
  // Use the configured charging method (assuming per minute for now)
  const calculatedCharge = perMinuteCharge;
  
  // Apply maximum charge cap
  return Math.min(calculatedCharge, refreshmentConfig.maximumCharges);
};

// Calculate free stay minutes for car recovery round trips
const calculateCarRecoveryFreeStay = (distance, freeStayConfig) => {
  if (!freeStayConfig.enabled) return 0;
  
  const calculatedMinutes = distance * freeStayConfig.ratePerKm;
  return Math.min(calculatedMinutes, freeStayConfig.maximumCap);
};

// Main comprehensive fare calculation function
const calculateComprehensiveFare = async (bookingData) => {
  try {
    // Get pricing configuration
    const pricingConfig = await ComprehensivePricing.findOne({ isActive: true });
    if (!pricingConfig) {
      throw new Error('Comprehensive pricing configuration not found');
    }
    
    const {
      serviceType,
      vehicleType,
      distance, // in km
      routeType = 'one_way',
      demandRatio = 1,
      waitingMinutes = 0,
      tripProgress = 0,
      estimatedDuration = 0,
      isNightTime: isNightTimeParam = false,
      isCancelled = false,
      cancellationReason = null
    } = bookingData;
    
    let fareBreakdown = {
      baseFare: 0,
      distanceFare: 0,
      platformFee: 0,
      nightCharges: 0,
      surgeCharges: 0,
      waitingCharges: 0,
      cancellationCharges: 0,
      vatAmount: 0,
      subtotal: 0,
      totalFare: 0,
      currency: pricingConfig.currency,
      breakdown: {},
      alerts: []
    };
    
    // 1. Calculate base fare and distance fare
    let baseFare = pricingConfig.baseFare.amount;
    let perKmRate = pricingConfig.perKmRate.afterBaseCoverage;
    
    // Service-specific adjustments (normalize service type)
    const normalizedServiceType = serviceType.replace(/\s+/g, '_').toLowerCase();
    
    if ((normalizedServiceType === 'car_cab' || serviceType === 'car cab') && pricingConfig.serviceTypes.carCab.enabled) {
      const vehicleConfig = pricingConfig.serviceTypes.carCab.vehicleTypes[vehicleType];
      if (vehicleConfig) {
        baseFare = vehicleConfig.baseFare;
        perKmRate = vehicleConfig.perKmRate;
      }
    } else if (serviceType === 'bike' && pricingConfig.serviceTypes.bike.enabled) {
      // Check if vehicle-specific pricing is available for bikes
      const vehicleConfig = pricingConfig.serviceTypes.bike.vehicleTypes && pricingConfig.serviceTypes.bike.vehicleTypes[vehicleType];
      
      if (vehicleConfig) {
        baseFare = vehicleConfig.baseFare;
        perKmRate = vehicleConfig.perKmRate;
      } else {
        // Fallback to default bike pricing
        baseFare = pricingConfig.serviceTypes.bike.baseFare;
        perKmRate = pricingConfig.serviceTypes.bike.perKmRate;
      }
    } else if (normalizedServiceType === 'car_recovery' || serviceType === 'car recovery') {
      const recoveryConfig = pricingConfig.serviceTypes.carRecovery;
      
      // Check if it's winching, roadside assistance, or key unlocker services
      const isWinchingOrRoadside = vehicleType && (
        recoveryConfig.serviceTypes.winching.subCategories[vehicleType] ||
        recoveryConfig.serviceTypes.roadsideAssistance.subCategories[vehicleType] ||
        vehicleType === 'keyUnlocker'
      );
      
      if (isWinchingOrRoadside) {
        // For winching, roadside assistance, and key unlocker services
        // Apply minimum charges for driver arriving + convenience fee
        let convenienceFee = 50; // default
        
        if (recoveryConfig.serviceTypes.winching.subCategories[vehicleType]) {
          convenienceFee = recoveryConfig.serviceTypes.winching.subCategories[vehicleType].convenienceFee;
        } else if (recoveryConfig.serviceTypes.roadsideAssistance.subCategories[vehicleType]) {
          convenienceFee = recoveryConfig.serviceTypes.roadsideAssistance.subCategories[vehicleType].convenienceFee;
        } else if (vehicleType === 'keyUnlocker') {
          convenienceFee = recoveryConfig.serviceTypes.keyUnlockerServices.convenienceFee;
        }
        
        baseFare = recoveryConfig.serviceTypes.winching.minimumChargesForDriverArriving + convenienceFee;
        fareBreakdown.baseFare = baseFare;
        fareBreakdown.distanceFare = 0;
        fareBreakdown.breakdown.convenienceFee = convenienceFee;
        fareBreakdown.breakdown.minimumDriverCharges = recoveryConfig.serviceTypes.winching.minimumChargesForDriverArriving;
      } else {
        // For all other car recovery types (except roadside assistance and winching)
        // Apply standard car recovery pricing structure
        baseFare = recoveryConfig.baseFare.amount;
        perKmRate = recoveryConfig.perKmRate.afterBaseCoverage;
        
        // Override base fare coverage for car recovery
        pricingConfig.baseFare.coverageKm = recoveryConfig.baseFare.coverageKm;
        
        // Override minimum fare for car recovery
        pricingConfig.minimumFare = recoveryConfig.minimumFare;
        
        // Override platform fee for car recovery
        pricingConfig.platformFee = recoveryConfig.platformFee;
        
        // Override cancellation charges for car recovery
        pricingConfig.cancellationCharges = recoveryConfig.cancellationCharges;
        
        // Override waiting charges for car recovery
        pricingConfig.waitingCharges = recoveryConfig.waitingCharges;
        
        // Override night charges for car recovery
        pricingConfig.nightCharges = recoveryConfig.nightCharges;
        
        // Override surge pricing for car recovery
        pricingConfig.surgePricing = recoveryConfig.surgePricing;
        
        // Override VAT for car recovery
        if (recoveryConfig.vat.enabled) {
          pricingConfig.vat = recoveryConfig.vat;
        }
      }
    }
    
    fareBreakdown.baseFare = baseFare;
    
    // Calculate distance fare
    if (distance > pricingConfig.baseFare.coverageKm) {
      let remainingDistance = distance - pricingConfig.baseFare.coverageKm;
      
      // City-wise pricing adjustment
      if (pricingConfig.perKmRate.cityWiseAdjustment.enabled && 
          distance > pricingConfig.perKmRate.cityWiseAdjustment.aboveKm) {
        const adjustmentPoint = pricingConfig.perKmRate.cityWiseAdjustment.aboveKm - pricingConfig.baseFare.coverageKm;
        
        if (remainingDistance > adjustmentPoint) {
          // Calculate fare for distance before adjustment point
          const beforeAdjustment = adjustmentPoint * perKmRate;
          // Calculate fare for distance after adjustment point
          const afterAdjustment = (remainingDistance - adjustmentPoint) * pricingConfig.perKmRate.cityWiseAdjustment.adjustedRate;
          fareBreakdown.distanceFare = beforeAdjustment + afterAdjustment;
        } else {
          fareBreakdown.distanceFare = remainingDistance * perKmRate;
        }
      } else {
        fareBreakdown.distanceFare = remainingDistance * perKmRate;
      }
    }
    
    // Calculate subtotal before additional charges
    fareBreakdown.subtotal = fareBreakdown.baseFare + fareBreakdown.distanceFare;
    
    // Apply route type multiplier for round trips (exclude car recovery)
    if ((routeType === 'round_trip' || routeType === 'two_way') && serviceType !== 'car recovery') {
      fareBreakdown.roundTripMultiplier = 1.8;
      fareBreakdown.subtotal *= fareBreakdown.roundTripMultiplier;
    }
    
    // Calculate free stay minutes
    const freeStayMinutes = calculateFreeStayMinutes(distance, pricingConfig.roundTrip);
    if (freeStayMinutes > 0) {
      fareBreakdown.breakdown.freeStayMinutes = freeStayMinutes;
    }
    
    // Check for refreshment alert
    if (shouldShowRefreshmentAlert(distance, estimatedDuration, pricingConfig.roundTrip, serviceType, pricingConfig.serviceTypes.carRecovery)) {
      if (serviceType === 'car recovery') {
        fareBreakdown.alerts.push({
          type: 'refreshment_alert',
          title: pricingConfig.serviceTypes.carRecovery.refreshmentAlert.popupTitle,
          options: pricingConfig.serviceTypes.carRecovery.refreshmentAlert.driverOptions
        });
      } else {
        fareBreakdown.alerts.push('Refreshment recommended for long trip');
      }
    }
    
    // Calculate car recovery specific free stay minutes for round trips
    if (serviceType === 'car recovery' && pricingConfig.serviceTypes.carRecovery.freeStayMinutes.enabled) {
      const carRecoveryFreeStay = calculateCarRecoveryFreeStay(distance, pricingConfig.serviceTypes.carRecovery.freeStayMinutes);
      if (carRecoveryFreeStay > 0) {
        fareBreakdown.breakdown.carRecoveryFreeStayMinutes = carRecoveryFreeStay;
        
        // Add notification alerts
        if (pricingConfig.serviceTypes.carRecovery.freeStayMinutes.notifications.fiveMinRemaining) {
          fareBreakdown.alerts.push({
            type: 'free_stay_warning',
            message: '5 minutes remaining for free stay'
          });
        }
      }
    }
    
    // Calculate subtotal and apply charges
    
    // 2. Apply minimum fare (service-specific)
    let minimumFare = pricingConfig.minimumFare; // Default global minimum fare
    
    // Check for service-specific minimum fare
    if (serviceType === 'car_cab' && pricingConfig.serviceTypes.carCab.minimumFare) {
      minimumFare = pricingConfig.serviceTypes.carCab.minimumFare;
    } else if (serviceType === 'bike' && pricingConfig.serviceTypes.bike.minimumFare) {
      minimumFare = pricingConfig.serviceTypes.bike.minimumFare;
    } else if ((normalizedServiceType === 'car_recovery' || serviceType === 'car recovery') && pricingConfig.serviceTypes.carRecovery.minimumFare) {
      minimumFare = pricingConfig.serviceTypes.carRecovery.minimumFare;
    }
    
    if (fareBreakdown.subtotal < minimumFare) {
      fareBreakdown.subtotal = minimumFare;
      fareBreakdown.breakdown.minimumFareApplied = true;
    }
    
    // 3. Calculate night charges
    if (pricingConfig.nightCharges.enabled && (isNightTimeParam || isNightTime(pricingConfig.nightCharges))) {
      const nightChargeFixed = pricingConfig.nightCharges.fixedAmount;
      const nightChargeMultiplied = fareBreakdown.subtotal * (pricingConfig.nightCharges.multiplier - 1);
      
      // Use the higher of fixed amount or multiplier
      fareBreakdown.nightCharges = Math.max(nightChargeFixed, nightChargeMultiplied);
      fareBreakdown.breakdown.nightChargeType = nightChargeFixed > nightChargeMultiplied ? 'fixed' : 'multiplier';
    }
    
    // 4. Calculate surge pricing
    if (pricingConfig.surgePricing.enabled && demandRatio > 1) {
      const surgeMultiplier = calculateSurgeMultiplier(demandRatio, pricingConfig.surgePricing);
      if (surgeMultiplier > 1) {
        fareBreakdown.surgeCharges = fareBreakdown.subtotal * (surgeMultiplier - 1);
        fareBreakdown.breakdown.surgeMultiplier = surgeMultiplier;
        fareBreakdown.breakdown.demandRatio = demandRatio;
      }
    }
    
    // 5. Calculate waiting charges
    if (waitingMinutes > 0) {
      fareBreakdown.waitingCharges = calculateWaitingCharges(waitingMinutes, pricingConfig.waitingCharges);
    }
    
    // 6. Calculate cancellation charges (if applicable)
    if (isCancelled) {
      fareBreakdown.cancellationCharges = calculateCancellationCharges(tripProgress, cancellationReason, pricingConfig.cancellationCharges);
    }
    
    // 7. Calculate platform fee
    const fareBeforePlatformFee = fareBreakdown.subtotal + 
                                  fareBreakdown.nightCharges + 
                                  fareBreakdown.surgeCharges + 
                                  fareBreakdown.waitingCharges;
    
    fareBreakdown.platformFee = (fareBeforePlatformFee * pricingConfig.platformFee.percentage) / 100;
    fareBreakdown.breakdown.platformFeeBreakdown = {
      driverShare: (fareBreakdown.platformFee * pricingConfig.platformFee.driverShare) / pricingConfig.platformFee.percentage,
      customerShare: (fareBreakdown.platformFee * pricingConfig.platformFee.customerShare) / pricingConfig.platformFee.percentage
    };
    
    // 8. Calculate VAT
    if (pricingConfig.vat.enabled) {
      const fareBeforeVAT = fareBeforePlatformFee + fareBreakdown.platformFee;
      fareBreakdown.vatAmount = (fareBeforeVAT * pricingConfig.vat.percentage) / 100;
    }
    
    // 9. Calculate total fare
    fareBreakdown.totalFare = fareBreakdown.subtotal + 
                             fareBreakdown.nightCharges + 
                             fareBreakdown.surgeCharges + 
                             fareBreakdown.waitingCharges + 
                             fareBreakdown.platformFee + 
                             fareBreakdown.vatAmount + 
                             fareBreakdown.cancellationCharges;
    
    // Round to 2 decimal places
    Object.keys(fareBreakdown).forEach(key => {
      if (typeof fareBreakdown[key] === 'number') {
        fareBreakdown[key] = Math.round(fareBreakdown[key] * 100) / 100;
      }
    });
    
    return fareBreakdown;
    
  } catch (error) {
    throw new Error(`Comprehensive fare calculation error: ${error.message}`);
  }
};

// Export functions
export {
  calculateComprehensiveFare,
  calculateCancellationCharges,
  calculateWaitingCharges,
  calculateFreeStayMinutes,
  shouldShowRefreshmentAlert,
  calculateRefreshmentCharges,
  calculateCarRecoveryFreeStay
};