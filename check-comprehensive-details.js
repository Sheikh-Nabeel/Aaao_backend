import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ComprehensivePricing from './models/comprehensivePricingModel.js';

// Load environment variables
dotenv.config();

async function checkComprehensiveDetails() {
    try {
        console.log('🔍 Checking Comprehensive Pricing Details...');
        console.log('===============================================');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URL);
        console.log('✅ Connected to MongoDB');
        
        // Get the comprehensive pricing configuration
        const pricingConfig = await ComprehensivePricing.findOne({ isActive: true });
        
        if (!pricingConfig) {
            console.log('❌ No active comprehensive pricing configuration found');
            return;
        }
        
        console.log('\n📋 Comprehensive Pricing Configuration Details:');
        console.log('Service Type:', pricingConfig.serviceType || 'undefined');
        console.log('Active:', pricingConfig.isActive);
        console.log('Currency:', pricingConfig.currency || 'not set');
        
        console.log('\n💰 Base Fare:');
        console.log(JSON.stringify(pricingConfig.baseFare, null, 2));
        
        console.log('\n🛣️ Per KM Rate:');
        console.log(JSON.stringify(pricingConfig.perKmRate, null, 2));
        
        console.log('\n🏢 Platform Fee:');
        console.log(JSON.stringify(pricingConfig.platformFee, null, 2));
        
        // Check if serviceTypes configuration exists
        if (pricingConfig.serviceTypes) {
            console.log('\n🚗 Service Types Configuration:');
            console.log(JSON.stringify(pricingConfig.serviceTypes, null, 2));
        } else {
            console.log('\n❌ No serviceTypes configuration found');
        }
        
        // Check if itemPricing exists
        if (pricingConfig.itemPricing && pricingConfig.itemPricing.length > 0) {
            console.log('\n📦 Item Pricing:');
            pricingConfig.itemPricing.forEach((item, index) => {
                console.log(`${index + 1}. ${item.itemName}: $${item.price}`);
            });
        } else {
            console.log('\n❌ No item pricing found');
        }
        
        // Show the complete document structure
        console.log('\n📄 Complete Document Structure:');
        console.log(JSON.stringify(pricingConfig.toObject(), null, 2));
        
    } catch (error) {
        console.error('❌ Error checking comprehensive pricing details:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

checkComprehensiveDetails();