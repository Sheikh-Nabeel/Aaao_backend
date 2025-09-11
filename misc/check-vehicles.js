import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Vehicle from './models/vehicleModel.js';

// Load environment variables
dotenv.config();

async function checkVehicles() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    // Get all vehicles
    const allVehicles = await Vehicle.find({}).select('userId serviceType vehicleType isActive');
    console.log('\n=== ALL VEHICLES ===');
    console.log(`Total vehicles: ${allVehicles.length}`);
    allVehicles.forEach(vehicle => {
      console.log(`Vehicle ID: ${vehicle._id}, User: ${vehicle.userId}, Service: ${vehicle.serviceType}, Type: ${vehicle.vehicleType}, Active: ${vehicle.isActive}`);
    });

    // Check for specific criteria
    const carEconomyVehicles = await Vehicle.find({
      serviceType: 'car',
      vehicleType: 'economy'
    }).select('userId serviceType vehicleType isActive');
    
    console.log('\n=== CAR ECONOMY VEHICLES ===');
    console.log(`Car economy vehicles: ${carEconomyVehicles.length}`);
    carEconomyVehicles.forEach(vehicle => {
      console.log(`Vehicle ID: ${vehicle._id}, User: ${vehicle.userId}, Service: ${vehicle.serviceType}, Type: ${vehicle.vehicleType}, Active: ${vehicle.isActive}`);
    });

    // Check for the specific driver ID from our test
    const driverVehicles = await Vehicle.find({
      userId: '68b546d7a80d138861dccea8'
    }).select('userId serviceType vehicleType isActive');
    
    console.log('\n=== VEHICLES FOR DRIVER 68b546d7a80d138861dccea8 ===');
    console.log(`Driver vehicles: ${driverVehicles.length}`);
    driverVehicles.forEach(vehicle => {
      console.log(`Vehicle ID: ${vehicle._id}, User: ${vehicle.userId}, Service: ${vehicle.serviceType}, Type: ${vehicle.vehicleType}, Active: ${vehicle.isActive}`);
    });

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkVehicles();