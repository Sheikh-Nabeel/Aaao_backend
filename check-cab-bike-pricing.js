import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PricingConfig from './models/pricingModel.js';
import ComprehensivePricing from './models/comprehensivePricingModel.js';

// Load environment variables
dotenv.config();

async function checkCabBikePricing() {
    try {
        console.log('🔍 Checking Cab and Bike Pricing Configurations...');
        console.log('===============================================');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URL);
        console.log('✅ Connected to MongoDB');
        
        // Check for cab pricing
        console.log('\n🚗 Checking CAB pricing configurations:');
        const cabPricingConfig = await PricingConfig.findOne({ serviceType: 'car_cab' });
        console.log(`CAB in PricingConfig: ${cabPricingConfig ? '✅ Found' : '❌ Not Found'}`);
        if (cabPricingConfig) {
            console.log(`   Base Fare: ${cabPricingConfig.baseFare}`);
            console.log(`   Per KM Rate: ${cabPricingConfig.perKmRate}`);
            console.log(`   Platform Fee: ${cabPricingConfig.platformFee}`);
            console.log(`   Active: ${cabPricingConfig.isActive}`);
        }
        
        const cabComprehensive = await ComprehensivePricing.findOne({ serviceType: 'car_cab' });
        console.log(`CAB in ComprehensivePricing: ${cabComprehensive ? '✅ Found' : '❌ Not Found'}`);
        if (cabComprehensive) {
            console.log(`   Base Fare: ${JSON.stringify(cabComprehensive.baseFare)}`);
            console.log(`   Per KM Rate: ${JSON.stringify(cabComprehensive.perKmRate)}`);
            console.log(`   Platform Fee: ${JSON.stringify(cabComprehensive.platformFee)}`);
            console.log(`   Active: ${cabComprehensive.isActive}`);
        }
        
        // Check for bike pricing
        console.log('\n🏍️ Checking BIKE pricing configurations:');
        const bikePricingConfig = await PricingConfig.findOne({ serviceType: 'bike' });
        console.log(`BIKE in PricingConfig: ${bikePricingConfig ? '✅ Found' : '❌ Not Found'}`);
        if (bikePricingConfig) {
            console.log(`   Base Fare: ${bikePricingConfig.baseFare}`);
            console.log(`   Per KM Rate: ${bikePricingConfig.perKmRate}`);
            console.log(`   Platform Fee: ${bikePricingConfig.platformFee}`);
            console.log(`   Active: ${bikePricingConfig.isActive}`);
        }
        
        const bikeComprehensive = await ComprehensivePricing.findOne({ serviceType: 'bike' });
        console.log(`BIKE in ComprehensivePricing: ${bikeComprehensive ? '✅ Found' : '❌ Not Found'}`);
        if (bikeComprehensive) {
            console.log(`   Base Fare: ${JSON.stringify(bikeComprehensive.baseFare)}`);
            console.log(`   Per KM Rate: ${JSON.stringify(bikeComprehensive.perKmRate)}`);
            console.log(`   Platform Fee: ${JSON.stringify(bikeComprehensive.platformFee)}`);
            console.log(`   Active: ${bikeComprehensive.isActive}`);
        }
        
        // Check for shifting & movers and car recovery for comparison
        console.log('\n📦 Checking SHIFTING & MOVERS pricing configurations:');
        const shiftingPricingConfig = await PricingConfig.findOne({ serviceType: 'shifting_movers' });
        console.log(`SHIFTING & MOVERS in PricingConfig: ${shiftingPricingConfig ? '✅ Found' : '❌ Not Found'}`);
        
        const shiftingComprehensive = await ComprehensivePricing.findOne({ serviceType: 'shifting_movers' });
        console.log(`SHIFTING & MOVERS in ComprehensivePricing: ${shiftingComprehensive ? '✅ Found' : '❌ Not Found'}`);
        
        console.log('\n🚗🔧 Checking CAR RECOVERY pricing configurations:');
        const carRecoveryPricingConfig = await PricingConfig.findOne({ serviceType: 'car_recovery' });
        console.log(`CAR RECOVERY in PricingConfig: ${carRecoveryPricingConfig ? '✅ Found' : '❌ Not Found'}`);
        
        const carRecoveryComprehensive = await ComprehensivePricing.findOne({ serviceType: 'car_recovery' });
        console.log(`CAR RECOVERY in ComprehensivePricing: ${carRecoveryComprehensive ? '✅ Found' : '❌ Not Found'}`);
        
        // Show all available service types
        console.log('\n📋 All available pricing configurations:');
        const allPricingConfigs = await PricingConfig.find({});
        console.log(`Total PricingConfig entries: ${allPricingConfigs.length}`);
        allPricingConfigs.forEach((config, index) => {
            console.log(`${index + 1}. Service: ${config.serviceType} (Active: ${config.isActive})`);
        });
        
        const allComprehensivePricings = await ComprehensivePricing.find({});
        console.log(`\nTotal ComprehensivePricing entries: ${allComprehensivePricings.length}`);
        allComprehensivePricings.forEach((config, index) => {
            console.log(`${index + 1}. Service: ${config.serviceType || 'undefined'} (Active: ${config.isActive})`);
        });
        
    } catch (error) {
        console.error('❌ Error checking pricing configurations:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

checkCabBikePricing();