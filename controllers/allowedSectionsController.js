import asyncHandler from "express-async-handler";
import AllowedSection from "../models/allowedSectionModel.js";
import User from "../models/userModel.js";
import jwt from "jsonwebtoken";

const manageAllowedSections = asyncHandler(async (req, res) => {
  const { adminId, sections } = req.body;
  const superadminId = req.user._id;

  if (!adminId || !sections || !Array.isArray(sections)) {
    return res.status(400).json({
      message: "Admin ID and sections array are required",
      token: req.cookies.token,
    });
  }

  const admin = await User.findById(adminId);
  if (!admin || admin.role !== "admin") {
    return res.status(404).json({
      message: "Admin user not found or user is not an admin",
      token: req.cookies.token,
    });
  }

  let allowedSection = await AllowedSection.findOne({ adminId });
  if (allowedSection) {
    allowedSection.sections = sections;
    await allowedSection.save();
  } else {
    allowedSection = await AllowedSection.create({
      adminId,
      sections,
    });
  }

  const token = jwt.sign({ id: superadminId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 3600000,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.status(200).json({
    message: "Allowed sections updated successfully",
    adminId,
    sections: allowedSection.sections,
    token,
  });
});

const getAllowedSections = asyncHandler(async (req, res) => {
  const { adminId } = req.query;
  const superadminId = req.user._id;

  if (!adminId) {
    return res.status(400).json({
      message: "Admin ID is required",
      token: req.cookies.token,
    });
  }

  const admin = await User.findById(adminId);
  if (!admin || admin.role !== "admin") {
    return res.status(404).json({
      message: "Admin user not found or user is not an admin",
      token: req.cookies.token,
    });
  }

  const allowedSection = await AllowedSection.findOne({ adminId });
  const token = jwt.sign({ id: superadminId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 3600000,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.status(200).json({
    message: "Allowed sections retrieved successfully",
    adminId,
    sections: allowedSection ? allowedSection.sections : [],
    token,
  });
});

export { manageAllowedSections, getAllowedSections };
