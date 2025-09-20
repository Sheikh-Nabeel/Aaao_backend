import { 
  WS_EVENTS,
  VEHICLE_TYPES, 
  ERROR_CODES,
  SERVICE_TYPES 
} from '../constants/websocketEvents.js';
import logger from '../utils/logger.js';
import PricingConfig from '../models/pricingModel.js';
import FareCalculator from '../utils/fareCalculator.js';
import Booking from '../models/bookingModel.js';

// Service sub-types
const SERVICE_SUB_TYPES = {
  // Towing
  FLATBED_TOWING: 'flatbed_towing',
  WHEEL_LIFT_TOWING: 'wheel_lift_towing',
  
  // Winching
  ON_ROAD_WINCHING: 'on_road_winching',
  OFF_ROAD_WINCHING: 'off_road_winching',
  
  // Roadside Assistance
  BATTERY_JUMP_START: 'battery_jump_start',
  FUEL_DELIVERY: 'fuel_delivery',
  
  // Specialized Recovery
  LUXURY_CAR_RECOVERY: 'luxury_car_recovery',
  ACCIDENT_RECOVERY: 'accident_recovery',
  HEAVY_DUTY_RECOVERY: 'heavy_duty_recovery',
  BASEMENT_PULL_OUT: 'basement_pull_out'
};

// Service configuration with base prices and rules
const SERVICE_CONFIG = {
  [SERVICE_TYPES.TOWING]: {
    basePrice: 50, // AED for first 6km
    perKmPrice: 7.5,
    minDistance: 6, // km
    minPrice: 50,
    availableSubTypes: [
      SERVICE_SUB_TYPES.FLATBED_TOWING,
      SERVICE_SUB_TYPES.WHEEL_LIFT_TOWING
    ]
  },
  [SERVICE_TYPES.WINCHING]: {
    basePrice: 100, // AED for first 5km
    perKmPrice: 10,
    minDistance: 5, // km
    minPrice: 100,
    availableSubTypes: [
      SERVICE_SUB_TYPES.ON_ROAD_WINCHING,
      SERVICE_SUB_TYPES.OFF_ROAD_WINCHING
    ]
  },
  [SERVICE_TYPES.ROADSIDE_ASSISTANCE]: {
    basePrice: 35, // Flat fee for standard assistance
    perKmPrice: 0,
    minDistance: 0,
    minPrice: 35,
    availableSubTypes: [
      SERVICE_SUB_TYPES.BATTERY_JUMP_START,
      SERVICE_SUB_TYPES.FUEL_DELIVERY
    ]
  },
  [SERVICE_TYPES.KEY_UNLOCK]: {
    basePrice: 45, // Flat fee for key unlock
    perKmPrice: 0,
    minDistance: 0,
    minPrice: 45,
    availableSubTypes: []
  }
};

// Pink captain configuration
const PINK_CAPTAIN_CONFIG = {
  premiumMultiplier: 1.1, // 10% premium for pink captain
  allowedServices: [
    SERVICE_TYPES.ROADSIDE_ASSISTANCE,
    SERVICE_TYPES.KEY_UNLOCK
  ]
};

// Constants for cancellation fees (in AED)
const CANCELLATION_FEES = {
  before25Percent: 2,    // AED 2 if cancelled before driver reaches 25% of the distance
  after50Percent: 5,     // AED 5 if cancelled after driver has gone more than 50% of the distance
  afterArrival: 10       // AED 10 if cancelled after driver arrives at pickup location
};

// Constants for waiting charges (in AED)
const WAITING_CHARGES = {
  freeMinutes: 5,        // 5 minutes free waiting time
  perMinuteCharge: 2,    // AED 2 per minute after free period
  maxCharge: 20          // Maximum waiting charge of AED 20
};

class RecoveryHandler {
  constructor(webSocketService, fareCalculator = new FareCalculator()) {
    this.webSocketService = webSocketService;
    this.fareCalculator = fareCalculator;
    this.activeRecoveries = new Map();
    this.availableDrivers = new Set();
    this.initializeEventHandlers();
  }

  /**
   * Initialize WebSocket event handlers
   */
  initializeEventHandlers() {
    // Core recovery events
    this.webSocketService.on('recovery.request', this.handleRecoveryRequest.bind(this));
    this.webSocketService.on('driver.assignment', this.handleDriverAssignment.bind(this));
    this.webSocketService.on('driver.accept', this.handleAcceptRequest.bind(this));
    this.webSocketService.on('driver.location.update', this.handleDriverLocationUpdate.bind(this));
    this.webSocketService.on('recovery.cancel', this.handleCancelRequest.bind(this));
    
    // Car recovery specific events
    this.webSocketService.on('carRecovery:getDrivers', this.handleGetDrivers.bind(this));
    this.webSocketService.on('estimate.fare', this.handleFareEstimate.bind(this));
    this.webSocketService.on('driver.arrival', this.handleDriverArrival.bind(this));
    this.webSocketService.on('waiting.time.update', this.handleWaitingTimeUpdate.bind(this));
    this.webSocketService.on('service.start', this.handleServiceStart.bind(this));
  }

  /**
   * Handle recovery request from client
   */
  async handleRecoveryRequest(ws, message) {
    const { requestId, data } = message;
    
    try {
      // Validate request data
      if (!data || !data.pickupLocation || !data.serviceType) {
        throw new Error('Missing required fields: pickupLocation and serviceType are required');
      }

      // Create new recovery request
      const recoveryRequest = {
        requestId,
        status: 'pending',
        createdAt: new Date(),
        ...data,
        // Initialize additional fields
        driverId: null,
        driverLocation: null,
        statusHistory: [{
          status: 'pending',
          timestamp: new Date(),
          message: 'Recovery request created'
        }]
      };

      // Store the recovery request
      this.activeRecoveries.set(requestId, recoveryRequest);

      // Notify client of successful request creation
      this.emitToClient(ws, {
        event: 'recovery.request_created',
        requestId,
        data: {
          requestId,
          status: 'pending',
          estimatedTime: 'Calculating...',
          message: 'Looking for available drivers'
        }
      });

      // Find and assign available drivers
      await this.findAndAssignDriver(recoveryRequest);

    } catch (error) {
      logger.error('Error handling recovery request:', error);
      this.emitToClient(ws, {
        event: 'error',
        requestId,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: error.message || 'Failed to process recovery request'
        }
      });
    }
  }

  /**
   * Find and assign an available driver for the recovery request
   * @param {Object} recoveryRequest - The recovery request
   */
  async findAndAssignDriver(recoveryRequest) {
    try {
      // Get available drivers (simplified for example)
      const availableDrivers = await this.getAvailableDrivers(recoveryRequest.pickupLocation);
      
      if (availableDrivers.length === 0) {
        throw new Error('No drivers available at the moment');
      }

      // Select the nearest driver (simplified)
      const selectedDriver = availableDrivers[0];
      
      // Update recovery request with driver info
      recoveryRequest.driverId = selectedDriver.id;
      recoveryRequest.driverLocation = selectedDriver.location;
      recoveryRequest.status = 'driver_assigned';
      recoveryRequest.statusHistory.push({
        status: 'driver_assigned',
        timestamp: new Date(),
        driverId: selectedDriver.id,
        message: 'Driver assigned to recovery request'
      });

      // Notify client about driver assignment
      this.emitToClient(ws, {
        event: 'driver.assigned',
        requestId: recoveryRequest.requestId,
        data: {
          driver: {
            id: selectedDriver.id,
            name: selectedDriver.name,
            phone: selectedDriver.phone,
            rating: selectedDriver.rating,
            location: selectedDriver.location
          },
          estimatedArrival: '10-15 minutes' // Simplified ETA
        }
      });

      // Notify driver about the new assignment
      this.webSocketService.sendToUser(selectedDriver.id, {
        event: 'recovery.assigned',
        data: {
          requestId: recoveryRequest.requestId,
          pickupLocation: recoveryRequest.pickupLocation,
          serviceType: recoveryRequest.serviceType,
          vehicleDetails: recoveryRequest.vehicleDetails
        }
      });

    } catch (error) {
      logger.error('Error finding driver:', error);
      
      // Update recovery request status
      recoveryRequest.status = 'failed';
      recoveryRequest.statusHistory.push({
        status: 'failed',
        timestamp: new Date(),
        message: 'Failed to find available driver'
      });

      // Notify client about the failure
      this.emitToClient(ws, {
        event: 'error',
        requestId: recoveryRequest.requestId,
        error: {
          code: ERROR_CODES.DRIVER_UNAVAILABLE,
          message: error.message || 'Failed to find available driver'
        }
      });
    }
  }

  /**
   * Handle driver assignment
   */
  async handleDriverAssignment(ws, message) {
    const { requestId, data } = message;
    
    try {
      if (!requestId || !data || !data.driverId || !data.bookingId) {
        throw new Error('Missing required fields: requestId, driverId, and bookingId are required');
      }

      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error('Recovery request not found');
      }

      // Update recovery request with driver info
      recoveryRequest.driverId = data.driverId;
      recoveryRequest.status = 'driver_assigned';
      recoveryRequest.assignedAt = new Date();
      recoveryRequest.statusHistory.push({
        status: 'driver_assigned',
        timestamp: new Date(),
        driverId: data.driverId,
        message: 'Driver assigned to recovery request'
      });

      // Notify client
      this.emitToClient(ws, {
        event: 'driver.assigned',
        requestId,
        data: {
          driverId: data.driverId,
          status: 'assigned',
          assignedAt: recoveryRequest.assignedAt,
          estimatedArrival: '10-15 minutes' // This would be calculated in a real implementation
        }
      });

      logger.info(`Driver ${data.driverId} assigned to recovery request ${requestId}`);
    } catch (error) {
      logger.error('Error in handleDriverAssignment:', error);
      this.emitToClient(ws, {
        event: 'error',
        requestId,
        error: {
          code: 'DRIVER_ASSIGNMENT_ERROR',
          message: error.message || 'Failed to assign driver'
        }
      });
    }
  }

  /**
   * Handle driver accepting a recovery request
   */
  async handleAcceptRequest(ws, message) {
    const { requestId, data } = message;
    
    try {
      if (!requestId || !data || !data.driverId) {
        throw new Error('Missing required fields: requestId and driverId are required');
      }

      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error('Recovery request not found');
      }

      // Validate driver is assigned to this request
      if (recoveryRequest.driverId && recoveryRequest.driverId !== data.driverId) {
        throw new Error('Driver not authorized for this request');
      }

      // Update recovery request status
      recoveryRequest.status = 'accepted';
      recoveryRequest.acceptedAt = new Date();
      recoveryRequest.statusHistory.push({
        status: 'accepted',
        timestamp: new Date(),
        driverId: data.driverId,
        message: 'Driver has accepted the recovery request'
      });

      // If this is the first time assigning a driver
      if (!recoveryRequest.driverId) {
        recoveryRequest.driverId = data.driverId;
        recoveryRequest.assignedAt = new Date();
      }

      // Save to database if needed
      // await this.saveRecoveryRequest(recoveryRequest);

      // Notify client
      this.emitToClient(ws, {
        event: 'recovery.accepted',
        requestId,
        data: {
          status: 'accepted',
          acceptedAt: recoveryRequest.acceptedAt,
          driverId: data.driverId
        }
      });

      logger.info(`Recovery request ${requestId} accepted by driver ${data.driverId}`);
    } catch (error) {
      logger.error('Error in handleAcceptRequest:', error);
      this.emitToClient(ws, {
        event: 'error',
        requestId,
        error: {
          code: 'ACCEPT_REQUEST_ERROR',
          message: error.message || 'Failed to accept recovery request'
        }
      });
    }
  }

  /**
   * Handle driver arrival
   */
  async handleDriverArrival(ws, message) {
    const { requestId, data } = message;
    
    try {
      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error('Recovery request not found');
      }

      recoveryRequest.status = 'driver_arrived';
      recoveryRequest.arrivedAt = new Date();
      recoveryRequest.statusHistory.push({
        status: 'driver_arrived',
        timestamp: new Date(),
        message: 'Driver has arrived at the location'
      });

      // Notify client
      this.emitToClient(ws, {
        event: 'driver.arrived',
        requestId,
        data: {
          status: 'arrived',
          arrivedAt: recoveryRequest.arrivedAt
        }
      });
    } catch (error) {
      logger.error('Error in handleDriverArrival:', error);
      this.emitToClient(ws, {
        event: 'error',
        requestId,
        error: {
          code: 'DRIVER_ARRIVAL_ERROR',
          message: error.message || 'Failed to process driver arrival'
        }
      });
    }
  }

  /**
   * Handle waiting time updates
   */
  async handleWaitingTimeUpdate(ws, message) {
    const { requestId, data } = message;
    
    try {
      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error('Recovery request not found');
      }

      const waitingTime = data.waitingTime || 0;
      const waitingCharge = this.calculateWaitingCharge(waitingTime);
      
      recoveryRequest.waitingTime = waitingTime;
      recoveryRequest.waitingCharge = waitingCharge;

      // Notify client
      this.emitToClient(ws, {
        event: 'waiting.time.updated',
        requestId,
        data: {
          waitingTime,
          waitingCharge,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      logger.error('Error in handleWaitingTimeUpdate:', error);
      this.emitToClient(ws, {
        event: 'error',
        requestId,
        error: {
          code: 'WAITING_TIME_UPDATE_ERROR',
          message: error.message || 'Failed to update waiting time'
        }
      });
    }
  }

  /**
   * Calculate waiting charge based on waiting time
   */
  calculateWaitingCharge(waitingMinutes) {
    if (waitingMinutes <= WAITING_CHARGES.freeMinutes) {
      return 0;
    }
    const chargeableMinutes = waitingMinutes - WAITING_CHARGES.freeMinutes;
    return Math.min(
      chargeableMinutes * WAITING_CHARGES.perMinuteCharge,
      WAITING_CHARGES.maxCharge
    );
  }

  /**
   * Handle service start
   */
  async handleServiceStart(ws, message) {
    const { requestId, data } = message;
    
    try {
      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error('Recovery request not found');
      }

      recoveryRequest.status = 'in_progress';
      recoveryRequest.startedAt = new Date();
      recoveryRequest.statusHistory.push({
        status: 'in_progress',
        timestamp: new Date(),
        message: 'Service has started'
      });

      // Calculate total charges so far
      const totalCharges = this.calculateTotalCharges(recoveryRequest);

      // Notify client
      this.emitToClient(ws, {
        event: 'service.started',
        requestId,
        data: {
          status: 'in_progress',
          startedAt: recoveryRequest.startedAt,
          totalCharges
        }
      });
    } catch (error) {
      logger.error('Error in handleServiceStart:', error);
      this.emitToClient(ws, {
        event: 'error',
        requestId,
        error: {
          code: 'SERVICE_START_ERROR',
          message: error.message || 'Failed to start service'
        }
      });
    }
  }

  /**
   * Calculate total charges for the service
   */
  calculateTotalCharges(recoveryRequest) {
    // Base fare
    const serviceConfig = SERVICE_CONFIG[recoveryRequest.serviceType];
    let total = serviceConfig?.basePrice || 0;
    
    // Add waiting charges if any
    if (recoveryRequest.waitingCharge) {
      total += recoveryRequest.waitingCharge;
    }
    
    // Add any additional charges here
    
    return total;
  }

  /**
   * Helper method to emit messages to a specific client
   */
  emitToClient(ws, message) {
    try {
      if (ws && ws.readyState === 1) { // 1 = OPEN
        ws.send(JSON.stringify(message));
      }
    } catch (error) {
      logger.error('Error emitting message to client:', error);
    }
  }

  /**
   * Handle driver location updates
   */
  async handleDriverLocationUpdate(ws, message) {
    const { requestId, data } = message;
    
    try {
      if (!requestId || !data || !data.driverId || !data.location) {
        throw new Error('Missing required fields: requestId, driverId, and location are required');
      }

      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error('Recovery request not found');
      }

      // Validate driver is assigned to this request
      if (recoveryRequest.driverId !== data.driverId) {
        throw new Error('Driver not authorized to update location for this request');
      }

      // Update driver location
      recoveryRequest.driverLocation = {
        coordinates: {
          lat: data.location.latitude,
          lng: data.location.longitude
        },
        updatedAt: new Date()
      };

      // Calculate ETA if destination is available
      if (recoveryRequest.pickupLocation) {
        // This is a simplified ETA calculation
        // In a real app, you would use a mapping service API
        recoveryRequest.eta = this.calculateETA(
          recoveryRequest.driverLocation.coordinates,
          recoveryRequest.pickupLocation.coordinates
        );
      }

      // Save to database if needed
      // await this.updateRecoveryRequestLocation(recoveryRequest);

      // Notify client
      this.emitToClient(ws, {
        event: 'driver.location.updated',
        requestId,
        data: {
          location: recoveryRequest.driverLocation,
          eta: recoveryRequest.eta,
          updatedAt: recoveryRequest.driverLocation.updatedAt
        }
      });

      logger.debug(`Driver ${data.driverId} location updated for request ${requestId}`);
    } catch (error) {
      logger.error('Error in handleDriverLocationUpdate:', error);
      this.emitToClient(ws, {
        event: 'error',
        requestId,
        error: {
          code: 'LOCATION_UPDATE_ERROR',
          message: error.message || 'Failed to update driver location'
        }
      });
    }
  }

  /**
   * Calculate ETA between two points (simplified)
   * In a real app, use a mapping service API for accurate ETAs
   */
  calculateETA(from, to) {
    // This is a simplified calculation
    // In a real app, you would use a mapping service API
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(to.lat - from.lat);
    const dLon = this.toRad(to.lng - from.lng);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRad(from.lat)) * Math.cos(this.toRad(to.lat)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in km
    
    // Assuming average speed of 30 km/h in city traffic
    const averageSpeed = 30; // km/h
    const etaMinutes = Math.ceil((distance / averageSpeed) * 60);
    
    return {
      minutes: etaMinutes,
      distance: parseFloat(distance.toFixed(2)),
      unit: 'km'
    };
  }

  /**
   * Convert degrees to radians
   */
  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Handle driver arrival at pickup location
   */
  async handleDriverArrival(ws, message) {
    const { requestId, data } = message;
    const { driverId, location } = data || {};

    try {
      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error('Recovery request not found');
      }

      // Update recovery request with arrival info
      recoveryRequest.driverArrivalTime = new Date();
      recoveryRequest.status = 'driver_arrived';
      recoveryRequest.statusHistory.push({
        status: 'driver_arrived',
        timestamp: new Date(),
        driverId,
        location,
        message: 'Driver arrived at pickup location'
      });

      // Start waiting timer
      recoveryRequest.waitingTimer = {
        startTime: new Date(),
        freeMinutes: WAITING_CHARGES.freeMinutes,
        chargePerMinute: WAITING_CHARGES.perMinuteCharge,
        maxCharge: WAITING_CHARGES.maxCharge,
        totalCharges: 0
      };

      // Notify client
      this.emitToClient(ws, {
        event: 'driver.arrived',
        requestId,
        data: {
          arrivalTime: recoveryRequest.driverArrivalTime.toISOString(),
          freeWaitTime: WAITING_CHARGES.freeMinutes,
          waitingCharges: {
            perMinute: WAITING_CHARGES.perMinuteCharge,
            maxCharge: WAITING_CHARGES.maxCharge
          }
        }
      });

    } catch (error) {
      logger.error('Error handling driver arrival:', error);
      this.emitToClient(ws, {
        event: 'error',
        requestId,
        error: {
          code: ERROR_CODES.INTERNAL_SERVER_ERROR,
          message: error.message || 'Failed to process driver arrival'
        }
      });
    }
  }

  /**
   * Calculate waiting charges based on waiting time
   */
  calculateWaitingCharges(recoveryRequest) {
    if (!recoveryRequest.waitingTimer) {
      return {
        waitingTime: 0,
        freeMinutesUsed: 0,
        chargeableMinutes: 0,
        waitingCharge: 0,
        isFreeTimeAvailable: true
      };
    }

    const now = new Date();
    const waitingTime = (now - recoveryRequest.waitingTimer.startTime) / (1000 * 60); // in minutes
    const freeMinutes = recoveryRequest.waitingTimer.freeMinutes || 0;
    
    // Calculate chargeable time
    let chargeableMinutes = Math.max(0, Math.ceil(waitingTime - freeMinutes));
    const isFreeTimeAvailable = waitingTime <= freeMinutes;
    
    // Calculate waiting charge
    let waitingCharge = Math.min(
      chargeableMinutes * recoveryRequest.waitingTimer.chargePerMinute,
      recoveryRequest.waitingTimer.maxCharge
    );
    
    return {
      waitingTime: Math.round(waitingTime * 10) / 10, // 1 decimal place
      freeMinutesUsed: Math.min(waitingTime, freeMinutes),
      chargeableMinutes,
      waitingCharge,
      isFreeTimeAvailable
    };
  }

  /**
   * Handle cancellation of a recovery request
   */
  async handleCancelRequest(ws, message) {
    const { requestId, data } = message;
    
    try {
      if (!requestId || !data || !data.userId) {
        throw new Error('Missing required fields: requestId and userId are required');
      }

      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error('Recovery request not found');
      }

      // Check if the user is authorized to cancel this request
      if (recoveryRequest.userId !== data.userId && 
          !(recoveryRequest.driverId && recoveryRequest.driverId === data.userId)) {
        throw new Error('Not authorized to cancel this request');
      }

      // Update recovery request status
      recoveryRequest.status = 'cancelled';
      recoveryRequest.cancelledAt = new Date();
      recoveryRequest.cancellationReason = data.reason || 'No reason provided';
      
      recoveryRequest.statusHistory.push({
        status: 'cancelled',
        timestamp: new Date(),
        userId: data.userId,
        reason: recoveryRequest.cancellationReason,
        message: `Request cancelled by ${data.userRole || 'user'}`
      });

      // If there's an assigned driver, notify them
      if (recoveryRequest.driverId) {
        this.webSocketService.emitToDriver(recoveryRequest.driverId, {
          event: 'recovery.cancelled',
          requestId,
          data: {
            status: 'cancelled',
            cancelledAt: recoveryRequest.cancelledAt,
            reason: recoveryRequest.cancellationReason,
            cancelledBy: data.userId === recoveryRequest.driverId ? 'driver' : 'user'
          }
        });
      }

      // Save to database if needed
      // await this.updateRecoveryRequest(recoveryRequest);

      // Remove from active recoveries
      this.activeRecoveries.delete(requestId);

      // Notify client
      this.emitToClient(ws, {
        event: 'recovery.cancelled',
        requestId,
        data: {
          status: 'cancelled',
          cancelledAt: recoveryRequest.cancelledAt,
          reason: recoveryRequest.cancellationReason
        }
      });

      logger.info(`Recovery request ${requestId} cancelled by user ${data.userId}`);
    } catch (error) {
      logger.error('Error in handleCancelRequest:', error);
      this.emitToClient(ws, {
        event: 'error',
        requestId,
        error: {
          code: 'CANCEL_REQUEST_ERROR',
          message: error.message || 'Failed to cancel recovery request'
        }
      });
    }
  }

  /**
   * Handle getting available drivers for car recovery
   */
  async handleGetDrivers(ws, message) {
    const { requestId, data } = message;
    
    try {
      if (!requestId) {
        throw new Error('Missing required field: requestId');
      }

      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error('Recovery request not found');
      }

      // Get available drivers from the webSocketService
      const availableDrivers = await this.webSocketService.getAvailableDrivers({
        location: recoveryRequest.pickupLocation,
        vehicleType: recoveryRequest.vehicleType || 'car',
        maxDistance: 20 // km
      });

      // Send available drivers to the client
      this.emitToClient(ws, {
        event: 'carRecovery:driversAvailable',
        requestId,
        data: {
          drivers: availableDrivers,
          count: availableDrivers.length,
          updatedAt: new Date()
        }
      });

      logger.info(`Sent ${availableDrivers.length} available drivers for request ${requestId}`);
    } catch (error) {
      logger.error('Error in handleGetDrivers:', error);
      this.emitToClient(ws, {
        event: 'error',
        requestId,
        error: {
          code: 'GET_DRIVERS_ERROR',
          message: error.message || 'Failed to get available drivers'
        }
      });
    }
  }

  /**
   * Handle fare estimation for a recovery request
   */
  async handleFareEstimate(ws, message) {
    const { requestId, data } = message;
    
    try {
      if (!data || !data.pickupLocation || !data.dropoffLocation) {
        throw new Error('Missing required fields: pickupLocation and dropoffLocation are required');
      }

      const { pickupLocation, dropoffLocation, vehicleType = 'car', options = {} } = data;
      
      // Calculate distance and estimated time
      const distance = await this.distanceCalculator.calculateDistance(
        pickupLocation.coordinates,
        dropoffLocation.coordinates
      );

      // Get pricing information
      const pricing = await this.pricingService.getRecoveryPricing({
        vehicleType,
        distance,
        ...options
      });

      // Calculate estimated fare
      const estimatedFare = this.fareCalculator.calculateRecoveryFare({
        baseFare: pricing.baseFare,
        distance,
        distanceRate: pricing.distanceRate,
        timeEstimate: pricing.timeEstimate,
        timeRate: pricing.timeRate,
        surgeMultiplier: 1.0 // Default to no surge
      });

      // Prepare response
      const response = {
        estimatedFare: {
          amount: estimatedFare.total,
          currency: 'USD',
          currencySymbol: '$',
          breakdown: {
            baseFare: estimatedFare.baseFare,
            distanceFare: estimatedFare.distanceFare,
            timeFare: estimatedFare.timeFare,
            surgeMultiplier: estimatedFare.surgeMultiplier
          },
          estimatedDuration: pricing.timeEstimate, // in minutes
          estimatedDistance: {
            value: distance,
            unit: 'km'
          }
        },
        pricingDetails: {
          ...pricing,
          vehicleType
        },
        timestamp: new Date()
      };

      // Send fare estimate to client
      this.emitToClient(ws, {
        event: 'estimate.fare.response',
        requestId: requestId || 'estimate-' + Date.now(),
        data: response
      });

      logger.info(`Fare estimate generated for ${vehicleType} (${distance.toFixed(2)} km)`);
    } catch (error) {
      logger.error('Error in handleFareEstimate:', error);
      this.emitToClient(ws, {
        event: 'error',
        requestId,
        error: {
          code: 'FARE_ESTIMATE_ERROR',
          message: error.message || 'Failed to calculate fare estimate'
        }
      });
    }
  }

  // ... (other existing methods)
}

export default RecoveryHandler;
