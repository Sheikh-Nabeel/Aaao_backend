import User from '../models/userModel.js';
import Booking from '../models/bookingModel.js';
import { addMoneyToMLM } from './mlmHelper.js';
import { calculateDistance } from "./distanceCalculator.js";

// Socket event handlers for booking system
export const handleBookingEvents = (socket, io) => {
  console.log('Setting up booking event handlers for user:', socket.user.email);
  
  // Create booking event
  socket.on('create_booking', async (bookingData) => {
    console.log('=== SOCKET: CREATE BOOKING ===');
    console.log('User:', socket.user.email);
    console.log('Booking Data:', bookingData);
    
    try {
      // Create new booking with user ID
      const booking = new Booking({
        ...bookingData,
        user: socket.user._id,
        status: 'pending',
        createdAt: new Date()
      });
      
      await booking.save();
      
      // Populate user data for response
      await booking.populate('user', 'firstName lastName email phoneNumber');
      
      // Find nearby drivers
      const nearbyDrivers = await findNearbyDrivers(booking, io);
      
      if (nearbyDrivers.length === 0) {
        socket.emit('booking_error', { 
          message: 'No drivers available in your area. Please try again later.' 
        });
        return;
      }
      
      // Send booking request to nearby drivers
      nearbyDrivers.forEach(driver => {
        const driverRoom = `driver_${driver._id}`;
        io.to(driverRoom).emit('new_booking_request', {
          requestId: booking._id,
          user: {
            id: booking.user._id,
            firstName: booking.user.firstName,
            lastName: booking.user.lastName,
            email: booking.user.email,
            phoneNumber: booking.user.phoneNumber
          },
          from: {
            address: booking.pickupLocation.address,
            coordinates: booking.pickupLocation.coordinates
          },
          to: {
            address: booking.dropoffLocation.address,
            coordinates: booking.dropoffLocation.coordinates
          },
          fare: booking.fare,
          distance: booking.distance,
          serviceType: booking.serviceType,
          vehicleType: booking.vehicleType,
          serviceCategory: booking.serviceCategory,
          driverPreference: booking.driverPreference,
          pinkCaptainOptions: booking.pinkCaptainOptions,
          paymentMethod: booking.paymentMethod,
          scheduledTime: booking.scheduledTime,
          createdAt: booking.createdAt
        });
      });
      
      // Confirm booking creation to user
      socket.emit('booking_created', {
        bookingId: booking._id,
        message: 'Booking created successfully. Looking for nearby drivers...',
        driversFound: nearbyDrivers.length
      });
      
      console.log('Booking created successfully:', booking._id);
      
    } catch (error) {
      console.error('Error creating booking:', error);
      socket.emit('booking_error', { message: 'Failed to create booking' });
    }
  });
  
  // Handle new booking request (for drivers)
  socket.on('new_booking_request', async (bookingData) => {
    // This is handled by the create_booking event above
  });
  
  socket.on('update_auto_accept_settings', async (settings) => {
    console.log('=== SOCKET: UPDATE AUTO ACCEPT SETTINGS ===');
    console.log('Driver:', socket.user.email);
    console.log('Settings:', settings);
    
    try {
      if (socket.user.role !== 'driver') {
        socket.emit('settings_error', { message: 'Only drivers can update auto-accept settings' });
        return;
      }
      
      const driver = await User.findById(socket.user._id);
      if (!driver) {
        socket.emit('settings_error', { message: 'Driver not found' });
        return;
      }
      
      // Initialize driverSettings if it doesn't exist
      if (!driver.driverSettings) {
        driver.driverSettings = {};
      }
      
      driver.driverSettings.autoAcceptSettings = {
        enabled: settings.enabled || false,
        maxDistance: settings.maxDistance || 5,
        minFare: settings.minFare || 0,
        serviceTypes: settings.serviceTypes || [],
        updatedAt: new Date()
      };
      
      await driver.save();
      
      socket.emit('settings_updated', {
        message: 'Auto-accept settings updated successfully',
        settings: driver.driverSettings.autoAcceptSettings
      });
      
      console.log('Auto-accept settings updated for driver:', socket.user._id);
      
    } catch (error) {
      console.error('Error updating auto-accept settings:', error);
      socket.emit('settings_error', { message: 'Failed to update settings' });
    }
  });
  
  socket.on('update_ride_preferences', async (preferences) => {
    console.log('=== SOCKET: UPDATE RIDE PREFERENCES ===');
    console.log('Driver:', socket.user.email);
    console.log('Preferences:', preferences);
    
    try {
      if (socket.user.role !== 'driver') {
        socket.emit('preferences_error', { message: 'Only drivers can update ride preferences' });
        return;
      }
      
      const driver = await User.findById(socket.user._id);
      if (!driver) {
        socket.emit('preferences_error', { message: 'Driver not found' });
        return;
      }
      
      // Initialize driverSettings if it doesn't exist
      if (!driver.driverSettings) {
        driver.driverSettings = {};
      }
      
      driver.driverSettings.ridePreferences = {
        acceptBike: preferences.acceptBike || false,
        acceptRickshaw: preferences.acceptRickshaw || false,
        acceptCar: preferences.acceptCar || false,
        acceptMini: preferences.acceptMini || false,
        pinkCaptainMode: preferences.pinkCaptainMode || false,
        acceptFemaleOnly: preferences.acceptFemaleOnly || false,
        acceptFamilyRides: preferences.acceptFamilyRides || false,
        acceptSafeRides: preferences.acceptSafeRides || false,
        maxRideDistance: preferences.maxRideDistance || 50,
        preferredAreas: preferences.preferredAreas || [],
        updatedAt: new Date()
      };
      
      await driver.save();
      
      socket.emit('preferences_updated', {
        message: 'Ride preferences updated successfully',
        preferences: driver.driverSettings.ridePreferences
      });
      
      console.log('Ride preferences updated for driver:', socket.user._id);
      
    } catch (error) {
      console.error('Error updating ride preferences:', error);
      socket.emit('preferences_error', { message: 'Failed to update preferences' });
    }
  });
  
  // Driver status update
  socket.on('driver_status_update', async (data) => {
    console.log('=== SOCKET: DRIVER STATUS UPDATE ===');
    console.log('Driver:', socket.user.email);
    console.log('Status Data:', data);
    
    try {
      if (socket.user.role !== 'driver') {
        socket.emit('status_error', { message: 'Only drivers can update status' });
        return;
      }
      
      const { isActive, currentLocation } = data;
      
      const driver = await User.findById(socket.user._id);
      if (!driver) {
        socket.emit('status_error', { message: 'Driver not found' });
        return;
      }
      
      // Update driver status
      driver.isActive = isActive;
      driver.lastActiveAt = new Date();
      
      if (currentLocation && currentLocation.coordinates) {
        driver.currentLocation = {
          type: 'Point',
          coordinates: currentLocation.coordinates,
          address: currentLocation.address || ''
        };
      }
      
      await driver.save();
      
      socket.emit('status_updated', {
        message: 'Driver status updated successfully',
        isActive: driver.isActive,
        lastActiveAt: driver.lastActiveAt
      });
      
      console.log('Driver status updated:', socket.user._id, 'Active:', isActive);
      
    } catch (error) {
      console.error('Error updating driver status:', error);
      socket.emit('status_error', { message: 'Failed to update status' });
    }
  });
  
  // Driver location update
  socket.on('driver_location_update', async (data) => {
    console.log('=== SOCKET: DRIVER LOCATION UPDATE ===');
    console.log('Driver:', socket.user.email);
    console.log('Location Data:', data);
    
    try {
      if (socket.user.role !== 'driver') {
        socket.emit('location_error', { message: 'Only drivers can update location' });
        return;
      }
      
      const { coordinates, address, heading, speed } = data;
      
      if (!coordinates || coordinates.length !== 2) {
        socket.emit('location_error', { message: 'Valid coordinates are required' });
        return;
      }
      
      const driver = await User.findById(socket.user._id);
      if (!driver) {
        socket.emit('location_error', { message: 'Driver not found' });
        return;
      }
      
      // Update driver location
      driver.currentLocation = {
        type: 'Point',
        coordinates: coordinates,
        address: address || '',
        heading: heading || 0,
        speed: speed || 0,
        lastUpdated: new Date()
      };
      
      await driver.save();
      
      // Broadcast location to users who have active bookings with this driver
      const activeBookings = await Booking.find({
        driver: driver._id,
        status: { $in: ['accepted', 'started', 'in_progress'] }
      }).populate('user', '_id');
      
      activeBookings.forEach(booking => {
        const userRoom = `user_${booking.user._id}`;
        io.to(userRoom).emit('driver_location_update', {
          bookingId: booking._id,
          driverLocation: {
            coordinates: driver.currentLocation.coordinates,
            heading: driver.currentLocation.heading,
            speed: driver.currentLocation.speed,
            timestamp: driver.currentLocation.lastUpdated
          }
        });
      });
      
      socket.emit('location_updated', {
        message: 'Location updated successfully',
        coordinates: driver.currentLocation.coordinates,
        timestamp: driver.currentLocation.lastUpdated
      });
      
      console.log('Driver location updated:', socket.user._id);
      
    } catch (error) {
      console.error('Error updating driver location:', error);
      socket.emit('location_error', { message: 'Failed to update location' });
    }
  });
  
  // User location update
  socket.on('user_location_update', async (data) => {
    console.log('=== SOCKET: USER LOCATION UPDATE ===');
    console.log('User:', socket.user.email);
    console.log('Location Data:', data);
    
    try {
      if (socket.user.role !== 'user') {
        socket.emit('location_error', { message: 'Only users can update user location' });
        return;
      }
      
      const { coordinates, address, bookingId } = data;
      
      if (!coordinates || coordinates.length !== 2) {
        socket.emit('location_error', { message: 'Valid coordinates are required' });
        return;
      }
      
      const user = await User.findById(socket.user._id);
      if (!user) {
        socket.emit('location_error', { message: 'User not found' });
        return;
      }
      
      // Update user location
      user.currentLocation = {
        type: 'Point',
        coordinates: coordinates,
        address: address || '',
        lastUpdated: new Date()
      };
      
      await user.save();
      
      // If bookingId is provided, notify the assigned driver
      if (bookingId) {
        const booking = await Booking.findById(bookingId).populate('driver', '_id');
        if (booking && booking.driver && ['accepted', 'started', 'in_progress'].includes(booking.status)) {
          const driverRoom = `driver_${booking.driver._id}`;
          io.to(driverRoom).emit('user_location_update', {
            bookingId: booking._id,
            userLocation: {
              coordinates: user.currentLocation.coordinates,
              address: user.currentLocation.address,
              timestamp: user.currentLocation.lastUpdated
            }
          });
        }
      }
      
      socket.emit('location_updated', {
        message: 'Location updated successfully',
        coordinates: user.currentLocation.coordinates,
        timestamp: user.currentLocation.lastUpdated
      });
      
      console.log('User location updated:', socket.user._id);
      
    } catch (error) {
      console.error('Error updating user location:', error);
      socket.emit('location_error', { message: 'Failed to update location' });
    }
  });
  
  // Accept booking request
  socket.on('accept_booking_request', async (data) => {
    console.log('=== SOCKET: ACCEPT BOOKING REQUEST ===');
    console.log('Driver:', socket.user.email);
    console.log('Data:', data);
    
    try {
      const { requestId } = data;
      
      if (!requestId) {
        socket.emit('booking_error', { message: 'Request ID is required' });
        return;
      }
      
      const booking = await Booking.findById(requestId)
        .populate('user', 'firstName lastName email phoneNumber')
        .populate('driver', 'firstName lastName email phoneNumber');
      
      if (!booking) {
        socket.emit('booking_error', { message: 'Booking not found' });
        return;
      }
      
      if (booking.status !== 'pending') {
        socket.emit('booking_error', { message: 'Booking is no longer available' });
        return;
      }
      
      // Update booking with driver and status
      booking.driver = socket.user._id;
      booking.status = 'accepted';
      booking.acceptedAt = new Date();
      
      await booking.save();
      
      // Populate driver data for response
      await booking.populate('driver', 'firstName lastName email phoneNumber');
      
      // Notify user about acceptance
      const userRoom = `user_${booking.user._id}`;
      io.to(userRoom).emit('booking_accepted', {
        bookingId: booking._id,
        driver: {
          id: booking.driver._id,
          name: `${booking.driver.firstName} ${booking.driver.lastName}`,
          phone: booking.driver.phoneNumber,
          email: booking.driver.email
        },
        acceptedAt: booking.acceptedAt,
        message: 'Your booking has been accepted by a driver'
      });
      
      // Confirm acceptance to driver
      socket.emit('booking_accepted_confirmation', {
        bookingId: booking._id,
        user: {
          name: `${booking.user.firstName} ${booking.user.lastName}`,
          phone: booking.user.phoneNumber
        },
        message: 'Booking accepted successfully'
      });
      
      console.log('Booking accepted:', requestId, 'by driver:', socket.user._id);
      
    } catch (error) {
      console.error('Error accepting booking:', error);
      socket.emit('booking_error', { message: 'Failed to accept booking' });
    }
  });
  
  // Reject booking request
  socket.on('reject_booking_request', async (data) => {
    console.log('=== SOCKET: REJECT BOOKING REQUEST ===');
    console.log('Driver:', socket.user.email);
    console.log('Data:', data);
    
    try {
      const { requestId, reason } = data;
      
      if (!requestId) {
        socket.emit('booking_error', { message: 'Request ID is required' });
        return;
      }
      
      const booking = await Booking.findById(requestId);
      
      if (!booking) {
        socket.emit('booking_error', { message: 'Booking not found' });
        return;
      }
      
      if (booking.status !== 'pending') {
        socket.emit('booking_error', { message: 'Booking is no longer available' });
        return;
      }
      
      // Add driver to rejected list
      if (!booking.rejectedDrivers) {
        booking.rejectedDrivers = [];
      }
      
      booking.rejectedDrivers.push({
        driver: socket.user._id,
        reason: reason || 'No reason provided',
        rejectedAt: new Date()
      });
      
      await booking.save();
      
      // Confirm rejection to driver
      socket.emit('booking_rejected_confirmation', {
        bookingId: booking._id,
        message: 'Booking rejected successfully'
      });
      
      console.log('Booking rejected:', requestId, 'by driver:', socket.user._id);
      
    } catch (error) {
      console.error('Error rejecting booking:', error);
      socket.emit('booking_error', { message: 'Failed to reject booking' });
    }
  });
  
  // Get zone information
  const getZone = (coordinates) => {
    // Mock zone detection - replace with actual zone logic
    const [lng, lat] = coordinates;
    
    // Example zones (replace with your actual zone boundaries)
    if (lat >= 28.4 && lat <= 28.8 && lng >= 77.0 && lng <= 77.4) {
      return 'Delhi Central';
    } else if (lat >= 28.3 && lat <= 28.7 && lng >= 77.1 && lng <= 77.5) {
      return 'Delhi South';
    } else {
      return 'Other';
    }
  };
};

// Helper function to find nearby drivers
export const findNearbyDrivers = async (booking, io = null) => {
  try {
    console.log('=== FINDING NEARBY DRIVERS ===');
    console.log('Booking ID:', booking._id);
    console.log('Service Type:', booking.serviceType);
    console.log('Vehicle Type:', booking.vehicleType);
    console.log('Driver Preference:', booking.driverPreference);
    
    let driverQuery = {
      role: 'driver',
      kycLevel: 2,
      kycStatus: 'approved',
      isActive: true
    };

    // Handle Pink Captain preferences
    if (booking.driverPreference === 'pink_captain') {
      driverQuery.gender = 'female';
      console.log('Pink Captain requested - filtering for female drivers');
    }

    // Handle vehicle type filtering
    if (booking.vehicleType && booking.vehicleType !== 'any') {
      driverQuery.vehicleType = booking.vehicleType;
    }

    console.log('Driver Query:', driverQuery);

    // Find drivers based on query
    const drivers = await User.find(driverQuery);
    console.log(`Found ${drivers.length} potential drivers`);

    if (drivers.length === 0) {
      console.log('No drivers found matching criteria');
      return [];
    }

    // Calculate distances and filter by radius
    const driversWithDistance = [];
    const maxRadius = booking.driverPreference === 'pink_captain' ? 50 : 5; // 50km for Pink Captain, 5km for regular

    for (const driver of drivers) {
      if (driver.currentLocation && driver.currentLocation.coordinates) {
        const distance = calculateDistance(
          booking.pickupLocation.coordinates[1],
          booking.pickupLocation.coordinates[0],
          driver.currentLocation.coordinates[1],
          driver.currentLocation.coordinates[0]
        );

        if (distance <= maxRadius) {
          driversWithDistance.push({
            ...driver.toObject(),
            distance: distance
          });
        }
      }
    }

    // Sort by distance
    driversWithDistance.sort((a, b) => a.distance - b.distance);
    
    console.log(`Found ${driversWithDistance.length} drivers within ${maxRadius}km radius`);
    return driversWithDistance;

  } catch (error) {
    console.error('Error finding nearby drivers:', error);
    return [];
  }
};

// Helper function to get fare adjustment settings
const getFareAdjustmentSettings = async (serviceType) => {
  try {
    // Mock fare adjustment settings (replace with database lookup in production)
    const defaultSettings = {
      allowedAdjustmentPercentage: 20, // Allow 20% fare adjustment
      enableUserFareAdjustment: true,
      enableDriverFareAdjustment: true,
      minimumFare: 10,
      maximumFare: 1000
    };
    
    // You can customize settings based on service type
    switch (serviceType) {
      case 'car cab':
        return { ...defaultSettings, allowedAdjustmentPercentage: 15 };
      case 'shifting & movers':
        return { ...defaultSettings, allowedAdjustmentPercentage: 25 };
      case 'car recovery':
        return { ...defaultSettings, allowedAdjustmentPercentage: 30 };
      default:
        return defaultSettings;
    }
  } catch (error) {
    console.error('Error getting fare adjustment settings:', error);
    return {
      allowedAdjustmentPercentage: 20,
      enableUserFareAdjustment: true,
      enableDriverFareAdjustment: true,
      minimumFare: 10,
      maximumFare: 1000
    };
  }
};