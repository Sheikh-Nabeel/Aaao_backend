import User from '../models/userModel.js';

/**
 * Simple Driver Online/Offline Status Controller
 */

/**
 * Set driver online
 * POST /api/driver/go-online
 */
export const goOnline = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { location } = req.body;

    // Verify user is a driver
    if (req.user.role !== 'driver') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only drivers can go online.'
      });
    }

    // Update driver status to online
    const updateData = {
      driverStatus: 'online',
      isActive: true,
      lastActiveAt: new Date()
    };

    // Update location if provided
    if (location && location.latitude && location.longitude) {
      updateData.currentLocation = {
        type: 'Point',
        coordinates: [location.longitude, location.latitude]
      };
    }

    const driver = await User.findByIdAndUpdate(
      driverId,
      updateData,
      { new: true, select: 'firstName lastName driverStatus isActive currentLocation lastActiveAt' }
    );

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'You are now online and available for rides',
      data: {
        driverId,
        driverName: `${driver.firstName} ${driver.lastName}`,
        status: 'online',
        isActive: true,
        location: driver.currentLocation,
        timestamp: new Date()
      }
    });

    console.log(`Driver ${driver.firstName} ${driver.lastName} (${driverId}) went online`);

  } catch (error) {
    console.error('Error setting driver online:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to go online'
    });
  }
};

/**
 * Set driver offline
 * POST /api/driver/go-offline
 */
export const goOffline = async (req, res) => {
  try {
    const driverId = req.user.id;

    // Verify user is a driver
    if (req.user.role !== 'driver') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only drivers can go offline.'
      });
    }

    // Update driver status to offline
    const driver = await User.findByIdAndUpdate(
      driverId,
      {
        driverStatus: 'offline',
        isActive: false,
        lastActiveAt: new Date()
      },
      { new: true, select: 'firstName lastName driverStatus isActive lastActiveAt' }
    );

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'You are now offline',
      data: {
        driverId,
        driverName: `${driver.firstName} ${driver.lastName}`,
        status: 'offline',
        isActive: false,
        timestamp: new Date()
      }
    });

    console.log(`Driver ${driver.firstName} ${driver.lastName} (${driverId}) went offline`);

  } catch (error) {
    console.error('Error setting driver offline:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to go offline'
    });
  }
};

/**
 * Get driver current status
 * GET /api/driver/status
 */
export const getDriverStatus = async (req, res) => {
  try {
    const driverId = req.user.id;

    // Verify user is a driver
    if (req.user.role !== 'driver') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only drivers can view status.'
      });
    }

    const driver = await User.findById(driverId).select(
      'firstName lastName driverStatus isActive currentLocation lastActiveAt'
    );

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        driverId,
        driverName: `${driver.firstName} ${driver.lastName}`,
        status: driver.driverStatus || 'offline',
        isActive: driver.isActive || false,
        location: driver.currentLocation,
        lastActiveAt: driver.lastActiveAt,
        isOnline: driver.driverStatus === 'online' && driver.isActive
      }
    });

  } catch (error) {
    console.error('Error getting driver status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get driver status'
    });
  }
};

/**
 * Update driver location while online
 * POST /api/driver/update-location
 */
export const updateLocation = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { location } = req.body;

    // Verify user is a driver
    if (req.user.role !== 'driver') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only drivers can update location.'
      });
    }

    if (!location || !location.latitude || !location.longitude) {
      return res.status(400).json({
        success: false,
        message: 'Location with latitude and longitude is required'
      });
    }

    // Update location and last active time
    const driver = await User.findByIdAndUpdate(
      driverId,
      {
        currentLocation: {
          type: 'Point',
          coordinates: [location.longitude, location.latitude]
        },
        lastActiveAt: new Date()
      },
      { new: true, select: 'firstName lastName driverStatus isActive currentLocation' }
    );

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Location updated successfully',
      data: {
        driverId,
        location: driver.currentLocation,
        status: driver.driverStatus,
        isActive: driver.isActive,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('Error updating driver location:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update location'
    });
  }
};

// Admin endpoints

/**
 * Get all online drivers (Admin only)
 * GET /api/admin/drivers/online
 */
export const getOnlineDrivers = async (req, res) => {
  try {
    // Verify admin access
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin access required.'
      });
    }

    const { serviceType, vehicleType } = req.query;
    
    // Build query for online drivers
    const query = {
      role: 'driver',
      driverStatus: 'online',
      isActive: true,
      kycLevel: 2,
      kycStatus: 'approved'
    };

    const drivers = await User.find(query)
      .select('firstName lastName email phone currentLocation lastActiveAt')
      .populate({
        path: 'vehicles',
        match: serviceType || vehicleType ? {
          ...(serviceType && { serviceType }),
          ...(vehicleType && { vehicleType })
        } : {},
        select: 'serviceType vehicleType vehicleBrand vehicleModel vehicleNumber'
      });

    // Filter drivers who have matching vehicles if serviceType or vehicleType specified
    const filteredDrivers = serviceType || vehicleType 
      ? drivers.filter(driver => driver.vehicles && driver.vehicles.length > 0)
      : drivers;

    res.status(200).json({
      success: true,
      data: {
        drivers: filteredDrivers,
        count: filteredDrivers.length,
        filters: { serviceType, vehicleType },
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('Error getting online drivers:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get online drivers'
    });
  }
};

/**
 * Force driver offline (Admin only)
 * POST /api/admin/drivers/:driverId/force-offline
 */
export const forceDriverOffline = async (req, res) => {
  try {
    // Verify admin access
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin access required.'
      });
    }

    const { driverId } = req.params;
    const { reason = 'Admin action' } = req.body;

    // Verify driver exists
    const driver = await User.findById(driverId).select('role firstName lastName driverStatus');
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Force driver offline
    await User.findByIdAndUpdate(driverId, {
      driverStatus: 'offline',
      isActive: false,
      lastActiveAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: `Driver ${driver.firstName} ${driver.lastName} has been forced offline`,
      data: {
        driverId,
        driverName: `${driver.firstName} ${driver.lastName}`,
        previousStatus: driver.driverStatus,
        newStatus: 'offline',
        reason,
        timestamp: new Date(),
        adminId: req.user.id
      }
    });

    console.log(`Admin ${req.user.id} forced driver ${driverId} offline - Reason: ${reason}`);

  } catch (error) {
    console.error('Error forcing driver offline:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to force driver offline'
    });
  }
};