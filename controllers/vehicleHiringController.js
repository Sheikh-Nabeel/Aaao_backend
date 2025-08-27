import {
  VehicleRegistration,
  DriverHiring,
} from "../models/vehicleHiringModel.js";
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import path from "path";
import nodemailer from "nodemailer";

// Nodemailer configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "chyousafawais667@gmail.com",
    pass: "mfhequkvepgtwusf",
  },
});

transporter.verify((error) => {
  if (error) {
    console.error("Nodemailer verification failed:", error.message);
  } else {
    console.log("Nodemailer is ready to send emails");
  }
});

// Embedded email template function for AAAO GO
const generateEmailTemplate = ({
  subject,
  greeting,
  message,
  ctaText,
  ctaUrl,
}) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #013220 0%, #0a4a2a 100%); padding: 20px; text-align: center; }
        .header img { max-width: 150px; }
        .content { padding: 20px; color: #333333; }
        .content h2 { color: #013220; }
        .content p { font-size: 16px; line-height: 1.5; }
        .cta-button { display: inline-block; padding: 12px 24px; background-color: #FFD700; color: #013220; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background-color: #013220; color: #FFD700; text-align: center; padding: 10px; font-size: 14px; }
        @media (max-width: 600px) {
          .container { margin: 10px; }
          .header img { max-width: 120px; }
          .content { padding: 15px; }
          .cta-button { padding: 10px 20px; font-size: 14px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="https://via.placeholder.com/150x50?text=AAAO+GO+Logo" alt="AAAO GO Logo" />
        </div>
        <div class="content">
          <h2>${greeting}</h2>
          <p>${message}</p>
          ${
            ctaUrl
              ? `<a href="${ctaUrl}" class="cta-button">${ctaText}</a>`
              : ""
          }
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} AAAO GO. All rights reserved.</p>
          <p>Questions? Contact us at <a href="mailto:support@aaaogo.com" style="color: #FFD700;">support@aaaogo.com</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const uploadToLocal = (file) =>
  file ? path.join("Uploads", file.filename).replace(/\\/g, "/") : null;

// API 1: Register Vehicle
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
    serviceType,
    serviceCategory,
    vehicleType,
    wheelchair,
    packingHelper,
    loadingUnloadingHelper,
    fixingHelper,
  } = req.body;

  const user = await User.findById(userId);
  if (!user || user.kycLevel < 1) {
    return res
      .status(403)
      .json({
        message: "Complete and get approved for KYC Level 1 first",
        token: req.cookies.token,
      });
  }
  if (user.hasVehicle !== "yes") {
    return res
      .status(400)
      .json({
        message: "Vehicle ownership must be set to 'yes' to register a vehicle",
        token: req.cookies.token,
      });
  }

  const vehicleRegistrationCardFront = req.files?.vehicleRegistrationCardFront
    ? uploadToLocal(req.files.vehicleRegistrationCardFront[0])
    : null;
  const vehicleRegistrationCardBack = req.files?.vehicleRegistrationCardBack
    ? uploadToLocal(req.files.vehicleRegistrationCardBack[0])
    : null;
  const roadAuthorityCertificateUrl = req.files?.roadAuthorityCertificate
    ? uploadToLocal(req.files.roadAuthorityCertificate[0])
    : null;
  const insuranceCertificateUrl = req.files?.insuranceCertificate
    ? uploadToLocal(req.files.insuranceCertificate[0])
    : null;
  const vehicleImagesUrls = req.files?.vehicleImages
    ? req.files.vehicleImages.map((f) => uploadToLocal(f))
    : [];

  if (
    !vehicleRegistrationCardFront ||
    !vehicleRegistrationCardBack ||
    !roadAuthorityCertificateUrl ||
    !insuranceCertificateUrl ||
    vehicleImagesUrls.length === 0
  ) {
    return res
      .status(400)
      .json({
        message:
          "All required documents and at least one vehicle image must be uploaded",
        token: req.cookies.token,
      });
  }

  const vehicle = new VehicleRegistration({
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
    serviceType: serviceType || null,
    serviceCategory: serviceCategory || null,
    vehicleType: vehicleType || null,
    wheelchair: wheelchair !== undefined ? Boolean(wheelchair) : false,
    packingHelper: packingHelper !== undefined ? Boolean(packingHelper) : false,
    loadingUnloadingHelper:
      loadingUnloadingHelper !== undefined
        ? Boolean(loadingUnloadingHelper)
        : false,
    fixingHelper: fixingHelper !== undefined ? Boolean(fixingHelper) : false,
  });
  await vehicle.save();

  user.pendingVehicleData = vehicle._id;
  await user.save();

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });

  res.status(201).json({
    message: "Vehicle registered successfully",
    vehicleId: vehicle._id,
    token,
  });
});

// API 2: Set Driver Decision
const setDriverDecision = asyncHandler(async (req, res) => {
  const { userId, hasDriver } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return res
      .status(404)
      .json({ message: "User not found", token: req.cookies.token });
  }

  user.hasDriver = hasDriver === "yes" ? "yes" : "no";
  await user.save();

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });

  if (hasDriver === "no") {
    res.status(200).json({
      message: "Redirect to driver hiring form",
      token,
    });
  } else {
    res.status(200).json({
      message: "Driver decision set to yes, vehicle registration complete",
      token,
    });
  }
});

// API 3: Submit Driver Hiring
const submitDriverHiring = asyncHandler(async (req, res) => {
  const {
    userId,
    vehicleId,
    vehicleOwnerName,
    companyName,
    companyEmirate,
    vehicleType,
    vehiclePlateNumber,
    vehicleMakeModel,
    engagementType,
    salaryOffered,
    driverCanOfferCounterRent,
    agreementDuration,
    customDurationAmount,
    maintenanceResponsibilities,
    workSchedule,
    shiftTimingOrDutyHours,
    preferredStartDate,
    informationConfirmed,
    autoGeneratedAgreement,
    mutualApproval,
    termsAgreed,
    digitalSignature,
  } = req.body;

  if (
    !vehicleOwnerName ||
    !vehiclePlateNumber ||
    !engagementType ||
    !agreementDuration ||
    !workSchedule ||
    !shiftTimingOrDutyHours ||
    !preferredStartDate ||
    !digitalSignature
  ) {
    return res
      .status(400)
      .json({
        message: "All required fields must be provided",
        token: req.cookies.token,
      });
  }

  const user = await User.findById(userId);
  if (!user || user.hasDriver !== "no") {
    return res
      .status(403)
      .json({
        message: "User must select 'no' for driver to submit hiring request",
        token: req.cookies.token,
      });
  }

  const vehicle = await VehicleRegistration.findById(vehicleId);
  if (!vehicle || vehicle.userId.toString() !== userId) {
    return res
      .status(403)
      .json({
        message: "Invalid or unauthorized vehicle ID",
        token: req.cookies.token,
      });
  }

  const vehicleImagesUrls = req.files?.vehicleImages
    ? req.files.vehicleImages.map((f) => uploadToLocal(f))
    : [];
  const registrationCardFront = req.files?.registrationCardFront
    ? uploadToLocal(req.files.registrationCardFront[0])
    : null;
  const registrationCardBack = req.files?.registrationCardBack
    ? uploadToLocal(req.files.registrationCardBack[0])
    : null;

  if (
    !registrationCardFront ||
    !registrationCardBack ||
    vehicleImagesUrls.length === 0
  ) {
    return res
      .status(400)
      .json({
        message:
          "All required documents and at least one vehicle image must be uploaded",
        token: req.cookies.token,
      });
  }

  const driverHiring = new DriverHiring({
    userId,
    vehicleId,
    vehicleOwnerName,
    companyName: companyName || null,
    companyEmirate: companyEmirate || null,
    vehicleType: vehicleType || null,
    vehiclePlateNumber,
    vehicleMakeModel: vehicleMakeModel || null,
    registrationCard: {
      front: registrationCardFront,
      back: registrationCardBack,
    },
    vehicleImages: vehicleImagesUrls,
    engagementType,
    salaryOffered:
      engagementType === "Salary Based" ? Number(salaryOffered) : null,
    driverCanOfferCounterRent: Boolean(driverCanOfferCounterRent),
    agreementDuration,
    customDurationAmount:
      agreementDuration === "Custom" ? Number(customDurationAmount) : null,
    maintenanceResponsibilities: {
      minor: {
        dailyFuel: {
          owner: maintenanceResponsibilities?.minor?.dailyFuel?.owner || false,
          driver: maintenanceResponsibilities?.minor?.dailyFuel?.driver || false,
        },
        carWash: {
          owner: maintenanceResponsibilities?.minor?.carWash?.owner || false,
          driver: maintenanceResponsibilities?.minor?.carWash?.driver || false,
        },
        oilChange: {
          owner: maintenanceResponsibilities?.minor?.oilChange?.owner || false,
          driver: maintenanceResponsibilities?.minor?.oilChange?.driver || false,
        },
        tyrePressureCheck: {
          owner:
            maintenanceResponsibilities?.minor?.tyrePressureCheck?.owner ||
            false,
          driver:
            maintenanceResponsibilities?.minor?.tyrePressureCheck?.driver ||
            false,
        },
      },
      major: {
        engineRepairs: {
          owner:
            maintenanceResponsibilities?.major?.engineRepairs?.owner || false,
          driver:
            maintenanceResponsibilities?.major?.engineRepairs?.driver || false,
        },
        transmissionSystem: {
          owner:
            maintenanceResponsibilities?.major?.transmissionSystem?.owner ||
            false,
          driver:
            maintenanceResponsibilities?.major?.transmissionSystem?.driver ||
            false,
        },
        acSystem: {
          owner: maintenanceResponsibilities?.major?.acSystem?.owner || false,
          driver: maintenanceResponsibilities?.major?.acSystem?.driver || false,
        },
      },
      custom: maintenanceResponsibilities?.custom || [],
    },
    workSchedule,
    shiftTimingOrDutyHours,
    preferredStartDate: new Date(preferredStartDate),
    informationConfirmed: Boolean(informationConfirmed),
    autoGeneratedAgreement: Boolean(autoGeneratedAgreement),
    mutualApproval: Boolean(mutualApproval),
    termsAgreed: Boolean(termsAgreed),
    digitalSignature,
    approvalStatus: "pending",
    adminComments: null,
  });

  await driverHiring.save();

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });

  res.status(201).json({
    message:
      "Driver hiring request submitted successfully and is pending admin approval",
    driverHiringId: driverHiring._id,
    token,
  });
});

// API 4: Get Vehicle and Driver Hiring Data
const getVehicleAndDriverHiring = asyncHandler(async (req, res) => {
  const { userId } = req.query;

  const user = await User.findById(userId)
    .populate(
      "assignedVehicles",
      "vehiclePlateNumber vehicleMakeModel vehicleType"
    )
    .lean();
  if (!user) {
    return res
      .status(404)
      .json({ message: "User not found", token: req.cookies.token });
  }

  const vehicles = await VehicleRegistration.find({ userId })
    .select("-__v")
    .lean();

  const driverHirings = await DriverHiring.find({
    userId,
    approvalStatus: "approved",
  })
    .select("-__v")
    .lean();

  const response = {
    message: "Vehicle and driver hiring data retrieved successfully",
    vehicles,
    driverHirings,
    assignedVehicles: user.assignedVehicles || [],
    token: req.cookies.token,
  };

  res.status(200).json(response);
});

// API 5: Delete Vehicle
const deleteVehicle = asyncHandler(async (req, res) => {
  const { userId, vehicleId } = req.params;

  const user = await User.findById(userId);
  if (!user) {
    return res
      .status(404)
      .json({ message: "User not found", token: req.cookies.token });
  }

  const vehicle = await VehicleRegistration.findById(vehicleId);
  if (!vehicle || vehicle.userId.toString() !== userId) {
    return res
      .status(403)
      .json({
        message: "Invalid or unauthorized vehicle ID",
        token: req.cookies.token,
      });
  }

  const driverHiring = await DriverHiring.findOne({ vehicleId });
  if (driverHiring) {
    return res
      .status(400)
      .json({
        message:
          "Cannot delete vehicle as it is referenced in a driver hiring post",
        token: req.cookies.token,
      });
  }

  await VehicleRegistration.deleteOne({ _id: vehicleId });

  if (
    user.pendingVehicleData &&
    user.pendingVehicleData.toString() === vehicleId
  ) {
    user.pendingVehicleData = null;
    await user.save();
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });

  res.status(200).json({
    message: "Vehicle registration deleted successfully",
    token,
  });
});

// API 6: Delete Driver Hiring
const deleteDriverHiring = asyncHandler(async (req, res) => {
  const { userId, driverHiringId } = req.params;

  const user = await User.findById(userId);
  if (!user) {
    return res
      .status(404)
      .json({ message: "User not found", token: req.cookies.token });
  }

  const driverHiring = await DriverHiring.findById(driverHiringId);
  if (!driverHiring || driverHiring.userId.toString() !== userId) {
    return res
      .status(403)
      .json({
        message: "Invalid or unauthorized driver hiring ID",
        token: req.cookies.token,
      });
  }

  await DriverHiring.deleteOne({ _id: driverHiringId });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });

  res.status(200).json({
    message: "Driver hiring post deleted successfully",
    token,
  });
});

// API 7: Get Pending Driver Hirings
const getPendingDriverHirings = asyncHandler(async (req, res) => {
  if (!req.user || !["admin", "superadmin"].includes(req.user.role)) {
    return res
      .status(403)
      .json({
        message: "Unauthorized: Admin or superadmin access required",
        token: req.cookies.token,
      });
  }

  const pendingHirings = await DriverHiring.find({ approvalStatus: "pending" })
    .populate("userId", "username firstName lastName email phoneNumber")
    .populate("vehicleId", "vehiclePlateNumber vehicleMakeModel vehicleType")
    .select("-__v")
    .lean();

  const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });

  res.status(200).json({
    message: "Pending driver hiring submissions retrieved successfully",
    pendingHirings,
    totalPending: pendingHirings.length,
    token,
  });
});

// API 8: Accept Driver Hiring
const acceptDriverHiring = asyncHandler(async (req, res) => {
  const { driverHiringId } = req.params;

  if (!driverHiringId) {
    return res
      .status(400)
      .json({
        message: "Driver hiring ID is required",
        token: req.cookies.token,
      });
  }

  const driverHiring = await DriverHiring.findById(driverHiringId).populate(
    "userId"
  );
  if (!driverHiring) {
    return res
      .status(404)
      .json({
        message: "Driver hiring post not found",
        token: req.cookies.token,
      });
  }

  if (driverHiring.approvalStatus !== "pending") {
    return res
      .status(400)
      .json({
        message: "No pending driver hiring submission",
        token: req.cookies.token,
      });
  }

  if (
    driverHiring.driverApplications.length > 0 &&
    !driverHiring.selectedDriverId
  ) {
    return res
      .status(400)
      .json({
        message: "No driver application has been accepted for this hiring post",
        token: req.cookies.token,
      });
  }

  driverHiring.approvalStatus = "approved";
  driverHiring.adminComments = null;
  await driverHiring.save();

  const user = driverHiring.userId;
  try {
    await transporter.sendMail({
      from: `"AAAO GO" <chyousafawais667@gmail.com>`,
      to: user.email,
      subject: "Driver Hiring Submission Approved",
      html: generateEmailTemplate({
        subject: "Driver Hiring Submission Approved",
        greeting: `Hello ${user.firstName}${
          user.lastName ? " " + user.lastName : ""
        },`,
        message: `Your driver hiring submission for vehicle plate ${driverHiring.vehiclePlateNumber} has been approved. You can now proceed with driver hiring in the AAAO GO application.`,
        ctaText: "View Driver Hiring",
        ctaUrl: `${process.env.APP_URL}/driver-hiring`,
      }),
    });
    console.log(`Driver hiring approval email sent to ${user.email}`);
  } catch (error) {
    console.error(
      `Failed to send driver hiring approval email to ${user.email}:`,
      error.message
    );
    return res
      .status(500)
      .json({
        message: "Failed to send approval email",
        token: req.cookies.token,
      });
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });

  res.status(200).json({
    message: "Driver hiring submission approved successfully",
    driverHiringId,
    approvalStatus: driverHiring.approvalStatus,
    token,
  });
});

// API 9: Reject Driver Hiring
const rejectDriverHiring = asyncHandler(async (req, res) => {
  const { driverHiringId } = req.params;
  const { reason } = req.body;

  if (!driverHiringId) {
    return res
      .status(400)
      .json({
        message: "Driver hiring ID is required",
        token: req.cookies.token,
      });
  }

  const driverHiring = await DriverHiring.findById(driverHiringId).populate(
    "userId"
  );
  if (!driverHiring) {
    return res
      .status(404)
      .json({
        message: "Driver hiring post not found",
        token: req.cookies.token,
      });
  }

  if (driverHiring.approvalStatus !== "pending") {
    return res
      .status(400)
      .json({
        message: "No pending driver hiring submission",
        token: req.cookies.token,
      });
  }

  driverHiring.approvalStatus = "rejected";
  driverHiring.adminComments = reason || "No reason provided";
  await driverHiring.save();

  const user = driverHiring.userId;
  try {
    await transporter.sendMail({
      from: `"AAAO GO" <chyousafawais667@gmail.com>`,
      to: user.email,
      subject: "Driver Hiring Submission Rejected",
      html: generateEmailTemplate({
        subject: "Driver Hiring Submission Rejected",
        greeting: `Hello ${user.firstName}${
          user.lastName ? " " + user.lastName : ""
        },`,
        message: `Your driver hiring submission for vehicle plate ${
          driverHiring.vehiclePlateNumber
        } has been rejected. <strong>Reason:</strong> ${
          reason || "No reason provided"
        }. Please resubmit with corrected information.`,
        ctaText: "Resubmit Driver Hiring",
        ctaUrl: `${process.env.APP_URL}/submit-driver-hiring`,
      }),
    });
    console.log(`Driver hiring rejection email sent to ${user.email}`);
  } catch (error) {
    console.error(
      `Failed to send driver hiring rejection email to ${user.email}:`,
      error.message
    );
    return res
      .status(500)
      .json({
        message: "Failed to send rejection email",
        token: req.cookies.token,
      });
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });

  res.status(200).json({
    message: "Driver hiring submission rejected",
    driverHiringId,
    reason: reason || "No reason provided",
    token,
  });
});

// API 10: Apply for Driver Hiring
const applyForDriverHiring = asyncHandler(async (req, res) => {
  const { driverHiringId, proposal } = req.body;
  const driverId = req.user._id;

  if (!driverHiringId || !proposal) {
    return res
      .status(400)
      .json({
        message: "Driver hiring ID and proposal are required",
        token: req.cookies.token,
      });
  }

  const driver = await User.findById(driverId);
  if (
    !driver ||
    driver.kycLevel < 2 ||
    driver.kycStatus !== "approved" ||
    driver.hasVehicle !== "no" ||
    driver.role !== "driver"
  ) {
    return res
      .status(403)
      .json({
        message: "Only KYC Level 2 approved drivers without vehicles can apply",
        token: req.cookies.token,
      });
  }

  const driverHiring = await DriverHiring.findById(driverHiringId);
  if (!driverHiring) {
    return res
      .status(404)
      .json({
        message: "Driver hiring post not found",
        token: req.cookies.token,
      });
  }

  if (driverHiring.approvalStatus !== "approved") {
    return res
      .status(400)
      .json({
        message: "Driver hiring post must be approved by admin",
        token: req.cookies.token,
      });
  }

  const existingApplication = driverHiring.driverApplications.find(
    (app) => app.driverId.toString() === driverId.toString()
  );
  if (existingApplication) {
    return res
      .status(400)
      .json({
        message: "You have already applied for this driver hiring post",
        token: req.cookies.token,
      });
  }

  driverHiring.driverApplications.push({
    driverId,
    proposal,
    applicationStatus: "pending",
    appliedAt: new Date(),
  });
  await driverHiring.save();

  const token = jwt.sign({ id: driver._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });

  res.status(201).json({
    message: "Application submitted successfully",
    driverHiringId,
    driverId,
    token,
  });
});

// API 11: Get Driver Applications for a Hiring Post
const getDriverApplications = asyncHandler(async (req, res) => {
  const { driverHiringId } = req.params;
  const userId = req.user._id;

  const driverHiring = await DriverHiring.findById(driverHiringId)
    .populate(
      "driverApplications.driverId",
      "username firstName lastName email phoneNumber licenseImage"
    )
    .lean();

  if (!driverHiring) {
    return res
      .status(404)
      .json({
        message: "Driver hiring post not found",
        token: req.cookies.token,
      });
  }

  if (driverHiring.userId.toString() !== userId.toString()) {
    return res
      .status(403)
      .json({
        message: "Unauthorized: Only the vehicle owner can view applications",
        token: req.cookies.token,
      });
  }

  const applications = driverHiring.driverApplications.map((app) => ({
    driverId: app.driverId._id,
    username: app.driverId.username,
    name: `${app.driverId.firstName}${
      app.driverId.lastName ? " " + app.driverId.lastName : ""
    }`,
    email: app.driverId.email,
    phoneNumber: app.driverId.phoneNumber,
    licenseImage: app.driverId.licenseImage,
    proposal: app.proposal,
    applicationStatus: app.applicationStatus,
    appliedAt: app.appliedAt,
  }));

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });

  res.status(200).json({
    message: "Driver applications retrieved successfully",
    driverHiringId,
    applications,
    totalApplications: applications.length,
    token,
  });
});

// API 12: Accept Driver Application
const acceptDriverApplication = asyncHandler(async (req, res) => {
  const { driverHiringId, driverId } = req.params;
  const userId = req.user._id;

  if (!driverHiringId || !driverId) {
    return res
      .status(400)
      .json({
        message: "Driver hiring ID and driver ID are required",
        token: req.cookies.token,
      });
  }

  const driverHiring = await DriverHiring.findById(driverHiringId).populate(
    "userId"
  );
  if (!driverHiring) {
    return res
      .status(404)
      .json({
        message: "Driver hiring post not found",
        token: req.cookies.token,
      });
  }

  if (driverHiring.userId._id.toString() !== userId.toString()) {
    return res
      .status(403)
      .json({
        message: "Unauthorized: Only the vehicle owner can accept applications",
        token: req.cookies.token,
      });
  }

  if (driverHiring.selectedDriverId) {
    return res
      .status(400)
      .json({
        message: "A driver has already been selected for this hiring post",
        token: req.cookies.token,
      });
  }

  const application = driverHiring.driverApplications.find(
    (app) =>
      app.driverId.toString() === driverId.toString() &&
      app.applicationStatus === "pending"
  );
  if (!application) {
    return res
      .status(404)
      .json({
        message: "Pending application not found for this driver",
        token: req.cookies.token,
      });
  }

  const driver = await User.findById(driverId);
  if (!driver) {
    return res
      .status(404)
      .json({ message: "Driver not found", token: req.cookies.token });
  }

  application.applicationStatus = "accepted";
  driverHiring.driverApplications.forEach((app) => {
    if (
      app.driverId.toString() !== driverId.toString() &&
      app.applicationStatus === "pending"
    ) {
      app.applicationStatus = "rejected";
    }
  });
  driverHiring.selectedDriverId = driverId;
  await driverHiring.save();

  if (!driver.assignedVehicles) {
    driver.assignedVehicles = [];
  }
  if (!driver.assignedVehicles.includes(driverHiring.vehicleId)) {
    driver.assignedVehicles.push(driverHiring.vehicleId);
    await driver.save();
  }

  try {
    await transporter.sendMail({
      from: `"AAAO GO" <chyousafawais667@gmail.com>`,
      to: driver.email,
      subject: "Driver Application Accepted",
      html: generateEmailTemplate({
        subject: "Driver Application Accepted",
        greeting: `Hello ${driver.firstName}${
          driver.lastName ? " " + driver.lastName : ""
        },`,
        message: `Your application for the driver hiring post (vehicle plate ${driverHiring.vehiclePlateNumber}) has been accepted by the vehicle owner. The vehicle has been assigned to your profile, pending admin approval.`,
        ctaText: "View Your Profile",
        ctaUrl: `${process.env.APP_URL}/profile`,
      }),
    });
    console.log(`Driver application acceptance email sent to ${driver.email}`);
  } catch (error) {
    console.error(
      `Failed to send driver application acceptance email to ${driver.email}:`,
      error.message
    );
    return res
      .status(500)
      .json({
        message: "Failed to send acceptance email",
        token: req.cookies.token,
      });
  }

  const rejectedDrivers = driverHiring.driverApplications.filter(
    (app) =>
      app.driverId.toString() !== driverId.toString() &&
      app.applicationStatus === "rejected"
  );
  for (const app of rejectedDrivers) {
    const rejectedDriver = await User.findById(app.driverId);
    if (rejectedDriver) {
      try {
        await transporter.sendMail({
          from: `"AAAO GO" <chyousafawais667@gmail.com>`,
          to: rejectedDriver.email,
          subject: "Driver Application Rejected",
          html: generateEmailTemplate({
            subject: "Driver Application Rejected",
            greeting: `Hello ${rejectedDriver.firstName}${
              rejectedDriver.lastName ? " " + rejectedDriver.lastName : ""
            },`,
            message: `Your application for the driver hiring post (vehicle plate ${driverHiring.vehiclePlateNumber}) was not selected by the vehicle owner. You can apply for other available posts.`,
            ctaText: "View Other Posts",
            ctaUrl: `${process.env.APP_URL}/driver-hiring-posts`,
          }),
        });
        console.log(
          `Driver application rejection email sent to ${rejectedDriver.email}`
        );
      } catch (error) {
        console.error(
          `Failed to send driver application rejection email to ${rejectedDriver.email}:`,
          error.message
        );
      }
    }
  }

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });

  res.status(200).json({
    message: "Driver application accepted successfully",
    driverHiringId,
    driverId,
    vehicleId: driverHiring.vehicleId,
    token,
  });
});

export {
  registerVehicle,
  setDriverDecision,
  submitDriverHiring,
  getVehicleAndDriverHiring,
  deleteVehicle,
  deleteDriverHiring,
  getPendingDriverHirings,
  acceptDriverHiring,
  rejectDriverHiring,
  applyForDriverHiring,
  getDriverApplications,
  acceptDriverApplication,
};