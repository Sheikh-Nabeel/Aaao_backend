import User from "../models/userModel.js";
import Vehicle from "../models/vehicleModel.js";
import asyncHandler from "express-async-handler";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import {
  generateOTP,
  sendOTPEmail,
  sendPasswordResetOTP,
  sendKYCApprovalEmail,
  sendKYCRejectionEmail,
} from "../middleware/email.js";

// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Helper function to remove user from all levels of a sponsor's tree
async function removeFromSponsorTree(userId, sponsorId) {
  const sponsor = await User.findById(sponsorId);
  if (!sponsor) return;

  // Remove from direct referrals
  sponsor.directReferrals = sponsor.directReferrals.filter(
    (id) => id.toString() !== userId.toString()
  );

  // Remove from level 2 referrals
  sponsor.level2Referrals = sponsor.level2Referrals.filter(
    (id) => id.toString() !== userId.toString()
  );

  // Remove from level 3 referrals
  sponsor.level3Referrals = sponsor.level3Referrals.filter(
    (id) => id.toString() !== userId.toString()
  );

  // Remove from level 4 referrals
  sponsor.level4Referrals = sponsor.level4Referrals.filter(
    (id) => id.toString() !== userId.toString()
  );

  // Remove from sponsor tree
  sponsor.sponsorTree = sponsor.sponsorTree.filter(
    (id) => id.toString() !== userId.toString()
  );

  // Remove from nextLevels array
  if (Array.isArray(sponsor.nextLevels)) {
    sponsor.nextLevels = sponsor.nextLevels.map(level => 
      level.filter(id => id.toString() !== userId.toString())
    ).filter(level => level.length > 0);
  }

  await sponsor.save();
  await updateAllLevels(sponsorId);
}

// Helper function to check for circular references
async function checkCircularReference(userId, newSponsorId) {
  if (userId.toString() === newSponsorId.toString()) {
    return true; // User cannot sponsor themselves
  }

  // Check if the new sponsor is in the user's downline
  const user = await User.findById(userId);
  if (!user) return false;

  const checkDownline = async (currentUserId, targetId) => {
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) return false;

    // Check direct referrals
    if (currentUser.directReferrals.some(id => id.toString() === targetId.toString())) {
      return true;
    }

    // Recursively check all levels
    for (const referralId of currentUser.directReferrals) {
      if (await checkDownline(referralId, targetId)) {
        return true;
      }
    }

    return false;
  };

  return await checkDownline(userId, newSponsorId);
}

const changeReferralCode = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const { newReferralCode } = req.body;

    if (!newReferralCode) {
      return res.status(400).json({
        success: false,
        message: "New referral code is required",
      });
    }

    // Find the user who wants to change their referral code
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find the new sponsor by referral code (sponsorId or username)
    const newSponsor = await User.findOne({
      $or: [{ sponsorId: newReferralCode }, { username: newReferralCode }],
    });

    if (!newSponsor) {
      return res.status(404).json({
        success: false,
        message: "Invalid referral code. Sponsor not found",
      });
    }

    // Check if user is already under this sponsor
    if (user.sponsorBy === newReferralCode) {
      return res.status(400).json({
        success: false,
        message: "User is already under this sponsor",
      });
    }

    // Check for circular references
    const hasCircularRef = await checkCircularReference(userId, newSponsor._id);
    if (hasCircularRef) {
      return res.status(400).json({
        success: false,
        message: "Cannot set this referral code as it would create a circular reference",
      });
    }

    // Store old sponsor info for removal
    const oldSponsorCode = user.sponsorBy;
    let oldSponsor = null;
    if (oldSponsorCode) {
      oldSponsor = await User.findOne({
        $or: [{ sponsorId: oldSponsorCode }, { username: oldSponsorCode }],
      });
    }

    // Remove user from old sponsor's tree if exists
    if (oldSponsor) {
      await removeFromSponsorTree(userId, oldSponsor._id);
    }

    // Update user's sponsor
    user.sponsorBy = newReferralCode;
    await user.save();

    // Add user to new sponsor's tree
    await updateReferralTree(userId, newReferralCode);

    // Update all affected levels
    await updateAllLevels(newSponsor._id);
    if (oldSponsor) {
      await updateAllLevels(oldSponsor._id);
    }

    res.status(200).json({
      success: true,
      message: "Referral code changed successfully",
      data: {
        userId: user._id,
        username: user.username,
        oldSponsor: oldSponsorCode || "None",
        newSponsor: newReferralCode,
        newSponsorName: `${newSponsor.firstName} ${newSponsor.lastName}`,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Existing controller functions (unchanged)
const signupUser = asyncHandler(async (req, res) => {
  const {
    username,
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    sponsorBy,
    gender,
    otp,
  } = req.body;
  const referralUsername = req.query.ref;

  if (
    !username ||
    !firstName ||
    !email ||
    !phoneNumber ||
    !password ||
    !gender ||
    !otp
  ) {
    res.status(400);
    throw new Error("All required fields must be provided");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingEmail = await User.findOne({ email: normalizedEmail });
  const existingUsername = await User.findOne({ username });
  const existingPhone = await User.findOne({ phoneNumber });

  const errors = {};
  if (existingEmail) errors.email = "This email is already registered";
  if (existingUsername) errors.username = "This username is already taken";
  if (existingPhone)
    errors.phoneNumber = "This phone number is already registered";

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const EmailVerification = mongoose.model("EmailVerification");

  const emailVerification = await EmailVerification.findOne({
    email: normalizedEmail,
  });
  if (!emailVerification) {
    res.status(400);
    throw new Error(
      "Email not verified. Please request OTP verification first."
    );
  }

  if (!emailVerification.isVerified) {
    if (Date.now() > emailVerification.otpExpires) {
      res.status(400);
      throw new Error("OTP has expired. Please request a new OTP.");
    }

    if (emailVerification.otp !== otp) {
      res.status(400);
      throw new Error("Invalid OTP. Please try again.");
    }

    emailVerification.isVerified = true;
    await emailVerification.save();
  }

  let finalSponsorBy = sponsorBy;
  if (referralUsername) {
    const sponsor = await User.findOne({ username: referralUsername }).select(
      "_id"
    );
    if (sponsor) {
      finalSponsorBy = referralUsername;
    } else {
      res.status(400);
      throw new Error("Invalid referral username");
    }
  } else if (sponsorBy) {
    const sponsor = await User.findOne({
      $or: [{ sponsorId: sponsorBy }, { username: sponsorBy }],
    }).select("_id");
    if (!sponsor) {
      res.status(400);
      throw new Error("Invalid sponsor ID or username");
    }
    finalSponsorBy = sponsorBy;
  }

  const user = await User.create({
    username,
    firstName,
    lastName: lastName || "",
    email: normalizedEmail,
    phoneNumber,
    password,
    sponsorBy: finalSponsorBy || null,
    gender,
    isVerified: true,
    role: "customer",
    sponsorId: `${uuidv4().split("-")[0]}-${Date.now().toString().slice(-6)}`,
    pendingVehicleData: null,
  });

  console.log("Created new user with verified email:", user.email);

  let sponsorName = null;
  if (user.sponsorBy) {
    const sponsor = await User.findOne({
      $or: [{ sponsorId: user.sponsorBy }, { username: user.sponsorBy }],
    }).select("firstName lastName");
    if (sponsor) {
      await updateReferralTree(user._id, user.sponsorBy);
      sponsorName = `${sponsor.firstName}${
        sponsor.lastName ? " " + sponsor.lastName : ""
      }`;
    }
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });

  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 3600000,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  res.status(201).json({
    message: "Registration completed successfully",
    token,
    userId: user._id,
    username: user.username,
    sponsorId: user.sponsorId,
    user: {
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName || "",
      email: user.email,
      phoneNumber: user.phoneNumber,
      sponsorBy: user.sponsorBy,
      gender: user.gender,
      role: user.role,
      kycLevel: user.kycLevel,
      kycStatus: user.kycStatus,
      hasVehicle: user.hasVehicle,
      pendingVehicleData: user.pendingVehicleData,
    },
  });
});

const verifyOTPUser = asyncHandler(async (req, res) => {
  let { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400);
    throw new Error("Email and OTP are required");
  }

  email = email.trim().toLowerCase();

  const EmailVerification = mongoose.model("EmailVerification");

  const emailVerification = await EmailVerification.findOne({ email });
  if (!emailVerification) {
    res.status(404);
    throw new Error("Email verification not found. Please request OTP first.");
  }

  if (emailVerification.isVerified) {
    res.status(400);
    throw new Error("Email already verified. You can proceed to registration.");
  }

  if (
    Date.now() > emailVerification.otpExpires ||
    !emailVerification.otpExpires
  ) {
    res.status(400);
    throw new Error("OTP has expired. Please request a new OTP.");
  }

  if (emailVerification.otp !== otp) {
    res.status(400);
    throw new Error("Invalid OTP");
  }

  emailVerification.isVerified = true;
  await emailVerification.save();

  res.status(200).json({
    message:
      "Email verified successfully. You can now proceed with registration.",
    email: email,
    isVerified: true,
  });
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, phoneNumber, username, password } = req.body;
  if ((!email && !phoneNumber && !username) || !password) {
    res.status(400);
    throw new Error("Email or phone number and password are required");
  }
  const user = await User.findOne({
    $or: [{ email }, { phoneNumber }, { username }],
  })
    .populate("sponsorTree", "firstName lastName")
    .populate("pendingVehicleData");
  if (!user) {
    res.status(401);
    throw new Error("Invalid email, phone number, or username");
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
    .map((s) => `${s.firstName}${s.lastName ? " " + s.lastName : ""}`)
    .join(", ");
  let sponsorName = null;
  if (user.sponsorBy) {
    const sponsor = await User.findOne({
      $or: [{ sponsorId: user.sponsorBy }, { username: user.sponsorBy }],
    }).select("firstName lastName");
    sponsorName = sponsor
      ? `${sponsor.firstName}${sponsor.lastName ? " " + sponsor.lastName : ""}`
      : null;
  }
  res
    .cookie("token", token, {
      httpOnly: true,
      maxAge: 3600000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    })
    .status(200)
    .json({
      message: "Login successful",
      token,
      userId: user._id,
      username: user.username,
      sponsorId: user.sponsorId,
      kycLevel: user.kycLevel,
      sponsorTree: user.sponsorTree.map((s) => ({
        id: s._id,
        name: `${s.firstName}${s.lastName ? " " + s.lastName : ""}`,
      })),
      sponsoredUsers: sponsoredUsers || "No sponsored users",
      sponsorName: sponsorName,
      user: {
        _id: user._id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        sponsorId: user.sponsorId,
        sponsorBy: user.sponsorBy,
        kycLevel: user.kycLevel,
        kycStatus: user.kycStatus,
        hasVehicle: user.hasVehicle,
        pendingVehicleData: user.pendingVehicleData,
        country: user.country,
        gender: user.gender,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
});

const forgotPassword = asyncHandler(async (req, res) => {
  let { email } = req.body;
  if (!email) {
    res.status(400);
    throw new Error("Email is required");
  }
  email = email.trim().toLowerCase();
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  const resetOtp = generateOTP();
  const resetOtpExpires = Date.now() + 10 * 60 * 1000;
  const updatedUser = await User.findByIdAndUpdate(
    user._id,
    { resetOtp, resetOtpExpires },
    { new: true, runValidators: true }
  );
  if (!updatedUser) {
    res.status(500);
    throw new Error("Failed to update user with OTP");
  }
  console.log(
    `ForgotPassword - Updated user: ${updatedUser._id}, resetOtp: ${
      updatedUser.resetOtp
    } (type: ${typeof updatedUser.resetOtp}), resetOtpExpires: ${new Date(
      updatedUser.resetOtpExpires
    )}`
  );
  try {
    await sendPasswordResetOTP(email, resetOtp);
    console.log(`Reset OTP email sent to ${email} with OTP: ${resetOtp}`);
  } catch (error) {
    console.error(`Failed to send reset OTP email to ${email}:`, error.message);
    res.status(500);
    throw new Error("Failed to send reset OTP email");
  }
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 3600000,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res
    .status(200)
    .json({ message: "Reset OTP sent to email", userId: user._id, token });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { userId, resetOtp, password } = req.body;
  if (!userId || !resetOtp || !password) {
    res.status(400);
    throw new Error("User ID, reset OTP, and password are required");
  }
  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  console.log(
    `ResetPassword - userId: ${userId}, input resetOtp: ${resetOtp} (type: ${typeof resetOtp}), stored resetOtp: ${
      user.resetOtp
    } (type: ${typeof user.resetOtp}), resetOtpExpires: ${
      user.resetOtpExpires ? new Date(user.resetOtpExpires) : "null"
    }, current time: ${new Date(Date.now())}`
  );
  if (
    user.resetOtp !== String(resetOtp).trim() ||
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
    maxAge: 3600000,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.status(200).json({ message: "Password reset successful", token });
});

const submitKYC = asyncHandler(async (req, res) => {
  const { userId, fullName, country } = req.body;
  if (!userId || !fullName || !country) {
    return res.status(400).json({
      message: "User ID, full name, and country are required",
      userId: userId || null,
    });
  }
  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({
      message: "Invalid user ID format. Must be a valid 24-character ObjectId",
      userId,
    });
  }
  const [firstName, ...lastNameParts] = fullName.trim().split(" ");
  const lastName = lastNameParts.join(" ") || "";
  const user = await User.findById(userId);
  if (!user) {
    return res.status(400).json({ message: "User not found", userId });
  }
  if (!user.isVerified) {
    return res.status(403).json({
      message: "User must be verified to submit KYC",
      userId,
    });
  }
  if (user.kycLevel >= 1 || user.kycStatus === "pending") {
    return res.status(400).json({
      message: "KYC Level 1 already completed or pending approval",
      userId,
    });
  }
  if (
    !req.files ||
    !req.files.frontImage ||
    !req.files.backImage ||
    !req.files.selfieImage
  ) {
    return res.status(400).json({
      message: "Front, back, and selfie images are required",
      userId,
      receivedFiles: req.files ? Object.keys(req.files) : [],
    });
  }
  const frontImagePath = path
    .join("uploads", req.files.frontImage[0].filename)
    .replace(/\\/g, "/");
  const backImagePath = path
    .join("uploads", req.files.backImage[0].filename)
    .replace(/\\/g, "/");
  const selfieImagePath = path
    .join("uploads", req.files.selfieImage[0].filename)
    .replace(/\\/g, "/");
  user.cnicImages = {
    front: frontImagePath,
    back: backImagePath,
  };
  user.selfieImage = selfieImagePath;
  user.country = country;
  user.kycStatus = "pending";
  user.kycLevel = 0;
  user.firstName = firstName;
  user.lastName = lastName;
  await user.save();
  res.status(200).json({
    message: "KYC Level 1 submitted and pending admin approval",
    userId,
  });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    maxAge: 0,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.status(200).json({ message: "Logged out successfully" });
});

const resendOtp = asyncHandler(async (req, res) => {
  let { email } = req.body;
  if (!email) {
    res.status(400);
    throw new Error("Email is required");
  }
  email = email.trim().toLowerCase();
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
  try {
    await sendOTPEmail(email, newOtp, "account verification");
    console.log(`Resend OTP email sent to ${email}`);
  } catch (error) {
    console.error(
      `Failed to send resend OTP email to ${email}:`,
      error.message
    );
    res.status(500);
    throw new Error("Failed to send resend OTP email");
  }
  res.status(200).json({ message: "New OTP sent successfully" });
});

const getReferralLink = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  const referralLink = `${process.env.APP_URL}/signup?ref=${user.username}`;
  res.status(200).json({
    message: "Referral link generated successfully",
    referralLink,
  });
});

async function updateReferralTree(newUserId, sponsorIdentifier) {
  const newUser = await User.findById(newUserId);
  if (!newUser) return;

  const sponsor = await User.findOne({
    $or: [{ sponsorId: sponsorIdentifier }, { username: sponsorIdentifier }],
  }).select("directReferrals sponsorTree");
  if (!sponsor) {
    console.error(
      `Sponsor not found with sponsorId or username: ${sponsorIdentifier}`
    );
    return;
  }

  if (!sponsor.directReferrals.includes(newUserId)) {
    sponsor.directReferrals.push(newUserId);
  }
  if (!sponsor.sponsorTree.includes(newUserId)) {
    sponsor.sponsorTree.push(newUserId);
  }
  await sponsor.save();
  await updateAllLevels(sponsor._id);
}

async function computeNextLevels(user) {
  const visited = new Set([user._id.toString()]);
  const toObjectId = (id) =>
    id instanceof mongoose.Types.ObjectId
      ? id
      : new mongoose.Types.ObjectId(id);

  let current = Array.isArray(user.directReferrals)
    ? Array.from(new Set(user.directReferrals.map((id) => id.toString())))
    : [];
  const levels = [];
  if (current.length > 0) {
    levels.push(current.map(toObjectId));
  }
  while (current.length > 0) {
    current.forEach((id) => visited.add(id));
    const docs = await User.find(
      { _id: { $in: current.map((id) => new mongoose.Types.ObjectId(id)) } },
      { _id: 1, directReferrals: 1 }
    ).lean();
    let nextIds = [];
    for (const doc of docs) {
      if (
        Array.isArray(doc.directReferrals) &&
        doc.directReferrals.length > 0
      ) {
        nextIds.push(...doc.directReferrals.map((id) => id.toString()));
      }
    }
    nextIds = Array.from(new Set(nextIds)).filter((id) => !visited.has(id));
    if (nextIds.length === 0) break;
    levels.push(nextIds.map(toObjectId));
    current = nextIds;
  }
  return levels;
}

async function updateUserNextLevels(user) {
  const levels = await computeNextLevels(user);
  user.nextLevels = levels;
  user.directReferrals = levels[0] || user.directReferrals || [];
  user.level2Referrals = levels[1] || [];
  user.level3Referrals = levels[2] || [];
  user.level4Referrals = levels[3] || [];
  await user.save();
}

async function updateAllLevels(userId) {
  const user = await User.findById(userId);
  if (!user) return;

  await updateUserNextLevels(user);
  await checkAndUpdateUserLevel(user);

  if (user.sponsorBy) {
    const parentSponsor = await User.findOne({
      $or: [{ sponsorId: user.sponsorBy }, { username: user.sponsorBy }],
    });
    if (parentSponsor) {
      await updateAllLevels(parentSponsor._id);
    }
  }
}

async function updateLevel2Referrals(user) {
  user.level2Referrals = [];
  for (const directReferralId of user.directReferrals) {
    const directReferral = await User.findById(directReferralId);
    if (directReferral && directReferral.directReferrals.length > 0) {
      user.level2Referrals.push(...directReferral.directReferrals);
    }
  }
  await user.save();
}

async function updateLevel3Referrals(user) {
  user.level3Referrals = [];
  for (const level2ReferralId of user.level2Referrals) {
    const level2Referral = await User.findById(level2ReferralId);
    if (level2Referral && level2Referral.directReferrals.length > 0) {
      user.level3Referrals.push(...level2Referral.directReferrals);
    }
  }
  await user.save();
}

async function updateLevel4Referrals(user) {
  user.level4Referrals = [];
  for (const level3ReferralId of user.level3Referrals) {
    const level3Referral = await User.findById(level3ReferralId);
    if (level3Referral && level3Referral.directReferrals.length > 0) {
      user.level4Referrals.push(...level3Referral.directReferrals);
    }
  }
  await user.save();
}

async function checkAndUpdateUserLevel(user) {
  const levels = Array.isArray(user.nextLevels) ? user.nextLevels : [];
  if (levels.length === 0) {
    if (
      Array.isArray(user.directReferrals) &&
      user.directReferrals.length > 0
    ) {
      await updateUserNextLevels(user);
    }
  }
  const effectiveLevels = Array.isArray(user.nextLevels) ? user.nextLevels : [];
  const threshold = 3;
  let newLevel = 0;
  for (let i = 0; i < effectiveLevels.length; i++) {
    const ids = effectiveLevels[i] || [];
    if (ids.length >= threshold) {
      newLevel = i + 1;
    } else {
      break;
    }
  }
  if (newLevel !== user.level) {
    user.level = newLevel;
    await user.save();
  }
}

const getReferralTree = asyncHandler(async (req, res) => {
  const targetUserId = req.query.userId || req.user._id;
  const user = await User.findById(targetUserId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (!Array.isArray(user.nextLevels) || user.nextLevels.length === 0) {
    await updateUserNextLevels(user);
  }
  const levelsIds = Array.isArray(user.nextLevels) ? user.nextLevels : [];
  const allReferralIds = levelsIds.flat();
  const dynamicCounts = {};
  for (let i = 0; i < levelsIds.length; i++) {
    dynamicCounts[`level${i + 1}`] = levelsIds[i]?.length || 0;
  }
  const dynamicTotal = Object.values(dynamicCounts).reduce((a, b) => a + b, 0);
  const stats = {
    level1: dynamicCounts.level1 || 0,
    level2: dynamicCounts.level2 || 0,
    level3: dynamicCounts.level3 || 0,
    level4: dynamicCounts.level4 || 0,
    totalReferrals: dynamicTotal,
  };
  const userQualificationStats = user.getQualificationPointsStats();

  const referralTree = {
    user: {
      id: user._id,
      username: user.username,
      name: `${user.firstName}${user.lastName ? " " + user.lastName : ""}`,
      email: user.email,
      sponsorId: user.sponsorId,
      level: user.level,
      sponsorBy: user.sponsorBy,
      kycStatus: user.kycStatus,
      country: user.country,
      qualificationPoints: {
        pgp: {
          monthly: userQualificationStats.pgp.monthly,
          accumulated: userQualificationStats.pgp.accumulated,
        },
        tgp: {
          monthly: userQualificationStats.tgp.monthly,
          accumulated: userQualificationStats.tgp.accumulated,
        },
        total: {
          monthly: userQualificationStats.total.monthly,
          accumulated: userQualificationStats.total.accumulated,
        },
      },
      crrRank: {
        current: user.crrRank.current || "None",
        lastUpdated: user.crrRank.lastUpdated,
        rewardAmount: user.crrRank.rewardAmount || 0,
        rewardClaimed: user.crrRank.rewardClaimed || false,
      },
    },
    counts: {
      totalReferrals: stats.totalReferrals,
      level1: stats.level1,
      level2: stats.level2,
      level3: stats.level3,
      level4: stats.level4,
    },
    members: {
      level1: [],
      level2: [],
      level3: [],
      level4: [],
    },
    levels: {
      counts: dynamicCounts,
      members: {},
    },
  };
  if (allReferralIds.length === 0) {
    res.status(200).json({
      message: "Referral tree retrieved successfully",
      referralTree,
    });
    return;
  }
  const existingMembers = await User.aggregate([
    {
      $match: {
        _id: {
          $in: allReferralIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
      },
    },
    {
      $project: {
        _id: 0,
        id: "$_id",
        username: "$username",
        name: {
          $concat: [
            "$firstName",
            {
              $cond: {
                if: "$lastName",
                then: { $concat: [" ", "$lastName"] },
                else: "",
              },
            },
          ],
        },
        email: 1,
        sponsorId: 1,
        level: 1,
        kycLevel: 1,
        role: 1,
        joinedDate: "$createdAt",
        qualificationPoints: {
          pgp: {
            monthly: "$qualificationPoints.pgp.monthly",
            accumulated: "$qualificationPoints.pgp.accumulated",
          },
          tgp: {
            monthly: "$qualificationPoints.tgp.monthly",
            accumulated: "$qualificationPoints.tgp.accumulated",
          },
          total: {
            monthly: {
              $add: [
                { $ifNull: ["$qualificationPoints.pgp.monthly", 0] },
                { $ifNull: ["$qualificationPoints.tgp.monthly", 0] },
              ],
            },
            accumulated: {
              $add: [
                { $ifNull: ["$qualificationPoints.pgp.accumulated", 0] },
                { $ifNull: ["$qualificationPoints.tgp.accumulated", 0] },
              ],
            },
          },
        },
        crrRank: {
          current: "$crrRank.current",
          lastUpdated: "$crrRank.lastUpdated",
          rewardAmount: "$crrRank.rewardAmount",
          rewardClaimed: "$crrRank.rewardClaimed",
        },
      },
    },
    {
      $sort: { joinedDate: -1 },
    },
  ]);
  const membersMap = new Map();
  existingMembers.forEach((member) => {
    membersMap.set(member.id.toString(), member);
  });
  const processLevel = (referralIds, levelKey) => {
    const existingMembersInLevel = [];
    referralIds.forEach((id) => {
      const member = membersMap.get(id.toString());
      if (member) {
        existingMembersInLevel.push(member);
      }
    });
    referralTree.members[levelKey] = existingMembersInLevel;
    referralTree.counts[levelKey] = existingMembersInLevel.length;
  };
  processLevel(levelsIds[0] || [], "level1");
  processLevel(levelsIds[1] || [], "level2");
  processLevel(levelsIds[2] || [], "level3");
  processLevel(levelsIds[3] || [], "level4");
  referralTree.counts.totalReferrals = Object.values(dynamicCounts).reduce(
    (a, b) => a + b,
    0
  );

  for (let i = 0; i < levelsIds.length; i++) {
    const key = `level${i + 1}`;
    const ids = levelsIds[i] || [];
    const membersArr = [];
    ids.forEach((id) => {
      const m = membersMap.get(id.toString());
      if (m) membersArr.push(m);
    });
    referralTree.levels.members[key] = membersArr;
  }
  res.status(200).json({
    message: "Referral tree retrieved successfully",
    referralTree,
  });
});

const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find(
    {},
    {
      username: 1,
      firstName: 1,
      lastName: 1,
      email: 1,
      sponsorId: 1,
      sponsorBy: 1,
      level: 1,
      kycLevel: 1,
      kycStatus: 1,
      role: 1,
      country: 1,
      createdAt: 1,
    }
  ).sort({ createdAt: -1 });
  res.status(200).json({
    message: "All users retrieved successfully",
    users: users.map((user) => ({
      ...user._doc,
      lastName: user.lastName || "",
    })),
    totalUsers: users.length,
  });
});

const fixReferralRelationships = asyncHandler(async (req, res) => {
  const usersWithSponsors = await User.find({
    sponsorBy: { $exists: true, $ne: null },
  });
  let fixedCount = 0;
  let errorCount = 0;
  for (const user of usersWithSponsors) {
    try {
      if (user.sponsorBy) {
        const sponsor = await User.findOne({
          $or: [{ sponsorId: user.sponsorBy }, { username: user.sponsorBy }],
        }).select("directReferrals sponsorTree");
        if (sponsor) {
          if (!sponsor.directReferrals.includes(user._id)) {
            sponsor.directReferrals.push(user._id);
          }
          if (!sponsor.sponsorTree.includes(user._id)) {
            sponsor.sponsorTree.push(user._id);
          }
          await sponsor.save();
          fixedCount++;
        } else {
          errorCount++;
        }
      }
    } catch (error) {
      errorCount++;
    }
  }
  const allUsers = await User.find({});
  for (const user of allUsers) {
    await updateAllLevels(user._id);
  }
  res.status(200).json({
    message: "Referral relationships fixed successfully",
    fixedCount,
    errorCount,
    totalUsersProcessed: usersWithSponsors.length,
  });
});

const approveKYC = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  const user = await User.findById(userId)
    .select("kycLevel kycStatus pendingVehicleData licenseImage") // Include licenseImage
    .populate("pendingVehicleData");
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  let kycLevelToApprove;
  if (user.kycLevel === 0 && user.kycStatus === "pending") {
    kycLevelToApprove = 1;
  } else if (
    user.kycLevel === 1 &&
    user.kycStatus === "pending" &&
    user.licenseImage
  ) {
    kycLevelToApprove = 2;
  } else {
    res.status(400);
    throw new Error(
      user.kycLevel === 1 && !user.licenseImage
        ? "License must be uploaded before approving KYC Level 2"
        : "No valid KYC level to approve or KYC already approved"
    );
  }
  if (kycLevelToApprove === 2 && user.pendingVehicleData) {
    // If a vehicle is registered, auto-approve it
    const vehicle = await Vehicle.findById(user.pendingVehicleData);
    if (vehicle) {
      vehicle.status = "approved";
      await vehicle.save();
    }
  }
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      kycLevel: kycLevelToApprove,
      kycStatus: "approved",
      role: kycLevelToApprove === 2 ? "driver" : "customer",
    },
    { new: true, runValidators: true }
  );
  if (!updatedUser) {
    res.status(400);
    throw new Error("Failed to update KYC status.");
  }
  try {
    await sendKYCApprovalEmail(
      updatedUser.email,
      kycLevelToApprove,
      `${updatedUser.firstName} ${updatedUser.lastName || ""}`.trim()
    );
    console.log(`KYC approval email sent to ${updatedUser.email}`);
  } catch (error) {
    console.error(
      `Failed to send KYC approval email to ${updatedUser.email}:`,
      error.message
    );
    res.status(500);
    throw new Error("Failed to send KYC approval email");
  }
  res.status(200).json({
    message: `KYC Level ${kycLevelToApprove} approved successfully`,
    userId,
    kycLevel: kycLevelToApprove,
    kycStatus: updatedUser.kycStatus,
  });
});

const rejectKYC = asyncHandler(async (req, res) => {
  const { userId, reason } = req.body;
  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }
  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (user.kycStatus !== "pending") {
    res.status(400);
    throw new Error("No pending KYC submission for this user");
  }
  user.kycStatus = "rejected";
  await user.save();
  try {
    await sendKYCRejectionEmail(
      user.email,
      reason,
      `${user.firstName} ${user.lastName || ""}`.trim()
    );
    console.log(`KYC rejection email sent to ${user.email}`);
  } catch (error) {
    console.error(
      `Failed to send KYC rejection email to ${user.email}:`,
      error.message
    );
    res.status(500);
    throw new Error("Failed to send KYC rejection email");
  }
  res.status(200).json({
    message: "KYC submission rejected",
    userId,
    reason: reason || "No reason provided",
  });
});

const getPendingKYCs = asyncHandler(async (req, res) => {
  const pendingUsers = await User.find({ kycStatus: "pending" })
    .select(
      "username firstName lastName email country kycLevel kycStatus cnicImages selfieImage licenseImage hasVehicle pendingVehicleData"
    )
    .populate("pendingVehicleData");
  const kycDetails = await Promise.all(
    pendingUsers.map(async (user) => {
      return {
        userId: user._id,
        username: user.username,
        name: `${user.firstName}${user.lastName ? " " + user.lastName : ""}`,
        email: user.email,
        country: user.country,
        kycLevel: user.kycLevel,
        kycStatus: user.kycStatus,
        cnicImages: user.cnicImages,
        selfieImage: user.selfieImage,
        licenseImage: user.licenseImage,
        hasVehicle: user.hasVehicle,
        vehicleData: user.pendingVehicleData
          ? {
              vehicleRegistrationCard:
                user.pendingVehicleData.vehicleRegistrationCard,
              roadAuthorityCertificate:
                user.pendingVehicleData.roadAuthorityCertificate,
              insuranceCertificate:
                user.pendingVehicleData.insuranceCertificate,
              vehicleImages: user.pendingVehicleData.vehicleImages,
              vehicleOwnerName: user.pendingVehicleData.vehicleOwnerName,
              companyName: user.pendingVehicleData.companyName,
              vehiclePlateNumber: user.pendingVehicleData.vehiclePlateNumber,
              vehicleMakeModel: user.pendingVehicleData.vehicleMakeModel,
              chassisNumber: user.pendingVehicleData.chassisNumber,
              vehicleColor: user.pendingVehicleData.vehicleColor,
              registrationExpiryDate:
                user.pendingVehicleData.registrationExpiryDate,
              vehicleType: user.pendingVehicleData.vehicleType,
              wheelchair: user.pendingVehicleData.wheelchair,
            }
          : null,
      };
    })
  );
  res.status(200).json({
    message: "Pending KYC submissions retrieved successfully",
    kycDetails,
    totalPending: kycDetails.length,
  });
});

const getUserByUsername = asyncHandler(async (req, res) => {
  const { username } = req.query;

  if (!username) {
    res.status(400);
    throw new Error("Username is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { sponsorId: username }],
  }).select("firstName lastName");

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  res.status(200).json({
    user: {
      firstName: user.firstName,
      lastName: user.lastName || "",
    },
  });
});

const setVehicleOwnership = asyncHandler(async (req, res) => {
  const { hasVehicle } = req.body;
  const userId = req.user._id;

  if (hasVehicle === undefined) {
    res.status(400);
    throw new Error("hasVehicle field is required");
  }

  if (!["yes", "no"].includes(hasVehicle)) {
    res.status(400);
    throw new Error("hasVehicle must be either 'yes' or 'no'");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { hasVehicle },
    { new: true, runValidators: true }
  );

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  res.status(200).json({
    success: true,
    message: "Vehicle ownership status updated successfully",
    hasVehicle: user.hasVehicle,
  });
});

const addPinnedDriver = asyncHandler(async (req, res) => {
  const { driverId } = req.body;
  const userId = req.user._id;

  if (!driverId) {
    res.status(400);
    throw new Error("Driver ID is required");
  }

  const driver = await User.findById(driverId);
  if (!driver || driver.role !== "driver") {
    res.status(404);
    throw new Error("Driver not found");
  }

  const user = await User.findById(userId);
  if (!user.pinnedDrivers) {
    user.pinnedDrivers = [];
  }

  if (!user.pinnedDrivers.includes(driverId)) {
    user.pinnedDrivers.push(driverId);
    await user.save();
  }

  res.status(200).json({
    success: true,
    message: "Driver added to pinned drivers successfully",
    pinnedDrivers: user.pinnedDrivers,
  });
});

const removePinnedDriver = asyncHandler(async (req, res) => {
  const { driverId } = req.params;
  const userId = req.user._id;

  const user = await User.findById(userId);
  if (!user.pinnedDrivers) {
    user.pinnedDrivers = [];
  }

  user.pinnedDrivers = user.pinnedDrivers.filter(
    (id) => id.toString() !== driverId
  );
  await user.save();

  res.status(200).json({
    success: true,
    message: "Driver removed from pinned drivers successfully",
    pinnedDrivers: user.pinnedDrivers,
  });
});

const getPinnedDrivers = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId)
    .select("pinnedDrivers")
    .populate("pinnedDrivers", "firstName lastName phoneNumber vehicleDetails");

  res.status(200).json({
    success: true,
    message: "Pinned drivers retrieved successfully",
    pinnedDrivers: user.pinnedDrivers || [],
  });
});

const addFavoriteDriver = asyncHandler(async (req, res) => {
  const { driverId } = req.body;
  const userId = req.user._id;

  if (!driverId) {
    res.status(400);
    throw new Error("Driver ID is required");
  }

  const driver = await User.findById(driverId);
  if (!driver || driver.role !== "driver") {
    res.status(404);
    throw new Error("Driver not found");
  }

  const user = await User.findById(userId);
  if (!user.favoriteDrivers) {
    user.favoriteDrivers = [];
  }

  if (!user.favoriteDrivers.includes(driverId)) {
    user.favoriteDrivers.push(driverId);
    await user.save();
  }

  res.status(200).json({
    success: true,
    message: "Driver added to favorite drivers successfully",
    favoriteDrivers: user.favoriteDrivers,
  });
});

const removeFavoriteDriver = asyncHandler(async (req, res) => {
  const { driverId } = req.params;
  const userId = req.user._id;

  const user = await User.findById(userId);
  if (!user.favoriteDrivers) {
    user.favoriteDrivers = [];
  }

  user.favoriteDrivers = user.favoriteDrivers.filter(
    (id) => id.toString() !== driverId
  );
  await user.save();

  res.status(200).json({
    success: true,
    message: "Driver removed from favorite drivers successfully",
    favoriteDrivers: user.favoriteDrivers,
  });
});

const getFavoriteDrivers = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId)
    .select("favoriteDrivers")
    .populate(
      "favoriteDrivers",
      "firstName lastName phoneNumber vehicleDetails"
    );

  res.status(200).json({
    success: true,
    message: "Favorite drivers retrieved successfully",
    favoriteDrivers: user.favoriteDrivers || [],
  });
});

const getNearbyDriversForUser = asyncHandler(async (req, res) => {
  const { latitude, longitude, radius = 10, serviceType } = req.query;
  const userId = req.user._id;

  if (!latitude || !longitude) {
    res.status(400);
    throw new Error("Latitude and longitude are required");
  }

  const user = await User.findById(userId);
  const pinnedDrivers = user.pinnedDrivers || [];
  const favoriteDrivers = user.favoriteDrivers || [];

  const nearbyDrivers = await User.find({
    role: "driver",
    isOnline: true,
    "location.coordinates": {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [parseFloat(longitude), parseFloat(latitude)],
        },
        $maxDistance: radius * 1000,
      },
    },
  }).populate("vehicleDetails");

  let filteredDrivers = nearbyDrivers;
  if (serviceType) {
    filteredDrivers = nearbyDrivers.filter(
      (driver) =>
        driver.vehicleDetails &&
        driver.vehicleDetails.some(
          (vehicle) => vehicle.serviceType === serviceType
        )
    );
  }

  const prioritizedDrivers = filteredDrivers
    .map((driver) => ({
      ...driver.toObject(),
      isPinned: pinnedDrivers.includes(driver._id.toString()),
      isFavorite: favoriteDrivers.includes(driver._id.toString()),
      priority: pinnedDrivers.includes(driver._id.toString())
        ? 1
        : favoriteDrivers.includes(driver._id.toString())
        ? 2
        : 3,
    }))
    .sort((a, b) => a.priority - b.priority);

  res.status(200).json({
    success: true,
    message: "Nearby drivers retrieved successfully",
    drivers: prioritizedDrivers,
    total: prioritizedDrivers.length,
  });
});

const getQualificationStats = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  await user.checkAndResetMonthlyQualificationPoints();

  const stats = user.getQualificationPointsStats();

  res.status(200).json({
    success: true,
    stats: {
      monthlyPGP: stats.pgp.monthly,
      monthlyTGP: stats.tgp.monthly,
      accumulatedPGP: stats.pgp.accumulated,
      accumulatedTGP: stats.tgp.accumulated,
      totalPoints: stats.total.accumulated,
      monthlyTotal: stats.total.monthly,
      lastResetDate: {
        pgp: stats.pgp.lastResetDate,
        tgp: stats.tgp.lastResetDate,
      },
    },
  });
});

const getQualificationTransactions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { limit = 50 } = req.query;

  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const transactions = user.getQualificationPointsTransactions(parseInt(limit));

  res.status(200).json({
    success: true,
    transactions,
    total: user.qualificationPoints.transactions.length,
  });
});

const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  console.log(`Starting deleteUser for userId: ${userId}`);
  const startTime = Date.now();

  if (!userId) {
    console.log("No userId provided");
    res.status(400);
    throw new Error("User ID is required");
  }

  if (!mongoose.isValidObjectId(userId)) {
    console.log("Invalid userId format:", userId);
    res.status(400);
    throw new Error("Invalid user ID format");
  }

  console.log(`Checking user existence: ${Date.now() - startTime}ms`);
  const user = await User.findById(userId);
  if (!user) {
    console.log("User not found:", userId);
    res.status(404);
    throw new Error("User not found");
  }

  // Prevent deletion of superadmin users
  if (user.role === "superadmin") {
    console.log("Attempted to delete superadmin:", userId);
    res.status(403);
    throw new Error("Cannot delete a superadmin user");
  }

  // Remove user from any sponsor's referral lists
  if (user.sponsorBy) {
    console.log(
      `Fetching sponsor for user.sponsorBy: ${user.sponsorBy}, Time: ${
        Date.now() - startTime
      }ms`
    );
    const sponsor = await User.findOne({
      $or: [{ sponsorId: user.sponsorBy }, { username: user.sponsorBy }],
    });
    if (sponsor) {
      sponsor.directReferrals = sponsor.directReferrals.filter(
        (id) => id.toString() !== userId
      );
      sponsor.sponsorTree = sponsor.sponsorTree.filter(
        (id) => id.toString() !== userId
      );
      await sponsor.save();
      console.log(
        `Sponsor updated: ${sponsor._id}, Time: ${Date.now() - startTime}ms`
      );
      // Temporarily comment out updateAllLevels to test for delays
      // console.log(`Starting updateAllLevels for: ${sponsor._id}, Time: ${Date.now() - startTime}ms`);
      // await updateAllLevels(sponsor._id);
      // console.log(`updateAllLevels completed for: ${sponsor._id}, Time: ${Date.now() - startTime}ms`);
    } else {
      console.log(
        `No sponsor found for: ${user.sponsorBy}, Time: ${
          Date.now() - startTime
        }ms`
      );
    }
  }

  // Delete associated images
  const deleteImage = (imagePath) => {
    if (imagePath) {
      const fullPath = path.join(process.cwd(), imagePath);
      if (fs.existsSync(fullPath)) {
        console.log(
          `Deleting image: ${fullPath}, Time: ${Date.now() - startTime}ms`
        );
        fs.unlinkSync(fullPath);
      } else {
        console.log(
          `Image not found: ${fullPath}, Time: ${Date.now() - startTime}ms`
        );
      }
    }
  };
  console.log(`Starting image deletion, Time: ${Date.now() - startTime}ms`);
  deleteImage(user.cnicImages?.front);
  deleteImage(user.cnicImages?.back);
  deleteImage(user.selfieImage);
  deleteImage(user.licenseImage);
  console.log(`Image deletion completed, Time: ${Date.now() - startTime}ms`);

  // Delete associated vehicle data
  if (user.pendingVehicleData) {
    console.log(
      `Deleting vehicle: ${user.pendingVehicleData}, Time: ${
        Date.now() - startTime
      }ms`
    );
    await Vehicle.findByIdAndDelete(user.pendingVehicleData);
    console.log(`Vehicle deleted, Time: ${Date.now() - startTime}ms`);
  }

  // Delete the user
  console.log(
    `Deleting user from database: ${userId}, Time: ${Date.now() - startTime}ms`
  );
  await User.findByIdAndDelete(userId);
  console.log(
    `User deleted successfully: ${userId}, Total time: ${
      Date.now() - startTime
    }ms`
  );

  res.status(200).json({
    success: true,
    message: "User deleted successfully",
    userId,
  });
});
const editUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const {
    username,
    firstName,
    lastName,
    email,
    phoneNumber,
    gender,
    country,
    role,
    kycLevel,
    kycStatus,
    hasVehicle,
  } = req.body;

  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }

  if (!mongoose.isValidObjectId(userId)) {
    res.status(400);
    throw new Error("Invalid user ID format");
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Prevent editing superadmin users
  if (user.role === "superadmin") {
    res.status(403);
    throw new Error("Cannot edit a superadmin user");
  }

  // Validate input fields
  const errors = {};

  if (username) {
    const existingUsername = await User.findOne({
      username,
      _id: { $ne: userId },
    });
    if (existingUsername) {
      errors.username = "This username is already taken";
    } else if (!/^[a-зA-Я0-9_]+$/.test(username)) {
      errors.username =
        "Username can only contain letters, numbers, and underscores";
    } else if (username.length < 3 || username.length > 30) {
      errors.username = "Username must be between 3 and 30 characters";
    }
  }

  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    const existingEmail = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: userId },
    });
    if (existingEmail) {
      errors.email = "This email is already registered";
    } else if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      errors.email = "Please enter a valid email address";
    }
  }

  if (phoneNumber) {
    const existingPhone = await User.findOne({
      phoneNumber,
      _id: { $ne: userId },
    });
    if (existingPhone) {
      errors.phoneNumber = "This phone number is already registered";
    } else if (phoneNumber.length < 10 || phoneNumber.length > 13) {
      errors.phoneNumber = "Phone number must be between 10 and 13 characters";
    }
  }

  if (gender && !["Male", "Female", "Other"].includes(gender)) {
    errors.gender = "Gender must be Male, Female, or Other";
  }

  if (role && !["customer", "driver", "admin"].includes(role)) {
    errors.role = "Role must be customer, driver, or admin";
  }

  if (kycLevel !== undefined && ![0, 1, 2].includes(Number(kycLevel))) {
    errors.kycLevel = "KYC level must be 0, 1, or 2";
  }

  if (
    kycStatus &&
    !["pending", "approved", "rejected", null].includes(kycStatus)
  ) {
    errors.kycStatus =
      "KYC status must be pending, approved, rejected, or null";
  }

  if (hasVehicle && !["yes", "no", null].includes(hasVehicle)) {
    errors.hasVehicle = "hasVehicle must be yes, no, or null";
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  // Update user fields
  const updateData = {};
  if (username) updateData.username = username;
  if (firstName) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName || "";
  if (email) updateData.email = email.trim().toLowerCase();
  if (phoneNumber) updateData.phoneNumber = phoneNumber;
  if (gender) updateData.gender = gender;
  if (country) updateData.country = country;
  if (role) updateData.role = role;
  if (kycLevel !== undefined) updateData.kycLevel = Number(kycLevel);
  if (kycStatus) updateData.kycStatus = kycStatus;
  if (hasVehicle) updateData.hasVehicle = hasVehicle;

  const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).select(
    "username firstName lastName email phoneNumber gender country role kycLevel kycStatus hasVehicle"
  );

  res.status(200).json({
    success: true,
    message: "User updated successfully",
    user: {
      userId: updatedUser._id,
      username: updatedUser.username,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName || "",
      email: updatedUser.email,
      phoneNumber: updatedUser.phoneNumber,
      gender: updatedUser.gender,
      country: updatedUser.country,
      role: updatedUser.role,
      kycLevel: updatedUser.kycLevel,
      kycStatus: updatedUser.kycStatus,
      hasVehicle: updatedUser.hasVehicle,
    },
  });
});

const editDriver = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const {
    username,
    firstName,
    lastName,
    email,
    phoneNumber,
    gender,
    country,
    kycLevel,
    kycStatus,
    hasVehicle,
    driverSettings,
    vehicleOwnerName,
    companyName,
    vehiclePlateNumber,
    vehicleMakeModel,
    chassisNumber,
    vehicleColor,
    registrationExpiryDate,
    vehicleType,
    serviceType,
    serviceCategory,
    wheelchair,
    packingHelper,
    loadingUnloadingHelper,
    fixingHelper,
  } = req.body;

  if (!userId) {
    res.status(400);
    throw new Error("User ID is required");
  }

  if (!mongoose.isValidObjectId(userId)) {
    res.status(400);
    throw new Error("Invalid user ID format");
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (user.role !== "driver") {
    res.status(403);
    throw new Error("User must be a driver to edit driver details");
  }

  if (user.role === "superadmin") {
    res.status(403);
    throw new Error("Cannot edit a superadmin user");
  }

  // Validate input fields
  const errors = {};

  if (username) {
    const existingUsername = await User.findOne({
      username,
      _id: { $ne: userId },
    });
    if (existingUsername) {
      errors.username = "This username is already taken";
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      errors.username =
        "Username can only contain letters, numbers, and underscores";
    } else if (username.length < 3 || username.length > 30) {
      errors.username = "Username must be between 3 and 30 characters";
    }
  }

  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    const existingEmail = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: userId },
    });
    if (existingEmail) {
      errors.email = "This email is already registered";
    } else if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      errors.email = "Please enter a valid email address";
    }
  }

  if (phoneNumber) {
    const existingPhone = await User.findOne({
      phoneNumber,
      _id: { $ne: userId },
    });
    if (existingPhone) {
      errors.phoneNumber = "This phone number is already registered";
    } else if (phoneNumber.length < 10 || phoneNumber.length > 13) {
      errors.phoneNumber = "Phone number must be between 10 and 13 characters";
    }
  }

  if (gender && !["Male", "Female", "Other"].includes(gender)) {
    errors.gender = "Gender must be Male, Female, or Other";
  }

  if (kycLevel !== undefined && ![0, 1, 2].includes(Number(kycLevel))) {
    errors.kycLevel = "KYC level must be 0, 1, or 2";
  }

  if (
    kycStatus &&
    !["pending", "approved", "rejected", null].includes(kycStatus)
  ) {
    errors.kycStatus =
      "KYC status must be pending, approved, rejected, or null";
  }

  if (hasVehicle && !["yes", "no", null].includes(hasVehicle)) {
    errors.hasVehicle = "hasVehicle must be yes, no, or null";
  }

  // Validate driverSettings if provided
  if (driverSettings) {
    if (typeof driverSettings !== "object") {
      errors.driverSettings = "driverSettings must be an object";
    } else {
      if (
        driverSettings.autoAccept &&
        typeof driverSettings.autoAccept !== "object"
      ) {
        errors.autoAccept = "autoAccept must be an object";
      } else if (
        driverSettings.autoAccept &&
        typeof driverSettings.autoAccept.enabled !== "boolean"
      ) {
        errors.autoAcceptEnabled = "autoAccept.enabled must be a boolean";
      }

      if (
        driverSettings.ridePreferences &&
        typeof driverSettings.ridePreferences !== "object"
      ) {
        errors.ridePreferences = "ridePreferences must be an object";
      } else if (
        driverSettings.ridePreferences &&
        typeof driverSettings.ridePreferences.pinkCaptainMode !== "boolean"
      ) {
        errors.pinkCaptainMode =
          "ridePreferences.pinkCaptainMode must be a boolean";
      }
    }
  }

  // Validate vehicle-related fields
  if (vehiclePlateNumber) {
    const existingVehicle = await Vehicle.findOne({
      vehiclePlateNumber,
      _id: { $ne: user.pendingVehicleData },
    });
    if (existingVehicle) {
      errors.vehiclePlateNumber =
        "This vehicle plate number is already registered";
    }
  }

  if (chassisNumber) {
    const existingVehicle = await Vehicle.findOne({
      chassisNumber,
      _id: { $ne: user.pendingVehicleData },
    });
    if (existingVehicle) {
      errors.chassisNumber = "This chassis number is already registered";
    }
  }

  if (wheelchair !== undefined && typeof wheelchair !== "boolean") {
    errors.wheelchair = "wheelchair must be a boolean";
  }

  if (packingHelper !== undefined && typeof packingHelper !== "boolean") {
    errors.packingHelper = "packingHelper must be a boolean";
  }

  if (
    loadingUnloadingHelper !== undefined &&
    typeof loadingUnloadingHelper !== "boolean"
  ) {
    errors.loadingUnloadingHelper = "loadingUnloadingHelper must be a boolean";
  }

  if (fixingHelper !== undefined && typeof fixingHelper !== "boolean") {
    errors.fixingHelper = "fixingHelper must be a boolean";
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  // Handle file uploads
  let licenseImagePath = user.licenseImage;
  let vehicleRegistrationCardPath = null;
  let roadAuthorityCertificatePath = null;
  let insuranceCertificatePath = null;
  let vehicleImagesPaths = [];

  if (req.files) {
    if (req.files.licenseImage) {
      licenseImagePath = path
        .join("uploads", req.files.licenseImage[0].filename)
        .replace(/\\/g, "/");
    }
    if (req.files.vehicleRegistrationCard) {
      vehicleRegistrationCardPath = path
        .join("uploads", req.files.vehicleRegistrationCard[0].filename)
        .replace(/\\/g, "/");
    }
    if (req.files.roadAuthorityCertificate) {
      roadAuthorityCertificatePath = path
        .join("uploads", req.files.roadAuthorityCertificate[0].filename)
        .replace(/\\/g, "/");
    }
    if (req.files.insuranceCertificate) {
      insuranceCertificatePath = path
        .join("uploads", req.files.insuranceCertificate[0].filename)
        .replace(/\\/g, "/");
    }
    if (req.files.vehicleImages) {
      vehicleImagesPaths = req.files.vehicleImages.map((file) =>
        path.join("uploads", file.filename).replace(/\\/g, "/")
      );
    }
  }

  // Update or create vehicle data
  let vehicle = null;
  if (
    vehicleOwnerName ||
    companyName ||
    vehiclePlateNumber ||
    vehicleMakeModel ||
    chassisNumber ||
    vehicleColor ||
    registrationExpiryDate ||
    vehicleType ||
    serviceType ||
    serviceCategory ||
    wheelchair !== undefined ||
    packingHelper !== undefined ||
    loadingUnloadingHelper !== undefined ||
    fixingHelper !== undefined ||
    vehicleRegistrationCardPath ||
    roadAuthorityCertificatePath ||
    insuranceCertificatePath ||
    vehicleImagesPaths.length > 0
  ) {
    const vehicleData = {
      vehicleOwnerName: vehicleOwnerName || "",
      companyName: companyName || "",
      vehiclePlateNumber: vehiclePlateNumber || "",
      vehicleMakeModel: vehicleMakeModel || "",
      chassisNumber: chassisNumber || "",
      vehicleColor: vehicleColor || "",
      registrationExpiryDate: registrationExpiryDate
        ? new Date(registrationExpiryDate)
        : undefined,
      vehicleType: vehicleType || "",
      serviceType: serviceType || "",
      serviceCategory: serviceCategory || "",
      wheelchair: wheelchair !== undefined ? wheelchair : false,
      packingHelper: packingHelper !== undefined ? packingHelper : false,
      loadingUnloadingHelper:
        loadingUnloadingHelper !== undefined ? loadingUnloadingHelper : false,
      fixingHelper: fixingHelper !== undefined ? fixingHelper : false,
      vehicleRegistrationCard: vehicleRegistrationCardPath || "",
      roadAuthorityCertificate: roadAuthorityCertificatePath || "",
      insuranceCertificate: insuranceCertificatePath || "",
      vehicleImages: vehicleImagesPaths.length > 0 ? vehicleImagesPaths : [],
    };

    if (user.pendingVehicleData) {
      vehicle = await Vehicle.findByIdAndUpdate(
        user.pendingVehicleData,
        vehicleData,
        { new: true, runValidators: true }
      );
    } else {
      vehicle = await Vehicle.create(vehicleData);
      user.pendingVehicleData = vehicle._id;
    }
  }

  // Update user fields
  const updateData = {};
  if (username) updateData.username = username;
  if (firstName) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName || "";
  if (email) updateData.email = email.trim().toLowerCase();
  if (phoneNumber) updateData.phoneNumber = phoneNumber;
  if (gender) updateData.gender = gender;
  if (country) updateData.country = country;
  if (kycLevel !== undefined) updateData.kycLevel = Number(kycLevel);
  if (kycStatus) updateData.kycStatus = kycStatus;
  if (hasVehicle) updateData.hasVehicle = hasVehicle;
  if (driverSettings) updateData.driverSettings = driverSettings;
  if (licenseImagePath) updateData.licenseImage = licenseImagePath;

  const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  })
    .select(
      "username firstName lastName email phoneNumber gender country role kycLevel kycStatus hasVehicle licenseImage driverSettings pendingVehicleData"
    )
    .populate({
      path: "pendingVehicleData",
      select:
        "vehicleOwnerName companyName vehiclePlateNumber vehicleMakeModel chassisNumber vehicleColor registrationExpiryDate vehicleType serviceType serviceCategory wheelchair packingHelper loadingUnloadingHelper fixingHelper vehicleRegistrationCard roadAuthorityCertificate insuranceCertificate vehicleImages",
    });

  res.status(200).json({
    success: true,
    message: "Driver updated successfully",
    user: {
      userId: updatedUser._id,
      username: updatedUser.username,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName || "",
      email: updatedUser.email,
      phoneNumber: updatedUser.phoneNumber,
      gender: updatedUser.gender,
      country: updatedUser.country,
      role: updatedUser.role,
      kycLevel: updatedUser.kycLevel,
      kycStatus: updatedUser.kycStatus,
      hasVehicle: updatedUser.hasVehicle,
      licenseImage: updatedUser.licenseImage,
      driverSettings: updatedUser.driverSettings,
      vehicle: updatedUser.pendingVehicleData || null,
    },
  });
});

const getAllCustomers = asyncHandler(async (req, res) => {
  const customers = await User.find({
    role: "customer",
    kycLevel: 1,
  })
    .select(
      "username firstName lastName email phoneNumber gender country kycLevel kycStatus hasVehicle createdAt cnicImages selfieImage"
    )
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    message: "All customers retrieved successfully",
    customers: customers.map((customer) => ({
      ...customer._doc,
      lastName: customer.lastName || "",
    })),
    totalCustomers: customers.length,
  });
});

const getAllDrivers = asyncHandler(async (req, res) => {
  const drivers = await User.find({
    role: "driver",
  })
    .select(
      "username firstName lastName email phoneNumber gender country kycLevel kycStatus hasVehicle createdAt cnicImages selfieImage"
    )
    .populate({
      path: "pendingVehicleData",
      select:
        "vehicleOwnerName companyName vehiclePlateNumber vehicleMakeModel chassisNumber vehicleColor registrationExpiryDate vehicleType serviceType serviceCategory wheelchair packingHelper loadingUnloadingHelper fixingHelper vehicleRegistrationCard roadAuthorityCertificate insuranceCertificate vehicleImages",
    })
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    message: "All drivers retrieved successfully",
    drivers: drivers.map((driver) => ({
      ...driver._doc,
      lastName: driver.lastName || "",
      vehicle: driver.pendingVehicleData || null,
    })),
    totalDrivers: drivers.length,
  });
});

const addAdmin = asyncHandler(async (req, res) => {
  const { username, firstName, email, phoneNumber, password, permissions } = req.body;

  if (!username || !firstName || !email || !phoneNumber || !password || !permissions) {
    res.status(400);
    throw new Error('All fields are required');
  }

  const requestingUser = await User.findById(req.user._id);
  if (!requestingUser || requestingUser.role !== 'superadmin') {
    res.status(403);
    throw new Error('Only superadmins can add admins');
  }

  const errors = {};

  const existingUsername = await User.findOne({ username });
  if (existingUsername) {
    errors.username = 'This username is already taken';
  } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.username = 'Username can only contain letters, numbers, and underscores';
  } else if (username.length < 3 || username.length > 30) {
    errors.username = 'Username must be between 3 and 30 characters';
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingEmail = await User.findOne({ email: normalizedEmail });
  if (existingEmail) {
    errors.email = 'This email is already registered';
  }

  const existingPhone = await User.findOne({ phoneNumber });
  if (existingPhone) {
    errors.phoneNumber = 'This phone number is already registered';
  }

  if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters long';
  }

  const validPermissions = [
    'mlm', 'home', 'dispatch', 'drivermanagement', 'customermanagement',
    'proposalmanagement', 'overview', 'paymentoverview', 'chatdetail',
    'kycverification', 'reportanalytics', 'reviewandrating', 'adminmanagement',
  ];
  if (!Array.isArray(permissions) || !permissions.every(p => validPermissions.includes(p))) {
    errors.permissions = 'Invalid permissions provided';
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const newAdmin = await User.create({
    username,
    firstName,
    email: normalizedEmail,
    phoneNumber,
    password, // Pass raw password, let middleware hash it
    role: 'admin',
    adminPermissions: permissions,
    isVerified: true,
    referralId: uuidv4(),
  });

  res.status(201).json({
    success: true,
    message: 'Admin created successfully',
    admin: {
      _id: newAdmin._id,
      username: newAdmin.username,
      firstName: newAdmin.firstName,
      email: newAdmin.email,
      phoneNumber: newAdmin.phoneNumber,
      adminPermissions: newAdmin.adminPermissions,
    },
  });
});
const getAdmins = asyncHandler(async (req, res) => {
  const requestingUser = await User.findById(req.user._id);
  if (!requestingUser || requestingUser.role !== 'superadmin') {
    res.status(403);
    throw new Error('Only superadmins can view admins');
  }

  const admins = await User.find({ role: 'admin' })
    .select('username firstName lastName email phoneNumber adminPermissions')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    message: 'Admins retrieved successfully',
    admins,
    totalAdmins: admins.length,
  });
});

const editAdmin = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { username, firstName, email, phoneNumber, permissions } = req.body;

  if (!userId) {
    res.status(400);
    throw new Error('User ID is required');
  }

  const requestingUser = await User.findById(req.user._id);
  if (!requestingUser || requestingUser.role !== 'superadmin') {
    res.status(403);
    throw new Error('Only superadmins can edit admins');
  }

  const admin = await User.findById(userId);
  if (!admin || admin.role !== 'admin') {
    res.status(404);
    throw new Error('Admin not found');
  }

  const errors = {};

  if (username) {
    const existingUsername = await User.findOne({ username, _id: { $ne: userId } });
    if (existingUsername) {
      errors.username = 'This username is already taken';
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      errors.username = 'Username can only contain letters, numbers, and underscores';
    } else if (username.length < 3 || username.length > 30) {
      errors.username = 'Username must be between 3 and 30 characters';
    }
  }

  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    const existingEmail = await User.findOne({ email: normalizedEmail, _id: { $ne: userId } });
    if (existingEmail) {
      errors.email = 'This email is already registered';
    }
  }

  if (phoneNumber) {
    const existingPhone = await User.findOne({ phoneNumber, _id: { $ne: userId } });
    if (existingPhone) {
      errors.phoneNumber = 'This phone number is already registered';
    }
  }

  const validPermissions = [
    'mlm', 'home', 'dispatch', 'drivermanagement', 'customermanagement',
    'proposalmanagement', 'overview', 'paymentoverview', 'chatdetail',
    'kycverification', 'reportanalytics', 'reviewandrating', 'adminmanagement',
  ];
  if (permissions && (!Array.isArray(permissions) || !permissions.every(p => validPermissions.includes(p)))) {
    errors.permissions = 'Invalid permissions provided';
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const updateData = {};
  if (username) updateData.username = username;
  if (firstName) updateData.firstName = firstName;
  if (email) updateData.email = email.trim().toLowerCase();
  if (phoneNumber) updateData.phoneNumber = phoneNumber;
  if (permissions) updateData.adminPermissions = permissions;

  const updatedAdmin = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).select('username firstName email phoneNumber adminPermissions');

  res.status(200).json({
    success: true,
    message: 'Admin updated successfully',
    admin: updatedAdmin,
  });
});

const deleteAdmin = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    res.status(400);
    throw new Error('User ID is required');
  }

  const requestingUser = await User.findById(req.user._id);
  if (!requestingUser || requestingUser.role !== 'superadmin') {
    res.status(403);
    throw new Error('Only superadmins can delete admins');
  }

  const admin = await User.findById(userId);
  if (!admin || admin.role !== 'admin') {
    res.status(404);
    throw new Error('Admin not found');
  }

  await User.findByIdAndDelete(userId);

  res.status(200).json({
    success: true,
    message: 'Admin deleted successfully',
    userId,
  });
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('role adminPermissions');
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  res.status(200).json({
    success: true,
    user: {
      role: user.role,
      adminPermissions: user.adminPermissions,
    },
  });
});

const editProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const {
    username,
    firstName,
    lastName,
    email,
    phoneNumber,
    gender,
    country,
    hasVehicle,
    driverSettings,
    vehicleOwnerName,
    companyName,
    vehiclePlateNumber,
    vehicleMakeModel,
    chassisNumber,
    vehicleColor,
    registrationExpiryDate,
    vehicleType,
    serviceType,
    serviceCategory,
    wheelchair,
    packingHelper,
    loadingUnloadingHelper,
    fixingHelper,
  } = req.body;

  // Ensure the user is editing their own profile
  if (userId !== req.user._id.toString()) {
    res.status(403);
    throw new Error("You can only edit your own profile");
  }

  // Validate userId
  if (!mongoose.isValidObjectId(userId)) {
    res.status(400);
    throw new Error("Invalid user ID format");
  }

  // Find the user
  const user = await User.findById(userId).populate('pendingVehicleData');
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Validation for common fields
  const errors = {};

  if (username) {
    const existingUsername = await User.findOne({
      username,
      _id: { $ne: userId },
    });
    if (existingUsername) {
      errors.username = "This username is already taken";
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      errors.username = "Username can only contain letters, numbers, and underscores";
    } else if (username.length < 3 || username.length > 30) {
      errors.username = "Username must be between 3 and 30 characters";
    }
  }

  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    const existingEmail = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: userId },
    });
    if (existingEmail) {
      errors.email = "This email is already registered";
    } else if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      errors.email = "Please enter a valid email address";
    }
  }

  if (phoneNumber) {
    const existingPhone = await User.findOne({
      phoneNumber,
      _id: { $ne: userId },
    });
    if (existingPhone) {
      errors.phoneNumber = "This phone number is already registered";
    } else if (phoneNumber.length < 10 || phoneNumber.length > 13) {
      errors.phoneNumber = "Phone number must be between 10 and 13 characters";
    }
  }

  if (gender && !["Male", "Female", "Other"].includes(gender)) {
    errors.gender = "Gender must be Male, Female, or Other";
  }

  if (hasVehicle && !["yes", "no", null].includes(hasVehicle)) {
    errors.hasVehicle = "hasVehicle must be yes, no, or null";
  }

  // Driver-specific validation (only if user is a driver OR has vehicle data to update)
  const hasVehicleData = vehicleOwnerName || companyName || vehiclePlateNumber || 
    vehicleMakeModel || chassisNumber || vehicleColor || registrationExpiryDate || 
    vehicleType || serviceType || serviceCategory || wheelchair !== undefined || 
    packingHelper !== undefined || loadingUnloadingHelper !== undefined || 
    fixingHelper !== undefined || (req.files && (req.files.vehicleRegistrationCard || 
    req.files.roadAuthorityCertificate || req.files.insuranceCertificate || 
    req.files.vehicleImages));

  if (hasVehicleData) {
    if (vehiclePlateNumber) {
      const existingVehicle = await Vehicle.findOne({
        vehiclePlateNumber,
        _id: { $ne: user.pendingVehicleData?._id },
      });
      if (existingVehicle) {
        errors.vehiclePlateNumber = "This vehicle plate number is already registered";
      }
    }

    if (chassisNumber) {
      const existingVehicle = await Vehicle.findOne({
        chassisNumber,
        _id: { $ne: user.pendingVehicleData?._id },
      });
      if (existingVehicle) {
        errors.chassisNumber = "This chassis number is already registered";
      }
    }

    if (wheelchair !== undefined && typeof wheelchair !== "boolean") {
      errors.wheelchair = "wheelchair must be a boolean";
    }

    if (packingHelper !== undefined && typeof packingHelper !== "boolean") {
      errors.packingHelper = "packingHelper must be a boolean";
    }

    if (loadingUnloadingHelper !== undefined && typeof loadingUnloadingHelper !== "boolean") {
      errors.loadingUnloadingHelper = "loadingUnloadingHelper must be a boolean";
    }

    if (fixingHelper !== undefined && typeof fixingHelper !== "boolean") {
      errors.fixingHelper = "fixingHelper must be a boolean";
    }
  }

  if (driverSettings && typeof driverSettings !== "object") {
    errors.driverSettings = "driverSettings must be an object";
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  // Helper function to delete old files
  const deleteOldFile = (filePath) => {
    if (filePath && fs.existsSync(path.join(process.cwd(), filePath))) {
      try {
        fs.unlinkSync(path.join(process.cwd(), filePath));
      } catch (error) {
        console.error(`Error deleting file ${filePath}:`, error);
      }
    }
  };

  // Handle file uploads
  let licenseImagePath = user.licenseImage;
  let vehicleRegistrationCardPath = user.pendingVehicleData?.vehicleRegistrationCard;
  let roadAuthorityCertificatePath = user.pendingVehicleData?.roadAuthorityCertificate;
  let insuranceCertificatePath = user.pendingVehicleData?.insuranceCertificate;
  let vehicleImagesPaths = user.pendingVehicleData?.vehicleImages || [];
  let selfieImagePath = user.selfieImage;

  if (req.files) {
    if (req.files.selfieImage) {
      deleteOldFile(user.selfieImage);
      selfieImagePath = path.join("uploads", req.files.selfieImage[0].filename).replace(/\\/g, "/");
    }
    if (req.files.licenseImage) {
      deleteOldFile(user.licenseImage);
      licenseImagePath = path.join("uploads", req.files.licenseImage[0].filename).replace(/\\/g, "/");
    }
    if (req.files.vehicleRegistrationCard) {
      deleteOldFile(user.pendingVehicleData?.vehicleRegistrationCard);
      vehicleRegistrationCardPath = path.join("uploads", req.files.vehicleRegistrationCard[0].filename).replace(/\\/g, "/");
    }
    if (req.files.roadAuthorityCertificate) {
      deleteOldFile(user.pendingVehicleData?.roadAuthorityCertificate);
      roadAuthorityCertificatePath = path.join("uploads", req.files.roadAuthorityCertificate[0].filename).replace(/\\/g, "/");
    }
    if (req.files.insuranceCertificate) {
      deleteOldFile(user.pendingVehicleData?.insuranceCertificate);
      insuranceCertificatePath = path.join("uploads", req.files.insuranceCertificate[0].filename).replace(/\\/g, "/");
    }
    if (req.files.vehicleImages) {
      // Delete old vehicle images
      if (user.pendingVehicleData?.vehicleImages) {
        user.pendingVehicleData.vehicleImages.forEach(deleteOldFile);
      }
      vehicleImagesPaths = req.files.vehicleImages.map((file) =>
        path.join("uploads", file.filename).replace(/\\/g, "/")
      );
    }
  }

  // Update user fields
  const updateData = {};
  if (username) updateData.username = username;
  if (firstName) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName || "";
  if (email) updateData.email = email.trim().toLowerCase();
  if (phoneNumber) updateData.phoneNumber = phoneNumber;
  if (gender) updateData.gender = gender;
  if (country) updateData.country = country;
  if (hasVehicle) updateData.hasVehicle = hasVehicle;
  if (driverSettings) updateData.driverSettings = driverSettings;
  if (licenseImagePath !== user.licenseImage) updateData.licenseImage = licenseImagePath;
  if (selfieImagePath !== user.selfieImage) updateData.selfieImage = selfieImagePath;

  // Update or create vehicle data if vehicle-related fields are provided
  let vehicle = user.pendingVehicleData;
  if (hasVehicleData) {
    const vehicleData = {};
    
    // Only update fields that are provided, preserve existing values
    if (vehicleOwnerName !== undefined) vehicleData.vehicleOwnerName = vehicleOwnerName;
    if (companyName !== undefined) vehicleData.companyName = companyName;
    if (vehiclePlateNumber !== undefined) vehicleData.vehiclePlateNumber = vehiclePlateNumber;
    if (vehicleMakeModel !== undefined) vehicleData.vehicleMakeModel = vehicleMakeModel;
    if (chassisNumber !== undefined) vehicleData.chassisNumber = chassisNumber;
    if (vehicleColor !== undefined) vehicleData.vehicleColor = vehicleColor;
    if (registrationExpiryDate !== undefined) vehicleData.registrationExpiryDate = new Date(registrationExpiryDate);
    if (vehicleType !== undefined) vehicleData.vehicleType = vehicleType;
    if (serviceType !== undefined) vehicleData.serviceType = serviceType;
    if (serviceCategory !== undefined) vehicleData.serviceCategory = serviceCategory;
    if (wheelchair !== undefined) vehicleData.wheelchair = wheelchair;
    if (packingHelper !== undefined) vehicleData.packingHelper = packingHelper;
    if (loadingUnloadingHelper !== undefined) vehicleData.loadingUnloadingHelper = loadingUnloadingHelper;
    if (fixingHelper !== undefined) vehicleData.fixingHelper = fixingHelper;
    
    // Update file paths if new files were uploaded
    if (vehicleRegistrationCardPath !== user.pendingVehicleData?.vehicleRegistrationCard) {
      vehicleData.vehicleRegistrationCard = vehicleRegistrationCardPath;
    }
    if (roadAuthorityCertificatePath !== user.pendingVehicleData?.roadAuthorityCertificate) {
      vehicleData.roadAuthorityCertificate = roadAuthorityCertificatePath;
    }
    if (insuranceCertificatePath !== user.pendingVehicleData?.insuranceCertificate) {
      vehicleData.insuranceCertificate = insuranceCertificatePath;
    }
    if (req.files?.vehicleImages) {
      vehicleData.vehicleImages = vehicleImagesPaths;
    }

    if (vehicle) {
      // Update existing vehicle
      vehicle = await Vehicle.findByIdAndUpdate(
        vehicle._id,
        vehicleData,
        { new: true, runValidators: true }
      );
    } else {
      // Create new vehicle
      vehicle = await Vehicle.create({
        ...vehicleData,
        // Provide defaults for required fields if not provided
        vehicleOwnerName: vehicleData.vehicleOwnerName || "",
        companyName: vehicleData.companyName || "",
        vehiclePlateNumber: vehicleData.vehiclePlateNumber || "",
        vehicleMakeModel: vehicleData.vehicleMakeModel || "",
        chassisNumber: vehicleData.chassisNumber || "",
        vehicleColor: vehicleData.vehicleColor || "",
        vehicleType: vehicleData.vehicleType || "",
        serviceType: vehicleData.serviceType || "",
        serviceCategory: vehicleData.serviceCategory || "",
        vehicleRegistrationCard: vehicleData.vehicleRegistrationCard || "",
        roadAuthorityCertificate: vehicleData.roadAuthorityCertificate || "",
        insuranceCertificate: vehicleData.insuranceCertificate || "",
        vehicleImages: vehicleData.vehicleImages || [],
      });
      updateData.pendingVehicleData = vehicle._id;
    }
  }

  const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  })
    .select(
      "username firstName lastName email phoneNumber gender country role kycLevel kycStatus hasVehicle licenseImage driverSettings pendingVehicleData selfieImage sponsorId"
    )
    .populate({
      path: "pendingVehicleData",
      select:
        "vehicleOwnerName companyName vehiclePlateNumber vehicleMakeModel chassisNumber vehicleColor registrationExpiryDate vehicleType serviceType serviceCategory wheelchair packingHelper loadingUnloadingHelper fixingHelper vehicleRegistrationCard roadAuthorityCertificate insuranceCertificate vehicleImages status",
    });

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    user: {
      userId: updatedUser._id,
      username: updatedUser.username,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName || "",
      email: updatedUser.email,
      phoneNumber: updatedUser.phoneNumber,
      gender: updatedUser.gender,
      country: updatedUser.country,
      role: updatedUser.role,
      kycLevel: updatedUser.kycLevel,
      kycStatus: updatedUser.kycStatus,
      hasVehicle: updatedUser.hasVehicle,
      licenseImage: updatedUser.licenseImage,
      driverSettings: updatedUser.driverSettings,
      selfieImage: updatedUser.selfieImage,
      sponsorId: updatedUser.sponsorId,
      vehicle: updatedUser.pendingVehicleData || null,
    },
  });
});

const changeOwnPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  const userId = req.user._id; // Get user ID from authenticated token

  // Validate new password
  if (!newPassword) {
    res.status(400);
    throw new Error("New password is required");
  }

  if (newPassword.length < 8) {
    res.status(400);
    throw new Error("Password must be at least 8 characters");
  }

  // Find the user
  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Set the new password (middleware will hash it)
  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: "Password changed successfully",
  });
});

const updateProfilePicture = asyncHandler(async (req, res) => {
  const userId = req.user._id; // Get user ID from authenticated token

  // Validate that a file was uploaded
  if (!req.file) {
    res.status(400);
    throw new Error("Profile picture file is required");
  }

  // Find the user
  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Helper function to delete old files
  const deleteOldFile = (filePath) => {
    if (filePath && fs.existsSync(path.join(process.cwd(), filePath))) {
      try {
        fs.unlinkSync(path.join(process.cwd(), filePath));
      } catch (error) {
        console.error(`Error deleting file ${filePath}:`, error);
      }
    }
  };

  // Delete old profile picture if it exists
  deleteOldFile(user.selfieImage);

  // Set new profile picture path
  const profilePicturePath = path.join("uploads", req.file.filename).replace(/\\/g, "/");

  // Update user with new profile picture
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { selfieImage: profilePicturePath },
    { new: true, runValidators: true }
  ).select("username firstName lastName email selfieImage");

  res.status(200).json({
    success: true,
    message: "Profile picture updated successfully",
    user: {
      userId: updatedUser._id,
      username: updatedUser.username,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      profilePicture: updatedUser.selfieImage,
    },
  });
});

const getAllAdminsAndSuperadmins = asyncHandler(async (req, res) => {
  const requestingUser = await User.findById(req.user._id);
  if (!requestingUser || !['admin', 'superadmin'].includes(requestingUser.role)) {
    res.status(403);
    throw new Error('Access denied. Admin or superadmin role required');
  }

  const adminUsers = await User.find({ 
    role: { $in: ['admin', 'superadmin'] } 
  })
    .select('username firstName lastName email phoneNumber role adminPermissions createdAt')
    .sort({ role: 1, createdAt: -1 }); // Sort by role first (admin before superadmin), then by creation date

  res.status(200).json({
    success: true,
    message: 'Admins and superadmins retrieved successfully',
    users: adminUsers.map(user => ({
      _id: user._id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName || '',
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      adminPermissions: user.adminPermissions || [],
      createdAt: user.createdAt
    })),
    totalUsers: adminUsers.length,
    breakdown: {
      admins: adminUsers.filter(user => user.role === 'admin').length,
      superadmins: adminUsers.filter(user => user.role === 'superadmin').length
    }
  });
});

const getUsersWithoutKYC = asyncHandler(async (req, res) => {
  // Extract pagination parameters from query
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Validate pagination parameters
  if (page < 1) {
    return res.status(400).json({
      success: false,
      message: "Page number must be greater than 0"
    });
  }

  if (limit < 1 || limit > 100) {
    return res.status(400).json({
      success: false,
      message: "Limit must be between 1 and 100"
    });
  }

  // Query condition for users without KYC level 1 or 2
  const queryCondition = {
    $and: [
      { kycLevel: { $lt: 1 } }, // KYC level less than 1 (i.e., 0)
      { 
        $or: [
          { kycStatus: null },
          { kycStatus: "rejected" }
        ]
      }
    ]
  };

  // Get total count for pagination metadata
  const totalUsers = await User.countDocuments(queryCondition);

  // Find users with pagination
  const usersWithoutKYC = await User.find(queryCondition)
    .select(
      "username firstName lastName email phoneNumber gender country kycLevel kycStatus createdAt isVerified"
    )
    .sort({ createdAt: -1 }) // Sort by newest first
    .skip(skip)
    .limit(limit);

  // Calculate pagination metadata
  const totalPages = Math.ceil(totalUsers / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  res.status(200).json({
    success: true,
    message: "Users without KYC retrieved successfully",
    users: usersWithoutKYC.map((user) => ({
      userId: user._id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName || "",
      email: user.email,
      phoneNumber: user.phoneNumber,
      gender: user.gender,
      country: user.country,
      kycLevel: user.kycLevel,
      kycStatus: user.kycStatus,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    })),
    pagination: {
      currentPage: page,
      totalPages: totalPages,
      totalUsers: totalUsers,
      usersPerPage: limit,
      hasNextPage: hasNextPage,
      hasPrevPage: hasPrevPage,
      nextPage: hasNextPage ? page + 1 : null,
      prevPage: hasPrevPage ? page - 1 : null
    }
  });
});

export {
  signupUser,
  verifyOTPUser,
  loginUser,
  forgotPassword,
  resetPassword,
  submitKYC,
  logout,
  resendOtp,
  getReferralLink,
  getReferralTree,
  getAllUsers,
  fixReferralRelationships,
  approveKYC,
  rejectKYC,
  getPendingKYCs,
  getUserByUsername,
  setVehicleOwnership,
  addPinnedDriver,
  removePinnedDriver,
  getPinnedDrivers,
  addFavoriteDriver,
  removeFavoriteDriver,
  getFavoriteDrivers,
  getNearbyDriversForUser,
  getQualificationStats,
  getQualificationTransactions,
  deleteUser,
  editUser,
  editDriver,
  getAllCustomers, // Added new controller
  getAllDrivers,
  addAdmin,
  getAdmins,
  getAllAdminsAndSuperadmins,
  editAdmin,
  deleteAdmin,
  getCurrentUser,
  editProfile,
  changeOwnPassword,
  changeReferralCode,
  updateProfilePicture,
  getUsersWithoutKYC,

};
