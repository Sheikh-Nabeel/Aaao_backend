import Vehicle from "../models/vehicleModel.js";
import User from "../models/userModel.js";
import Booking from "../models/bookingModel.js";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import asyncHandler from "express-async-handler";
import { io } from "../index.js";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Valid service types and their corresponding vehicle types
const VALID_SERVICE_TYPES = {
  "car cab": ["economy", "premium", "xl", "family", "luxury"],
  bike: ["economy", "premium", "vip"],
  "car recovery": [
    "flatbed towing",
    "wheel lift towing",
    "on-road winching",
    "off-road winching",
    "battery jump start",
    "fuel delivery",
    "luxury & exotic car recovery",
    "accident & collision recovery",
    "heavy-duty vehicle recovery",
    "basement pull-out",
  ],
  "shifting & movers": [
    "mini pickup",
    "suzuki carry",
    "small van",
    "medium truck",
    "mazda",
    "covered van",
    "large truck",
    "6-wheeler",
    "container truck",
  ],
};

const SERVICE_CATEGORY_MAP = {
  "car recovery": {
    "towing services": ["flatbed towing", "wheel lift towing"],
    "winching services": ["on-road winching", "off-road winching"],
    "roadside assistance": ["battery jump start", "fuel delivery"],
    "specialized/heavy recovery": [
      "luxury & exotic car recovery",
      "accident & collision recovery",
      "heavy-duty vehicle recovery",
      "basement pull-out",
    ],
  },
  "shifting & movers": {
    "small mover": ["mini pickup", "suzuki carry", "small van"],
    "medium mover": ["medium truck", "mazda", "covered van"],
    "heavy mover": ["large truck", "6-wheeler", "container truck"],
  },
};

// Hierarchical select flow for frontend
const SELECT_FLOW = [
  {
    key: "car recovery",
    label: "Car Recovery",
    categories: [
      {
        key: "towing services",
        label: "Towing Services",
        imageHint: "Tow truck carrying a sedan on flatbed",
        subServices: [
          {
            key: "flatbed towing",
            label: "Flatbed Towing",
            info: "Safest option for all vehicles, including luxury/exotic cars & low clearance models.",
          },
          {
            key: "wheel lift towing",
            label: "Wheel Lift Towing",
            info: "Quick & efficient method lifting front or rear wheels, suitable for short-distance towing.",
          },
        ],
      },
      {
        key: "winching services",
        label: "Winching Services",
        imageHint: "4x4 recovery vehicle pulling SUV from roadside mud",
        subServices: [
          {
            key: "on-road winching",
            label: "On-Road Winching",
            info: "For vehicles stuck roadside due to ditch, breakdown, or minor accident.",
          },
          {
            key: "off-road winching",
            label: "Off-Road Winching",
            info: "Recovery for vehicles stuck in sand, mud, or rough terrain.",
          },
        ],
      },
      {
        key: "roadside assistance",
        label: "Roadside Assistance",
        imageHint: "Technician helping with car battery on roadside",
        subServices: [
          {
            key: "battery jump start",
            label: "Battery Jump Start",
            info: "Portable jump-start service when battery is dead.",
          },
          {
            key: "fuel delivery",
            label: "Fuel Delivery",
            info: "Fuel delivered directly to stranded vehicles (petrol/diesel).",
          },
        ],
      },
      {
        key: "specialized/heavy recovery",
        label: "Specialized/Heavy Recovery",
        imageHint: "Heavy-duty 6-wheeler tow truck pulling a large truck",
        subServices: [
          {
            key: "luxury & exotic car recovery",
            label: "Luxury & Exotic Car Recovery",
            info: "Secure handling of high-end vehicles.",
          },
          {
            key: "accident & collision recovery",
            label: "Accident & Collision Recovery",
            info: "Safe recovery after accidents.",
          },
          {
            key: "heavy-duty vehicle recovery",
            label: "Heavy-Duty Vehicle Recovery",
            info: "Tow buses, trucks, and trailers.",
          },
          {
            key: "basement pull-out",
            label: "Basement Pull-Out",
            info: "Specialized service for underground/basement parking.",
          },
        ],
      },
    ],
    helpers: {
      packingHelper: false,
      loadingUnloadingHelper: false,
      fixingHelper: false,
    },
    roundTrip: { discount: "AED 10", freeStayMinutes: 30 },
  },
  {
    key: "shifting & movers",
    label: "Shifting & Movers",
    categories: [
      {
        key: "small mover",
        label: "Small Mover",
        info: "Vehicle: Mini Pickup / Suzuki Carry / Small Van. Best for: Small apartments, single-room shifting, few items.",
        vehicles: ["mini pickup", "suzuki carry", "small van"],
      },
      {
        key: "medium mover",
        label: "Medium Mover",
        info: "Vehicle: Medium Truck / Mazda / Covered Van. Best for: 2–3 bedroom homes, medium office relocations.",
        vehicles: ["medium truck", "mazda", "covered van"],
      },
      {
        key: "heavy mover",
        label: "Heavy Mover",
        info: "Vehicle: Large Truck / 6-Wheeler / Container Truck. Best for: Full house shifting, big offices, industrial goods.",
        vehicles: ["large truck", "6-wheeler", "container truck"],
      },
    ],
    helpers: {
      packingHelper: true,
      loadingUnloadingHelper: true,
      fixingHelper: true,
    },
    roundTrip: { discount: "AED 10", freeStayMinutes: 30 },
  },
  {
    key: "car cab",
    label: "Car Cab",
    subServices: [
      {
        key: "economy",
        label: "Economy",
        info: "Budget-friendly rides. Hatchbacks & small sedans. Ideal for daily use & short trips.",
      },
      {
        key: "premium",
        label: "Premium",
        info: "Business-class comfort. Luxury sedans & executive cars. Perfect for corporate travel & events.",
      },
      {
        key: "xl",
        label: "XL (Group Ride)",
        info: "SUVs & 7-seaters. Extra luggage space. Great for groups & airport transfers.",
      },
      {
        key: "family",
        label: "Family",
        info: "Spacious & safe for families. Optional child seat. Focus on comfort & safety for kids.",
      },
      {
        key: "luxury",
        label: "Luxury (VIP)",
        info: "Ultra-luxury cars like Hummer, GMC, Range Rover, Lexus, Mercedes, BMW. High-class comfort & prestige.",
      },
    ],
    helpers: {
      packingHelper: false,
      loadingUnloadingHelper: false,
      fixingHelper: false,
    },
    roundTrip: { discount: "AED 10", freeStayMinutes: 30 },
  },
  {
    key: "bike",
    label: "Bike",
    subServices: [
      {
        key: "economy",
        label: "Economy",
        info: "Budget-friendly motorbike rides.",
      },
      {
        key: "premium",
        label: "Premium",
        info: "Comfortable bikes with experienced riders.",
      },
      {
        key: "vip",
        label: "VIP",
        info: "Stylish, high-end bikes for an exclusive experience.",
      },
    ],
    helpers: {
      packingHelper: false,
      loadingUnloadingHelper: false,
      fixingHelper: false,
    },
    roundTrip: { discount: "AED 10", freeStayMinutes: 30 },
  },
];

const getVehicleSelectFlow = asyncHandler(async (req, res) => {
  res.status(200).json({ message: "Vehicle select flow", flow: SELECT_FLOW });
});

const kycLevel1Check = async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user || user.kycLevel < 1 || user.kycStatus !== "approved") {
    return res.status(403).json({
      message: "KYC Level 1 must be approved before proceeding to Level 2",
      token: req.cookies.token,
    });
  }
  next();
};

const uploadLicense = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return res
      .status(404)
      .json({ message: "User not found", token: req.cookies.token });
  }
  if (user.kycLevel < 1 || user.kycStatus !== "approved") {
    return res.status(403).json({
      message: "Complete and get approved for KYC Level 1 first",
      token: req.cookies.token,
    });
  }
  if (user.kycLevel >= 2 || user.kycStatus === "pending") {
    return res.status(403).json({
      message: "KYC Level 2 already completed or pending approval",
      token: req.cookies.token,
    });
  }

  if (!req.file) {
    return res.status(400).json({
      message: "License image is required for KYC Level 2",
      token: req.cookies.token,
    });
  }

  const licenseImagePath = path
    .join("uploads", req.file.filename)
    .replace(/\\/g, "/");

  user.kycStatus = "pending";
  user.licenseImage = licenseImagePath;
  const savedUser = await user.save();

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "KYC Level 2 (License) submitted and pending admin approval",
    nextStep: "vehicleRegistration",
    serviceTypes: VALID_SERVICE_TYPES,
    token,
  });
});

const registerVehicle = asyncHandler(async (req, res) => {
  const {
    userId,
    vehicleOwnerName,
    companyName,
    vehiclePlateNumber,
    vehicleMakeModel,
    chassisNumber,
    vehicleColor,
    registrationExpiryDate,
    vehicleType,
    serviceType,
    serviceCategory,
    wheelchair,
    packingHelper,
    loadingUnloadingHelper,
    fixingHelper,
  } = req.body;

  const user = await User.findById(userId);
  if (!user || user.kycLevel < 1) {
    return res.status(403).json({
      message: "Complete and get approved for KYC Level 1 first",
      token: req.cookies.token,
    });
  }
  if (user.kycLevel >= 2) {
    return res.status(403).json({
      message: "KYC Level 2 already completed or pending approval",
      token: req.cookies.token,
    });
  }

  // Validate serviceType and vehicleType
  if (serviceType && !Object.keys(VALID_SERVICE_TYPES).includes(serviceType)) {
    return res.status(400).json({
      message: `Invalid serviceType. Valid options are: ${Object.keys(
        VALID_SERVICE_TYPES
      ).join(", ")}`,
      token: req.cookies.token,
    });
  }
  if (
    serviceType &&
    vehicleType &&
    !VALID_SERVICE_TYPES[serviceType]?.includes(vehicleType)
  ) {
    return res.status(400).json({
      message: `Invalid vehicleType '${vehicleType}' for serviceType '${serviceType}'. Valid options are: ${VALID_SERVICE_TYPES[
        serviceType
      ].join(", ")}`,
      token: req.cookies.token,
    });
  }

  // Optional validation for serviceCategory
  if (serviceCategory && serviceType && SERVICE_CATEGORY_MAP[serviceType]) {
    const categoryKey = serviceCategory.toLowerCase();
    const mapKeys = Object.keys(SERVICE_CATEGORY_MAP[serviceType]);
    const foundKey = mapKeys.find((k) => k.toLowerCase() === categoryKey);
    const allowed = foundKey
      ? SERVICE_CATEGORY_MAP[serviceType][foundKey]
      : null;
    if (allowed && vehicleType && !allowed.includes(vehicleType)) {
      return res.status(400).json({
        message: `vehicleType '${vehicleType}' does not belong to serviceCategory '${serviceCategory}'`,
        token: req.cookies.token,
      });
    }
  }

  const uploadToLocal = (file) => {
    if (file) {
      return path.join("uploads", file.filename).replace(/\\/g, "/");
    }
    return null;
  };

  const vehicleRegistrationCardFront =
    req.files && req.files.vehicleRegistrationCardFront
      ? uploadToLocal(req.files.vehicleRegistrationCardFront[0])
      : null;
  const vehicleRegistrationCardBack =
    req.files && req.files.vehicleRegistrationCardBack
      ? uploadToLocal(req.files.vehicleRegistrationCardBack[0])
      : null;
  const roadAuthorityCertificateUrl =
    req.files && req.files.roadAuthorityCertificate
      ? uploadToLocal(req.files.roadAuthorityCertificate[0])
      : null;
  const insuranceCertificateUrl =
    req.files && req.files.insuranceCertificate
      ? uploadToLocal(req.files.insuranceCertificate[0])
      : null;
  const vehicleImagesUrls =
    req.files && req.files.vehicleImages
      ? req.files.vehicleImages.map((file) => uploadToLocal(file))
      : [];

  const vehicleData = {
    userId,
    vehicleRegistrationCard: {
      front: vehicleRegistrationCardFront,
      back: vehicleRegistrationCardBack,
    },
    roadAuthorityCertificate: roadAuthorityCertificateUrl,
    insuranceCertificate: insuranceCertificateUrl,
    vehicleImages: vehicleImagesUrls,
    vehicleOwnerName: vehicleOwnerName || null,
    companyName: companyName || null,
    vehiclePlateNumber: vehiclePlateNumber || null,
    vehicleMakeModel: vehicleMakeModel || null,
    chassisNumber: chassisNumber || null,
    vehicleColor: vehicleColor || null,
    registrationExpiryDate: registrationExpiryDate
      ? new Date(registrationExpiryDate)
      : null,
    vehicleType: vehicleType || null,
    serviceType: serviceType || null,
    serviceCategory: serviceCategory || null,
    wheelchair: wheelchair !== undefined ? Boolean(wheelchair) : false,
    packingHelper: packingHelper !== undefined ? Boolean(packingHelper) : false,
    loadingUnloadingHelper:
      loadingUnloadingHelper !== undefined
        ? Boolean(loadingUnloadingHelper)
        : false,
    fixingHelper: fixingHelper !== undefined ? Boolean(fixingHelper) : false,
  };

  const vehicle = new Vehicle(vehicleData);
  await vehicle.save();

  user.pendingVehicleData = vehicle._id;
  user.kycStatus = "pending";
  await user.save();

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(201).json({
    message: "Vehicle registration submitted and pending admin approval",
    vehicleId: vehicle._id,
    serviceTypes: VALID_SERVICE_TYPES,
    roundTripInfo: {
      discount: "AED 10",
      freeStayMinutes: 30,
      note: "Apply discount and free stay minutes for round-trip bookings in frontend",
    },
    token,
  });
});

const updateVehicle = asyncHandler(async (req, res) => {
  const {
    vehicleId,
    vehicleOwnerName,
    companyName,
    vehiclePlateNumber,
    vehicleMakeModel,
    chassisNumber,
    vehicleColor,
    registrationExpiryDate,
    vehicleType,
    serviceType,
    serviceCategory,
    wheelchair,
    packingHelper,
    loadingUnloadingHelper,
    fixingHelper,
  } = req.body;
  const userId = req.user._id;

  const vehicle = await Vehicle.findOne({ _id: vehicleId, userId });
  if (!vehicle) {
    return res.status(404).json({
      message: "Vehicle not found or you do not have permission to update it",
      token: req.cookies.token,
    });
  }

  // Validate serviceType and vehicleType
  if (serviceType && !Object.keys(VALID_SERVICE_TYPES).includes(serviceType)) {
    return res.status(400).json({
      message: `Invalid serviceType. Valid options are: ${Object.keys(
        VALID_SERVICE_TYPES
      ).join(", ")}`,
      token: req.cookies.token,
    });
  }
  if (
    serviceType &&
    vehicleType &&
    !VALID_SERVICE_TYPES[serviceType]?.includes(vehicleType)
  ) {
    return res.status(400).json({
      message: `Invalid vehicleType '${vehicleType}' for serviceType '${serviceType}'. Valid options are: ${VALID_SERVICE_TYPES[
        serviceType
      ].join(", ")}`,
      token: req.cookies.token,
    });
  }

  // Optional validation for serviceCategory
  if (serviceCategory) {
    const effectiveType = serviceType || vehicle.serviceType;
    if (effectiveType && SERVICE_CATEGORY_MAP[effectiveType]) {
      const categoryKey = serviceCategory.toLowerCase();
      const mapKeys = Object.keys(SERVICE_CATEGORY_MAP[effectiveType]);
      const foundKey = mapKeys.find((k) => k.toLowerCase() === categoryKey);
      const allowed = foundKey
        ? SERVICE_CATEGORY_MAP[effectiveType][foundKey]
        : null;
      if (
        allowed &&
        (vehicleType || vehicle.vehicleType) &&
        !allowed.includes(vehicleType || vehicle.vehicleType)
      ) {
        return res.status(400).json({
          message: `vehicleType '${
            vehicleType || vehicle.vehicleType
          }' does not belong to serviceCategory '${serviceCategory}'`,
          token: req.cookies.token,
        });
      }
    }
  }

  const uploadToLocal = (file) => {
    if (file) {
      return path.join("uploads", file.filename).replace(/\\/g, "/");
    }
    return null;
  };

  vehicle.vehicleOwnerName = vehicleOwnerName || vehicle.vehicleOwnerName;
  vehicle.companyName = companyName || vehicle.companyName;
  vehicle.vehiclePlateNumber = vehiclePlateNumber || vehicle.vehiclePlateNumber;
  vehicle.vehicleMakeModel = vehicleMakeModel || vehicle.vehicleMakeModel;
  vehicle.chassisNumber = chassisNumber || vehicle.chassisNumber;
  vehicle.vehicleColor = vehicleColor || vehicle.vehicleColor;
  vehicle.registrationExpiryDate = registrationExpiryDate
    ? new Date(registrationExpiryDate)
    : vehicle.registrationExpiryDate;
  vehicle.vehicleType = vehicleType || vehicle.vehicleType;
  vehicle.serviceType = serviceType || vehicle.serviceType;
  vehicle.serviceCategory = serviceCategory || vehicle.serviceCategory;
  vehicle.wheelchair =
    wheelchair !== undefined ? Boolean(wheelchair) : vehicle.wheelchair;
  vehicle.packingHelper =
    packingHelper !== undefined
      ? Boolean(packingHelper)
      : vehicle.packingHelper;
  vehicle.loadingUnloadingHelper =
    loadingUnloadingHelper !== undefined
      ? Boolean(loadingUnloadingHelper)
      : vehicle.loadingUnloadingHelper;
  vehicle.fixingHelper =
    fixingHelper !== undefined ? Boolean(fixingHelper) : vehicle.fixingHelper;
  vehicle.vehicleRegistrationCard.front =
    req.files && req.files.vehicleRegistrationCardFront
      ? uploadToLocal(req.files.vehicleRegistrationCardFront[0])
      : vehicle.vehicleRegistrationCard.front;
  vehicle.vehicleRegistrationCard.back =
    req.files && req.files.vehicleRegistrationCardBack
      ? uploadToLocal(req.files.vehicleRegistrationCardBack[0])
      : vehicle.vehicleRegistrationCard.back;
  vehicle.roadAuthorityCertificate =
    req.files && req.files.roadAuthorityCertificate
      ? uploadToLocal(req.files.roadAuthorityCertificate[0])
      : vehicle.roadAuthorityCertificate;
  vehicle.insuranceCertificate =
    req.files && req.files.insuranceCertificate
      ? uploadToLocal(req.files.insuranceCertificate[0])
      : vehicle.insuranceCertificate;
  vehicle.vehicleImages =
    req.files && req.files.vehicleImages
      ? req.files.vehicleImages.map((file) => uploadToLocal(file))
      : vehicle.vehicleImages;

  await vehicle.save();

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Vehicle updated successfully",
    vehicleId: vehicle._id,
    serviceTypes: VALID_SERVICE_TYPES,
    roundTripInfo: {
      discount: "AED 10",
      freeStayMinutes: 30,
      note: "Apply discount and free stay minutes for round-trip bookings in frontend",
    },
    token,
  });
});

const getUserVehicleInfo = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId)
    .select("username firstName lastName email phoneNumber role kycLevel kycStatus licenseImage hasVehicle pendingVehicleData country gender cnicImages selfieImage createdAt updatedAt")
    .populate("pendingVehicleData");
  if (!user) {
    return res
      .status(404)
      .json({ message: "User not found", token: req.cookies.token });
  }

  const vehicle = await Vehicle.findOne({ userId }).select("-__v");
  const response = {
    user: {
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      kycLevel: user.kycLevel,
      kycStatus: user.kycStatus,
      licenseImage: user.licenseImage,
      hasVehicle: user.hasVehicle,
      pendingVehicleData: user.pendingVehicleData,
      country: user.country,
      gender: user.gender,
      cnicImages: user.cnicImages,
      selfieImage: user.selfieImage,
    },
    vehicle: vehicle ? vehicle.toObject() : null,
    serviceTypes: VALID_SERVICE_TYPES,
    roundTripInfo: {
      discount: "AED 10",
      freeStayMinutes: 30,
      note: "Apply discount and free stay minutes for round-trip bookings in frontend",
    },
  };

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({ ...response, token });
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId)
    .select("username firstName lastName email phoneNumber role kycLevel kycStatus licenseImage hasVehicle pendingVehicleData country gender cnicImages selfieImage createdAt updatedAt")
    .populate("pendingVehicleData");
  if (!user) {
    return res
      .status(404)
      .json({ message: "User not found", token: req.cookies.token });
  }

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    user: {
      _id: user._id, // Added user ID to the response
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      kycLevel: user.kycLevel,
      kycStatus: user.kycStatus,
      licenseImage: user.licenseImage,
      hasVehicle: user.hasVehicle,
      pendingVehicleData: user.pendingVehicleData,
      country: user.country,
      gender: user.gender,
      cnicImages: user.cnicImages,
      selfieImage: user.selfieImage,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    serviceTypes: VALID_SERVICE_TYPES,
    roundTripInfo: {
      discount: "AED 10",
      freeStayMinutes: 30,
      note: "Apply discount and free stay minutes for round-trip bookings in frontend",
    },
    token,
  });
});

const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({
      message: "User ID is required",
      token: req.cookies.token,
    });
  }

  const user = await User.findById(userId)
    .select("-password -__v")
    .populate("pendingVehicleData");
  if (!user) {
    return res
      .status(404)
      .json({ message: "User not found", token: req.cookies.token });
  }

  const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    user: {
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      kycLevel: user.kycLevel,
      kycStatus: user.kycStatus,
      licenseImage: user.licenseImage,
      hasVehicle: user.hasVehicle,
      pendingVehicleData: user.pendingVehicleData,
      country: user.country,
      gender: user.gender,
      cnicImages: user.cnicImages,
      selfieImage: user.selfieImage,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    serviceTypes: VALID_SERVICE_TYPES,
    roundTripInfo: {
      discount: "AED 10",
      freeStayMinutes: 30,
      note: "Apply discount and free stay minutes for round-trip bookings in frontend",
    },
    token,
  });
});

// Get pending booking requests for driver
const getPendingRequests = asyncHandler(async (req, res) => {
  const driverId = req.user._id;

  // Get driver's vehicle information
  const driver = await User.findById(driverId)
    .select("firstName lastName pendingVehicleData")
    .populate('pendingVehicleData');
  if (!driver || !driver.pendingVehicleData) {
    return res.status(400).json({
      success: false,
      message: "Driver has no registered vehicles"
    });
  }

  const driverVehicle = driver.pendingVehicleData;

  // Find pending bookings that are specifically available to this driver
  // In the new one-request-at-a-time system, we need to check which bookings
  // this driver is eligible for using the same logic as findNearbyDrivers
  const { findNearbyDrivers } = await import('../utils/socketHandlers.js');
  
  // Get all pending bookings that match driver's vehicle type and service
  const allPendingBookings = await Booking.find({
    status: 'pending',
    serviceType: driverVehicle.serviceType,
    vehicleType: driverVehicle.vehicleType,
    serviceCategory: driverVehicle.serviceCategory,
    // Exclude bookings where this driver has already been rejected
    'rejectedDrivers.driver': { $ne: driverId }
  })
  .populate('user', 'firstName lastName email phoneNumber selfieImage gender kycLevel kycStatus role verificationStatus')
  .sort({ createdAt: -1 });
  
  // Get Socket.IO instance
  const io = req.app.get('io');
  
  // Filter bookings to only show those where this driver would be selected
  const availableBookings = [];
  for (const booking of allPendingBookings) {
    const selectedDrivers = await findNearbyDrivers(booking, io);
    // Check if this driver is the selected one for this booking
    if (selectedDrivers.length > 0 && selectedDrivers[0]._id.toString() === driverId.toString()) {
      availableBookings.push(booking);
    }
  }
  
  const pendingBookings = availableBookings.slice(0, 20); // Limit to 20

  const formattedRequests = pendingBookings.map(booking => ({
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
      firstName: booking.user.firstName,
      lastName: booking.user.lastName,
      email: booking.user.email,
      phoneNumber: booking.user.phoneNumber,
      gender: booking.user.gender,
      kycLevel: booking.user.kycLevel,
      kycStatus: booking.user.kycStatus,
      role: booking.user.role,
      verificationStatus: booking.user.verificationStatus,
      profileImage: booking.user.selfieImage
    },
    from: booking.from,
    to: booking.to,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt
  }));

  res.status(200).json({
    success: true,
    message: "Pending requests retrieved successfully",
    requests: formattedRequests,
    count: formattedRequests.length
  });
});

// Accept a booking request
const acceptBookingRequest = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const driverId = req.user._id;

  // Find the booking
  const booking = await Booking.findById(bookingId)
    .populate('user', 'firstName lastName email phoneNumber selfieImage gender kycLevel kycStatus role verificationStatus');

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found"
    });
  }

  if (booking.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: "Booking is no longer available"
    });
  }

  // Update booking with driver and status
  booking.driver = driverId;
  booking.status = 'accepted';
  booking.acceptedAt = new Date();
  await booking.save();

  // Get driver information
  const driver = await User.findById(driverId)
    .populate('vehicles')
    .select('firstName lastName email phoneNumber selfieImage gender kycLevel kycStatus role verificationStatus vehicles');

  // Emit Socket.IO event to user
  io.emit('booking_accepted', {
    requestId: booking._id,
    status: 'accepted',
    driver: {
      id: driver._id,
      firstName: driver.firstName,
      lastName: driver.lastName,
      email: driver.email,
      phoneNumber: driver.phoneNumber,
      gender: driver.gender,
      kycLevel: driver.kycLevel,
      kycStatus: driver.kycStatus,
      role: driver.role,
      verificationStatus: driver.verificationStatus,
      profileImage: driver.selfieImage,
      vehicle: driver.vehicles[0]
    },
    acceptedAt: booking.acceptedAt
  });

  res.status(200).json({
    success: true,
    message: "Booking accepted successfully",
    booking: {
      requestId: booking._id,
      status: booking.status,
      fare: booking.fare,
      raisedFare: booking.raisedFare,
      distance: booking.distance,
      serviceType: booking.serviceType,
      vehicleType: booking.vehicleType,
      serviceCategory: booking.serviceCategory,
      user: {
        id: booking.user._id,
        firstName: booking.user.firstName,
        lastName: booking.user.lastName,
        email: booking.user.email,
        phoneNumber: booking.user.phoneNumber,
        profileImage: booking.user.selfieImage
      },
      from: booking.from,
      to: booking.to,
      acceptedAt: booking.acceptedAt
    }
  });
});

// Reject a booking request
const rejectBookingRequest = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const driverId = req.user._id;
  const { reason } = req.body;

  // Find the booking
  const booking = await Booking.findById(bookingId);

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found"
    });
  }

  if (booking.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: "Booking is no longer available"
    });
  }

  // Add driver to rejected drivers list (to avoid showing same request again)
  if (!booking.rejectedDrivers) {
    booking.rejectedDrivers = [];
  }
  booking.rejectedDrivers.push({
    driver: driverId,
    reason: reason || 'No reason provided',
    rejectedAt: new Date()
  });
  await booking.save();

  // Emit Socket.IO event to notify about rejection (for admin/monitoring)
  io.emit('booking_rejected', {
    requestId: booking._id,
    driverId: driverId,
    reason: reason || 'No reason provided',
    rejectedAt: new Date()
  });

  res.status(200).json({
    success: true,
    message: "Booking rejected successfully",
    requestId: booking._id
  });
});

// Get driver's accepted bookings
const getDriverBookings = asyncHandler(async (req, res) => {
  const driverId = req.user._id;
  const { status, page = 1, limit = 10 } = req.query;

  const query = { driver: driverId };
  if (status) {
    query.status = status;
  }

  const bookings = await Booking.find(query)
    .populate('user', 'firstName lastName email phoneNumber selfieImage gender kycLevel kycStatus role verificationStatus')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const totalBookings = await Booking.countDocuments(query);

  const formattedBookings = bookings.map(booking => ({
    requestId: booking._id,
    status: booking.status,
    fare: booking.fare,
    raisedFare: booking.raisedFare,
    distance: booking.distance,
    serviceType: booking.serviceType,
    vehicleType: booking.vehicleType,
    serviceCategory: booking.serviceCategory,
    user: {
      id: booking.user._id,
      firstName: booking.user.firstName,
      lastName: booking.user.lastName,
      email: booking.user.email,
      phoneNumber: booking.user.phoneNumber,
      profileImage: booking.user.selfieImage
    },
    from: booking.from,
    to: booking.to,
    createdAt: booking.createdAt,
    acceptedAt: booking.acceptedAt,
    completedAt: booking.completedAt
  }));

  res.status(200).json({
    success: true,
    message: "Driver bookings retrieved successfully",
    bookings: formattedBookings,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalBookings / limit),
      totalBookings,
      hasNextPage: page < Math.ceil(totalBookings / limit),
      hasPrevPage: page > 1
    }
  });
});

// Driver fare offer function
const offerFare = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { fareAmount } = req.body;
  const driverId = req.user._id;

  // Validate required fields
  if (!fareAmount) {
    return res.status(400).json({
      success: false,
      message: "Fare amount is required",
    });
  }

  // Find the booking
  const booking = await Booking.findById(bookingId)
    .populate('user', 'name email phone')
    .populate('driver', 'name email phone');

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found",
    });
  }

  // Check if booking is in pending status
  if (booking.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: "Can only offer fare for pending bookings",
    });
  }

  // Check if driver has already been rejected for this booking
  const isRejectedDriver = booking.rejectedDrivers.some(
    rejected => rejected.driver.toString() === driverId.toString()
  );

  if (isRejectedDriver) {
    return res.status(403).json({
      success: false,
      message: "Cannot offer fare for a booking you have been rejected from",
    });
  }

  // Validate fare amount (±3% of original fare)
  const originalFare = booking.raisedFare || booking.offeredFare;
  const minFare = originalFare * 0.97; // 3% decrease
  const maxFare = originalFare * 1.03; // 3% increase

  if (fareAmount < minFare || fareAmount > maxFare) {
    return res.status(400).json({
      success: false,
      message: `Fare amount must be between ${minFare.toFixed(2)} AED and ${maxFare.toFixed(2)} AED (±3% of original fare)`,
    });
  }

  // Check if driver already has a pending fare offer
  const existingOffer = booking.driverOffers.find(
    offer => offer.offeredBy.toString() === driverId.toString() && offer.status === 'pending'
  );
  
  if (existingOffer) {
    return res.status(400).json({
      success: false,
      message: "You already have a pending fare offer for this booking",
    });
  }

  // Get driver details for the offer
  const driver = await User.findById(driverId)
    .select("firstName lastName rating pendingVehicleData")
    .populate('pendingVehicleData');
  
  // Add new driver offer to the array
  const newOffer = {
    amount: fareAmount,
    offeredBy: driverId,
    offeredAt: new Date(),
    status: 'pending',
    driverName: `${driver.firstName} ${driver.lastName}`,
    driverRating: driver.rating || 4.5,
    vehicleInfo: {
      type: driver.pendingVehicleData?.vehicleType,
      model: driver.pendingVehicleData?.vehicleModel,
      plateNumber: driver.pendingVehicleData?.plateNumber,
      color: driver.pendingVehicleData?.vehicleColor
    },
    estimatedArrival: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
    expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now
  };
  
  booking.driverOffers.push(newOffer);

  // Add to fare negotiation history
  booking.fareNegotiationHistory.push({
    offeredBy: driverId,
    amount: fareAmount,
    offeredAt: new Date(),
    status: 'pending'
  });

  await booking.save();

  // Emit real-time notification to user with all pending offers
  const io = req.app.get('io');
  const pendingOffers = booking.driverOffers.filter(offer => offer.status === 'pending');
  
  io.to(`user_${booking.user._id}`).emit('driver_offers_updated', {
    bookingId: booking._id,
    offers: pendingOffers.map(offer => ({
      driverId: offer.offeredBy,
      driverName: offer.driverName,
      driverRating: offer.driverRating,
      vehicleInfo: offer.vehicleInfo,
      proposedFare: offer.amount,
      estimatedArrival: offer.estimatedArrival,
      expiresAt: offer.expiresAt,
      offeredAt: offer.offeredAt
    })),
    totalOffers: pendingOffers.length,
    originalFare: originalFare,
    message: `${driver.firstName} ${driver.lastName} has offered a fare of ${fareAmount} AED for your booking`
  });

  res.status(200).json({
    success: true,
    message: "Fare offer submitted successfully",
    driverOffer: newOffer,
    totalPendingOffers: booking.driverOffers.filter(offer => offer.status === 'pending').length
  });
});

export {
  uploadLicense,
  registerVehicle,
  updateVehicle,
  getUserVehicleInfo,
  getCurrentUser,
  getUserById,
  getVehicleSelectFlow,
  getPendingRequests,
  acceptBookingRequest,
  rejectBookingRequest,
  getDriverBookings,
  offerFare,
};
