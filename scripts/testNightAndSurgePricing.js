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

// Test night charges and surge pricing
const testNightAndSurgePricing = async () => {
  try {
    // Get the comprehensive pricing configuration
    const pricingConfig = await ComprehensivePricing.findOne({ isActive: true });
    
    if (!pricingConfig) {
      console.log('No active comprehensive pricing configuration found');
      return;
    }
    
    console.log('Found pricing configuration:', pricingConfig._id);
    
    // Test night charges and surge pricing scenarios
    const testCases = [
      {
        name: 'Car Cab - Economy - 8km - Normal time (no night charges)',
        serviceType: 'car cab',
        vehicleType: 'economy',
        distance: 8,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 12,
        isNightTime: false
      },
      {
        name: 'Car Cab - Economy - 8km - Night time (10PM-6AM)',
        serviceType: 'car cab',
        vehicleType: 'economy',
        distance: 8,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 12,
        isNightTime: true
      },
      {
        name: 'Car Cab - Economy - 8km - Surge pricing 1.5x',
        serviceType: 'car cab',
        vehicleType: 'economy',
        distance: 8,
        routeType: 'one_way',
        demandRatio: 2, // 2x demand triggers 1.5x surge
        waitingMinutes: 0,
        estimatedDuration: 12,
        isNightTime: false
      },
      {
        name: 'Car Cab - Economy - 8km - Surge pricing 2.0x',
        serviceType: 'car cab',
        vehicleType: 'economy',
        distance: 8,
        routeType: 'one_way',
        demandRatio: 3, // 3x demand triggers 2.0x surge
        waitingMinutes: 0,
        estimatedDuration: 12,
        isNightTime: false
      },
      {
        name: 'Car Cab - Economy - 8km - Night time + Surge pricing 1.5x',
        serviceType: 'car cab',
        vehicleType: 'economy',
        distance: 8,
        routeType: 'one_way',
        demandRatio: 2,
        waitingMinutes: 0,
        estimatedDuration: 12,
        isNightTime: true
      },
      {
        name: 'Bike - 5km - Night time',
        serviceType: 'bike',
        vehicleType: 'standard',
        distance: 5,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 15,
        isNightTime: true
      },
      {
        name: 'Car Recovery - Flatbed - 12km - Night time + Surge',
        serviceType: 'car recovery',
        vehicleType: 'flatbed',
        distance: 12,
        routeType: 'one_way',
        demandRatio: 2,
        waitingMinutes: 0,
        estimatedDuration: 30,
        isNightTime: true
      }
    ];
    
    console.log('\n=== NIGHT CHARGES & SURGE PRICING TEST RESULTS ===\n');
    
    for (const testCase of testCases) {
      console.log(`Testing: ${testCase.name}`);
      console.log('Parameters:', {
        serviceType: testCase.serviceType,
        vehicleType: testCase.vehicleType,
        distance: `${testCase.distance}km`,
        routeType: testCase.routeType,
        demandRatio: testCase.demandRatio,
        waitingMinutes: testCase.waitingMinutes,
        isNightTime: testCase.isNightTime
      });
      
      try {
        const fareResult = await calculateComprehensiveFare(testCase);
        
        console.log('Result:', {
          totalFare: `AED ${fareResult.totalFare}`,
          baseFare: `AED ${fareResult.baseFare}`,
          distanceFare: `AED ${fareResult.distanceFare}`,
          platformFee: `AED ${fareResult.platformFee}`,
          nightCharges: fareResult.nightCharges ? `AED ${fareResult.nightCharges}` : 'None',
          surgeCharges: fareResult.surgeCharges ? `AED ${fareResult.surgeCharges}` : 'None',
          surgeMultiplier: fareResult.breakdown?.surgeMultiplier || 'None',
          demandRatio: fareResult.breakdown?.demandRatio || 'None',
          waitingCharges: fareResult.waitingCharges ? `AED ${fareResult.waitingCharges}` : 'None',
          vat: `AED ${fareResult.vatAmount}`,
          currency: fareResult.currency
        });
        
        // Show breakdown for better understanding
        if (fareResult.breakdown) {
          console.log('Breakdown Details:', {
            subtotal: `AED ${fareResult.subtotal}`,
            nightChargesApplied: fareResult.nightCharges > 0,
            surgeApplied: fareResult.surgeCharges > 0,
            platformFeeBreakdown: fareResult.breakdown.platformFeeBreakdown
          });
        }
        
      } catch (error) {
        console.error('Error calculating fare:', error.message);
      }
      
      console.log('------------------------------------------------------------');
    }
    
    console.log('Night charges and surge pricing test completed');
    
  } catch (error) {
    console.error('Test execution error:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await testNightAndSurgePricing();
  
  console.log('Test complete');
  process.exit(0);
};

main().catch(console.error);