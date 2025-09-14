import asyncHandler from "express-async-handler";
import { io } from "../index.js";
import { redisService } from "../services/redis.js";
import { googleMapsService } from "../services/googleMaps.js";
import { pricingService } from "../services/pricing.js";
import bookingModel from "../models/bookingModel.js";

const createCarRecoveryBooking = asyncHandler(async (req, res) => {
  const { serviceType } = req.params;
  if (req.user.role !== "customer") {
    return res.status(403).json({ message: "Only customers can book rides" });
  }

  const { pickupLocation, destination } = req.body;

  // Calculate distance and duration
  const { distance, duration } = await googleMapsService.getDistance(
    pickupLocation,
    destination
  );

  // Calculate price
  const price = parseFloat(
    pricingService.calculatePrice(serviceType, distance, duration).toFixed(2)
  );

  const booking = new bookingModel({
    user: req.user._id,
    serviceType,
    pickupLocation,
    distance,
    fare: price,
    baseFare: price,
    destination,
    status: "pending",
  });

  await booking.save();

  res.status(201).json({
    price,
    booking,
  });
});

const broadcastBooking = asyncHandler(async (req, res) => {
  // Find nearby drivers (within 5km)
  const booking = await bookingModel.findById(req.params.bookingId);
  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  const nearbyDrivers = await redisService.getNearbyDrivers(
    pickupLocation.lat,
    pickupLocation.lng,
    5 // Find nearby drivers (within 5km)
  );

  io.to(nearbyDrivers.map((d) => `driver_${d}`)).emit("booking:new", {
    bookingId: booking._id,
    pickupLocation,
    destination,
    price,
  });

  res.status(200).json({ message: "Booking broadcasted to nearby drivers" });
});

const updateBookingPrice = asyncHandler(async (req, res) => {});

const completeBooking = asyncHandler(async (req, res) => {});

const cancelBooking = asyncHandler(async (req, res) => {});

const getCurrentBooking = asyncHandler(async (req, res) => {});

export const bookingControllerV2 = {
  createCarRecoveryBooking,
  updateBookingPrice,
  completeBooking,
  cancelBooking,
  getCurrentBooking,
  broadcastBooking,
};
