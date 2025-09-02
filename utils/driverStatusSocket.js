import User from '../models/userModel.js';

/**
 * Simple Driver Status Socket Handlers
 */

// Store driver socket connections
const driverSockets = new Map();

/**
 * Initialize driver status socket handlers
 */
export const initializeDriverStatusSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    
    // Add driver to socket map if they are a driver
    if (socket.user && socket.user.role === 'driver') {
      driverSockets.set(socket.user._id.toString(), socket.id);
      console.log(`Driver ${socket.user._id} connected with socket ID: ${socket.id}`);
    }

    // Driver go online
  socket.on('driver:go-online', async (data) => {
    try {
      const { latitude, longitude, userId: targetUserId } = data;
      const userId = targetUserId || socket.user._id;
        
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
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          updateData,
          { new: true }
        ).select('driverStatus isActive currentLocation lastActiveAt');
        
        // Add driver to socket map for booking notifications
        driverSockets.set(userId.toString(), socket.id);
        console.log(`Driver ${userId} added to socket map with socket ID: ${socket.id}`);
        
        // Join online drivers room
        socket.join('online-drivers');
        socket.leave('offline-drivers');
        
        // Emit status update
        socket.emit('driver:status-updated', {
          status: updatedUser.driverStatus,
          isActive: updatedUser.isActive,
          location: updatedUser.currentLocation,
          lastActiveAt: updatedUser.lastActiveAt
        });
        
        console.log(`Driver ${userId} went online`);
        
      } catch (error) {
        console.error('Error going online:', error);
        socket.emit('driver:status-error', { message: 'Failed to go online' });
      }
    });
    
    // Driver go offline
  socket.on('driver:go-offline', async (data = {}) => {
    try {
      const { userId: targetUserId } = data;
      const userId = targetUserId || socket.user._id;
        
        const updateData = {
          driverStatus: 'offline',
          isActive: false,
          lastActiveAt: new Date()
        };
        
        // Update user in database
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          updateData,
          { new: true }
        ).select('driverStatus isActive currentLocation lastActiveAt');
        
        // Remove driver from socket map when going offline
        driverSockets.delete(userId.toString());
        console.log(`Driver ${userId} removed from socket map (went offline)`);
        
        // Join offline drivers room
        socket.join('offline-drivers');
        socket.leave('online-drivers');
        
        // Emit status update
        socket.emit('driver:status-updated', {
          status: updatedUser.driverStatus,
          isActive: updatedUser.isActive,
          location: updatedUser.currentLocation,
          lastActiveAt: updatedUser.lastActiveAt
        });
        
        console.log(`Driver ${userId} went offline`);
        
      } catch (error) {
        console.error('Error going offline:', error);
        socket.emit('driver:status-error', { message: 'Failed to go offline' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      try {
        const userId = socket.user?._id;
        
        if (userId && socket.user?.role === 'driver') {
          // Remove from driver sockets map
          driverSockets.delete(userId.toString());
          
          // Optionally set driver offline on disconnect (uncomment if needed)
          // await User.findByIdAndUpdate(userId, {
          //   driverStatus: 'offline',
          //   isActive: false,
          //   lastActiveAt: new Date()
          // });
          
          console.log(`Driver ${userId} disconnected and removed from socket map`);
        }
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });
};

/**
 * Get driver socket ID by user ID
 */
export const getDriverSocketId = (driverId) => {
  console.log(`🔍 Looking for driver socket ID for: ${driverId} (type: ${typeof driverId})`);
  console.log(`📋 Current drivers in socket map:`, Array.from(driverSockets.keys()));
  const socketId = driverSockets.get(driverId);
  console.log(`🎯 Found socket ID: ${socketId}`);
  return socketId;
};

/**
 * Get all connected drivers (for debugging)
 */
export const getConnectedDrivers = () => {
  return Array.from(driverSockets.keys());
};

/**
 * Send message to specific driver
 */
export const sendToDriver = (io, driverId, event, data) => {
  const socketId = driverSockets.get(driverId);
  if (socketId) {
    io.to(socketId).emit(event, data);
    return true;
  }
  return false;
};

/**
 * Send message to all online drivers
 */
export const sendToAllOnlineDrivers = (io, event, data) => {
  driverSockets.forEach((socketId) => {
    io.to(socketId).emit(event, data);
  });
};

/**
 * Get count of connected drivers
 */
export const getConnectedDriversCount = () => {
  return driverSockets.size;
};