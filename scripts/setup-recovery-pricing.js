import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PricingConfig from '../models/pricingModel.js';

dotenv.config();

const RECOVERY_SERVICES = [
  {
    name: 'Towing Services',
    description: 'Professional vehicle towing services',
    imageUrl: 'https://example.com/images/towing.jpg',
    subcategories: [
      {
        name: 'Flatbed Towing',
        description: 'Safest option for all vehicles, including luxury/exotic cars & low clearance models',
        serviceType: 'towing',
        vehicleTypes: ['car', 'suv', 'truck'],
        baseFare: 50,
        perKmRate: 7.5,
        minimumFare: 100,
        maximumFare: 2000,
        freeWaitingMinutes: 15,
        waitingChargePerMinute: 2,
        maxWaitingCharge: 50,
        nightSurcharge: 20,
        nightSurchargeStart: '22:00',
        nightSurchargeEnd: '06:00',
        platformFeePercentage: 15,
        vatPercentage: 5,
        pinkCaptainAllowed: false,
        requiresHelper: false,
        helperRate: 0,
        roundTripDiscount: 0,
        freeStayMinutesPerKm: 0.5,
        maxFreeStayMinutes: 30,
        isActive: true
      },
      {
        name: 'Wheel Lift Towing',
        description: 'Quick & efficient method lifting front or rear wheels, suitable for short-distance towing',
        serviceType: 'towing',
        vehicleTypes: ['car', 'suv'],
        baseFare: 40,
        perKmRate: 6.5,
        minimumFare: 80,
        maximumFare: 1800,
        freeWaitingMinutes: 15,
        waitingChargePerMinute: 2,
        maxWaitingCharge: 50,
        nightSurcharge: 20,
        platformFeePercentage: 15,
        vatPercentage: 5,
        pinkCaptainAllowed: false,
        requiresHelper: false,
        isActive: true
      }
    ]
  },
  {
    name: 'Winching Services',
    description: 'Professional vehicle recovery from difficult situations',
    imageUrl: 'https://example.com/images/winching.jpg',
    subcategories: [
      {
        name: 'On-Road Winching',
        description: 'For vehicles stuck roadside due to ditch, breakdown, or minor accident',
        serviceType: 'winching',
        vehicleTypes: ['car', 'suv', 'truck'],
        baseFare: 100,
        perKmRate: 10,
        minimumFare: 150,
        maximumFare: 2500,
        freeWaitingMinutes: 30,
        waitingChargePerMinute: 3,
        nightSurcharge: 30,
        platformFeePercentage: 15,
        vatPercentage: 5,
        pinkCaptainAllowed: false,
        requiresHelper: true,
        helperRate: 30,
        isActive: true
      },
      {
        name: 'Off-Road Winching',
        description: 'Recovery for vehicles stuck in sand, mud, or rough terrain',
        serviceType: 'winching',
        vehicleTypes: ['car', 'suv', 'truck'],
        baseFare: 150,
        perKmRate: 15,
        minimumFare: 200,
        maximumFare: 3000,
        freeWaitingMinutes: 30,
        waitingChargePerMinute: 4,
        nightSurcharge: 40,
        platformFeePercentage: 15,
        vatPercentage: 5,
        pinkCaptainAllowed: false,
        requiresHelper: true,
        helperRate: 40,
        isActive: true
      }
    ]
  },
  {
    name: 'Roadside Assistance',
    description: 'Quick help for common vehicle issues',
    imageUrl: 'https://example.com/images/roadside.jpg',
    subcategories: [
      {
        name: 'Battery Jump Start',
        description: 'Portable jump-start service when battery is dead',
        serviceType: 'roadside_assistance',
        vehicleTypes: ['car', 'suv', 'truck'],
        baseFare: 30,
        perKmRate: 1.5,
        minimumFare: 40,
        maximumFare: 100,
        freeWaitingMinutes: 15,
        waitingChargePerMinute: 1.5,
        nightSurcharge: 15,
        platformFeePercentage: 15,
        vatPercentage: 5,
        pinkCaptainAllowed: true,
        requiresHelper: false,
        isActive: true
      },
      {
        name: 'Fuel Delivery',
        description: 'Fuel delivered directly to stranded vehicles (petrol/diesel)',
        serviceType: 'roadside_assistance',
        vehicleTypes: ['car', 'suv', 'truck'],
        baseFare: 20,
        perKmRate: 1.5,
        minimumFare: 30,
        maximumFare: 80,
        freeWaitingMinutes: 15,
        waitingChargePerMinute: 1.5,
        nightSurcharge: 15,
        platformFeePercentage: 15,
        vatPercentage: 5,
        pinkCaptainAllowed: true,
        requiresHelper: false,
        isActive: true
      },
      {
        name: 'Tire Change',
        description: 'Assistance with changing a flat tire',
        serviceType: 'roadside_assistance',
        vehicleTypes: ['car', 'suv', 'truck'],
        baseFare: 40,
        perKmRate: 1.5,
        minimumFare: 50,
        maximumFare: 120,
        freeWaitingMinutes: 15,
        waitingChargePerMinute: 1.5,
        nightSurcharge: 15,
        platformFeePercentage: 15,
        vatPercentage: 5,
        pinkCaptainAllowed: true,
        requiresHelper: false,
        isActive: true
      }
    ]
  },
  {
    name: 'Specialized Recovery',
    description: 'Advanced recovery services for special vehicles',
    imageUrl: 'https://example.com/images/specialized.jpg',
    subcategories: [
      {
        name: 'Luxury & Exotic Car Recovery',
        description: 'Secure handling of high-end vehicles',
        serviceType: 'specialized_recovery',
        vehicleTypes: ['car'],
        baseFare: 200,
        perKmRate: 20,
        minimumFare: 300,
        maximumFare: 5000,
        freeWaitingMinutes: 30,
        waitingChargePerMinute: 5,
        nightSurcharge: 50,
        platformFeePercentage: 15,
        vatPercentage: 5,
        pinkCaptainAllowed: false,
        requiresHelper: true,
        helperRate: 50,
        isActive: true
      },
      {
        name: 'Heavy-Duty Recovery',
        description: 'For buses, trucks, and other heavy vehicles',
        serviceType: 'specialized_recovery',
        vehicleTypes: ['truck', 'bus'],
        baseFare: 300,
        perKmRate: 25,
        minimumFare: 400,
        maximumFare: 6000,
        freeWaitingMinutes: 30,
        waitingChargePerMinute: 6,
        nightSurcharge: 60,
        platformFeePercentage: 15,
        vatPercentage: 5,
        pinkCaptainAllowed: false,
        requiresHelper: true,
        helperRate: 60,
        isActive: true
      },
      {
        name: 'Accident Recovery',
        description: 'Safe recovery after accidents',
        serviceType: 'specialized_recovery',
        vehicleTypes: ['car', 'suv', 'truck', 'bus'],
        baseFare: 250,
        perKmRate: 15,
        minimumFare: 350,
        maximumFare: 5000,
        freeWaitingMinutes: 30,
        waitingChargePerMinute: 5,
        nightSurcharge: 50,
        platformFeePercentage: 15,
        vatPercentage: 5,
        pinkCaptainAllowed: false,
        requiresHelper: true,
        helperRate: 50,
        isActive: true
      },
      {
        name: 'Basement Pull-Out',
        description: 'Specialized service for underground/basement parking',
        serviceType: 'specialized_recovery',
        vehicleTypes: ['car', 'suv'],
        baseFare: 200,
        perKmRate: 10,
        minimumFare: 250,
        maximumFare: 3000,
        freeWaitingMinutes: 30,
        waitingChargePerMinute: 4,
        nightSurcharge: 40,
        platformFeePercentage: 15,
        vatPercentage: 5,
        pinkCaptainAllowed: false,
        requiresHelper: true,
        helperRate: 40,
        isActive: true
      }
    ]
  }
];

async function setupRecoveryPricing() {
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

    // Transform the RECOVERY_SERVICES data to match the schema
    const carRecoveryConfig = [];
    
    RECOVERY_SERVICES.forEach(service => {
      service.subcategories.forEach(subcategory => {
        carRecoveryConfig.push({
          name: subcategory.name,
          description: subcategory.description,
          serviceType: subcategory.serviceType,
          vehicleTypes: subcategory.vehicleTypes,
          baseFare: subcategory.baseFare,
          perKmRate: subcategory.perKmRate,
          minimumFare: subcategory.minimumFare,
          maximumFare: subcategory.maximumFare,
          freeWaitingMinutes: subcategory.freeWaitingMinutes,
          waitingChargePerMinute: subcategory.waitingChargePerMinute,
          maxWaitingCharge: subcategory.maxWaitingCharge,
          nightSurcharge: subcategory.nightSurcharge,
          nightSurchargeStart: subcategory.nightSurchargeStart,
          nightSurchargeEnd: subcategory.nightSurchargeEnd,
          platformFeePercentage: subcategory.platformFeePercentage,
          vatPercentage: subcategory.vatPercentage,
          pinkCaptainAllowed: subcategory.pinkCaptainAllowed,
          requiresHelper: subcategory.requiresHelper || false,
          helperRate: subcategory.helperRate || 0,
          roundTripDiscount: subcategory.roundTripDiscount || 0,
          freeStayMinutesPerKm: subcategory.freeStayMinutesPerKm || 0,
          maxFreeStayMinutes: subcategory.maxFreeStayMinutes || 0,
          isActive: subcategory.isActive !== false
        });
      });
    });

    if (!pricingConfig) {
      // Create new pricing config if it doesn't exist
      console.log('Creating new pricing configuration...');
      pricingConfig = new PricingConfig({
        carRecoveryConfig,
        isActive: true,
        currency: 'AED',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } else {
      // Update existing pricing config
      console.log('Updating existing pricing configuration...');
      pricingConfig.carRecoveryConfig = carRecoveryConfig;
      pricingConfig.updatedAt = new Date();
      pricingConfig.isActive = true;
    }

    // Save the pricing configuration
    await pricingConfig.save();
    console.log('Pricing configuration saved successfully');
    console.log('Recovery services pricing setup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error setting up recovery services pricing:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Run the setup
setupRecoveryPricing();
