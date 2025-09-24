import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PricingConfig from '../models/pricingModel.js';

dotenv.config();

async function verifyPricingConfig() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Find active pricing configuration
    const pricingConfig = await PricingConfig.findOne({ isActive: true });
    
    if (!pricingConfig) {
      console.error('No active pricing configuration found in the database');
      process.exit(1);
    }

    console.log('\n=== Active Pricing Configuration ===');
    console.log(`ID: ${pricingConfig._id}`);
    console.log(`Currency: ${pricingConfig.currency || 'AED'}`);
    console.log(`Created: ${pricingConfig.createdAt}`);
    console.log(`Updated: ${pricingConfig.updatedAt}`);
    
    // Check car recovery configuration
    if (pricingConfig.carRecoveryConfig) {
      const crc = pricingConfig.carRecoveryConfig;
      console.log('\n=== Car Recovery Configuration ===');
      console.log(`Base Fare: ${crc.baseFare} AED (first 6km)`);
      console.log(`Per KM Rate: ${crc.perKmRate} AED`);
      console.log(`Minimum Fare: ${crc.minimumFare} AED`);
      console.log(`Maximum Fare: ${crc.maximumFare} AED`);
      console.log(`Night Surcharge: ${crc.nightSurcharge} AED (${crc.nightSurchargeStart} - ${crc.nightSurchargeEnd})`);
      console.log(`Platform Fee: ${crc.platformFeePercentage}% (Driver: ${crc.driverPlatformFeePercentage}%, Customer: ${crc.customerPlatformFeePercentage}%)`);
      
      // Check service types
      if (crc.serviceTypes && crc.serviceTypes.length > 0) {
        console.log('\n=== Service Types ===');
        crc.serviceTypes.forEach((service, index) => {
          console.log(`\n[${index + 1}] ${service.name} (${service.serviceType})`);
          console.log(`   Description: ${service.description}`);
          console.log(`   Vehicle Types: ${service.vehicleTypes.join(', ')}`);
          console.log(`   Base Fare: ${service.baseFare} AED`);
          console.log(`   Per KM Rate: ${service.perKmRate} AED`);
          console.log(`   Min/Max Fare: ${service.minimumFare} - ${service.maximumFare} AED`);
          console.log(`   Active: ${service.isActive !== false ? 'Yes' : 'No'}`);
        });
      } else {
        console.log('\nNo service types configured');
      }
    } else {
      console.log('\nNo car recovery configuration found');
    }

    // Test pricing for a sample request
    console.log('\n=== Test Pricing Calculation ===');
    const testCases = [
      { serviceType: 'towing', vehicleType: 'car', distance: 10, isNight: false },
      { serviceType: 'winching', vehicleType: 'suv', distance: 15, isNight: true },
      { serviceType: 'roadside_assistance', vehicleType: 'car', distance: 5, isNight: false }
    ];

    for (const test of testCases) {
      console.log(`\nTest Case: ${test.serviceType} - ${test.vehicleType} (${test.distance}km, ${test.isNight ? 'Night' : 'Day'})`);
      
      const service = pricingConfig.carRecoveryConfig?.serviceTypes?.find(
        s => s.serviceType === test.serviceType && 
             s.vehicleTypes.includes(test.vehicleType) &&
             s.isActive !== false
      );

      if (!service) {
        console.log(`  ❌ No active pricing found for ${test.serviceType} - ${test.vehicleType}`);
        continue;
      }

      // Simple fare calculation for testing
      const baseFare = Math.max(service.baseFare, service.minimumFare);
      const distanceFare = Math.max(0, test.distance - 6) * service.perKmRate;
      const nightSurcharge = test.isNight ? pricingConfig.carRecoveryConfig.nightSurcharge : 0;
      const subtotal = baseFare + distanceFare + nightSurcharge;
      const platformFee = (subtotal * pricingConfig.carRecoveryConfig.platformFeePercentage) / 100;
      const totalFare = subtotal + platformFee;

      console.log(`  Base Fare: ${baseFare} AED`);
      console.log(`  Distance Fare (${test.distance}km): ${distanceFare.toFixed(2)} AED`);
      if (test.isNight) {
        console.log(`  Night Surcharge: ${nightSurcharge} AED`);
      }
      console.log(`  Platform Fee (${pricingConfig.carRecoveryConfig.platformFeePercentage}%): ${platformFee.toFixed(2)} AED`);
      console.log(`  Total Estimated Fare: ${totalFare.toFixed(2)} AED`);
    }

    console.log('\n✅ Pricing configuration verification completed');
    process.exit(0);
  } catch (error) {
    console.error('Error verifying pricing configuration:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Run the verification
verifyPricingConfig();
