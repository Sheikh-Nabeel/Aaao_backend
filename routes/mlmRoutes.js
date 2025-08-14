import express from "express";
import {
  createMLM,
  getMLM,
  updateMLM,
  updateAllMLMDistributions,
  addMoneyToMLM,
  getUserMLMInfo,
  getMLMStats,
  getMLMFields
} from "../controllers/mlmController.js";

const router = express.Router();

// Create MLM system (Admin only)
router.post("/create", createMLM);

// Get MLM system
router.get("/", getMLM);

// Update MLM system (Admin only)
router.put("/update", updateMLM);

// Update all MLM distributions (Admin only)
router.put("/update-all", updateAllMLMDistributions);

// Add money to MLM system (called after ride completion)
router.post("/add-money", addMoneyToMLM);

// Get user's MLM information
router.get("/user/:userId", getUserMLMInfo);

// Get MLM statistics (Admin only)
router.get("/stats", getMLMStats);

// Get specific MLM fields
router.get("/fields", getMLMFields);

export default router; 