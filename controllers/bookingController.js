import Booking from "../models/bookingModel.js";
import User from "../models/userModel.js";
import Vehicle from "../models/vehicleModel.js";
import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";

// Haversine formula to calculate distance between two coordinates in kilometers
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Simple zone detection based on coordinates
const getZone = (lat, lon) => {
  if (lat >= 25.0 && lat <= 25.5 && lon >= 55.0 && lon <= 55.5) return "Dubai";
  if (lat >= 24.0 && lat <= 24.5 && lon >= 54.0 && lon <= 54.5)
    return "Abu Dhabi";
  return "Other";
};

const createBooking = asyncHandler(async (req, res) => {
  const {
    pickupLat,
    pickupLon,
    pickupAddress,
    dropoffLat,
    dropoffLon,
    dropoffAddress,
    serviceType,
  } = req.body;
  const userId = req.user._id;

  if (
    !pickupLat ||
    !pickupLon ||
    !dropoffLat ||
    !dropoffLon ||
    !pickupAddress ||
    !dropoffAddress ||
    !serviceType
  ) {
    return res.status(400).json({
      message:
        "Pickup and dropoff coordinates, addresses, and service type are required",
      token: req.cookies.token,
    });
  }

  if (!["vehicle cab", "car recovery"].includes(serviceType)) {
    return res.status(400).json({
      message: "Invalid service type",
      token: req.cookies.token,
    });
  }

  const user = await User.findById(userId);
  if (!user || user.kycLevel < 1 || user.kycStatus !== "approved") {
    return res.status(403).json({
      message: "KYC Level 1 must be approved to create a booking",
      token: req.cookies.token,
    });
  }

  const distance = getDistance(pickupLat, pickupLon, dropoffLat, dropoffLon);
  const fare = distance * 7; // 7 AED per kilometer
  const pickupZone = getZone(pickupLat, pickupLon);
  const dropoffZone = getZone(dropoffLat, dropoffLon);

  const booking = new Booking({
    userId,
    pickupLocation: {
      type: "Point",
      coordinates: [pickupLon, pickupLat],
      address: pickupAddress,
      zone: pickupZone,
    },
    dropoffLocation: {
      type: "Point",
      coordinates: [dropoffLon, dropoffLat],
      address: dropoffAddress,
      zone: dropoffZone,
    },
    distance,
    fare,
    serviceType,
    status: "pending",
  });

  await booking.save();

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(201).json({
    message: "Booking created successfully",
    bookingId: booking._id,
    fare,
    distance,
    token,
  });
});

const getNearbyDrivers = asyncHandler(async (req, res) => {
  const { lat, lon, serviceType } = req.query;
  const userId = req.user._id;

  if (!lat || !lon || !serviceType) {
    return res.status(400).json({
      message: "Latitude, longitude, and service type are required",
      token: req.cookies.token,
    });
  }

  const user = await User.findById(userId);
  if (!user || user.kycLevel < 1 || user.kycStatus !== "approved") {
    return res.status(403).json({
      message: "KYC Level 1 must be approved to search for drivers",
      token: req.cookies.token,
    });
  }

  const drivers = await User.find({
    role: "driver",
    kycLevel: 2,
    kycStatus: "approved",
  }).populate({
    path: "pendingVehicleData",
    match: { serviceType, status: "approved" },
  });

  const nearbyDrivers = await Promise.all(
    drivers
      .filter((driver) => driver.pendingVehicleData)
      .map(async (driver) => {
        // Mock driver location (replace with real-time location in production)
        const driverLat = parseFloat(lat) + (Math.random() - 0.5) * 0.1;
        const driverLon = parseFloat(lon) + (Math.random() - 0.5) * 0.1;
        const distance = getDistance(lat, lon, driverLat, driverLon);
        if (distance <= 10) {
          let sponsorName = null;
          if (driver.sponsorBy) {
            const sponsor = await User.findOne({
              $or: [
                { sponsorId: driver.sponsorBy },
                { username: driver.sponsorBy },
              ],
            });
            sponsorName = sponsor
              ? `${sponsor.firstName} ${sponsor.lastName}`
              : null;
          }
          return {
            driverId: driver._id,
            username: driver.username,
            name: `${driver.firstName} ${driver.lastName}`,
            email: driver.email,
            sponsorId: driver.sponsorId,
            sponsorName,
            vehicle: driver.pendingVehicleData,
            distance,
            location: { lat: driverLat, lon: driverLon },
          };
        }
        return null;
      })
  );

  const filteredDrivers = nearbyDrivers.filter((driver) => driver !== null);
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Nearby drivers retrieved successfully",
    drivers: filteredDrivers,
    totalDrivers: filteredDrivers.length,
    token,
  });
});

const acceptBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  const driverId = req.user._id;

  const user = await User.findById(driverId);
  if (
    !user ||
    user.role !== "driver" ||
    user.kycLevel < 2 ||
    user.kycStatus !== "approved"
  ) {
    return res.status(403).json({
      message: "Only approved drivers can accept bookings",
      token: req.cookies.token,
    });
  }

  const vehicle = await Vehicle.findOne({
    userId: driverId,
    status: "approved",
  });
  if (!vehicle) {
    return res.status(403).json({
      message: "No approved vehicle found for this driver",
      token: req.cookies.token,
    });
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return res.status(404).json({
      message: "Booking not found",
      token: req.cookies.token,
    });
  }
  if (booking.status !== "pending") {
    return res.status(400).json({
      message: "Booking is not in pending status",
      token: req.cookies.token,
    });
  }

  booking.driverId = driverId;
  booking.vehicleId = vehicle._id;
  booking.status = "accepted";
  await booking.save();

  const token = jwt.sign({ id: driverId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Booking accepted successfully",
    bookingId,
    token,
  });
});

const updateBookingStatus = asyncHandler(async (req, res) => {
  const { bookingId, status } = req.body;
  const userId = req.user._id;

  if (!["in_progress", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({
      message:
        "Invalid status. Must be 'in_progress', 'completed', or 'cancelled'",
      token: req.cookies.token,
    });
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return res.status(404).json({
      message: "Booking not found",
      token: req.cookies.token,
    });
  }

  if (
    booking.driverId?.toString() !== userId.toString() &&
    booking.userId.toString() !== userId.toString()
  ) {
    return res.status(403).json({
      message: "Only the booking user or assigned driver can update status",
      token: req.cookies.token,
    });
  }

  if (status === "in_progress" && booking.status !== "accepted") {
    return res.status(400).json({
      message: "Booking must be accepted before setting to in_progress",
      token: req.cookies.token,
    });
  }

  if (status === "completed" && booking.status !== "in_progress") {
    return res.status(400).json({
      message: "Booking must be in_progress before setting to completed",
      token: req.cookies.token,
    });
  }

  booking.status = status;
  await booking.save();

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: `Booking status updated to ${status}`,
    bookingId,
    token,
  });
});

const getUserBookings = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const role = req.user.role;

  let bookings;
  if (role === "driver") {
    bookings = await Booking.find({ driverId: userId })
      .populate("userId", "username firstName lastName email")
      .populate("vehicleId")
      .sort({ createdAt: -1 });
  } else {
    bookings = await Booking.find({ userId })
      .populate("driverId", "username firstName lastName email")
      .populate("vehicleId")
      .sort({ createdAt: -1 });
  }

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Bookings retrieved successfully",
    bookings: bookings.map((booking) => ({
      ...booking.toObject(),
      userId: booking.userId
        ? {
            id: booking.userId._id,
            username: booking.userId.username,
            firstName: booking.userId.firstName,
            lastName: booking.userId.lastName,
            email: booking.userId.email,
          }
        : null,
      driverId: booking.driverId
        ? {
            id: booking.driverId._id,
            username: booking.driverId.username,
            firstName: booking.driverId.firstName,
            lastName: booking.driverId.lastName,
            email: booking.driverId.email,
          }
        : null,
    })),
    totalBookings: bookings.length,
    token,
  });
});

const cancelBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  const userId = req.user._id;

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return res.status(404).json({
      message: "Booking not found",
      token: req.cookies.token,
    });
  }

  if (booking.userId.toString() !== userId.toString()) {
    return res.status(403).json({
      message: "Only the booking user can cancel the booking",
      token: req.cookies.token,
    });
  }

  if (booking.status !== "pending" && booking.status !== "accepted") {
    return res.status(400).json({
      message: "Only pending or accepted bookings can be cancelled",
      token: req.cookies.token,
    });
  }

  booking.status = "cancelled";
  await booking.save();

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: "Booking cancelled successfully",
    bookingId,
    token,
  });
});

export {
  createBooking,
  getNearbyDrivers,
  acceptBooking,
  updateBookingStatus,
  getUserBookings,
  cancelBooking,
};
