import mongoose from "mongoose";
import { generateOTP } from "../middleware/email.js";

const emailVerificationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    otp: {
      type: String,
      required: true,
      default: function() {
        return generateOTP();
      }
    },
    otpExpires: {
      type: Date,
      required: true,
      default: function() {
        return new Date(Date.now() + 10 * 60 * 1000); // OTP valid for 10 minutes
      }
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 3600 // Automatically delete document after 1 hour
    }
  },
  { timestamps: true }
);

// Create index on email for faster lookups
emailVerificationSchema.index({ email: 1 });

// Create index on otpExpires for TTL (Time To Live) functionality
emailVerificationSchema.index({ otpExpires: 1 }, { expireAfterSeconds: 600 });

const EmailVerification = mongoose.model("EmailVerification", emailVerificationSchema);

export default EmailVerification;