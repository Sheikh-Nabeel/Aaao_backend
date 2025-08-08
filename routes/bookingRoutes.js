import express from "express";
import {
  createBooking,
  getNearbyDrivers,
  acceptBooking,
  updateBookingStatus,
  getUserBookings,
  cancelBooking,
} from "../controllers/bookingController.js";
import authHandler from "../middlewares/authMIddleware.js";

const router = express.Router();

router.post("/create-booking", authHandler, createBooking);
router.get("/nearby-drivers", authHandler, getNearbyDrivers);
router.post("/accept-booking", authHandler, acceptBooking);
router.post("/update-booking-status", authHandler, updateBookingStatus);
router.get("/bookings", authHandler, getUserBookings);
router.post("/cancel-booking", authHandler, cancelBooking);

export default router;
