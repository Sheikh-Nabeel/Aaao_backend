import express from 'express';
import {
  startAppointment,
  completeAppointment,
  submitCustomerSurvey,
  submitProviderSurvey,
  getAppointmentSurveys,
  resolveAppointmentConflict,
  getGPSFraudReports
} from '../controllers/appointmentController.js';
import authHandler from '../middlewares/authMIddleware.js';
import adminHandler from '../middlewares/adminMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(authHandler);

// Service provider routes
router.post('/start/:bookingId', startAppointment);
router.post('/complete/:bookingId', completeAppointment);
router.post('/provider-survey/:bookingId', submitProviderSurvey);

// Customer routes
router.post('/customer-survey/:bookingId', submitCustomerSurvey);

// Admin routes
router.get('/surveys', adminHandler, getAppointmentSurveys);
router.patch('/resolve/:confirmationId', adminHandler, resolveAppointmentConflict);
router.get('/fraud-reports', adminHandler, getGPSFraudReports);

export default router;