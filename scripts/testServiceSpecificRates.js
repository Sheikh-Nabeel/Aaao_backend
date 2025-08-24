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

// Test service-specific rates
const testServiceSpecificRates = async () => {
  try {
    // Get the comprehensive pricing configuration
    const pricingConfig = await ComprehensivePricing.findOne({ isActive: true });
    
    if (!pricingConfig) {
      console.log('No active comprehensive pricing configuration found');
      return;
    }
    
    console.log('Found pricing configuration:', pricingConfig._id);
    console.log('\nCar Recovery Service Rates:');
    console.log('- Flatbed:', pricingConfig.serviceTypes.carRecovery.flatbed);
    console.log('- Wheel Lift:', pricingConfig.serviceTypes.carRecovery.wheelLift);
    console.log('- Jumpstart:', pricingConfig.serviceTypes.carRecovery.jumpstart);
    
    // Test service-specific rate scenarios
    const testCases = [
      {
        name: 'Car Recovery - Flatbed - 5km (AED 3.50/km)',
        serviceType: 'car recovery',
        vehicleType: 'flatbed',
        distance: 5,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 15
      },
      {
        name: 'Car Recovery - Flatbed - 12km (AED 3.50/km)',
        serviceType: 'car recovery',
        vehicleType: 'flatbed',
        distance: 12,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 30
      },
      {
        name: 'Car Recovery - Wheel Lift - 5km (AED 3.00/km)',
        serviceType: 'car recovery',
        vehicleType: 'wheelLift',
        distance: 5,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 15
      },
      {
        name: 'Car Recovery - Wheel Lift - 12km (AED 3.00/km)',
        serviceType: 'car recovery',
        vehicleType: 'wheelLift',
        distance: 12,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 30
      },
      {
        name: 'Car Recovery - Jumpstart - 5km (Fixed AED 50-70)',
        serviceType: 'car recovery',
        vehicleType: 'jumpstart',
        distance: 5,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 15
      },
      {
        name: 'Car Recovery - Jumpstart - 12km (Fixed AED 50-70)',
        serviceType: 'car recovery',
        vehicleType: 'jumpstart',
        distance: 12,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 30
      },
      {
        name: 'Car Recovery - Flatbed - 20km with night charges',
        serviceType: 'car recovery',
        vehicleType: 'flatbed',
        distance: 20,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 45,
        isNightTime: true
      },
      {
        name: 'Car Recovery - Wheel Lift - 15km with surge pricing',
        serviceType: 'car recovery',
        vehicleType: 'wheelLift',
        distance: 15,
        routeType: 'one_way',
        demandRatio: 2, // 1.5x surge
        waitingMinutes: 0,
        estimatedDuration: 35
      },
      {
        name: 'Car Recovery - Jumpstart - 8km with waiting charges',
        serviceType: 'car recovery',
        vehicleType: 'jumpstart',
        distance: 8,
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 15, // 10 minutes of waiting charges
        estimatedDuration: 25
      }
    ];
    
    console.log('\n=== SERVICE-SPECIFIC RATES TEST RESULTS ===\n');
    
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
          surgeCharges: fareResult.surgeCharges ? `AED ${fareResult.surgeCharges}` : 'None',
          waitingCharges: fareResult.waitingCharges ? `AED ${fareResult.waitingCharges}` : 'None',
          vat: `AED ${fareResult.vatAmount}`,
          currency: fareResult.currency
        });
        
        // Calculate expected rates for verification
        let expectedRate = 'N/A';
        if (testCase.vehicleType === 'flatbed') {
          expectedRate = 'AED 3.50/km';
        } else if (testCase.vehicleType === 'wheelLift') {
          expectedRate = 'AED 3.00/km';
        } else if (testCase.vehicleType === 'jumpstart') {
          expectedRate = 'Fixed AED 50-70';
        }
        
        console.log('Rate Verification:', {
          expectedRate: expectedRate,
          actualDistanceFare: `AED ${fareResult.distanceFare}`,
          perKmCalculation: testCase.vehicleType !== 'jumpstart' ? 
            `${testCase.distance}km × ${expectedRate.split(' ')[1]} = AED ${(testCase.distance * parseFloat(expectedRate.split(' ')[1])).toFixed(2)}` : 
            'Fixed rate applied'
        });
        
      } catch (error) {
        console.error('Error calculating fare:', error.message);
      }
      
      console.log('------------------------------------------------------------');
    }
    
    console.log('Service-specific rates test completed');
    
  } catch (error) {
    console.error('Test execution error:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await testServiceSpecificRates();
  
  console.log('Test complete');
  process.exit(0);
};

main().catch(console.error);