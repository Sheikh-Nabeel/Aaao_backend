import express from 'express';
import {
  goOnline,
  goOffline,
  getDriverStatus,
  updateLocation,
  getOnlineDrivers,
  forceDriverOffline
} from '../controllers/driverStatusController.js';
import authHandler from '../middlewares/authMIddleware.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authHandler);

// Driver routes
router.post('/go-online', goOnline);
router.post('/go-offline', goOffline);
router.get('/status', getDriverStatus);
router.post('/update-location', updateLocation);

// Admin routes
router.get('/admin/online', getOnlineDrivers);
router.post('/admin/:driverId/force-offline', forceDriverOffline);

export default router;