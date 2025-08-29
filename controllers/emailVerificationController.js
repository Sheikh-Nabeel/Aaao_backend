import asyncHandler from "express-async-handler";
import EmailVerification from "../models/emailVerificationModel.js";
import { sendOTPEmail } from "../middleware/email.js";
import User from "../models/userModel.js";

// Send OTP to email for verification
const sendVerificationOTP = asyncHandler(async (req, res) => {
  let { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error("Email is required");
  }

  // Normalize email to lowercase
  email = email.trim().toLowerCase();

  // Check if user is already registered with this email
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    res.status(400);
    throw new Error("This email is already registered. Please proceed to login.");
  }

  // Check if there's an existing verification record
  let verification = await EmailVerification.findOne({ email });

  if (verification) {
    // Generate new OTP and update expiry
    verification.otp = verification.constructor.schema.path('otp').defaultValue();
    verification.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    verification.isVerified = false;
    await verification.save();
  } else {
    // Create new verification record
    verification = await EmailVerification.create({ email });
  }

  try {
    // Send OTP email
    await sendOTPEmail(email, verification.otp, "account verification");
    console.log(`Email verification OTP sent to ${email} with OTP: ${verification.otp}`);

    res.status(200).json({
      message: "Verification OTP sent successfully. Please check your email.",
      email
    });
  } catch (error) {
    console.error(`Failed to send verification email to ${email}:`, error.message);
    res.status(500);
    throw new Error("Failed to send verification email");
  }
});

// Verify OTP without completing registration
const verifyOTP = asyncHandler(async (req, res) => {
  let { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400);
    throw new Error("Email and OTP are required");
  }

  // Normalize email to lowercase
  email = email.trim().toLowerCase();

  const verification = await EmailVerification.findOne({ email });

  if (!verification) {
    res.status(404);
    throw new Error("No verification record found. Please request a new OTP.");
  }

  if (Date.now() > verification.otpExpires) {
    res.status(400);
    throw new Error("OTP has expired. Please request a new one.");
  }

  if (verification.otp !== otp) {
    res.status(400);
    throw new Error("Invalid OTP");
  }

  // Mark as verified
  verification.isVerified = true;
  await verification.save();

  res.status(200).json({
    message: "OTP verified successfully. You can now complete registration.",
    email,
    verified: true
  });
});

// Check if email is verified
const checkVerificationStatus = asyncHandler(async (req, res) => {
  let { email } = req.params;

  if (!email) {
    res.status(400);
    throw new Error("Email is required");
  }

  // Normalize email to lowercase
  email = email.trim().toLowerCase();

  const verification = await EmailVerification.findOne({ email });

  if (!verification) {
    res.status(404);
    throw new Error("No verification record found for this email.");
  }

  res.status(200).json({
    email,
    isVerified: verification.isVerified,
    otpExpired: Date.now() > verification.otpExpires
  });
});

export {
  sendVerificationOTP,
  verifyOTP,
  checkVerificationStatus
};