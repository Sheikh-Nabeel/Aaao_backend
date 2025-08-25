import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PricingConfig from '../models/pricingModel.js';

// Load environment variables
dotenv.config();

// Initialize Car Recovery Pricing Configuration
const initializeCarRecoveryPricing = async () => {
  try {
    // Connect to database
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB for Car Recovery pricing initialization');

    // Check if car recovery pricing already exists
    console.log('🔍 Checking for existing car recovery pricing configuration...');
    let pricingConfig = await PricingConfig.findOne({ 
      serviceType: 'car_recovery',
      isActive: true 
    }).maxTimeMS(5000);
    
    if (pricingConfig) {
      console.log('✅ Car recovery pricing configuration already exists');
      console.log('Configuration ID:', pricingConfig._id);
      return pricingConfig;
    }

    console.log('📝 Creating new car recovery pricing configuration...');

    // Create car recovery pricing configuration
    const carRecoveryConfig = {
      vehicleType: 'flatbed towing',
      serviceCategory: 'towing services',
      serviceCharges: 100, // AED 100 base charge
      platformCharges: {
        percentage: 15,
        splitRatio: {
          customer: 50,
          serviceProvider: 50
        }
      }
    };

    // Create new pricing configuration
    pricingConfig = new PricingConfig({
      serviceType: 'car_recovery',
      isActive: true,
      carRecoveryConfig: carRecoveryConfig,
      currency: 'AED',
      fareAdjustmentSettings: {
        allowedAdjustmentPercentage: 3,
        enableUserFareAdjustment: true,
        enablePendingBookingFareIncrease: true
      }
    });

    await pricingConfig.save();
    console.log('✅ Car recovery pricing configuration created successfully');
    console.log('Configuration ID:', pricingConfig._id);

    // Create additional configurations for different service types
    const additionalConfigs = [
      {
        vehicleType: 'wheel lift towing',
        serviceCategory: 'towing services',
        serviceCharges: 80
      },
      {
        vehicleType: 'on-road winching',
        serviceCategory: 'winching services',
        serviceCharges: 120
      },
      {
        vehicleType: 'off-road winching',
        serviceCategory: 'winching services',
        serviceCharges: 150
      },
      {
        vehicleType: 'battery jump start',
        serviceCategory: 'roadside assistance',
        serviceCharges: 60
      },
      {
        vehicleType: 'fuel delivery',
        serviceCategory: 'roadside assistance',
        serviceCharges: 50
      },
      {
        vehicleType: 'luxury & exotic car recovery',
        serviceCategory: 'specialized/heavy recovery',
        serviceCharges: 200
      },
      {
        vehicleType: 'accident & collision recovery',
        serviceCategory: 'specialized/heavy recovery',
        serviceCharges: 180
      },
      {
        vehicleType: 'heavy-duty vehicle recovery',
        serviceCategory: 'specialized/heavy recovery',
        serviceCharges: 250
      },
      {
        vehicleType: 'basement pull-out',
        serviceCategory: 'specialized/heavy recovery',
        serviceCharges: 300
      }
    ];

    console.log('📝 Creating additional car recovery service configurations...');
    
    for (const config of additionalConfigs) {
      const additionalConfig = new PricingConfig({
        serviceType: 'car_recovery',
        isActive: true,
        carRecoveryConfig: {
          ...config,
          platformCharges: {
            percentage: 15,
            splitRatio: {
              customer: 50,
              serviceProvider: 50
            }
          }
        },
        currency: 'AED',
        fareAdjustmentSettings: {
          allowedAdjustmentPercentage: 3,
          enableUserFareAdjustment: true,
          enablePendingBookingFareIncrease: true
        }
      });

      await additionalConfig.save();
      console.log(`✅ Created configuration for ${config.vehicleType} (${config.serviceCharges} AED)`);
    }

    console.log('\n🎉 Car recovery pricing initialization completed successfully!');
    console.log('\n📋 Summary of created configurations:');
    console.log('   • Flatbed Towing: AED 100');
    console.log('   • Wheel Lift Towing: AED 80');
    console.log('   • On-Road Winching: AED 120');
    console.log('   • Off-Road Winching: AED 150');
    console.log('   • Battery Jump Start: AED 60');
    console.log('   • Fuel Delivery: AED 50');
    console.log('   • Luxury & Exotic Car Recovery: AED 200');
    console.log('   • Accident & Collision Recovery: AED 180');
    console.log('   • Heavy-Duty Vehicle Recovery: AED 250');
    console.log('   • Basement Pull-Out: AED 300');
    console.log('   • Platform Charges: 15% (50/50 split)');
    
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
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeCarRecoveryPricing()
    .then(() => {
      console.log('\n✅ Car Recovery pricing initialization completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Car Recovery pricing initialization failed:', error.message);
      process.exit(1);
    });
}

export default initializeCarRecoveryPricing;