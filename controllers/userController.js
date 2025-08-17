import User from "../models/userModel.js";
import Vehicle from "../models/vehicleModel.js";
import asyncHandler from "express-async-handler";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";

// Nodemailer configuration with hardcoded credentials
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "chyousafawais667@gmail.com",
    pass: "mfhequkvepgtwusf",
  },
});

transporter.verify((error) => {
  if (error) {
    console.error("Nodemailer verification failed:", error.message);
  } else {
    console.log("Nodemailer is ready to send emails");
  }
});

// Embedded email template function for AAAO GO
const generateEmailTemplate = ({
  subject,
  greeting,
  message,
  ctaText,
  ctaUrl,
}) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #013220 0%, #0a4a2a 100%); padding: 20px; text-align: center; }
        .header img { max-width: 150px; }
        .content { padding: 20px; color: #333333; }
        .content h2 { color: #013220; }
        .content p { font-size: 16px; line-height: 1.5; }
        .cta-button { display: inline-block; padding: 12px 24px; background-color: #FFD700; color: #013220; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background-color: #013220; color: #FFD700; text-align: center; padding: 10px; font-size: 14px; }
        @media (max-width: 600px) {
          .container { margin: 10px; }
          .header img { max-width: 120px; }
          .content { padding: 15px; }
          .cta-button { padding: 10px 20px; font-size: 14px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="https://via.placeholder.com/150x50?text=AAAO+GO+Logo" alt="AAAO GO Logo" />
        </div>
        <div class="content">
          <h2>${greeting}</h2>
          <p>${message}</p>
          ${
            ctaUrl
              ? `<a href="${ctaUrl}" class="cta-button">${ctaText}</a>`
              : ""
          }
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} AAAO GO. All rights reserved.</p>
          <p>Questions? Contact us at <a href="mailto:support@aaaogo.com" style="color: #FFD700;">support@aaaogo.com</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), "Uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(UploadsDir, { recursive: true });
}

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

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
  } = req.body;
  const referralUsername = req.query.ref;

  if (
    !username ||
    !firstName ||
    !lastName ||
    !email ||
    !phoneNumber ||
    !password ||
    !gender
  ) {
    res.status(400);
    throw new Error("All required fields must be provided");
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

  const existingUser = await User.findOne({
    $or: [{ email }, { phoneNumber }, { username }],
  });
  let otp;
  if (existingUser) {
    if (existingUser.isVerified) {
      res.status(400);
      throw new Error(
        "A user with this email, phone number, or username already exists"
      );
    }
    otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    existingUser.otp = otp;
    existingUser.otpExpires = otpExpires;
    existingUser.username = username;
    existingUser.firstName = firstName;
    existingUser.lastName = lastName;
    existingUser.phoneNumber = phoneNumber;
    existingUser.password = password;
    existingUser.sponsorBy = finalSponsorBy || null;
    existingUser.gender = gender;
    await existingUser.save();
    console.log("Updated existing user:", existingUser.email, existingUser.otp);
  } else {
    const user = await User.create({
      username,
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      sponsorBy: finalSponsorBy || null,
      gender,
      otp: generateOTP(),
      otpExpires: new Date(Date.now() + 10 * 60 * 1000),
      isVerified: false,
      role: "customer",
      sponsorId: `${uuidv4().split("-")[0]}-${Date.now().toString().slice(-6)}`,
      pendingVehicleData: null,
    });
    otp = user.otp;
    console.log("Created new user:", user.email, user.otp);
  }

  try {
    await transporter.sendMail({
      from: `"AAAO GO" <chyousafawais667@gmail.com>`,
      to: email,
      subject: "Your OTP for AAAO GO Account Verification",
      html: generateEmailTemplate({
        subject: "Your OTP for AAAO GO Account Verification",
        greeting: `Hello ${firstName} ${lastName},`,
        message: `Your OTP for account verification is: <strong>${otp}</strong>. Please enter this OTP to verify within 10 minutes.`,
        ctaText: "Verify Now",
        ctaUrl: `${process.env.APP_URL}/verify-otp`,
      }),
    });
    console.log(`Email sent to ${email} with OTP: ${otp}`);
  } catch (error) {
    console.error(`Failed to send email to ${email}:`, error.message);
    res.status(500);
    throw new Error("Failed to send OTP email");
  }

  res.status(200).json({
    message: "OTP sent. Please verify to complete registration.",
    sponsorBy: finalSponsorBy,
  });
});

const verifyOTPUser = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400);
    throw new Error("Email and OTP are required");
  }

  const user = await User.findOne({ email });
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

  let sponsorName = null;
  if (user.sponsorBy) {
    const sponsor = await User.findOne({
      $or: [{ sponsorId: user.sponsorBy }, { username: user.sponsorBy }],
    });
    if (sponsor) {
      await updateReferralTree(user._id, user.sponsorBy);
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
    maxAge: 3600000,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  const sponsoredUsers = user.sponsorTree
    .map((s) => `${s.firstName} ${s.lastName}`)
    .join(", ");
  res.status(201).json({
    message: "Registration completed successfully",
    token,
    userId: user._id,
    username: user.username,
    sponsorId: user.sponsorId,
    level: user.level,
    sponsorTree: user.sponsorTree.map((s) => ({
      id: s._id,
      name: `${s.firstName} ${s.lastName}`,
    })),
    sponsoredUsers: sponsoredUsers || "No sponsored users",
    sponsorName: sponsorName,
    user: {
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      sponsorBy: user.sponsorBy,
      country: user.country,
      kycLevel: user.kycLevel,
      kycStatus: user.kycStatus,
      hasVehicle: user.hasVehicle,
      pendingVehicleData: user.pendingVehicleData,
      gender: user.gender,
      role: user.role,
    },
  });
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, phoneNumber, username, password } = req.body;
  if ((!email && !phoneNumber && !username) || !password) {
    res.status(400);
    throw new Error("Email, phone number, or username and password are required");
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
    .map((s) => `${s.firstName} ${s.lastName}`)
    .join(", ");
  let sponsorName = null;
  if (user.sponsorBy) {
    const sponsor = await User.findOne({
      $or: [{ sponsorId: user.sponsorBy }, { username: user.sponsorBy }],
    });
    sponsorName = sponsor ? `${sponsor.firstName} ${sponsor.lastName}` : null;
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
        name: `${s.firstName} ${s.lastName}`,
      })),
      sponsoredUsers: sponsoredUsers || "No sponsored users",
      sponsorName: sponsorName,
      user: {
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        sponsorBy: user.sponsorBy,
        country: user.country,
        kycLevel: user.kycLevel,
        kycStatus: user.kycStatus,
        hasVehicle: user.hasVehicle,
        pendingVehicleData: user.pendingVehicleData,
        gender: user.gender,
        role: user.role,
      },
    });
});

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
  try {
    await transporter.sendMail({
      from: `"AAAO GO" <chyousafawais667@gmail.com>`,
      to: email,
      subject: "Your OTP for AAAO GO Password Reset",
      html: generateEmailTemplate({
        subject: "Your OTP for AAAO GO Password Reset",
        greeting: `Hello ${user.firstName} ${user.lastName},`,
        message: `Your OTP for password reset is: <strong>${resetOtp}</strong>. Please use this OTP within 10 minutes.`,
        ctaText: "Reset Password",
        ctaUrl: `${process.env.APP_URL}/reset-password`,
      }),
    });
    console.log(`Reset OTP email sent to ${email}`);
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
  res.status(200).json({ message: "Reset OTP sent to email", token });
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
  const lastName = lastNameParts.join(" ");
  if (!firstName || !lastName) {
    return res.status(400).json({
      message: "Full name must contain both first and last names",
      userId,
    });
  }
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
  try {
    await transporter.sendMail({
      from: `"AAAO GO" <chyousafawais667@gmail.com>`,
      to: email,
      subject: "Your New OTP for AAAO GO Account Verification",
      html: generateEmailTemplate({
        subject: "Your New OTP for AAAO GO Account Verification",
        greeting: `Hello ${user.firstName} ${user.lastName},`,
        message: `Your new OTP for account verification is: <strong>${newOtp}</strong>. Please enter this OTP to verify within 10 minutes.`,
        ctaText: "Verify Now",
        ctaUrl: `${process.env.APP_URL}/verify-otp`,
      }),
    });
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

async function updateAllLevels(userId) {
  const user = await User.findById(userId);
  if (!user) return;

  await updateLevel2Referrals(user);
  await updateLevel3Referrals(user);
  await updateLevel4Referrals(user);
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
  const allReferralIds = [
    ...user.directReferrals,
    ...user.level2Referrals,
    ...user.level3Referrals,
    ...user.level4Referrals,
  ];
  if (allReferralIds.length === 0) {
    if (user.level !== 0) {
      user.level = 0;
      await user.save();
    }
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
        _id: 1,
      },
    },
  ]);
  const existingMemberIds = new Set(
    existingMembers.map((member) => member._id.toString())
  );
  const level1Count = user.directReferrals.filter((id) =>
    existingMemberIds.has(id.toString())
  ).length;
  const level2Count = user.level2Referrals.filter((id) =>
    existingMemberIds.has(id.toString())
  ).length;
  const level3Count = user.level3Referrals.filter((id) =>
    existingMemberIds.has(id.toString())
  ).length;
  const level4Count = user.level4Referrals.filter((id) =>
    existingMemberIds.has(id.toString())
  ).length;

  let newLevel = user.level;
  if (level1Count >= 3 && user.level < 1) newLevel = 1;
  if (level2Count >= 3 && user.level < 2) newLevel = 2;
  if (level3Count >= 3 && user.level < 3) newLevel = 3;
  if (level4Count >= 3 && user.level < 4) newLevel = 4;
  if (level1Count < 3 && user.level >= 1) newLevel = 0;
  if (level2Count < 3 && user.level >= 2) newLevel = 1;
  if (level3Count < 3 && user.level >= 3) newLevel = 2;
  if (level4Count < 3 && user.level >= 4) newLevel = 3;

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
  const allReferralIds = [
    ...user.directReferrals,
    ...user.level2Referrals,
    ...user.level3Referrals,
    ...user.level4Referrals,
  ];
  const stats = {
    level1: user.directReferrals ? user.directReferrals.length : 0,
    level2: user.level2Referrals ? user.level2Referrals.length : 0,
    level3: user.level3Referrals ? user.level3Referrals.length : 0,
    level4: user.level4Referrals ? user.level4Referrals.length : 0,
  };
  stats.totalReferrals =
    stats.level1 + stats.level2 + stats.level3 + stats.level4;
  const referralTree = {
    user: {
      id: user._id,
      username: user.username,
      name: `${user.firstName} ${user.lastName}`,
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
        name: { $concat: ["$firstName", " ", "$lastName"] },
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
  processLevel(user.directReferrals, "level1");
  processLevel(user.level2Referrals, "level2");
  processLevel(user.level3Referrals, "level3");
  processLevel(user.level4Referrals, "level4");
  referralTree.counts.totalReferrals =
    referralTree.counts.level1 +
    referralTree.counts.level2 +
    referralTree.counts.level3 +
    referralTree.counts.level4;
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
    users,
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
    if (!user.hasVehicle) {
      res.status(400);
      throw new Error("Vehicle decision (yes/no) must be specified");
    }
    if (user.hasVehicle === "yes" && !user.pendingVehicleData) {
      res.status(400);
      throw new Error("Vehicle data must be provided for KYC Level 2");
    }
    if (user.hasVehicle === "yes") {
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
    await transporter.sendMail({
      from: `"AAAO GO" <chyousafawais667@gmail.com>`,
      to: updatedUser.email,
      subject: `KYC Level ${kycLevelToApprove} Approved`,
      html: generateEmailTemplate({
        subject: `KYC Level ${kycLevelToApprove} Approved`,
        greeting: `Hello ${updatedUser.firstName} ${updatedUser.lastName},`,
        message: `Your KYC Level ${kycLevelToApprove} submission has been approved. You can now proceed with the next steps in the AAAO GO application.`,
        ctaText: "Log In to Continue",
        ctaUrl: `${process.env.APP_URL}/login`,
      }),
    });
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
    await transporter.sendMail({
      from: `"AAAO GO" <chyousafawais667@gmail.com>`,
      to: user.email,
      subject: "KYC Submission Rejected",
      html: generateEmailTemplate({
        subject: "KYC Submission Rejected",
        greeting: `Hello ${user.firstName} ${user.lastName},`,
        message: `Your KYC submission has been rejected. <strong>Reason:</strong> ${
          reason || "No reason provided"
        }. Please resubmit with corrected information.`,
        ctaText: "Resubmit KYC",
        ctaUrl: `${process.env.APP_URL}/submit-kyc`,
      }),
    });
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
        name: `${user.firstName} ${user.lastName}`,
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
};
