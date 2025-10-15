import mongoose from "mongoose";
import User from "../models/userModel.js";

const VALID_ROLES = ["user", "customer", "driver", "admin", "dispatcher"];

export async function listUsers(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const q = (req.query.q || "").trim();
    const role = (req.query.role || "").trim().toLowerCase();

    const filter = {};
    if (role) filter.role = role;
    if (q) {
      filter.$or = [
        { email: { $regex: q, $options: "i" } },
        { username: { $regex: q, $options: "i" } },
        { phoneNumber: { $regex: q, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(
          "username firstName lastName email phoneNumber role kycLevel kycStatus country createdAt"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to list users",
      error: error.message,
    });
  }
}

export async function getUserById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res
        .status(400)
        .json({ success: false, message: "Invalid user id" });
    const user = await User.findById(id)
      .select(
        "username firstName lastName email phoneNumber role kycLevel kycStatus country createdAt updatedAt"
      )
      .lean();
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get user",
      error: error.message,
    });
  }
}

export async function updateUserRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!mongoose.isValidObjectId(id))
      return res
        .status(400)
        .json({ success: false, message: "Invalid user id" });
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed: ${VALID_ROLES.join(", ")}`,
      });
    }

    if (role !== "admin") {
      const user = await User.findById(id).select("role");
      if (!user)
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      if (user.role === "admin") {
        const otherAdmins = await User.countDocuments({
          _id: { $ne: id },
          role: "admin",
        });
        if (otherAdmins === 0) {
          return res
            .status(400)
            .json({ success: false, message: "Cannot remove the last admin" });
        }
      }
    }

    const updated = await User.findByIdAndUpdate(
      id,
      {
        $set: {
          role,
          roleUpdatedAt: new Date(),
          roleUpdatedBy: req.user?.id || null,
        },
      },
      { new: true }
    ).select("username email role updatedAt roleUpdatedAt");

    if (!updated)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    res
      .status(200)
      .json({ success: true, message: "Role updated", user: updated });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update role",
      error: error.message,
    });
  }
}
