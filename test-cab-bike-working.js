import mongoose from 'mongoose';
import ComprehensivePricing from './models/comprehensivePricingModel.js';
import { calculateComprehensiveFare } from './utils/comprehensiveFareCalculator.js';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://ahadqureshi16756:ahad123@cluster0.tlo17.mongodb.net/uber?retryWrites=true&w=majority&appName=Cluster0');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Test cab and bike fare calculation
const testCabBikeFares = async () => {
  try {
    console.log('\n=== TESTING CAB AND BIKE FARE CALCULATION ===\n');
    
    // Check if comprehensive pricing exists
    const comprehensiveConfig = await ComprehensivePricing.findOne({ isActive: true });
    console.log('Comprehensive pricing config exists:', !!comprehensiveConfig);
    
    if (comprehensiveConfig) {
      console.log('\nComprehensive pricing serviceTypes available:');
      console.log('- carCab enabled:', comprehensiveConfig.serviceTypes?.carCab?.enabled);
      console.log('- bike enabled:', comprehensiveConfig.serviceTypes?.bike?.enabled);
      console.log('- carRecovery enabled:', comprehensiveConfig.serviceTypes?.carRecovery?.enabled);
    }
    
    // Test cab fare calculation
    console.log('\n--- Testing CAB fare calculation ---');
    try {
      const cabBookingData = {
        serviceType: 'car_cab',
        vehicleType: 'economy',
        distance: 10, // 10km
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 15
      };
      
      const cabFareResult = await calculateComprehensiveFare(cabBookingData);
      console.log('✅ CAB fare calculation successful:');
      console.log('Total fare:', cabFareResult.totalFare);
      console.log('Base fare:', cabFareResult.baseFare);
      console.log('Distance fare:', cabFareResult.distanceFare);
      console.log('Platform fee:', cabFareResult.platformFee);
    } catch (error) {
      console.log('❌ CAB fare calculation failed:', error.message);
    }
    
    // Test bike fare calculation
    console.log('\n--- Testing BIKE fare calculation ---');
    try {
      const bikeBookingData = {
        serviceType: 'bike',
        vehicleType: 'standard',
        distance: 8, // 8km
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 12
      };
      
      const bikeFareResult = await calculateComprehensiveFare(bikeBookingData);
      console.log('✅ BIKE fare calculation successful:');
      console.log('Total fare:', bikeFareResult.totalFare);
      console.log('Base fare:', bikeFareResult.baseFare);
      console.log('Distance fare:', bikeFareResult.distanceFare);
      console.log('Platform fee:', bikeFareResult.platformFee);
    } catch (error) {
      console.log('❌ BIKE fare calculation failed:', error.message);
    }
    
    // Test car recovery fare calculation
    console.log('\n--- Testing CAR RECOVERY fare calculation ---');
    try {
      const carRecoveryBookingData = {
        serviceType: 'car_recovery',
        vehicleType: 'flatbed',
        distance: 12, // 12km
        routeType: 'one_way',
        demandRatio: 1,
        waitingMinutes: 0,
        estimatedDuration: 20
      };
      
      const carRecoveryFareResult = await calculateComprehensiveFare(carRecoveryBookingData);
      console.log('✅ CAR RECOVERY fare calculation successful:');
      console.log('Total fare:', carRecoveryFareResult.totalFare);
      console.log('Base fare:', carRecoveryFareResult.baseFare);
      console.log('Distance fare:', carRecoveryFareResult.distanceFare);
      console.log('Platform fee:', carRecoveryFareResult.platformFee);
    } catch (error) {
      console.log('❌ CAR RECOVERY fare calculation failed:', error.message);
    }
    
  } catch (error) {
    console.error('Test execution error:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await testCabBikeFares();
  
  console.log('\nTest complete');
  process.exit(0);
};

main().catch(console.error);