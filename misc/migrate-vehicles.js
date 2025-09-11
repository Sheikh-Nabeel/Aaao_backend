import mongoose from 'mongoose';
import Vehicle from './models/vehicleModel.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function migrateVehicles() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Update all vehicles to have isActive: true
    const result = await Vehicle.updateMany(
      { isActive: { $exists: false } }, // Only update vehicles that don't have isActive field
      { $set: { isActive: true } }
    );
    
    console.log(`Updated ${result.modifiedCount} vehicles with isActive: true`);
    
    // Verify the update
    const vehicles = await Vehicle.find({}, { _id: 1, userId: 1, vehicleType: 1, serviceType: 1, isActive: 1 });
    console.log('\nVehicles after migration:');
    vehicles.forEach(vehicle => {
      console.log(`Vehicle ${vehicle._id}: userId=${vehicle.userId}, type=${vehicle.vehicleType}, service=${vehicle.serviceType}, isActive=${vehicle.isActive}`);
    });
    
    await mongoose.disconnect();
    console.log('\nMigration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateVehicles();