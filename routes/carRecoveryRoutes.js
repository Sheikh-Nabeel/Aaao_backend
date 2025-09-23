import express from 'express';
import protect from '../middlewares/authMIddleware.js';
import {
  getCarRecoveryServices,
  createCarRecoveryRequest,
  getCarRecoveryRequest,
  updateBookingStatus,
  getUserCarRecoveryRequests,
  getDriverCarRecoveryRequests,
  cancelCarRecoveryRequest,
  updateDriverLocation,
  sendMessage,
  getMessages
} from '../controllers/carRecoveryController.js';

const router = express.Router();

// Public routes
router.get('/services', getCarRecoveryServices);

// Protected routes (require authentication)
router.use(protect);

// User routes
router.post('/', createCarRecoveryRequest);
router.get('/user/requests', getUserCarRecoveryRequests);
router.get('/:id', getCarRecoveryRequest);
router.put('/:id/cancel', cancelCarRecoveryRequest);

// Driver routes
router.get('/driver/requests', getDriverCarRecoveryRequests);
router.put('/:id/status', updateBookingStatus);
router.post('/:id/location', updateDriverLocation);

// Messaging
router.post('/:id/messages', sendMessage);
router.get('/:id/messages', getMessages);

export default router;
