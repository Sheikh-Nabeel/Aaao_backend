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
} from "../controllers/bookingController.js";
import authHandler from "../middlewares/authMIddleware.js";

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

export default router;
