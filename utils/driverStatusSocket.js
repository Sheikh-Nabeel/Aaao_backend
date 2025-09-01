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
        const userId = socket.user?.id;
        
        if (userId && socket.user?.role === 'driver') {
          // Remove from driver sockets map
          driverSockets.delete(userId);
          
          // Optionally set driver offline on disconnect (uncomment if needed)
          // await User.findByIdAndUpdate(userId, {
          //   driverStatus: 'offline',
          //   isActive: false,
          //   lastActiveAt: new Date()
          // });
          
          console.log(`Driver ${userId} disconnected`);
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
  return driverSockets.get(driverId);
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