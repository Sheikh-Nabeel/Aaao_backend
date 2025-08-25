import { calculateComprehensiveFare, calculateFreeStayMinutes, shouldShowRefreshmentAlert } from '../utils/comprehensiveFareCalculator.js';
import { initializeComprehensivePricing } from './initializeComprehensivePricing.js';
import ComprehensivePricing from '../models/comprehensivePricingModel.js';

async function testRoundTripFeatures() {
  console.log('\n=== Testing Round Trip Features ===\n');
  
  // Initialize pricing configuration
  const pricingConfig = await initializeComprehensivePricing();
  
  const testCases = [
    {
      name: 'Car Cab - 10km Round Trip - Free Stay Minutes',
      serviceType: 'car cab',
      vehicleType: 'carCab',
      distance: 10,
      routeType: 'round_trip',
      demandRatio: 1,
      waitingMinutes: 0,
      isNightTime: false,
      estimatedDuration: 25 // minutes
    },
    {
      name: 'Bike - 25km Round Trip - Refreshment Alert',
      serviceType: 'bike',
      vehicleType: 'bike',
      distance: 25,
      routeType: 'round_trip',
      demandRatio: 1,
      waitingMinutes: 0,
      isNightTime: false,
      estimatedDuration: 35 // minutes
    },
    {
      name: 'Car Recovery - Flatbed - 15km Round Trip',
      serviceType: 'car recovery',
      vehicleType: 'flatbed',
      distance: 15,
      routeType: 'round_trip',
      demandRatio: 1,
      waitingMinutes: 0,
      isNightTime: false,
      estimatedDuration: 30 // minutes
    },
    {
      name: 'Car Cab - 30km Round Trip - Long Distance Alert',
      serviceType: 'car cab',
      vehicleType: 'carCab',
      distance: 30,
      routeType: 'round_trip',
      demandRatio: 1,
      waitingMinutes: 0,
      isNightTime: false,
      estimatedDuration: 45 // minutes
    },
    {
      name: 'Car Cab - 5km One Way - No Round Trip Features',
      serviceType: 'car cab',
      vehicleType: 'carCab',
      distance: 5,
      routeType: 'one_way',
      demandRatio: 1,
      waitingMinutes: 0,
      isNightTime: false,
      estimatedDuration: 15 // minutes
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`------------------------------------------------------------`);
    console.log(`Testing: ${testCase.name}`);
    console.log('Parameters:', {
      serviceType: testCase.serviceType,
      vehicleType: testCase.vehicleType,
      distance: `${testCase.distance}km`,
      routeType: testCase.routeType,
      demandRatio: testCase.demandRatio,
      waitingMinutes: testCase.waitingMinutes,
      isNightTime: testCase.isNightTime,
      estimatedDuration: `${testCase.estimatedDuration} minutes`
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
      
      // Test round trip specific features
      if (testCase.routeType === 'round_trip') {
        // Get the pricing config for round trip features
        const roundTripConfig = await ComprehensivePricing.findOne({ isActive: true });
        
        // Calculate free stay minutes (1km = 0.5min)
        const freeStayMinutes = calculateFreeStayMinutes(testCase.distance, roundTripConfig.roundTrip);
        
        // Check refreshment alert
        const showRefreshmentAlert = shouldShowRefreshmentAlert(
          testCase.distance, 
          testCase.estimatedDuration, 
          roundTripConfig.roundTrip
        );
        
        console.log('Round Trip Features:', {
          freeStayMinutes: `${freeStayMinutes} minutes`,
          refreshmentAlert: showRefreshmentAlert ? 'Yes - Show alert' : 'No alert needed',
          calculation: `${testCase.distance}km × 0.5 = ${freeStayMinutes} free stay minutes`
        });
      } else {
        console.log('Round Trip Features:', 'Not applicable (one-way trip)');
      }
      
    } catch (error) {
      console.log('Error calculating fare:', error.message);
    }
  }
  
  console.log('------------------------------------------------------------');
  console.log('Round trip features test completed');
}

testRoundTripFeatures().then(() => {
  console.log('Test complete');
}).catch(error => {
  console.error('Test failed:', error);
});