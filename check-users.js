import mongoose from 'mongoose';
import User from './models/userModel.js';

const checkUsers = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/aaao');
    console.log('Connected to MongoDB');
    
    const users = await User.find(
      { username: { $in: ['alpha', 'beta'] } }, 
      'username sponsorId _id firstName lastName'
    );
    
    console.log('Found users:', users);
    
    if (users.length === 0) {
      console.log('No users found with usernames alpha or beta');
      console.log('Creating test users...');
      
      const alphaUser = new User({
        username: 'alpha',
        firstName: 'Alpha',
        lastName: 'User',
        email: 'alpha@test.com',
        phoneNumber: '1234567890',
        password: 'password123',
        sponsorBy: null
      });
      
      const betaUser = new User({
        username: 'beta',
        firstName: 'Beta',
        lastName: 'User',
        email: 'beta@test.com',
        phoneNumber: '1234567891',
        password: 'password123',
        sponsorBy: 'alpha'
      });
      
      await alphaUser.save();
      await betaUser.save();
      
      console.log('Test users created successfully');
      console.log('Alpha user:', { username: alphaUser.username, sponsorId: alphaUser.sponsorId, _id: alphaUser._id });
      console.log('Beta user:', { username: betaUser.username, sponsorId: betaUser.sponsorId, _id: betaUser._id });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkUsers();