// Importing required modules for MongoDB schema definition and password hashing
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid"; // Import uuid for unique sponsorId

// Defining the user schema with validation rules
const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, "First name is required"], // Ensures first name is provided
    trim: true, // Removes leading/trailing whitespace
  },
  lastName: {
    type: String,
    required: [true, "Last name is required"], // Ensures last name is provided
    trim: true, // Removes leading/trailing whitespace
  },
  email: {
    type: String,
    required: [true, "Email is required"], // Ensures email is provided
    unique: true, // Ensures email is unique across users
    lowercase: true, // Converts email to lowercase
    trim: true, // Removes leading/trailing whitespace
    match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"], // Email format validation
  },
  phoneNumber: {
    type: String,
    required: [true, "Phone number is required"], // Ensures phone number is provided
    unique: true, // Ensures phone number is unique
    trim: true, // Removes leading/trailing whitespace
  },
  password: {
    type: String,
    required: [true, "Password is required"], // Ensures password is provided
    minlength: [6, "Password must be at least 6 characters"], // Minimum password length
  },
  sponsorId: {
    type: String,
    unique: true, // Ensures sponsorId is unique
    required: true, // Sponsor ID is mandatory
    default: function () {
      return `${uuidv4().split("-")[0]}-${Date.now().toString().slice(-6)}`; // Use part of uuidv4 and timestamp for uniqueness
    },
  },
  // Direct referrals (Level 1) - users directly referred by this user
  directReferrals: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [],
  },
  // Level 2 referrals - users referred by direct referrals
  level2Referrals: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [],
  },
  // Level 3 referrals - users referred by level 2 referrals
  level3Referrals: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [],
  },
  // Level 4 referrals - users referred by level 3 referrals
  level4Referrals: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [],
  },
  // Current level of the user (0-4)
  level: {
    type: Number,
    default: 0, // Starts at level 0
    max: 4, // Maximum level is 4
  },
  // Who referred this user (sponsor's sponsorId)
  sponsorBy: {
    type: String,
    trim: true, // Removes leading/trailing whitespace
  },
  // Legacy field for backward compatibility
  sponsorTree: {
    type: [mongoose.Schema.Types.ObjectId], // Array of user IDs for sponsorship tree
    ref: "User",
    default: [], // Empty by default
  },
  country: {
    type: String,
    required: false, // Optional field
    trim: true, // Removes leading/trailing whitespace
  },
  cnicImages: {
    front: { type: String, required: false }, // URL for front CNIC image (Cloudinary)
    back: { type: String, required: false }, // URL for back CNIC image (Cloudinary)
  },
  selfieImage: {
    type: String, // URL for live selfie image (Cloudinary)
    required: false,
  },
  licenseImage: {
    type: String, // URL for driver's license image (Cloudinary)
    required: false,
  },
  gender: {
    type: String, // Optional gender field
    required: false,
    enum: ["Male", "Female", "Other"], // Restrict to these values
    trim: true,
  },
  kycLevel: {
    type: Number,
    default: 0, // 0 = unverified, 1 = KYC Level 1 completed, 2 = KYC Level 2 completed
  },
  otp: {
    type: String,
    default: null, // Stores one-time password for verification
  },
  otpExpires: {
    type: Date, // Expiration time for OTP
    default: null,
  },
  isVerified: {
    type: Boolean,
    default: false, // Tracks if user email is verified
  },
  resetOtp: {
    type: String,
    default: null, // Stores OTP for password reset
  },
  resetOtpExpires: {
    type: Date, // Expiration time for password reset OTP
  },
  role: {
    type: String,
    default: "customer", // Default role is "customer", can switch to "driver"
    enum: ["customer", "driver"], // Restricts role to these values
  },
  createdAt: {
    type: Date,
    default: Date.now, // Automatically sets creation timestamp
  },
});

// Create indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ phoneNumber: 1 });
userSchema.index({ sponsorId: 1 });
userSchema.index({ sponsorBy: 1 });
userSchema.index({ level: 1 });
userSchema.index({ kycLevel: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ firstName: 1, lastName: 1 }); // For name searches
userSchema.index({ directReferrals: 1 }); // For level 1 queries
userSchema.index({ level2Referrals: 1 }); // For level 2 queries
userSchema.index({ level3Referrals: 1 }); // For level 3 queries
userSchema.index({ level4Referrals: 1 }); // For level 4 queries

// Compound indexes for complex queries
userSchema.index({ sponsorBy: 1, level: 1 });
userSchema.index({ level: 1, createdAt: -1 });
userSchema.index({ kycLevel: 1, role: 1 });

// Hash password before saving to database
userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10); // Hash password with salt round 10
  }
  next();
});

// Method to compare password during login
userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password); // Compare input password with hashed password
};

// Method to get referral statistics
userSchema.methods.getReferralStats = function() {
  return {
    level1: this.directReferrals.length,
    level2: this.level2Referrals.length,
    level3: this.level3Referrals.length,
    level4: this.level4Referrals.length,
    totalReferrals: this.directReferrals.length + this.level2Referrals.length + 
                   this.level3Referrals.length + this.level4Referrals.length,
    currentLevel: this.level
  };
};

// Method to check if user can level up
userSchema.methods.canLevelUp = function() {
  const stats = this.getReferralStats();
  
  // Level 1: Need at least 3 direct referrals
  if (stats.level1 >= 3 && this.level < 1) return 1;
  
  // Level 2: Need at least 3 level 2 referrals
  if (stats.level2 >= 3 && this.level < 2) return 2;
  
  // Level 3: Need at least 3 level 3 referrals
  if (stats.level3 >= 3 && this.level < 3) return 3;
  
  // Level 4: Need at least 3 level 4 referrals
  if (stats.level4 >= 3 && this.level < 4) return 4;
  
  return null; // Cannot level up
};

export default mongoose.model("User", userSchema);
