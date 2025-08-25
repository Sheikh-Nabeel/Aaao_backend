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
} from "../controllers/userController.js";
import {
  manageAllowedSections,
  getAllowedSections,
} from "../controllers/allowedSectionsController.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import authHandler from "../middlewares/authMIddleware.js";
import adminMiddleware from "../middlewares/adminMiddleware.js";
import superadminAuth from "../middlewares/superadminAuth.js"; // Added import for superadminAuth

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
  const filePath = path.join(process.cwd(), "Uploads", req.params.filename);
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
router.get("/pending-kycs", authHandler, adminMiddleware, getPendingKYCs);
router.post("/approve-kyc", authHandler, adminMiddleware, approveKYC);
router.post("/reject-kyc", authHandler, adminMiddleware, rejectKYC);
router.get("/referral-link", authHandler, getReferralLink);
router.get("/all", authHandler, adminMiddleware, getAllUsers);
router.post(
  "/fix-referrals",
  authHandler,
  adminMiddleware,
  fixReferralRelationships
);
router.get("/referral-tree", authHandler, getReferralTree);

// Superadmin routes for allowed sections
router.post("/allowed-sections", superadminAuth, manageAllowedSections);
router.get("/allowed-sections", superadminAuth, getAllowedSections);
router.get("/by-username", getUserByUsername);


export default router;
