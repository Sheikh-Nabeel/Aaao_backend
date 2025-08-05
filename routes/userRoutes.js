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
router.post("/signup", signupUser);
router.post("/verify-otp", verifyOTPUser);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", authHandler, resetPassword);
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
