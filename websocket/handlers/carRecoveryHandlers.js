import { WS_EVENTS, BOOKING_STATUS } from '../../constants/websocketEvents.js';
import { calculateRecoveryFare, calculateCancellationFee } from '../../utils/fareCalculator.js';
import Booking from '../../models/bookingModel.js';
import Driver from '../../models/driverModel.js';
import { v4 as uuidv4 } from 'uuid';
import { webSocketService } from '../../services/websocketService.js';

class CarRecoveryHandlers {
  constructor() {
    this.activeBookings = new Map();
    this.availableDrivers = new Map();
    this.pendingRequests = new Map();
  }

  // Register all WebSocket event handlers
  registerHandlers() {
    // Customer events
    webSocketService.on(WS_EVENTS.CREATE_RECOVERY_REQUEST, this.handleCreateRecoveryRequest.bind(this));
    webSocketService.on(WS_EVENTS.CANCEL_RECOVERY_REQUEST, this.handleCancelRecoveryRequest.bind(this));
    webSocketService.on(WS_EVENTS.SEND_MESSAGE, this.handleSendMessage.bind(this));
    webSocketService.on(WS_EVENTS.RATE_SERVICE, this.handleRateService.bind(this));
    
    // Driver events
    webSocketService.on(WS_EVENTS.DRIVER_LOCATION_UPDATE, this.handleDriverLocationUpdate.bind(this));
    webSocketService.on(WS_EVENTS.DRIVER_STATUS_UPDATE, this.handleDriverStatusUpdate.bind(this));
    webSocketService.on(WS_EVENTS.ACCEPT_REQUEST, this.handleAcceptRequest.bind(this));
    webSocketService.on(WS_EVENTS.REJECT_REQUEST, this.handleRejectRequest.bind(this));
    webSocketService.on(WS_EVENTS.START_SERVICE, this.handleStartService.bind(this));
    webSocketService.on(WS_EVENTS.COMPLETE_SERVICE, this.handleCompleteService.bind(this));
    
    // System events
    webSocketService.on('disconnect', this.handleDisconnect.bind(this));
  }

  // Handle new recovery request from customer
  async handleCreateRecoveryRequest(ws, data, callback) {
    try {
      const { customerId, serviceType, vehicleType, pickupLocation, destinationLocation, notes } = data;
      
      // Validate input
      if (!customerId || !serviceType || !vehicleType || !pickupLocation) {
        return this.sendError(ws, 'MISSING_REQUIRED_FIELDS', 'Missing required fields');
      }

      // Calculate fare
      const fareDetails = calculateRecoveryFare({
        serviceType,
        vehicleType,
        pickupLocation,
        destinationLocation,
        isNightTime: this.isNightTime(),
        isWeekend: this.isWeekend(),
        areaType: this.getAreaType(pickupLocation)
      });

      // Create booking
      const booking = new Booking({
        customer: customerId,
        serviceType: 'car_recovery',
        serviceSubType: serviceType,
        vehicleType,
        pickupLocation,
        destinationLocation,
        status: BOOKING_STATUS.PENDING,
        fare: fareDetails.total,
        fareDetails,
        notes
      });

      await booking.save();

      // Store active booking
      this.activeBookings.set(booking._id.toString(), {
        customerId,
        driverId: null,
        status: BOOKING_STATUS.PENDING,
        ws,
        booking
      });

      // Find available drivers
      const availableDrivers = await this.findAvailableDrivers(pickupLocation);
      
      // Notify available drivers
      this.notifyAvailableDrivers(availableDrivers, booking);

      // Set timeout for no drivers available
      this.setRequestTimeout(booking._id);

      // Send response to customer
      this.sendSuccess(ws, {
        event: WS_EVENTS.REQUEST_CREATED,
        bookingId: booking._id,
        status: BOOKING_STATUS.PENDING,
        estimatedWaitTime: this.calculateEstimatedWaitTime(availableDrivers.length)
      });

    } catch (error) {
      console.error('Error creating recovery request:', error);
      this.sendError(ws, 'REQUEST_FAILED', 'Failed to create recovery request');
    }
  }

  // Handle driver accepting a request
  async handleAcceptRequest(ws, data, callback) {
    try {
      const { driverId, bookingId } = data;
      
      // Validate input
      if (!driverId || !bookingId) {
        return this.sendError(ws, 'MISSING_REQUIRED_FIELDS', 'Driver ID and Booking ID are required');
      }

      const bookingData = this.activeBookings.get(bookingId);
      if (!bookingData) {
        return this.sendError(ws, 'BOOKING_NOT_FOUND', 'Booking not found or expired');
      }

      // Update booking with driver info
      const booking = await Booking.findByIdAndUpdate(
        bookingId,
        {
          driver: driverId,
          status: BOOKING_STATUS.DRIVER_ASSIGNED,
          driverAssignedAt: new Date()
        },
        { new: true }
      );

      // Update active booking
      bookingData.driverId = driverId;
      bookingData.status = BOOKING_STATUS.DRIVER_ASSIGNED;
      this.activeBookings.set(bookingId, bookingData);

      // Get driver info
      const driver = await Driver.findById(driverId).select('name phone vehicle');

      // Notify customer
      this.sendToUser(booking.customer.toString(), {
        event: WS_EVENTS.DRIVER_ASSIGNED,
        bookingId: booking._id,
        driver: {
          id: driver._id,
          name: driver.name,
          phone: driver.phone,
          vehicle: driver.vehicle
        },
        estimatedArrival: this.calculateEstimatedArrivalTime(booking.pickupLocation, driver.currentLocation)
      });

      // Send confirmation to driver
      this.sendSuccess(ws, {
        event: WS_EVENTS.REQUEST_ACCEPTED,
        bookingId: booking._id,
        customer: {
          id: booking.customer,
          pickupLocation: booking.pickupLocation,
          destinationLocation: booking.destinationLocation
        },
        fare: booking.fare
      });

      // Clear any pending timeouts
      this.clearRequestTimeout(bookingId);

    } catch (error) {
      console.error('Error accepting request:', error);
      this.sendError(ws, 'ACCEPT_FAILED', 'Failed to accept request');
    }
  }

  // Handle service completion
  async handleCompleteService(ws, data, callback) {
    try {
      const { bookingId, finalFare, notes } = data;
      
      const bookingData = this.activeBookings.get(bookingId);
      if (!bookingData) {
        return this.sendError(ws, 'BOOKING_NOT_FOUND', 'Booking not found');
      }

      // Update booking status
      const booking = await Booking.findByIdAndUpdate(
        bookingId,
        {
          status: BOOKING_STATUS.COMPLETED,
          completedAt: new Date(),
          finalFare: finalFare || bookingData.booking.fare,
          notes: notes || bookingData.booking.notes
        },
        { new: true }
      );

      // Notify customer
      this.sendToUser(booking.customer.toString(), {
        event: WS_EVENTS.SERVICE_COMPLETED,
        bookingId: booking._id,
        fare: booking.finalFare,
        paymentStatus: 'pending'
      });

      // Clean up
      this.activeBookings.delete(bookingId);
      this.sendSuccess(ws, { event: WS_EVENTS.SERVICE_COMPLETED, bookingId });

    } catch (error) {
      console.error('Error completing service:', error);
      this.sendError(ws, 'COMPLETE_FAILED', 'Failed to complete service');
    }
  }

  // Handle cancellation with fee calculation
  async handleCancelRecoveryRequest(ws, data, callback) {
    try {
      const { bookingId, reason } = data;
      
      const bookingData = this.activeBookings.get(bookingId);
      if (!bookingData) {
        return this.sendError(ws, 'BOOKING_NOT_FOUND', 'Booking not found');
      }

      // Calculate cancellation fee
      const cancellationFee = calculateCancellationFee(bookingData.booking);
      
      // Update booking status
      const booking = await Booking.findByIdAndUpdate(
        bookingId,
        {
          status: BOOKING_STATUS.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason,
          cancellationFee
        },
        { new: true }
      );

      // Notify both parties
      this.sendToUser(booking.customer.toString(), {
        event: WS_EVENTS.BOOKING_CANCELLED,
        bookingId: booking._id,
        cancellationFee,
        status: BOOKING_STATUS.CANCELLED
      });

      if (bookingData.driverId) {
        this.sendToUser(bookingData.driverId, {
          event: WS_EVENTS.BOOKING_CANCELLED,
          bookingId: booking._id,
          reason
        });
      }

      // Clean up
      this.activeBookings.delete(bookingId);
      this.clearRequestTimeout(bookingId);
      this.sendSuccess(ws, { event: WS_EVENTS.BOOKING_CANCELLED, bookingId });

    } catch (error) {
      console.error('Error cancelling booking:', error);
      this.sendError(ws, 'CANCELLATION_FAILED', 'Failed to cancel booking');
    }
  }

  // Handle driver location updates
  async handleDriverLocationUpdate(ws, data, callback) {
    try {
      const { driverId, location } = data;
      
      // Update driver's location
      const driver = await Driver.findByIdAndUpdate(
        driverId,
        { 'location.coordinates': [location.lng, location.lat], updatedAt: new Date() },
        { new: true }
      );

      // If driver is assigned to a booking, update the customer
      for (const [bookingId, bookingData] of this.activeBookings) {
        if (bookingData.driverId === driverId) {
          this.sendToUser(bookingData.booking.customer.toString(), {
            event: WS_EVENTS.DRIVER_LOCATION_UPDATE,
            bookingId,
            location: {
              lat: location.lat,
              lng: location.lng,
              heading: location.heading || 0
            },
            estimatedArrival: this.calculateEstimatedArrivalTime(
              bookingData.booking.pickupLocation,
              { lat: location.lat, lng: location.lng }
            )
          });
        }
      }

      this.sendSuccess(ws, { event: WS_EVENTS.LOCATION_UPDATED });
    } catch (error) {
      console.error('Error updating driver location:', error);
      this.sendError(ws, 'LOCATION_UPDATE_FAILED', 'Failed to update location');
    }
  }

  // Helper method to find available drivers near a location
  async findAvailableDrivers(location, radiusKm = 10) {
    // This would typically use a geospatial query
    // For simplicity, we'll return all available drivers
    return await Driver.find({
      'status': 'available',
      'location': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [location.lng, location.lat]
          },
          $maxDistance: radiusKm * 1000 // Convert km to meters
        }
      }
    }).limit(10);
  }

  // Helper method to notify available drivers about a new request
  notifyAvailableDrivers(drivers, booking) {
    drivers.forEach(driver => {
      this.sendToUser(driver._id.toString(), {
        event: WS_EVENTS.NEW_RECOVERY_REQUEST,
        bookingId: booking._id,
        pickupLocation: booking.pickupLocation,
        vehicleType: booking.vehicleType,
        serviceType: booking.serviceSubType,
        fare: booking.fare,
        expiresIn: 30 // seconds to accept
      });
    });
  }

  // Helper method to send success response
  sendSuccess(ws, data) {
    if (ws && ws.readyState === 1) { // 1 = OPEN
      ws.send(JSON.stringify({
        success: true,
        ...data
      }));
    }
  }

  // Helper method to send error response
  sendError(ws, code, message) {
    if (ws && ws.readyState === 1) { // 1 = OPEN
      ws.send(JSON.stringify({
        success: false,
        error: {
          code,
          message
        }
      }));
    }
  }

  // Helper method to send message to a user
  sendToUser(userId, data) {
    // This would typically find the user's active WebSocket connection
    // For now, we'll just log it
    console.log(`Sending to user ${userId}:`, data);
  }

  // Helper methods for time calculations
  isNightTime() {
    const hours = new Date().getHours();
    return hours < 6 || hours >= 20; // 8 PM to 6 AM
  }

  isWeekend() {
    const day = new Date().getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  }

  getAreaType(location) {
    // This would typically use a geocoding service to determine area type
    // For now, we'll return a default value
    return 'urban';
  }

  calculateEstimatedWaitTime(availableDriversCount) {
    // Simple estimation based on number of available drivers
    if (availableDriversCount === 0) return '15-25 minutes';
    if (availableDriversCount < 3) return '10-15 minutes';
    return '5-10 minutes';
  }

  calculateEstimatedArrivalTime(pickupLocation, driverLocation) {
    // This would typically use a routing service
    // For now, we'll return a static value
    return '10-15 minutes';
  }

  // Timeout handling
  setRequestTimeout(bookingId, timeout = 30000) {
    this.clearRequestTimeout(bookingId);
    
    const timeoutId = setTimeout(async () => {
      const bookingData = this.activeBookings.get(bookingId);
      if (bookingData && bookingData.status === BOOKING_STATUS.PENDING) {
        await this.handleNoDriversAvailable(bookingId);
      }
    }, timeout);

    this.pendingRequests.set(bookingId, timeoutId);
  }

  clearRequestTimeout(bookingId) {
    const timeoutId = this.pendingRequests.get(bookingId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.pendingRequests.delete(bookingId);
    }
  }

  async handleNoDriversAvailable(bookingId) {
    const bookingData = this.activeBookings.get(bookingId);
    if (!bookingData) return;

    // Update booking status
    await Booking.findByIdAndUpdate(bookingId, {
      status: BOOKING_STATUS.EXPIRED,
      expiredAt: new Date()
    });

    // Notify customer
    this.sendToUser(bookingData.booking.customer.toString(), {
      event: WS_EVENTS.NO_DRIVERS_AVAILABLE,
      bookingId,
      message: 'No drivers are currently available. Please try again later.'
    });

    // Clean up
    this.activeBookings.delete(bookingId);
    this.pendingRequests.delete(bookingId);
  }
}

// Create and export singleton instance
const carRecoveryHandlers = new CarRecoveryHandlers();
export default carRecoveryHandlers;
