import User from '../models/userModel.js';

/**
 * Simple Driver Status Socket Handlers
 */

// Store driver socket connections
const driverSockets = new Map();

/**
 * Initialize driver status socket handlers for a specific socket
 */
export const initializeDriverStatusSocket = (socket) => {
  console.log(`Initializing driver socket for user: ${socket.user?._id}`);
  
  // Add driver to socket map if they are a driver
  if (socket.user && socket.user.role === 'driver') {
    driverSockets.set(socket.user._id.toString(), socket.id);
    console.log(`Driver ${socket.user._id} connected with socket ID: ${socket.id}`);

    // Driver go online
    socket.on('driver:go-online', async (data) => {
      try {
        const { latitude, longitude } = data;
        const updateData = {
          driverStatus: 'online',
          isActive: true,
          lastActiveAt: new Date()
        };
        
        // Update location if provided
        if (latitude && longitude) {
          updateData.currentLocation = {
            type: 'Point',
            coordinates: [longitude, latitude]
          };
        }
        
        // Update user in database
        await User.findByIdAndUpdate(
          socket.user._id,
          updateData,
          { new: true }
        );
        
        socket.emit('driver:status-updated', { status: 'online' });
        
      } catch (error) {
        console.error('Error updating driver status:', error);
        socket.emit('error', { message: 'Failed to update status', error: error.message });
      }
    });

    // Driver go offline
    socket.on('driver:go-offline', async () => {
      try {
        await User.findByIdAndUpdate(
          socket.user._id,
          {
            driverStatus: 'offline',
            isActive: false,
            lastActiveAt: new Date()
          }
        );
        
        socket.emit('driver:status-updated', { status: 'offline' });
        
      } catch (error) {
        console.error('Error updating driver status:', error);
        socket.emit('error', { message: 'Failed to update status', error: error.message });
      }
    });
  }

  // Handle disconnection
  socket.on('disconnect', () => {
    if (socket.user?.role === 'driver') {
      driverSockets.delete(socket.user._id.toString());
      console.log(`Driver ${socket.user._id} disconnected`);
      
      // Update status to offline in database
      User.findByIdAndUpdate(
        socket.user._id,
        {
          driverStatus: 'offline',
          isActive: false,
          lastActiveAt: new Date()
        }
      ).catch(console.error);
    }
  });
};

/**
 * Get driver socket ID by user ID
 */
export const getDriverSocketId = (driverId) => {
  return driverSockets.get(driverId.toString());
};

/**
 * Get all connected drivers (for debugging)
 */
export const getConnectedDrivers = () => {
  return Array.from(driverSockets.entries()).map(([userId, socketId]) => ({
    userId,
    socketId
  }));
};

/**
 * Send message to specific driver
 */
export const sendToDriver = (driverId, event, data) => {
  const socketId = getDriverSocketId(driverId);
  if (socketId && this.io) {
    this.io.to(socketId).emit(event, data);
    return true;
  }
  return false;
};

/**
 * Send message to all online drivers
 */
export const sendToAllOnlineDrivers = (event, data) => {
  if (this.io) {
    this.io.to(Array.from(driverSockets.values())).emit(event, data);
    return true;
  }
  return false;
};

/**
 * Get count of connected drivers
 */
export const getConnectedDriversCount = () => {
  return driverSockets.size;
};