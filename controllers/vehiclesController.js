import Vehicle from "../models/vehicleModel.js";
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import path from "path";

import { VALID_SERVICE_TYPES, SERVICE_CATEGORY_MAP, SELECT_FLOW } from "../utils/vehicleOptions.js";

const uploadToLocal = (file) => (file ? path.join("uploads", file.filename).replace(/\\/g, "/") : null);

const validateServiceCombo = ({ serviceType, serviceCategory, vehicleType }) => {
  if (!serviceType || !Object.keys(VALID_SERVICE_TYPES).includes(serviceType)) return false;
  if (vehicleType && !VALID_SERVICE_TYPES[serviceType]?.includes(vehicleType)) return false;
  if (serviceCategory && SERVICE_CATEGORY_MAP[serviceType]) {
    const categoryKey = serviceCategory.toLowerCase();
    const mapKeys = Object.keys(SERVICE_CATEGORY_MAP[serviceType]);
    const foundKey = mapKeys.find((k) => k.toLowerCase() === categoryKey);
    const allowed = foundKey ? SERVICE_CATEGORY_MAP[serviceType][foundKey] : null;
    if (allowed && vehicleType && !allowed.includes(vehicleType)) return false;
  }
  return true;
};

// GET: public select flow for frontend
const getSelectFlow = asyncHandler(async (req, res) => {
  res.status(200).json({ message: "Vehicle select flow", flow: SELECT_FLOW });
});

// POST: register vehicle (multipart)
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
    return res.status(403).json({ message: "Complete and get approved for KYC Level 1 first", token: req.cookies.token });
  }
  if (user.kycLevel >= 2) {
    return res.status(403).json({ message: "KYC Level 2 already completed or pending approval", token: req.cookies.token });
  }
  if (user.hasVehicle !== "yes") {
    return res.status(400).json({ message: "Vehicle ownership must be set to 'yes' to register a vehicle", token: req.cookies.token });
  }

  if (!validateServiceCombo({ serviceType, serviceCategory, vehicleType })) {
    return res.status(400).json({ message: "Invalid service/category/type combination", token: req.cookies.token });
  }

  const vehicleRegistrationCardFront = req.files?.vehicleRegistrationCardFront ? uploadToLocal(req.files.vehicleRegistrationCardFront[0]) : null;
  const vehicleRegistrationCardBack = req.files?.vehicleRegistrationCardBack ? uploadToLocal(req.files.vehicleRegistrationCardBack[0]) : null;
  const roadAuthorityCertificateUrl = req.files?.roadAuthorityCertificate ? uploadToLocal(req.files.roadAuthorityCertificate[0]) : null;
  const insuranceCertificateUrl = req.files?.insuranceCertificate ? uploadToLocal(req.files.insuranceCertificate[0]) : null;
  const vehicleImagesUrls = req.files?.vehicleImages ? req.files.vehicleImages.map((f) => uploadToLocal(f)) : [];

  const vehicle = new Vehicle({
    userId,
    vehicleRegistrationCard: { front: vehicleRegistrationCardFront, back: vehicleRegistrationCardBack },
    roadAuthorityCertificate: roadAuthorityCertificateUrl,
    insuranceCertificate: insuranceCertificateUrl,
    vehicleImages: vehicleImagesUrls,
    vehicleOwnerName: vehicleOwnerName || null,
    companyName: companyName || null,
    vehiclePlateNumber: vehiclePlateNumber || null,
    vehicleMakeModel: vehicleMakeModel || null,
    chassisNumber: chassisNumber || null,
    vehicleColor: vehicleColor || null,
    registrationExpiryDate: registrationExpiryDate ? new Date(registrationExpiryDate) : null,
    vehicleType: vehicleType || null,
    serviceType: serviceType || null,
    serviceCategory: serviceCategory || null,
    wheelchair: wheelchair !== undefined ? Boolean(wheelchair) : false,
    packingHelper: packingHelper !== undefined ? Boolean(packingHelper) : false,
    loadingUnloadingHelper: loadingUnloadingHelper !== undefined ? Boolean(loadingUnloadingHelper) : false,
    fixingHelper: fixingHelper !== undefined ? Boolean(fixingHelper) : false,
  });
  await vehicle.save();

  user.pendingVehicleData = vehicle._id;
  user.kycStatus = "pending";
  await user.save();

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(201).json({
    message: "Vehicle registration submitted and pending admin approval",
    vehicleId: vehicle._id,
    token,
  });
});

// POST: update vehicle (multipart)
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
    return res.status(404).json({ message: "Vehicle not found or you do not have permission to update it", token: req.cookies.token });
  }

  const effectiveType = serviceType || vehicle.serviceType;
  const effectiveVehicleType = vehicleType || vehicle.vehicleType;
  const effectiveCategory = serviceCategory || vehicle.serviceCategory;
  if (!validateServiceCombo({ serviceType: effectiveType, serviceCategory: effectiveCategory, vehicleType: effectiveVehicleType })) {
    return res.status(400).json({ message: "Invalid service/category/type combination", token: req.cookies.token });
  }

  const uploadToLocal = (file) => (file ? path.join("uploads", file.filename).replace(/\\/g, "/") : null);

  vehicle.vehicleOwnerName = vehicleOwnerName || vehicle.vehicleOwnerName;
  vehicle.companyName = companyName || vehicle.companyName;
  vehicle.vehiclePlateNumber = vehiclePlateNumber || vehicle.vehiclePlateNumber;
  vehicle.vehicleMakeModel = vehicleMakeModel || vehicle.vehicleMakeModel;
  vehicle.chassisNumber = chassisNumber || vehicle.chassisNumber;
  vehicle.vehicleColor = vehicleColor || vehicle.vehicleColor;
  vehicle.registrationExpiryDate = registrationExpiryDate ? new Date(registrationExpiryDate) : vehicle.registrationExpiryDate;
  vehicle.vehicleType = vehicleType || vehicle.vehicleType;
  vehicle.serviceType = serviceType || vehicle.serviceType;
  vehicle.serviceCategory = serviceCategory || vehicle.serviceCategory;
  vehicle.wheelchair = wheelchair !== undefined ? Boolean(wheelchair) : vehicle.wheelchair;
  vehicle.packingHelper = packingHelper !== undefined ? Boolean(packingHelper) : vehicle.packingHelper;
  vehicle.loadingUnloadingHelper = loadingUnloadingHelper !== undefined ? Boolean(loadingUnloadingHelper) : vehicle.loadingUnloadingHelper;
  vehicle.fixingHelper = fixingHelper !== undefined ? Boolean(fixingHelper) : vehicle.fixingHelper;
  vehicle.vehicleRegistrationCard.front = req.files?.vehicleRegistrationCardFront ? uploadToLocal(req.files.vehicleRegistrationCardFront[0]) : vehicle.vehicleRegistrationCard.front;
  vehicle.vehicleRegistrationCard.back = req.files?.vehicleRegistrationCardBack ? uploadToLocal(req.files.vehicleRegistrationCardBack[0]) : vehicle.vehicleRegistrationCard.back;
  vehicle.roadAuthorityCertificate = req.files?.roadAuthorityCertificate ? uploadToLocal(req.files.roadAuthorityCertificate[0]) : vehicle.roadAuthorityCertificate;
  vehicle.insuranceCertificate = req.files?.insuranceCertificate ? uploadToLocal(req.files.insuranceCertificate[0]) : vehicle.insuranceCertificate;
  vehicle.vehicleImages = req.files?.vehicleImages ? req.files.vehicleImages.map((f) => uploadToLocal(f)) : vehicle.vehicleImages;

  await vehicle.save();

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({ message: "Vehicle updated successfully", vehicleId: vehicle._id, token });
});

// GET: current user's vehicle
const getUserVehicle = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  // First, try to find vehicle in the Vehicle collection (regular registration)
  let vehicle = await Vehicle.findOne({ userId });
  
  // If no vehicle found, check if user has a vehicle in pendingVehicleData (KYC level 2 registration)
  if (!vehicle) {
    const user = await User.findById(userId).populate('pendingVehicleData');
    if (user && user.pendingVehicleData) {
      vehicle = user.pendingVehicleData;
    }
  }
  
  res.status(200).json({ vehicle });
});

// LIST: vehicles for riding discovery
const listVehicles = asyncHandler(async (req, res) => {
  const { serviceType, serviceCategory, vehicleType, status, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (serviceType) filter.serviceType = serviceType;
  if (serviceCategory) filter.serviceCategory = serviceCategory;
  if (vehicleType) filter.vehicleType = vehicleType;
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Vehicle.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Vehicle.countDocuments(filter),
  ]);
  res.status(200).json({ items, total, page: Number(page), limit: Number(limit) });
});

// exports consolidated at bottom
// ADMIN: list pending/rejected vehicles
const adminListVehicles = asyncHandler(async (req, res) => {
  const { status = "pending", serviceType, serviceCategory, vehicleType, page = 1, limit = 20 } = req.query;
  const filter = { status };
  if (serviceType) filter.serviceType = serviceType;
  if (serviceCategory) filter.serviceCategory = serviceCategory;
  if (vehicleType) filter.vehicleType = vehicleType;
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Vehicle.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate("userId", "username email"),
    Vehicle.countDocuments(filter),
  ]);
  res.status(200).json({ items, total, page: Number(page), limit: Number(limit) });
});

// ADMIN: approve or reject vehicle
const adminReviewVehicle = asyncHandler(async (req, res) => {
  const { vehicleId, action, reason } = req.body;
  if (!vehicleId || !["approve", "reject"].includes(action)) {
    return res.status(400).json({ message: "vehicleId and valid action (approve|reject) are required" });
  }
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    return res.status(404).json({ message: "Vehicle not found" });
  }
  if (action === "approve") {
    vehicle.status = "approved";
    vehicle.rejectionReason = undefined;
    vehicle.approvedAt = new Date();
  } else {
    vehicle.status = "rejected";
    vehicle.rejectionReason = reason || "";
    vehicle.approvedAt = undefined;
  }
  vehicle.reviewedBy = req.user?._id || null;
  vehicle.reviewedAt = new Date();
  await vehicle.save();
  res.status(200).json({ message: `Vehicle ${action}d successfully`, vehicleId: vehicle._id, status: vehicle.status });
});

// admin list/review exports are consolidated at the bottom
// ADMIN: update vehicle (fields/files) and optionally approve/reject in one call
const adminUpdateVehicle = asyncHandler(async (req, res) => {
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
    action, // optional: "approve" | "reject"
    reason, // optional when reject
  } = req.body;

  if (!vehicleId) {
    return res.status(400).json({ message: "vehicleId is required" });
  }

  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    return res.status(404).json({ message: "Vehicle not found" });
  }

  // Validate service combo if any fields provided
  const effectiveType = serviceType || vehicle.serviceType;
  const effectiveVehicleType = vehicleType || vehicle.vehicleType;
  const effectiveCategory = serviceCategory || vehicle.serviceCategory;
  const comboOk = validateServiceCombo({
    serviceType: effectiveType,
    serviceCategory: effectiveCategory,
    vehicleType: effectiveVehicleType,
  });
  if (!comboOk) {
    return res.status(400).json({ message: "Invalid service/category/type combination" });
  }

  const toLocal = (file) => (file ? path.join("uploads", file.filename).replace(/\\/g, "/") : null);

  // Apply field updates if present
  if (vehicleOwnerName) vehicle.vehicleOwnerName = vehicleOwnerName;
  if (companyName) vehicle.companyName = companyName;
  if (vehiclePlateNumber) vehicle.vehiclePlateNumber = vehiclePlateNumber;
  if (vehicleMakeModel) vehicle.vehicleMakeModel = vehicleMakeModel;
  if (chassisNumber) vehicle.chassisNumber = chassisNumber;
  if (vehicleColor) vehicle.vehicleColor = vehicleColor;
  if (registrationExpiryDate) vehicle.registrationExpiryDate = new Date(registrationExpiryDate);
  if (vehicleType) vehicle.vehicleType = vehicleType;
  if (serviceType) vehicle.serviceType = serviceType;
  if (serviceCategory) vehicle.serviceCategory = serviceCategory;
  if (wheelchair !== undefined) vehicle.wheelchair = Boolean(wheelchair);
  if (packingHelper !== undefined) vehicle.packingHelper = Boolean(packingHelper);
  if (loadingUnloadingHelper !== undefined) vehicle.loadingUnloadingHelper = Boolean(loadingUnloadingHelper);
  if (fixingHelper !== undefined) vehicle.fixingHelper = Boolean(fixingHelper);

  // Files (optional)
  if (req.files?.vehicleRegistrationCardFront) {
    vehicle.vehicleRegistrationCard.front = toLocal(req.files.vehicleRegistrationCardFront[0]);
  }
  if (req.files?.vehicleRegistrationCardBack) {
    vehicle.vehicleRegistrationCard.back = toLocal(req.files.vehicleRegistrationCardBack[0]);
  }
  if (req.files?.roadAuthorityCertificate) {
    vehicle.roadAuthorityCertificate = toLocal(req.files.roadAuthorityCertificate[0]);
  }
  if (req.files?.insuranceCertificate) {
    vehicle.insuranceCertificate = toLocal(req.files.insuranceCertificate[0]);
  }
  if (req.files?.vehicleImages) {
    vehicle.vehicleImages = req.files.vehicleImages.map((f) => toLocal(f));
  }

  // Optional moderation action
  if (action === "approve") {
    vehicle.status = "approved";
    vehicle.rejectionReason = undefined;
    vehicle.approvedAt = new Date();
  } else if (action === "reject") {
    vehicle.status = "rejected";
    vehicle.rejectionReason = reason || "";
    vehicle.approvedAt = undefined;
  }
  vehicle.reviewedBy = req.user?._id || null;
  vehicle.reviewedAt = new Date();

  await vehicle.save();
  res.status(200).json({ message: "Vehicle updated successfully", vehicleId: vehicle._id, status: vehicle.status });
});

export { getSelectFlow, registerVehicle, updateVehicle, getUserVehicle, listVehicles, adminListVehicles, adminReviewVehicle, adminUpdateVehicle };


