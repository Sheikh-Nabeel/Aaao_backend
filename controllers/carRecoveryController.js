import Booking from "../models/bookingModel.js";
import User from "../models/userModel.js";
import Vehicle from "../models/vehicleModel.js";
import PricingConfig from "../models/pricingModel.js";
import asyncHandler from "express-async-handler";
import { calculateDistance } from "../utils/distanceCalculator.js";
import mongoose from "mongoose";
import { webSocketService } from "../services/websocketService.js";

const CAR_RECOVERY_SERVICES = {
  standard: {
    id: "standard",
    name: "Standard Recovery",
    description: "Standard vehicle recovery service",
    subcategories: [
      {
        id: "standard_basic",
        name: "Basic Recovery",
        description: "Basic vehicle recovery service",
        baseFare: 1000,
        perKmRate: 50,
        minCharge: 1000,
        maxDistance: 100,
        vehicleTypes: ["car", "suv", "bike"],
      },
    ],
  },
  emergency: {
    id: "emergency",
    name: "Emergency Recovery",
    description: "24/7 Emergency vehicle recovery service",
    subcategories: [
      {
        id: "emergency_24x7",
        name: "24/7 Emergency",
        description: "24/7 Emergency recovery service",
        baseFare: 2000,
        perKmRate: 75,
        minCharge: 2000,
        maxDistance: 200,
        vehicleTypes: ["car", "suv", "bike", "truck"],
      },
    ],
  },
};

// Helper function to find a subcategory by ID
const findSubcategory = (serviceType, subcategoryId) => {
  const service = CAR_RECOVERY_SERVICES[serviceType];
  if (!service) return null;

  return service.subcategories?.find(
    (subcategory) => subcategory.id === subcategoryId
  );
};

// @desc    Get all car recovery services
// @route   GET /api/car-recovery/services
// @access  Public
export const getCarRecoveryServices = asyncHandler(async (req, res) => {
  try {
    // Transform the services object to include only necessary fields
    const services = Object.values(CAR_RECOVERY_SERVICES).map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      subcategories: service.subcategories?.map((sub) => ({
        id: sub.id,
        name: sub.name,
        description: sub.description,
        baseFare: sub.baseFare,
        perKmRate: sub.perKmRate,
        minCharge: sub.minCharge,
        maxDistance: sub.maxDistance,
        vehicleTypes: sub.vehicleTypes,
      })),
    }));

    res.json(services);
  } catch (error) {
    console.error("Error getting car recovery services:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Create a new car recovery request
// @route   POST /api/car-recovery/
// @access  Private
export const createCarRecoveryRequest = asyncHandler(async (req, res) => {
  try {
    const {
      serviceType,
      subcategoryId,
      pickupLocation,
      dropoffLocation,
      vehicleDetails,
      additionalNotes,
      paymentMethod,
      scheduledTime,
      safetyPreferences = {},
    } = req.body;

    // Validate required fields
    if (!serviceType || !pickupLocation || !vehicleDetails) {
      return res.status(400).json({ message: "Required fields are missing" });
    }

    // Validate service type and subcategory
    const subcategory = findSubcategory(serviceType, subcategoryId);
    if (!subcategory) {
      return res
        .status(400)
        .json({ message: "Invalid service type or subcategory" });
    }

    // Create new recovery request
    const recoveryRequest = new Booking({
      user: req.user._id,
      serviceType,
      subcategoryId,
      pickupLocation,
      dropoffLocation,
      vehicleDetails,
      additionalNotes,
      paymentMethod,
      scheduledTime: scheduledTime || new Date(),
      status: "pending",
      serviceCategory: "car_recovery",
      safetyPreferences: {
        pinkCaptainRequired: safetyPreferences.pinkCaptainRequired || false,
        familyWithGuardian: safetyPreferences.familyWithGuardian || false,
        noMaleCompanion: safetyPreferences.noMaleCompanion || false,
        emergencyContact: safetyPreferences.emergencyContact || null,
      },
      fareDetails: {
        baseFare: subcategory.baseFare,
        perKmRate: subcategory.perKmRate,
        estimatedDistance: 0, // Will be calculated
        estimatedFare: 0, // Will be calculated
        currency: "AED",
      },
    });

    // Calculate distance and fare
    if (pickupLocation.coordinates && dropoffLocation?.coordinates) {
      const distance = await calculateDistance(
        pickupLocation.coordinates,
        dropoffLocation.coordinates
      );

      recoveryRequest.fareDetails.estimatedDistance = distance;
      recoveryRequest.fareDetails.estimatedFare = Math.max(
        subcategory.baseFare + distance * subcategory.perKmRate,
        subcategory.minCharge
      );
    }

    // Save the recovery request
    await recoveryRequest.save();

    // Notify available drivers via WebSocket
    webSocketService.notifyDrivers("new_recovery_request", {
      requestId: recoveryRequest._id,
      pickupLocation: recoveryRequest.pickupLocation,
      vehicleType: recoveryRequest.vehicleDetails.type,
      estimatedFare: recoveryRequest.fareDetails.estimatedFare,
    });

    res.status(201).json({
      success: true,
      data: recoveryRequest,
      message: "Recovery request created successfully",
    });
  } catch (error) {
    console.error("Error creating recovery request:", error);
    res.status(500).json({
      success: false,
      message: "Error creating recovery request",
      error: error.message,
    });
  }
});

// @desc    Get a specific car recovery request
// @route   GET /api/car-recovery/:id
// @access  Private
export const getCarRecoveryRequest = asyncHandler(async (req, res) => {
  try {
    const request = await Booking.findOne({
      _id: req.params.id,
      serviceCategory: "car_recovery",
      $or: [{ user: req.user._id }, { driver: req.user._id }],
    })
      .populate("user", "firstName lastName phoneNumber")
      .populate("driver", "firstName lastName phoneNumber");

    if (!request) {
      return res.status(404).json({ message: "Recovery request not found" });
    }

    res.json(request);
  } catch (error) {
    console.error("Error getting recovery request:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Get user's car recovery requests
// @route   GET /api/car-recovery/user/requests
// @access  Private
export const getUserCarRecoveryRequests = asyncHandler(async (req, res) => {
  try {
    const { status } = req.query;
    const query = {
      user: req.user._id,
      serviceCategory: "car_recovery",
    };

    if (status) {
      query.status = status;
    }

    const requests = await Booking.find(query)
      .sort({ createdAt: -1 })
      .populate("driver", "firstName lastName phoneNumber");

    res.json(requests);
  } catch (error) {
    console.error("Error getting user recovery requests:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Get driver's car recovery requests
// @route   GET /api/car-recovery/driver/requests
// @access  Private
export const getDriverCarRecoveryRequests = asyncHandler(async (req, res) => {
  try {
    const { status } = req.query;
    const query = {
      driver: req.user._id,
      serviceCategory: "car_recovery",
    };

    if (status) {
      query.status = status;
    }

    const requests = await Booking.find(query)
      .sort({ createdAt: -1 })
      .populate("user", "firstName lastName phoneNumber");

    res.json(requests);
  } catch (error) {
    console.error("Error getting driver recovery requests:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Update booking status
// @route   PUT /api/car-recovery/:id/status
// @access  Private
export const updateBookingStatus = asyncHandler(async (req, res) => {
  try {
    const { status, driverId } = req.body;
    const { id } = req.params;

    const booking = await Booking.findOne({
      _id: id,
      serviceCategory: "car_recovery",
    });

    if (!booking) {
      return res.status(404).json({ message: "Recovery request not found" });
    }

    // Authorization check - only the assigned driver or admin can update status
    if (
      booking.driver &&
      booking.driver.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this request" });
    }

    // Update status and driver if provided
    booking.status = status;
    if (driverId) {
      booking.driver = driverId;
    }

    // Update timestamps based on status
    const now = new Date();
    switch (status) {
      case "accepted":
        booking.acceptedAt = now;
        break;
      case "started":
        booking.startedAt = now;
        break;
      case "completed":
        booking.completedAt = now;
        booking.fareDetails.finalFare = booking.fareDetails.estimatedFare; // Can be adjusted later
        break;
      case "cancelled":
        booking.cancelledAt = now;
        booking.cancelledBy = req.user._id;
        break;
    }

    await booking.save();

    // Notify user about status update
    if (booking.user) {
      webSocketService.notifyUser(booking.user, "recovery_status_update", {
        requestId: booking._id,
        status: booking.status,
        driver: booking.driver,
        updatedAt: now,
      });
    }

    res.json({
      success: true,
      data: booking,
      message: "Recovery request status updated successfully",
    });
  } catch (error) {
    console.error("Error updating recovery request status:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Cancel a car recovery request
// @route   PUT /api/car-recovery/:id/cancel
// @access  Private
export const cancelCarRecoveryRequest = asyncHandler(async (req, res) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findOne({
      _id: req.params.id,
      user: req.user._id,
      serviceCategory: "car_recovery",
      status: { $in: ["pending", "accepted"] },
    });

    if (!booking) {
      return res
        .status(404)
        .json({ message: "Recovery request not found or cannot be cancelled" });
    }

    booking.status = "cancelled";
    booking.cancelledAt = new Date();
    booking.cancellationReason = reason || "User cancelled";
    booking.cancelledBy = req.user._id;

    await booking.save();

    // Notify driver if assigned
    if (booking.driver) {
      webSocketService.notifyUser(
        booking.driver,
        "recovery_request_cancelled",
        {
          requestId: booking._id,
          reason: booking.cancellationReason,
        }
      );
    }

    res.json({
      success: true,
      message: "Recovery request cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling recovery request:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Update driver's location
// @route   POST /api/car-recovery/:id/location
// @access  Private
export const updateDriverLocation = asyncHandler(async (req, res) => {
  try {
    const { coordinates } = req.body;
    const booking = await Booking.findOne({
      _id: req.params.id,
      driver: req.user._id,
      serviceCategory: "car_recovery",
    });

    if (!booking) {
      return res.status(404).json({ message: "Recovery request not found" });
    }

    // Update current location
    booking.currentLocation = {
      type: "Point",
      coordinates: [coordinates.longitude, coordinates.latitude],
    };

    await booking.save();

    // Notify user about driver's location
    webSocketService.notifyUser(booking.user, "driver_location_update", {
      requestId: booking._id,
      location: booking.currentLocation,
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      message: "Location updated successfully",
    });
  } catch (error) {
    console.error("Error updating driver location:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Send a message in recovery request
// @route   POST /api/car-recovery/:id/messages
// @access  Private
export const sendMessage = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { message, senderType } = req.body;

    if (!["user", "driver"].includes(senderType)) {
      return res.status(400).json({ message: "Invalid sender type" });
    }

    const booking = await Booking.findOne({
      _id: id,
      $or: [{ user: req.user._id }, { driver: req.user._id }],
      serviceCategory: "car_recovery",
    });

    if (!booking) {
      return res.status(404).json({ message: "Recovery request not found" });
    }

    // Add message to chat
    const newMessage = {
      sender: req.user._id,
      senderType,
      message,
      timestamp: new Date(),
    };

    if (!booking.messages) {
      booking.messages = [];
    }
    booking.messages.push(newMessage);
    await booking.save();

    // Notify the other party
    const recipient = senderType === "user" ? booking.driver : booking.user;
    if (recipient) {
      webSocketService.notifyUser(recipient, "new_message", {
        requestId: booking._id,
        message: newMessage,
      });
    }

    res.status(201).json({
      success: true,
      data: newMessage,
      message: "Message sent successfully",
    });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Get messages for a recovery request
// @route   GET /api/car-recovery/:id/messages
// @access  Private
export const getMessages = asyncHandler(async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      $or: [{ user: req.user._id }, { driver: req.user._id }],
      serviceCategory: "car_recovery",
    })
      .select("messages")
      .populate("messages.sender", "firstName lastName");

    if (!booking) {
      return res.status(404).json({ message: "Recovery request not found" });
    }

    res.json(booking.messages || []);
  } catch (error) {
    console.error("Error getting messages:", error);
    res.status(500).json({ message: "Server error" });
  }
});


// NEW: Search drivers by partial text (name, username, email, phoneNumber)
export const searchDrivers = asyncHandler(async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ success: false, message: "q is required" });

    // Build case-insensitive regex (escape special chars lightly)
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const drivers = await User.find({
      role: "driver",
      $or: [
        { firstName: regex },
        { lastName: regex },
        { username: regex },
        { email: regex },
        { phoneNumber: regex },
      ],
    })
      .limit(50)
      .select("_id firstName lastName username email phoneNumber driverStatus currentLocation")
      .lean();

    const ids = drivers.map((d) => d._id);
    const vehicles = await Vehicle.find({ userId: { $in: ids } })
      .select("userId serviceType serviceCategory vehicleType vehicleMakeModel vehicleColor vehiclePlateNumber status isActive")
      .lean();
    const byUser = vehicles.reduce((acc, v) => {
      const key = String(v.userId);
      (acc[key] = acc[key] || []).push(v);
      return acc;
    }, {});

    const data = drivers
      .map((d) => ({
        id: String(d._id),
        name: `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim(),
        username: d.username,
        email: d.email,
        phoneNumber: d.phoneNumber,
        driverStatus: d.driverStatus,
        currentLocation: d.currentLocation || null,
        vehicles: (byUser[String(d._id)] || []).map((v) => ({
          serviceType: v.serviceType || null,
          serviceCategory: v.serviceCategory || null,
          vehicleType: v.vehicleType || null,
          vehicleMakeModel: v.vehicleMakeModel || null,
          vehicleColor: v.vehicleColor || null,
          vehiclePlateNumber: v.vehiclePlateNumber || null,
          status: v.status || null,
          isActive: v.isActive ?? null,
        })),
      }))
      .filter((d) => Array.isArray(d.vehicles) && d.vehicles.length > 0);

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error searching drivers", error: error.message });
  }
});

// NEW: Pin a driver (max 3)
export const pinDriver = asyncHandler(async (req, res) => {
  try {
    const driverId = String(req.params.driverId || "").trim();
    if (!driverId) return res.status(400).json({ success: false, message: "driverId is required" });

    const driver = await User.findOne({ _id: driverId, role: "driver" })
      .select("_id firstName lastName username email phoneNumber driverStatus currentLocation")
      .lean();
    if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });

    const me = await User.findById(req.user._id).select("pinnedDrivers");
    const already = (me.pinnedDrivers || []).map(String);

    const vehicles = await Vehicle.find({ userId: driver._id })
      .select("serviceType serviceCategory vehicleType vehicleMakeModel vehicleColor vehiclePlateNumber status isActive")
      .lean();

    const payload = {
      id: String(driver._id),
      name: `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim(),
      username: driver.username,
      email: driver.email,
      phoneNumber: driver.phoneNumber,
      driverStatus: driver.driverStatus,
      currentLocation: driver.currentLocation || null,
      vehicles: vehicles.map(v => ({
        serviceType: v.serviceType || null,
        serviceCategory: v.serviceCategory || null,
        vehicleType: v.vehicleType || null,
        vehicleMakeModel: v.vehicleMakeModel || null,
        vehicleColor: v.vehicleColor || null,
        vehiclePlateNumber: v.vehiclePlateNumber || null,
        status: v.status || null,
        isActive: v.isActive ?? null,
      })),
    };

    if (already.includes(String(driver._id))) {
      return res.json({ success: true, message: "Already pinned", data: payload });
    }
    if (already.length >= 3) {
      return res.status(400).json({ success: false, message: "You can pin up to 3 drivers" });
    }

    await User.updateOne(
      { _id: req.user._id },
      { $addToSet: { pinnedDrivers: driver._id } }
    );

    return res.json({ success: true, message: "Driver pinned", data: payload });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error pinning driver", error: error.message });
  }
});

// NEW: Unpin a driver
export const unpinDriver = asyncHandler(async (req, res) => {
  try {
    const driverId = String(req.params.driverId || "").trim();
    if (!driverId) return res.status(400).json({ success: false, message: "driverId is required" });

    await User.updateOne(
      { _id: req.user._id },
      { $pull: { pinnedDrivers: driverId } }
    );

    return res.json({ success: true, message: "Driver unpinned" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error unpinning driver", error: error.message });
  }
});

// NEW: List pinned drivers
export const getPinnedDrivers = asyncHandler(async (req, res) => {
  try {
    const me = await User.findById(req.user._id)
      .select("pinnedDrivers")
      .populate("pinnedDrivers", "firstName lastName username email phoneNumber driverStatus currentLocation")
      .lean();

    const list = me?.pinnedDrivers || [];
    const ids = list.map((d) => d._id);
    const vehicles = await Vehicle.find({ userId: { $in: ids } })
      .select("userId serviceType serviceCategory vehicleType vehicleMakeModel vehicleColor vehiclePlateNumber status isActive")
      .lean();
    const byUser = vehicles.reduce((acc, v) => {
      const key = String(v.userId);
      (acc[key] = acc[key] || []).push(v);
      return acc;
    }, {});

    const data = list
      .map((d) => ({
        id: String(d._id),
        name: `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim(),
        username: d.username,
        email: d.email,
        phoneNumber: d.phoneNumber,
        driverStatus: d.driverStatus,
        currentLocation: d.currentLocation || null,
        vehicles: (byUser[String(d._id)] || []).map((v) => ({
          serviceType: v.serviceType || null,
          serviceCategory: v.serviceCategory || null,
          vehicleType: v.vehicleType || null,
          vehicleMakeModel: v.vehicleMakeModel || null,
          vehicleColor: v.vehicleColor || null,
          vehiclePlateNumber: v.vehiclePlateNumber || null,
          status: v.status || null,
          isActive: v.isActive ?? null,
        })),
      }))
      .filter((d) => Array.isArray(d.vehicles) && d.vehicles.length > 0);

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error fetching pinned drivers", error: error.message });
  }
});

// NEW: Favorite a driver (unlimited)
export const favoriteDriver = asyncHandler(async (req, res) => {
  try {
    const driverId = String(req.params.driverId || "").trim();
    if (!driverId) return res.status(400).json({ success: false, message: "driverId is required" });

    const driver = await User.findOne({ _id: driverId, role: "driver" })
      .select("_id firstName lastName username email phoneNumber driverStatus currentLocation")
      .lean();
    if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });

    await User.updateOne(
      { _id: req.user._id },
      { $addToSet: { favoriteDrivers: driver._id } }
    );

    const vehicles = await Vehicle.find({ userId: driver._id })
      .select("serviceType serviceCategory vehicleType vehicleMakeModel vehicleColor vehiclePlateNumber status isActive")
      .lean();

    return res.json({
      success: true,
      message: "Driver favorited",
      data: {
        id: String(driver._id),
        name: `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim(),
        username: driver.username,
        email: driver.email,
        phoneNumber: driver.phoneNumber,
        driverStatus: driver.driverStatus,
        currentLocation: driver.currentLocation || null,
        vehicles: vehicles.map(v => ({
          serviceType: v.serviceType || null,
          serviceCategory: v.serviceCategory || null,
          vehicleType: v.vehicleType || null,
          vehicleMakeModel: v.vehicleMakeModel || null,
          vehicleColor: v.vehicleColor || null,
          vehiclePlateNumber: v.vehiclePlateNumber || null,
          status: v.status || null,
          isActive: v.isActive ?? null,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error favoriting driver", error: error.message });
  }
});

// NEW: Unfavorite a driver
export const unfavoriteDriver = asyncHandler(async (req, res) => {
  try {
    const driverId = String(req.params.driverId || "").trim();
    if (!driverId) return res.status(400).json({ success: false, message: "driverId is required" });

    await User.updateOne(
      { _id: req.user._id },
      { $pull: { favoriteDrivers: driverId } }
    );

    return res.json({ success: true, message: "Driver unfavorited" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error unfavoriting driver", error: error.message });
  }
});

// NEW: List favorite drivers
export const getFavoriteDrivers = asyncHandler(async (req, res) => {
  try {
    const me = await User.findById(req.user._id)
      .select("favoriteDrivers")
      .populate("favoriteDrivers", "firstName lastName username email phoneNumber driverStatus currentLocation")
      .lean();

    const list = me?.favoriteDrivers || [];
    const ids = list.map((d) => d._id);
    const vehicles = await Vehicle.find({ userId: { $in: ids } })
      .select("userId serviceType serviceCategory vehicleType vehicleMakeModel vehicleColor vehiclePlateNumber status isActive")
      .lean();
    const byUser = vehicles.reduce((acc, v) => {
      const key = String(v.userId);
      (acc[key] = acc[key] || []).push(v);
      return acc;
    }, {});

    const data = list.map((d) => ({
      id: String(d._id),
      name: `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim(),
      username: d.username,
      email: d.email,
      phoneNumber: d.phoneNumber,
      driverStatus: d.driverStatus,
      currentLocation: d.currentLocation || null,
      vehicles: (byUser[String(d._id)] || []).map((v) => ({
        serviceType: v.serviceType || null,
        serviceCategory: v.serviceCategory || null,
        vehicleType: v.vehicleType || null,
        vehicleMakeModel: v.vehicleMakeModel || null,
        vehicleColor: v.vehicleColor || null,
        vehiclePlateNumber: v.vehiclePlateNumber || null,
        status: v.status || null,
        isActive: v.isActive ?? null,
      })),
    }));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error fetching favorite drivers", error: error.message });
  }
});

// NEW: Saved locations CRUD
export const addSavedLocation = asyncHandler(async (req, res) => {
  try {
    const { label, address, location, notes } = req.body || {};
    if (!location?.coordinates || location.coordinates.length !== 2) {
      return res.status(400).json({ success: false, message: "location.coordinates [lng, lat] is required" });
    }
    const payload = {
      label: label || "",
      address: address || "",
      location: {
        type: "Point",
        coordinates: [Number(location.coordinates[0]), Number(location.coordinates[1])],
      },
      notes: notes || "",
      createdAt: new Date(),
    };

    await User.updateOne({ _id: req.user._id }, { $push: { savedLocations: payload } });

    const me = await User.findById(req.user._id).select("savedLocations").lean();
    return res.status(201).json({ success: true, data: me.savedLocations });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error adding saved location", error: error.message });
  }
});

export const updateSavedLocation = asyncHandler(async (req, res) => {
  try {
    const { locationId } = req.params;
    const { label, address, location, notes } = req.body || {};

    const me = await User.findById(req.user._id).select("savedLocations");
    const loc = me.savedLocations.id(locationId);
    if (!loc) return res.status(404).json({ success: false, message: "Saved location not found" });

    if (label !== undefined) loc.label = label;
    if (address !== undefined) loc.address = address;
    if (notes !== undefined) loc.notes = notes;
    if (location?.coordinates && location.coordinates.length === 2) {
      loc.location = {
        type: "Point",
        coordinates: [Number(location.coordinates[0]), Number(location.coordinates[1])],
      };
    }
    await me.save();

    return res.json({ success: true, data: me.savedLocations });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error updating saved location", error: error.message });
  }
});

export const deleteSavedLocation = asyncHandler(async (req, res) => {
  try {
    const { locationId } = req.params;
    const me = await User.findById(req.user._id).select("savedLocations");
    const loc = me.savedLocations.id(locationId);
    if (!loc) return res.status(404).json({ success: false, message: "Saved location not found" });

    loc.deleteOne();
    await me.save();

    return res.json({ success: true, message: "Saved location deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error deleting saved location", error: error.message });
  }
});

export const getSavedLocations = asyncHandler(async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("savedLocations").lean();
    return res.json({ success: true, data: me?.savedLocations || [] });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error fetching saved locations", error: error.message });
  }
});

export const getCarRecoveryHistoryStats = asyncHandler(async (req, res) => {
  try {
    const { id, role, limit = 20, page = 1 } = req.query;

    // Resolve target ID: prefer explicit id, fallback to authenticated user
    const targetId = String(id || req.user?._id || "").trim();
    if (!targetId) {
      return res
        .status(400)
        .json({ success: false, message: "id is required" });
    }

    let objectId;
    try {
      objectId = new mongoose.Types.ObjectId(targetId);
    } catch {
      return res.status(400).json({ success: false, message: "invalid id" });
    }

    // Perspective: driver vs customer (default: customer)
    const perspective =
      String(role || "customer").toLowerCase() === "driver"
        ? "driver"
        : "customer";

    // Car recovery filter: include both modern and legacy values in DB
    const carRecoveryCategories = [
      "towing services",
      "winching services",
      "roadside assistance",
      "specialized/heavy recovery",
      "car_recovery", // legacy in some controllers
    ];

    const baseMatch = {
      $and: [
        {
          $or: [
            { serviceType: "car recovery" },
            { serviceCategory: { $in: carRecoveryCategories } },
          ],
        },
        perspective === "driver" ? { driver: objectId } : { user: objectId },
      ],
    };

    // Count totals per status
    const grouped = await Booking.aggregate([
      { $match: baseMatch },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const byStatus = grouped.reduce((acc, cur) => {
      acc[cur._id] = cur.count;
      return acc;
    }, {});

    const total = await Booking.countDocuments(baseMatch);

    const totals = {
      total,
      pending: byStatus["pending"] || 0,
      accepted: byStatus["accepted"] || 0,
      started: byStatus["started"] || 0,
      in_progress: byStatus["in_progress"] || 0,
      completed: byStatus["completed"] || 0,
      cancelled: byStatus["cancelled"] || 0,
    };

    // Active not terminal
    const active =
      totals.pending + totals.accepted + totals.started + totals.in_progress;

    // Paged recent list
    const pageNum = Math.max(1, Number(page));
    const pageLimit = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * pageLimit;

    const recent = await Booking.find(baseMatch)
      .select(
        "status serviceType serviceCategory user driver fare fareDetails createdAt completedAt cancelledAt distance distanceInMeters"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean();

    return res.json({
      success: true,
      role: perspective, // "customer" | "driver"
      id: String(objectId),
      totals: { ...totals, active },
      breakdownByStatus: totals,
      pagination: { page: pageNum, limit: pageLimit },
      recent,
    });
  } catch (error) {
    console.error("Error getting car recovery history stats:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export const estimateCarRecoveryFare = asyncHandler(async (req, res) => {
  try {
    const {
      pickupLocation,
      dropoffLocation,
      distanceInMeters,
      serviceType = "car recovery",
      serviceCategory = "towing",
      subService, // use as vehicleType for car recovery sub-service
      routeType = "one_way",
      helper = false,
      options = {},
      paymentMethod,
    } = req.body || {};

    if (!pickupLocation?.coordinates && !distanceInMeters) {
      return res.status(400).json({
        success: false,
        message: "pickupLocation.coordinates or distanceInMeters is required",
      });
    }

    // 1) Distance (km)
    let distanceKm = 0;
    if (typeof distanceInMeters === "number") {
      distanceKm = Math.max(0, Number(distanceInMeters) / 1000);
    } else if (pickupLocation?.coordinates && dropoffLocation?.coordinates) {
      distanceKm = await calculateDistance(
        pickupLocation.coordinates,
        dropoffLocation.coordinates
      );
    }

    // 2) Admin config for allowed range and supply/demand percent
    // Try PricingConfig first (present in this controller), else fallback to ComprehensivePricing
    let cfg = await PricingConfig.findOne({ isActive: true }).lean();
    if (!cfg) {
      try {
        const { default: ComprehensivePricing } = await import(
          "../models/comprehensivePricingModel.js"
        );
        cfg = await ComprehensivePricing.findOne({ isActive: true }).lean();
      } catch {}
    }

    const allowedPercentage =
      Number(
        cfg?.adjustmentSettings?.allowedPercentage ??
          cfg?.serviceTypes?.carRecovery?.adjustmentSettings
            ?.allowedPercentage ??
          3
      ) || 3;

    const supplyDemandPercent =
      Number(
        cfg?.serviceTypes?.carRecovery?.supplyDemand?.percent ??
          cfg?.supplyDemand?.percent ??
          allowedPercentage
      ) || allowedPercentage;

    // 3) Supply/Demand: drivers vs nearby pending passengers
    const [lng, lat] = Array.isArray(pickupLocation?.coordinates)
      ? pickupLocation.coordinates
      : [pickupLocation?.coordinates?.lng, pickupLocation?.coordinates?.lat];

    let qualifiedDrivers = [];
    try {
      if (typeof lat === "number" && typeof lng === "number") {
        qualifiedDrivers = await User.find({
          role: "driver",
          kycLevel: { $gte: 2 },
          kycStatus: "approved",
          isActive: true,
          "currentLocation.coordinates": { $exists: true },
          currentLocation: {
            $near: {
              $geometry: { type: "Point", coordinates: [lng, lat] },
              $maxDistance: 3000, // 3km
            },
          },
        })
          .limit(10)
          .select(
            "_id firstName lastName email phoneNumber currentLocation driverStatus gender"
          )
          .lean();
      }
    } catch {}

    const driversCount = qualifiedDrivers.length;

    let nearbyPassengersCount = 0;
    try {
      nearbyPassengersCount = await Booking.countDocuments({
        status: "pending",
        serviceType: "car recovery",
        createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }, // last 10 min
        pickupLocation: {
          $near: {
            $geometry: { type: "Point", coordinates: [lng, lat] },
            $maxDistance: 3000,
          },
        },
      });
    } catch {}

    // 4) Map supply/demand to demandRatio multiplier
    let adjustmentType = "neutral"; // increase | decrease | neutral
    if (driversCount > nearbyPassengersCount) adjustmentType = "decrease";
    else if (driversCount < nearbyPassengersCount) adjustmentType = "increase";

    const surgePercent = adjustmentType === "neutral" ? 0 : supplyDemandPercent;

    const demandRatio =
      adjustmentType === "increase"
        ? 1 + surgePercent / 100
        : adjustmentType === "decrease"
        ? Math.max(0.1, 1 - surgePercent / 100)
        : 1;

    // 5) Compute comprehensive fare (night/surge/waiting handled there)
    const { calculateComprehensiveFare } = await import(
      "../utils/comprehensiveFareCalculator.js"
    );
    const comp = await calculateComprehensiveFare({
      serviceType,
      vehicleType: subService || null,
      distance: distanceKm,
      routeType,
      demandRatio,
      waitingMinutes: Number(options?.waitingTime || 0),
      helper: !!helper,
    });

    const currency = comp?.currency || "AED";
    const totalFare = Number(comp?.totalFare || comp?.total || 0);

    // 6) Range around total (admin allowedPercentage)
    const minFare = Math.max(
      0,
      Math.round(totalFare * (1 - allowedPercentage / 100) * 100) / 100
    );
    const maxFare =
      Math.round(totalFare * (1 + allowedPercentage / 100) * 100) / 100;

    // 7) Driver payload (basic)
    const driversPayload = qualifiedDrivers.map((d) => ({
      id: String(d._id),
      name: `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim(),
      email: d.email || null,
      phoneNumber: d.phoneNumber || null,
      rating: 0,
      totalRides: 0,
      gender: d.gender || "Male",
      currentLocation: {
        coordinates: Array.isArray(d.currentLocation?.coordinates)
          ? d.currentLocation.coordinates
          : null,
      },
      distance: 0,
      estimatedArrival: 0,
    }));

    // 8) Response (no estimatedFare field)
    return res.json({
      success: true,
      message: "Fare estimation calculated successfully",
      data: {
        totalFare,
        currency,
        adjustmentSettings: {
          allowedPercentage,
          minFare,
          maxFare,
          canAdjustFare: true,
        },
        qualifiedDrivers: driversPayload,
        driversCount,
        onlineDriversCount: driversCount,
        nearbyPassengersCount,
        dynamicAdjustment: {
          surgePercent:
            surgePercent === 0
              ? 0
              : adjustmentType === "increase"
              ? surgePercent
              : -surgePercent,
          type: adjustmentType,
        },
        tripDetails: {
          distance: `${distanceKm.toFixed(2)} km`,
          serviceType,
          serviceCategory,
          routeType,
          paymentMethod: paymentMethod || "cash",
        },
        validatedVehicleType: null,
        fareBreakdown: {
          baseFare: Number(comp?.baseFare || 0),
          distanceFare: Number(comp?.distanceFare || 0),
          platformFee: Number(comp?.platformFee || 0),
          nightCharges: Number(comp?.nightCharges || 0),
          surgeCharges: Number(comp?.surgeCharges || 0),
          waitingCharges: Number(comp?.waitingCharges || 0),
          vatAmount: Number(comp?.vatAmount || 0),
          subtotal: Number(comp?.subtotal || 0),
          totalFare,
          breakdown: comp?.breakdown || {},
        },
      },
    });
  } catch (e) {
    console.error("estimateCarRecoveryFare error:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to calculate fare estimation" });
  }
});
