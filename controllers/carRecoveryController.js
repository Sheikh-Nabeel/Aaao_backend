import Booking from "../models/bookingModel.js";
import User from "../models/userModel.js";
import Vehicle from "../models/vehicleModel.js";
import PricingConfig from "../models/pricingModel.js";
import asyncHandler from "express-async-handler";
import { calculateDistance } from "../utils/distanceCalculator.js";
import mongoose from 'mongoose';
import { webSocketService } from '../services/websocketService.js';

// Car Recovery Service Types and Subcategories
const CAR_RECOVERY_SERVICES = {
  standard: {
    id: 'standard',
    name: 'Standard Recovery',
    description: 'Standard vehicle recovery service',
    subcategories: [
      {
        id: 'standard_basic',
        name: 'Basic Recovery',
        description: 'Basic vehicle recovery service',
        baseFare: 1000,
        perKmRate: 50,
        minCharge: 1000,
        maxDistance: 100,
        vehicleTypes: ['car', 'suv', 'bike']
      }
    ]
  },
  emergency: {
    id: 'emergency',
    name: 'Emergency Recovery',
    description: '24/7 Emergency vehicle recovery service',
    subcategories: [
      {
        id: 'emergency_24x7',
        name: '24/7 Emergency',
        description: '24/7 Emergency recovery service',
        baseFare: 2000,
        perKmRate: 75,
        minCharge: 2000,
        maxDistance: 200,
        vehicleTypes: ['car', 'suv', 'bike', 'truck']
      }
    ]
  }
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
    const services = Object.values(CAR_RECOVERY_SERVICES).map(service => ({
      id: service.id,
      name: service.name,
      description: service.description,
      subcategories: service.subcategories?.map(sub => ({
        id: sub.id,
        name: sub.name,
        description: sub.description,
        baseFare: sub.baseFare,
        perKmRate: sub.perKmRate,
        minCharge: sub.minCharge,
        maxDistance: sub.maxDistance,
        vehicleTypes: sub.vehicleTypes
      }))
    }));

    res.json(services);
  } catch (error) {
    console.error('Error getting car recovery services:', error);
    res.status(500).json({ message: 'Server error' });
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
      safetyPreferences = {}
    } = req.body;

    // Validate required fields
    if (!serviceType || !pickupLocation || !vehicleDetails) {
      return res.status(400).json({ message: 'Required fields are missing' });
    }

    // Validate service type and subcategory
    const subcategory = findSubcategory(serviceType, subcategoryId);
    if (!subcategory) {
      return res.status(400).json({ message: 'Invalid service type or subcategory' });
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
      status: 'pending',
      serviceCategory: 'car_recovery',
      safetyPreferences: {
        pinkCaptainRequired: safetyPreferences.pinkCaptainRequired || false,
        familyWithGuardian: safetyPreferences.familyWithGuardian || false,
        noMaleCompanion: safetyPreferences.noMaleCompanion || false,
        emergencyContact: safetyPreferences.emergencyContact || null
      },
      fareDetails: {
        baseFare: subcategory.baseFare,
        perKmRate: subcategory.perKmRate,
        estimatedDistance: 0, // Will be calculated
        estimatedFare: 0, // Will be calculated
        currency: 'AED'
      }
    });

    // Calculate distance and fare
    if (pickupLocation.coordinates && dropoffLocation?.coordinates) {
      const distance = await calculateDistance(
        pickupLocation.coordinates,
        dropoffLocation.coordinates
      );
      
      recoveryRequest.fareDetails.estimatedDistance = distance;
      recoveryRequest.fareDetails.estimatedFare = Math.max(
        subcategory.baseFare + (distance * subcategory.perKmRate),
        subcategory.minCharge
      );
    }

    // Save the recovery request
    await recoveryRequest.save();

    // Notify available drivers via WebSocket
    webSocketService.notifyDrivers('new_recovery_request', {
      requestId: recoveryRequest._id,
      pickupLocation: recoveryRequest.pickupLocation,
      vehicleType: recoveryRequest.vehicleDetails.type,
      estimatedFare: recoveryRequest.fareDetails.estimatedFare
    });

    res.status(201).json({
      success: true,
      data: recoveryRequest,
      message: 'Recovery request created successfully'
    });

  } catch (error) {
    console.error('Error creating recovery request:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating recovery request',
      error: error.message
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
      serviceCategory: 'car_recovery',
      $or: [
        { user: req.user._id },
        { driver: req.user._id }
      ]
    })
    .populate('user', 'firstName lastName phoneNumber')
    .populate('driver', 'firstName lastName phoneNumber');

    if (!request) {
      return res.status(404).json({ message: 'Recovery request not found' });
    }

    res.json(request);
  } catch (error) {
    console.error('Error getting recovery request:', error);
    res.status(500).json({ message: 'Server error' });
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
      serviceCategory: 'car_recovery'
    };

    if (status) {
      query.status = status;
    }

    const requests = await Booking.find(query)
      .sort({ createdAt: -1 })
      .populate('driver', 'firstName lastName phoneNumber');

    res.json(requests);
  } catch (error) {
    console.error('Error getting user recovery requests:', error);
    res.status(500).json({ message: 'Server error' });
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
      serviceCategory: 'car_recovery'
    };

    if (status) {
      query.status = status;
    }

    const requests = await Booking.find(query)
      .sort({ createdAt: -1 })
      .populate('user', 'firstName lastName phoneNumber');

    res.json(requests);
  } catch (error) {
    console.error('Error getting driver recovery requests:', error);
    res.status(500).json({ message: 'Server error' });
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
      serviceCategory: 'car_recovery'
    });

    if (!booking) {
      return res.status(404).json({ message: 'Recovery request not found' });
    }

    // Authorization check - only the assigned driver or admin can update status
    if (booking.driver && booking.driver.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this request' });
    }

    // Update status and driver if provided
    booking.status = status;
    if (driverId) {
      booking.driver = driverId;
    }

    // Update timestamps based on status
    const now = new Date();
    switch (status) {
      case 'accepted':
        booking.acceptedAt = now;
        break;
      case 'started':
        booking.startedAt = now;
        break;
      case 'completed':
        booking.completedAt = now;
        booking.fareDetails.finalFare = booking.fareDetails.estimatedFare; // Can be adjusted later
        break;
      case 'cancelled':
        booking.cancelledAt = now;
        booking.cancelledBy = req.user._id;
        break;
    }

    await booking.save();

    // Notify user about status update
    if (booking.user) {
      webSocketService.notifyUser(booking.user, 'recovery_status_update', {
        requestId: booking._id,
        status: booking.status,
        driver: booking.driver,
        updatedAt: now
      });
    }

    res.json({
      success: true,
      data: booking,
      message: 'Recovery request status updated successfully'
    });
  } catch (error) {
    console.error('Error updating recovery request status:', error);
    res.status(500).json({ message: 'Server error' });
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
      serviceCategory: 'car_recovery',
      status: { $in: ['pending', 'accepted'] }
    });

    if (!booking) {
      return res.status(404).json({ message: 'Recovery request not found or cannot be cancelled' });
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancellationReason = reason || 'User cancelled';
    booking.cancelledBy = req.user._id;

    await booking.save();

    // Notify driver if assigned
    if (booking.driver) {
      webSocketService.notifyUser(booking.driver, 'recovery_request_cancelled', {
        requestId: booking._id,
        reason: booking.cancellationReason
      });
    }

    res.json({
      success: true,
      message: 'Recovery request cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling recovery request:', error);
    res.status(500).json({ message: 'Server error' });
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
      serviceCategory: 'car_recovery'
    });

    if (!booking) {
      return res.status(404).json({ message: 'Recovery request not found' });
    }

    // Update current location
    booking.currentLocation = {
      type: 'Point',
      coordinates: [coordinates.longitude, coordinates.latitude]
    };

    await booking.save();

    // Notify user about driver's location
    webSocketService.notifyUser(booking.user, 'driver_location_update', {
      requestId: booking._id,
      location: booking.currentLocation,
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Location updated successfully'
    });
  } catch (error) {
    console.error('Error updating driver location:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Send a message in recovery request
// @route   POST /api/car-recovery/:id/messages
// @access  Private
export const sendMessage = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { message, senderType } = req.body;

    if (!['user', 'driver'].includes(senderType)) {
      return res.status(400).json({ message: 'Invalid sender type' });
    }

    const booking = await Booking.findOne({
      _id: id,
      $or: [
        { user: req.user._id },
        { driver: req.user._id }
      ],
      serviceCategory: 'car_recovery'
    });

    if (!booking) {
      return res.status(404).json({ message: 'Recovery request not found' });
    }

    // Add message to chat
    const newMessage = {
      sender: req.user._id,
      senderType,
      message,
      timestamp: new Date()
    };

    if (!booking.messages) {
      booking.messages = [];
    }
    booking.messages.push(newMessage);
    await booking.save();

    // Notify the other party
    const recipient = senderType === 'user' ? booking.driver : booking.user;
    if (recipient) {
      webSocketService.notifyUser(recipient, 'new_message', {
        requestId: booking._id,
        message: newMessage
      });
    }

    res.status(201).json({
      success: true,
      data: newMessage,
      message: 'Message sent successfully'
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get messages for a recovery request
// @route   GET /api/car-recovery/:id/messages
// @access  Private
export const getMessages = asyncHandler(async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      $or: [
        { user: req.user._id },
        { driver: req.user._id }
      ],
      serviceCategory: 'car_recovery'
    })
    .select('messages')
    .populate('messages.sender', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({ message: 'Recovery request not found' });
    }

    res.json(booking.messages || []);
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
