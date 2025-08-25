import mongoose from 'mongoose';

// Survey response schema for both customer and service provider
const surveyResponseSchema = new mongoose.Schema({
  respondentType: {
    type: String,
    enum: ['customer', 'service_provider'],
    required: true
  },
  respondentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  experienceRating: {
    type: String,
    enum: ['good', 'bad', 'didnt_visit', 'didnt_meet_yet'],
    required: true
  },
  starRating: {
    type: Number,
    min: 1,
    max: 5,
    required: function() {
      return this.experienceRating === 'good' || this.experienceRating === 'bad';
    }
  },
  feedbackText: {
    type: String,
    maxlength: 500,
    trim: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
});

// GPS check-in schema for appointment verification
const gpsCheckInSchema = new mongoose.Schema({
  serviceProviderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  shopLocation: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String, required: true }
  },
  distanceFromShop: {
    type: Number,
    description: "Distance in meters from shop location"
  },
  checkedInAt: {
    type: Date,
    default: Date.now
  },
  isValid: {
    type: Boolean,
    default: true,
    description: "Whether check-in is within acceptable range"
  }
});

// Main appointment confirmation schema
const appointmentConfirmationSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  serviceProviderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  serviceCategory: {
    type: String,
    enum: ['workshop', 'tyre_shop', 'key_unlocker', 'other'],
    required: true
  },
  
  // Survey responses
  customerSurvey: surveyResponseSchema,
  serviceProviderSurvey: surveyResponseSchema,
  
  // GPS verification
  gpsCheckIn: gpsCheckInSchema,
  
  // Confirmation status
  confirmationStatus: {
    type: String,
    enum: ['pending', 'successful', 'unsuccessful', 'disputed', 'admin_review'],
    default: 'pending'
  },
  
  // Auto-decision logic
  autoDecisionResult: {
    isSuccessful: { type: Boolean },
    reason: { type: String },
    decidedAt: { type: Date }
  },
  
  // Fee processing
  feeProcessing: {
    fixedFee: { type: Number, default: 5 },
    feeCharged: { type: Boolean, default: false },
    chargedAt: { type: Date },
    refundIssued: { type: Boolean, default: false },
    refundedAt: { type: Date }
  },
  
  // Survey timeout settings
  surveySettings: {
    timeoutHours: { type: Number, default: 24 },
    sentAt: { type: Date },
    customerReminderSent: { type: Boolean, default: false },
    providerReminderSent: { type: Boolean, default: false }
  },
  
  // Dispute handling
  disputeDetails: {
    isDisputed: { type: Boolean, default: false },
    disputeReason: { type: String },
    adminNotes: { type: String },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolvedAt: { type: Date }
  },
  
  // Rating impact tracking
  ratingImpact: {
    customerRatingUpdated: { type: Boolean, default: false },
    providerRatingUpdated: { type: Boolean, default: false },
    providerVisibilityAffected: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
appointmentConfirmationSchema.index({ appointmentId: 1 });
appointmentConfirmationSchema.index({ customerId: 1 });
appointmentConfirmationSchema.index({ serviceProviderId: 1 });
appointmentConfirmationSchema.index({ confirmationStatus: 1 });
appointmentConfirmationSchema.index({ 'surveySettings.sentAt': 1 });
appointmentConfirmationSchema.index({ 'disputeDetails.isDisputed': 1 });

// Methods for auto-decision logic
appointmentConfirmationSchema.methods.processAutoDecision = function() {
  const customerResponse = this.customerSurvey?.experienceRating;
  const providerResponse = this.serviceProviderSurvey?.experienceRating;
  
  let isSuccessful = false;
  let reason = '';
  
  // Both confirm service happened
  if ((customerResponse === 'good' || customerResponse === 'bad') && 
      (providerResponse === 'good' || providerResponse === 'bad')) {
    isSuccessful = true;
    reason = 'Both parties confirmed service occurred';
  }
  // Both say didn't meet
  else if ((customerResponse === 'didnt_visit' || customerResponse === 'didnt_meet_yet') && 
           (providerResponse === 'didnt_visit' || providerResponse === 'didnt_meet_yet')) {
    isSuccessful = false;
    reason = 'Both parties confirmed no service occurred';
  }
  // Conflict - needs admin review
  else if (customerResponse && providerResponse) {
    this.confirmationStatus = 'disputed';
    this.disputeDetails.isDisputed = true;
    this.disputeDetails.disputeReason = 'Conflicting responses from customer and service provider';
    reason = 'Conflicting responses - requires admin review';
  }
  
  this.autoDecisionResult = {
    isSuccessful,
    reason,
    decidedAt: new Date()
  };
  
  if (this.confirmationStatus !== 'disputed') {
    this.confirmationStatus = isSuccessful ? 'successful' : 'unsuccessful';
  }
  
  return this.save();
};

// Method to process fee charging
appointmentConfirmationSchema.methods.processFeeCharging = function() {
  if (this.confirmationStatus === 'successful' && !this.feeProcessing.feeCharged) {
    this.feeProcessing.feeCharged = true;
    this.feeProcessing.chargedAt = new Date();
    // Note: Actual payment processing would be handled by payment service
  }
  return this.save();
};

const AppointmentConfirmation = mongoose.model('AppointmentConfirmation', appointmentConfirmationSchema);

export default AppointmentConfirmation;