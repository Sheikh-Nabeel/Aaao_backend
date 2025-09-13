import Service from "../models/serviceModel.js";
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";
import multer from "multer";
import path from "path";
import fs from "fs";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/services/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

const createService = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const {
    businessCompanyName, tradeLicenseNumber, companyType,
    businessPhoneNumber, alternativePhoneNumber, managerOwnerReceptionName,
    contactPersonMobile, businessAddress, ownerIdentification,
    serviceType, openingTime, closingTime, numberOfStaff,
    listOfServices, serviceArea, agreeToTermsConditions,
    backgroundChecks, digitalOrTypedSignature
  } = req.body;

  // Validate required fields
  if (!userId || !businessCompanyName || !tradeLicenseNumber || !companyType ||
      !businessPhoneNumber || !managerOwnerReceptionName || !contactPersonMobile ||
      !businessAddress || !ownerIdentification || !serviceType || !openingTime ||
      !closingTime || !numberOfStaff || !listOfServices || !serviceArea ||
      agreeToTermsConditions === undefined || backgroundChecks === undefined ||
      !digitalOrTypedSignature) {
    res.status(400);
    throw new Error("All required fields must be provided");
  }

  // Handle file uploads
  const tradeLicenseCopy = req.files?.tradeLicenseCopy?.[0]?.path || '';
  const shopImages = req.files?.shopImages?.map(file => file.path) || [];
  const passportCopy = req.files?.passportCopy?.map(file => file.path) || [];
  const uploadedPriceList = req.files?.uploadedPriceList?.[0]?.path || '';
  const uploadedPortfolio = req.files?.uploadedPortfolio?.[0]?.path || '';

  if (!tradeLicenseCopy) {
    res.status(400);
    throw new Error("Trade license copy is required");
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Update available services
  const existingServices = await Service.find();
  let allAvailableServices = [...new Set(existingServices.map(s => s.serviceType))];
  if (!allAvailableServices.includes(serviceType)) {
    allAvailableServices.push(serviceType);
  }

  const service = await Service.create({
    userId,
    businessCompanyName,
    tradeLicenseNumber,
    tradeLicenseCopy,
    companyType,
    businessPhoneNumber,
    alternativePhoneNumber,
    managerOwnerReceptionName,
    contactPersonMobile,
    businessAddress,
    shopImages,
    ownerIdentification,
    passportCopy,
    serviceType,
    openingTime,
    closingTime,
    numberOfStaff,
    availableServices: allAvailableServices,
    listOfServices,
    serviceArea,
    uploadedPriceList,
    uploadedPortfolio,
    agreeToTermsConditions,
    backgroundChecks,
    digitalOrTypedSignature
  });

  user.services.push(service._id);
  await user.save();

  res.status(201).json({
    message: "Service created successfully",
    serviceId: service._id
  });
});

const getAllServices = asyncHandler(async (req, res) => {
  const userRole = req.user.role;
  
  let query = {};
  
  // If user is admin or superadmin, show all services
  // If user is regular user, show only approved services
  if (userRole === 'admin' || userRole === 'superadmin') {
    // No filter - show all services regardless of status
    query = {};
  } else {
    // Regular users only see approved services
    query = { status: 'approved' };
  }
  
  const services = await Service.find(query)
    .populate('userId', 'username firstName lastName role')
    .sort({ createdAt: -1 }); // Sort by newest first
  
  res.status(200).json({
    message: "All services retrieved successfully",
    services,
    total: services.length,
    userRole: userRole // Include user role in response for debugging
  });
});

const getUserServices = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const services = await Service.find({ userId, status: 'approved' }).populate('userId', 'username firstName lastName role');
  res.status(200).json({
    message: "User services retrieved successfully",
    services,
    total: services.length
  });
});

const deleteService = asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const userId = req.user._id;

  const service = await Service.findOne({ _id: serviceId, userId });
  if (!service) {
    res.status(404);
    throw new Error("Service not found or unauthorized");
  }

  await Service.deleteOne({ _id: serviceId });
  await User.findByIdAndUpdate(userId, { $pull: { services: serviceId } });

  res.status(200).json({
    message: "Service deleted successfully"
  });
});

const getAvailableServices = asyncHandler(async (req, res) => {
  const existingServices = await Service.find({ status: 'approved' });
  const availableServices = [...new Set(existingServices.map(s => s.serviceType))];
  res.status(200).json({
    message: "Available services retrieved successfully",
    availableServices
  });
});

const approveService = asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const service = await Service.findById(serviceId);

  if (!service) {
    res.status(404);
    throw new Error("Service not found");
  }

  service.status = 'approved';
  await service.save();

  res.status(200).json({
    message: "Service approved successfully",
    serviceId
  });
});

const rejectService = asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const { reason } = req.body;

  const service = await Service.findById(serviceId);

  if (!service) {
    res.status(404);
    throw new Error("Service not found");
  }

  service.status = 'rejected';
  service.rejectionReason = reason || 'No reason provided';
  await service.save();

  res.status(200).json({
    message: "Service rejected successfully",
    serviceId
  });
});

// Get pending services (admin/superadmin only)
const getPendingServices = asyncHandler(async (req, res) => {
  const userRole = req.user.role;
  
  // Only admin and superadmin can access pending services
  if (userRole !== 'admin' && userRole !== 'superadmin') {
    res.status(403);
    throw new Error('Access denied. Admin privileges required.');
  }

  const pendingServices = await Service.find({ status: 'pending' })
    .populate('userId', 'firstName lastName email phone')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: pendingServices.length,
    services: pendingServices,
    userRole: userRole
  });
});

export {
  createService,
  getAllServices,
  getUserServices,
  deleteService,
  getAvailableServices,
  approveService,
  rejectService,
  getPendingServices
};