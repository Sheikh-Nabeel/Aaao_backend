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

    // Handle driver status toggle (online/offline)
    socket.on('driver:toggle-status', async (data) => {
      try {
        const { location } = data;
        const userId = socket.user.id;

        // Verify user is a driver
        if (socket.user.role !== 'driver') {
          socket.emit('driver:status-error', {
            message: 'Only drivers can toggle status'
          });
          return;
        }

        // Get current driver status
        const currentDriver = await User.findById(userId).select('driverStatus isActive');
        const isCurrentlyOnline = currentDriver.driverStatus === 'online' && currentDriver.isActive;
        
        // Toggle status
        const newStatus = isCurrentlyOnline ? 'offline' : 'online';
        const newActiveState = !isCurrentlyOnline;
        
        const updateData = {
          driverStatus: newStatus,
          isActive: newActiveState,
          lastActiveAt: new Date()
        };

        // Add location if going online and location provided
        if (newStatus === 'online' && location && location.latitude && location.longitude) {
          updateData.currentLocation = {
            type: 'Point',
            coordinates: [location.longitude, location.latitude]
          };
        }

        const driver = await User.findByIdAndUpdate(
          userId,
          updateData,
          { new: true, select: 'firstName lastName driverStatus isActive currentLocation' }
        );

        if (driver) {
          if (newStatus === 'online') {
            driverSockets.set(userId, socket.id);
            socket.join(`driver:${userId}`);
          } else {
            driverSockets.delete(userId);
            socket.leave(`driver:${userId}`);
          }

          // Emit status update to driver
          socket.emit('driver:status-updated', {
            status: newStatus,
            isActive: newActiveState,
            location: driver.currentLocation,
            message: `You are now ${newStatus}`,
            timestamp: new Date()
          });

          console.log(`Driver ${driver.firstName} ${driver.lastName} is now ${newStatus}`);
        }

      } catch (error) {
        console.error('Error handling driver status toggle:', error);
        socket.emit('driver:status-error', {
          message: 'Failed to toggle status'
        });
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