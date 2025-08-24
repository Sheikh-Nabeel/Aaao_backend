import { calculateComprehensiveFare } from '../utils/comprehensiveFareCalculator.js';
import { initializeComprehensivePricing } from './initializeComprehensivePricing.js';

async function testCancellationCharges() {
  console.log('\n=== Testing Cancellation Charges ===\n');
  
  // Initialize pricing configuration
  const pricingConfig = await initializeComprehensivePricing();
  
  const testCases = [
    {
      name: 'Car Cab - 10km - Cancelled after booking',
      serviceType: 'car cab',
      vehicleType: 'carCab',
      distance: 10,
      routeType: 'one_way',
      demandRatio: 1,
      waitingMinutes: 0,
      isNightTime: false,
      isCancelled: true,
      cancellationReason: 'customer_cancelled'
    },
    {
      name: 'Bike - 5km - Cancelled by driver',
      serviceType: 'bike',
      vehicleType: 'bike',
      distance: 5,
      routeType: 'one_way',
      demandRatio: 1,
      waitingMinutes: 0,
      isNightTime: false,
      isCancelled: true,
      cancellationReason: 'driver_cancelled'
    },
    {
      name: 'Car Recovery - Flatbed - 15km - Cancelled after driver arrival',
      serviceType: 'car recovery',
      vehicleType: 'flatbed',
      distance: 15,
      routeType: 'one_way',
      demandRatio: 1,
      waitingMinutes: 0,
      isNightTime: false,
      isCancelled: true,
      cancellationReason: 'customer_cancelled_after_arrival'
    },
    {
      name: 'Car Cab - 8km - Normal trip (not cancelled)',
      serviceType: 'car cab',
      vehicleType: 'carCab',
      distance: 8,
      routeType: 'one_way',
      demandRatio: 1,
      waitingMinutes: 0,
      isNightTime: false,
      isCancelled: false
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
      isCancelled: testCase.isCancelled,
      cancellationReason: testCase.cancellationReason || 'N/A'
    });
    
    try {
      const fareResult = await calculateComprehensiveFare(testCase);
      
      console.log('Result:', {
        totalFare: `AED ${fareResult.totalFare}`,
        baseFare: `AED ${fareResult.baseFare}`,
        distanceFare: `AED ${fareResult.distanceFare}`,
        platformFee: `AED ${fareResult.platformFee}`,
        cancellationCharges: fareResult.cancellationCharges ? `AED ${fareResult.cancellationCharges}` : 'None',
        nightCharges: fareResult.nightCharges ? `AED ${fareResult.nightCharges}` : 'None',
        surgeCharges: fareResult.surgeCharges ? `AED ${fareResult.surgeCharges}` : 'None',
        waitingCharges: fareResult.waitingCharges ? `AED ${fareResult.waitingCharges}` : 'None',
        vat: `AED ${fareResult.vatAmount}`,
        currency: fareResult.currency
      });
      
      if (testCase.isCancelled) {
        console.log('Cancellation Details:', {
          reason: testCase.cancellationReason,
          chargeApplied: fareResult.cancellationCharges ? `AED ${fareResult.cancellationCharges}` : 'No charge',
          refundAmount: fareResult.refundAmount ? `AED ${fareResult.refundAmount}` : 'No refund calculated'
        });
      }
      
    } catch (error) {
      console.log('Error calculating fare:', error.message);
    }
  }
  
  console.log('------------------------------------------------------------');
  console.log('Cancellation charges test completed');
}

testCancellationCharges().then(() => {
  console.log('Test complete');
}).catch(error => {
  console.error('Test failed:', error);
});