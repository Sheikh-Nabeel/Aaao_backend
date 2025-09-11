import { getQualifiedDrivers } from './controllers/qualifiedDriversController.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      maxPoolSize: 10,
      minPoolSize: 2,
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Mock request and response objects
const mockReq = {
    query: {
      lat: '24.8607',
      lon: '67.0011',
      serviceType: 'bike',
      vehicleType: 'premium',
      driverPreference: 'nearby',
      radius: '10'
    },
    cookies: {
      token: 'mock-token-for-testing'
    },
    user: {
      _id: '675e123456789012345678ab'
    }
  };

const mockRes = {
  status: (code) => ({
    json: (data) => {
      console.log(`Response Status: ${code}`);
      console.log('Response Data:', JSON.stringify(data, null, 2));
      process.exit(0);
    }
  })
};

// Run the test
const runTest = async () => {
  await connectDB();
  console.log('Testing qualified drivers with debug logs...');
  console.log('=== REST API: GETTING QUALIFIED DRIVERS ===');
  console.log('Service Type: bike');
  console.log('Vehicle Type: premium');
  await getQualifiedDrivers(mockReq, mockRes);
};

runTest().catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});