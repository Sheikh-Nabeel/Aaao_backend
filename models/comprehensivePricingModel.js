import mongoose from 'mongoose';

// Comprehensive pricing configuration schema
const comprehensivePricingSchema = new mongoose.Schema({
  // Base pricing structure
  baseFare: {
    amount: { type: Number, default: 50 }, // AED 50 for first 6km
    coverageKm: { type: Number, default: 6 }
  },
  
  // Per KM rates
  perKmRate: {
    afterBaseCoverage: { type: Number, default: 7.5 }, // AED 7.5/km after 6km
    cityWiseAdjustment: {
      enabled: { type: Boolean, default: true },
      aboveKm: { type: Number, default: 10 },
      adjustedRate: { type: Number, default: 5 } // AED 5/km if above 10km
    }
  },
  
  // Minimum fare
  minimumFare: { type: Number, default: 50 }, // AED 50
  
  // Platform fees
  platformFee: {
    percentage: { type: Number, default: 15 }, // 15% total
    driverShare: { type: Number, default: 7.5 }, // 7.5%
    customerShare: { type: Number, default: 7.5 } // 7.5%
  },
  
  // Cancellation charges
  cancellationCharges: {
    beforeArrival: { type: Number, default: 2 }, // AED 2
    after25PercentDistance: { type: Number, default: 5 }, // AED 5 after 25% distance
    after50PercentDistance: { type: Number, default: 5 }, // AED 5 after 50% distance
    afterArrival: { type: Number, default: 10 } // AED 10 after arrival
  },
  
  // Waiting charges
  waitingCharges: {
    freeMinutes: { type: Number, default: 5 }, // First 5 minutes free
    perMinuteRate: { type: Number, default: 2 }, // AED 2/min
    maximumCharge: { type: Number, default: 20 } // Max AED 20
  },
  
  // Night charges (10 PM - 6 AM)
  nightCharges: {
    enabled: { type: Boolean, default: true },
    startHour: { type: Number, default: 22 }, // 10 PM
    endHour: { type: Number, default: 6 }, // 6 AM
    fixedAmount: { type: Number, default: 10 }, // +AED 10
    multiplier: { type: Number, default: 1.25 } // or 1.25x
  },
  
  // Surge pricing
  surgePricing: {
    enabled: { type: Boolean, default: true },
    adminControlled: { type: Boolean, default: true },
    levels: [{
      demandRatio: { type: Number, default: 2 }, // 2x demand (100 cars, 200 customers)
      multiplier: { type: Number, default: 1.5 }
    }, {
      demandRatio: { type: Number, default: 3 }, // 3x demand (100 cars, 300 customers)
      multiplier: { type: Number, default: 2.0 }
    }]
  },
  
  // Service type specific rates
  serviceTypes: {
    carCab: {
      enabled: { type: Boolean, default: true },
      vehicleTypes: {
        economy: { 
          baseFare: { type: Number, default: 50 }, 
          perKmRate: { type: Number, default: 7.5 }
        },
        premium: { 
          baseFare: { type: Number, default: 60 }, 
          perKmRate: { type: Number, default: 9 }
        },
        luxury: { 
          baseFare: { type: Number, default: 80 }, 
          perKmRate: { type: Number, default: 12 }
        },
        xl: { 
          baseFare: { type: Number, default: 70 }, 
          perKmRate: { type: Number, default: 10 }
        },
        family: { 
          baseFare: { type: Number, default: 65 }, 
          perKmRate: { type: Number, default: 8.5 }
        }
      }
    },
    bike: {
      enabled: { type: Boolean, default: true },
      baseFare: { type: Number, default: 25 },
      perKmRate: { type: Number, default: 4 }
    },
    carRecovery: {
      flatbed: { 
        perKmRate: { type: Number, default: 3.5 } // AED 3.50/km
      },
      wheelLift: { 
        perKmRate: { type: Number, default: 3.0 } // AED 3.00/km
      },
      jumpstart: { 
        fixedRate: { type: Boolean, default: true },
        minAmount: { type: Number, default: 50 }, // AED 50-70 fixed
        maxAmount: { type: Number, default: 70 }
      }
    }
  },
  
  // Round trip features
  roundTrip: {
    freeStayMinutes: {
      enabled: { type: Boolean, default: true },
      ratePerKm: { type: Number, default: 0.5 }, // 1km = 0.5 minutes
      maximumMinutes: { type: Number, default: 60 } // Maximum free stay
    },
    refreshmentAlert: {
      enabled: { type: Boolean, default: true },
      minimumDistance: { type: Number, default: 20 }, // 20+ km
      minimumDuration: { type: Number, default: 30 } // 30+ minutes
    }
  },
  
  // VAT
  vat: {
    enabled: { type: Boolean, default: true },
    percentage: { type: Number, default: 5 } // 5% government charges
  },
  
  // Currency and general settings
  currency: { type: String, default: 'AED' },
  isActive: { type: Boolean, default: true },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for better performance
comprehensivePricingSchema.index({ isActive: 1 });
comprehensivePricingSchema.index({ 'serviceTypes.carCab.enabled': 1 });
comprehensivePricingSchema.index({ 'serviceTypes.bike.enabled': 1 });

const ComprehensivePricing = mongoose.model('ComprehensivePricing', comprehensivePricingSchema);

export default ComprehensivePricing;