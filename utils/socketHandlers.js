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
        acceptFamilyWithGuardianMale: preferences.acceptFamilyWithGuardianMale || false,
        acceptMaleWithoutFemale: preferences.acceptMaleWithoutFemale || false,
        acceptNoMaleCompanion: preferences.acceptNoMaleCompanion || false,
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

  // Modify booking fare (Driver action)
  socket.on('modify_booking_fare', async (data) => {
    console.log('=== SOCKET: MODIFY BOOKING FARE ===');
    console.log('Driver:', socket.user.email);
    console.log('Data:', data);
    
    try {
      const { requestId, newFare, reason } = data;
      
      if (!requestId || !newFare) {
        socket.emit('booking_error', { message: 'Request ID and new fare are required' });
        return;
      }
      
      if (socket.user.role !== 'driver') {
        socket.emit('booking_error', { message: 'Only drivers can modify fare' });
        return;
      }
      
      const booking = await Booking.findById(requestId)
        .populate('user', 'firstName lastName email phoneNumber');
      
      if (!booking) {
        socket.emit('booking_error', { message: 'Booking not found' });
        return;
      }
      
      if (booking.status !== 'pending') {
        socket.emit('booking_error', { message: 'Fare can only be modified for pending bookings' });
        return;
      }
      
      // Get fare adjustment settings
      const fareSettings = await getFareAdjustmentSettings(booking.serviceType);
      
      if (!fareSettings.enableDriverFareAdjustment) {
        socket.emit('booking_error', { message: 'Driver fare adjustment is disabled' });
        return;
      }
      
      // Validate fare adjustment limits
      const originalFare = booking.fare;
      const maxAllowedFare = originalFare * (1 + fareSettings.allowedAdjustmentPercentage / 100);
      const minAllowedFare = originalFare * (1 - fareSettings.allowedAdjustmentPercentage / 100);
      
      if (newFare > maxAllowedFare || newFare < minAllowedFare) {
        socket.emit('booking_error', {
          message: `Fare adjustment exceeds allowed limit of ${fareSettings.allowedAdjustmentPercentage}%`,
          allowedRange: {
            min: minAllowedFare,
            max: maxAllowedFare
          }
        });
        return;
      }
      
      if (newFare < fareSettings.minimumFare || newFare > fareSettings.maximumFare) {
        socket.emit('booking_error', {
          message: `Fare must be between ${fareSettings.minimumFare} and ${fareSettings.maximumFare}`,
          allowedRange: {
            min: fareSettings.minimumFare,
            max: fareSettings.maximumFare
          }
        });
        return;
      }
      
      // Store fare modification request
      booking.fareModificationRequest = {
        requestedBy: socket.user._id,
        originalFare: originalFare,
        requestedFare: newFare,
        reason: reason || 'No reason provided',
        requestedAt: new Date(),
        status: 'pending'
      };
      
      await booking.save();
      
      // Notify user about fare modification request
      const userRoom = `user_${booking.user._id}`;
      io.to(userRoom).emit('fare_modification_request', {
        bookingId: booking._id,
        originalFare: originalFare,
        requestedFare: newFare,
        reason: reason || 'No reason provided',
        driver: {
          id: socket.user._id,
          name: `${socket.user.firstName} ${socket.user.lastName}`
        },
        requestedAt: booking.fareModificationRequest.requestedAt
      });
      
      // Confirm fare modification request to driver
      socket.emit('fare_modification_sent', {
        bookingId: booking._id,
        message: 'Fare modification request sent to user',
        originalFare: originalFare,
        requestedFare: newFare
      });
      
      console.log('Fare modification requested:', requestId, 'by driver:', socket.user._id);
      
    } catch (error) {
      console.error('Error modifying booking fare:', error);
      socket.emit('booking_error', { message: 'Failed to modify fare' });
    }
  });

  // Respond to fare modification (User action)
  socket.on('respond_to_fare_modification', async (data) => {
    console.log('=== SOCKET: RESPOND TO FARE MODIFICATION ===');
    console.log('User:', socket.user.email);
    console.log('Data:', data);
    
    try {
      const { bookingId, response, reason } = data; // response: 'accept' or 'reject'
      
      if (!bookingId || !response) {
        socket.emit('booking_error', { message: 'Booking ID and response are required' });
        return;
      }
      
      if (socket.user.role !== 'user') {
        socket.emit('booking_error', { message: 'Only users can respond to fare modifications' });
        return;
      }
      
      if (!['accept', 'reject'].includes(response)) {
        socket.emit('booking_error', { message: 'Response must be either accept or reject' });
        return;
      }
      
      const booking = await Booking.findById(bookingId)
        .populate('user', 'firstName lastName email phoneNumber');
      
      if (!booking) {
        socket.emit('booking_error', { message: 'Booking not found' });
        return;
      }
      
      if (booking.user._id.toString() !== socket.user._id.toString()) {
        socket.emit('booking_error', { message: 'You can only respond to your own bookings' });
        return;
      }
      
      if (!booking.fareModificationRequest || booking.fareModificationRequest.status !== 'pending') {
        socket.emit('booking_error', { message: 'No pending fare modification request found' });
        return;
      }
      
      // Update fare modification request status
      booking.fareModificationRequest.status = response === 'accept' ? 'accepted' : 'rejected';
      booking.fareModificationRequest.respondedAt = new Date();
      booking.fareModificationRequest.userResponse = {
        response: response,
        reason: reason || 'No reason provided'
      };
      
      // If accepted, update the booking fare and automatically start the ride
      if (response === 'accept') {
        booking.fare = booking.fareModificationRequest.requestedFare;
        booking.fareModifiedAt = new Date();
        
        // Automatically start the ride when fare modification is accepted
        if (booking.status === 'pending') {
          booking.status = 'started';
          booking.acceptedAt = new Date();
          booking.startedAt = new Date();
        }
      }
      
      await booking.save();
      
      // Notify driver about user's response
      const driverRoom = `driver_${booking.fareModificationRequest.requestedBy}`;
      io.to(driverRoom).emit('fare_modification_response', {
        bookingId: booking._id,
        response: response,
        originalFare: booking.fareModificationRequest.originalFare,
        requestedFare: booking.fareModificationRequest.requestedFare,
        finalFare: booking.fare,
        reason: reason || 'No reason provided',
        respondedAt: booking.fareModificationRequest.respondedAt,
        rideStarted: response === 'accept' && booking.status === 'started'
      });
      
      // If fare was accepted and ride started, send ride start notifications
      if (response === 'accept' && booking.status === 'started') {
        // Populate driver data for notifications
        await booking.populate('driver', 'firstName lastName phoneNumber');
        
        // Notify user that ride has started
        const userRoom = `user_${booking.user._id}`;
        io.to(userRoom).emit('ride_started', {
          bookingId: booking._id,
          message: 'Your ride has started after fare acceptance!',
          status: 'started',
          startedAt: booking.startedAt,
          driver: {
            id: booking.driver._id,
            name: `${booking.driver.firstName} ${booking.driver.lastName}`,
            phone: booking.driver.phoneNumber
          }
        });
        
        // Notify driver that ride has started
        io.to(driverRoom).emit('ride_started', {
          bookingId: booking._id,
          message: 'Ride started after user accepted your fare modification!',
          status: 'started',
          startedAt: booking.startedAt,
          user: {
            id: booking.user._id,
            name: `${booking.user.firstName} ${booking.user.lastName}`,
            phone: booking.user.phoneNumber
          }
        });
      }
      
      // Confirm response to user
      socket.emit('fare_modification_responded', {
        bookingId: booking._id,
        message: `Fare modification ${response}ed successfully${response === 'accept' && booking.status === 'started' ? ' and ride started!' : ''}`,
        response: response,
        finalFare: booking.fare,
        rideStarted: response === 'accept' && booking.status === 'started'
      });
      
      console.log('Fare modification response:', bookingId, 'response:', response, 'by user:', socket.user._id);
      
    } catch (error) {
       console.error('Error responding to fare modification:', error);
       socket.emit('booking_error', { message: 'Failed to respond to fare modification' });
     }
   });

  // Cancel booking request (User action)
  socket.on('cancel_booking_request', async (data) => {
    console.log('=== SOCKET: CANCEL BOOKING REQUEST ===');
    console.log('User:', socket.user.email);
    console.log('Data:', data);
    
    try {
      const { bookingId, reason } = data;
      
      if (!bookingId) {
        socket.emit('booking_error', { message: 'Booking ID is required' });
        return;
      }
      
      if (socket.user.role !== 'user') {
        socket.emit('booking_error', { message: 'Only users can cancel their bookings' });
        return;
      }
      
      const booking = await Booking.findById(bookingId)
        .populate('user', 'firstName lastName email phoneNumber')
        .populate('driver', 'firstName lastName email phoneNumber');
      
      if (!booking) {
        socket.emit('booking_error', { message: 'Booking not found' });
        return;
      }
      
      if (booking.user._id.toString() !== socket.user._id.toString()) {
        socket.emit('booking_error', { message: 'You can only cancel your own bookings' });
        return;
      }
      
      if (!['pending', 'accepted'].includes(booking.status)) {
        socket.emit('booking_error', { message: 'Booking cannot be cancelled at this stage' });
        return;
      }
      
      // Update booking status
      booking.status = 'cancelled';
      booking.cancelledAt = new Date();
      booking.cancellationReason = reason || 'No reason provided';
      booking.cancelledBy = socket.user._id;
      
      await booking.save();
      
      // If booking was accepted, notify the driver
      if (booking.driver && booking.status === 'accepted') {
        const driverRoom = `driver_${booking.driver._id}`;
        io.to(driverRoom).emit('booking_cancelled', {
          bookingId: booking._id,
          message: 'Booking has been cancelled by the user',
          reason: booking.cancellationReason,
          cancelledAt: booking.cancelledAt,
          user: {
            name: `${booking.user.firstName} ${booking.user.lastName}`,
            phone: booking.user.phoneNumber
          }
        });
      }
      
      // Confirm cancellation to user
      socket.emit('booking_cancelled_confirmation', {
        bookingId: booking._id,
        message: 'Booking cancelled successfully',
        cancelledAt: booking.cancelledAt
      });
      
      console.log('Booking cancelled:', bookingId, 'by user:', socket.user._id);
      
    } catch (error) {
      console.error('Error cancelling booking:', error);
      socket.emit('booking_error', { message: 'Failed to cancel booking' });
    }
  });

  // User increases fare when no drivers respond
  socket.on('increase_fare_and_resend', async (data) => {
    console.log('=== SOCKET: INCREASE FARE AND RESEND ===');
    console.log('User:', socket.user.email);
    console.log('Data:', data);
    
    try {
      const { bookingId, newFare, reason } = data;
      
      if (!bookingId || !newFare) {
        socket.emit('fare_increase_error', { message: 'Booking ID and new fare are required' });
        return;
      }
      
      if (socket.user.role !== 'user') {
        socket.emit('fare_increase_error', { message: 'Only users can increase fare' });
        return;
      }
      
      const booking = await Booking.findById(bookingId)
        .populate('user', 'firstName lastName email phoneNumber');
      
      if (!booking) {
        socket.emit('fare_increase_error', { message: 'Booking not found' });
        return;
      }
      
      if (booking.user._id.toString() !== socket.user._id.toString()) {
        socket.emit('fare_increase_error', { message: 'You can only modify your own bookings' });
        return;
      }
      
      if (booking.status !== 'pending') {
        socket.emit('fare_increase_error', { message: 'Can only increase fare for pending bookings' });
        return;
      }
      
      // Check if maximum resend attempts reached
      if (booking.resendAttempts >= booking.maxResendAttempts) {
        socket.emit('fare_increase_error', { 
          message: `Maximum resend attempts (${booking.maxResendAttempts}) reached` 
        });
        return;
      }
      
      // Validate fare increase (must be higher than current fare)
      if (newFare <= booking.fare) {
        socket.emit('fare_increase_error', { 
          message: 'New fare must be higher than current fare' 
        });
        return;
      }
      
      // Validate reasonable fare increase (max 50% increase per attempt)
      const maxIncrease = booking.fare * 1.5;
      if (newFare > maxIncrease) {
        socket.emit('fare_increase_error', { 
          message: `Fare increase too high. Maximum allowed: ${maxIncrease.toFixed(2)} AED` 
        });
        return;
      }
      
      // Record the fare increase
      const originalFare = booking.fare;
      booking.userFareIncreases.push({
        originalFare: originalFare,
        increasedFare: newFare,
        reason: reason || 'No drivers responding',
        increasedAt: new Date(),
        resendAttempt: booking.resendAttempts + 1
      });
      
      // Update booking with new fare and resend info
      booking.fare = newFare;
      booking.resendAttempts += 1;
      booking.lastResendAt = new Date();
      
      await booking.save();
      
      // Find nearby drivers again
      const nearbyDrivers = await findNearbyDrivers(booking, io);
      
      if (nearbyDrivers.length === 0) {
        socket.emit('fare_increase_error', { 
          message: 'Still no drivers available in your area. You can try increasing the fare again.' 
        });
        return;
      }
      
      // Send updated booking request to nearby drivers
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
          originalFare: originalFare,
          fareIncreased: true,
          resendAttempt: booking.resendAttempts,
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
      
      // Confirm fare increase and resend to user
      socket.emit('fare_increased_and_resent', {
        bookingId: booking._id,
        originalFare: originalFare,
        newFare: newFare,
        resendAttempt: booking.resendAttempts,
        maxAttempts: booking.maxResendAttempts,
        driversFound: nearbyDrivers.length,
        message: `Fare increased to ${newFare} AED and request resent to ${nearbyDrivers.length} drivers`
      });
      
      console.log('Fare increased and booking resent:', {
        bookingId: booking._id,
        originalFare,
        newFare,
        resendAttempt: booking.resendAttempts,
        driversFound: nearbyDrivers.length
      });
      
    } catch (error) {
      console.error('Error increasing fare and resending:', error);
      socket.emit('fare_increase_error', { message: 'Failed to increase fare and resend booking' });
    }
  });

  // Real-time messaging between users and drivers
  socket.on('send_message', async (data) => {
    console.log('=== SOCKET: SEND MESSAGE (USER) ===');
    console.log('User:', socket.user.email);
    console.log('Message Data:', data);
    
    try {
      const { bookingId, message, messageType = 'text', location } = data;
      
      if (!bookingId || !message) {
        socket.emit('message_error', { message: 'Booking ID and message are required' });
        return;
      }
      
      if (socket.user.role !== 'user') {
        socket.emit('message_error', { message: 'Only users can send messages via this event' });
        return;
      }
      
      // Find the booking and verify user access
      const booking = await Booking.findById(bookingId)
        .populate('user', '_id firstName lastName')
        .populate('driver', '_id firstName lastName');
      
      if (!booking) {
        socket.emit('message_error', { message: 'Booking not found' });
        return;
      }
      
      if (booking.user._id.toString() !== socket.user._id.toString()) {
        socket.emit('message_error', { message: 'Unauthorized to send message for this booking' });
        return;
      }
      
      if (!booking.driver) {
        socket.emit('message_error', { message: 'No driver assigned to this booking yet' });
        return;
      }
      
      if (!['accepted', 'started', 'in_progress'].includes(booking.status)) {
        socket.emit('message_error', { message: 'Messages can only be sent for active rides' });
        return;
      }
      
      // Create message object
      const newMessage = {
        sender: socket.user._id,
        senderType: 'user',
        message: message.trim(),
        messageType: messageType,
        timestamp: new Date()
      };
      
      // Add location if provided for location messages
      if (messageType === 'location' && location && location.coordinates) {
        newMessage.location = {
          type: 'Point',
          coordinates: location.coordinates
        };
      }
      
      // Add message to booking
      booking.messages.push(newMessage);
      await booking.save();
      
      // Get the saved message with populated data
      const savedMessage = booking.messages[booking.messages.length - 1];
      
      // Broadcast message to driver
      const driverRoom = `driver_${booking.driver._id}`;
      io.to(driverRoom).emit('message_received', {
        bookingId: booking._id,
        message: {
          id: savedMessage._id,
          sender: {
            id: booking.user._id,
            name: `${booking.user.firstName} ${booking.user.lastName}`,
            type: 'user'
          },
          content: savedMessage.message,
          messageType: savedMessage.messageType,
          location: savedMessage.location,
          timestamp: savedMessage.timestamp
        }
      });
      
      // Confirm message sent to user
      socket.emit('message_sent', {
        bookingId: booking._id,
        messageId: savedMessage._id,
        timestamp: savedMessage.timestamp,
        message: 'Message sent successfully'
      });
      
      console.log('Message sent from user to driver:', {
        bookingId: booking._id,
        userId: socket.user._id,
        driverId: booking.driver._id,
        messageType: savedMessage.messageType
      });
      
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('message_error', { message: 'Failed to send message' });
    }
  });
  
  // Real-time messaging from drivers to users
  socket.on('send_ride_message', async (data) => {
    console.log('=== SOCKET: SEND RIDE MESSAGE (DRIVER) ===');
    console.log('Driver:', socket.user.email);
    console.log('Message Data:', data);
    
    try {
      const { bookingId, message, messageType = 'text', location } = data;
      
      if (!bookingId || !message) {
        socket.emit('ride_message_error', { message: 'Booking ID and message are required' });
        return;
      }
      
      if (socket.user.role !== 'driver') {
        socket.emit('ride_message_error', { message: 'Only drivers can send ride messages' });
        return;
      }
      
      // Find the booking and verify driver access
      const booking = await Booking.findById(bookingId)
        .populate('user', '_id firstName lastName')
        .populate('driver', '_id firstName lastName');
      
      if (!booking) {
        socket.emit('ride_message_error', { message: 'Booking not found' });
        return;
      }
      
      if (!booking.driver || booking.driver._id.toString() !== socket.user._id.toString()) {
        socket.emit('ride_message_error', { message: 'Unauthorized to send message for this booking' });
        return;
      }
      
      if (!['accepted', 'started', 'in_progress'].includes(booking.status)) {
        socket.emit('ride_message_error', { message: 'Messages can only be sent for active rides' });
        return;
      }
      
      // Create message object
      const newMessage = {
        sender: socket.user._id,
        senderType: 'driver',
        message: message.trim(),
        messageType: messageType,
        timestamp: new Date()
      };
      
      // Add location if provided for location messages
      if (messageType === 'location' && location && location.coordinates) {
        newMessage.location = {
          type: 'Point',
          coordinates: location.coordinates
        };
      }
      
      // Add message to booking
      booking.messages.push(newMessage);
      await booking.save();
      
      // Get the saved message with populated data
      const savedMessage = booking.messages[booking.messages.length - 1];
      
      // Broadcast message to user
      const userRoom = `user_${booking.user._id}`;
      io.to(userRoom).emit('ride_message', {
        bookingId: booking._id,
        message: {
          id: savedMessage._id,
          sender: {
            id: booking.driver._id,
            name: `${booking.driver.firstName} ${booking.driver.lastName}`,
            type: 'driver'
          },
          content: savedMessage.message,
          messageType: savedMessage.messageType,
          location: savedMessage.location,
          timestamp: savedMessage.timestamp
        }
      });
      
      // Confirm message sent to driver
      socket.emit('ride_message_sent', {
        bookingId: booking._id,
        messageId: savedMessage._id,
        timestamp: savedMessage.timestamp,
        message: 'Message sent successfully'
      });
      
      console.log('Message sent from driver to user:', {
        bookingId: booking._id,
        driverId: socket.user._id,
        userId: booking.user._id,
        messageType: savedMessage.messageType
      });
      
    } catch (error) {
      console.error('Error sending ride message:', error);
      socket.emit('ride_message_error', { message: 'Failed to send message' });
    }
  });

  // Start ride (Driver action)
  socket.on('start_ride', async (data) => {
    console.log('=== SOCKET: START RIDE ===');
    console.log('Driver:', socket.user.email);
    console.log('Data:', data);
    
    try {
      const { bookingId } = data;
      
      if (!bookingId) {
        socket.emit('booking_error', { message: 'Booking ID is required' });
        return;
      }
      
      if (socket.user.role !== 'driver') {
        socket.emit('booking_error', { message: 'Only drivers can start rides' });
        return;
      }
      
      const booking = await Booking.findById(bookingId)
        .populate('user', 'firstName lastName email phoneNumber')
        .populate('driver', 'firstName lastName email phoneNumber');
      
      if (!booking) {
        socket.emit('booking_error', { message: 'Booking not found' });
        return;
      }
      
      if (!booking.driver || booking.driver._id.toString() !== socket.user._id.toString()) {
        socket.emit('booking_error', { message: 'You are not assigned to this booking' });
        return;
      }
      
      if (booking.status !== 'accepted') {
        socket.emit('booking_error', { message: 'Ride can only be started for accepted bookings' });
        return;
      }
      
      // Update booking status to started
      booking.status = 'started';
      booking.startedAt = new Date();
      await booking.save();
      
      // Notify user that ride has started
      const userRoom = `user_${booking.user._id}`;
      io.to(userRoom).emit('ride_started', {
        bookingId: booking._id,
        message: 'Your ride has started!',
        status: 'started',
        startedAt: booking.startedAt,
        driver: {
          id: booking.driver._id,
          name: `${booking.driver.firstName} ${booking.driver.lastName}`,
          phone: booking.driver.phoneNumber
        }
      });
      
      // Confirm ride start to driver
      socket.emit('ride_started', {
        bookingId: booking._id,
        message: 'Ride started successfully!',
        status: 'started',
        startedAt: booking.startedAt,
        user: {
          id: booking.user._id,
          name: `${booking.user.firstName} ${booking.user.lastName}`,
          phone: booking.user.phoneNumber
        }
      });
      
      console.log('Ride started:', bookingId, 'by driver:', socket.user._id);
      
    } catch (error) {
      console.error('Error starting ride:', error);
      socket.emit('booking_error', { message: 'Failed to start ride' });
    }
  });

  // Complete ride (Driver action)
  socket.on('complete_ride', async (data) => {
    console.log('=== SOCKET: COMPLETE RIDE ===');
    console.log('Driver:', socket.user.email);
    console.log('Data:', data);
    
    try {
      const { bookingId, finalLocation, actualDistance, actualDuration } = data;
      
      if (!bookingId) {
        socket.emit('booking_error', { message: 'Booking ID is required' });
        return;
      }
      
      if (socket.user.role !== 'driver') {
        socket.emit('booking_error', { message: 'Only drivers can complete rides' });
        return;
      }
      
      const booking = await Booking.findById(bookingId)
        .populate('user', 'firstName lastName email phoneNumber wallet')
        .populate('driver', 'firstName lastName email phoneNumber wallet driverPaymentTracking');
      
      if (!booking) {
        socket.emit('booking_error', { message: 'Booking not found' });
        return;
      }
      
      if (!booking.driver || booking.driver._id.toString() !== socket.user._id.toString()) {
        socket.emit('booking_error', { message: 'You are not assigned to this booking' });
        return;
      }
      
      if (!['started', 'in_progress'].includes(booking.status)) {
        socket.emit('booking_error', { message: 'Ride can only be completed for started or in-progress rides' });
        return;
      }
      
      // Update booking status to completed
      booking.status = 'completed';
      booking.completedAt = new Date();
      
      // Add final location if provided
      if (finalLocation && finalLocation.coordinates) {
        booking.finalLocation = {
          type: 'Point',
          coordinates: finalLocation.coordinates,
          address: finalLocation.address || ''
        };
      }
      
      // Add actual trip data if provided
      if (actualDistance) booking.actualDistance = actualDistance;
      if (actualDuration) booking.actualDuration = actualDuration;
      
      // Generate receipt
      const receipt = {
        bookingId: booking._id,
        fare: booking.fare,
        distance: booking.actualDistance || booking.distanceInMeters,
        duration: booking.actualDuration || booking.estimatedDuration,
        serviceType: booking.serviceType,
        vehicleType: booking.vehicleType,
        paymentMethod: booking.paymentMethod,
        completedAt: booking.completedAt,
        pickupLocation: booking.pickupLocation,
        dropoffLocation: booking.dropoffLocation,
        finalLocation: booking.finalLocation
      };
      
      booking.receipt = receipt;
      await booking.save();
      
      // Notify user that ride is completed
      const userRoom = `user_${booking.user._id}`;
      io.to(userRoom).emit('ride_completed', {
        bookingId: booking._id,
        message: 'Your ride has been completed successfully!',
        status: 'completed',
        completedAt: booking.completedAt,
        receipt: receipt,
        driver: {
          id: booking.driver._id,
          name: `${booking.driver.firstName} ${booking.driver.lastName}`,
          phone: booking.driver.phoneNumber
        }
      });
      
      // Confirm ride completion to driver
      socket.emit('ride_completed', {
        bookingId: booking._id,
        message: 'Ride completed successfully!',
        status: 'completed',
        completedAt: booking.completedAt,
        receipt: receipt,
        user: {
          id: booking.user._id,
          name: `${booking.user.firstName} ${booking.user.lastName}`,
          phone: booking.user.phoneNumber
        }
      });
      
      console.log('Ride completed:', bookingId, 'by driver:', socket.user._id);
      
    } catch (error) {
      console.error('Error completing ride:', error);
      socket.emit('booking_error', { message: 'Failed to complete ride' });
    }
  });
  
  // Update ride status event
  socket.on('update_ride_status', async (data) => {
    console.log('=== SOCKET: UPDATE RIDE STATUS ===');
    console.log('User:', socket.user.email);
    console.log('Data:', data);
    
    try {
      const { bookingId, status } = data;
      
      if (!bookingId || !status) {
        socket.emit('booking_error', { message: 'Booking ID and status are required' });
        return;
      }
      
      const booking = await Booking.findById(bookingId)
        .populate('user', 'firstName lastName email phoneNumber')
        .populate('driver', 'firstName lastName email phoneNumber');
      
      if (!booking) {
        socket.emit('booking_error', { message: 'Booking not found' });
        return;
      }
      
      // Verify user authorization
      if (socket.user.role === 'driver' && booking.driver._id.toString() !== socket.user._id.toString()) {
        socket.emit('booking_error', { message: 'You can only update your own bookings' });
        return;
      }
      
      if (socket.user.role === 'user' && booking.user._id.toString() !== socket.user._id.toString()) {
        socket.emit('booking_error', { message: 'You can only update your own bookings' });
        return;
      }
      
      // Update booking status
      booking.status = status;
      
      // Set appropriate timestamps
      if (status === 'driver_arriving') {
        booking.driverArrivingAt = new Date();
      } else if (status === 'driver_arrived') {
        booking.driverArrivedAt = new Date();
      } else if (status === 'ride_started') {
        booking.startedAt = new Date();
      } else if (status === 'ride_completed') {
        booking.completedAt = new Date();
      }
      
      await booking.save();
      
      // Notify both user and driver
      const userRoom = `user_${booking.user._id}`;
      const driverRoom = `driver_${booking.driver._id}`;
      
      const statusUpdate = {
        bookingId: booking._id,
        status: status,
        message: `Ride status updated to ${status}`,
        updatedAt: new Date()
      };
      
      io.to(userRoom).emit('ride_status_update', statusUpdate);
      io.to(driverRoom).emit('ride_status_update', statusUpdate);
      
      console.log('Ride status updated:', bookingId, 'to', status);
      
    } catch (error) {
      console.error('Error updating ride status:', error);
      socket.emit('booking_error', { message: 'Failed to update ride status' });
    }
  });
  
  // Update booking status event
  socket.on('booking_status_update', async (data) => {
    console.log('=== SOCKET: BOOKING STATUS UPDATE ===');
    console.log('User:', socket.user.email);
    console.log('Data:', data);
    
    try {
      const { bookingId, status, reason } = data;
      
      if (!bookingId || !status) {
        socket.emit('booking_error', { message: 'Booking ID and status are required' });
        return;
      }
      
      const booking = await Booking.findById(bookingId)
        .populate('user', 'firstName lastName email phoneNumber')
        .populate('driver', 'firstName lastName email phoneNumber');
      
      if (!booking) {
        socket.emit('booking_error', { message: 'Booking not found' });
        return;
      }
      
      // Verify user authorization
      const isUser = socket.user.role === 'user' && booking.user._id.toString() === socket.user._id.toString();
      const isDriver = socket.user.role === 'driver' && booking.driver && booking.driver._id.toString() === socket.user._id.toString();
      
      if (!isUser && !isDriver) {
        socket.emit('booking_error', { message: 'You can only update your own bookings' });
        return;
      }
      
      // Update booking status
      booking.status = status;
      
      // Set appropriate timestamps and reason
      if (status === 'cancelled') {
        booking.cancelledAt = new Date();
        booking.cancellationReason = reason || 'No reason provided';
      } else if (status === 'accepted') {
        booking.acceptedAt = new Date();
      } else if (status === 'pending') {
        // Reset timestamps if going back to pending
        booking.acceptedAt = null;
        booking.cancelledAt = null;
      }
      
      await booking.save();
      
      // Notify relevant parties
      const userRoom = `user_${booking.user._id}`;
      const statusUpdate = {
        bookingId: booking._id,
        status: status,
        reason: reason,
        message: `Booking status updated to ${status}`,
        updatedAt: new Date()
      };
      
      if (isUser) {
        // User updated status, notify driver if assigned
        if (booking.driver) {
          const driverRoom = `driver_${booking.driver._id}`;
          io.to(driverRoom).emit('booking_status_update', statusUpdate);
        }
      } else if (isDriver) {
        // Driver updated status, notify user
        io.to(userRoom).emit('booking_status_update', statusUpdate);
      }
      
      // Confirm to the sender
      socket.emit('booking_status_update', {
        ...statusUpdate,
        message: 'Status updated successfully'
      });
      
      console.log('Booking status updated:', bookingId, 'to', status, 'by', socket.user.role);
      
    } catch (error) {
      console.error('Error updating booking status:', error);
      socket.emit('booking_error', { message: 'Failed to update booking status' });
    }
  });
  
  // Submit rating event
  socket.on('submit_rating', async (data) => {
    console.log('=== SOCKET: SUBMIT RATING ===');
    console.log('User:', socket.user.email);
    console.log('Data:', data);
    
    try {
      const { bookingId, targetUserId, rating, review } = data;
      
      if (!bookingId || !targetUserId || !rating) {
        socket.emit('rating_error', { message: 'Booking ID, target user ID, and rating are required' });
        return;
      }
      
      if (rating < 1 || rating > 5) {
        socket.emit('rating_error', { message: 'Rating must be between 1 and 5' });
        return;
      }
      
      const booking = await Booking.findById(bookingId)
        .populate('user', 'firstName lastName email phoneNumber')
        .populate('driver', 'firstName lastName email phoneNumber');
      
      if (!booking) {
        socket.emit('rating_error', { message: 'Booking not found' });
        return;
      }
      
      if (booking.status !== 'completed') {
        socket.emit('rating_error', { message: 'Can only rate completed rides' });
        return;
      }
      
      // Verify user authorization and target
      const isUser = socket.user.role === 'user' && booking.user._id.toString() === socket.user._id.toString();
      const isDriver = socket.user.role === 'driver' && booking.driver && booking.driver._id.toString() === socket.user._id.toString();
      
      if (!isUser && !isDriver) {
        socket.emit('rating_error', { message: 'You can only rate your own completed rides' });
        return;
      }
      
      // Find target user
      const targetUser = await User.findById(targetUserId);
      if (!targetUser) {
        socket.emit('rating_error', { message: 'Target user not found' });
        return;
      }
      
      // Add rating to booking
      const ratingData = {
        rating: rating,
        review: review || '',
        ratedBy: socket.user._id,
        ratedUser: targetUserId,
        submittedAt: new Date()
      };
      
      if (!booking.ratings) {
        booking.ratings = [];
      }
      
      // Check if user already rated this booking
      const existingRating = booking.ratings.find(r => r.ratedBy.toString() === socket.user._id.toString());
      if (existingRating) {
        socket.emit('rating_error', { message: 'You have already rated this ride' });
        return;
      }
      
      booking.ratings.push(ratingData);
      await booking.save();
      
      // Update target user's average rating
      const userRatings = await Booking.aggregate([
        { $unwind: '$ratings' },
        { $match: { 'ratings.ratedUser': targetUser._id } },
        { $group: { _id: null, avgRating: { $avg: '$ratings.rating' }, count: { $sum: 1 } } }
      ]);
      
      if (userRatings.length > 0) {
        targetUser.averageRating = Math.round(userRatings[0].avgRating * 10) / 10;
        targetUser.totalRatings = userRatings[0].count;
        await targetUser.save();
      }
      
      // Confirm rating submission
      socket.emit('rating_submitted', {
        bookingId: booking._id,
        rating: rating,
        message: 'Rating submitted successfully',
        targetUser: {
          id: targetUser._id,
          name: `${targetUser.firstName} ${targetUser.lastName}`,
          newAverageRating: targetUser.averageRating
        }
      });
      
      console.log('Rating submitted:', bookingId, 'rating:', rating, 'for user:', targetUserId);
      
    } catch (error) {
      console.error('Error submitting rating:', error);
      socket.emit('rating_error', { message: 'Failed to submit rating' });
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
    
    // Handle pinned driver preference
    if (booking.driverPreference === 'pinned' && booking.pinnedDriverId) {
      console.log('Pinned driver requested:', booking.pinnedDriverId);
      const pinnedDriver = await User.findById(booking.pinnedDriverId);
      
      if (pinnedDriver && pinnedDriver.role === 'driver' && pinnedDriver.isActive) {
        console.log('Pinned driver found and active:', pinnedDriver.email);
        return [pinnedDriver];
      } else {
        console.log('Pinned driver not found or not active');
        return [];
      }
    }
    
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

    // Filter Pink Captain drivers based on their preferences
    let filteredDrivers = driversWithDistance;
    if (booking.driverPreference === 'pink_captain' && booking.pinkCaptainOptions) {
      console.log('Filtering Pink Captain drivers based on preferences...');
      
      filteredDrivers = driversWithDistance.filter(driver => {
        const driverPrefs = driver.driverSettings?.ridePreferences;
        if (!driverPrefs || !driverPrefs.pinkCaptainMode) {
          return false; // Driver must have Pink Captain mode enabled
        }

        // Check if driver accepts the specific Pink Captain options requested
        if (booking.pinkCaptainOptions.femalePassengersOnly && !driverPrefs.acceptFemaleOnly) {
          return false;
        }
        if (booking.pinkCaptainOptions.familyRides && !driverPrefs.acceptFamilyRides) {
          return false;
        }
        if (booking.pinkCaptainOptions.safeZoneRides && !driverPrefs.acceptSafeRides) {
          return false;
        }
        if (booking.pinkCaptainOptions.familyWithGuardianMale && !driverPrefs.acceptFamilyWithGuardianMale) {
          return false;
        }
        if (booking.pinkCaptainOptions.maleWithoutFemale && !driverPrefs.acceptMaleWithoutFemale) {
          return false;
        }
        if (booking.pinkCaptainOptions.noMaleCompanion && !driverPrefs.acceptNoMaleCompanion) {
          return false;
        }

        return true; // Driver accepts this type of Pink Captain ride
      });
      
      console.log(`Filtered to ${filteredDrivers.length} Pink Captain drivers matching preferences`);
    }

    // Sort by distance
    filteredDrivers.sort((a, b) => a.distance - b.distance);
    
    console.log(`Found ${filteredDrivers.length} qualified drivers within ${maxRadius}km radius`);
    return filteredDrivers;

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