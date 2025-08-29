import express from "express";
import {
  sendVerificationOTP,
  verifyOTP,
  checkVerificationStatus
} from "../controllers/emailVerificationController.js";

const router = express.Router();

// Send OTP to email for verification
router.post("/send-otp", sendVerificationOTP);

// Verify OTP without completing registration
router.post("/verify-otp", verifyOTP);

// Check if email is verified
router.get("/status/:email", checkVerificationStatus);

export default router;