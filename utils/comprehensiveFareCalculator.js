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
const shouldShowRefreshmentAlert = (distance, estimatedDuration, roundTripConfig) => {
  if (!roundTripConfig.refreshmentAlert.enabled) return false;
  
  return distance >= roundTripConfig.refreshmentAlert.minimumDistance || 
         estimatedDuration >= roundTripConfig.refreshmentAlert.minimumDuration;
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
      baseFare = pricingConfig.serviceTypes.bike.baseFare;
      perKmRate = pricingConfig.serviceTypes.bike.perKmRate;
    } else if (normalizedServiceType === 'car_recovery' || serviceType === 'car recovery') {
      const recoveryConfig = pricingConfig.serviceTypes.carRecovery;
      
      if (vehicleType === 'jumpstart' && recoveryConfig.jumpstart.fixedRate) {
        // Fixed rate for jumpstart
        baseFare = recoveryConfig.jumpstart.minAmount;
        fareBreakdown.baseFare = baseFare;
        fareBreakdown.distanceFare = 0;
      } else if (recoveryConfig[vehicleType]) {
        perKmRate = recoveryConfig[vehicleType].perKmRate;
        baseFare = pricingConfig.baseFare.amount; // Use default base fare
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
    
    // Apply route type multiplier for round trips
    if (routeType === 'round_trip' || routeType === 'two_way') {
      fareBreakdown.subtotal *= 1.8; // 80% additional for return trip
      
      // Calculate free stay minutes
      const freeStayMinutes = calculateFreeStayMinutes(distance, pricingConfig.roundTrip);
      if (freeStayMinutes > 0) {
        fareBreakdown.breakdown.freeStayMinutes = freeStayMinutes;
      }
      
      // Check for refreshment alert
      if (shouldShowRefreshmentAlert(distance, estimatedDuration, pricingConfig.roundTrip)) {
        fareBreakdown.alerts.push('Refreshment recommended for long trip');
      }
    }
    
    // 2. Apply minimum fare
    if (fareBreakdown.subtotal < pricingConfig.minimumFare) {
      fareBreakdown.subtotal = pricingConfig.minimumFare;
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
  shouldShowRefreshmentAlert
};