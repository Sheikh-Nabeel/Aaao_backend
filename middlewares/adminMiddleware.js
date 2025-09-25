import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";

// Admin middleware to restrict access to users with role: "admin" or "superadmin"
const adminHandler = asyncHandler(async (req, res, next) => {
  console.log("=== ADMIN DEBUG ===");

  // Ensure req.user is set by authHandler
  if (!req.user) {
    console.log("No user found in request");
    res.status(401);
    throw new Error("User not authenticated");
  }

  // Find user to ensure latest data
  const user = await User.findById(req.user._id).select("role email");
  if (!user) {
    console.log("User not found in database");
    res.status(401);
    throw new Error("User not found");
  }

  // Temporary test admin bypass (for local/testing only)
  // Enable with env TEST_ADMIN_ENABLE=true and set TEST_ADMIN_EMAIL and/or TEST_ADMIN_SECRET
  const TEST_ADMIN_ENABLE = String(process.env.TEST_ADMIN_ENABLE || "").toLowerCase() === "true";
  const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "";
  const TEST_ADMIN_SECRET = process.env.TEST_ADMIN_SECRET || "";
  const providedSecret = req.headers["x-test-admin-secret"] || req.headers["x-test-admin-token"];
  if (
    TEST_ADMIN_ENABLE &&
    (
      (TEST_ADMIN_EMAIL && String(user.email).toLowerCase() === String(TEST_ADMIN_EMAIL).toLowerCase()) ||
      (TEST_ADMIN_SECRET && providedSecret && String(providedSecret) === String(TEST_ADMIN_SECRET))
    )
  ) {
    console.log(`Test admin bypass granted for user: ${user.email}`);
    return next();
  }

  // Check if user has admin or superadmin role
  if (!["admin", "superadmin"].includes(user.role)) {
    console.log(
      `Access denied for user ${user.email}: role is ${user.role}, expected admin or superadmin`
    );
    res.status(403);
    throw new Error("Access denied: Admin or Superadmin privileges required");
  }

  console.log(`Admin access granted for user: ${user.email}`);
  next();
});

export default adminHandler;
