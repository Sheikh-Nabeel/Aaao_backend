import User from '../models/userModel.js';
import Booking from '../models/bookingModel.js';

/**
 * Service for validating socket event data and user permissions
 */
class SocketValidationService {
  /**
   * Validate basic request data
   */
  static validateBasicRequest(data, requiredFields = []) {
    if (!data || typeof data !== 'object') {
      return { isValid: false, error: 'Invalid request data' };
    }

    for (const field of requiredFields) {
      if (!data[field]) {
        return { isValid: false, error: `${field} is required` };
      }
    }

    return { isValid: true };
  }

  /**
   * Validate user role
   */
  static validateUserRole(user, requiredRole) {
    if (!user) {
      return { isValid: false, error: 'User not found' };
    }

    if (user.role !== requiredRole) {
      return { isValid: false, error: `Only ${requiredRole}s can perform this action` };
    }

    return { isValid: true };
  }

  /**
   * Validate booking access and ownership
   */
  static async validateBookingAccess(bookingId, userId, userRole) {
    try {
      const booking = await Booking.findById(bookingId);
      
      if (!booking) {
        return { isValid: false, error: 'Booking not found' };
      }

      // Check ownership based on role
      if (userRole === 'user' && booking.user.toString() !== userId.toString()) {
        return { isValid: false, error: 'You can only access your own bookings' };
      }

      if (userRole === 'driver' && booking.driver && booking.driver.toString() !== userId.toString()) {
        return { isValid: false, error: 'You can only access bookings assigned to you' };
      }

      return { isValid: true, booking };
    } catch (error) {
      return { isValid: false, error: 'Error validating booking access' };
    }
  }

  /**
   * Validate coordinates
   */
  static validateCoordinates(coordinates) {
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      return { isValid: false, error: 'Valid coordinates [longitude, latitude] are required' };
    }

    const [lng, lat] = coordinates;
    if (typeof lng !== 'number' || typeof lat !== 'number') {
      return { isValid: false, error: 'Coordinates must be numbers' };
    }

    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return { isValid: false, error: 'Invalid coordinate values' };
    }

    return { isValid: true };
  }

  /**
   * Validate fare modification request
   */
  static async validateFareModification(requestId, newFare) {
    if (typeof newFare !== 'number' || newFare <= 0) {
      return { isValid: false, error: 'New fare must be a positive number' };
    }

    try {
      const booking = await Booking.findById(requestId);
      
      if (!booking) {
        return { isValid: false, error: 'Booking not found' };
      }
      
      if (booking.status !== 'pending') {
        return { isValid: false, error: 'Fare can only be modified for pending bookings' };
      }
      
      // Get fare adjustment settings (assuming this function exists)
      const { getFareAdjustmentSettings } = await import('../utils/fareUtils.js');
      const fareSettings = await getFareAdjustmentSettings(booking.serviceType);
      
      if (!fareSettings.enableDriverFareAdjustment) {
        return { isValid: false, error: 'Driver fare adjustment is disabled' };
      }
      
      // Validate fare adjustment limits
      const originalFare = booking.fare;
      const maxAllowedFare = originalFare * (1 + fareSettings.allowedAdjustmentPercentage / 100);
      const minAllowedFare = originalFare * (1 - fareSettings.allowedAdjustmentPercentage / 100);
      
      if (newFare > maxAllowedFare || newFare < minAllowedFare) {
        return {
          isValid: false,
          error: `Fare adjustment exceeds allowed limit of ${fareSettings.allowedAdjustmentPercentage}%`,
          allowedRange: {
            min: minAllowedFare,
            max: maxAllowedFare
          }
        };
      }
      
      if (newFare < fareSettings.minimumFare || newFare > fareSettings.maximumFare) {
        return {
          isValid: false,
          error: `Fare must be between ${fareSettings.minimumFare} and ${fareSettings.maximumFare}`,
          allowedRange: {
            min: fareSettings.minimumFare,
            max: fareSettings.maximumFare
          }
        };
      }
      
      return { isValid: true };
      
    } catch (error) {
      console.error('Error validating fare modification:', error);
      return { isValid: false, error: 'Failed to validate fare modification' };
    }
  }

  /**
   * Validate message data
   */
  static validateMessage(data) {
    const validation = this.validateBasicRequest(data, ['bookingId', 'message']);
    if (!validation.isValid) return validation;

    if (typeof data.message !== 'string' || data.message.trim().length === 0) {
      return { isValid: false, error: 'Message content is required' };
    }

    if (data.message.length > 1000) {
      return { isValid: false, error: 'Message is too long (max 1000 characters)' };
    }

    return { isValid: true };
  }
}

export default SocketValidationService;