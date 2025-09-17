import express from "express";
import {
  signupUser,
  verifyOTPUser,
  loginUser,
  forgotPassword,
  resetPassword,
  submitKYC,
  logout,
  resendOtp,
  getPendingKYCs,
  approveKYC,
  rejectKYC,
  getAllUsers,
  fixReferralRelationships,
  getReferralTree,
  getReferralLink,
  getUserByUsername,
  setVehicleOwnership,
  addPinnedDriver,
  removePinnedDriver,
  getPinnedDrivers,
  addFavoriteDriver,
  removeFavoriteDriver,
  getFavoriteDrivers,
  getNearbyDriversForUser,
  getQualificationStats,
  getQualificationTransactions,
  deleteUser,
  editUser,
  getAllCustomers,
  getAllDrivers,
  editDriver,
  addAdmin,
  getCurrentUser,
  getAdmins,
  getAllAdminsAndSuperadmins,
  editAdmin,
  deleteAdmin,
  changeOwnPassword,
  editProfile,
  changeReferralCode,
  updateProfilePicture,
  getUsersWithoutKYC,
} from "../controllers/userController.js";
import {
  manageAllowedSections,
  getAllowedSections,
} from "../controllers/allowedSectionsController.js";
import {
  createService,
  getAllServices,
  getUserServices,
  deleteService,
  getAvailableServices,
  approveService,
  rejectService,
  getPendingServices
} from "../controllers/serviceController.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import authHandler from "../middlewares/authMIddleware.js";
import adminHandler from "../middlewares/adminMiddleware.js";
import superadminAuth from "../middlewares/superadminAuth.js";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

const router = express.Router();

// Serve images from uploads folder
router.get("/uploads/:filename", (req, res) => {
  const filePath = path.join(process.cwd(), "uploads", req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ message: "File not found" });
  }
});

// User routes
router.post("/signup", signupUser);
router.post("/verify-otp", verifyOTPUser);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post(
  "/submit-kyc",
  authHandler,
  upload.fields([
    { name: "frontImage", maxCount: 1 },
    { name: "backImage", maxCount: 1 },
    { name: "selfieImage", maxCount: 1 },
  ]),
  submitKYC
);
router.post("/logout", authHandler, logout);
router.post("/resend-otp", resendOtp);
router.post("/set-vehicle-ownership", authHandler, setVehicleOwnership);

// Pinned and Favorite Drivers Management
router.post("/pinned-drivers", authHandler, addPinnedDriver);
router.delete("/pinned-drivers/:driverId", authHandler, removePinnedDriver);
router.get("/pinned-drivers", authHandler, getPinnedDrivers);

router.post("/favorite-drivers", authHandler, addFavoriteDriver);
router.delete("/favorite-drivers/:driverId", authHandler, removeFavoriteDriver);
router.get("/favorite-drivers", authHandler, getFavoriteDrivers);

// Get nearby drivers for user
router.get("/nearby-drivers", authHandler, getNearbyDriversForUser);

// Admin routes
router.get("/pending-kycs", authHandler, adminHandler, getPendingKYCs);
router.post("/approve-kyc", authHandler, adminHandler, approveKYC);
router.post("/reject-kyc", authHandler, adminHandler, rejectKYC);
router.get("/referral-link", authHandler, getReferralLink);
router.get("/all", authHandler, adminHandler, getAllUsers);
router.post(
  "/fix-referrals",
  authHandler,
  adminHandler,
  fixReferralRelationships
);
router.get("/referral-tree", authHandler, getReferralTree);

// Service routes
router.post(
  "/services",
  authHandler,
  upload.fields([
    { name: "tradeLicenseCopy", maxCount: 1 },
    { name: "shopImages", maxCount: 10 },
    { name: "passportCopy", maxCount: 2 },
    { name: "uploadedPriceList", maxCount: 1 },
    { name: "uploadedPortfolio", maxCount: 1 },
  ]),
  createService
);
router.get("/services", authHandler, getAllServices);
router.get("/pending-services", authHandler, adminHandler, getPendingServices);
router.get("/user-services", authHandler, getUserServices);
router.delete("/services/:serviceId", authHandler, deleteService);
router.get("/available-services", authHandler, getAvailableServices);
router.post("/services/approve/:serviceId", authHandler, approveService);
router.post("/services/reject/:serviceId", authHandler,  rejectService);

// Superadmin routes for allowed sections
router.post("/allowed-sections", superadminAuth, manageAllowedSections);
router.get("/allowed-sections", superadminAuth, getAllowedSections);
router.get("/by-username", getUserByUsername);

// Qualification stats routes
router.get("/qualification-stats/:userId", authHandler, getQualificationStats);
router.get(
  "/qualification-transactions/:userId",
  authHandler,
  getQualificationTransactions
);

// User management routes
router.delete("/delete/:userId", authHandler, adminHandler, deleteUser);
router.patch("/edit/:userId", authHandler, adminHandler, editUser);
router.get("/customers", authHandler, adminHandler, getAllCustomers);
router.get("/drivers", authHandler, adminHandler, getAllDrivers);
router.put(
  "/edit-driver/:userId",
  authHandler,
  adminHandler,
  upload.fields([
    { name: "licenseImage", maxCount: 1 },
    { name: "vehicleRegistrationCard", maxCount: 1 },
    { name: "roadAuthorityCertificate", maxCount: 1 },
    { name: "insuranceCertificate", maxCount: 1 },
    { name: "vehicleImages", maxCount: 10 },
  ]),
  editDriver
);

router.get("/me", authHandler, getCurrentUser);
router.get("/admins", authHandler, adminHandler, getAdmins);
router.get("/admins-and-superadmins", authHandler, getAllAdminsAndSuperadmins);
router.post("/admin/add-admin", authHandler, adminHandler, addAdmin);
router.put("/admin/edit-admin/:userId", authHandler, adminHandler, editAdmin);
router.delete(
  "/admin/delete-admin/:userId",
  authHandler,
  adminHandler,
  deleteAdmin
);
router.patch("/change-own-password", authHandler, changeOwnPassword);
router.patch(
  "/edit-profile/:userId",
  authHandler, // Only authentication required, not admin privileges
  upload.fields([
    { name: "selfieImage", maxCount: 1 },
    { name: "licenseImage", maxCount: 1 },
    { name: "vehicleRegistrationCard", maxCount: 1 },
    { name: "roadAuthorityCertificate", maxCount: 1 },
    { name: "insuranceCertificate", maxCount: 1 },
    { name: "vehicleImages", maxCount: 10 },
  ]),
  editProfile
);

// Change referral code route
router.patch("/change-referral-code/:userId", authHandler, changeReferralCode);

// Update profile picture route
router.patch(
  "/update-profile-picture",
  authHandler,
  upload.single("profilePicture"),
  updateProfilePicture
);

// Get users without KYC level 1 or 2 (Admin only)
router.get("/without-kyc", authHandler, adminHandler, getUsersWithoutKYC);

export default router;