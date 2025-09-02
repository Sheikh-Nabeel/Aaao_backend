import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/userModel.js';

dotenv.config();

async function testDriverOnline() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    // Find the driver
    const driverId = '68b546d7a80d138861dccea8';
    const driver = await User.findById(driverId);
    
    if (!driver) {
      console.log('Driver not found');
      return;
    }

    console.log(`Found driver: ${driver.firstName} ${driver.lastName}`);
    console.log(`Current status: ${driver.driverStatus}`);
    console.log(`Is active: ${driver.isActive}`);
    
    // Update driver to online status
    const updatedDriver = await User.findByIdAndUpdate(
      driverId,
      {
        driverStatus: 'online',
        isActive: true,
        lastActiveAt: new Date(),
        currentLocation: {
          type: 'Point',
          coordinates: [73.0756609, 33.6402842] // Lahore coordinates
        }
      },
      { new: true }
    );
    
    console.log('\n=== UPDATED DRIVER STATUS ===');
    console.log(`Status: ${updatedDriver.driverStatus}`);
    console.log(`Is active: ${updatedDriver.isActive}`);
    console.log(`Location: ${JSON.stringify(updatedDriver.currentLocation)}`);
    console.log(`Last active: ${updatedDriver.lastActiveAt}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testDriverOnline();