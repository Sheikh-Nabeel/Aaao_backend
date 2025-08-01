// Import required modules for vehicle and user management, cloud storage, and JWT
import Vehicle from "../models/vehicleModel.js";
import User from "../models/userModel.js";
import cloudinary from "cloudinary";
import jwt from "jsonwebtoken";

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.Cloud_Name,
  api_key: process.env.API_Key,
  api_secret: process.env.API_Secret,
});

// Middleware to check if user has completed KYC Level 1
const kycLevel1Check = async (req, res, next) => {
  // Find user by authenticated ID
  const user = await User.findById(req.user._id);
  // Check if user exists and has KYC Level 1
  if (!user || user.kycLevel < 1) {
    return res.status(403).json({
      message: "KYC Level 1 must be completed before proceeding to Level 2",
      token: req.cookies.token,
    });
  }
  next(); // Proceed to next middleware
};

// Handle license image upload for KYC Level 2
const uploadLicense = async (req, res) => {
  // Extract userId from request body
  const { userId } = req.body;
  console.log("req.file:", req.file); // Log file for debugging

  // Find user by ID
  const user = await User.findById(userId);
  if (!user) {
    return res
      .status(404)
      .json({ message: "User not found", token: req.cookies.token });
  }
  if (user.kycLevel < 1) {
    return res.status(403).json({
      message: "Complete KYC Level 1 first",
      token: req.cookies.token,
    });
  }

  try {
    // Upload license image to Cloudinary
    const uploadResult = req.file
      ? await cloudinary.uploader.upload(req.file.path, {
          folder: "kyc/license",
        })
      : null;
    if (!uploadResult) {
      return res.status(400).json({
        message: "License image is required for KYC Level 2",
        token: req.cookies.token,
      });
    }

    // Update user with new KYC level and license image
    user.kycLevel = 2;
    user.licenseImage = uploadResult.secure_url;
    const savedUser = await user.save();
    console.log("Saved user with licenseImage:", savedUser.licenseImage); // Log success

    // Generate new token and set cookie
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY,
    });
    res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
    res.status(200).json({
      message: "KYC Level 2 (License) uploaded successfully",
      hasVehicle: "Please select: Do you have a vehicle? (Yes/No)",
      token,
    });
  } catch (error) {
    console.error("Error saving license:", error); // Log any errors
    res.status(500).json({ message: error.message, token: req.cookies.token });
  }
};

// Handle vehicle ownership decision
const handleVehicleDecision = async (req, res) => {
  // Extract userId and vehicle decision from request body
  const { userId, hasVehicle } = req.body;

  // Find user by ID
  const user = await User.findById(userId);
  if (!user || user.kycLevel < 2) {
    return res.status(403).json({
      message: "Complete KYC Level 2 first",
      token: req.cookies.token || "no-token",
    });
  }

  if (hasVehicle === "no") {
    // Update role to driver if no vehicle
    user.role = "driver";
    await user.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY,
    });
    res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
    res.status(200).json({
      message:
        "Role updated to driver. You can switch back to customer and book rides.",
      role: user.role,
      token,
    });
  } else if (hasVehicle === "yes") {
    // Prompt for vehicle registration if yes
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY,
    });
    res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
    res.status(200).json({
      message: "Please register your vehicle (all fields are optional)",
      nextStep: "vehicleRegistration",
      token,
    });
  } else {
    res.status(400).json({
      message: "Please select Yes or No for vehicle ownership",
      token: req.cookies.token || "no-token",
    });
  }
};

// Register a new vehicle for the user
const registerVehicle = async (req, res) => {
  console.log("req.files:", req.files); // Log uploaded files for debugging
  const {
    userId,
    vehicleRegistrationCard,
    roadAuthorityCertificate,
    vehicleOwnerName,
    companyName,
    vehiclePlateNumber,
    vehicleMakeModel,
    chassisNumber,
    vehicleColor,
    registrationExpiryDate,
    insuranceCertificate,
    vehicleType,
    vehicleImages,
  } = req.body;

  // Verify user KYC level
  const user = await User.findById(userId);
  if (!user || user.kycLevel < 2) {
    return res.status(403).json({
      message: "Complete KYC Level 2 first",
      token: req.cookies.token,
    });
  }

  try {
    // Upload files to Cloudinary
    const uploadToCloudinary = async (file) => {
      if (file) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: "vehicles",
        });
        return result.secure_url;
      }
      return null;
    };

    const vehicleRegistrationCardFront = req.files?.vehicleRegistrationCardFront
      ? await uploadToCloudinary(req.files.vehicleRegistrationCardFront[0])
      : vehicleRegistrationCard?.front;
    const vehicleRegistrationCardBack = req.files?.vehicleRegistrationCardBack
      ? await uploadToCloudinary(req.files.vehicleRegistrationCardBack[0])
      : vehicleRegistrationCard?.back;
    const roadAuthorityCertificateUrl = req.files?.roadAuthorityCertificate
      ? await uploadToCloudinary(req.files.roadAuthorityCertificate[0])
      : roadAuthorityCertificate;
    const insuranceCertificateUrl = req.files?.insuranceCertificate
      ? await uploadToCloudinary(req.files.insuranceCertificate[0])
      : insuranceCertificate;
    const vehicleImagesUrls = req.files?.vehicleImages
      ? await Promise.all(req.files.vehicleImages.map(uploadToCloudinary))
      : vehicleImages;

    // Prepare vehicle data
    const vehicleData = {
      userId,
      vehicleRegistrationCard: {
        front: vehicleRegistrationCardFront,
        back: vehicleRegistrationCardBack,
      },
      roadAuthorityCertificate: roadAuthorityCertificateUrl,
      vehicleOwnerName,
      companyName,
      vehiclePlateNumber,
      vehicleMakeModel,
      chassisNumber,
      vehicleColor,
      registrationExpiryDate: registrationExpiryDate
        ? new Date(registrationExpiryDate)
        : null,
      insuranceCertificate: insuranceCertificateUrl,
      vehicleType,
      vehicleImages: vehicleImagesUrls,
      wheelchair: false, // Default wheelchair status
    };

    // Save new vehicle
    const vehicle = new Vehicle(vehicleData);
    await vehicle.save();

    // Update user role to driver
    user.role = "driver";
    await user.save();

    // Generate new token and respond
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY,
    });
    res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
    res.status(201).json({
      message: "Vehicle registered successfully",
      vehicleId: vehicle._id,
      role: user.role,
      token,
    });
  } catch (error) {
    res.status(500).json({ message: error.message, token: req.cookies.token });
  }
};

// Update an existing vehicle
const updateVehicle = async (req, res) => {
  // Extract update data from request body
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
    wheelchair,
  } = req.body;
  const userId = req.user._id;

  try {
    // Find vehicle by ID and user
    const vehicle = await Vehicle.findOne({ _id: vehicleId, userId });
    if (!vehicle) {
      return res.status(404).json({
        message: "Vehicle not found or you do not have permission to update it",
        token: req.cookies.token,
      });
    }

    // Upload new files to Cloudinary if provided
    const uploadToCloudinary = async (file) => {
      if (file) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: "vehicles",
        });
        return result.secure_url;
      }
      return null;
    };

    const vehicleRegistrationCardFront = req.files?.vehicleRegistrationCardFront
      ? await uploadToCloudinary(req.files.vehicleRegistrationCardFront[0])
      : vehicle.vehicleRegistrationCard.front;
    const vehicleRegistrationCardBack = req.files?.vehicleRegistrationCardBack
      ? await uploadToCloudinary(req.files.vehicleRegistrationCardBack[0])
      : vehicle.vehicleRegistrationCard.back;
    const roadAuthorityCertificateUrl = req.files?.roadAuthorityCertificate
      ? await uploadToCloudinary(req.files.roadAuthorityCertificate[0])
      : vehicle.roadAuthorityCertificate;
    const insuranceCertificateUrl = req.files?.insuranceCertificate
      ? await uploadToCloudinary(req.files.insuranceCertificate[0])
      : vehicle.insuranceCertificate;
    const vehicleImagesUrls = req.files?.vehicleImages
      ? await Promise.all(req.files.vehicleImages.map(uploadToCloudinary))
      : vehicle.vehicleImages;

    // Update vehicle fields, retaining existing values if not provided
    vehicle.vehicleOwnerName = vehicleOwnerName || vehicle.vehicleOwnerName;
    vehicle.companyName = companyName || vehicle.companyName;
    vehicle.vehiclePlateNumber =
      vehiclePlateNumber || vehicle.vehiclePlateNumber;
    vehicle.vehicleMakeModel = vehicleMakeModel || vehicle.vehicleMakeModel;
    vehicle.chassisNumber = chassisNumber || vehicle.chassisNumber;
    vehicle.vehicleColor = vehicleColor || vehicle.vehicleColor;
    vehicle.registrationExpiryDate = registrationExpiryDate
      ? new Date(registrationExpiryDate)
      : vehicle.registrationExpiryDate;
    vehicle.vehicleType = vehicleType || vehicle.vehicleType;
    vehicle.wheelchair =
      wheelchair !== undefined ? wheelchair : vehicle.wheelchair;
    vehicle.vehicleRegistrationCard.front = vehicleRegistrationCardFront;
    vehicle.vehicleRegistrationCard.back = vehicleRegistrationCardBack;
    vehicle.roadAuthorityCertificate = roadAuthorityCertificateUrl;
    vehicle.insuranceCertificate = insuranceCertificateUrl;
    vehicle.vehicleImages = vehicleImagesUrls || vehicle.vehicleImages;

    // Save updated vehicle
    await vehicle.save();

    // Generate new token and respond
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY,
    });
    res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
    res.status(200).json({
      message: "Vehicle updated successfully",
      vehicleId: vehicle._id,
      token,
    });
  } catch (error) {
    res.status(500).json({ message: error.message, token: req.cookies.token });
  }
};

// Get user and vehicle information for authenticated user
const getUserVehicleInfo = async (req, res) => {
  // Use authenticated userId
  const userId = req.user._id;

  try {
    // Find user by ID, excluding password and version fields
    const user = await User.findById(userId).select("-password -__v");
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", token: req.cookies.token });
    }

    // Find associated vehicle
    const vehicle = await Vehicle.findOne({ userId }).select("-__v");
    const response = {
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        kycLevel: user.kycLevel,
        licenseImage: user.licenseImage,
        gender: user.gender,
      },
      vehicle: vehicle ? vehicle.toObject() : null,
    };

    // Generate new token and respond
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY,
    });
    res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
    res.status(200).json({ ...response, token });
  } catch (error) {
    res.status(500).json({ message: error.message, token: req.cookies.token });
  }
};

// Get current authenticated user's details
const getCurrentUser = async (req, res) => {
  // Use authenticated userId
  const userId = req.user._id;

  try {
    // Find user by ID, excluding password and version fields
    const user = await User.findById(userId).select("-password -__v");
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", token: req.cookies.token });
    }

    // Prepare response with user details
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY,
    });
    res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
    res.status(200).json({
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        kycLevel: user.kycLevel,
        licenseImage: user.licenseImage,
        gender: user.gender,
      },
      token,
    });
  } catch (error) {
    res.status(500).json({ message: error.message, token: req.cookies.token });
  }
};

// Export all controller functions
export {
  uploadLicense,
  handleVehicleDecision,
  registerVehicle,
  updateVehicle,
  getUserVehicleInfo,
  getCurrentUser,
};
