import express from "express";
import { getUserAnalytics } from "../controllers/analyticsController.js";
import authHandler from "../middlewares/authMIddleware.js";
import adminHandler from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Admin only - Get user analytics
router.get("/users", authHandler, adminHandler, getUserAnalytics);

export default router;
