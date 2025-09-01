import User from '../models/userModel.js';
import Booking from '../models/bookingModel.js';
import queryOptimizer from '../utils/queryOptimizer.js';

/**
 * Service for handling database operations in socket events
 */
class SocketDatabaseService {
  /**
   * Update driver settings
   */
  static async updateDriverSettings(driverId, settingsType, settings) {
    try {
      const driver = await User.findById(driverId);
      if (!driver) {
        throw new Error('Driver not found');
      }

      // Initialize driverSettings if it doesn't exist
      if (!driver.driverSettings) {
        driver.driverSettings = {};
      }

      // Update specific settings type
      driver.driverSettings[settingsType] = {
        ...settings,
        updatedAt: new Date()
      };

      await driver.save();
      return driver.driverSettings[settingsType];
    } catch (error) {
      throw new Error(`Failed to update ${settingsType}: ${error.message}`);
    }
  }

  /**
   * Update driver status and location
   */
  static async updateDriverStatus(driverId, isActive, currentLocation) {
    try {
      const driver = await User.findById(driverId);
      if (!driver) {
        throw new Error('Driver not found');
      }

      // Update status
      if (typeof isActive === 'boolean') {
        driver.isActive = isActive;
        driver.lastActiveAt = new Date();
      }

      // Update location if provided
      if (currentLocation && currentLocation.coordinates) {
        driver.currentLocation = {
          type: 'Point',
          coordinates: currentLocation.coordinates
        };
      }

      await driver.save();
      return {
        isActive: driver.isActive,
        lastActiveAt: driver.lastActiveAt,
        currentLocation: driver.currentLocation
      };
    } catch (error) {
      throw new Error(`Failed to update driver status: ${error.message}`);
    }
  }

  /**
   * Get user by ID with location data
   */
  static async getUserById(userId) {
    try {
      const user = await User.findById(userId).select('_id username email role currentLocation');
      return user;
    } catch (error) {
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  /**
   * Update user location
   */
  static async updateUserLocation(userId, locationData) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      user.currentLocation = {
        type: 'Point',
        coordinates: locationData.coordinates
      };

      await user.save();
      return user;
    } catch (error) {
      throw new Error(`Failed to update user location: ${error.message}`);
    }
  }



  /**
   * Accept booking request
   */
  static async acceptBooking(bookingId, driverId) {
    try {
      const booking = await queryOptimizer.monitorQuery(
        'acceptBooking_findById',
        () => Booking.findById(bookingId)
          .populate('user', 'firstName lastName email phoneNumber'),
        { bookingId, driverId }
      );

      if (!booking) {
        throw new Error('Booking not found');
      }

      if (booking.status !== 'pending') {
        throw new Error('Booking is no longer available');
      }

      // Update booking
      booking.driver = driverId;
      booking.status = 'accepted';
      booking.acceptedAt = new Date();

      await queryOptimizer.monitorQuery(
        'acceptBooking_save',
        () => booking.save(),
        { bookingId, driverId }
      );
      
      // Populate driver data for response
      await booking.populate('driver', 'firstName lastName email phoneNumber vehicleType');
      
      return booking;
    } catch (error) {
      throw new Error(`Failed to accept booking: ${error.message}`);
    }
  }

  /**
   * Reject booking request
   */
  static async rejectBooking(bookingId, driverId, reason = '') {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      // Add rejection to booking history
      if (!booking.rejectedBy) {
        booking.rejectedBy = [];
      }

      booking.rejectedBy.push({
        driver: driverId,
        reason,
        rejectedAt: new Date()
      });

      await booking.save();
      return booking;
    } catch (error) {
      throw new Error(`Failed to reject booking: ${error.message}`);
    }
  }

  /**
   * Cancel booking
   */
  static async cancelBooking(bookingId, cancelledBy, reason = '') {
    try {
      const booking = await Booking.findById(bookingId)
        .populate('user', 'firstName lastName email phoneNumber')
        .populate('driver', 'firstName lastName email phoneNumber');

      if (!booking) {
        throw new Error('Booking not found');
      }

      if (!['pending', 'accepted'].includes(booking.status)) {
        throw new Error('Booking cannot be cancelled at this stage');
      }

      // Store original status for notification logic
      booking.originalStatus = booking.status;
      booking.status = 'cancelled';
      booking.cancelledBy = cancelledBy;
      booking.cancellationReason = reason || 'No reason provided';
      booking.cancelledAt = new Date();

      await booking.save();
      return booking;
    } catch (error) {
      throw new Error(`Failed to cancel booking: ${error.message}`);
    }
  }

  /**
   * Modify booking fare
   */
  static async modifyBookingFare(requestId, newFare, reason, requestedBy) {
    try {
      const booking = await Booking.findById(requestId)
        .populate('user', 'firstName lastName email phoneNumber');

      if (!booking) {
        throw new Error('Booking not found');
      }

      if (booking.status !== 'pending') {
        throw new Error('Fare can only be modified for pending bookings');
      }

      // Store fare modification request
      booking.fareModificationRequest = {
        requestedBy: requestedBy,
        originalFare: booking.fare,
        requestedFare: newFare,
        reason: reason || 'No reason provided',
        requestedAt: new Date(),
        status: 'pending'
      };

      await booking.save();
      return booking;
    } catch (error) {
      throw new Error(`Failed to modify fare: ${error.message}`);
    }
  }

  /**
   * Respond to fare modification
   */
  static async respondToFareModification(bookingId, accepted, responseBy) {
    try {
      const booking = await Booking.findById(bookingId)
        .populate('user', 'firstName lastName email phoneNumber')
        .populate('driver', 'firstName lastName email phoneNumber');

      if (!booking) {
        throw new Error('Booking not found');
      }

      if (!booking.fareModificationRequest || booking.fareModificationRequest.status !== 'pending') {
        throw new Error('No pending fare modification request found');
      }

      if (accepted) {
        booking.fare = booking.fareModificationRequest.newFare;
        booking.fareModificationRequest.status = 'accepted';
      } else {
        booking.fareModificationRequest.status = 'rejected';
      }

      booking.fareModificationRequest.respondedBy = responseBy;
      booking.fareModificationRequest.respondedAt = new Date();

      await booking.save();
      return booking;
    } catch (error) {
      throw new Error(`Failed to respond to fare modification: ${error.message}`);
    }
  }

  /**
   * Add message to booking
   */
  static async addMessage(bookingId, senderId, senderRole, message) {
    try {
      const booking = await Booking.findById(bookingId)
        .populate('user', 'firstName lastName')
        .populate('driver', 'firstName lastName');

      if (!booking) {
        throw new Error('Booking not found');
      }

      if (!booking.messages) {
        booking.messages = [];
      }

      const newMessage = {
        sender: senderId,
        senderRole,
        message: message.trim(),
        timestamp: new Date()
      };

      booking.messages.push(newMessage);
      await booking.save();

      return { booking, message: newMessage };
    } catch (error) {
      throw new Error(`Failed to add message: ${error.message}`);
    }
  }

  /**
   * Get active bookings for driver location updates
   */
  static async getActiveBookingsForDriver(driverId) {
    try {
      return await queryOptimizer.monitorQuery(
        'getActiveBookingsForDriver',
        () => Booking.find({
          driver: driverId,
          status: { $in: ['accepted', 'started', 'in_progress'] }
        }).populate('user', '_id'),
        { driverId }
      );
    } catch (error) {
      throw new Error(`Failed to get active bookings: ${error.message}`);
    }
  }

  /**
   * Increase booking fare and resend to drivers
   */
  static async increaseFareAndResend(bookingId, newFare, reason = '') {
    try {
      const booking = await Booking.findById(bookingId)
        .populate('user', 'firstName lastName email phoneNumber');

      if (!booking) {
        throw new Error('Booking not found');
      }

      if (booking.status !== 'pending') {
        throw new Error('Can only increase fare for pending bookings');
      }

      // Check if maximum resend attempts reached
      if (booking.resendAttempts >= booking.maxResendAttempts) {
        throw new Error(`Maximum resend attempts (${booking.maxResendAttempts}) reached`);
      }

      // Validate fare increase (must be higher than current fare)
      if (newFare <= booking.fare) {
        throw new Error('New fare must be higher than current fare');
      }

      // Validate reasonable fare increase (max 50% increase per attempt)
      const maxIncrease = booking.fare * 1.5;
      if (newFare > maxIncrease) {
        throw new Error(`Fare increase too high. Maximum allowed: ${maxIncrease.toFixed(2)} AED`);
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
      return { booking, originalFare };
    } catch (error) {
      throw new Error(`Failed to increase fare: ${error.message}`);
    }
  }
}

export default SocketDatabaseService;