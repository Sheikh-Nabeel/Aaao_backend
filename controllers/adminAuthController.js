import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

export const adminLogin = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body || {};
  if ((!email && !username) || !password) {
    return res.status(400).json({
      success: false,
      message: "Email/username and password are required",
    });
  }
  const user = await User.findOne({ $or: [{ email }, { username }] });
  if (!user)
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" });
  if (!(await user.comparePassword(password))) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" });
  }
  if (user.role !== "admin" && user.role !== "superadmin") {
    return res
      .status(403)
      .json({ success: false, message: "Not an admin account" });
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
  res.status(200).json({
    success: true,
    message: "Admin login successful",
    token,
    user: {
      id: user._id,
      role: user.role,
      email: user.email,
      username: user.username,
    },
  });
});

// POST /api/admin/auth/register (public for dashboard as requested)
export const adminRegister = asyncHandler(async (req, res) => {
  const { email, username, password, firstName, lastName, phoneNumber } =
    req.body || {};
  if (!email || !username || !password || !firstName) {
    return res.status(400).json({
      success: false,
      message: "email, username, password, firstName are required",
    });
  }

  const exists = await User.findOne({
    $or: [{ email }, { username }, ...(phoneNumber ? [{ phoneNumber }] : [])],
  });
  if (exists) {
    return res.status(400).json({
      success: false,
      message: "Email or username already exists",
    });
  }

  const admin = await User.create({
    email: email.trim().toLowerCase(),
    username,
    password,
    firstName,
    lastName: lastName || "",
    // phoneNumber is optional for admin
    ...(phoneNumber ? { phoneNumber: phoneNumber.trim() } : {}),
    isVerified: true,
    role: "admin",
  });

  res.status(201).json({
    success: true,
    message: "Admin user created",
    user: {
      id: admin._id,
      email: admin.email,
      username: admin.username,
      role: admin.role,
      phoneNumber: admin.phoneNumber || null,
    },
  });
});
