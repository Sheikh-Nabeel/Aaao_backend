import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { calculateComprehensiveFare } from '../utils/comprehensiveFareCalculator.js';
import ComprehensivePricing from '../models/comprehensivePricingModel.js';

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

// Test fare calculation
const testFareCalculation = async () => {
  try {
    // Get the comprehensive pricing configuration
    const pricingConfig = await ComprehensivePricing.findOne({ isActive: true });
    
    if (!pricingConfig) {
      console.log('No active comprehensive pricing configuration found');
      return;
    }
    
    console.log('Found pricing configuration:', pricingConfig._id);
    
    // Test different scenarios
    const testCases = [
      {
        name: 'Car Cab - Economy - 8km (2km over base)',
        serviceType: 'car cab',
        vehicleType: 'economy',
        distance: 8,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 12
      },
      {
        name: 'Car Cab - Premium - 15km with night charges',
        serviceType: 'car cab',
        vehicleType: 'premium',
        distance: 15,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 22,
        isNightTime: true
      },
      {
        name: 'Bike - 5km round trip',
        serviceType: 'bike',
        vehicleType: 'standard',
        distance: 5,
        routeType: 'round_trip',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 15
      },
      {
        name: 'Car Recovery - Flatbed - 12km',
        serviceType: 'car recovery',
        vehicleType: 'flatbed',
        distance: 12,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 30
      },
      {
        name: 'Car Cab - Economy - 8km with surge pricing (1.5x)',
        serviceType: 'car cab',
        vehicleType: 'economy',
        distance: 8,
        routeType: 'one_way',
        demandRatio: 1.5,
        waitingMinutes: 0,
        estimatedDuration: 12
      },
      {
        name: 'Car Cab - Economy - 8km with waiting charges (10 minutes)',
        serviceType: 'car cab',
        vehicleType: 'economy',
        distance: 8,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 10,
        estimatedDuration: 12
      }
    ];
    
    console.log('\n=== FARE CALCULATION TEST RESULTS ===\n');
    
    for (const testCase of testCases) {
      console.log(`Testing: ${testCase.name}`);
      console.log('Parameters:', {
        serviceType: testCase.serviceType,
        vehicleType: testCase.vehicleType,
        distance: `${testCase.distance}km`,
        routeType: testCase.routeType,
        demandRatio: testCase.demandRatio,
        waitingMinutes: testCase.waitingMinutes,
        isNightTime: testCase.isNightTime || false
      });
      
      try {
        const fareResult = await calculateComprehensiveFare(testCase);
        
        console.log('Result:', {
          totalFare: `AED ${fareResult.totalFare}`,
          baseFare: `AED ${fareResult.baseFare}`,
          distanceFare: `AED ${fareResult.distanceFare}`,
          platformFee: `AED ${fareResult.platformFee}`,
          nightCharges: fareResult.nightCharges ? `AED ${fareResult.nightCharges}` : 'None',
          surgeMultiplier: fareResult.surgeMultiplier || 'None',
          waitingCharges: fareResult.waitingCharges ? `AED ${fareResult.waitingCharges}` : 'None',
          vat: `AED ${fareResult.vatAmount}`,
          currency: fareResult.currency
        });
        
        if (fareResult.alerts && fareResult.alerts.length > 0) {
          console.log('Alerts:', fareResult.alerts);
        }
        
      } catch (error) {
        console.error('Error calculating fare:', error.message);
      }
      
      console.log('\n' + '-'.repeat(60) + '\n');
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
};

// Main function
const main = async () => {
  await connectDB();
  await testFareCalculation();
  
  console.log('Test completed');
  process.exit(0);
};

main().catch(console.error);