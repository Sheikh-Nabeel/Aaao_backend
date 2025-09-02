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
      },
      // Minimum fare for car cab service
      minimumFare: { type: Number, default: 40 } // AED 40 for car cabs
    },
    bike: {
      enabled: { type: Boolean, default: true },
      vehicleTypes: {
        economy: { 
          baseFare: { type: Number, default: 20 }, 
          perKmRate: { type: Number, default: 3 }
        },
        premium: { 
          baseFare: { type: Number, default: 25 }, 
          perKmRate: { type: Number, default: 4 }
        },
        vip: { 
          baseFare: { type: Number, default: 30 }, 
          perKmRate: { type: Number, default: 5 }
        }
      },
      // Minimum fare for bike service
      minimumFare: { type: Number, default: 15 }, // AED 15 for bikes
      // Fallback for backward compatibility
      baseFare: { type: Number, default: 25 },
      perKmRate: { type: Number, default: 4 }
    },
    carRecovery: {
      enabled: { type: Boolean, default: true },
      
      // Base fare structure (applies to all types except roadside assistance and winching)
      baseFare: {
        amount: { type: Number, default: 50 }, // AED 50 for first 6km
        coverageKm: { type: Number, default: 6 }
      },
      
      // Per KM rate after base coverage
      perKmRate: {
        afterBaseCoverage: { type: Number, default: 7.5 }, // AED 7.5/km after 6km
        cityWiseAdjustment: {
          enabled: { type: Boolean, default: true },
          aboveKm: { type: Number, default: 10 },
          adjustedRate: { type: Number, default: 5 } // AED 5/km if trip >10km in specific country
        }
      },
      
      // Minimum fare
      minimumFare: { type: Number, default: 50 }, // If total trip < 6km → still charge AED 50
      
      // Platform fee (split logic)
      platformFee: {
        percentage: { type: Number, default: 15 }, // Deduct 15% of total fare
        driverShare: { type: Number, default: 7.5 }, // 7.5% → driver side
        customerShare: { type: Number, default: 7.5 } // 7.5% → customer side
      },
      
      // Cancellation logic
      cancellationCharges: {
        beforeArrival: { type: Number, default: 2 }, // AED 2 (only apply once rider has crossed 25% of driver's distance)
        after50PercentDistance: { type: Number, default: 5 }, // If driver covered ≥ 50% of way → AED 5
        afterArrival: { type: Number, default: 10 } // After driver arrived at pickup → AED 10
      },
      
      // Waiting charges
      waitingCharges: {
        freeMinutes: { type: Number, default: 5 }, // Free wait: 5 minutes
        perMinuteRate: { type: Number, default: 2 }, // After 5 mins → AED 2/minute
        maximumCharge: { type: Number, default: 20 }, // Stop charging after AED 20 cap
        driverControlPopup: {
          enabled: { type: Boolean, default: true },
          popupTitle: { type: String, default: "Free Stay Time Ended – Select Action" },
          driverOptions: {
            continueNoCharges: {
              label: { type: String, default: "Continue – No Overtime Charges" },
              description: { type: String, default: "Driver is okay to still wait, overtime won't start" }
            },
            startOvertimeCharges: {
              label: { type: String, default: "Start Overtime Charges" },
              description: { type: String, default: "Driver wants the system to begin charging the customer" }
            }
          },
          failsafeCondition: {
            autoStart: { type: Boolean, default: false }, // If driver doesn't press any button, overtime does NOT start automatically
            description: { type: String, default: "System keeps waiting until driver makes a choice" }
          }
        }
      },
      
      // Night charges (22:00–06:00)
      nightCharges: {
        enabled: { type: Boolean, default: true },
        startHour: { type: Number, default: 22 }, // 22:00
        endHour: { type: Number, default: 6 }, // 06:00
        fixedAmount: { type: Number, default: 10 }, // add AED 10
        multiplier: { type: Number, default: 1.25 }, // OR apply multiplier 1.25x
        adminConfigurable: { type: Boolean, default: true }
      },
      
      // Surge pricing (Admin Control)
      surgePricing: {
        enabled: { type: Boolean, default: true },
        adminControlled: { type: Boolean, default: true },
        noSurge: { type: Boolean, default: true }, // Admin checkbox: No Surge
        surge1_5x: { type: Boolean, default: false }, // Admin checkbox: 1.5x
        surge2_0x: { type: Boolean, default: false }, // Admin checkbox: 2.0x
        levels: [{
          demandRatio: { type: Number, default: 2 }, // 1.5x if demand = 2x cars
          multiplier: { type: Number, default: 1.5 }
        }, {
          demandRatio: { type: Number, default: 3 }, // 2.0x if demand = 3x cars
          multiplier: { type: Number, default: 2.0 }
        }]
      },
      
      // Service types (Winching & Roadside assistance)
      serviceTypes: {
        winching: {
          enabled: { type: Boolean, default: true },
          minimumChargesForDriverArriving: { type: Number, default: 5 }, // AED 5
          convenienceFee: {
            options: { type: [Number], default: [50, 100] }, // 50, 100... as per service based
            default: { type: Number, default: 50 }
          },
          subCategories: {
            flatbed: { 
              enabled: { type: Boolean, default: true },
              convenienceFee: { type: Number, default: 100 }
            },
            wheelLift: { 
              enabled: { type: Boolean, default: true },
              convenienceFee: { type: Number, default: 80 }
            },
            heavyDutyTowing: {
              enabled: { type: Boolean, default: true },
              convenienceFee: { type: Number, default: 150 }
            }
          }
        },
        roadsideAssistance: {
          enabled: { type: Boolean, default: true },
          minimumChargesForDriverArriving: { type: Number, default: 5 }, // AED 5
          convenienceFee: {
            options: { type: [Number], default: [50, 100] }, // 50, 100... as per service based
            default: { type: Number, default: 50 }
          },
          subCategories: {
            jumpstart: { 
              enabled: { type: Boolean, default: true },
              convenienceFee: { type: Number, default: 60 }
            },
            tirePunctureRepair: {
              enabled: { type: Boolean, default: true },
              convenienceFee: { type: Number, default: 70 }
            },
            fuelDelivery: {
              enabled: { type: Boolean, default: true },
              convenienceFee: { type: Number, default: 80 }
            },
            batteryReplacement: {
              enabled: { type: Boolean, default: true },
              convenienceFee: { type: Number, default: 90 }
            }
          }
        },
        keyUnlockerServices: {
          enabled: { type: Boolean, default: true },
          minimumChargesForDriverArriving: { type: Number, default: 5 }, // AED 5
          convenienceFee: { type: Number, default: 75 }
        }
      },
      
      // Refreshment Alert (for rides >20km OR >30 minutes)
      refreshmentAlert: {
        enabled: { type: Boolean, default: true },
        minimumDistance: { type: Number, default: 20 }, // >20 km
        minimumDuration: { type: Number, default: 30 }, // >30 minutes
        perMinuteCharges: { type: Number, default: 1 }, // AED 1/minute
        per5MinCharges: { type: Number, default: 5 }, // AED 5/5min charges
        maximumCharges: { type: Number, default: 30 }, // Maximum 30 minutes stopped over time charges
        popupTitle: { type: String, default: "Free Stay Time Ended – Select Action" },
        driverOptions: {
          continueNoCharges: { type: String, default: "Continue – No Overtime Charges" },
          startOvertimeCharges: { type: String, default: "Start Overtime Charges" }
        },
        failsafeCondition: {
          autoStart: { type: Boolean, default: false }, // If driver does not press any button, overtime does NOT start automatically
          waitForDriverChoice: { type: Boolean, default: true }
        }
      },
      
      // Free Stay Minutes (Round Trips only)
      freeStayMinutes: {
        enabled: { type: Boolean, default: true },
        ratePerKm: { type: Number, default: 0.5 }, // 0.5 min per km of trip
        maximumCap: { type: Number, default: 60 }, // Maximum cap (configurable by admin)
        notifications: {
          fiveMinRemaining: { type: Boolean, default: true }, // Auto push notification on 5 min remaining
          freeStayOver: { type: Boolean, default: true } // Push notification for free stay minutes over
        }
      },
      
      // VAT (country based)
      vat: {
        enabled: { type: Boolean, default: true },
        countryBased: { type: Boolean, default: true },
        percentage: { type: Number, default: 5 }, // Apply country based VAT on total fare
        showTotalIncludingTax: { type: Boolean, default: true } // Show Fair Total Amount including tax
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