import express from "express";
import {
  createBooking,
  getNearbyDrivers,
  acceptBooking,
  updateBookingStatus,
  getUserBookings,
  cancelBooking,
  raiseFare,
  lowerFare,
  respondToDriverFareOffer,
  getBookingDetails,
  updateBookingFare,
  getBookingFareHistory,
  startRide,
  completeRide,
  getRideMessages,
  submitRating,
  getRideReceipt,
  // New REST API imports
  rejectBooking,
  modifyBookingFare,
  sendMessage,
  updateDriverLocation,
  updateUserLocation,
  updateDriverStatus,
  updateAutoAcceptSettings,
  updateRidePreferences,
  sendBookingRequestToQualifiedDrivers,
  // New negotiation controllers
  proposeFare,
  acceptFare,
  rejectFare,
  fraudCheckBooking,
} from "../controllers/bookingController.js";
import authHandler from "../middlewares/authMIddleware.js";
import adminHandler from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.post("/create-booking", authHandler, createBooking);
router.get("/nearby-drivers", authHandler, getNearbyDrivers);
router.post("/accept-booking/:bookingId", authHandler, acceptBooking);
router.post("/update-booking-status", authHandler, updateBookingStatus);
router.get("/bookings", authHandler, getUserBookings);
router.post("/cancel-booking", authHandler, cancelBooking);
router.post("/raise-fare/:bookingId", authHandler, raiseFare);
router.post("/lower-fare/:bookingId", authHandler, lowerFare);
router.post("/respond-fare-offer/:bookingId", authHandler, respondToDriverFareOffer);

// New REST API endpoints for fare verification and monitoring
router.get("/:bookingId", authHandler, getBookingDetails);
router.put("/:bookingId/fare", authHandler, updateBookingFare);
router.get("/:bookingId/fare-history", authHandler, getBookingFareHistory);

// New ride management endpoints
router.post("/:bookingId/start", authHandler, startRide);
router.post("/:bookingId/complete", authHandler, completeRide);
router.get("/:bookingId/messages", authHandler, getRideMessages);
router.post("/:bookingId/rating", authHandler, submitRating);
router.get("/:bookingId/receipt", authHandler, getRideReceipt);

// Fare negotiation (REST)
router.post("/:bookingId/price/propose", authHandler, proposeFare);
router.post("/:bookingId/price/accept", authHandler, acceptFare);
router.post("/:bookingId/price/reject", authHandler, rejectFare);

// New REST API endpoints for real-time operations
router.post("/:bookingId/reject", authHandler, rejectBooking);
router.post("/:bookingId/modify-fare", authHandler, modifyBookingFare);
router.post("/:bookingId/send-message", authHandler, sendMessage);
// Fraud detection (admin-only)
router.post("/:bookingId/fraud-check", authHandler, adminHandler, fraudCheckBooking);
router.post("/driver/location", authHandler, updateDriverLocation);
router.post("/user/location", authHandler, updateUserLocation);
router.post("/driver/status", authHandler, updateDriverStatus);
router.post("/driver/auto-accept-settings", authHandler, updateAutoAcceptSettings);
router.post("/driver/ride-preferences", authHandler, updateRidePreferences);
router.post("/send-booking-request", authHandler, sendBookingRequestToQualifiedDrivers);

export default router;
