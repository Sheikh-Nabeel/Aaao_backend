import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PricingConfig from '../models/pricingModel.js';

dotenv.config();

const CAR_RECOVERY_PRICING = {
  // Base pricing for all car recovery services
  baseFare: 50,                   // AED for first 6km
  perKmRate: 7.5,                 // AED per km after 6km
  minimumFare: 50,                // Minimum fare for any trip
  maximumFare: 2000,              // Maximum fare cap
  
  // Waiting charges
  freeWaitingMinutes: 5,          // Free waiting time
  waitingChargePerMinute: 2,      // AED per minute after free period
  maxWaitingCharge: 20,           // Maximum waiting charge
  
  // Night charges (10 PM to 6 AM)
  nightSurcharge: 10,             // Flat night surcharge
  nightSurchargeStart: '22:00',   // 10 PM
  nightSurchargeEnd: '06:00',     // 6 AM
  
  // Platform fee (15% total, split 50/50 between driver and customer)
  platformFeePercentage: 15,
  driverPlatformFeePercentage: 7.5,
  customerPlatformFeePercentage: 7.5,
  
  // Cancellation fees
  cancellationFees: {
    beforeDriverArrival: 2,       // AED if cancelled before driver arrives
    after50PercentDistance: 5,    // AED if driver has covered 50% distance
    afterDriverArrival: 10        // AED if driver has arrived at pickup
  },
  
  // Free stay minutes for round trips
  freeStayMinutesPerKm: 0.5,      // 30 seconds per km
  maxFreeStayMinutes: 30,         // Maximum free stay time
  
  // Service types and their specific configurations
  serviceTypes: [
    {
      name: 'Flatbed Towing',
      serviceType: 'towing',
      description: 'Safest option for all vehicles, including luxury/exotic cars & low clearance models',
      vehicleTypes: ['car', 'suv', 'truck'],
      baseFare: 50,
      perKmRate: 7.5,
      minimumFare: 50,
      maximumFare: 2000,
      isActive: true
    },
    {
      name: 'Wheel Lift Towing',
      serviceType: 'towing',
      description: 'Quick & efficient method lifting front or rear wheels, suitable for short-distance towing',
      vehicleTypes: ['car', 'suv'],
      baseFare: 40,
      perKmRate: 6.5,
      minimumFare: 40,
      maximumFare: 1800,
      isActive: true
    },
    {
      name: 'On-Road Winching',
      serviceType: 'winching',
      description: 'For vehicles stuck roadside due to ditch, breakdown, or minor accident',
      vehicleTypes: ['car', 'suv', 'truck'],
      baseFare: 60,
      perKmRate: 8.5,
      minimumFare: 60,
      maximumFare: 2200,
      isActive: true
    },
    {
      name: 'Battery Jump Start',
      serviceType: 'roadside_assistance',
      description: 'Portable jump-start service when battery is dead',
      vehicleTypes: ['car', 'suv', 'truck'],
      baseFare: 30,
      perKmRate: 0,  // No per km charge for this service
      minimumFare: 30,
      maximumFare: 30,
      isActive: true
    }
  ]
};

async function setupCarRecoveryPricing() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Check if pricing config exists
    let pricingConfig = await PricingConfig.findOne({});

    if (!pricingConfig) {
      // Create new pricing config if it doesn't exist
      console.log('Creating new pricing configuration...');
      pricingConfig = new PricingConfig({
        carRecoveryConfig: CAR_RECOVERY_PRICING,
        isActive: true,
        currency: 'AED',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } else {
      // Update existing pricing config
      console.log('Updating existing pricing configuration...');
      pricingConfig.carRecoveryConfig = CAR_RECOVERY_PRICING;
      pricingConfig.updatedAt = new Date();
      pricingConfig.isActive = true;
    }

    // Save the pricing configuration
    await pricingConfig.save();
    console.log('Car recovery pricing configuration saved successfully');
    
    // Verify the configuration
    const savedConfig = await PricingConfig.findOne({});
    console.log('Current pricing configuration:', JSON.stringify(savedConfig.carRecoveryConfig, null, 2));
    
    console.log('Car recovery pricing setup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error setting up car recovery pricing:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Run the setup
setupCarRecoveryPricing();
