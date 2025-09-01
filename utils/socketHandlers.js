import User from '../models/userModel.js';
import Booking from '../models/bookingModel.js';
import { addMoneyToMLM } from './mlmHelper.js';
import { calculateDistance } from "./distanceCalculator.js";
import SocketValidationService from '../services/socketValidationService.js';
import SocketNotificationService from '../services/socketNotificationService.js';
import SocketDatabaseService from '../services/socketDatabaseService.js';

// Socket event handlers for booking system
export const handleBookingEvents = (socket, io) => {
  console.log('Setting up booking event handlers for user:', socket.user.email);
  
  // Create booking event
  socket.on('create_booking', async (bookingData) => {
    console.log('=== SOCKET: CREATE BOOKING ===');
    console.log('User:', socket.user.email);
    console.log('Booking Data:', bookingData);
    
    // Authentication validation
    if (!socket.user || !socket.user._id) {
      socket.emit('booking_error', { 
        message: 'Authentication required. Please log in to create booking.' 
      });
      return;
    }
    
    // Validate user KYC status
    if (socket.user.kycLevel < 1 || socket.user.kycStatus !== 'approved') {
      socket.emit('booking_error', { 
        message: 'KYC Level 1 must be approved to create bookings.' 
      });
      return;
    }
    
    // Validate required booking data
    if (!bookingData.vehicleType) {
      socket.emit('booking_error', { 
        message: 'Vehicle type is required for proper driver matching.' 
      });
      return;
    }
    
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
      // Validate user role
      const roleValidation = SocketValidationService.validateUserRole(socket.user, 'driver');
      if (!roleValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'settings_error', roleValidation.error);
      }
      
      // Prepare settings data
      const autoAcceptSettings = {
        enabled: settings.enabled || false,
        maxDistance: settings.maxDistance || 5,
        minFare: settings.minFare || 0,
        serviceTypes: settings.serviceTypes || []
      };
      
      // Update settings using service
      const updatedSettings = await SocketDatabaseService.updateDriverSettings(
        socket.user._id, 
        'autoAcceptSettings', 
        autoAcceptSettings
      );
      
      // Send confirmation
      SocketNotificationService.confirmSettingsUpdate(socket, 'settings', updatedSettings);
      
      console.log('Auto-accept settings updated for driver:', socket.user._id);
      
    } catch (error) {
      console.error('Error updating auto-accept settings:', error);
      SocketNotificationService.sendError(socket, 'settings_error', error.message);
    }
  });
  
  socket.on('update_ride_preferences', async (preferences) => {
    console.log('=== SOCKET: UPDATE RIDE PREFERENCES ===');
    console.log('Driver:', socket.user.email);
    console.log('Preferences:', preferences);
    
    try {
      // Validate user role
      const roleValidation = SocketValidationService.validateUserRole(socket.user, 'driver');
      if (!roleValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'preferences_error', roleValidation.error);
      }
      
      // Prepare preferences data
      const ridePreferences = {
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
        preferredAreas: preferences.preferredAreas || []
      };
      
      // Update preferences using service
      const updatedPreferences = await SocketDatabaseService.updateDriverSettings(
        socket.user._id, 
        'ridePreferences', 
        ridePreferences
      );
      
      // Send confirmation
      SocketNotificationService.confirmSettingsUpdate(socket, 'preferences', updatedPreferences);
      
      console.log('Ride preferences updated for driver:', socket.user._id);
      
    } catch (error) {
      console.error('Error updating ride preferences:', error);
      SocketNotificationService.sendError(socket, 'preferences_error', error.message);
    }
  });
  
  // Driver status update
  socket.on('driver_status_update', async (data) => {
    console.log('=== SOCKET: DRIVER STATUS UPDATE ===');
    console.log('Driver:', socket.user.email);
    console.log('Status Data:', data);
    
    try {
      // Validate user role
      const roleValidation = SocketValidationService.validateUserRole(socket.user, 'driver');
      if (!roleValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'status_error', roleValidation.error);
      }
      
      const { isActive, currentLocation } = data;
      
      // Update driver status and location
      const updatedDriver = await SocketDatabaseService.updateDriverStatus(
        socket.user._id,
        isActive,
        currentLocation
      );
      
      // Send confirmation
      socket.emit('status_updated', {
        message: 'Driver status updated successfully',
        isActive: updatedDriver.isActive,
        lastActiveAt: updatedDriver.lastActiveAt
      });
      
      console.log('Driver status updated:', socket.user._id, 'Active:', isActive);
      
    } catch (error) {
      console.error('Error updating driver status:', error);
      SocketNotificationService.sendError(socket, 'status_error', error.message);
    }
  });
  
  // Unified location update for both users and drivers
  socket.on('location_update', async (data) => {
    console.log('=== SOCKET: LOCATION UPDATE ===');
    console.log('User:', socket.user.email, 'Role:', socket.user.role);
    console.log('Location Data:', data);
    
    try {
      const { coordinates, userId } = data;
      const userRole = socket.user.role;
      
      // Validate coordinates
      const coordValidation = SocketValidationService.validateCoordinates(coordinates);
      if (!coordValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'location_error', coordValidation.error);
      }
      
      // Update location using unified function
      const updatedUser = await SocketDatabaseService.updateUserLocation(
        socket.user._id,
        { coordinates }
      );
      
      // If user is a driver, notify users with active bookings
      if (userRole === 'driver') {
        await SocketNotificationService.notifyDriverLocationUpdate(
          io,
          socket.user._id,
          updatedUser.currentLocation
        );
      }
      
      // Broadcast simplified location update with user ID and coordinates only
      const locationUpdate = {
        userId: userId || socket.user._id,
        coordinates: coordinates,
        userRole: userRole
      };
      
      // Broadcast to nearby location subscribers
      socket.to('location_nearby').emit('location_update', locationUpdate);
      
      // Broadcast to specific user/driver subscribers
      socket.to(`${userRole}_${socket.user._id}`).emit('location_update', locationUpdate);
      
      // Send confirmation
      socket.emit('location_updated', {
        userId: locationUpdate.userId,
        coordinates: locationUpdate.coordinates,
        userRole: userRole,
        timestamp: new Date().toISOString()
      });
      
      console.log(`${userRole} location updated:`, socket.user._id);
      
    } catch (error) {
      console.error('Error updating location:', error);
      SocketNotificationService.sendError(socket, 'location_error', error.message);
    }
  });
  
  // Get nearby drivers with simplified data
  socket.on('get_nearby_drivers', async (data) => {
    console.log('=== SOCKET: GET NEARBY DRIVERS ===');
    console.log('User:', socket.user.email);
    console.log('Request Data:', data);
    
    try {
      const { coordinates, radius = 10 } = data;
      
      // Validate coordinates
      const coordValidation = SocketValidationService.validateCoordinates(coordinates);
      if (!coordValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'location_error', coordValidation.error);
      }
      
      // Find nearby active drivers
      const nearbyDrivers = await User.find({
        role: 'driver',
        isActive: true,
        currentLocation: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: coordinates
            },
            $maxDistance: radius * 1000 // Convert km to meters
          }
        }
      }).select('_id currentLocation');
      
      // Send simplified nearby drivers data
      const simplifiedDrivers = nearbyDrivers.map(driver => ({
        userId: driver._id,
        coordinates: driver.currentLocation.coordinates,
        userRole: 'driver'
      }));
      
      socket.emit('nearby_drivers', simplifiedDrivers);
      
    } catch (error) {
      console.error('Error getting nearby drivers:', error);
      SocketNotificationService.sendError(socket, 'location_error', error.message);
    }
  });
  
  // Handle live location tracking subscription
  socket.on('subscribe_location_updates', async (data) => {
    console.log('=== SOCKET: SUBSCRIBE LOCATION UPDATES ===');
    console.log('User:', socket.user.email);
    console.log('Subscription Data:', data);
    
    try {
      const { trackingType, targetIds, serviceType, vehicleType } = data;
      
      if (trackingType === 'nearby_drivers') {
        // Subscribe to nearby driver location updates
        socket.join('nearby_drivers_tracking');
        socket.emit('location_subscription_confirmed', {
          type: 'nearby_drivers',
          message: 'Subscribed to nearby driver location updates',
          timestamp: new Date()
        });
        console.log(`User ${socket.user._id} subscribed to nearby drivers tracking`);
        
      } else if (trackingType === 'specific_drivers' && targetIds) {
        // Subscribe to specific driver location updates
        targetIds.forEach(driverId => {
          socket.join(`location_driver_${driverId}`);
        });
        socket.emit('location_subscription_confirmed', {
          type: 'specific_drivers',
          targetIds,
          message: 'Subscribed to specific driver location updates',
          timestamp: new Date()
        });
        console.log(`User ${socket.user._id} subscribed to specific drivers:`, targetIds);
        
      } else if (trackingType === 'fare_estimation_drivers') {
        // Subscribe to drivers for fare estimation
        const roomName = `fare_estimation_${serviceType}_${vehicleType}`;
        socket.join(roomName);
        socket.emit('location_subscription_confirmed', {
          type: 'fare_estimation_drivers',
          serviceType,
          vehicleType,
          message: 'Subscribed to fare estimation driver updates',
          timestamp: new Date()
        });
        console.log(`User ${socket.user._id} subscribed to fare estimation drivers for ${serviceType}`);
      }
      
    } catch (error) {
      console.error('Error subscribing to location updates:', error);
      socket.emit('error', { message: 'Failed to subscribe to location updates' });
    }
  });

  // Handle unsubscribe from location tracking
  socket.on('unsubscribe_location_updates', (data) => {
    console.log('=== SOCKET: UNSUBSCRIBE LOCATION UPDATES ===');
    console.log('User:', socket.user.email);
    console.log('Unsubscription Data:', data);
    
    try {
      const { trackingType, targetIds, serviceType, vehicleType } = data;
      
      if (trackingType === 'nearby_drivers') {
        socket.leave('nearby_drivers_tracking');
      } else if (trackingType === 'specific_drivers' && targetIds) {
        targetIds.forEach(driverId => {
          socket.leave(`location_driver_${driverId}`);
        });
      } else if (trackingType === 'fare_estimation_drivers') {
        const roomName = `fare_estimation_${serviceType}_${vehicleType}`;
        socket.leave(roomName);
      }
      
      socket.emit('location_unsubscription_confirmed', {
        type: trackingType,
        message: 'Unsubscribed from location updates',
        timestamp: new Date()
      });
      
      console.log(`User ${socket.user._id} unsubscribed from ${trackingType}`);
      
    } catch (error) {
      console.error('Error unsubscribing from location updates:', error);
    }
  });

  // Handle request for qualified drivers with locations
  socket.on('request_qualified_drivers', async (data) => {
    console.log('=== SOCKET: REQUEST QUALIFIED DRIVERS ===');
    console.log('User:', socket.user.email);
    console.log('Request Data:', data);
    
    try {
      const { pickupLocation, serviceType, vehicleType, driverPreference } = data;
      
      if (!pickupLocation || !pickupLocation.coordinates) {
        socket.emit('error', { message: 'Invalid pickup location' });
        return;
      }
      
      // Import the function from fareEstimationController
      const { findQualifiedDriversForEstimation } = await import('../controllers/fareEstimationController.js');
      
      // Find qualified drivers
      const qualifiedDrivers = await findQualifiedDriversForEstimation(
        pickupLocation,
        serviceType,
        vehicleType,
        driverPreference
      );
      
      // Emit qualified drivers with their locations
      socket.emit('qualified_drivers_response', {
        success: true,
        drivers: qualifiedDrivers,
        driversCount: qualifiedDrivers.length,
        serviceType,
        vehicleType,
        timestamp: new Date()
      });
      
      console.log(`Sent ${qualifiedDrivers.length} qualified drivers to user ${socket.user._id}`);
      
    } catch (error) {
      console.error('Error getting qualified drivers:', error);
      socket.emit('error', { message: 'Failed to get qualified drivers' });
    }
  });

  // Get live location for users and drivers
  socket.on('get_live_location', async (data) => {
    console.log('=== SOCKET: GET LIVE LOCATION ===');
    console.log('User:', socket.user.email);
    console.log('Request Data:', data);
    
    try {
      const { userId, userType } = data;
      
      // If no userId provided, return current user's location
      const targetUserId = userId || socket.user._id;
      
      // Get user from database with current location
      const user = await SocketDatabaseService.getUserById(targetUserId);
      
      if (!user) {
        socket.emit('live_location_error', { 
          message: 'User not found',
          userId: targetUserId 
        });
        return;
      }
      
      // Check if user has location data
      if (!user.currentLocation || !user.currentLocation.coordinates) {
        socket.emit('live_location_response', {
          success: true,
          userId: user._id,
          username: user.username,
          role: user.role,
          location: null,
          message: 'No location data available',
          timestamp: new Date()
        });
        return;
      }
      
      // Return live location data
      socket.emit('live_location_response', {
        success: true,
        userId: user._id,
        username: user.username,
        role: user.role,
        location: {
          type: user.currentLocation.type,
          coordinates: user.currentLocation.coordinates,
          lastUpdated: user.currentLocation.lastUpdated || new Date()
        },
        timestamp: new Date()
      });
      
      console.log(`Sent live location for user ${user._id} (${user.role}) to ${socket.user.email}`);
      
    } catch (error) {
      console.error('Error getting live location:', error);
      socket.emit('live_location_error', { 
        message: 'Failed to get live location',
        error: error.message 
      });
    }
  });

  // Accept booking request
  socket.on('accept_booking_request', async (data) => {
    console.log('=== SOCKET: ACCEPT BOOKING REQUEST ===');
    console.log('Driver:', socket.user.email);
    console.log('Data:', data);
    
    try {
      // Validate driver role
      const roleValidation = SocketValidationService.validateUserRole(socket.user, 'driver');
      if (!roleValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'booking_error', roleValidation.error);
      }
      
      const { requestId } = data;
      
      // Validate request data
      const requestValidation = SocketValidationService.validateRequest(data, ['requestId']);
      if (!requestValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'booking_error', requestValidation.error);
      }
      
      // Accept booking using database service
      const booking = await SocketDatabaseService.acceptBooking(requestId, socket.user._id);
      
      // Notify user about acceptance
      SocketNotificationService.notifyBookingStatusUpdate(
        io,
        booking.user._id,
        'booking_accepted',
        {
          bookingId: booking._id,
          driver: {
            id: booking.driver._id,
            name: `${booking.driver.firstName} ${booking.driver.lastName}`,
            phone: booking.driver.phoneNumber,
            email: booking.driver.email
          },
          acceptedAt: booking.acceptedAt,
          message: 'Your booking has been accepted by a driver'
        }
      );
      
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
      SocketNotificationService.sendError(socket, 'booking_error', error.message);
    }
  });
  
  // Reject booking request
  socket.on('reject_booking_request', async (data) => {
    console.log('=== SOCKET: REJECT BOOKING REQUEST ===');
    console.log('Driver:', socket.user.email);
    console.log('Data:', data);
    
    try {
      // Validate driver role
      const roleValidation = SocketValidationService.validateUserRole(socket.user, 'driver');
      if (!roleValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'booking_error', roleValidation.error);
      }
      
      const { requestId, reason } = data;
      
      // Validate request data
      const requestValidation = SocketValidationService.validateRequest(data, ['requestId']);
      if (!requestValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'booking_error', requestValidation.error);
      }
      
      // Reject booking using database service
      await SocketDatabaseService.rejectBooking(requestId, socket.user._id, reason);
      
      // Confirm rejection to driver
      socket.emit('booking_rejected_confirmation', {
        bookingId: requestId,
        message: 'Booking rejected successfully'
      });
      
      console.log('Booking rejected:', requestId, 'by driver:', socket.user._id);
      
    } catch (error) {
      console.error('Error rejecting booking:', error);
      SocketNotificationService.sendError(socket, 'booking_error', error.message);
    }
  });

  // Modify booking fare (Driver action)
  socket.on('modify_booking_fare', async (data) => {
    console.log('=== SOCKET: MODIFY BOOKING FARE ===');
    console.log('Driver:', socket.user.email);
    console.log('Data:', data);
    
    try {
      // Validate driver role
      const roleValidation = SocketValidationService.validateUserRole(socket.user, 'driver');
      if (!roleValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'booking_error', roleValidation.error);
      }
      
      const { requestId, newFare, reason } = data;
      
      // Validate request data
      const requestValidation = SocketValidationService.validateRequest(data, ['requestId', 'newFare']);
      if (!requestValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'booking_error', requestValidation.error);
      }
      
      // Validate fare modification
      const fareValidation = await SocketValidationService.validateFareModification(requestId, newFare);
      if (!fareValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'booking_error', fareValidation.error, fareValidation.allowedRange);
      }
      
      // Modify booking fare using database service
      const booking = await SocketDatabaseService.modifyBookingFare(
        requestId,
        newFare,
        reason,
        socket.user._id
      );
      
      // Notify user about fare modification request
      SocketNotificationService.notifyFareModification(
        io,
        booking.user._id,
        {
          bookingId: booking._id,
          originalFare: booking.fareModificationRequest.originalFare,
          requestedFare: newFare,
          reason: reason || 'No reason provided',
          driver: {
            id: socket.user._id,
            name: `${socket.user.firstName} ${socket.user.lastName}`
          },
          requestedAt: booking.fareModificationRequest.requestedAt
        }
      );
      
      // Confirm fare modification request to driver
      socket.emit('fare_modification_sent', {
        bookingId: booking._id,
        message: 'Fare modification request sent to user',
        originalFare: booking.fareModificationRequest.originalFare,
        requestedFare: newFare
      });
      
      console.log('Fare modification requested:', requestId, 'by driver:', socket.user._id);
      
    } catch (error) {
      console.error('Error modifying booking fare:', error);
      SocketNotificationService.sendError(socket, 'booking_error', error.message);
    }
  });

  // Respond to fare modification (User action)
  socket.on('respond_to_fare_modification', async (data) => {
    console.log('=== SOCKET: RESPOND TO FARE MODIFICATION ===');
    console.log('User:', socket.user.email);
    console.log('Data:', data);
    
    try {
      // Validate user role
      const roleValidation = SocketValidationService.validateUserRole(socket.user, 'user');
      if (!roleValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'booking_error', roleValidation.error);
      }
      
      const { bookingId, response, reason } = data;
      
      // Validate request data
      const requestValidation = SocketValidationService.validateRequest(data, ['bookingId', 'response']);
      if (!requestValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'booking_error', requestValidation.error);
      }
      
      if (!['accept', 'reject'].includes(response)) {
        return SocketNotificationService.sendError(socket, 'booking_error', 'Response must be either accept or reject');
      }
      
      // Validate booking access
      const accessValidation = await SocketValidationService.validateBookingAccess(bookingId, socket.user._id, 'user');
      if (!accessValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'booking_error', accessValidation.error);
      }
      
      // Respond to fare modification using database service
      const booking = await SocketDatabaseService.respondToFareModification(
        bookingId,
        response === 'accept',
        socket.user._id
      );
      
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
       SocketNotificationService.sendError(socket, 'booking_error', error.message);
     }
   });

  // Cancel booking request (User action)
  socket.on('cancel_booking_request', async (data) => {
    console.log('=== SOCKET: CANCEL BOOKING REQUEST ===');
    console.log('User:', socket.user.email);
    console.log('Data:', data);
    
    try {
      // Validate user role
      const roleValidation = SocketValidationService.validateUserRole(socket.user, 'user');
      if (!roleValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'booking_error', roleValidation.error);
      }

      // Validate request data
      const dataValidation = SocketValidationService.validateBasicRequest(data, ['bookingId']);
      if (!dataValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'booking_error', dataValidation.error);
      }

      // Validate booking access
      const accessValidation = await SocketValidationService.validateBookingAccess(
        data.bookingId, 
        socket.user._id, 
        socket.user.role
      );
      if (!accessValidation.isValid) {
        return SocketNotificationService.sendError(socket, 'booking_error', accessValidation.error);
      }

      // Cancel booking
      const booking = await SocketDatabaseService.cancelBooking(
        data.bookingId, 
        socket.user._id, 
        data.reason
      );

      // Notify driver if booking was accepted
      if (booking.driver && booking.originalStatus === 'accepted') {
        SocketNotificationService.notifyBookingCancellation(io, booking);
      }
      
      // Confirm cancellation to user
      socket.emit('booking_cancelled_confirmation', {
        bookingId: booking._id,
        message: 'Booking cancelled successfully',
        cancelledAt: booking.cancelledAt
      });
      
      console.log('Booking cancelled:', data.bookingId, 'by user:', socket.user._id);
      
    } catch (error) {
      console.error('Error cancelling booking:', error);
      SocketNotificationService.sendError(socket, 'booking_error', 'Failed to cancel booking');
    }
  });

  // User increases fare when no drivers respond
  socket.on('increase_fare_and_resend', async (data) => {
    console.log('=== SOCKET: INCREASE FARE AND RESEND ===');
    console.log('User:', socket.user.email);
    console.log('Data:', data);
    
    try {
      const { bookingId, newFare, reason } = data;
      
      // Validate user role
      if (!SocketValidationService.validateUserRole(socket, 'user')) {
        SocketNotificationService.sendError(socket, 'fare_increase_error', 'Only users can increase fare');
        return;
      }
      
      // Validate request data
      if (!SocketValidationService.validateRequestData(socket, { bookingId, newFare }, 'fare_increase_error')) {
        return;
      }
      
      // Validate booking access
      const booking = await SocketValidationService.validateBookingAccess(socket, bookingId, 'user', 'fare_increase_error');
      if (!booking) return;
      
      // Increase fare and resend
      const { booking: updatedBooking, originalFare } = await SocketDatabaseService.increaseFareAndResend(bookingId, newFare, reason);
      
      // Find nearby drivers again
      const nearbyDrivers = await findNearbyDrivers(updatedBooking, io);
      
      if (nearbyDrivers.length === 0) {
        SocketNotificationService.sendError(socket, 'fare_increase_error', 
          'Still no drivers available in your area. You can try increasing the fare again.');
        return;
      }
      
      // Notify fare increase and resend
      SocketNotificationService.notifyFareIncreaseAndResend(socket, io, updatedBooking, originalFare, nearbyDrivers);
      
      console.log('Fare increased and booking resent:', {
        bookingId: updatedBooking._id,
        originalFare,
        newFare: updatedBooking.fare,
        resendAttempt: updatedBooking.resendAttempts,
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