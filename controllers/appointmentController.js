import Booking from '../models/bookingModel.js';
import User from '../models/userModel.js';
import PricingConfig from '../models/pricingModel.js';
import AppointmentConfirmation from '../models/appointmentConfirmationModel.js';
import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';

// Helper function to calculate distance between two GPS coordinates (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in kilometers
};

// Helper function to verify GPS location
const verifyGPSLocation = (providerLocation, serviceLocation, maxDistanceKm = 0.5) => {
  if (!serviceLocation?.latitude || !serviceLocation?.longitude) {
    return { isValid: true, reason: 'Service location not specified' };
  }
  
  const distance = calculateDistance(
    providerLocation.latitude,
    providerLocation.longitude,
    serviceLocation.latitude,
    serviceLocation.longitude
  );
  
  const isValid = distance <= maxDistanceKm;
  return {
    isValid,
    distance: Math.round(distance * 1000), // Distance in meters
    reason: isValid ? 'Location verified' : `Too far from service location (${Math.round(distance * 1000)}m away)`
  };
};

// Helper function to detect suspicious GPS activity
const detectSuspiciousActivity = (gpsLocation, previousLocations = []) => {
  const suspiciousFlags = [];
  
  // Check for impossible speed (teleportation detection)
  if (previousLocations.length > 0) {
    const lastLocation = previousLocations[previousLocations.length - 1];
    const timeDiff = (new Date() - new Date(lastLocation.timestamp)) / 1000; // seconds
    const distance = calculateDistance(
      lastLocation.latitude,
      lastLocation.longitude,
      gpsLocation.latitude,
      gpsLocation.longitude
    );
    
    const speedKmh = (distance / timeDiff) * 3600; // km/h
    const maxReasonableSpeed = 120; // km/h
    
    if (speedKmh > maxReasonableSpeed) {
      suspiciousFlags.push(`Impossible speed detected: ${Math.round(speedKmh)} km/h`);
    }
  }
  
  // Check for coordinate precision (fake GPS detection)
  const latPrecision = (gpsLocation.latitude.toString().split('.')[1] || '').length;
  const lonPrecision = (gpsLocation.longitude.toString().split('.')[1] || '').length;
  
  if (latPrecision < 4 || lonPrecision < 4) {
    suspiciousFlags.push('Low GPS precision detected');
  }
  
  // Check for exact duplicate coordinates
  const duplicateCount = previousLocations.filter(loc => 
    loc.latitude === gpsLocation.latitude && loc.longitude === gpsLocation.longitude
  ).length;
  
  if (duplicateCount > 2) {
    suspiciousFlags.push('Multiple identical GPS coordinates');
  }
  
  return {
    isSuspicious: suspiciousFlags.length > 0,
    flags: suspiciousFlags,
    riskLevel: suspiciousFlags.length === 0 ? 'low' : 
               suspiciousFlags.length === 1 ? 'medium' : 'high'
  };
};

// Start appointment (GPS check-in)
const startAppointment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { gpsLocation } = req.body;
  const driverId = req.user._id;

  if (!gpsLocation?.latitude || !gpsLocation?.longitude) {
    return res.status(400).json({
      message: 'GPS location (latitude and longitude) is required',
      token: req.cookies.token
    });
  }

  const booking = await Booking.findById(bookingId).populate('user', 'firstName lastName');
  
  if (!booking) {
    return res.status(404).json({
      message: 'Booking not found',
      token: req.cookies.token
    });
  }

  if (booking.driver?.toString() !== driverId.toString()) {
    return res.status(403).json({
      message: 'You are not authorized to start this appointment',
      token: req.cookies.token
    });
  }

  if (!booking.appointmentDetails?.isAppointmentBased) {
    return res.status(400).json({
      message: 'This booking is not appointment-based',
      token: req.cookies.token
    });
  }

  // Get previous GPS locations for fraud detection
  const previousBookings = await Booking.find({
    driver: driverId,
    'appointmentDetails.gpsCheckIn.isCompleted': true
  }).sort({ createdAt: -1 }).limit(5);
  
  const previousLocations = previousBookings.map(b => ({
    latitude: b.appointmentDetails.gpsCheckIn.location.latitude,
    longitude: b.appointmentDetails.gpsCheckIn.location.longitude,
    timestamp: b.appointmentDetails.gpsCheckIn.timestamp
  }));

  // Verify GPS location if service location is available
  const gpsVerification = verifyGPSLocation(
    gpsLocation,
    booking.pickupLocation || booking.dropoffLocation
  );
  
  // Detect suspicious GPS activity
  const suspiciousActivity = detectSuspiciousActivity(gpsLocation, previousLocations);

  // Update GPS check-in
  booking.appointmentDetails.gpsCheckIn = {
    isRequired: true,
    isCompleted: true,
    location: {
      latitude: gpsLocation.latitude,
      longitude: gpsLocation.longitude
    },
    timestamp: new Date(),
    verification: {
      isVerified: gpsVerification.isValid,
      distance: gpsVerification.distance,
      reason: gpsVerification.reason
    },
    fraudDetection: {
      isSuspicious: suspiciousActivity.isSuspicious,
      riskLevel: suspiciousActivity.riskLevel,
      flags: suspiciousActivity.flags
    }
  };

  booking.status = 'in_progress';
  await booking.save();

  // Emit real-time notification
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${booking.user._id}`).emit('appointment_started', {
      bookingId: booking._id,
      message: 'Service provider has started the appointment',
      gpsLocation,
      timestamp: new Date()
    });
    
    // Notify admins if high-risk fraud detected
    if (suspiciousActivity.riskLevel === 'high') {
      io.to('admin_room').emit('fraud_alert', {
        bookingId: booking._id,
        driverId,
        riskLevel: suspiciousActivity.riskLevel,
        flags: suspiciousActivity.flags,
        location: gpsLocation,
        timestamp: new Date()
      });
    }
  }

  const token = jwt.sign({ id: driverId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie('token', token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: 'Appointment started successfully',
    bookingId: booking._id,
    gpsCheckIn: booking.appointmentDetails.gpsCheckIn,
    locationVerified: gpsVerification.isValid,
    verificationMessage: gpsVerification.reason,
    fraudDetection: {
      riskLevel: suspiciousActivity.riskLevel,
      isSuspicious: suspiciousActivity.isSuspicious,
      flags: suspiciousActivity.flags
    },
    token
  });
});

// Complete appointment
const completeAppointment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const driverId = req.user._id;

  const booking = await Booking.findById(bookingId);
  
  if (!booking) {
    return res.status(404).json({
      message: 'Booking not found',
      token: req.cookies.token
    });
  }

  if (booking.driver?.toString() !== driverId.toString()) {
    return res.status(403).json({
      message: 'You are not authorized to complete this appointment',
      token: req.cookies.token
    });
  }

  if (!booking.appointmentDetails?.gpsCheckIn?.isCompleted) {
    return res.status(400).json({
      message: 'GPS check-in is required before completing appointment',
      token: req.cookies.token
    });
  }

  booking.status = 'completed';
  booking.appointmentDetails.completedAt = new Date();
  await booking.save();

  // Create appointment confirmation record
  const appointmentConfirmation = new AppointmentConfirmation({
    bookingId: booking._id,
    customerId: booking.user._id,
    serviceProviderId: booking.driver,
    serviceCategory: booking.serviceType,
    appointmentDate: booking.appointmentDetails.completedAt,
    gpsCheckIn: {
      location: booking.appointmentDetails.gpsCheckIn.location,
      timestamp: booking.appointmentDetails.gpsCheckIn.timestamp,
      isVerified: true
    },
    confirmationStatus: 'pending_surveys',
    surveyTimeout: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
  });

  await appointmentConfirmation.save();

  // Schedule survey notifications after 24 hours
  setTimeout(async () => {
    const io = req.app.get('io');
    if (io) {
      // Notify customer for survey
      io.to(`user_${booking.user._id}`).emit('survey_request', {
        bookingId: booking._id,
        confirmationId: appointmentConfirmation._id,
        type: 'customer',
        message: 'Please rate your experience with the service provider'
      });

      // Notify service provider for survey
      io.to(`driver_${booking.driver._id}`).emit('survey_request', {
        bookingId: booking._id,
        confirmationId: appointmentConfirmation._id,
        type: 'provider',
        message: 'Please rate your experience with the customer'
      });
    }
  }, 24 * 60 * 60 * 1000); // 24 hours

  // Emit real-time notification
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${booking.user._id}`).emit('appointment_completed', {
      bookingId: booking._id,
      confirmationId: appointmentConfirmation._id,
      message: 'Appointment has been completed',
      timestamp: new Date()
    });
  }

  const token = jwt.sign({ id: driverId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie('token', token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: 'Appointment completed successfully',
    bookingId: booking._id,
    confirmationId: appointmentConfirmation._id,
    completedAt: booking.appointmentDetails.completedAt,
    token
  });
});

// Submit customer survey
const submitCustomerSurvey = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { experience, rating, feedback } = req.body;
  const userId = req.user._id;

  if (!experience || !rating) {
    return res.status(400).json({
      message: 'Experience and rating are required',
      token: req.cookies.token
    });
  }

  if (!['Good', 'Bad', 'Didn\'t Visit'].includes(experience)) {
    return res.status(400).json({
      message: 'Invalid experience value. Must be Good, Bad, or Didn\'t Visit',
      token: req.cookies.token
    });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      message: 'Rating must be between 1 and 5',
      token: req.cookies.token
    });
  }

  const booking = await Booking.findById(bookingId);
  
  if (!booking) {
    return res.status(404).json({
      message: 'Booking not found',
      token: req.cookies.token
    });
  }

  if (booking.user.toString() !== userId.toString()) {
    return res.status(403).json({
      message: 'You are not authorized to submit this survey',
      token: req.cookies.token
    });
  }

  // Find the appointment confirmation record
  const appointmentConfirmation = await AppointmentConfirmation.findOne({ bookingId });
  
  if (!appointmentConfirmation) {
    return res.status(404).json({
      message: 'Appointment confirmation record not found',
      token: req.cookies.token
    });
  }

  // Update customer survey in AppointmentConfirmation
  appointmentConfirmation.customerSurvey = {
    experience,
    rating,
    feedback: feedback || '',
    submittedAt: new Date()
  };

  // Process auto-decision if both surveys are completed
  await appointmentConfirmation.processAutoDecision();
  await appointmentConfirmation.save();

  // Update booking status based on confirmation result
  if (appointmentConfirmation.confirmationStatus === 'confirmed') {
    booking.appointmentDetails.confirmationSurvey.finalStatus = 'successful';
  } else if (appointmentConfirmation.confirmationStatus === 'rejected') {
    booking.appointmentDetails.confirmationSurvey.finalStatus = 'unsuccessful';
  } else if (appointmentConfirmation.confirmationStatus === 'disputed') {
    booking.appointmentDetails.confirmationSurvey.finalStatus = 'pending_review';
  }
  
  await booking.save();

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie('token', token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: 'Customer survey submitted successfully',
    bookingId: booking._id,
    confirmationId: appointmentConfirmation._id,
    confirmationStatus: appointmentConfirmation.confirmationStatus,
    finalStatus: booking.appointmentDetails.confirmationSurvey.finalStatus,
    token
  });
});

// Submit provider survey
const submitProviderSurvey = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { experience, rating, feedback } = req.body;
  const driverId = req.user._id;

  if (!experience || !rating) {
    return res.status(400).json({
      message: 'Experience and rating are required',
      token: req.cookies.token
    });
  }

  if (!['Good', 'Bad', 'Didn\'t Meet Yet'].includes(experience)) {
    return res.status(400).json({
      message: 'Invalid experience value. Must be Good, Bad, or Didn\'t Meet Yet',
      token: req.cookies.token
    });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      message: 'Rating must be between 1 and 5',
      token: req.cookies.token
    });
  }

  const booking = await Booking.findById(bookingId);
  
  if (!booking) {
    return res.status(404).json({
      message: 'Booking not found',
      token: req.cookies.token
    });
  }

  if (booking.driver?.toString() !== driverId.toString()) {
    return res.status(403).json({
      message: 'You are not authorized to submit this survey',
      token: req.cookies.token
    });
  }

  // Find the appointment confirmation record
  const appointmentConfirmation = await AppointmentConfirmation.findOne({ bookingId });
  
  if (!appointmentConfirmation) {
    return res.status(404).json({
      message: 'Appointment confirmation record not found',
      token: req.cookies.token
    });
  }

  // Update provider survey in AppointmentConfirmation
  appointmentConfirmation.serviceProviderSurvey = {
    experience,
    rating,
    feedback: feedback || '',
    submittedAt: new Date()
  };

  // Process auto-decision if both surveys are completed
  await appointmentConfirmation.processAutoDecision();
  await appointmentConfirmation.save();

  // Update booking status based on confirmation result
  if (appointmentConfirmation.confirmationStatus === 'confirmed') {
    booking.appointmentDetails.confirmationSurvey.finalStatus = 'successful';
  } else if (appointmentConfirmation.confirmationStatus === 'rejected') {
    booking.appointmentDetails.confirmationSurvey.finalStatus = 'unsuccessful';
  } else if (appointmentConfirmation.confirmationStatus === 'disputed') {
    booking.appointmentDetails.confirmationSurvey.finalStatus = 'pending_review';
  }
  
  await booking.save();

  const token = jwt.sign({ id: driverId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie('token', token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: 'Provider survey submitted successfully',
    bookingId: booking._id,
    confirmationId: appointmentConfirmation._id,
    confirmationStatus: appointmentConfirmation.confirmationStatus,
    finalStatus: booking.appointmentDetails.confirmationSurvey.finalStatus,
    token
  });
});

// Helper function to update appointment status based on surveys
const updateAppointmentStatus = async (booking) => {
  const customerSurvey = booking.appointmentDetails.confirmationSurvey.customerSurvey;
  const providerSurvey = booking.appointmentDetails.confirmationSurvey.providerSurvey;

  // If both surveys are completed
  if (customerSurvey.isCompleted && providerSurvey.isCompleted) {
    const customerExperience = customerSurvey.experience;
    const providerExperience = providerSurvey.experience;

    // Successful appointment logic
    if (
      (customerExperience === 'Good' && providerExperience === 'Good') ||
      (customerExperience === 'Good' && providerExperience === 'Bad') ||
      (customerExperience === 'Bad' && providerExperience === 'Good')
    ) {
      booking.appointmentDetails.confirmationSurvey.finalStatus = 'successful';
      
      // Deduct platform fee from service provider
      const pricingConfig = await PricingConfig.findOne({ 
        serviceType: 'appointment_based', 
        isActive: true 
      });
      
      if (pricingConfig) {
        const platformFee = pricingConfig.appointmentServicePricing.platformFeePerAppointment;
        // Here you would implement the actual fee deduction logic
        // This could involve updating the driver's balance or creating a transaction record
        console.log(`Deducting platform fee of ${platformFee} from driver ${booking.driver}`);
      }
    }
    // Unsuccessful appointment logic
    else if (
      customerExperience === 'Didn\'t Visit' && 
      providerExperience === 'Didn\'t Meet Yet'
    ) {
      booking.appointmentDetails.confirmationSurvey.finalStatus = 'unsuccessful';
    }
    // Conflict - requires admin review
    else {
      booking.appointmentDetails.confirmationSurvey.finalStatus = 'pending_review';
      booking.appointmentDetails.confirmationSurvey.requiresAdminReview = true;
      
      // Notify admin about the conflict
      console.log(`Appointment conflict detected for booking ${booking._id} - requires admin review`);
    }

    booking.appointmentDetails.confirmationSurvey.resolvedAt = new Date();
  }
};

// Get appointment surveys (for admin review)
const getAppointmentSurveys = asyncHandler(async (req, res) => {
  const { status = 'all' } = req.query;
  const userId = req.user._id;

  // Check if user is admin
  const user = await User.findById(userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({
      message: 'Admin access required',
      token: req.cookies.token
    });
  }

  let query = {};

  if (status !== 'all') {
    query.confirmationStatus = status;
  }

  const confirmations = await AppointmentConfirmation.find(query)
    .populate({
      path: 'bookingId',
      populate: [
        { path: 'user', select: 'firstName lastName email phoneNumber' },
        { path: 'driver', select: 'firstName lastName email phoneNumber' }
      ]
    })
    .sort({ createdAt: -1 });

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie('token', token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: 'Appointment surveys retrieved successfully',
    surveys: confirmations,
    total: confirmations.length,
    token
  });
});

// Admin resolve appointment conflict
const resolveAppointmentConflict = asyncHandler(async (req, res) => {
  const { confirmationId } = req.params;
  const { finalStatus, adminNotes } = req.body;
  const userId = req.user._id;

  // Check if user is admin
  const user = await User.findById(userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({
      message: 'Admin access required',
      token: req.cookies.token
    });
  }

  if (!['confirmed', 'rejected'].includes(finalStatus)) {
    return res.status(400).json({
      message: 'Final status must be either confirmed or rejected',
      token: req.cookies.token
    });
  }

  const appointmentConfirmation = await AppointmentConfirmation.findById(confirmationId);
  
  if (!appointmentConfirmation) {
    return res.status(404).json({
      message: 'Appointment confirmation not found',
      token: req.cookies.token
    });
  }

  if (appointmentConfirmation.confirmationStatus !== 'disputed') {
    return res.status(400).json({
      message: 'This appointment is not disputed and does not require admin review',
      token: req.cookies.token
    });
  }

  // Update appointment confirmation status
  appointmentConfirmation.confirmationStatus = finalStatus;
  appointmentConfirmation.adminReview = {
    reviewedBy: userId,
    reviewedAt: new Date(),
    notes: adminNotes || '',
    originalStatus: 'disputed'
  };

  await appointmentConfirmation.save();

  // Update booking status
  const booking = await Booking.findById(appointmentConfirmation.bookingId);
  if (booking) {
    if (finalStatus === 'confirmed') {
      booking.appointmentDetails.confirmationSurvey.finalStatus = 'successful';
    } else {
      booking.appointmentDetails.confirmationSurvey.finalStatus = 'unsuccessful';
    }
    await booking.save();
  }

  // If marked as confirmed, deduct platform fee
  if (finalStatus === 'confirmed') {
    const pricingConfig = await PricingConfig.findOne({ 
      serviceType: 'appointment_based', 
      isActive: true 
    });
    
    if (pricingConfig) {
      const platformFee = pricingConfig.appointmentServicePricing.platformFeePerAppointment;
      console.log(`Admin resolved: Deducting platform fee of ${platformFee} from driver ${appointmentConfirmation.serviceProviderId}`);
    }
  }

  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY,
  });
  res.cookie('token', token, { httpOnly: true, maxAge: 3600000 });
  res.status(200).json({
    message: 'Appointment conflict resolved successfully',
    confirmationId: appointmentConfirmation._id,
    finalStatus,
    adminReview: appointmentConfirmation.adminReview,
    token
  });
});

// Get GPS fraud reports for admin monitoring
const getGPSFraudReports = asyncHandler(async (req, res) => {
  const { riskLevel, startDate, endDate } = req.query;
  
  let filter = {
    'appointmentDetails.gpsCheckIn.fraudDetection.isSuspicious': true
  };
  
  if (riskLevel) {
    filter['appointmentDetails.gpsCheckIn.fraudDetection.riskLevel'] = riskLevel;
  }
  
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }
  
  const suspiciousBookings = await Booking.find(filter)
    .populate('driver', 'firstName lastName email phoneNumber')
    .populate('customer', 'firstName lastName email phoneNumber')
    .select('driver customer serviceType appointmentDetails createdAt')
    .sort({ createdAt: -1 });
  
  res.status(200).json({
    message: 'GPS fraud reports retrieved successfully',
    reports: suspiciousBookings,
    total: suspiciousBookings.length
  });
});

export {
  startAppointment,
  completeAppointment,
  submitCustomerSurvey,
  submitProviderSurvey,
  getAppointmentSurveys,
  resolveAppointmentConflict,
  getGPSFraudReports
};