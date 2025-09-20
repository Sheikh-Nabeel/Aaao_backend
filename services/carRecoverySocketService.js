import Booking from '../models/bookingModel.js';

/**
 * Service for handling car recovery WebSocket events
 */
class CarRecoverySocketService {
  static io = null;

  /**
   * Initialize with WebSocket server instance
   */
  static initialize(io) {
    this.io = io;
    console.log('🚀 Car Recovery Socket Service initialized'.green);
  }

  /**
   * Handle incoming WebSocket messages
   */
  static async handleMessage(ws, event, data, callback) {
    try {
      console.log(`📡 Handling car recovery event: ${event}`);
      
      switch (event) {
        case 'createRecoveryRequest':
          return await this.handleCreateRecoveryRequest(ws, data, callback);
          
        case 'updateLocation':
          return await this.handleUpdateLocation(ws, data, callback);
          
        case 'joinBookingRoom':
          return await this.handleJoinBookingRoom(ws, data, callback);
          
        default:
          console.warn(`⚠️ Unknown event: ${event}`);
          if (typeof callback === 'function') {
            callback({
              success: false,
              error: 'Unknown event',
              message: `Event '${event}' is not supported`
            });
          }
      }
    } catch (error) {
      console.error('❌ Error handling car recovery message:', error);
      if (typeof callback === 'function') {
        callback({
          success: false,
          error: 'Internal server error',
          message: error.message
        });
      }
    }
  }

  static async handleCreateRecoveryRequest(ws, data, callback) {
    try {
      if (!ws.user) {
        throw new Error('Authentication required');
      }
      
      console.log('📦 Creating recovery request:', {
        userId: ws.user._id,
        data: data
      });
      
      // Validate request data
      const requiredFields = ['serviceType', 'vehicleType', 'pickupLocation'];
      const missingFields = requiredFields.filter(field => !data[field]);
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }
      
      // Create booking
      const booking = new Booking({
        user: ws.user._id,
        serviceType: data.serviceType,
        subcategoryId: data.subcategoryId,
        vehicleType: data.vehicleType,
        pickupLocation: data.pickupLocation,
        dropoffLocation: data.dropoffLocation,
        status: 'pending',
        vehicleDetails: data.vehicleDetails,
        customerNotes: data.customerNotes
      });
      
      await booking.save();
      
      // Prepare response
      const response = {
        success: true,
        bookingId: booking._id,
        status: 'pending',
        timestamp: new Date().toISOString()
      };
      
      // Send response to client
      if (typeof callback === 'function') {
        callback(response);
      }
      
      // Notify available drivers
      this.broadcastToDrivers('newRecoveryRequest', {
        bookingId: booking._id,
        serviceType: booking.serviceType,
        pickupLocation: booking.pickupLocation,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Create recovery request error:', error.message);
      if (typeof callback === 'function') {
        callback({
          success: false,
          error: 'Failed to create recovery request',
          message: error.message
        });
      }
    }
  }

  static async handleUpdateLocation(ws, data, callback) {
    try {
      if (!ws.user || ws.user.role !== 'driver') {
        throw new Error('Only drivers can update location');
      }
      
      const { bookingId, coordinates, heading, speed } = data;
      
      if (!bookingId || !coordinates) {
        throw new Error('Missing required fields: bookingId and coordinates');
      }
      
      // Update driver location in database
      await User.findByIdAndUpdate(ws.user._id, {
        'location.coordinates': coordinates,
        'location.updatedAt': new Date()
      });
      
      // Notify relevant users
      this.io.to(`booking_${bookingId}`).emit('carRecovery:driverLocationUpdate', {
        driverId: ws.user._id,
        location: coordinates,
        heading: heading || 0,
        speed: speed || 0,
        timestamp: new Date().toISOString()
      });
      
      // Send success response
      if (typeof callback === 'function') {
        callback({ success: true });
      }
      
    } catch (error) {
      console.error('❌ Location update error:', error.message);
      if (typeof callback === 'function') {
        callback({
          success: false,
          error: 'Failed to update location',
          message: error.message
        });
      }
    }
  }

  static async handleJoinBookingRoom(ws, data, callback) {
    try {
      const bookingId = data.bookingId || data;
      if (!bookingId) {
        throw new Error('Booking ID is required');
      }
      
      ws.join(`booking_${bookingId}`);
      console.log(`👥 User ${ws.user?._id} joined booking room: ${bookingId}`);
      
      // Send success response
      if (typeof callback === 'function') {
        callback({ success: true });
      }
      
    } catch (error) {
      console.error('❌ Join booking room error:', error.message);
      if (typeof callback === 'function') {
        callback({
          success: false,
          error: 'Failed to join booking room',
          message: error.message
        });
      }
    }
  }

  /**
   * Broadcast to all connected drivers
   */
  static broadcastToDrivers(event, data) {
    if (this.io) {
      this.io.emit(`carRecovery:${event}`, data);
    }
  }
}

export default CarRecoverySocketService;
