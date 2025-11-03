import express from "express";
import {
  getAllPricingConfigs,
  getPricingByServiceType,
  updateShiftingMoversPricing,
  updateCarRecoveryPricing,
  updateAppointmentServicePricing,
  addItemPricing,
  updateItemPricing,
  deleteItemPricing,
  getItemPricing,
  deactivatePricingConfig,
} from "../controllers/adminPricingController.js";
import authHandler from "../middlewares/authMIddleware.js";
import adminHandler from "../middlewares/adminMiddleware.js";

const router = express.Router();

// All routes require authentication and admin privileges
router.use(authHandler);
router.use(adminHandler);

// Get all pricing configurations
router.get("/configs", getAllPricingConfigs);

// Get pricing by service type (serviceType accepted in camelCase by controller)
router.get("/configs/:serviceType", getPricingByServiceType);

// Update pricing configurations (camelCase paths)
router.put("/shiftingMovers", updateShiftingMoversPricing);
router.put("/carRecovery", updateCarRecoveryPricing);
router.put("/appointmentService", updateAppointmentServicePricing);

// Item pricing management for shifting & movers (camelCase)
router.post("/shiftingMovers/items", addItemPricing);
router.put("/shiftingMovers/items/:itemName", updateItemPricing);
router.delete("/shiftingMovers/items/:itemName", deleteItemPricing);
router.get("/shiftingMovers/items", getItemPricing);

// Deactivate pricing configuration (kept as-is; path already clear)
router.patch("/configs/:serviceType/deactivate", deactivatePricingConfig);

export default router;
