import express from "express";
import {
  getFareEstimation,
  adjustFareEstimation
} from "../controllers/fareEstimationController.js";
import authHandler from "../middlewares/authMIddleware.js";

const router = express.Router();

// Get fare estimation before booking
router.post("/estimate-fare", authHandler, getFareEstimation);

// Validate fare adjustment (±3% or admin configured percentage)
router.post("/adjust-fare", authHandler, adjustFareEstimation);

export default router;