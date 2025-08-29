import User from "../models/userModel.js";
import Vehicle from "../models/vehicleModel.js";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import { generateOTP, sendOTPEmail, sendPasswordResetOTP, sendKYCApprovalEmail, sendKYCRejectionEmail } from "../middleware/email.js";

// Email templates and functions are now imported from email.js

// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), "Uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(UploadsDir, { recursive: true });
}

// OTP generation is now imported from email.js

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
    otp // New field for OTP verification
  } = req.body;
  const referralUsername = req.query.ref;

  if (
    !username ||
    !firstName ||
    !email ||
    !phoneNumber ||
    !password ||
    !gender ||
    !otp // OTP is now required
  ) {
    res.status(400);
    throw new Error("All required fields must be provided");
  }

  // Normalize email to lowercase
  const normalizedEmail = email.trim().toLowerCase();

  // Check for existing email, username, and phone number
  const existingEmail = await User.findOne({ email: normalizedEmail });
  const existingUsername = await User.findOne({ username });
  const existingPhone = await User.findOne({ phoneNumber });

  const errors = {};
  if (existingEmail) errors.email = "This email is already registered";
  if (existingUsername) errors.username = "This username is already taken";
  if (existingPhone)
    errors.phoneNumber = "This phone number is already registered";

  // If there are any errors, return them
  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  // Import EmailVerification model
  const EmailVerification = mongoose.model('EmailVerification');
  
  // Check if email is verified with OTP
  const emailVerification = await EmailVerification.findOne({ email: normalizedEmail });
  if (!emailVerification) {
    res.status(400);
    throw new Error("Email not verified. Please request OTP verification first.");
  }
  
  // Verify OTP
  if (!emailVerification.isVerified) {
    // Check if OTP is valid
    if (Date.now() > emailVerification.otpExpires) {
      res.status(400);
      throw new Error("OTP has expired. Please request a new OTP.");
    }
    
    if (emailVerification.otp !== otp) {
      res.status(400);
      throw new Error("Invalid OTP. Please try again.");
    }
    
    // Mark email as verified
    emailVerification.isVerified = true;
    await emailVerification.save();
  }

  let finalSponsorBy = sponsorBy;
  if (referralUsername) {
    const sponsor = await User.findOne({ username: referralUsername });
    if (sponsor) {
      finalSponsorBy = referralUsername;
    } else {
      res.status(400);
      throw new Error("Invalid referral username");
    }
  } else if (sponsorBy) {
    const sponsor = await User.findOne({
      $or: [{ sponsorId: sponsorBy }, { username: sponsorBy }],
    });
    if (!sponsor) {
      res.status(400);
      throw new Error("Invalid sponsor ID or username");
    }
    finalSponsorBy = sponsorBy;
  }

  // Create new user with verified email
  const user = await User.create({
    username,
    firstName,
    lastName: lastName || "",
    email: normalizedEmail,
    phoneNumber,
    password,
    sponsorBy: finalSponsorBy || null,
    gender,
    isVerified: true, // User is already verified through email OTP
    role: "customer",
    sponsorId: `${uuidv4().split("-")[0]}-${Date.now().toString().slice(-6)}`,
    pendingVehicleData: null,
  });
  
  console.log("Created new user with verified email:", user.email);

  // Process sponsor relationships if applicable
  let sponsorName = null;
  if (user.sponsorBy) {
    const sponsor = await User.findOne({
      $or: [{ sponsorId: user.sponsorBy }, { username: user.sponsorBy }],
    });
    if (sponsor) {
      await updateReferralTree(user._id, user.sponsorBy);
      sponsorName = `${sponsor.firstName}${
        sponsor.lastName ? " " + sponsor.lastName : ""
      }`;
    }
  }

  // Generate token for automatic login
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
    },
  });
});

const verifyOTPUser = asyncHandler(async (req, res) => {
  let { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400);
    throw new Error("Email and OTP are required");
  }

  // Normalize email to lowercase
  email = email.trim().toLowerCase();

  // Import EmailVerification model
  const EmailVerification = mongoose.model('EmailVerification');
  
  // Find email verification record
  const emailVerification = await EmailVerification.findOne({ email });
  if (!emailVerification) {
    res.status(404);
    throw new Error("Email verification not found. Please request OTP first.");
  }
  
  if (emailVerification.isVerified) {
    res.status(400);
    throw new Error("Email already verified. You can proceed to registration.");
  }
  
  if (Date.now() > emailVerification.otpExpires || !emailVerification.otpExpires) {
    res.status(400);
    throw new Error("OTP has expired. Please request a new OTP.");
  }
  
  if (emailVerification.otp !== otp) {
    res.status(400);
    throw new Error("Invalid OTP");
  }
  
  // Mark email as verified
  emailVerification.isVerified = true;
  await emailVerification.save();

  // Return success response
  res.status(200).json({
    message: "Email verified successfully. You can now proceed with registration.",
    email: email,
    isVerified: true
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
  }).populate("sponsorTree", "firstName lastName");
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
    });
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
      level: user.level,
      sponsorTree: user.sponsorTree.map((s) => ({
        id: s._id,
        name: `${s.firstName}${s.lastName ? " " + s.lastName : ""}`,
      })),
      sponsoredUsers: sponsoredUsers || "No sponsored users",
      sponsorName: sponsorName,
      user:user,
    });
});

const forgotPassword = asyncHandler(async (req, res) => {
  let { email } = req.body;
  if (!email) {
    res.status(400);
    throw new Error("Email is required");
  }
  // Normalize email
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
  // Normalize email
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
  });
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
  // Keep legacy fields in sync for backward compatibility (first 4 levels)
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
      // Ensure nextLevels calculated if missing
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
  // Ensure dynamic levels are computed
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
    // Dynamic structure with arbitrary depth
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
            { $cond: { if: "$lastName", then: " $lastName", else: "" } },
          ],
        },
        email: 1,
        sponsorId: 1,
        level: 1,
        kycLevel: 1,
        role: 1,
        joinedDate: "$createdAt",
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
  // Legacy levels for backward compatibility
  processLevel(levelsIds[0] || [], "level1");
  processLevel(levelsIds[1] || [], "level2");
  processLevel(levelsIds[2] || [], "level3");
  processLevel(levelsIds[3] || [], "level4");
  referralTree.counts.totalReferrals = Object.values(dynamicCounts).reduce(
    (a, b) => a + b,
    0
  );

  // Dynamic members for all depths
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
        });
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
  const user = await User.findById(userId).populate("pendingVehicleData");
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  let kycLevelToApprove;
  if (user.kycLevel === 0) {
    kycLevelToApprove = 1;
  } else if (user.kycLevel === 1) {
    kycLevelToApprove = 2;
  } else {
    res.status(400);
    throw new Error("No valid KYC level to approve");
  }
  if (kycLevelToApprove === 2) {
    // Require license image uploaded for Level 2
    if (!user.licenseImage) {
      res.status(400);
      throw new Error("License must be uploaded before approving KYC Level 2");
    }
    // If a vehicle is already registered, auto-approve it; otherwise OK to approve user without vehicle
    if (user.pendingVehicleData) {
      const vehicle = await Vehicle.findById(user.pendingVehicleData);
      if (vehicle) {
        vehicle.status = "approved";
        await vehicle.save();
      }
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
    await sendKYCApprovalEmail(updatedUser.email, kycLevelToApprove, `${updatedUser.firstName} ${updatedUser.lastName || ''}`.trim());
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
    await sendKYCRejectionEmail(user.email, reason, `${user.firstName} ${user.lastName || ''}`.trim());
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

// Pinned and Favorite Drivers Management
const addPinnedDriver = asyncHandler(async (req, res) => {
  const { driverId } = req.body;
  const userId = req.user._id;

  if (!driverId) {
    res.status(400);
    throw new Error("Driver ID is required");
  }

  // Check if driver exists
  const driver = await User.findById(driverId);
  if (!driver || driver.role !== "driver") {
    res.status(404);
    throw new Error("Driver not found");
  }

  // Add to pinned drivers if not already pinned
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

  const user = await User.findById(userId).populate("pinnedDrivers", "firstName lastName phoneNumber vehicleDetails");
  
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

  // Check if driver exists
  const driver = await User.findById(driverId);
  if (!driver || driver.role !== "driver") {
    res.status(404);
    throw new Error("Driver not found");
  }

  // Add to favorite drivers if not already favorited
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

  const user = await User.findById(userId).populate("favoriteDrivers", "firstName lastName phoneNumber vehicleDetails");
  
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

  // Get user's pinned and favorite drivers
  const user = await User.findById(userId);
  const pinnedDrivers = user.pinnedDrivers || [];
  const favoriteDrivers = user.favoriteDrivers || [];

  // Find nearby drivers
  const nearbyDrivers = await User.find({
    role: "driver",
    isOnline: true,
    "location.coordinates": {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [parseFloat(longitude), parseFloat(latitude)],
        },
        $maxDistance: radius * 1000, // Convert km to meters
      },
    },
  }).populate("vehicleDetails");

  // Filter by service type if specified
  let filteredDrivers = nearbyDrivers;
  if (serviceType) {
    filteredDrivers = nearbyDrivers.filter(driver => 
      driver.vehicleDetails && 
      driver.vehicleDetails.some(vehicle => 
        vehicle.serviceType === serviceType
      )
    );
  }

  // Prioritize pinned and favorite drivers
  const prioritizedDrivers = filteredDrivers.map(driver => ({
    ...driver.toObject(),
    isPinned: pinnedDrivers.includes(driver._id.toString()),
    isFavorite: favoriteDrivers.includes(driver._id.toString()),
    priority: pinnedDrivers.includes(driver._id.toString()) ? 1 : 
              favoriteDrivers.includes(driver._id.toString()) ? 2 : 3
  })).sort((a, b) => a.priority - b.priority);

  res.status(200).json({
    success: true,
    message: "Nearby drivers retrieved successfully",
    drivers: prioritizedDrivers,
    total: prioritizedDrivers.length,
  });
});

// Get user qualification stats (TGP/PGP)
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
  
  // Check and reset monthly points if needed
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
        tgp: stats.tgp.lastResetDate
      }
    }
  });
});

// Get user qualification transactions
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
    total: user.qualificationPoints.transactions.length
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
};
