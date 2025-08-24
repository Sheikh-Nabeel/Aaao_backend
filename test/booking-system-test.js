import io from 'socket.io-client';
import axios from 'axios';

// Test configuration
const SERVER_URL = 'http://localhost:3001';
const API_BASE = `${SERVER_URL}/api`;

// Test data
const testUser = {
  name: 'Test User',
  email: 'testuser@example.com',
  phone: '1234567890',
  password: 'testpassword123',
  role: 'user'
};

const testDriver = {
  name: 'Test Driver',
  email: 'testdriver@example.com',
  phone: '0987654321',
  password: 'testpassword123',
  role: 'driver',
  gender: 'female', // For pink captain testing
  currentLocation: {
    type: 'Point',
    coordinates: [77.5946, 12.9716] // Bangalore coordinates
  }
};

const testBooking = {
  pickupLocation: {
    type: 'Point',
    coordinates: [77.5946, 12.9716],
    address: 'MG Road, Bangalore'
  },
  dropoffLocation: {
    type: 'Point',
    coordinates: [77.6412, 12.9698],
    address: 'Whitefield, Bangalore'
  },
  serviceType: 'car recovery',
  serviceCategory: 'towing services',
  vehicleType: 'flatbed towing',
  routeType: 'one_way',
  driverPreference: 'nearby',
  offeredFare: 500,
  distanceInMeters: 15000
};

class BookingSystemTest {
  constructor() {
    this.userToken = null;
    this.driverToken = null;
    this.userSocket = null;
    this.driverSocket = null;
    this.bookingId = null;
  }

  async runTests() {
    console.log('🚀 Starting Booking System Tests...');
    
    try {
      await this.testUserRegistration();
      await this.testDriverRegistration();
      await this.testSocketConnections();
      await this.testBookingCreation();
      await this.testDriverMatching();
      await this.testBookingAcceptance();
      await this.testFareRaising();
      await this.testPinkCaptainPreference();
      await this.testPinnedDriverPreference();
      
      console.log('✅ All tests completed successfully!');
    } catch (error) {
      console.error('❌ Test failed:', error.message);
    } finally {
      this.cleanup();
    }
  }

  async testUserRegistration() {
    console.log('📝 Testing user registration...');
    
    const response = await axios.post(`${API_BASE}/users/register`, testUser);
    
    if (response.status === 201) {
      this.userToken = response.data.token;
      console.log('✅ User registration successful');
    } else {
      throw new Error('User registration failed');
    }
  }

  async testDriverRegistration() {
    console.log('📝 Testing driver registration...');
    
    const response = await axios.post(`${API_BASE}/users/register`, testDriver);
    
    if (response.status === 201) {
      this.driverToken = response.data.token;
      console.log('✅ Driver registration successful');
    } else {
      throw new Error('Driver registration failed');
    }
  }

  async testSocketConnections() {
    console.log('🔌 Testing Socket.IO connections...');
    
    return new Promise((resolve, reject) => {
      let connectionsEstablished = 0;
      
      this.userSocket = io(SERVER_URL, {
        auth: { token: this.userToken }
      });
      
      this.driverSocket = io(SERVER_URL, {
        auth: { token: this.driverToken }
      });
      
      this.userSocket.on('connect', () => {
        console.log('✅ User socket connected');
        connectionsEstablished++;
        if (connectionsEstablished === 2) resolve();
      });
      
      this.driverSocket.on('connect', () => {
        console.log('✅ Driver socket connected');
        connectionsEstablished++;
        if (connectionsEstablished === 2) resolve();
      });
      
      this.userSocket.on('connect_error', reject);
      this.driverSocket.on('connect_error', reject);
      
      setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
    });
  }

  async testBookingCreation() {
    console.log('📋 Testing booking creation...');
    
    return new Promise((resolve, reject) => {
      this.userSocket.on('booking_created', (data) => {
        if (data.booking) {
          this.bookingId = data.booking._id;
          console.log('✅ Booking created successfully:', this.bookingId);
          resolve();
        } else {
          reject(new Error('Booking creation failed'));
        }
      });
      
      this.userSocket.on('booking_error', (error) => {
        reject(new Error(`Booking error: ${error.message}`));
      });
      
      this.userSocket.emit('create_booking', testBooking);
      
      setTimeout(() => reject(new Error('Booking creation timeout')), 5000);
    });
  }

  async testDriverMatching() {
    console.log('🎯 Testing driver matching...');
    
    return new Promise((resolve, reject) => {
      this.driverSocket.on('new_booking_request', (data) => {
        if (data.booking && data.booking._id === this.bookingId) {
          console.log('✅ Driver received booking request');
          console.log(`📍 Distance: ${data.distance}km`);
          resolve();
        }
      });
      
      setTimeout(() => reject(new Error('Driver matching timeout')), 5000);
    });
  }

  async testBookingAcceptance() {
    console.log('✋ Testing booking acceptance...');
    
    return new Promise((resolve, reject) => {
      this.userSocket.on('booking_accepted', (data) => {
        if (data.booking && data.booking._id === this.bookingId) {
          console.log('✅ User received booking acceptance notification');
          resolve();
        }
      });
      
      this.driverSocket.on('booking_acceptance_confirmed', (data) => {
        console.log('✅ Driver received acceptance confirmation');
      });
      
      this.driverSocket.emit('accept_booking', {
        bookingId: this.bookingId,
        driverId: 'test-driver-id',
        vehicleId: 'test-vehicle-id'
      });
      
      setTimeout(() => reject(new Error('Booking acceptance timeout')), 5000);
    });
  }

  async testFareRaising() {
    console.log('💰 Testing fare raising...');
    
    const response = await axios.post(
      `${API_BASE}/booking/raise-fare/${this.bookingId}`,
      { newFare: 750 },
      { headers: { Authorization: `Bearer ${this.userToken}` } }
    );
    
    if (response.status === 200) {
      console.log('✅ Fare raised successfully');
    } else {
      throw new Error('Fare raising failed');
    }
  }

  async testPinkCaptainPreference() {
    console.log('👩 Testing pink captain preference...');
    
    const pinkCaptainBooking = {
      ...testBooking,
      driverPreference: 'pink_captain',
      pinkCaptainOptions: {
        femalePassengersOnly: true,
        familyRides: false,
        safeZoneRides: true
      }
    };
    
    return new Promise((resolve, reject) => {
      this.userSocket.emit('create_booking', pinkCaptainBooking);
      
      this.userSocket.on('booking_created', (data) => {
        console.log('✅ Pink captain booking created');
        resolve();
      });
      
      setTimeout(() => reject(new Error('Pink captain test timeout')), 5000);
    });
  }

  async testPinnedDriverPreference() {
    console.log('📌 Testing pinned driver preference...');
    
    const pinnedBooking = {
      ...testBooking,
      driverPreference: 'pinned',
      pinnedDriverId: 'test-driver-id'
    };
    
    return new Promise((resolve, reject) => {
      this.userSocket.emit('create_booking', pinnedBooking);
      
      this.userSocket.on('booking_created', (data) => {
        console.log('✅ Pinned driver booking created');
        resolve();
      });
      
      setTimeout(() => reject(new Error('Pinned driver test timeout')), 5000);
    });
  }

  cleanup() {
    console.log('🧹 Cleaning up test connections...');
    
    if (this.userSocket) {
      this.userSocket.disconnect();
    }
    
    if (this.driverSocket) {
      this.driverSocket.disconnect();
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new BookingSystemTest();
  test.runTests();
}

export default BookingSystemTest;