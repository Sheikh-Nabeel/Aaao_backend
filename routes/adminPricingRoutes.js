import express from 'express';
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
  deactivatePricingConfig
} from '../controllers/adminPricingController.js';
import authHandler from '../middlewares/authMIddleware.js';
import adminHandler from '../middlewares/adminMiddleware.js';

const router = express.Router();

// All routes require authentication and admin privileges
router.use(authHandler);
router.use(adminHandler);

// Get all pricing configurations
router.get('/configs', getAllPricingConfigs);

// Get pricing by service type
router.get('/configs/:serviceType', getPricingByServiceType);

// Update pricing configurations
router.put('/shifting-movers', updateShiftingMoversPricing);
router.put('/car-recovery', updateCarRecoveryPricing);
router.put('/appointment-service', updateAppointmentServicePricing);

// Item pricing management for shifting & movers
router.post('/shifting-movers/items', addItemPricing);
router.put('/shifting-movers/items/:itemName', updateItemPricing);
router.delete('/shifting-movers/items/:itemName', deleteItemPricing);
router.get('/shifting-movers/items', getItemPricing);

// Deactivate pricing configuration
router.patch('/configs/:serviceType/deactivate', deactivatePricingConfig);

export default router;