import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PricingConfig from '../models/pricingModel.js';

dotenv.config();

const initializeShiftingMoversPricing = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    // Check if shifting/movers pricing already exists
    const existingConfig = await PricingConfig.findOne({ 
      serviceType: 'shifting_movers' 
    });

    if (existingConfig) {
      console.log('Shifting/Movers pricing configuration already exists');
      return;
    }

    // Create default shifting/movers pricing configuration
    const shiftingMoversConfig = new PricingConfig({
      serviceType: 'shifting_movers',
      isActive: true,
      shiftingMoversConfig: {
        vehicleType: 'small van',
        vehicleStartFare: 50, // Base fare for first 5km
        perKmFare: 15, // Per km fare after 5km
        
        // Basic services included in base fare
        basicServices: {
          loadingUnloadingHelper: {
            fare: 30,
            includeInBasicFare: true,
            baseLimit: 10 // items
          },
          packers: {
            fare: 50,
            includeInBasicFare: false,
            baseLimit: 5
          },
          fixers: {
            fare: 40,
            includeInBasicFare: false,
            baseLimit: 3
          }
        },
        
        // Item-based pricing (array format as per schema)
        itemPricing: [
          {
            itemName: 'sofa',
            stairsFarePerFloor: 10,
            liftFarePerItem: 5,
            packingFare: 15,
            fixingFare: 25,
            loadingUnloadingFare: 20
          },
          {
            itemName: 'bed',
            stairsFarePerFloor: 8,
            liftFarePerItem: 4,
            packingFare: 10,
            fixingFare: 20,
            loadingUnloadingFare: 15
          },
          {
            itemName: 'fridge',
            stairsFarePerFloor: 15,
            liftFarePerItem: 8,
            packingFare: 25,
            fixingFare: 35,
            loadingUnloadingFare: 30
          },
          {
            itemName: 'washing_machine',
            stairsFarePerFloor: 12,
            liftFarePerItem: 6,
            packingFare: 20,
            fixingFare: 30,
            loadingUnloadingFare: 25
          },
          {
            itemName: 'dining_table',
            stairsFarePerFloor: 10,
            liftFarePerItem: 5,
            packingFare: 15,
            fixingFare: 25,
            loadingUnloadingFare: 20
          },
          {
            itemName: 'wardrobe',
            stairsFarePerFloor: 12,
            liftFarePerItem: 6,
            packingFare: 20,
            fixingFare: 30,
            loadingUnloadingFare: 25
          },
          {
            itemName: 'tv',
            stairsFarePerFloor: 6,
            liftFarePerItem: 3,
            packingFare: 8,
            fixingFare: 15,
            loadingUnloadingFare: 12
          },
          {
            itemName: 'ac',
            stairsFarePerFloor: 8,
            liftFarePerItem: 4,
            packingFare: 12,
            fixingFare: 18,
            loadingUnloadingFare: 15
          },
          {
            itemName: 'other',
            stairsFarePerFloor: 5,
            liftFarePerItem: 2,
            packingFare: 5,
            fixingFare: 10,
            loadingUnloadingFare: 8
          }
        ],
        
        // Location policy
        locationPolicy: {
          groundFloor: {
            extraCharge: 0
          },
          stairs: {
            enabled: true,
            baseCoverageFloors: 1
          },
          lift: {
            enabled: true,
            baseCoverageFloors: 1
          }
        }
      }
    });

    await shiftingMoversConfig.save();
    console.log('Shifting/Movers pricing configuration created successfully');

  } catch (error) {
    console.error('Error initializing shifting/movers pricing:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the initialization
initializeShiftingMoversPricing(); 