import asyncHandler from "express-async-handler";
import { io } from "../index.js";
import { redisService } from "../services/redis.js";
import { googleMapsService } from "../services/googleMaps.js";
import { pricingService } from "../services/pricing.js";
import bookingModel from "../models/bookingModel.js";
import _ from "lodash";

const createCarRecoveryBooking = asyncHandler(async (req, res) => {
  const { serviceType } = req.params;
  if (req.user.role !== "customer") {
    return res.status(403).json({ message: "Only customers can book rides" });
  }

  const { pickupLocation, destination, two_way } = req.body;

  // Calculate distance and duration
  const { distance, duration } = await googleMapsService.getDistance(
    pickupLocation,
    destination
  );

  // Calculate price
  const price = parseFloat(
    pricingService
      .calculatePrice(serviceType, distance, duration, two_way)
      .toFixed(2)
  );

  const booking = new bookingModel({
    user: req.user._id,
    serviceType: "car recovery",
    pickupLocation: {
      type: "Point",
      coordinates: [pickupLocation.lng, pickupLocation.lat],
    },
    distance,
    fare: price,
    baseFare: price,
    dropoffLocation: {
      type: "Point",
      coordinates: [destination.lng, destination.lat],
    },
    status: "pending",
    routeType: two_way ? "two_way" : "one_way",
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

  if (booking.status !== "pending") {
    return res
      .status(400)
      .json({ message: "Only pending bookings can be broadcasted" });
  }

  const nearbyDrivers = await redisService.getNearbyDrivers(
    booking.pickupLocation.coordinates[1],
    booking.pickupLocation.coordinates[0],
    5 // Find nearby drivers (within 5km)
  );

  io.to(nearbyDrivers.map((d) => `driver_${d}`)).emit("booking:new", {
    booking: _.pick(booking, [
      "_id",
      "serviceType",
      "pickupLocation",
      "dropoffLocation",
      "fare",
      "routeType",
      "createdAt",
    ]),
  });

  res.status(200).json({ message: "Booking broadcasted to nearby drivers" });
});

const updateBookingPrice = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { newFare } = req.body;
  if (req.user.role !== "customer") {
    return res.status(403).json({ message: "Only customers can update price" });
  }

  const booking = await bookingModel.findById(bookingId);
  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  if (booking.user.toString() !== req.user._id.toString()) {
    return res
      .status(403)
      .json({ message: "Not authorized to update this booking" });
  }

  if (booking.status !== "pending") {
    return res
      .status(400)
      .json({ message: "Only pending bookings can have their price updated" });
  }

  booking.fare = newFare;
  if (booking.fare < booking.baseFare * 0.1) {
    return res
      .status(400)
      .json({ message: "New fare cannot be less than 10% of base fare" });
  }
  await booking.save();

  res.status(200).json({ message: "Booking price updated", booking });
});

const acceptBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  if (req.user.role !== "driver") {
    return res
      .status(403)
      .json({ message: "Only drivers can accept bookings" });
  }

  const booking = await bookingModel.findById(bookingId);
  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  if (booking.status !== "pending") {
    return res
      .status(400)
      .json({ message: "Only pending bookings can be accepted" });
  }

  booking.driver = req.user._id;
  booking.status = "accepted";
  await booking.save();

  io.emit(`booking:accepted`, {
    status: "accepted",
    bookingId: booking._id,
    driver: _.pick(req.user, ["_id", "name", "email", "phone"]),
  });

  res.status(200).json({ message: "Booking accepted", booking });
});

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
  acceptBooking,
};
