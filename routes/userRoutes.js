// Importing required modules and controllers
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
} from "../controllers/userController.js";
import multer from "multer";
import path from "path";
import authHandler from "../middlewares/authMIddleware.js"; // Correct casing

// Multer setup for handling file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"), // Sets upload directory
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)), // Generates unique filename
});
const upload = multer({ storage }); // Initialize multer with storage configuration

// Route to handle initial signup (send OTP)
const router = express.Router();
router.post("/signup", signupUser);

// Route to handle OTP verification and full registration
router.post("/verify-otp", verifyOTPUser); // Renamed from /register

// Route to handle user login (no authentication required for initial login)
router.post("/login", loginUser);

// Route to handle forgot password request, no authentication required
router.post("/forgot-password", forgotPassword);

// Route to reset user password, requiring authentication
router.post("/reset-password", authHandler, resetPassword);

// Route to submit KYC Level 1 with CNIC images and selfie, requiring authentication
router.post(
  "/submit-kyc",
  authHandler,
  upload.fields([
    { name: "frontImage" },
    { name: "backImage" },
    { name: "selfieImage" },
  ]),
  submitKYC
);

router.post("/logout", authHandler, logout);

// Route to resend OTP to user's email, requiring no authentication
router.post("/resend-otp", resendOtp); // Keep as is

// Export router for use in main application
export default router;
