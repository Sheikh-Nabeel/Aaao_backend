/**
 * Service for handling socket notifications and reducing duplication
 */
class SocketNotificationService {
  /**
   * Send success response to socket
   */
  static sendSuccess(socket, event, data) {
    socket.emit(event, {
      success: true,
      ...data
    });
  }

  /**
   * Send error response to socket
   */
  static sendError(socket, event, message, allowedRange = null) {
    const errorData = {
      success: false,
      message: message
    };
    
    if (allowedRange) {
      errorData.allowedRange = allowedRange;
    }
    
    socket.emit(event, errorData);
  }

  /**
   * Notify booking status update
   */
  static notifyBookingStatusUpdate(io, booking, status, additionalData = {}) {
    const userRoom = `user_${booking.user._id || booking.user}`;
    const driverRoom = booking.driver ? `driver_${booking.driver._id || booking.driver}` : null;

    const notification = {
      bookingId: booking._id,
      status,
      timestamp: new Date(),
      ...additionalData
    };

    // Notify user
    io.to(userRoom).emit('booking_status_update', notification);

    // Notify driver if assigned
    if (driverRoom) {
      io.to(driverRoom).emit('booking_status_update', notification);
    }
  }

  /**
   * Notify fare modification
   */
  static notifyFareModification(io, userId, fareData) {
    const userRoom = `user_${userId}`;
    
    // Driver requesting fare change - notify user
    io.to(userRoom).emit('fare_modification_request', fareData);
  }

  /**
   * Notify new booking request to drivers
   */
  static notifyNewBookingRequest(io, drivers, bookingData) {
    drivers.forEach(driver => {
      const driverRoom = `driver_${driver._id}`;
      io.to(driverRoom).emit('new_booking_request', bookingData);
    });
  }

  /**
   * Notify booking cancellation
   */
  static notifyBookingCancellation(io, booking) {
    const driverRoom = booking.driver ? `driver_${booking.driver._id || booking.driver}` : null;

    if (driverRoom) {
      const notification = {
        bookingId: booking._id,
        message: 'Booking has been cancelled by the user',
        reason: booking.cancellationReason,
        cancelledAt: booking.cancelledAt,
        user: {
          name: `${booking.user.firstName} ${booking.user.lastName}`,
          phone: booking.user.phoneNumber
        }
      };

      io.to(driverRoom).emit('booking_cancelled', notification);
    }
  }

  /**
   * Notify message between user and driver
   */
  static notifyMessage(io, booking, message, senderRole) {
    const userRoom = `user_${booking.user._id || booking.user}`;
    const driverRoom = booking.driver ? `driver_${booking.driver._id || booking.driver}` : null;

    const notification = {
      bookingId: booking._id,
      message,
      senderRole,
      timestamp: new Date()
    };

    // Send to the other party
    if (senderRole === 'user' && driverRoom) {
      io.to(driverRoom).emit('new_message', notification);
    } else if (senderRole === 'driver') {
      io.to(userRoom).emit('new_message', notification);
    }
  }

  /**
   * Notify driver location update to users with active bookings
   */
  static async notifyDriverLocationUpdate(io, driverId, locationData) {
    try {
      // Import here to avoid circular dependency
      const Booking = (await import('../models/bookingModel.js')).default;
      
      const activeBookings = await Booking.find({
        driver: driverId,
        status: { $in: ['accepted', 'started', 'in_progress'] }
      }).populate('user', '_id');
      
      activeBookings.forEach(booking => {
        const userRoom = `user_${booking.user._id}`;
        io.to(userRoom).emit('driver_location_update', {
          bookingId: booking._id,
          driverLocation: {
            coordinates: locationData.coordinates,
            heading: locationData.heading,
            speed: locationData.speed,
            timestamp: locationData.lastUpdated
          }
        });
      });
    } catch (error) {
      console.error('Error notifying driver location update:', error);
    }
  }

  /**
   * Broadcast to multiple rooms
   */
  static broadcastToRooms(io, rooms, event, data) {
    rooms.forEach(room => {
      if (room) {
        io.to(room).emit(event, data);
      }
    });
  }

  /**
   * Send settings update confirmation
   */
  static confirmSettingsUpdate(socket, settingsType, settings) {
    this.sendSuccess(socket, `${settingsType}_updated`, {
      message: `${settingsType.charAt(0).toUpperCase() + settingsType.slice(1)} updated successfully`,
      settings,
      timestamp: new Date()
    });
  }

  /**
   * Send location update confirmation
   */
  static confirmLocationUpdate(socket, coordinates, timestamp) {
    this.sendSuccess(socket, 'location_updated', {
      message: 'Location updated successfully',
      coordinates,
      timestamp: timestamp || new Date()
    });
  }

  /**
   * Notify fare increase and resend
   */
  static notifyFareIncreaseAndResend(socket, io, booking, originalFare, nearbyDrivers) {
    // Confirm fare increase and resend to user
    socket.emit('fare_increased_and_resent', {
      bookingId: booking._id,
      originalFare: originalFare,
      newFare: booking.fare,
      resendAttempt: booking.resendAttempts,
      maxAttempts: booking.maxResendAttempts,
      driversFound: nearbyDrivers.length,
      message: `Fare increased to ${booking.fare} AED and request resent to ${nearbyDrivers.length} drivers`
    });

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
  }
}

export default SocketNotificationService;