import express from 'express';
import { getQualifiedDrivers, getNearbyDrivers } from '../controllers/qualifiedDriversController.js';
import authHandler from '../middlewares/authMIddleware.js';

const router = express.Router();

// Get qualified drivers with comprehensive information
// GET /api/qualified-drivers?lat=33.6402842&lon=73.0756609&serviceType=bike&vehicleType=economy&driverPreference=nearby&radius=10
router.get('/', authHandler, getQualifiedDrivers);

// Get nearby drivers within radius with comprehensive information
// GET /api/nearby-drivers?lat=33.6402842&lon=73.0756609&radius=5&includeOffline=false
router.get('/nearby', authHandler, getNearbyDrivers);



export default router;