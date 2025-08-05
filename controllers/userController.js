import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";
import nodemailer from "nodemailer";
import cloudinary from "cloudinary";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "chyousafawais667@gmail.com",
    pass: "mfhequkvepgtwusf",
  },
});
transporter.verify((error) => {
  if (error) console.error("Nodemailer configuration error:", error.message);
  else console.log("Nodemailer is ready to send emails");
});

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const signupUser = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    sponsorBy,
    gender,
  } = req.body;

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

  if (sponsorBy) {
    const sponsor = await User.findOne({ sponsorId: sponsorBy });
    if (!sponsor) {
      res.status(400);
      throw new Error("Invalid sponsor ID");
    }
  }

  const existingUser = await User.findOne({
    $or: [{ email }, { phoneNumber }],
  });
  let otp;
  if (existingUser) {
    if (existingUser.isVerified) {
      res.status(400);
      throw new Error("A user with this email or phone number already exists");
    }
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
    otp = user.otp;
    console.log("Created new user:", user.email, user.otp);
  }

  await transporter.sendMail({
    from: `"Your App" <chyousafawais667@gmail.com>`,
    to: email,
    subject: "Your OTP for Account Verification",
    text: `Hello ${firstName} ${lastName},\nYour OTP for account verification is: ${otp}\nPlease enter this OTP to verify within 10 minutes.`,
    html: `<h2>Hello ${firstName} ${lastName},</h2><p>Your OTP is: <strong>${otp}</strong></p><p>Verify within 10 minutes.</p>`,
  });
  res.status(200).json({
    message: "OTP sent. Please verify to complete registration.",
  });
});

const verifyOTPUser = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

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

  let sponsorName = null;
  if (user.sponsorBy) {
    console.log(`User has sponsorBy: ${user.sponsorBy}`);
    const sponsor = await User.findOne({ sponsorId: user.sponsorBy });
    if (sponsor) {
      console.log(
        `Found sponsor: ${sponsor.sponsorId} (${sponsor.firstName} ${sponsor.lastName})`
      );
      await updateReferralTree(user._id, user.sponsorBy);
      sponsorName = `${sponsor.firstName} ${sponsor.lastName}`;
    } else {
      console.error(`Sponsor not found with sponsorId: ${user.sponsorBy}`);
    }
  } else {
    console.log(`User has no sponsorBy`);
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
    sponsorId: user.sponsorId,
    level: user.level,
    sponsorTree: user.sponsorTree.map((s) => ({
      id: s._id,
      name: `${s.firstName} ${s.lastName}`,
    })),
    sponsoredUsers: sponsoredUsers || "No sponsored users",
    sponsorName: sponsorName,
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

const loginUser = asyncHandler(async (req, res) => {
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
      maxAge: 3600000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
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
      sponsorName: sponsorName,
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
    from: `"Your App" <chyousafawais667@gmail.com>`,
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
    maxAge: 3600000,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.status(200).json({ message: "Reset OTP sent to email", token });
});

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
    maxAge: 3600000,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.status(200).json({ message: "Password reset successful", token });
});

cloudinary.config({
  cloud_name: process.env.Cloud_Name,
  api_key: process.env.API_Key,
  api_secret: process.env.API_Secret,
});

const submitKYC = asyncHandler(async (req, res) => {
  console.log("Request Body:", req.body); // Log the body
  console.log("Received Files:", req.files); // Log the files
  console.log("Full Request Headers:", req.headers); // Log headers to check Content-Type

  const { userId, fullName } = req.body;

  // Validate required fields
  if (!userId || !fullName) {
    return res.status(400).json({
      message: "User ID and full name are required",
      userId: userId || null,
    });
  }

  // Split fullName into firstName and lastName
  const [firstName, ...lastNameParts] = fullName.trim().split(" ");
  const lastName = lastNameParts.join(" ");

  if (!firstName || !lastName) {
    return res.status(400).json({
      message: "Full name must contain both first and last names",
      userId,
    });
  }

  // Find user by ID
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: "User not found", userId });
  }

  // Update user's firstName and lastName if they differ
  if (user.firstName !== firstName || user.lastName !== lastName) {
    user.firstName = firstName;
    user.lastName = lastName;
    await user.save();
  }

  // Check if KYC Level 1 is already completed
  if (user.kycLevel >= 1) {
    return res
      .status(403)
      .json({ message: "KYC Level 1 already completed", userId });
  }

  // Verify file uploads
  if (
    !req.files ||
    !req.files.frontImage ||
    !req.files.backImage ||
    !req.files.selfieImage
  ) {
    return res.status(400).json({
      message: "Front, back, and selfie images are required",
      userId,
    });
  }

  // Upload images to Cloudinary
  const uploadToCloudinary = async (file, folder) => {
    const result = await cloudinary.uploader.upload(file.path, { folder });
    return result.secure_url;
  };

  const frontImageUrl = await uploadToCloudinary(
    req.files.frontImage[0],
    "kyc/cnic"
  );
  const backImageUrl = await uploadToCloudinary(
    req.files.backImage[0],
    "kyc/cnic"
  );
  const selfieImageUrl = await uploadToCloudinary(
    req.files.selfieImage[0],
    "kyc/selfie"
  );

  // Update user with KYC details
  user.cnicImages = {
    front: frontImageUrl,
    back: backImageUrl,
  };
  user.selfieImage = selfieImageUrl;
  user.kycLevel = 1;
  await user.save();

  // Respond with success
  res.status(200).json({
    message: "KYC Level 1 submitted successfully",
    userId,
  });
});

const logout = async (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      maxAge: 0,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    if (!req.cookies || !req.cookies.token) {
      console.log("No token found in request cookies during logout");
    }
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ message: "Logout failed", error: error.message });
  }
};

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
    from: `"Your App" <chyousafawais667@gmail.com>`,
    to: email,
    subject: "Your New OTP for Account Verification",
    text: `Hello ${user.firstName} ${user.lastName},\nYour new OTP for account verification is: ${newOtp}\nPlease enter this OTP to verify within 10 minutes.`,
    html: `<h2>Hello ${user.firstName} ${user.lastName},</h2><p>Your new OTP is: <strong>${newOtp}</strong></p><p>Verify within 10 minutes.</p>`,
  });
  res.status(200).json({ message: "New OTP sent successfully" });
});

async function updateReferralTree(newUserId, sponsorId) {
  try {
    const newUser = await User.findById(newUserId);
    if (!newUser) return;

    const sponsor = await User.findOne({ sponsorId: sponsorId });
    if (!sponsor) {
      console.error(`Sponsor not found with sponsorId: ${sponsorId}`);
      return;
    }

    console.log(
      `Adding user ${newUserId} to sponsor ${sponsor._id} (${sponsor.sponsorId})`
    );

    if (!sponsor.directReferrals.includes(newUserId)) {
      sponsor.directReferrals.push(newUserId);
      console.log(
        `Added to directReferrals. Current count: ${sponsor.directReferrals.length}`
      );
    } else {
      console.log(`User already in directReferrals`);
    }

    if (!sponsor.sponsorTree.includes(newUserId)) {
      sponsor.sponsorTree.push(newUserId);
      console.log(
        `Added to sponsorTree. Current count: ${sponsor.sponsorTree.length}`
      );
    } else {
      console.log(`User already in sponsorTree`);
    }

    await sponsor.save();
    console.log(`Sponsor saved successfully`);

    await updateAllLevels(sponsor._id);
  } catch (error) {
    console.error("Error updating referral tree:", error);
  }
}

async function updateAllLevels(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    await updateLevel2Referrals(user);
    await updateLevel3Referrals(user);
    await updateLevel4Referrals(user);
    await checkAndUpdateUserLevel(user);

    if (user.sponsorBy) {
      const parentSponsor = await User.findOne({ sponsorId: user.sponsorBy });
      if (parentSponsor) {
        await updateAllLevels(parentSponsor._id);
      }
    }
  } catch (error) {
    console.error("Error updating all levels:", error);
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
    if (level2Referral && directReferral.directReferrals.length > 0) {
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
  // Get all referral IDs from all levels
  const allReferralIds = [
    ...user.directReferrals,
    ...user.level2Referrals,
    ...user.level3Referrals,
    ...user.level4Referrals,
  ];

  // If no referrals, level remains 0
  if (allReferralIds.length === 0) {
    if (user.level !== 0) {
      user.level = 0;
      await user.save();
      console.log(`User ${user.email} leveled down to level 0 (no existing referrals)`);
    }
    return;
  }

  // Get actual existing members count for each level
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

  // Create a set of existing member IDs for O(1) lookup
  const existingMemberIds = new Set(existingMembers.map(member => member._id.toString()));

  // Count existing members in each level
  const level1Count = user.directReferrals.filter(id => existingMemberIds.has(id.toString())).length;
  const level2Count = user.level2Referrals.filter(id => existingMemberIds.has(id.toString())).length;
  const level3Count = user.level3Referrals.filter(id => existingMemberIds.has(id.toString())).length;
  const level4Count = user.level4Referrals.filter(id => existingMemberIds.has(id.toString())).length;

  let newLevel = user.level;

  // Level progression based on existing members only
  if (level1Count >= 3 && user.level < 1) {
    newLevel = 1;
  }
  if (level2Count >= 3 && user.level < 2) {
    newLevel = 2;
  }
  if (level3Count >= 3 && user.level < 3) {
    newLevel = 3;
  }
  if (level4Count >= 3 && user.level < 4) {
    newLevel = 4;
  }

  // Check for level down if user loses members
  if (level1Count < 3 && user.level >= 1) {
    newLevel = 0;
  }
  if (level2Count < 3 && user.level >= 2) {
    newLevel = 1;
  }
  if (level3Count < 3 && user.level >= 3) {
    newLevel = 2;
  }
  if (level4Count < 3 && user.level >= 4) {
    newLevel = 3;
  }

  if (newLevel !== user.level) {
    const oldLevel = user.level;
    user.level = newLevel;
    await user.save();
    if (newLevel > oldLevel) {
      console.log(`User ${user.email} leveled up to level ${newLevel} (existing members: L1=${level1Count}, L2=${level2Count}, L3=${level3Count}, L4=${level4Count})`);
    } else {
      console.log(`User ${user.email} leveled down to level ${newLevel} (existing members: L1=${level1Count}, L2=${level2Count}, L3=${level3Count}, L4=${level4Count})`);
    }
  }
}

const getReferralTree = asyncHandler(async (req, res) => {
  const targetUserId = req.query.userId || req.user._id;
  
  const user = await User.findById(targetUserId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Get all referral IDs from all levels
  const allReferralIds = [
    ...user.directReferrals,
    ...user.level2Referrals,
    ...user.level3Referrals,
    ...user.level4Referrals,
  ];

  // Initialize response structure
  const referralTree = {
    user: {
      id: user._id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      sponsorId: user.sponsorId,
      level: user.level,
      sponsorBy: user.sponsorBy,
    },
    counts: {
      totalReferrals: 0,
      level1: 0,
      level2: 0,
      level3: 0,
      level4: 0,
    },
    members: {
      level1: [],
      level2: [],
      level3: [],
      level4: [],
    },
  };

  // If no referrals, return early
  if (allReferralIds.length === 0) {
    res.status(200).json({
      message: "Referral tree retrieved successfully",
      referralTree,
    });
    return;
  }

  // Single optimized aggregation to get all existing members
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

  // Create a map for O(1) lookup
  const membersMap = new Map();
  existingMembers.forEach((member) => {
    membersMap.set(member.id.toString(), member);
  });

  // Process each level and only count existing members
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

  // Process all levels
  processLevel(user.directReferrals, 'level1');
  processLevel(user.level2Referrals, 'level2');
  processLevel(user.level3Referrals, 'level3');
  processLevel(user.level4Referrals, 'level4');

  // Calculate total from actual existing members
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
      firstName: 1,
      lastName: 1,
      email: 1,
      sponsorId: 1,
      sponsorBy: 1,
      level: 1,
      kycLevel: 1,
      role: 1,
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
  try {
    console.log("Starting to fix referral relationships...");

    const usersWithSponsors = await User.find({
      sponsorBy: { $exists: true, $ne: null },
    });
    console.log(`Found ${usersWithSponsors.length} users with sponsors`);

    let fixedCount = 0;
    let errorCount = 0;

    for (const user of usersWithSponsors) {
      try {
        if (user.sponsorBy) {
          const sponsor = await User.findOne({ sponsorId: user.sponsorBy });
          if (sponsor) {
            if (!sponsor.directReferrals.includes(user._id)) {
              sponsor.directReferrals.push(user._id);
              console.log(
                `Added user ${user.sponsorId} to sponsor ${sponsor.sponsorId} directReferrals`
              );
            }

            if (!sponsor.sponsorTree.includes(user._id)) {
              sponsor.sponsorTree.push(user._id);
              console.log(
                `Added user ${user.sponsorId} to sponsor ${sponsor.sponsorId} sponsorTree`
              );
            }

            await sponsor.save();
            fixedCount++;
          } else {
            console.error(
              `Sponsor not found for user ${user.sponsorId} with sponsorBy: ${user.sponsorBy}`
            );
            errorCount++;
          }
        }
      } catch (error) {
        console.error(`Error fixing user ${user.sponsorId}:`, error);
        errorCount++;
      }
    }

    console.log("Updating all levels...");
    const allUsers = await User.find({});
    for (const user of allUsers) {
      try {
        await updateAllLevels(user._id);
      } catch (error) {
        console.error(
          `Error updating levels for user ${user.sponsorId}:`,
          error
        );
      }
    }

    res.status(200).json({
      message: "Referral relationships fixed successfully",
      fixedCount,
      errorCount,
      totalUsersProcessed: usersWithSponsors.length,
    });
  } catch (error) {
    console.error("Error in fixReferralRelationships:", error);
    res.status(500).json({
      message: "Error fixing referral relationships",
      error: error.message,
    });
  }
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
  getReferralTree,
  getAllUsers,
  fixReferralRelationships,
};
