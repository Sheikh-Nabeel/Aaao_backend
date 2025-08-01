// Importing required modules and models
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";
import nodemailer from "nodemailer";
import cloudinary from "cloudinary";
import jwt from "jsonwebtoken"; // Import JWT for token generation
import { v4 as uuidv4 } from "uuid"; // Import uuid (kept for potential future use)

// Validate environment variables for email configuration
if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
  console.error(
    "Missing email credentials: MAIL_USER or MAIL_PASS is undefined"
  ); // Log error if email credentials are missing
  throw new Error("Server configuration error: Email credentials missing");
}

// Configure Nodemailer transporter for sending emails
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
}); // Set up email transporter
transporter.verify((error) => {
  if (error) console.error("Nodemailer configuration error:", error.message);
  // Log configuration errors
  else console.log("Nodemailer is ready to send emails"); // Confirm transporter is ready
});

// Generate a 6-digit OTP for verification or password reset
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString(); // Generate a random 6-digit OTP

// Function to handle user signup and send OTP via email
const signupUser = asyncHandler(async (req, res) => {
  // Extract registration data from request body
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    sponsorBy,
    gender,
  } = req.body;

  // Check for missing required fields
  if (!firstName) {
    res.status(400);
    throw new Error("First name is required");
  }
  if (!lastName) {
    res.status(400);
    throw new Error("Last name is required");
  }
  if (!email) {
    res.status(400);
    throw new Error("Email is required");
  }
  if (!phoneNumber) {
    res.status(400);
    throw new Error("Phone number is required");
  }
  if (!password) {
    res.status(400);
    throw new Error("Password is required");
  }
  if (!gender) {
    res.status(400);
    throw new Error("Gender is required");
  }

  // Validate sponsorBy if provided
  if (sponsorBy) {
    const sponsor = await User.findOne({ sponsorId: sponsorBy });
    if (!sponsor) {
      res.status(400);
      throw new Error("Invalid sponsor ID");
    }
  }

  // Check if email or phoneNumber already exists (partial user or verified)
  const existingUser = await User.findOne({
    $or: [{ email }, { phoneNumber }],
  });
  let otp;
  if (existingUser) {
    if (existingUser.isVerified) {
      res.status(400);
      throw new Error("A user with this email or phone number already exists");
    }
    // Update existing unverified user
    otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    existingUser.otp = otp;
    existingUser.otpExpires = otpExpires;
    existingUser.firstName = firstName;
    existingUser.lastName = lastName;
    existingUser.phoneNumber = phoneNumber;
    existingUser.password = password;
    existingUser.sponsorBy = sponsorBy || null;
    existingUser.gender = gender;
    await existingUser.save();
    console.log("Updated existing user:", existingUser.email, existingUser.otp);
  } else {
    const user = await User.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      sponsorBy: sponsorBy || null,
      gender,
      otp: generateOTP(),
      otpExpires: new Date(Date.now() + 10 * 60 * 1000),
      isVerified: false,
    });
    otp = user.otp; // Assign the OTP from the created user
    console.log("Created new user:", user.email, user.otp);
  }

  await transporter.sendMail({
    from: `"Your App" <${process.env.MAIL_USER}>`, // Sender email
    to: email, // Recipient email
    subject: "Your OTP for Account Verification", // Email subject
    text: `Hello ${firstName} ${lastName},\nYour OTP for account verification is: ${otp}\nPlease enter this OTP to verify within 10 minutes.`,
    html: `<h2>Hello ${firstName} ${lastName},</h2><p>Your OTP is: <strong>${otp}</strong></p><p>Verify within 10 minutes.</p>`,
  });
  res.status(200).json({
    message: "OTP sent. Please verify to complete registration.",
  });
});

// Function to verify OTP and complete user registration
const verifyOTPUser = asyncHandler(async (req, res) => {
  // Extract email and OTP from request body
  const { email, otp } = req.body;

  // Check for missing required fields
  if (!email) {
    res.status(400);
    throw new Error("Email is required");
  }
  if (!otp) {
    res.status(400);
    throw new Error("OTP is required");
  }

  const user = await User.findOne({ email });
  console.log("Searching for user with email:", email, "Found:", user);
  if (!user) {
    res.status(404);
    throw new Error("User not found. Please sign up first.");
  }
  if (Date.now() > user.otpExpires || !user.otpExpires) {
    res.status(400);
    throw new Error("OTP has expired. Please sign up again.");
  }
  if (user.otp !== otp) {
    res.status(400);
    throw new Error("Invalid OTP");
  }

  // Complete registration (sponsor validation already done in signup)
  let sponsorName = null;
  if (user.sponsorBy) {
    const sponsor = await User.findOne({ sponsorId: user.sponsorBy });
    if (sponsor) {
      sponsor.sponsorTree.push(user._id);
      await sponsor.save();
      sponsorName = `${sponsor.firstName} ${sponsor.lastName}`;
    }
  }

  user.isVerified = true;
  user.otp = null;
  user.otpExpires = null;
  await user.save();

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 3600000, // 1 hour
    sameSite: "lax", // Adjust for local dev; use "none" with secure: true for cross-origin if needed
    secure: process.env.NODE_ENV === "production", // Only secure in production
  });
  const sponsoredUsers = user.sponsorTree
    .map((s) => `${s.firstName} ${s.lastName}`)
    .join(", ");
  res.status(201).json({
    message: "Registration completed successfully",
    token,
    userId: user._id,
    sponsorId: user.sponsorId,
    level: user.level,
    sponsorTree: user.sponsorTree.map((s) => ({
      id: s._id,
      name: `${s.firstName} ${s.lastName}`,
    })),
    sponsoredUsers: sponsoredUsers || "No sponsored users",
    sponsorName: sponsorName, // Add sponsor name to response
    user: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      sponsorBy: user.sponsorBy,
      country: user.country,
      kycLevel: user.kycLevel,
      gender: user.gender,
    },
  });
});

// Function to handle user login
const loginUser = asyncHandler(async (req, res) => {
  // Extract login credentials from request body
  const { email, phoneNumber, password } = req.body;
  if ((!email && !phoneNumber) || !password) {
    res.status(400);
    throw new Error("Email or phone number and password are required");
  }
  const user = await User.findOne({
    $or: [{ email }, { phoneNumber }],
  }).populate("sponsorTree", "firstName lastName");
  if (!user) {
    res.status(401);
    throw new Error("Invalid email or phone number");
  }
  if (!user.isVerified) {
    res.status(403);
    throw new Error("User not verified. Please complete registration.");
  }
  if (!(await user.comparePassword(password))) {
    res.status(401);
    throw new Error("Invalid password");
  }
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  const sponsoredUsers = user.sponsorTree
    .map((s) => `${s.firstName} ${s.lastName}`)
    .join(", ");
  let sponsorName = null;
  if (user.sponsorBy) {
    const sponsor = await User.findOne({ sponsorId: user.sponsorBy });
    sponsorName = sponsor ? `${sponsor.firstName} ${sponsor.lastName}` : null;
  }
  res
    .cookie("token", token, {
      httpOnly: true,
      maxAge: 3600000, // 1 hour
      sameSite: "lax", // Adjust for local dev; use "none" with secure: true for cross-origin if needed
      secure: process.env.NODE_ENV === "production", // Only secure in production
    })
    .status(200)
    .json({
      message: "Login successful",
      token,
      userId: user._id,
      sponsorId: user.sponsorId,
      level: user.level,
      sponsorTree: user.sponsorTree.map((s) => ({
        id: s._id,
        name: `${s.firstName} ${s.lastName}`,
      })),
      sponsoredUsers: sponsoredUsers || "No sponsored users",
      sponsorName: sponsorName, // Add sponsor name to response
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        sponsorBy: user.sponsorBy,
        country: user.country,
        kycLevel: user.kycLevel,
        gender: user.gender,
      },
    });
});

// Function to handle forgot password request and send OTP
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400);
    throw new Error("Email is required");
  }
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  const resetOtp = generateOTP();
  await User.findByIdAndUpdate(
    user._id,
    { resetOtp, resetOtpExpires: Date.now() + 10 * 60 * 1000 },
    { new: true, runValidators: true }
  );
  await transporter.sendMail({
    from: `"Your App" <${process.env.MAIL_USER}>`,
    to: email,
    subject: "Your OTP for Password Reset",
    text: `Hello ${user.firstName} ${user.lastName},\nYour OTP for password reset is: ${resetOtp}\nPlease use this OTP within 10 minutes.`,
    html: `<h2>Hello ${user.firstName} ${user.lastName},</h2><p>Your OTP is: <strong>${resetOtp}</strong></p><p>Use within 10 minutes.</p>`,
  });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 3600000, // 1 hour
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.status(200).json({ message: "Reset OTP sent to email", token });
});

// Function to reset user password using OTP
const resetPassword = asyncHandler(async (req, res) => {
  const { userId, resetOtp, password } = req.body;
  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  if (!resetOtp) {
    res.status(400);
    throw new Error("Reset OTP is required");
  }
  if (!password) {
    res.status(400);
    throw new Error("Password is required");
  }
  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (
    user.resetOtp !== resetOtp ||
    !user.resetOtpExpires ||
    user.resetOtpExpires < Date.now()
  ) {
    res.status(400);
    throw new Error("Invalid or expired reset OTP");
  }
  user.password = password;
  user.resetOtp = null;
  user.resetOtpExpires = null;
  await user.save();
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 3600000, // 1 hour
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.status(200).json({ message: "Password reset successful", token });
});

// Function to handle KYC Level 1 submission
cloudinary.config({
  cloud_name: process.env.Cloud_Name,
  api_key: process.env.API_Key,
  api_secret: process.env.API_Secret,
});
const submitKYC = asyncHandler(async (req, res) => {
  const { userId, fullName, country, gender } = req.body;
  const frontImage = req.files?.frontImage;
  const backImage = req.files?.backImage;
  const selfieImage = req.files?.selfieImage;
  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  if (!fullName) {
    res.status(400);
    throw new Error("Full name is required");
  }
  if (!country) {
    res.status(400);
    throw new Error("Country is required");
  }
  if (!frontImage) {
    res.status(400);
    throw new Error("Front image is required");
  }
  if (!backImage) {
    res.status(400);
    throw new Error("Back image is required");
  }
  if (!selfieImage) {
    res.status(400);
    throw new Error("Selfie image is required");
  }
  const [firstName, lastName] = fullName.split(" ").filter(Boolean);
  if (!firstName || !lastName) {
    res.status(400);
    throw new Error("Full name must contain both first and last names");
  }
  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found. Please provide a valid user ID.");
  }
  const frontUpload = await cloudinary.uploader.upload(frontImage[0].path, {
    folder: "kyc/front",
  });
  const backUpload = await cloudinary.uploader.upload(backImage[0].path, {
    folder: "kyc/back",
  });
  const selfieUpload = await cloudinary.uploader.upload(selfieImage[0].path, {
    folder: "kyc/selfie",
  });
  user.firstName = firstName;
  user.lastName = lastName;
  user.country = country;
  user.gender = gender;
  user.cnicImages = {
    front: frontUpload.secure_url,
    back: backUpload.secure_url,
  };
  user.selfieImage = selfieUpload.secure_url;
  user.kycLevel = 1;
  await user.save();
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 3600000, // 1 hour
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res
    .status(200)
    .json({ message: "KYC Level 1 completed successfully", token });
});

// Handle user logout by clearing the token cookie
const logout = async (req, res) => {
  try {
    // Clear the cookie regardless of its existence
    res.clearCookie("token", {
      httpOnly: true,
      maxAge: 0,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    // Check if token exists in request cookies and log for debugging
    if (!req.cookies || !req.cookies.token) {
      console.log("No token found in request cookies during logout");
    }
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ message: "Logout failed", error: error.message });
  }
};

// Function to resend OTP to user's email
const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400);
    throw new Error("Email is required");
  }
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (user.isVerified) {
    res.status(400);
    throw new Error("User is already verified");
  }
  const newOtp = generateOTP();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
  user.otp = newOtp;
  user.otpExpires = otpExpires;
  await user.save();
  await transporter.sendMail({
    from: `"Your App" <${process.env.MAIL_USER}>`,
    to: email,
    subject: "Your New OTP for Account Verification",
    text: `Hello ${user.firstName} ${user.lastName},\nYour new OTP for account verification is: ${newOtp}\nPlease enter this OTP to verify within 10 minutes.`,
    html: `<h2>Hello ${user.firstName} ${user.lastName},</h2><p>Your new OTP is: <strong>${newOtp}</strong></p><p>Verify within 10 minutes.</p>`,
  });
  res.status(200).json({ message: "New OTP sent successfully" });
});

// Helper function to update sponsor levels recursively
async function updateSponsorLevels(userId) {
  const user = await User.findById(userId);
  if (!user) return;

  const directReferrals = user.sponsorTree.length;
  if (directReferrals >= 3 && user.level < 1) {
    user.level = 1;
  }

  const allReferrals = await User.find({ sponsorBy: user.sponsorId });
  let totalLevel2Referrals = 0;
  for (const referral of allReferrals) {
    const subReferrals = await User.find({ sponsorBy: referral.sponsorId });
    if (subReferrals.length >= 3 && referral.level < 2) {
      referral.level = 2;
      await referral.save();
      totalLevel2Referrals += 1;
    }
  }
  if (totalLevel2Referrals >= 3 && user.level < 2) {
    user.level = 2;
  }

  const level3Referrals = await User.find({
    level: 2,
    sponsorBy: user.sponsorId,
  });
  let totalLevel3Referrals = 0;
  for (const level2Referral of level3Referrals) {
    const subSubReferrals = await User.find({
      sponsorBy: level2Referral.sponsorId,
      level: 2,
    });
    if (subSubReferrals.length >= 3 && level2Referral.level < 3) {
      level2Referral.level = 3;
      await level2Referral.save();
      totalLevel3Referrals += 1;
    }
  }
  if (totalLevel3Referrals >= 3 && user.level < 3) {
    user.level = 3;
  }

  const level4Referrals = await User.find({
    level: 3,
    sponsorBy: user.sponsorId,
  });
  let totalLevel4Referrals = 0;
  for (const level3Referral of level4Referrals) {
    const subSubSubReferrals = await User.find({
      sponsorBy: level3Referral.sponsorId,
      level: 3,
    });
    if (subSubSubReferrals.length >= 3 && level3Referral.level < 4) {
      level3Referral.level = 4;
      await level3Referral.save();
      totalLevel4Referrals += 1;
    }
  }
  if (totalLevel4Referrals >= 3 && user.level < 4) {
    user.level = 4;
  }

  if (user.level > 4) user.level = 4;
  await user.save();

  if (user.sponsorBy && user.sponsorBy !== "root") {
    const parentSponsor = await User.findOne({ sponsorId: user.sponsorBy });
    if (parentSponsor) {
      await updateSponsorLevels(parentSponsor._id);
    }
  }
}

// Export all controller functions
export {
  signupUser,
  verifyOTPUser,
  loginUser,
  forgotPassword,
  resetPassword,
  submitKYC,
  logout,
  resendOtp,
};
