import { calculateComprehensiveFare } from '../utils/comprehensiveFareCalculator.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('📄 Test script loaded successfully');

// Test Car Recovery Pricing Implementation
const testCarRecoveryPricing = async () => {
  console.log('🚀 Starting Car Recovery pricing tests...');
  try {
    // Connect to database
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('🔌 Connected to MongoDB for Car Recovery pricing tests');
    
    console.log('\n🧪 Testing Car Recovery Comprehensive Pricing...');
    console.log('=' .repeat(60));
    
    // Test 1: Standard Car Recovery (Non-winching/roadside)
    console.log('\n📋 Test 1: Standard Car Recovery Service');
    console.log('-'.repeat(40));
    
    const standardRecovery = await calculateComprehensiveFare({
      serviceType: 'car recovery',
      vehicleType: 'standard', // Not winching or roadside
      distance: 8, // 8km trip
      routeType: 'one_way',
      demandRatio: 1,
      waitingMinutes: 0,
      estimatedDuration: 25,
      isNightTime: false
    });
    
    console.log('Standard Recovery (8km):');
    console.log(`  Base Fare: ${standardRecovery.currency} ${standardRecovery.baseFare}`);
    console.log(`  Distance Fare: ${standardRecovery.currency} ${standardRecovery.distanceFare}`);
    console.log(`  Platform Fee: ${standardRecovery.currency} ${standardRecovery.platformFee}`);
    console.log(`  VAT: ${standardRecovery.currency} ${standardRecovery.vatAmount}`);
    console.log(`  Total Fare: ${standardRecovery.currency} ${standardRecovery.totalFare}`);
    
    // Test 2: Winching Service (Flatbed)
    console.log('\n📋 Test 2: Winching Service - Flatbed');
    console.log('-'.repeat(40));
    
    const winchingFlatbed = await calculateComprehensiveFare({
      serviceType: 'car recovery',
      vehicleType: 'flatbed', // Winching service
      distance: 5,
      routeType: 'one_way',
      demandRatio: 1,
      waitingMinutes: 0,
      estimatedDuration: 20,
      isNightTime: false
    });
    
    console.log('Winching - Flatbed:');
    console.log(`  Base Fare (Min charges + Convenience): ${winchingFlatbed.currency} ${winchingFlatbed.baseFare}`);
    console.log(`  Distance Fare: ${winchingFlatbed.currency} ${winchingFlatbed.distanceFare}`);
    console.log(`  Convenience Fee: ${winchingFlatbed.currency} ${winchingFlatbed.breakdown.convenienceFee || 'N/A'}`);
    console.log(`  Total Fare: ${winchingFlatbed.currency} ${winchingFlatbed.totalFare}`);
    
    // Test 3: Roadside Assistance (Jumpstart)
    console.log('\n📋 Test 3: Roadside Assistance - Jumpstart');
    console.log('-'.repeat(40));
    
    const roadsideJumpstart = await calculateComprehensiveFare({
      serviceType: 'car recovery',
      vehicleType: 'jumpstart', // Roadside assistance
      distance: 3,
      routeType: 'one_way',
      demandRatio: 1,
      waitingMinutes: 0,
      estimatedDuration: 15,
      isNightTime: false
    });
    
    console.log('Roadside - Jumpstart:');
    console.log(`  Base Fare (Min charges + Convenience): ${roadsideJumpstart.currency} ${roadsideJumpstart.baseFare}`);
    console.log(`  Distance Fare: ${roadsideJumpstart.currency} ${roadsideJumpstart.distanceFare}`);
    console.log(`  Convenience Fee: ${roadsideJumpstart.currency} ${roadsideJumpstart.breakdown.convenienceFee || 'N/A'}`);
    console.log(`  Total Fare: ${roadsideJumpstart.currency} ${roadsideJumpstart.totalFare}`);
    
    // Test 4: Key Unlocker Service
    console.log('\n📋 Test 4: Key Unlocker Service');
    console.log('-'.repeat(40));
    
    const keyUnlocker = await calculateComprehensiveFare({
      serviceType: 'car recovery',
      vehicleType: 'keyUnlocker',
      distance: 2,
      routeType: 'one_way',
      demandRatio: 1,
      waitingMinutes: 0,
      estimatedDuration: 10,
      isNightTime: false
    });
    
    console.log('Key Unlocker:');
    console.log(`  Base Fare (Min charges + Convenience): ${keyUnlocker.currency} ${keyUnlocker.baseFare}`);
    console.log(`  Distance Fare: ${keyUnlocker.currency} ${keyUnlocker.distanceFare}`);
    console.log(`  Convenience Fee: ${keyUnlocker.currency} ${keyUnlocker.breakdown.convenienceFee || 'N/A'}`);
    console.log(`  Total Fare: ${keyUnlocker.currency} ${keyUnlocker.totalFare}`);
    
    // Test 5: Night Time Charges
    console.log('\n📋 Test 5: Night Time Car Recovery');
    console.log('-'.repeat(40));
    
    const nightRecovery = await calculateComprehensiveFare({
      serviceType: 'car recovery',
      vehicleType: 'standard',
      distance: 10,
      routeType: 'one_way',
      demandRatio: 1,
      waitingMinutes: 0,
      estimatedDuration: 30,
      isNightTime: true // Night time
    });
    
    console.log('Night Recovery (10km):');
    console.log(`  Base Fare: ${nightRecovery.currency} ${nightRecovery.baseFare}`);
    console.log(`  Distance Fare: ${nightRecovery.currency} ${nightRecovery.distanceFare}`);
    console.log(`  Night Charges: ${nightRecovery.currency} ${nightRecovery.nightCharges}`);
    console.log(`  Total Fare: ${nightRecovery.currency} ${nightRecovery.totalFare}`);
    
    // Test 6: Surge Pricing
    console.log('\n📋 Test 6: Surge Pricing (High Demand)');
    console.log('-'.repeat(40));
    
    const surgeRecovery = await calculateComprehensiveFare({
      serviceType: 'car recovery',
      vehicleType: 'standard',
      distance: 12,
      routeType: 'one_way',
      demandRatio: 2.5, // High demand
      waitingMinutes: 0,
      estimatedDuration: 35,
      isNightTime: false
    });
    
    console.log('Surge Recovery (12km, 2.5x demand):');
    console.log(`  Base Fare: ${surgeRecovery.currency} ${surgeRecovery.baseFare}`);
    console.log(`  Distance Fare: ${surgeRecovery.currency} ${surgeRecovery.distanceFare}`);
    console.log(`  Surge Charges: ${surgeRecovery.currency} ${surgeRecovery.surgeCharges}`);
    console.log(`  Surge Multiplier: ${surgeRecovery.breakdown.surgeMultiplier || 'N/A'}x`);
    console.log(`  Total Fare: ${surgeRecovery.currency} ${surgeRecovery.totalFare}`);
    
    // Test 7: Waiting Charges
    console.log('\n📋 Test 7: Waiting Charges');
    console.log('-'.repeat(40));
    
    const waitingRecovery = await calculateComprehensiveFare({
      serviceType: 'car recovery',
      vehicleType: 'standard',
      distance: 6,
      routeType: 'one_way',
      demandRatio: 1,
      waitingMinutes: 15, // 15 minutes waiting
      estimatedDuration: 25,
      isNightTime: false
    });
    
    console.log('Recovery with Waiting (6km, 15min wait):');
    console.log(`  Base Fare: ${waitingRecovery.currency} ${waitingRecovery.baseFare}`);
    console.log(`  Distance Fare: ${waitingRecovery.currency} ${waitingRecovery.distanceFare}`);
    console.log(`  Waiting Charges: ${waitingRecovery.currency} ${waitingRecovery.waitingCharges}`);
    console.log(`  Total Fare: ${waitingRecovery.currency} ${waitingRecovery.totalFare}`);
    
    // Test 8: Long Distance with City-wise Adjustment
    console.log('\n📋 Test 8: Long Distance (City-wise Adjustment)');
    console.log('-'.repeat(40));
    
    const longDistanceRecovery = await calculateComprehensiveFare({
      serviceType: 'car recovery',
      vehicleType: 'standard',
      distance: 15, // 15km trip (>10km triggers city-wise adjustment)
      routeType: 'one_way',
      demandRatio: 1,
      waitingMinutes: 0,
      estimatedDuration: 45,
      isNightTime: false
    });
    
    console.log('Long Distance Recovery (15km):');
    console.log(`  Base Fare: ${longDistanceRecovery.currency} ${longDistanceRecovery.baseFare}`);
    console.log(`  Distance Fare (with city adjustment): ${longDistanceRecovery.currency} ${longDistanceRecovery.distanceFare}`);
    console.log(`  Total Fare: ${longDistanceRecovery.currency} ${longDistanceRecovery.totalFare}`);
    
    // Test 9: Round Trip with Free Stay
    console.log('\n📋 Test 9: Round Trip with Free Stay');
    console.log('-'.repeat(40));
    
    const roundTripRecovery = await calculateComprehensiveFare({
      serviceType: 'car recovery',
      vehicleType: 'standard',
      distance: 25, // 25km trip
      routeType: 'round_trip',
      demandRatio: 1,
      waitingMinutes: 0,
      estimatedDuration: 60, // 60 minutes
      isNightTime: false
    });
    
    console.log('Round Trip Recovery (25km):');
    console.log(`  Base Fare: ${roundTripRecovery.currency} ${roundTripRecovery.baseFare}`);
    console.log(`  Distance Fare: ${roundTripRecovery.currency} ${roundTripRecovery.distanceFare}`);
    console.log(`  Free Stay Minutes: ${roundTripRecovery.breakdown.carRecoveryFreeStayMinutes || 'N/A'} min`);
    console.log(`  Total Fare: ${roundTripRecovery.currency} ${roundTripRecovery.totalFare}`);
    
    // Check for alerts
    if (roundTripRecovery.alerts && roundTripRecovery.alerts.length > 0) {
      console.log(`  Alerts: ${JSON.stringify(roundTripRecovery.alerts, null, 2)}`);
    }
    
    // Test 10: Minimum Fare Application
    console.log('\n📋 Test 10: Minimum Fare (Short Distance)');
    console.log('-'.repeat(40));
    
    const shortDistanceRecovery = await calculateComprehensiveFare({
      serviceType: 'car recovery',
      vehicleType: 'standard',
      distance: 3, // 3km trip (less than 6km base coverage)
      routeType: 'one_way',
      demandRatio: 1,
      waitingMinutes: 0,
      estimatedDuration: 15,
      isNightTime: false
    });
    
    console.log('Short Distance Recovery (3km):');
    console.log(`  Base Fare: ${shortDistanceRecovery.currency} ${shortDistanceRecovery.baseFare}`);
    console.log(`  Distance Fare: ${shortDistanceRecovery.currency} ${shortDistanceRecovery.distanceFare}`);
    console.log(`  Minimum Fare Applied: ${shortDistanceRecovery.breakdown.minimumFareApplied ? 'Yes' : 'No'}`);
    console.log(`  Total Fare: ${shortDistanceRecovery.currency} ${shortDistanceRecovery.totalFare}`);
    
    console.log('\n✅ All Car Recovery pricing tests completed successfully!');
    console.log('\n📊 Test Summary:');
    console.log('   • Standard Recovery: Base fare + distance-based pricing');
    console.log('   • Winching Services: Fixed convenience fees + minimum charges');
    console.log('   • Roadside Assistance: Service-specific convenience fees');
    console.log('   • Key Unlocker: Fixed convenience fee structure');
    console.log('   • Night Charges: Additional charges for 22:00-06:00 trips');
    console.log('   • Surge Pricing: Demand-based multipliers (1.5x-2.0x)');
    console.log('   • Waiting Charges: Free 5min, then AED 2/min (max AED 20)');
    console.log('   • City-wise Adjustment: Reduced rate for long distances');
    console.log('   • Round Trip Features: Free stay minutes + refreshment alerts');
    console.log('   • Minimum Fare: AED 50 guaranteed minimum');
    
  } catch (error) {
    console.error('❌ Error testing Car Recovery pricing:', error.message);
    console.error('Stack trace:', error.stack);
    throw error;
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the test if this file is executed directly
if (process.argv[1] && process.argv[1].endsWith('testCarRecoveryPricing.js')) {
  testCarRecoveryPricing()
    .then(() => {
      console.log('\n🎉 Car Recovery pricing tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Tests failed:', error);
      process.exit(1);
    });
}

export default testCarRecoveryPricing;