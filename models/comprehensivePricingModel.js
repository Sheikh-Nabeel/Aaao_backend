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
      enabled: { type: Boolean, default: true },
      flatbed: { 
        perKmRate: { type: Number, default: 3.5 }, // AED 3.50/km
        serviceCharges: { type: Number, default: 100 } // Fixed service charges
      },
      wheelLift: { 
        perKmRate: { type: Number, default: 3.0 }, // AED 3.00/km
        serviceCharges: { type: Number, default: 80 } // Fixed service charges
      },
      jumpstart: { 
        fixedRate: { type: Boolean, default: true },
        minAmount: { type: Number, default: 50 }, // AED 50-70 fixed
        maxAmount: { type: Number, default: 70 },
        serviceCharges: { type: Number, default: 60 } // Fixed service charges
      },
      keyUnlocker: {
        serviceCharges: { type: Number, default: 75 } // Fixed service charges
      },
      platformCharges: {
        percentage: { type: Number, default: 15 }, // 15% platform charges
        split: { type: String, default: '50/50' } // 50/50 customer/service provider
      }
    },
    shiftingMovers: {
      enabled: { type: Boolean, default: true },
      // 1. Vehicle Cost
      vehicleCost: {
        startFare: { type: Number, default: 100 }, // Minimum fare AED - covers 5KM
        coverageKm: { type: Number, default: 5 }, // Base coverage in KM
        perKmRate: { type: Number, default: 15 } // Per KM fare after 5KM
      },
      // 2. Basic Service Costs (flat fee if selected)
      basicServices: {
        loadingUnloadingHelper: {
          flatFee: { type: Number, default: 20 }, // AED 20
          includeInBasicFare: { type: Boolean, default: true }, // Checkbox
          baseLimit: { type: Number, default: 3 } // Number of items covered in basic charge
        },
        packers: {
          flatFee: { type: Number, default: 20 }, // AED 20
          includeInBasicFare: { type: Boolean, default: true },
          baseLimit: { type: Number, default: 3 }
        },
        fixers: {
          flatFee: { type: Number, default: 20 }, // AED 20
          includeInBasicFare: { type: Boolean, default: true },
          baseLimit: { type: Number, default: 3 }
        }
      },
      // 3. Pickup Location Policy
      pickupLocationPolicy: {
        groundFloor: {
          extraCharge: { type: Number, default: 0 } // No extra charge
        },
        stairs: {
          perFloorFare: {
            bed: { type: Number, default: 5 }, // AED 5 per floor per bed
            fridge: { type: Number, default: 15 }, // AED 15 per floor per fridge
            sofa: { type: Number, default: 8 },
            table: { type: Number, default: 4 },
            chair: { type: Number, default: 2 },
            wardrobe: { type: Number, default: 10 },
            washingMachine: { type: Number, default: 12 },
            tv: { type: Number, default: 6 },
            microwave: { type: Number, default: 3 },
            other: { type: Number, default: 5 }
          }
        },
        lift: {
          minorCharge: {
            bed: { type: Number, default: 5 }, // AED 5 per item
            fridge: { type: Number, default: 7 }, // AED 7 per item
            sofa: { type: Number, default: 6 },
            table: { type: Number, default: 3 },
            chair: { type: Number, default: 2 },
            wardrobe: { type: Number, default: 8 },
            washingMachine: { type: Number, default: 9 },
            tv: { type: Number, default: 4 },
            microwave: { type: Number, default: 2 },
            other: { type: Number, default: 4 }
          },
          baseLimit: { type: Number, default: 1 }, // Base covers Ground +1 Floor
          baseCoverage: { type: String, default: 'Ground +1 Floor' }
        }
      },
      // 4. Drop-off Location Policy (Same as Pickup)
      dropoffLocationPolicy: {
        groundFloor: {
          extraCharge: { type: Number, default: 0 }
        },
        stairs: {
          perFloorFare: {
            bed: { type: Number, default: 5 },
            fridge: { type: Number, default: 15 },
            sofa: { type: Number, default: 8 },
            table: { type: Number, default: 4 },
            chair: { type: Number, default: 2 },
            wardrobe: { type: Number, default: 10 },
            washingMachine: { type: Number, default: 12 },
            tv: { type: Number, default: 6 },
            microwave: { type: Number, default: 3 },
            other: { type: Number, default: 5 }
          }
        },
        lift: {
          minorCharge: {
            bed: { type: Number, default: 5 },
            fridge: { type: Number, default: 7 },
            sofa: { type: Number, default: 6 },
            table: { type: Number, default: 3 },
            chair: { type: Number, default: 2 },
            wardrobe: { type: Number, default: 8 },
            washingMachine: { type: Number, default: 9 },
            tv: { type: Number, default: 4 },
            microwave: { type: Number, default: 2 },
            other: { type: Number, default: 4 }
          },
          baseLimit: { type: Number, default: 1 },
          baseCoverage: { type: String, default: 'Ground +1 Floor' }
        }
      },
      // 5. Packing Per Item
      packingFares: {
        bed: { type: Number, default: 15 }, // AED 15 per bed
        fridge: { type: Number, default: 10 }, // AED 10 per fridge
        sofa: { type: Number, default: 12 },
        table: { type: Number, default: 8 },
        chair: { type: Number, default: 5 },
        wardrobe: { type: Number, default: 20 },
        washingMachine: { type: Number, default: 15 },
        tv: { type: Number, default: 10 },
        microwave: { type: Number, default: 6 },
        other: { type: Number, default: 8 }
      },
      // 6. Fixing Per Item
      fixingFares: {
        bed: { type: Number, default: 20 }, // AED 20 per bed
        sofa: { type: Number, default: 15 }, // AED 15 per sofa
        table: { type: Number, default: 10 },
        chair: { type: Number, default: 8 },
        wardrobe: { type: Number, default: 25 },
        washingMachine: { type: Number, default: 30 },
        tv: { type: Number, default: 15 },
        microwave: { type: Number, default: 12 },
        fridge: { type: Number, default: 35 },
        other: { type: Number, default: 15 }
      },
      // 7. Loading/Unloading Per Item
      loadingUnloadingFares: {
        bed: { type: Number, default: 20 }, // AED 20 per bed
        sofa: { type: Number, default: 15 }, // AED 15 per sofa
        table: { type: Number, default: 10 },
        chair: { type: Number, default: 5 },
        wardrobe: { type: Number, default: 18 },
        washingMachine: { type: Number, default: 25 },
        tv: { type: Number, default: 12 },
        microwave: { type: Number, default: 8 },
        fridge: { type: Number, default: 30 },
        other: { type: Number, default: 12 }
      }
    }
  },
  
  // Appointment-based services (Workshop, Tyre Shop, etc.)
  appointmentServices: {
    enabled: { type: Boolean, default: true },
    fixedAppointmentFee: { type: Number, default: 5 }, // AED 5 per successful appointment
    confirmationSystem: {
      enabled: { type: Boolean, default: true },
      surveyTimeoutHours: { type: Number, default: 24 }, // 24 hours for survey completion
      autoGpsCheckIn: { type: Boolean, default: true }, // GPS check-in when provider starts appointment
      ratingThreshold: { type: Number, default: 3 }, // Minimum rating for successful appointment
      disputeHandling: {
        enabled: { type: Boolean, default: true },
        adminReviewRequired: { type: Boolean, default: true }
      }
    },
    customerSurvey: {
      questions: [{
        question: { type: String, default: 'How was your experience with [Service Provider Name]?' },
        options: [{ type: String, default: 'Good' }, { type: String, default: 'Bad' }, { type: String, default: 'Didn\'t Visit' }]
      }],
      ratingRequired: { type: Boolean, default: true },
      feedbackOptional: { type: Boolean, default: true }
    },
    providerSurvey: {
      questions: [{
        question: { type: String, default: 'How was [Customer Name]? Behavior?' },
        options: [{ type: String, default: 'Good' }, { type: String, default: 'Bad' }, { type: String, default: 'Didn\'t Meet Yet' }]
      }],
      ratingRequired: { type: Boolean, default: true },
      feedbackOptional: { type: Boolean, default: true }
    },
    successCriteria: {
      bothConfirmGood: { type: Boolean, default: true }, // Both confirm "Good"
      oneConfirmsService: { type: Boolean, default: true }, // At least one confirms service happened
      noShowBoth: { type: Boolean, default: false }, // Both select "Didn't Visit/Didn't Meet Yet" = no fee
      conflictResolution: { type: String, default: 'admin_review' } // admin_review, auto_decline, auto_approve
    },
    penaltySystem: {
      enabled: { type: Boolean, default: true },
      tooManyNoShows: {
        threshold: { type: Number, default: 3 }, // 3 no-shows
        penalty: { type: String, default: 'lower_visibility' } // lower_visibility, flag_account, suspend
      },
      badRatings: {
        threshold: { type: Number, default: 2 }, // Rating below 2
        consecutiveLimit: { type: Number, default: 3 }, // 3 consecutive bad ratings
        penalty: { type: String, default: 'flag_account' }
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
comprehensivePricingSchema.index({ 'serviceTypes.carRecovery.enabled': 1 });
comprehensivePricingSchema.index({ 'serviceTypes.shiftingMovers.enabled': 1 });
comprehensivePricingSchema.index({ 'appointmentServices.enabled': 1 });

const ComprehensivePricing = mongoose.model('ComprehensivePricing', comprehensivePricingSchema);

export default ComprehensivePricing;