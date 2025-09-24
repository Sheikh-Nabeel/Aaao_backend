// This script initializes the car recovery pricing configuration
// Run this script using: node scripts/initializeCarRecoveryPricing.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PricingConfig from '../models/pricingModel.js';

dotenv.config();

// Car Recovery Pricing Configuration
const CAR_RECOVERY_PRICING = {
  // Base pricing for different vehicle types
  vehicleTypes: {
    CAR: { baseFare: 50, perKmRate: 5, minFare: 50, displayName: 'Car' },
    SUV: { baseFare: 75, perKmRate: 7, minFare: 75, displayName: 'SUV' },
    TRUCK: { baseFare: 100, perKmRate: 10, minFare: 100, displayName: 'Truck' },
    MOTORCYCLE: { baseFare: 30, perKmRate: 3, minFare: 30, displayName: 'Motorcycle' },
    VAN: { baseFare: 80, perKmRate: 8, minFare: 80, displayName: 'Van' },
    LUXURY: { baseFare: 150, perKmRate: 15, minFare: 150, displayName: 'Luxury' },
    EXOTIC: { baseFare: 200, perKmRate: 20, minFare: 200, displayName: 'Exotic' },
    HEAVY_DUTY: { baseFare: 250, perKmRate: 25, minFare: 250, displayName: 'Heavy Duty' }
  },
  
  // Service type specific pricing
  serviceTypes: {
    TOWING: { 
      additionalCharge: 50, 
      description: 'Standard towing service',
      displayName: 'Towing'
    },
    WINCHING: { 
      additionalCharge: 100, 
      description: 'Winching service for stuck vehicles',
      displayName: 'Winching'
    },
    ROADSIDE_ASSISTANCE: { 
      flatFee: 75, 
      description: 'Roadside assistance services',
      displayName: 'Roadside Assistance'
    },
    SPECIALIZED_RECOVERY: { 
      multiplier: 2.0, 
      description: 'Specialized recovery services',
      displayName: 'Specialized Recovery'
    }
  },
  
  // Platform fees (15% total, split 50/50 between customer and provider)
  platformFees: {
    percentage: 15,
    splitRatio: {
      customer: 50,
      serviceProvider: 50
    }
  },
  
  // Waiting charges
  waitingCharges: {
    freeMinutes: 5,
    perMinuteAfter: 2,
    maxWaitingCharge: 20
  },
  
  // Night charges (10 PM to 6 AM)
  nightCharges: {
    surcharge: 10,
    active: true
  },
  
  // Cancellation fees
  cancellationFees: {
    before25Percent: 5,
    after50Percent: 10,
    afterArrival: 20
  },
  
  // Surge pricing
  surgePricing: {
    enabled: true,
    multipliers: [
      { demandMultiplier: 2, priceMultiplier: 1.5 },
      { demandMultiplier: 3, priceMultiplier: 2.0 }
    ]
  }
};

// Initialize the database connection
const initDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Initialize car recovery pricing
const initializePricing = async () => {
  try {
    await initDB();
    
    // Remove any existing car recovery pricing
    await PricingConfig.deleteMany({ serviceType: 'car_recovery' });
    
    // Create new pricing config
    const pricingConfig = new PricingConfig({
      serviceType: 'car_recovery',
      config: CAR_RECOVERY_PRICING,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await pricingConfig.save();
    
    console.log('✅ Car recovery pricing configuration created/updated successfully');
    console.log('Vehicle types available:', Object.keys(CAR_RECOVERY_PRICING.vehicleTypes).join(', '));
    console.log('Service types available:', Object.keys(CAR_RECOVERY_PRICING.serviceTypes).join(', '));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing car recovery pricing:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
};

// Run the initialization
initializePricing();