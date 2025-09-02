import mongoose from 'mongoose';
import ComprehensivePricing from '../models/comprehensivePricingModel.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Initialize comprehensive pricing configuration
const initializePricing = async () => {
  try {
    // Check if configuration already exists
    const existingConfig = await ComprehensivePricing.findOne({ isActive: true });
    
    if (existingConfig) {
      console.log('Comprehensive pricing configuration already exists');
      return;
    }
    
    // Create new comprehensive pricing configuration
    const pricingConfig = new ComprehensivePricing({
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
        levels: [
          {
            demandRatio: 2, // 2x demand (100 cars, 200 customers)
            multiplier: 1.5
          },
          {
            demandRatio: 3, // 3x demand (100 cars, 300 customers)
            multiplier: 2.0
          }
        ]
      },
      
      // Service type specific rates
      serviceTypes: {
        carCab: {
          enabled: true,
          vehicleTypes: {
            economy: { baseFare: 50, perKmRate: 7.5 },
            premium: { baseFare: 60, perKmRate: 9 },
            luxury: { baseFare: 80, perKmRate: 12 },
            xl: { baseFare: 70, perKmRate: 10 },
            family: { baseFare: 65, perKmRate: 8.5 }
          }
        },
        bike: {
          enabled: true,
          vehicleTypes: {
            economy: { baseFare: 20, perKmRate: 3 },
            premium: { baseFare: 25, perKmRate: 4 },
            vip: { baseFare: 30, perKmRate: 5 }
          },
          // Fallback for backward compatibility
          baseFare: 25,
          perKmRate: 4
        },
        carRecovery: {
          flatbed: { perKmRate: 3.5 }, // AED 3.50/km
          wheelLift: { perKmRate: 3.0 }, // AED 3.00/km
          jumpstart: { 
            fixedRate: true,
            minAmount: 50, // AED 50-70 fixed
            maxAmount: 70
          }
        }
      },
      
      // Round trip features
      roundTrip: {
        freeStayMinutes: {
          enabled: true,
          ratePerKm: 0.5, // 1km = 0.5 minutes
          maximumMinutes: 60 // Maximum free stay
        },
        refreshmentAlert: {
          enabled: true,
          minimumDistance: 20, // 20+ km
          minimumDuration: 30 // 30+ minutes
        }
      },
      
      // VAT
      vat: {
        enabled: true,
        percentage: 5 // 5% government charges
      },
      
      // Currency and general settings
      currency: 'AED',
      isActive: true
    });
    
    await pricingConfig.save();
    console.log('Comprehensive pricing configuration initialized successfully');
    console.log('Configuration ID:', pricingConfig._id);
    
  } catch (error) {
    console.error('Error initializing pricing configuration:', error);
  }
};

// Export the function for use in tests
export { initializePricing as initializeComprehensivePricing };

// Main execution
const main = async () => {
  await connectDB();
  await initializePricing();
  
  console.log('Initialization complete');
  process.exit(0);
};

// Run the script
main().catch(error => {
  console.error('Script execution error:', error);
  process.exit(1);
});