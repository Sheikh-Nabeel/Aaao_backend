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
  sponsorTree: {
    type: [mongoose.Schema.Types.ObjectId], // Array of user IDs for sponsorship tree
    ref: "User",
    default: [], // Empty by default
  },
  level: {
    type: Number,
    default: 0, // Starts at level 0
    max: 4, // Maximum level is 4
  },
  sponsorBy: {
    type: String,
    trim: true, // Removes leading/trailing whitespace
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

export default mongoose.model("User", userSchema);
