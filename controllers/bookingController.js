import Booking from "../models/bookingModel.js";
import User from "../models/userModel.js";
import Vehicle from "../models/vehicleModel.js";
import PricingConfig from "../models/pricingModel.js";
import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import { calculateShiftingMoversFare, calculateCarRecoveryFare, calculateAppointmentServiceFare } from "../utils/fareCalculator.js";
import { addMoneyToMLM } from "../utils/mlmHelper.js";

// Helper function to get fare adjustment settings from admin configuration
const getFareAdjustmentSettings = async (serviceType) => {
  try {
    const pricingConfig = await PricingConfig.findOne({ 
      serviceType, 
      isActive: true 
    });
    
    if (pricingConfig && pricingConfig.fareAdjustmentSettings) {
      return pricingConfig.fareAdjustmentSettings;
    }
    
    // Default settings if no config found
    return {
      allowedAdjustmentPercentage: 3,
      enableUserFareAdjustment: true,
      enablePendingBookingFareIncrease: true,
      enableDriverFareAdjustment: true,
    };
  } catch (error) {
    console.error('Error fetching fare adjustment settings:', error);
    // Return default settings on error
    return {
      allowedAdjustmentPercentage: 3,
      enableUserFareAdjustment: true,
      enablePendingBookingFareIncrease: true,
      enableDriverFareAdjustment: true,
    };
  }
};

// Helper function to calculate distance between two coordinates in kilometers
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Simple zone detection based on coordinates
const getZone = (lat, lon) => {
  if (lat >= 25.0 && lat <= 25.5 && lon >= 55.0 && lon <= 55.5) return "Dubai";
  if (lat >= 24.0 && lat <= 24.5 && lon >= 54.0 && lon <= 54.5)
    return "Abu Dhabi";
  return "Other";
};

// Calculate fare based on service type and vehicle category
const calculateFareByServiceType = (serviceType, vehicleType, distance, routeType) => {
  let baseFare = 0;
  let perKmRate = 7; // Default rate

  switch (serviceType) {
    case "car cab":
      switch (vehicleType) {
        case "economy":
          baseFare = 10;
          perKmRate = 5;
          break;
        case "premium":
          baseFare = 15;
          perKmRate = 7;
          break;
        case "xl":
          baseFare = 20;
          perKmRate = 9;
          break;
        case "family":
          baseFare = 18;
          perKmRate = 8;
          break;
        case "luxury":
          baseFare = 30;
          perKmRate = 12;
          break;
        default:
          baseFare = 10;
          perKmRate = 7;
      }
      break;

    case "bike":
      baseFare = 5;
      perKmRate = 3;
      break;

    case "car recovery":
      switch (vehicleType) {
        case "flatbed towing":
        case "wheel lift towing":
          baseFare = 50;
          perKmRate = 15;
          break;
        case "on-road winching":
        case "off-road winching":
          baseFare = 80;
          perKmRate = 20;
          break;
        case "battery jump start":
        case "fuel delivery":
          baseFare = 30;
          perKmRate = 10;
          break;
        case "luxury & exotic car recovery":
          baseFare = 150;
          perKmRate = 25;
          break;
        case "heavy-duty vehicle recovery":
          baseFare = 200;
          perKmRate = 30;
          break;
        default:
          baseFare = 50;
          perKmRate = 15;
      }
      break;

    case "shifting & movers":
      switch (vehicleType) {
        case "mini pickup":
        case "suzuki carry":
          baseFare = 40;
          perKmRate = 12;
          break;
        case "small van":
          baseFare = 60;
          perKmRate = 15;
          break;
        case "medium truck":
        case "mazda":
          baseFare = 80;
          perKmRate = 18;
          break;
        case "covered van":
          baseFare = 100;
          perKmRate = 20;
          break;
        case "large truck":
        case "6-wheeler":
          baseFare = 150;
          perKmRate = 25;
          break;
        case "container truck":
          baseFare = 200;
          perKmRate = 30;
          break;
        default:
          baseFare = 60;
          perKmRate = 15;
      }
      break;

    default:
      baseFare = 10;
      perKmRate = 7;
  }

  let totalFare = baseFare + (distance * perKmRate);

  // Apply route type multiplier
  if (routeType === "two_way") {
    totalFare *= 1.8; // 80% additional for return trip
  }

  return Math.round(totalFare * 100) / 100; // Round to 2 decimal places
};

const createBooking = asyncHandler(async (req, res) => {
  console.log('=== CREATE BOOKING REQUEST RECEIVED ===');
  console.log('User ID:', req.user._id);
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  const {
    pickupLocation,
    dropoffLocation,
    serviceType,
    serviceCategory,
    vehicleType,
    routeType = "one_way",
    driverPreference = "nearby",
    pinnedDriverId,
    pinkCaptainOptions = {},
    furnitureDetails = {},
    offeredFare,
    distanceInMeters,
    // New enhanced fields
    passengerCount = 1,
    wheelchairAccessible = false,
    driverFilters = {},
    serviceDetails = {},
    appointmentDetails = {},
    itemDetails = [],
    serviceOptions = {},
    extras = [],
    paymentMethod = "cash"
  } = req.body;
  const userId = req.user._id;

  // Validation
  if (
    !pickupLocation?.coordinates?.[0] ||
    !pickupLocation?.coordinates?.[1] ||
    !dropoffLocation?.coordinates?.[0] ||
    !dropoffLocation?.coordinates?.[1] ||
    !pickupLocation?.address ||
    !dropoffLocation?.address ||
    !serviceType ||
    !distanceInMeters
  ) {
    return res.status(400).json({
      message:
        "Pickup and dropoff coordinates, addresses, service type, and distance are required",
      token: req.cookies.token,
    });
  }

  if (!["car cab", "bike", "car recovery", "shifting & movers"].includes(serviceType)) {
    return res.status(400).json({
      message: "Invalid service type. Supported services: car cab, bike, car recovery, shifting & movers",
      token: req.cookies.token,
    });
  }

  // Validate pinned driver if specified
  if (driverPreference === "pinned" && !pinnedDriverId) {
    return res.status(400).json({
      message: "Pinned driver ID is required when selecting pinned driver preference",
      token: req.cookies.token,
    });
  }

  // Validate pink captain options if specified
  if (driverPreference === "pink_captain") {
    const validPinkOptions = ['femalePassengersOnly', 'familyRides', 'safeZoneRides', 'familyWithGuardianMale', 'maleWithoutFemale', 'noMaleCompanion'];
    const hasValidOption = validPinkOptions.some(option => pinkCaptainOptions[option] === true);
    
    if (!hasValidOption) {
      return res.status(400).json({
        message: "At least one pink captain option must be selected (femalePassengersOnly, familyRides, safeZoneRides, familyWithGuardianMale, maleWithoutFemale, or noMaleCompanion)",
        token: req.cookies.token,
      });
    }
  }

  // Validate furniture details for shifting & movers
  if (serviceType === "shifting & movers") {
    const furnitureKeys = ['sofas', 'beds', 'tables', 'chairs', 'wardrobes', 'refrigerator', 'washingMachine', 'boxes', 'diningTable', 'bookshelf', 'piano', 'treadmill', 'officeDesk', 'artwork', 'tvStand', 'dresser', 'mattress', 'mirror'];
    const hasFurnitureItems = furnitureKeys.some(key => furnitureDetails[key] && furnitureDetails[key] > 0) || 
                             (furnitureDetails.other && furnitureDetails.other.trim() !== '');
    
    if (!hasFurnitureItems) {
      return res.status(400).json({
        message: "Furniture details are required for shifting & movers service. Please specify at least one item.",
        token: req.cookies.token,
      });
    }
  }

  const user = await User.findById(userId);
  if (!user || user.kycLevel < 1 || user.kycStatus !== "approved") {
    return res.status(403).json({
      message: "KYC Level 1 must be approved to create a booking",
      token: req.cookies.token,
    });
  }

  // Use distance from frontend (convert meters to kilometers for internal calculations)
  const distanceInKm = distanceInMeters / 1000;
  const pickupZone = getZone(pickupLocation.coordinates[1], pickupLocation.coordinates[0]);
  const dropoffZone = getZone(dropoffLocation.coordinates[1], dropoffLocation.coordinates[0]);

  // Enhanced fare calculation based on service type
  let fareCalculation = {};
  let totalCalculatedFare = 0;

  try {
    if (serviceType === "shifting & movers") {
      const pricingConfig = await PricingConfig.findOne({ 
        serviceType: "shifting_movers", 
        isActive: true 
      });
      
      if (pricingConfig) {
        const bookingData = {
          distance: distanceInKm,
          furnitureDetails,
          serviceDetails,
          vehicleType
        };
        fareCalculation = await calculateShiftingMoversFare(bookingData);
        totalCalculatedFare = fareCalculation.totalFare;
      } else {
        // Fallback to old calculation
        totalCalculatedFare = calculateFareByServiceType(serviceType, vehicleType, distanceInKm, routeType);
      }
    } else if (serviceType === "car recovery") {
      const pricingConfig = await PricingConfig.findOne({ 
        serviceType: "car_recovery", 
        isActive: true 
      });
      
      if (pricingConfig) {
        fareCalculation = await calculateCarRecoveryFare(
          pricingConfig.carRecoveryPricing,
          vehicleType,
          serviceDetails
        );
        totalCalculatedFare = fareCalculation.totalFare;
      } else {
        // Fallback to old calculation
        totalCalculatedFare = calculateFareByServiceType(serviceType, vehicleType, distanceInKm, routeType);
      }
    } else if (["workshop", "tyre shop", "key unlocker"].includes(serviceType)) {
      const pricingConfig = await PricingConfig.findOne({ 
        serviceType: "appointment_based", 
        isActive: true 
      });
      
      if (pricingConfig) {
        fareCalculation = await calculateAppointmentServiceFare(
          pricingConfig.appointmentServicePricing,
          serviceType
        );
        totalCalculatedFare = fareCalculation.totalFare;
      } else {
        // Default appointment fee
        totalCalculatedFare = 5;
      }
    } else {
      // For car cab and bike, use existing calculation
      totalCalculatedFare = calculateFareByServiceType(serviceType, vehicleType, distanceInKm, routeType);
    }
  } catch (error) {
    console.error('Fare calculation error:', error);
    // Fallback to old calculation method
    totalCalculatedFare = offeredFare || calculateFareByServiceType(serviceType, vehicleType, distanceInKm, routeType);
  }

  const booking = new Booking({
    user: userId,
    pickupLocation: {
      type: "Point",
      coordinates: pickupLocation.coordinates,
      address: pickupLocation.address,
      zone: pickupZone,
    },
    dropoffLocation: {
      type: "Point",
      coordinates: dropoffLocation.coordinates,
      address: dropoffLocation.address,
      zone: dropoffZone,
    },
    distance: distanceInKm,
    fare: totalCalculatedFare,
    serviceType,
    serviceCategory,
    vehicleType,
    routeType,
    driverPreference,
    pinnedDriverId,
    pinkCaptainOptions,
    furnitureDetails,
    offeredFare: offeredFare || totalCalculatedFare,
    distanceInMeters,
    paymentMethod,
    status: "pending",
    // Enhanced fields
    passengerCount,
    wheelchairAccessible,
    driverFilters: {
      vehicleModel: driverFilters.vehicleModel,
      specificDriverId: driverFilters.specificDriverId,
      searchRadius: driverFilters.searchRadius || 10 // Default 10km radius
    },
    fareCalculation: {
      baseFare: fareCalculation.baseFare || totalCalculatedFare,
      distanceFare: fareCalculation.distanceFare || 0,
      serviceFare: fareCalculation.serviceFare || 0,
      locationFare: fareCalculation.locationFare || 0,
      itemFare: fareCalculation.itemFare || 0,
      platformCharges: fareCalculation.platformCharges || 0,
      totalCalculatedFare
    },
    itemDetails,
    serviceOptions,
    // Service-specific details
    serviceDetails: {
      shiftingMovers: serviceType === "shifting & movers" ? {
        selectedServices: {
          loadingUnloading: serviceDetails.shiftingMovers?.selectedServices?.loadingUnloading || false,
          packing: serviceDetails.shiftingMovers?.selectedServices?.packing || false,
          fixing: serviceDetails.shiftingMovers?.selectedServices?.fixing || false,
          helpers: serviceDetails.shiftingMovers?.selectedServices?.helpers || false,
          wheelchairHelper: serviceDetails.shiftingMovers?.selectedServices?.wheelchairHelper || false
        },
        pickupFloorDetails: {
          floor: serviceDetails.shiftingMovers?.pickupFloorDetails?.floor || 0,
          hasLift: serviceDetails.shiftingMovers?.pickupFloorDetails?.hasLift !== undefined ? serviceDetails.shiftingMovers.pickupFloorDetails.hasLift : true,
          accessType: serviceDetails.shiftingMovers?.pickupFloorDetails?.accessType || "ground"
        },
        dropoffFloorDetails: {
          floor: serviceDetails.shiftingMovers?.dropoffFloorDetails?.floor || 0,
          hasLift: serviceDetails.shiftingMovers?.dropoffFloorDetails?.hasLift !== undefined ? serviceDetails.shiftingMovers.dropoffFloorDetails.hasLift : true,
          accessType: serviceDetails.shiftingMovers?.dropoffFloorDetails?.accessType || "ground"
        },
        extras: Array.isArray(extras) ? extras.filter(item => item.name && item.count > 0) : []
      } : undefined,
      carRecovery: serviceType === "car recovery" ? {
        issueDescription: serviceDetails.carRecovery?.issueDescription || "",
        urgencyLevel: serviceDetails.carRecovery?.urgencyLevel || "medium",
        needHelper: serviceDetails.carRecovery?.needHelper || false,
        wheelchairHelper: serviceDetails.carRecovery?.wheelchairHelper || false
      } : undefined
    },
    // Appointment details for appointment-based services
    appointmentDetails: ["workshop", "tyre shop", "key unlocker"].includes(serviceType) ? {
      isAppointmentBased: true,
      appointmentTime: appointmentDetails.appointmentTime,
      serviceProviderLocation: appointmentDetails.serviceProviderLocation,
      gpsCheckIn: {
        isRequired: true,
        isCompleted: false
      },
      confirmationSurvey: {
        customerSurvey: {
          isCompleted: false
        },
        providerSurvey: {
          isCompleted: false
        },
        finalStatus: "pending"
      }
    } : undefined
  });

  await booking.save();
  console.log('=== BOOKING SAVED SUCCESSFULLY ===');
  console.log('Booking ID:', booking._id);
  console.log('User:', booking.user);
  console.log('Service Type:', booking.serviceType);
  console.log('Fare:', booking.fare);

  // Populate user information for the response
  await booking.populate('user', 'username firstName lastName email phoneNumber gender kycLevel kycStatus role isVerified selfieImage');

  // Get Socket.IO instance for real-time notifications
  const io = req.app.get('io');
  if (io) {
    // Import the findNearbyDrivers function
    const { findNearbyDrivers } = await import('../utils/socketHandlers.js');
    
    // Find compatible drivers for this booking
    const compatibleDrivers = await findNearbyDrivers(booking, io);
    
    // Emit to user that booking request was created
    io.to(`user_${userId}`).emit('booking_request_created', {
      requestId: booking._id,
      message: 'Booking request created successfully',
      driversFound: compatibleDrivers.length
    });
    
    // Emit to only compatible drivers instead of broadcasting to all
    compatibleDrivers.forEach(driver => {
      io.to(`driver_${driver._id}`).emit('new_booking_request', {
        requestId: booking._id,
        fare: booking.fare,
        raisedFare: booking.raisedFare,
        distance: booking.distance,
        distanceInMeters: booking.distanceInMeters,
        serviceType: booking.serviceType,
        vehicleType: booking.vehicleType,
        serviceCategory: booking.serviceCategory,
        routeType: booking.routeType,
        driverPreference: booking.driverPreference,
        pinkCaptainOptions: booking.pinkCaptainOptions,
        furnitureDetails: booking.furnitureDetails,
        user: {
          id: booking.user._id,
          username: booking.user.username,
          firstName: booking.user.firstName,
          lastName: booking.user.lastName,
          email: booking.user.email,
          phoneNumber: booking.user.phoneNumber,
          gender: booking.user.gender,
          kycLevel: booking.user.kycLevel,
          kycStatus: booking.user.kycStatus,
          role: booking.user.role,
          isVerified: booking.user.isVerified,
          profileImage: booking.user.selfieImage
        },
        from: {
          address: booking.pickupLocation.address,
          coordinates: booking.pickupLocation.coordinates,
          zone: booking.pickupLocation.zone
        },
        to: {
          address: booking.dropoffLocation.address,
          coordinates: booking.dropoffLocation.coordinates,
          zone: booking.dropoffLocation.zone
        },
        createdAt: booking.createdAt,
        driverDistance: driver.distance
      });
    });
  }

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(201).json({
    message: "Booking request created successfully",
    requestId: booking._id,
    fare: booking.fare,
    offeredFare: booking.offeredFare,
    fareCalculation: booking.fareCalculation,
    distance: distanceInKm,
    distanceInMeters,
    status: booking.status,
    serviceType: booking.serviceType,
    vehicleType: booking.vehicleType,
    serviceCategory: booking.serviceCategory,
    routeType: booking.routeType,
    driverPreference: booking.driverPreference,
    pinkCaptainOptions: booking.pinkCaptainOptions,
    furnitureDetails: booking.furnitureDetails,
    // Enhanced fields
    passengerCount: booking.passengerCount,
    driverFilters: booking.driverFilters,
    itemDetails: booking.itemDetails,
    serviceOptions: booking.serviceOptions,
    appointmentDetails: booking.appointmentDetails,
    user: {
      id: booking.user._id,
      username: booking.user.username,
      firstName: booking.user.firstName,
      lastName: booking.user.lastName,
      email: booking.user.email,
      phoneNumber: booking.user.phoneNumber,
      gender: booking.user.gender,
      kycLevel: booking.user.kycLevel,
      kycStatus: booking.user.kycStatus,
      role: booking.user.role,
      isVerified: booking.user.isVerified,
      profileImage: booking.user.selfieImage
    },
    from: {
      address: booking.pickupLocation.address,
      coordinates: booking.pickupLocation.coordinates,
      zone: booking.pickupLocation.zone
    },
    to: {
      address: booking.dropoffLocation.address,
      coordinates: booking.dropoffLocation.coordinates,
      zone: booking.dropoffLocation.zone
    },
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
    token,
  });
});

const getNearbyDrivers = asyncHandler(async (req, res) => {
  const { 
    lat, 
    lon, 
    serviceType, 
    vehicleModel, 
    specificDriverId, 
    searchRadius = 10 
  } = req.query;
  const userId = req.user._id;

  if (!lat || !lon || !serviceType) {
    return res.status(400).json({
      message: "Latitude, longitude, and service type are required",
      token: req.cookies.token,
    });
  }

  const user = await User.findById(userId);
  if (!user || user.kycLevel < 1 || user.kycStatus !== "approved") {
    return res.status(403).json({
      message: "KYC Level 1 must be approved to search for drivers",
      token: req.cookies.token,
    });
  }

  // Build driver query based on filters
  let driverQuery = {
    role: "driver",
    kycLevel: 2,
    kycStatus: "approved",
  };

  // If specific driver ID is provided, filter by that driver only
  if (specificDriverId) {
    driverQuery._id = specificDriverId;
  }

  // Build vehicle match criteria
  let vehicleMatch = { serviceType, status: "approved" };
  if (vehicleModel) {
    vehicleMatch.model = new RegExp(vehicleModel, 'i'); // Case-insensitive search
  }

  const drivers = await User.find(driverQuery).populate({
    path: "pendingVehicleData",
    match: vehicleMatch,
  });

  const nearbyDrivers = await Promise.all(
    drivers
      .filter((driver) => driver.pendingVehicleData)
      .map(async (driver) => {
        // Mock driver location (replace with real-time location in production)
        const driverLat = parseFloat(lat) + (Math.random() - 0.5) * 0.1;
        const driverLon = parseFloat(lon) + (Math.random() - 0.5) * 0.1;
        const distance = getDistance(lat, lon, driverLat, driverLon);
        const radiusLimit = parseFloat(searchRadius) || 10;
        if (distance <= radiusLimit) {
          let sponsorName = null;
          if (driver.sponsorBy) {
            const sponsor = await User.findOne({
              $or: [
                { sponsorId: driver.sponsorBy },
                { username: driver.sponsorBy },
              ],
            });
            sponsorName = sponsor
              ? `${sponsor.firstName} ${sponsor.lastName}`
              : null;
          }
          return {
            driverId: driver._id,
            username: driver.username,
            name: `${driver.firstName} ${driver.lastName}`,
            email: driver.email,
            sponsorId: driver.sponsorId,
            sponsorName,
            vehicle: driver.pendingVehicleData,
            distance,
            location: { lat: driverLat, lon: driverLon },
          };
        }
        return null;
      })
  );

  const filteredDrivers = nearbyDrivers.filter((driver) => driver !== null);
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Nearby drivers retrieved successfully",
    drivers: filteredDrivers,
    totalDrivers: filteredDrivers.length,
    token,
  });
});

const acceptBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  const driverId = req.user._id;

  const user = await User.findById(driverId);
  if (
    !user ||
    user.role !== "driver" ||
    user.kycLevel < 2 ||
    user.kycStatus !== "approved"
  ) {
    return res.status(403).json({
      message: "Only approved drivers can accept bookings",
      token: req.cookies.token,
    });
  }

  const vehicle = await Vehicle.findOne({
    user: driverId,
    status: "approved",
  });
  if (!vehicle) {
    return res.status(403).json({
      message: "No approved vehicle found for this driver",
      token: req.cookies.token,
    });
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return res.status(404).json({
      message: "Booking not found",
      token: req.cookies.token,
    });
  }
  if (booking.status !== "pending") {
    return res.status(400).json({
      message: "Booking is not in pending status",
      token: req.cookies.token,
    });
  }

  // Check vehicle compatibility with booking requirements
  if (booking.serviceType !== vehicle.serviceType) {
    return res.status(400).json({
      message: "Vehicle service type does not match booking requirements",
      token: req.cookies.token,
    });
  }

  if (booking.serviceCategory && booking.serviceCategory !== vehicle.serviceCategory) {
    return res.status(400).json({
      message: "Vehicle service category does not match booking requirements",
      token: req.cookies.token,
    });
  }

  if (booking.vehicleType && booking.vehicleType !== vehicle.vehicleType) {
    return res.status(400).json({
      message: "Vehicle type does not match booking requirements",
      token: req.cookies.token,
    });
  }

  booking.driver = driverId;
  booking.vehicle = vehicle._id;
  booking.status = "accepted";
  booking.acceptedAt = new Date();
  await booking.save();

  // Populate booking with driver and vehicle details
  await booking.populate('user driver vehicle');

  // Get Socket.IO instance for real-time notifications
  const io = req.app.get('io');
  if (io) {
    // Emit booking request acceptance event
    io.emit('accept_booking_request', {
      requestId: bookingId,
      driverId,
      vehicleId: vehicle._id,
      booking: booking.toObject()
    });
  }

  const token = jwt.sign({ id: driverId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Booking request accepted successfully",
    requestId: bookingId,
    token,
  });
});

const updateBookingStatus = asyncHandler(async (req, res) => {
  const { bookingId, status } = req.body;
  const userId = req.user._id;

  if (!["in_progress", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({
      message:
        "Invalid status. Must be 'in_progress', 'completed', or 'cancelled'",
      token: req.cookies.token,
    });
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return res.status(404).json({
      message: "Booking not found",
      token: req.cookies.token,
    });
  }

  if (
    booking.driver?.toString() !== userId.toString() &&
    booking.user.toString() !== userId.toString()
  ) {
    return res.status(403).json({
      message: "Only the booking user or assigned driver can update status",
      token: req.cookies.token,
    });
  }

  if (status === "in_progress" && booking.status !== "accepted") {
    return res.status(400).json({
      message: "Booking must be accepted before setting to in_progress",
      token: req.cookies.token,
    });
  }

  if (status === "completed" && booking.status !== "in_progress") {
    return res.status(400).json({
      message: "Booking must be in_progress before setting to completed",
      token: req.cookies.token,
    });
  }

  booking.status = status;
  
  // Add completion timestamp if status is completed
  if (status === 'completed') {
    booking.completedAt = new Date();
  }
  
  await booking.save();

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: `Booking status updated to ${status}`,
    bookingId,
    token,
  });
});

const getUserBookings = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const role = req.user.role;

  let bookings;
  if (role === "driver") {
    bookings = await Booking.find({ driver: userId })
      .populate("user", "username firstName lastName email")
      .populate("vehicle")
      .sort({ createdAt: -1 });
  } else {
    bookings = await Booking.find({ user: userId })
      .populate("driver", "username firstName lastName email")
      .populate("vehicle")
      .sort({ createdAt: -1 });
  }

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Bookings retrieved successfully",
    bookings: bookings.map((booking) => ({
      ...booking.toObject(),
      user: booking.user
        ? {
            id: booking.user._id,
            username: booking.user.username,
            firstName: booking.user.firstName,
            lastName: booking.user.lastName,
            email: booking.user.email,
          }
        : null,
      driver: booking.driver
        ? {
            id: booking.driver._id,
            username: booking.driver.username,
            firstName: booking.driver.firstName,
            lastName: booking.driver.lastName,
            email: booking.driver.email,
          }
        : null,
    })),
    totalBookings: bookings.length,
    token,
  });
});

const cancelBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  const userId = req.user._id;

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return res.status(404).json({
      message: "Booking not found",
      token: req.cookies.token,
    });
  }

  if (booking.user.toString() !== userId.toString()) {
    return res.status(403).json({
      message: "Only the booking user can cancel the booking",
      token: req.cookies.token,
    });
  }

  if (booking.status !== "pending" && booking.status !== "accepted") {
    return res.status(400).json({
      message: "Only pending or accepted bookings can be cancelled",
      token: req.cookies.token,
    });
  }

  booking.status = "cancelled";
  await booking.save();

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Booking cancelled successfully",
    bookingId,
    token,
  });
});

// Raise fare for existing booking
const raiseFare = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { newFare } = req.body;
  const userId = req.user._id;

  if (!newFare || newFare <= 0) {
    return res.status(400).json({
      message: "Valid new fare amount is required",
      token: req.cookies.token,
    });
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return res.status(404).json({
      message: "Booking not found",
      token: req.cookies.token,
    });
  }

  if (booking.user.toString() !== userId.toString()) {
    return res.status(403).json({
      message: "You can only raise fare for your own bookings",
      token: req.cookies.token,
    });
  }

  if (booking.status !== "pending") {
    return res.status(400).json({
      message: "Can only raise fare for pending bookings",
      token: req.cookies.token,
    });
  }

  // Get admin-configured fare adjustment settings
  const fareSettings = await getFareAdjustmentSettings(booking.serviceType);
  
  if (!fareSettings.enablePendingBookingFareIncrease) {
    return res.status(403).json({
      message: "Fare increase for pending bookings is currently disabled by admin",
      token: req.cookies.token,
    });
  }

  const originalFare = booking.offeredFare;
  const adjustmentPercentage = fareSettings.allowedAdjustmentPercentage;
  const maxAllowedFare = originalFare * (1 + adjustmentPercentage / 100); // Dynamic percentage increase limit
  const currentFare = booking.raisedFare || booking.offeredFare;
  
  if (newFare <= currentFare) {
    return res.status(400).json({
      message: "New fare must be higher than current fare",
      token: req.cookies.token,
    });
  }

  if (newFare > maxAllowedFare) {
    return res.status(400).json({
      message: `New fare cannot be higher than ${maxAllowedFare.toFixed(2)} AED (${adjustmentPercentage}% increase limit from original fare)`,
      token: req.cookies.token,
    });
  }

  // Store previous fare and update the main fare field
  const previousFare = currentFare;
  booking.fare = newFare;
  booking.raisedFare = newFare;
  await booking.save();

  // Populate user information for the response
  await booking.populate({
    path: 'user',
    select: 'username firstName lastName email phoneNumber gender kycLevel kycStatus role isVerified selfieImage'
  });

  // Get Socket.IO instance for real-time notifications
  const io = req.app.get('io');
  if (io) {
    // Import the findNearbyDrivers function
    const { findNearbyDrivers } = await import('../utils/socketHandlers.js');
    
    // Find compatible drivers for this booking
    const compatibleDrivers = await findNearbyDrivers(booking, io);
    
    // Notify user of fare update
    io.to(`user_${booking.user._id}`).emit('fare_raised', {
      requestId: bookingId,
      previousFare: previousFare,
      newFare: newFare,
      message: 'Fare increased for your booking request'
    });
    
    // Emit fare increase to only compatible drivers instead of broadcasting to all
    compatibleDrivers.forEach(driver => {
      io.to(`driver_${driver._id}`).emit('fare_increased', {
        requestId: bookingId,
        previousFare: previousFare,
        newFare: newFare,
        serviceType: booking.serviceType,
        vehicleType: booking.vehicleType,
        serviceCategory: booking.serviceCategory,
        user: {
          id: booking.user._id,
          username: booking.user.username,
          firstName: booking.user.firstName,
          lastName: booking.user.lastName,
          email: booking.user.email,
          phoneNumber: booking.user.phoneNumber,
          gender: booking.user.gender,
          kycLevel: booking.user.kycLevel,
        kycStatus: booking.user.kycStatus,
         role: booking.user.role,
         isVerified: booking.user.isVerified,
         profileImage: booking.user.selfieImage
       },
       from: {
         address: booking.pickupLocation.address,
         coordinates: booking.pickupLocation.coordinates,
         zone: booking.pickupLocation.zone
       },
       to: {
         address: booking.dropoffLocation.address,
         coordinates: booking.dropoffLocation.coordinates,
         zone: booking.dropoffLocation.zone
       },
       distance: booking.distance,
       distanceInMeters: booking.distanceInMeters,
       routeType: booking.routeType,
       driverPreference: booking.driverPreference,
       pinkCaptainOptions: booking.pinkCaptainOptions,
       furnitureDetails: booking.furnitureDetails,
       timestamp: new Date().toISOString(),
       driverDistance: driver.distance
     });
   });
  }

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });

  res.status(200).json({
    message: "Fare raised successfully for booking request",
    requestId: bookingId,
    previousFare: previousFare,
    fare: newFare,
    user: {
      id: booking.user._id,
      username: booking.user.username,
      firstName: booking.user.firstName,
      lastName: booking.user.lastName,
      email: booking.user.email,
      phoneNumber: booking.user.phoneNumber,
      gender: booking.user.gender,
      kycLevel: booking.user.kycLevel,
      kycStatus: booking.user.kycStatus,
      role: booking.user.role,
      isVerified: booking.user.isVerified,
      profileImage: booking.user.selfieImage
    },
    from: {
      address: booking.pickupLocation.address,
      coordinates: booking.pickupLocation.coordinates,
      zone: booking.pickupLocation.zone
    },
    to: {
      address: booking.dropoffLocation.address,
      coordinates: booking.dropoffLocation.coordinates,
      zone: booking.dropoffLocation.zone
    },
    distance: booking.distance,
    distanceInMeters: booking.distanceInMeters,
    serviceType: booking.serviceType,
    vehicleType: booking.vehicleType,
    serviceCategory: booking.serviceCategory,
    routeType: booking.routeType,
    driverPreference: booking.driverPreference,
    pinkCaptainOptions: booking.pinkCaptainOptions,
    furnitureDetails: booking.furnitureDetails,
    token,
  });
});

// Lower fare for existing booking (3% decrease limit)
const lowerFare = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { newFare } = req.body;
  const userId = req.user._id;

  if (!newFare || newFare <= 0) {
    return res.status(400).json({
      message: "Valid new fare amount is required",
      token: req.cookies.token,
    });
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return res.status(404).json({
      message: "Booking not found",
      token: req.cookies.token,
    });
  }

  if (booking.user.toString() !== userId.toString()) {
    return res.status(403).json({
      message: "You can only lower fare for your own bookings",
      token: req.cookies.token,
    });
  }

  if (booking.status !== "pending") {
    return res.status(400).json({
      message: "Can only lower fare for pending bookings",
      token: req.cookies.token,
    });
  }

  // Get admin-configured fare adjustment settings
  const fareSettings = await getFareAdjustmentSettings(booking.serviceType);
  
  if (!fareSettings.enableUserFareAdjustment) {
    return res.status(403).json({
      message: "Fare adjustment is currently disabled by admin",
      token: req.cookies.token,
    });
  }

  const originalFare = booking.offeredFare; // Use original calculated fare as baseline
  const adjustmentPercentage = fareSettings.allowedAdjustmentPercentage;
  const minAllowedFare = originalFare * (1 - adjustmentPercentage / 100); // Dynamic percentage decrease limit
  const currentFare = booking.raisedFare || booking.offeredFare;

  if (newFare < minAllowedFare) {
    return res.status(400).json({
      message: `New fare cannot be lower than ${minAllowedFare.toFixed(2)} AED (${adjustmentPercentage}% decrease limit from original fare)`,
      token: req.cookies.token,
    });
  }

  if (newFare >= currentFare) {
    return res.status(400).json({
      message: "New fare must be lower than current fare",
      token: req.cookies.token,
    });
  }

  // Store previous fare and update the main fare field
  const previousFare = currentFare;
  booking.fare = newFare;
  booking.raisedFare = newFare;
  await booking.save();

  // Populate user information for the response
  await booking.populate({
    path: 'user',
    select: 'username firstName lastName email phoneNumber gender kycLevel kycStatus role isVerified selfieImage'
  });

  // Get Socket.IO instance for real-time notifications
  const io = req.app.get('io');
  if (io) {
    // Import the findNearbyDrivers function
    const { findNearbyDrivers } = await import('../utils/socketHandlers.js');
    
    // Find compatible drivers for this booking
    const compatibleDrivers = await findNearbyDrivers(booking, io);
    
    // Notify user of fare update
    io.to(`user_${booking.user._id}`).emit('fare_lowered', {
      requestId: bookingId,
      previousFare: previousFare,
      newFare: newFare,
      message: 'Fare decreased for your booking request'
    });
    
    // Emit fare decrease to only compatible drivers
    compatibleDrivers.forEach(driver => {
      io.to(`driver_${driver._id}`).emit('fare_decreased', {
        requestId: bookingId,
        previousFare: previousFare,
        newFare: newFare,
        serviceType: booking.serviceType,
        vehicleType: booking.vehicleType,
        serviceCategory: booking.serviceCategory,
        user: {
          id: booking.user._id,
          username: booking.user.username,
          firstName: booking.user.firstName,
          lastName: booking.user.lastName,
          email: booking.user.email,
          phoneNumber: booking.user.phoneNumber,
          gender: booking.user.gender,
          kycLevel: booking.user.kycLevel,
          kycStatus: booking.user.kycStatus,
          role: booking.user.role,
          isVerified: booking.user.isVerified,
          profileImage: booking.user.selfieImage
        },
        from: {
          address: booking.pickupLocation.address,
          coordinates: booking.pickupLocation.coordinates,
          zone: booking.pickupLocation.zone
        },
        to: {
          address: booking.dropoffLocation.address,
          coordinates: booking.dropoffLocation.coordinates,
          zone: booking.dropoffLocation.zone
        },
        distance: booking.distance,
        distanceInMeters: booking.distanceInMeters,
        routeType: booking.routeType,
        driverPreference: booking.driverPreference,
        pinkCaptainOptions: booking.pinkCaptainOptions,
        furnitureDetails: booking.furnitureDetails,
        timestamp: new Date().toISOString(),
        driverDistance: driver.distance
      });
    });
  }

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });

  res.status(200).json({
    message: "Fare lowered successfully for booking request",
    requestId: bookingId,
    previousFare: previousFare,
    fare: newFare,
    user: {
      id: booking.user._id,
      username: booking.user.username,
      firstName: booking.user.firstName,
      lastName: booking.user.lastName,
      email: booking.user.email,
      phoneNumber: booking.user.phoneNumber,
      gender: booking.user.gender,
      kycLevel: booking.user.kycLevel,
      kycStatus: booking.user.kycStatus,
      role: booking.user.role,
      isVerified: booking.user.isVerified,
      profileImage: booking.user.selfieImage
    },
    from: {
      address: booking.pickupLocation.address,
      coordinates: booking.pickupLocation.coordinates,
      zone: booking.pickupLocation.zone
    },
    to: {
      address: booking.dropoffLocation.address,
      coordinates: booking.dropoffLocation.coordinates,
      zone: booking.dropoffLocation.zone
    },
    distance: booking.distance,
    distanceInMeters: booking.distanceInMeters,
    serviceType: booking.serviceType,
    vehicleType: booking.vehicleType,
    serviceCategory: booking.serviceCategory,
    routeType: booking.routeType,
    driverPreference: booking.driverPreference,
    pinkCaptainOptions: booking.pinkCaptainOptions,
    furnitureDetails: booking.furnitureDetails,
    token,
  });
});

// User fare acceptance function
const respondToDriverFareOffer = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { response, driverId } = req.body; // 'accepted' or 'rejected', and driverId
  const userId = req.user._id;

  // Validate required fields
  if (!response || !['accepted', 'rejected'].includes(response)) {
    return res.status(400).json({
      success: false,
      message: "Response must be either 'accepted' or 'rejected'",
    });
  }

  if (!driverId) {
    return res.status(400).json({
      success: false,
      message: "Driver ID is required",
    });
  }

  // Find the booking
  const booking = await Booking.findById(bookingId)
    .populate('user', 'name email phone')
    .populate('driverOffers.offeredBy', 'firstName lastName email phoneNumber profileImage')
    .populate({
      path: 'driverOffers.offeredBy',
      populate: {
        path: 'pendingVehicleData',
        model: 'Vehicle'
      }
    });

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found",
    });
  }

  // Check if user owns this booking
  if (booking.user._id.toString() !== userId.toString()) {
    return res.status(403).json({
      success: false,
      message: "You can only respond to your own booking requests",
    });
  }

  // Check if booking is in pending status
  if (booking.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: "Can only respond to fare offers for pending bookings",
    });
  }

  // Find the specific driver offer
  const driverOffer = booking.driverOffers.find(
    offer => offer.offeredBy._id.toString() === driverId.toString() && offer.status === 'pending'
  );

  if (!driverOffer) {
    return res.status(400).json({
      success: false,
      message: "No pending driver offer found for this driver",
    });
  }

  const io = req.app.get('io');

  // Update driver offer status
  driverOffer.userResponse = response;
  driverOffer.status = response;
  driverOffer.respondedAt = new Date();

  // Update fare negotiation history
  const historyEntry = booking.fareNegotiationHistory.find(
    entry => entry.offeredBy.toString() === driverId.toString() && 
             entry.status === 'pending'
  );
  if (historyEntry) {
    historyEntry.userResponse = response;
    historyEntry.status = response;
    historyEntry.respondedAt = new Date();
  }

  if (response === 'accepted') {
    // Accept the booking with driver's offered fare
    booking.status = 'accepted';
    booking.driver = driverId;
    booking.acceptedAt = new Date();
    booking.fare = driverOffer.amount; // Update fare to driver's offer

    // Mark all other pending offers as rejected
    booking.driverOffers.forEach(offer => {
      if (offer.offeredBy._id.toString() !== driverId.toString() && offer.status === 'pending') {
        offer.status = 'rejected';
        offer.userResponse = 'rejected';
        offer.respondedAt = new Date();
      }
    });

    await booking.save();

    // Notify accepted driver
    io.to(`driver_${driverId}`).emit('fare_offer_accepted', {
      bookingId: booking._id,
      message: `Your fare offer of ${driverOffer.amount} AED has been accepted`,
      booking: {
        _id: booking._id,
        status: booking.status,
        fare: booking.fare,
        acceptedAt: booking.acceptedAt,
        user: {
          _id: booking.user._id,
          name: booking.user.name,
          phone: booking.user.phone,
          profileImage: booking.user.selfieImage
        },
        pickupLocation: booking.pickupLocation,
        dropoffLocation: booking.dropoffLocation,
        distance: booking.distance,
        serviceType: booking.serviceType,
        vehicleType: booking.vehicleType,
        serviceCategory: booking.serviceCategory
      }
    });

    // Notify all other drivers that their offers were rejected
    booking.driverOffers.forEach(offer => {
      if (offer.offeredBy._id.toString() !== driverId.toString() && offer.status === 'rejected') {
        io.to(`driver_${offer.offeredBy._id}`).emit('fare_offer_rejected', {
          bookingId: booking._id,
          message: `User accepted another driver's offer. Your offer of ${offer.amount} AED was not selected`,
          reason: 'user_accepted_other_offer'
        });
      }
    });

    // Notify user of successful booking acceptance
    io.to(`user_${userId}`).emit('booking_confirmed', {
      bookingId: booking._id,
      message: `Booking confirmed with driver ${driverOffer.driverName} at ${booking.fare} AED`,
      booking: {
        _id: booking._id,
        status: booking.status,
        fare: booking.fare,
        acceptedAt: booking.acceptedAt,
        driver: {
          _id: driverOffer.offeredBy._id,
          name: driverOffer.driverName,
          phone: driverOffer.offeredBy.phoneNumber,
          profileImage: driverOffer.offeredBy.profileImage,
          vehicle: driverOffer.vehicleInfo,
          rating: driverOffer.driverRating,
          estimatedArrival: driverOffer.estimatedArrival
        }
      }
    });
    
    // Auto-start the ride after acceptance
    setTimeout(async () => {
      try {
        const updatedBooking = await Booking.findById(booking._id);
        if (updatedBooking && updatedBooking.status === 'accepted') {
          updatedBooking.status = 'in_progress';
          updatedBooking.startedAt = new Date();
          await updatedBooking.save();
          
          // Notify both user and driver that ride has started
          io.to(`user_${userId}`).emit('ride_started', {
            bookingId: updatedBooking._id,
            message: 'Your ride has started!',
            status: 'in_progress',
            startedAt: updatedBooking.startedAt,
            driver: {
              id: driverId,
              name: driverOffer.driverName,
              phone: driverOffer.offeredBy.phoneNumber
            }
          });
          
          io.to(`driver_${driverId}`).emit('ride_started', {
            bookingId: updatedBooking._id,
            message: 'Ride has started!',
            status: 'in_progress',
            startedAt: updatedBooking.startedAt,
            user: {
              id: userId,
              name: booking.user.name,
              phone: booking.user.phone
            }
          });
        }
      } catch (error) {
        console.error('Error auto-starting ride:', error);
      }
    }, 3000); // Start ride 3 seconds after acceptance

    res.status(200).json({
      success: true,
      message: "Fare offer accepted and booking confirmed",
      booking: {
        _id: booking._id,
        status: booking.status,
        fare: booking.fare,
        acceptedAt: booking.acceptedAt,
        driver: {
          _id: driverOffer.offeredBy._id,
          name: driverOffer.driverName,
          phone: driverOffer.offeredBy.phoneNumber,
          profileImage: driverOffer.offeredBy.profileImage,
          vehicle: driverOffer.vehicleInfo,
          rating: driverOffer.driverRating,
          estimatedArrival: driverOffer.estimatedArrival
        }
      }
    });
  } else {
    // Reject the fare offer
    await booking.save();

    // Notify driver of rejection
    io.to(`driver_${driverId}`).emit('fare_offer_rejected', {
      bookingId: booking._id,
      message: `Your fare offer of ${driverOffer.amount} AED has been rejected`,
      booking: {
        _id: booking._id,
        status: booking.status
      }
    });

    // Count remaining pending offers
    const remainingOffers = booking.driverOffers.filter(offer => offer.status === 'pending').length;

    res.status(200).json({
      success: true,
      message: "Fare offer rejected",
      driverOffer: driverOffer,
      remainingOffers: remainingOffers
    });
  }
});

// Get booking details with fare history
const getBookingDetails = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id;

  try {
    const booking = await Booking.findById(bookingId)
      .populate('user', 'firstName lastName email phone')
      .populate('driver', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user has permission to view this booking
    if (booking.user._id.toString() !== userId.toString() && 
        booking.driver && booking.driver._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only view your own bookings'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Booking details retrieved successfully',
      data: {
        booking: {
          id: booking._id,
          status: booking.status,
          serviceType: booking.serviceType,
          vehicleType: booking.vehicleType,
          pickupLocation: booking.pickupLocation,
          dropoffLocation: booking.dropoffLocation,
          fare: booking.fare,
          offeredFare: booking.offeredFare,
          raisedFare: booking.raisedFare,
          driverOffers: booking.driverOffers,
          fareNegotiationHistory: booking.fareNegotiationHistory,
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
          user: booking.user,
          driver: booking.driver
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving booking details',
      error: error.message
    });
  }
});

// Update booking fare via REST API
const updateBookingFare = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { newFare } = req.body;
  const userId = req.user._id;

  try {
    if (!newFare || newFare <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid fare amount is required'
      });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user owns this booking
    if (booking.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only update your own bookings'
      });
    }

    // Check if booking can be updated
    if (booking.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Can only update fare for pending bookings'
      });
    }

    const previousFare = booking.fare;
    
    // Update fare and add to negotiation history
    booking.fare = newFare;
    booking.raisedFare = newFare;
    booking.fareNegotiationHistory.push({
      actor: 'user',
      actorId: userId,
      previousFare: previousFare,
      newFare: newFare,
      timestamp: new Date(),
      method: 'REST_API'
    });

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Fare updated successfully',
      data: {
        bookingId: booking._id,
        previousFare: previousFare,
        newFare: newFare,
        raisedFare: booking.raisedFare,
        fareNegotiationHistory: booking.fareNegotiationHistory
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating booking fare',
      error: error.message
    });
  }
});

// Get booking fare negotiation history
const getBookingFareHistory = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id;

  try {
    const booking = await Booking.findById(bookingId)
      .populate('user', 'firstName lastName email')
      .populate('driver', 'firstName lastName email');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user has permission to view this booking
    if (booking.user._id.toString() !== userId.toString() && 
        booking.driver && booking.driver._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only view your own bookings'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Fare negotiation history retrieved successfully',
      data: {
        bookingId: booking._id,
        currentFare: booking.fare,
        offeredFare: booking.offeredFare,
        raisedFare: booking.raisedFare,
        driverOffers: booking.driverOffers,
        fareNegotiationHistory: booking.fareNegotiationHistory.map(entry => ({
          actor: entry.actor,
          actorId: entry.actorId,
          previousFare: entry.previousFare,
          newFare: entry.newFare,
          timestamp: entry.timestamp,
          method: entry.method || 'SOCKET_IO'
        })),
        totalNegotiations: booking.fareNegotiationHistory.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving fare history',
      error: error.message
    });
  }
});

// ===== NEW RIDE MANAGEMENT ENDPOINTS =====

// Start ride (REST API endpoint)
const startRide = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id;
  
  try {
    const booking = await Booking.findById(bookingId)
      .populate('user', 'firstName lastName email phoneNumber')
      .populate('driver', 'firstName lastName email phoneNumber');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Only driver can start the ride
    if (req.user.role !== 'driver' || booking.driver._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned driver can start the ride'
      });
    }
    
    if (booking.status !== 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Booking must be accepted before starting ride'
      });
    }
    
    // Update booking status
    booking.status = 'started';
    booking.startedAt = new Date();
    
    // Add system message
    booking.messages.push({
      sender: userId,
      senderType: 'driver',
      message: 'Ride has been started',
      messageType: 'system'
    });
    
    await booking.save();
    
    res.status(200).json({
      success: true,
      message: 'Ride started successfully',
      data: {
        bookingId: booking._id,
        status: booking.status,
        startedAt: booking.startedAt
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error starting ride',
      error: error.message
    });
  }
});

// Complete ride (REST API endpoint)
const completeRide = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { finalLocation } = req.body;
  const userId = req.user._id;
  
  try {
    const booking = await Booking.findById(bookingId)
      .populate('user', 'firstName lastName email phoneNumber wallet')
      .populate('driver', 'firstName lastName email phoneNumber wallet driverPaymentTracking');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Only driver can complete the ride
    if (req.user.role !== 'driver' || booking.driver._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned driver can complete the ride'
      });
    }
    
    if (!['started', 'in_progress'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Ride must be started or in progress to complete'
      });
    }
    
    // Update booking status
    booking.status = 'completed';
    booking.completedAt = new Date();
    
    // Calculate ride duration
    const rideDuration = booking.startedAt ? 
      Math.round((booking.completedAt - booking.startedAt) / (1000 * 60)) : 0;
    
    // Generate receipt number
    const receiptNumber = `AAAO-${Date.now()}-${booking._id.toString().slice(-6).toUpperCase()}`;
    
    // Update receipt details
    booking.receipt = {
      receiptNumber,
      generatedAt: new Date(),
      fromAddress: booking.pickupLocation.address,
      toAddress: booking.dropoffLocation.address,
      rideDistance: booking.distance,
      rideDuration,
      fareBreakdown: {
        baseFare: booking.fareCalculation?.baseFare || 0,
        distanceFare: booking.fareCalculation?.distanceFare || 0,
        timeFare: 0,
        surgeMultiplier: 1,
        taxes: 0,
        totalFare: booking.fare
      }
    };
    
    // Process payment and MLM distribution
    const totalAmount = booking.fare;
    const mlmCommission = Math.round(totalAmount * 0.15); // 15%
    const driverEarnings = totalAmount - mlmCommission; // 85%
    
    booking.paymentDetails = {
      totalAmount,
      mlmCommission,
      driverEarnings,
      paymentStatus: 'completed',
      processedAt: new Date()
    };
    
    // Handle payment based on method
    if (booking.paymentMethod === 'cash') {
      // For cash payments, add to driver's pending amount
      booking.paymentDetails.pendingDriverPayment = {
        amount: mlmCommission,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        isPaid: false
      };
      
      // Update driver's payment tracking
      const driver = await User.findById(booking.driver._id);
      driver.driverPaymentTracking.totalPendingAmount += mlmCommission;
      driver.driverPaymentTracking.unpaidRidesCount += 1;
      
      // Restrict driver if 3+ unpaid rides
      if (driver.driverPaymentTracking.unpaidRidesCount >= 3) {
        driver.driverPaymentTracking.isRestricted = true;
        driver.driverPaymentTracking.restrictedAt = new Date();
      }
      
      // Add to driver's wallet
      driver.wallet.balance += driverEarnings;
      driver.wallet.totalEarnings += driverEarnings;
      driver.wallet.lastUpdated = new Date();
      
      await driver.save();
    } else {
      // For card/bank payments, process normally
      const driver = await User.findById(booking.driver._id);
      driver.wallet.balance += driverEarnings;
      driver.wallet.totalEarnings += driverEarnings;
      driver.wallet.lastUpdated = new Date();
      await driver.save();
      
      // Process MLM distribution and TGP/PGP for non-cash payments
      try {
        // Import the distributeRideMLM function
        const { distributeRideMLM } = await import('../controllers/mlmController.js');
        
        // Create a mock request/response for the MLM distribution
        const mockReq = {
          body: {
            userId: booking.user._id.toString(),
            driverId: booking.driver._id.toString(),
            rideId: booking._id.toString(),
            totalFare: booking.fare,
            rideType: 'personal'
          }
        };
        
        const mockRes = {
          status: (code) => ({
            json: (data) => {
              if (code === 200 && data.success) {
                console.log('MLM distribution and TGP/PGP allocation completed successfully');
                console.log('Qualification points distributed:', data.data?.qualificationPointsDistribution);
              } else {
                console.error('MLM distribution failed:', data.message);
              }
              return data;
            }
          })
        };
        
        // Call the MLM distribution function
        await distributeRideMLM(mockReq, mockRes);
        
      } catch (mlmError) {
        console.error('Error processing MLM distribution and TGP/PGP:', mlmError.message);
      }
    }
    
    // Add system message
    booking.messages.push({
      sender: userId,
      senderType: 'driver',
      message: 'Ride has been completed',
      messageType: 'system'
    });
    
    await booking.save();
    
    res.status(200).json({
      success: true,
      message: 'Ride completed successfully',
      data: {
        bookingId: booking._id,
        status: booking.status,
        completedAt: booking.completedAt,
        receipt: booking.receipt,
        paymentDetails: {
          totalAmount: booking.paymentDetails.totalAmount,
          paymentMethod: booking.paymentMethod
        },
        rideDuration
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error completing ride',
      error: error.message
    });
  }
});

// Get ride messages (REST API endpoint)
const getRideMessages = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id;
  
  try {
    const booking = await Booking.findById(bookingId)
      .populate('user', 'firstName lastName')
      .populate('driver', 'firstName lastName')
      .populate('messages.sender', 'firstName lastName');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Check if user is part of this booking
    const isUser = booking.user._id.toString() === userId.toString();
    const isDriver = booking.driver && booking.driver._id.toString() === userId.toString();
    
    if (!isUser && !isDriver) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view messages for this booking'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Messages retrieved successfully',
      data: {
        bookingId: booking._id,
        messages: booking.messages.map(msg => ({
          id: msg._id,
          sender: {
            id: msg.sender._id,
            name: `${msg.sender.firstName} ${msg.sender.lastName}`,
            type: msg.senderType
          },
          message: msg.message,
          messageType: msg.messageType,
          timestamp: msg.timestamp,
          location: msg.location
        })),
        totalMessages: booking.messages.length
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving messages',
      error: error.message
    });
  }
});

// Submit rating (REST API endpoint)
const submitRating = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { stars, comment } = req.body;
  const userId = req.user._id;
  
  try {
    if (!stars || stars < 1 || stars > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5 stars'
      });
    }
    
    const booking = await Booking.findById(bookingId)
      .populate('user', 'firstName lastName')
      .populate('driver', 'firstName lastName');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only rate completed rides'
      });
    }
    
    // Check if user is part of this booking
    const isUser = booking.user._id.toString() === userId.toString();
    const isDriver = booking.driver && booking.driver._id.toString() === userId.toString();
    
    if (!isUser && !isDriver) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to rate this ride'
      });
    }
    
    // Update rating based on who is rating
    if (isUser) {
      if (booking.rating.userRating.stars) {
        return res.status(400).json({
          success: false,
          message: 'You have already rated this ride'
        });
      }
      
      booking.rating.userRating = {
        stars,
        comment: comment || '',
        ratedAt: new Date()
      };
    } else {
      if (booking.rating.driverRating.stars) {
        return res.status(400).json({
          success: false,
          message: 'You have already rated this ride'
        });
      }
      
      booking.rating.driverRating = {
        stars,
        comment: comment || '',
        ratedAt: new Date()
      };
    }
    
    await booking.save();
    
    res.status(200).json({
      success: true,
      message: 'Rating submitted successfully',
      data: {
        bookingId: booking._id,
        ratedBy: isUser ? 'user' : 'driver',
        stars,
        comment: comment || ''
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error submitting rating',
      error: error.message
    });
  }
});

// Get ride receipt (REST API endpoint)
const getRideReceipt = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id;
  
  try {
    const booking = await Booking.findById(bookingId)
      .populate('user', 'firstName lastName email phoneNumber')
      .populate('driver', 'firstName lastName email phoneNumber');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Check if user is part of this booking
    const isUser = booking.user._id.toString() === userId.toString();
    const isDriver = booking.driver && booking.driver._id.toString() === userId.toString();
    
    if (!isUser && !isDriver) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view receipt for this booking'
      });
    }
    
    if (booking.status !== 'completed' || !booking.receipt) {
      return res.status(400).json({
        success: false,
        message: 'Receipt is only available for completed rides'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Receipt retrieved successfully',
      data: {
        receipt: {
          receiptNumber: booking.receipt.receiptNumber,
          generatedAt: booking.receipt.generatedAt,
          bookingDetails: {
            bookingId: booking._id,
            serviceType: booking.serviceType,
            vehicleType: booking.vehicleType,
            paymentMethod: booking.paymentMethod
          },
          rideDetails: {
            fromAddress: booking.receipt.fromAddress,
            toAddress: booking.receipt.toAddress,
            rideDistance: booking.receipt.rideDistance,
            rideDuration: booking.receipt.rideDuration,
            startedAt: booking.startedAt,
            completedAt: booking.completedAt
          },
          fareDetails: booking.receipt.fareBreakdown,
          userDetails: {
            name: `${booking.user.firstName} ${booking.user.lastName}`,
            email: booking.user.email,
            phone: booking.user.phoneNumber
          },
          driverDetails: {
            name: `${booking.driver.firstName} ${booking.driver.lastName}`,
            phone: booking.driver.phoneNumber
          }
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving receipt',
      error: error.message
    });
  }
});

// Reject booking request (REST API endpoint)
const rejectBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { reason } = req.body;
  const driverId = req.user._id;

  const user = await User.findById(driverId);
  if (!user || user.role !== "driver" || user.kycLevel < 2 || user.kycStatus !== "approved") {
    return res.status(403).json({
      message: "Only approved drivers can reject bookings",
      token: req.cookies.token,
    });
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return res.status(404).json({
      message: "Booking not found",
      token: req.cookies.token,
    });
  }

  if (booking.status !== "pending") {
    return res.status(400).json({
      message: "Booking is no longer available",
      token: req.cookies.token,
    });
  }

  // Add driver to rejected list
  if (!booking.rejectedDrivers) {
    booking.rejectedDrivers = [];
  }

  booking.rejectedDrivers.push({
    driver: driverId,
    reason: reason || "No reason provided",
    rejectedAt: new Date(),
  });

  await booking.save();

  // Get Socket.IO instance for real-time notification
  const io = req.app.get("io");
  if (io) {
    io.to(`user_${booking.user}`).emit("booking_rejected", {
      bookingId: booking._id,
      message: "Booking has been rejected by a driver",
      reason: reason || "No reason provided",
    });
  }

  const token = jwt.sign({ id: driverId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Booking rejected successfully",
    bookingId: booking._id,
    token,
  });
});

// Modify booking fare (Driver action - REST API endpoint)
const modifyBookingFare = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { newFare, reason } = req.body;
  const driverId = req.user._id;

  const user = await User.findById(driverId);
  if (!user || user.role !== "driver" || user.kycLevel < 2 || user.kycStatus !== "approved") {
    return res.status(403).json({
      message: "Only approved drivers can modify fare",
      token: req.cookies.token,
    });
  }

  if (!newFare) {
    return res.status(400).json({
      message: "New fare is required",
      token: req.cookies.token,
    });
  }

  const booking = await Booking.findById(bookingId).populate("user", "firstName lastName email phoneNumber");
  if (!booking) {
    return res.status(404).json({
      message: "Booking not found",
      token: req.cookies.token,
    });
  }

  if (booking.status !== "pending") {
    return res.status(400).json({
      message: "Fare can only be modified for pending bookings",
      token: req.cookies.token,
    });
  }

  // Get fare adjustment settings
  const fareSettings = await getFareAdjustmentSettings(booking.serviceType);
  if (!fareSettings.enableDriverFareAdjustment) {
    return res.status(400).json({
      message: "Driver fare adjustment is disabled",
      token: req.cookies.token,
    });
  }

  // Validate fare adjustment limits
  const originalFare = booking.fare;
  const maxAllowedFare = originalFare * (1 + fareSettings.allowedAdjustmentPercentage / 100);
  const minAllowedFare = originalFare * (1 - fareSettings.allowedAdjustmentPercentage / 100);

  if (newFare > maxAllowedFare || newFare < minAllowedFare) {
    return res.status(400).json({
      message: `Fare adjustment exceeds allowed limit of ${fareSettings.allowedAdjustmentPercentage}%`,
      allowedRange: { min: minAllowedFare, max: maxAllowedFare },
      token: req.cookies.token,
    });
  }

  // Store fare modification request
  booking.fareModificationRequest = {
    requestedBy: driverId,
    originalFare: originalFare,
    requestedFare: newFare,
    reason: reason || "No reason provided",
    requestedAt: new Date(),
    status: "pending",
  };

  await booking.save();

  // Get Socket.IO instance for real-time notification
  const io = req.app.get("io");
  if (io) {
    io.to(`user_${booking.user._id}`).emit("fare_modification_request", {
      bookingId: booking._id,
      originalFare: originalFare,
      requestedFare: newFare,
      reason: reason || "No reason provided",
      driver: {
        id: driverId,
        name: `${user.firstName} ${user.lastName}`,
      },
      requestedAt: booking.fareModificationRequest.requestedAt,
    });
  }

  const token = jwt.sign({ id: driverId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Fare modification request sent to user",
    bookingId: booking._id,
    originalFare: originalFare,
    requestedFare: newFare,
    token,
  });
});

// Send message (REST API endpoint)
const sendMessage = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { message, messageType = "text", location } = req.body;
  const userId = req.user._id;

  if (!message) {
    return res.status(400).json({
      message: "Message is required",
      token: req.cookies.token,
    });
  }

  const booking = await Booking.findById(bookingId)
    .populate("user", "_id firstName lastName")
    .populate("driver", "_id firstName lastName");

  if (!booking) {
    return res.status(404).json({
      message: "Booking not found",
      token: req.cookies.token,
    });
  }

  // Verify user authorization
  const isUser = booking.user._id.toString() === userId.toString();
  const isDriver = booking.driver && booking.driver._id.toString() === userId.toString();

  if (!isUser && !isDriver) {
    return res.status(403).json({
      message: "Unauthorized to send message for this booking",
      token: req.cookies.token,
    });
  }

  if (!["accepted", "started", "in_progress"].includes(booking.status)) {
    return res.status(400).json({
      message: "Messages can only be sent for active rides",
      token: req.cookies.token,
    });
  }

  // Create message object
  const newMessage = {
    sender: userId,
    senderType: isUser ? "user" : "driver",
    message: message.trim(),
    messageType: messageType,
    timestamp: new Date(),
  };

  // Add location if provided for location messages
  if (messageType === "location" && location && location.coordinates) {
    newMessage.location = {
      type: "Point",
      coordinates: location.coordinates,
    };
  }

  // Add message to booking
  booking.messages.push(newMessage);
  await booking.save();

  // Get Socket.IO instance for real-time notification
  const io = req.app.get("io");
  if (io) {
    const messageData = {
      bookingId: booking._id,
      message: {
        id: newMessage._id,
        sender: {
          id: userId,
          name: isUser ? `${booking.user.firstName} ${booking.user.lastName}` : `${booking.driver.firstName} ${booking.driver.lastName}`,
          type: isUser ? "user" : "driver",
        },
        content: newMessage.message,
        messageType: newMessage.messageType,
        location: newMessage.location,
        timestamp: newMessage.timestamp,
      },
    };

    // Send to the other party
    if (isUser) {
      io.to(`driver_${booking.driver._id}`).emit("message_received", messageData);
    } else {
      io.to(`user_${booking.user._id}`).emit("ride_message", messageData);
    }
  }

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Message sent successfully",
    bookingId: booking._id,
    messageId: newMessage._id,
    timestamp: newMessage.timestamp,
    token,
  });
});

// Update driver location (REST API endpoint)
const updateDriverLocation = asyncHandler(async (req, res) => {
  const { coordinates, address, heading, speed } = req.body;
  const driverId = req.user._id;

  const user = await User.findById(driverId);
  if (!user || user.role !== "driver") {
    return res.status(403).json({
      message: "Only drivers can update location",
      token: req.cookies.token,
    });
  }

  if (!coordinates || coordinates.length !== 2) {
    return res.status(400).json({
      message: "Valid coordinates are required",
      token: req.cookies.token,
    });
  }

  // Update driver location
  user.currentLocation = {
    type: "Point",
    coordinates: coordinates,
    address: address || "",
    heading: heading || 0,
    speed: speed || 0,
    lastUpdated: new Date(),
  };

  await user.save();

  // Get Socket.IO instance for real-time notification
  const io = req.app.get("io");
  if (io) {
    // Broadcast location to users who have active bookings with this driver
    const activeBookings = await Booking.find({
      driver: driverId,
      status: { $in: ["accepted", "started", "in_progress"] },
    }).populate("user", "_id");

    activeBookings.forEach((booking) => {
      io.to(`user_${booking.user._id}`).emit("driver_location_update", {
        bookingId: booking._id,
        driverLocation: {
          coordinates: user.currentLocation.coordinates,
          heading: user.currentLocation.heading,
          speed: user.currentLocation.speed,
          timestamp: user.currentLocation.lastUpdated,
        },
      });
    });
  }

  const token = jwt.sign({ id: driverId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Location updated successfully",
    coordinates: user.currentLocation.coordinates,
    timestamp: user.currentLocation.lastUpdated,
    token,
  });
});

// Update user location (REST API endpoint)
const updateUserLocation = asyncHandler(async (req, res) => {
  const { coordinates, address, bookingId } = req.body;
  const userId = req.user._id;

  const user = await User.findById(userId);
  if (!user || user.role !== "user") {
    return res.status(403).json({
      message: "Only users can update user location",
      token: req.cookies.token,
    });
  }

  if (!coordinates || coordinates.length !== 2) {
    return res.status(400).json({
      message: "Valid coordinates are required",
      token: req.cookies.token,
    });
  }

  // Update user location
  user.currentLocation = {
    type: "Point",
    coordinates: coordinates,
    address: address || "",
    lastUpdated: new Date(),
  };

  await user.save();

  // Get Socket.IO instance for real-time notification
  const io = req.app.get("io");
  if (io && bookingId) {
    const booking = await Booking.findById(bookingId).populate("driver", "_id");
    if (booking && booking.driver && ["accepted", "started", "in_progress"].includes(booking.status)) {
      io.to(`driver_${booking.driver._id}`).emit("user_location_update", {
        bookingId: booking._id,
        userLocation: {
          coordinates: user.currentLocation.coordinates,
          address: user.currentLocation.address,
          timestamp: user.currentLocation.lastUpdated,
        },
      });
    }
  }

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Location updated successfully",
    coordinates: user.currentLocation.coordinates,
    timestamp: user.currentLocation.lastUpdated,
    token,
  });
});

// Update driver status (REST API endpoint)
const updateDriverStatus = asyncHandler(async (req, res) => {
  const { isActive, currentLocation } = req.body;
  const driverId = req.user._id;

  const user = await User.findById(driverId);
  if (!user || user.role !== "driver") {
    return res.status(403).json({
      message: "Only drivers can update status",
      token: req.cookies.token,
    });
  }

  // Update driver status
  user.isActive = isActive;
  user.lastActiveAt = new Date();

  if (currentLocation && currentLocation.coordinates) {
    user.currentLocation = {
      type: "Point",
      coordinates: currentLocation.coordinates,
      address: currentLocation.address || "",
    };
  }

  await user.save();

  const token = jwt.sign({ id: driverId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Driver status updated successfully",
    isActive: user.isActive,
    lastActiveAt: user.lastActiveAt,
    token,
  });
});

// Update auto accept settings (REST API endpoint)
const updateAutoAcceptSettings = asyncHandler(async (req, res) => {
  const { enabled, maxDistance, minFare, serviceTypes } = req.body;
  const driverId = req.user._id;

  const user = await User.findById(driverId);
  if (!user || user.role !== "driver") {
    return res.status(403).json({
      message: "Only drivers can update auto-accept settings",
      token: req.cookies.token,
    });
  }

  // Initialize driverSettings if it doesn't exist
  if (!user.driverSettings) {
    user.driverSettings = {};
  }

  user.driverSettings.autoAcceptSettings = {
    enabled: enabled || false,
    maxDistance: maxDistance || 5,
    minFare: minFare || 0,
    serviceTypes: serviceTypes || [],
    updatedAt: new Date(),
  };

  await user.save();

  const token = jwt.sign({ id: driverId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Auto-accept settings updated successfully",
    settings: user.driverSettings.autoAcceptSettings,
    token,
  });
});

// Update ride preferences (REST API endpoint)
const updateRidePreferences = asyncHandler(async (req, res) => {
  const {
    acceptBike,
    acceptRickshaw,
    acceptCar,
    acceptMini,
    pinkCaptainMode,
    acceptFemaleOnly,
    acceptFamilyRides,
    acceptSafeRides,
    acceptFamilyWithGuardianMale,
    acceptMaleWithoutFemale,
    acceptNoMaleCompanion,
    maxRideDistance,
    preferredAreas,
  } = req.body;
  const driverId = req.user._id;

  const user = await User.findById(driverId);
  if (!user || user.role !== "driver") {
    return res.status(403).json({
      message: "Only drivers can update ride preferences",
      token: req.cookies.token,
    });
  }

  // Initialize driverSettings if it doesn't exist
  if (!user.driverSettings) {
    user.driverSettings = {};
  }

  user.driverSettings.ridePreferences = {
    acceptBike: acceptBike || false,
    acceptRickshaw: acceptRickshaw || false,
    acceptCar: acceptCar || false,
    acceptMini: acceptMini || false,
    pinkCaptainMode: pinkCaptainMode || false,
    acceptFemaleOnly: acceptFemaleOnly || false,
    acceptFamilyRides: acceptFamilyRides || false,
    acceptSafeRides: acceptSafeRides || false,
    acceptFamilyWithGuardianMale: acceptFamilyWithGuardianMale || false,
    acceptMaleWithoutFemale: acceptMaleWithoutFemale || false,
    acceptNoMaleCompanion: acceptNoMaleCompanion || false,
    maxRideDistance: maxRideDistance || 50,
    preferredAreas: preferredAreas || [],
    updatedAt: new Date(),
  };

  await user.save();

  const token = jwt.sign({ id: driverId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Ride preferences updated successfully",
    preferences: user.driverSettings.ridePreferences,
    token,
  });
});

export {
  createBooking,
  getNearbyDrivers,
  acceptBooking,
  updateBookingStatus,
  getUserBookings,
  cancelBooking,
  raiseFare,
  lowerFare,
  respondToDriverFareOffer,
  getBookingDetails,
  updateBookingFare,
  getBookingFareHistory,
  startRide,
  completeRide,
  getRideMessages,
  submitRating,
  getRideReceipt,
  // New REST API exports
  rejectBooking,
  modifyBookingFare,
  sendMessage,
  updateDriverLocation,
  updateUserLocation,
  updateDriverStatus,
  updateAutoAcceptSettings,
  updateRidePreferences,
};
