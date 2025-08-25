import mongoose from 'mongoose';
import ComprehensivePricing from '../models/comprehensivePricingModel.js';
import connectDB from '../config/connectDB.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Car Recovery Comprehensive Pricing
const initializeCarRecoveryPricing = async () => {
  try {
    // Connect to database
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('Connected to MongoDB for Car Recovery pricing initialization');

    // Check if comprehensive pricing already exists
    console.log('🔍 Checking for existing pricing configuration...');
    let pricingConfig = await ComprehensivePricing.findOne({ isActive: true }).maxTimeMS(5000);
    
    if (!pricingConfig) {
      // Create new comprehensive pricing configuration
      pricingConfig = new ComprehensivePricing({
        // Base pricing structure
        baseFare: {
          amount: 50, // AED 50 for first 6km
          coverageKm: 6
        },
        
        // Per KM rates
        perKmRate: {
          afterBaseCoverage: 7.5, // AED 7.5/km after 6km
          cityWiseAdjustment: {
            enabled: true,
            aboveKm: 10,
            adjustedRate: 5 // AED 5/km if above 10km
          }
        },
        
        // Minimum fare
        minimumFare: 50, // AED 50
        
        // Platform fees
        platformFee: {
          percentage: 15, // 15% total
          driverShare: 7.5, // 7.5%
          customerShare: 7.5 // 7.5%
        },
        
        // Cancellation charges
        cancellationCharges: {
          beforeArrival: 2, // AED 2
          after25PercentDistance: 5, // AED 5 after 25% distance
          after50PercentDistance: 5, // AED 5 after 50% distance
          afterArrival: 10 // AED 10 after arrival
        },
        
        // Waiting charges
        waitingCharges: {
          freeMinutes: 5, // First 5 minutes free
          perMinuteRate: 2, // AED 2/min
          maximumCharge: 20 // Max AED 20
        },
        
        // Night charges (10 PM - 6 AM)
        nightCharges: {
          enabled: true,
          startHour: 22, // 10 PM
          endHour: 6, // 6 AM
          fixedAmount: 10, // +AED 10
          multiplier: 1.25 // or 1.25x
        },
        
        // Surge pricing
        surgePricing: {
          enabled: true,
          adminControlled: true,
          levels: [{
            demandRatio: 2, // 2x demand
            multiplier: 1.5
          }, {
            demandRatio: 3, // 3x demand
            multiplier: 2.0
          }]
        },
        
        // VAT
        vat: {
          enabled: true,
          percentage: 5 // 5% government charges
        },
        
        isActive: true
      });
      
      console.log('Creating new comprehensive pricing configuration...');
    }
    
    // Update car recovery specific configuration
    pricingConfig.serviceTypes.carRecovery = {
      enabled: true,
      
      // Base fare structure (applies to all types except roadside assistance and winching)
      baseFare: {
        amount: 50, // AED 50 for first 6km
        coverageKm: 6
      },
      
      // Per KM rate after base coverage
      perKmRate: {
        afterBaseCoverage: 7.5, // AED 7.5/km after 6km
        cityWiseAdjustment: {
          enabled: true,
          aboveKm: 10,
          adjustedRate: 5 // AED 5/km if trip >10km in specific country
        }
      },
      
      // Minimum fare
      minimumFare: 50, // If total trip < 6km → still charge AED 50
      
      // Platform fee (split logic)
      platformFee: {
        percentage: 15, // Deduct 15% of total fare
        driverShare: 7.5, // 7.5% → driver side
        customerShare: 7.5 // 7.5% → customer side
      },
      
      // Cancellation logic
      cancellationCharges: {
        beforeArrival: 2, // AED 2 (only apply once rider has crossed 25% of driver's distance)
        after50PercentDistance: 5, // If driver covered ≥ 50% of way → AED 5
        afterArrival: 10 // After driver arrived at pickup → AED 10
      },
      
      // Waiting charges
      waitingCharges: {
        freeMinutes: 5, // Free wait: 5 minutes
        perMinuteRate: 2, // After 5 mins → AED 2/minute
        maximumCharge: 20 // Stop charging after AED 20 cap
      },
      
      // Night charges (22:00–06:00)
      nightCharges: {
        enabled: true,
        startHour: 22, // 22:00
        endHour: 6, // 06:00
        fixedAmount: 10, // add AED 10
        multiplier: 1.25, // OR apply multiplier 1.25x
        adminConfigurable: true
      },
      
      // Surge pricing (Admin Control)
      surgePricing: {
        enabled: true,
        adminControlled: true,
        noSurge: true, // Admin checkbox: No Surge
        surge1_5x: false, // Admin checkbox: 1.5x
        surge2_0x: false, // Admin checkbox: 2.0x
        levels: [{
          demandRatio: 2, // 1.5x if demand = 2x cars
          multiplier: 1.5
        }, {
          demandRatio: 3, // 2.0x if demand = 3x cars
          multiplier: 2.0
        }]
      },
      
      // Service types (Winching & Roadside assistance)
      serviceTypes: {
        winching: {
          enabled: true,
          minimumChargesForDriverArriving: 5, // AED 5
          convenienceFee: {
            options: [50, 100], // 50, 100... as per service based
            default: 50
          },
          subCategories: {
            flatbed: { 
              enabled: true,
              convenienceFee: 100
            },
            wheelLift: { 
              enabled: true,
              convenienceFee: 80
            },
            heavyDutyTowing: {
              enabled: true,
              convenienceFee: 150
            }
          }
        },
        roadsideAssistance: {
          enabled: true,
          minimumChargesForDriverArriving: 5, // AED 5
          convenienceFee: {
            options: [50, 100], // 50, 100... as per service based
            default: 50
          },
          subCategories: {
            jumpstart: { 
              enabled: true,
              convenienceFee: 60
            },
            tirePunctureRepair: {
              enabled: true,
              convenienceFee: 70
            },
            fuelDelivery: {
              enabled: true,
              convenienceFee: 80
            },
            batteryReplacement: {
              enabled: true,
              convenienceFee: 90
            }
          }
        },
        keyUnlockerServices: {
          enabled: true,
          minimumChargesForDriverArriving: 5, // AED 5
          convenienceFee: 75
        }
      },
      
      // Refreshment Alert (for rides >20km OR >30 minutes)
      refreshmentAlert: {
        enabled: true,
        minimumDistance: 20, // >20 km
        minimumDuration: 30, // >30 minutes
        perMinuteCharges: 1, // AED 1/minute
        per5MinCharges: 5, // AED 5/5min charges
        maximumCharges: 30, // Maximum 30 minutes stopped over time charges
        popupTitle: "Free Stay Time Ended – Select Action",
        driverOptions: {
          continueNoCharges: "Continue – No Overtime Charges",
          startOvertimeCharges: "Start Overtime Charges"
        },
        failsafeCondition: {
          autoStart: false, // If driver does not press any button, overtime does NOT start automatically
          waitForDriverChoice: true
        }
      },
      
      // Free Stay Minutes (Round Trips only)
      freeStayMinutes: {
        enabled: true,
        ratePerKm: 0.5, // 0.5 min per km of trip
        maximumCap: 60, // Maximum cap (configurable by admin)
        notifications: {
          fiveMinRemaining: true, // Auto push notification on 5 min remaining
          freeStayOver: true // Push notification for free stay minutes over
        }
      },
      
      // VAT (country based)
      vat: {
        enabled: true,
        countryBased: true,
        percentage: 5, // Apply country based VAT on total fare
        showTotalIncludingTax: true // Show Fair Total Amount including tax
      }
    };
    
    // Save the configuration
    await pricingConfig.save();
    
    console.log('✅ Car Recovery comprehensive pricing initialized successfully!');
    console.log('\n📋 Car Recovery Pricing Features Configured:');
    console.log('   • Base Fare: AED 50 for first 6km');
    console.log('   • Per KM Rate: AED 7.5/km after 6km');
    console.log('   • City-wise adjustment: AED 5/km if trip >10km');
    console.log('   • Platform Fee: 15% (7.5% driver + 7.5% customer)');
    console.log('   • Cancellation Charges: AED 2-10 based on progress');
    console.log('   • Waiting Charges: 5 min free, then AED 2/min (max AED 20)');
    console.log('   • Night Charges: AED 10 or 1.25x multiplier (22:00-06:00)');
    console.log('   • Surge Pricing: 1.5x-2.0x based on demand');
    console.log('   • Winching Services: AED 5 minimum + convenience fees');
    console.log('   • Roadside Assistance: AED 5 minimum + convenience fees');
    console.log('   • Key Unlocker: AED 5 minimum + AED 75 convenience fee');
    console.log('   • Refreshment Alert: >20km or >30min trips');
    console.log('   • Free Stay: 0.5min/km for round trips (max 60min)');
    console.log('   • VAT: 5% country-based tax');
    
    return pricingConfig;
    
  } catch (error) {
    console.error('❌ Error initializing Car Recovery pricing:', error.message);
    throw error;
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the initialization if this file is executed directly
if (process.argv[1] && process.argv[1].endsWith('initializeCarRecoveryPricing.js')) {
  initializeCarRecoveryPricing()
    .then(() => {
      console.log('\n🎉 Car Recovery pricing initialization completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Initialization failed:', error);
      process.exit(1);
    });
}

export default initializeCarRecoveryPricing;