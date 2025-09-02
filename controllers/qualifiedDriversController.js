import asyncHandler from "express-async-handler";
import User from '../models/userModel.js';
import Vehicle from '../models/vehicleModel.js';
import { calculateDistance } from '../utils/distanceCalculator.js';
import { getDriverSocketId } from '../utils/driverStatusSocket.js';

// Get qualified drivers with comprehensive information
const getQualifiedDrivers = asyncHandler(async (req, res) => {
  const {
    lat,
    lon,
    serviceType,
    vehicleType,
    driverPreference = 'nearby',
    radius = 10
  } = req.query;

  // Validate required parameters
  if (!lat || !lon || !serviceType) {
    return res.status(400).json({
      success: false,
      message: "Latitude, longitude, and service type are required",
      token: req.cookies.token,
    });
  }

  const userId = req.user?._id || null;
  const pickupLocation = {
    type: 'Point',
    coordinates: [parseFloat(lon), parseFloat(lat)]
  };

  try {
    console.log('=== REST API: GETTING QUALIFIED DRIVERS ===');
    console.log('Service Type:', serviceType);
    console.log('Vehicle Type:', vehicleType);
    console.log('Driver Preference:', driverPreference);
    console.log('Radius:', radius, 'km');
    
    let driverQuery = {
      role: 'driver',
      kycLevel: 2,
      kycStatus: 'approved',
      isActive: true,
      driverStatus: 'online'
    };

    // Handle Pink Captain preferences
    if (driverPreference === 'pink_captain') {
      driverQuery.gender = 'female';
      console.log('Pink Captain requested - filtering for female drivers');
    }

    console.log('Driver Query:', driverQuery);

    // Find drivers based on query with comprehensive data
    const drivers = await User.find(driverQuery).select(
      'firstName lastName email phoneNumber currentLocation gender driverSettings vehicleDetails profilePicture rating totalRides createdAt lastActiveAt driverStatus isActive'
    );
    console.log(`Found ${drivers.length} potential drivers`);

    if (drivers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No drivers found matching criteria',
        data: {
          qualifiedDrivers: [],
          driversCount: 0,
          searchCriteria: {
            pickupLocation,
            serviceType,
            vehicleType,
            driverPreference,
            radius: parseFloat(radius)
          }
        },
        token: req.cookies.token,
      });
    }

    // Get driver IDs for vehicle lookup
    const driverIds = drivers.map(driver => driver._id);
    
    // Find vehicles that match the service type and vehicle type
    let vehicleQuery = {
      userId: { $in: driverIds },
      serviceType: serviceType
    };
    
    // Add vehicle type filter if specified
    if (vehicleType && vehicleType !== 'any') {
      vehicleQuery.vehicleType = vehicleType;
    }
    
    console.log('Vehicle Query:', vehicleQuery);
    
    // Find matching vehicles with comprehensive data
    const vehicles = await Vehicle.find(vehicleQuery).select(
      'userId vehicleType serviceType make model year color licensePlate registrationNumber insuranceDetails'
    );
    console.log(`Found ${vehicles.length} matching vehicles`);

    if (vehicles.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No vehicles found matching service and vehicle type criteria',
        data: {
          qualifiedDrivers: [],
          driversCount: 0,
          searchCriteria: {
            pickupLocation,
            serviceType,
            vehicleType,
            driverPreference,
            radius: parseFloat(radius)
          },
          availableDrivers: drivers.length,
          availableVehicles: 0
        },
        token: req.cookies.token,
      });
    }
    
    // Create a map of driver ID to vehicle info
    const driverVehicleMap = {};
    vehicles.forEach(vehicle => {
      driverVehicleMap[vehicle.userId.toString()] = vehicle;
    });
    
    // Get driver IDs that have matching vehicles
    const qualifiedDriverIds = vehicles.map(vehicle => vehicle.userId.toString());
    
    // Filter drivers to only those with matching vehicles
    const qualifiedDrivers = drivers.filter(driver => 
      qualifiedDriverIds.includes(driver._id.toString())
    );

    console.log(`Found ${qualifiedDrivers.length} drivers with matching vehicles`);

    if (qualifiedDrivers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No qualified drivers found with matching vehicles',
        data: {
          qualifiedDrivers: [],
          driversCount: 0,
          searchCriteria: {
            pickupLocation,
            serviceType,
            vehicleType,
            driverPreference,
            radius: parseFloat(radius)
          },
          availableDrivers: drivers.length,
          availableVehicles: vehicles.length
        },
        token: req.cookies.token,
      });
    }

    // Calculate distances and filter by radius and socket connection
    const driversWithDistance = [];
    const maxRadius = driverPreference === 'pink_captain' ? 50 : parseFloat(radius);
    let driversNotConnected = 0;

    for (const driver of qualifiedDrivers) {
      if (driver.currentLocation && driver.currentLocation.coordinates) {
        // Check if driver is actually connected via socket
        const driverSocketId = getDriverSocketId(driver._id.toString());
        if (!driverSocketId) {
          driversNotConnected++;
          console.log(`Driver ${driver._id} (${driver.firstName} ${driver.lastName}) is marked online but not connected via socket`);
          continue; // Skip drivers who aren't connected via socket
        }

        const distance = calculateDistance(
          { lat: pickupLocation.coordinates[1], lng: pickupLocation.coordinates[0] },
          { lat: driver.currentLocation.coordinates[1], lng: driver.currentLocation.coordinates[0] }
        );

        if (distance <= maxRadius) {
          const vehicle = driverVehicleMap[driver._id.toString()];
          
          driversWithDistance.push({
            id: driver._id,
            firstName: driver.firstName,
            lastName: driver.lastName,
            fullName: `${driver.firstName} ${driver.lastName}`,
            email: driver.email,
            phoneNumber: driver.phoneNumber,
            profilePicture: driver.profilePicture,
            rating: driver.rating || 0,
            totalRides: driver.totalRides || 0,
            gender: driver.gender,
            driverStatus: driver.driverStatus,
            isActive: driver.isActive,
            lastActiveAt: driver.lastActiveAt,
            joinedAt: driver.createdAt,
            currentLocation: {
              type: driver.currentLocation.type,
              coordinates: driver.currentLocation.coordinates,
              address: driver.currentLocation.address,
              lastUpdated: driver.currentLocation.lastUpdated
            },
            vehicle: {
              id: vehicle._id,
              serviceType: vehicle.serviceType,
              vehicleType: vehicle.vehicleType,
              make: vehicle.make,
              model: vehicle.model,
              year: vehicle.year,
              color: vehicle.color,
              licensePlate: vehicle.licensePlate,
              registrationNumber: vehicle.registrationNumber
            },
            distance: Math.round(distance * 100) / 100,
            estimatedArrival: Math.ceil(distance / 0.5), // Assuming 30km/h average speed
            driverSettings: driver.driverSettings
          });
        }
      }
    }

    // Filter Pink Captain drivers based on their preferences
    let filteredDrivers = driversWithDistance;
    if (driverPreference === 'pink_captain') {
      console.log('Filtering Pink Captain drivers based on preferences...');
      
      filteredDrivers = driversWithDistance.filter(driver => {
        const driverPrefs = driver.driverSettings?.ridePreferences;
        return driverPrefs && driverPrefs.pinkCaptainMode;
      });
      
      console.log(`Filtered to ${filteredDrivers.length} Pink Captain drivers`);
    }

    // Sort by distance and limit to top 20
    filteredDrivers.sort((a, b) => a.distance - b.distance);
    const topDrivers = filteredDrivers.slice(0, 20);
    
    console.log(`Returning ${topDrivers.length} qualified drivers within ${maxRadius}km radius`);
    
    return res.status(200).json({
      success: true,
      message: `Found ${topDrivers.length} qualified drivers`,
      data: {
        qualifiedDrivers: topDrivers,
        driversCount: topDrivers.length,
        searchCriteria: {
          pickupLocation,
          serviceType,
          vehicleType,
          driverPreference,
          radius: maxRadius
        },
        searchStats: {
          totalDriversFound: drivers.length,
          totalVehiclesFound: vehicles.length,
          driversWithVehicles: qualifiedDrivers.length,
          driversNotConnectedViaSocket: driversNotConnected,
          driversInRadius: driversWithDistance.length,
          finalQualifiedDrivers: topDrivers.length
        }
      },
      token: req.cookies.token,
    });

  } catch (error) {
    console.error('Error getting qualified drivers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get qualified drivers',
      error: error.message,
      token: req.cookies.token,
    });
  }
});

// Get nearby drivers within radius with comprehensive information
const getNearbyDrivers = asyncHandler(async (req, res) => {
  const {
    lat,
    lon,
    radius = 5,
    includeOffline = false
  } = req.query;

  // Validate required parameters
  if (!lat || !lon) {
    return res.status(400).json({
      success: false,
      message: "Latitude and longitude are required",
      token: req.cookies.token,
    });
  }

  try {
    console.log('=== REST API: GETTING NEARBY DRIVERS ===');
    console.log('Location:', [parseFloat(lon), parseFloat(lat)]);
    console.log('Radius:', radius, 'km');
    console.log('Include Offline:', includeOffline);

    const searchLocation = {
      type: 'Point',
      coordinates: [parseFloat(lon), parseFloat(lat)]
    };

    // Build driver query
    let driverQuery = {
      role: 'driver',
      currentLocation: {
        $near: {
          $geometry: searchLocation,
          $maxDistance: parseFloat(radius) * 1000 // Convert km to meters
        }
      }
    };

    // Filter by active status unless including offline drivers
    if (!includeOffline) {
      driverQuery.isActive = true;
      driverQuery.driverStatus = { $in: ['online', 'busy'] };
    }

    console.log('Driver Query:', driverQuery);

    // Find nearby drivers with comprehensive data
    const nearbyDrivers = await User.find(driverQuery).select(
      'firstName lastName email phoneNumber currentLocation gender driverSettings vehicleDetails profilePicture rating totalRides createdAt lastActiveAt driverStatus isActive kycLevel kycStatus'
    );

    console.log(`Found ${nearbyDrivers.length} nearby drivers`);

    // Get driver IDs for vehicle lookup
    const driverIds = nearbyDrivers.map(driver => driver._id);
    
    // Find vehicles for these drivers
    const vehicles = await Vehicle.find({ userId: { $in: driverIds } }).select(
      'userId vehicleType serviceType make model year color licensePlate registrationNumber'
    );

    // Create a map of driver ID to vehicles
    const driverVehiclesMap = {};
    vehicles.forEach(vehicle => {
      if (!driverVehiclesMap[vehicle.userId.toString()]) {
        driverVehiclesMap[vehicle.userId.toString()] = [];
      }
      driverVehiclesMap[vehicle.userId.toString()].push(vehicle);
    });

    // Format driver data with comprehensive information (only socket-connected drivers)
    const formattedDrivers = [];
    let driversNotConnected = 0;
    
    for (const driver of nearbyDrivers) {
      // Check if driver is actually connected via socket
      const driverSocketId = getDriverSocketId(driver._id.toString());
      if (!driverSocketId) {
        driversNotConnected++;
        console.log(`Nearby driver ${driver._id} (${driver.firstName} ${driver.lastName}) is not connected via socket`);
        continue; // Skip drivers who aren't connected via socket
      }

      const distance = calculateDistance(
        parseFloat(lat), parseFloat(lon),
        driver.currentLocation.coordinates[1], driver.currentLocation.coordinates[0]
      );

      const driverVehicles = driverVehiclesMap[driver._id.toString()] || [];

      formattedDrivers.push({
        id: driver._id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        fullName: `${driver.firstName} ${driver.lastName}`,
        email: driver.email,
        phoneNumber: driver.phoneNumber,
        profilePicture: driver.profilePicture,
        rating: driver.rating || 0,
        totalRides: driver.totalRides || 0,
        gender: driver.gender,
        driverStatus: driver.driverStatus,
        isActive: driver.isActive,
        kycLevel: driver.kycLevel,
        kycStatus: driver.kycStatus,
        lastActiveAt: driver.lastActiveAt,
        joinedAt: driver.createdAt,
        currentLocation: {
          type: driver.currentLocation.type,
          coordinates: driver.currentLocation.coordinates,
          address: driver.currentLocation.address,
          lastUpdated: driver.currentLocation.lastUpdated
        },
        vehicles: driverVehicles.map(vehicle => ({
          id: vehicle._id,
          serviceType: vehicle.serviceType,
          vehicleType: vehicle.vehicleType,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          color: vehicle.color,
          licensePlate: vehicle.licensePlate,
          registrationNumber: vehicle.registrationNumber
        })),
        distance: Math.round(distance * 100) / 100,
        estimatedArrival: Math.ceil(distance / 0.5), // Assuming 30km/h average speed
        driverSettings: driver.driverSettings
      });
    }

    // Sort by distance
    formattedDrivers.sort((a, b) => a.distance - b.distance);

    return res.status(200).json({
      success: true,
      message: `Found ${formattedDrivers.length} nearby drivers`,
      data: {
        nearbyDrivers: formattedDrivers,
        driversCount: formattedDrivers.length,
        searchLocation,
        radius: parseFloat(radius),
        includeOffline,
        searchStats: {
          totalDriversFound: nearbyDrivers.length,
          totalVehiclesFound: vehicles.length,
          driversNotConnectedViaSocket: driversNotConnected,
          connectedDriversReturned: formattedDrivers.length,
          averageDistance: formattedDrivers.length > 0 
            ? Math.round((formattedDrivers.reduce((sum, d) => sum + d.distance, 0) / formattedDrivers.length) * 100) / 100 
            : 0
        }
      },
      token: req.cookies.token,
    });

  } catch (error) {
    console.error('Error getting nearby drivers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get nearby drivers',
      error: error.message,
      token: req.cookies.token,
    });
  }
});

export {
  getQualifiedDrivers,
  getNearbyDrivers
};