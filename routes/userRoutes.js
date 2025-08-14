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
} from "../controllers/userController.js";
import {
  manageAllowedSections,
  getAllowedSections,
} from "../controllers/allowedSectionsController.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import authHandler from "../middlewares/authMiddleware.js"; // Corrected typo: authMIddleware.js -> authMiddleware.js
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
router.post("/reset-password", authHandler, resetPassword);
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

export default router;
