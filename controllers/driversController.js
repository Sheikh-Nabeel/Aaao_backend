import Vehicle from "../models/vehicleModel.js";
import User from "../models/userModel.js";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";

// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), "Uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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

const uploadLicense = async (req, res) => {
  const { userId } = req.body;
  console.log("req.file:", req.file);

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

  try {
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
    console.log("Saved user with licenseImage:", savedUser.licenseImage);

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY,
    });
    res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
    res.status(200).json({
      message: "KYC Level 2 (License) submitted and pending admin approval",
      hasVehicle: "Please select: Do you have a vehicle? (Yes/No)",
      token,
    });
  } catch (error) {
    console.error("Error saving license:", error);
    res.status(500).json({ message: error.message, token: req.cookies.token });
  }
};

const handleVehicleDecision = async (req, res) => {
  const { userId, hasVehicle } = req.body;

  console.log("Request body:", req.body);
  console.log("Authenticated user ID:", req.user._id);

  const user = await User.findById(userId);
  if (!user) {
    console.log("User not found for userId:", userId);
    return res.status(404).json({
      message: "User not found",
      token: req.cookies.token || "no-token",
    });
  }
  console.log("User data:", {
    kycLevel: user.kycLevel,
    kycStatus: user.kycStatus,
  });

  if (user.kycLevel < 1) {
    console.log("KYC Level check failed: kycLevel =", user.kycLevel);
    return res.status(403).json({
      message: "KYC Level 1 must be approved before proceeding to Level 2",
      token: req.cookies.token || "no-token",
    });
  }

  if (user.kycLevel >= 2) {
    console.log("KYC Level 2 already completed: kycLevel =", user.kycLevel);
    return res.status(403).json({
      message: "KYC Level 2 already completed or pending approval",
      token: req.cookies.token || "no-token",
    });
  }

  if (!["yes", "no"].includes(hasVehicle)) {
    return res.status(400).json({
      message: "Please select Yes or No for vehicle ownership",
      token: req.cookies.token || "no-token",
    });
  }

  user.hasVehicle = hasVehicle;
  await user.save();
  console.log(
    `Updated user ${userId}, hasVehicle: ${hasVehicle}, kycStatus: ${user.kycStatus}`
  );

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });

  if (hasVehicle === "yes") {
    res.status(200).json({
      message: "Please register your vehicle (all fields are optional)",
      nextStep: "vehicleRegistration",
      token,
    });
  } else {
    res.status(200).json({
      message: "Vehicle decision submitted and pending admin approval",
      token,
    });
  }
};

const registerVehicle = async (req, res) => {
  console.log("req.files:", req.files);
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
    wheelchair,
  } = req.body;

  const user = await User.findById(userId);
  console.log("User data for registerVehicle:", {
    userId,
    exists: !!user,
    kycLevel: user?.kycLevel,
    kycStatus: user?.kycStatus,
    hasVehicle: user?.hasVehicle,
    authUserId: req.user._id.toString(),
  });

  if (!user || user.kycLevel < 1) {
    console.log("KYC Level 1 check failed for userId:", userId);
    return res.status(403).json({
      message: "Complete and get approved for KYC Level 1 first",
      token: req.cookies.token,
    });
  }
  if (user.kycLevel >= 2) {
    console.log(
      "KYC Level 2 check failed: kycLevel =",
      user.kycLevel,
      "kycStatus =",
      user.kycStatus
    );
    return res.status(403).json({
      message: "KYC Level 2 already completed or pending approval",
      token: req.cookies.token,
    });
  }
  if (user.hasVehicle !== "yes") {
    console.log(
      "Vehicle ownership check failed: hasVehicle =",
      user.hasVehicle
    );
    return res.status(400).json({
      message: "Vehicle ownership must be set to 'yes' to register a vehicle",
      token: req.cookies.token,
    });
  }

  try {
    const uploadToLocal = (file) => {
      if (file) {
        return path.join("uploads", file.filename).replace(/\\/g, "/");
      }
      return null;
    };

    // Handle file uploads, default to null if not provided
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
      wheelchair: wheelchair !== undefined ? Boolean(wheelchair) : false,
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
      token,
    });
  } catch (error) {
    console.error("Error registering vehicle:", error);
    res.status(500).json({ message: error.message, token: req.cookies.token });
  }
};

const updateVehicle = async (req, res) => {
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
    wheelchair,
  } = req.body;
  const userId = req.user._id;

  try {
    const vehicle = await Vehicle.findOne({ _id: vehicleId, userId });
    if (!vehicle) {
      return res.status(404).json({
        message: "Vehicle not found or you do not have permission to update it",
        token: req.cookies.token,
      });
    }

    const uploadToLocal = (file) => {
      if (file) {
        return path.join("uploads", file.filename).replace(/\\/g, "/");
      }
      return null;
    };

    // Preserve existing values if new files are not provided
    const vehicleRegistrationCardFront =
      req.files && req.files.vehicleRegistrationCardFront
        ? uploadToLocal(req.files.vehicleRegistrationCardFront[0])
        : vehicle.vehicleRegistrationCard.front;
    const vehicleRegistrationCardBack =
      req.files && req.files.vehicleRegistrationCardBack
        ? uploadToLocal(req.files.vehicleRegistrationCardBack[0])
        : vehicle.vehicleRegistrationCard.back;
    const roadAuthorityCertificateUrl =
      req.files && req.files.roadAuthorityCertificate
        ? uploadToLocal(req.files.roadAuthorityCertificate[0])
        : vehicle.roadAuthorityCertificate;
    const insuranceCertificateUrl =
      req.files && req.files.insuranceCertificate
        ? uploadToLocal(req.files.insuranceCertificate[0])
        : vehicle.insuranceCertificate;
    const vehicleImagesUrls =
      req.files && req.files.vehicleImages
        ? req.files.vehicleImages.map((file) => uploadToLocal(file))
        : vehicle.vehicleImages;

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
    vehicle.serviceType = serviceType || vehicle.serviceType;
    vehicle.wheelchair =
      wheelchair !== undefined ? Boolean(wheelchair) : vehicle.wheelchair;
    vehicle.vehicleRegistrationCard.front = vehicleRegistrationCardFront;
    vehicle.vehicleRegistrationCard.back = vehicleRegistrationCardBack;
    vehicle.roadAuthorityCertificate = roadAuthorityCertificateUrl;
    vehicle.insuranceCertificate = insuranceCertificateUrl;
    vehicle.vehicleImages = vehicleImagesUrls || vehicle.vehicleImages;

    await vehicle.save();

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
    console.error("Error updating vehicle:", error);
    res.status(500).json({ message: error.message, token: req.cookies.token });
  }
};

const getUserVehicleInfo = async (req, res) => {
  const userId = req.user._id;

  try {
    const user = await User.findById(userId)
      .select("-password -__v")
      .populate("pendingVehicleData");
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", token: req.cookies.token });
    }

    const vehicle = await Vehicle.findOne({ userId }).select("-__v");
    const response = {
      user: {
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
    };

    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY,
    });
    res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
    res.status(200).json({ ...response, token });
  } catch (error) {
    console.error("Error fetching user vehicle info:", error);
    res.status(500).json({ message: error.message, token: req.cookies.token });
  }
};

const getCurrentUser = async (req, res) => {
  const userId = req.user._id;

  try {
    const user = await User.findById(userId)
      .select("-password -__v")
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
      token,
    });
  } catch (error) {
    console.error("Error fetching current user:", error);
    res.status(500).json({ message: error.message, token: req.cookies.token });
  }
};

export {
  uploadLicense,
  handleVehicleDecision,
  registerVehicle,
  updateVehicle,
  getUserVehicleInfo,
  getCurrentUser,
};
