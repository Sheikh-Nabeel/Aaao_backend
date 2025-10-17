import mongoose from "mongoose";
const bookingSchema = new mongoose.Schema({
  // Idempotent create support: unique per create request (client-provided or backend-generated)
  idempotencyKey: {
    type: String,
    required: false,
    index: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User ID is required"],
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  rejectedDrivers: [
    {
      driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      reason: {
        type: String,
        default: "No reason provided",
      },
      rejectedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  acceptedAt: {
    type: Date,
    required: false,
  },
  startedAt: {
    type: Date,
    required: false,
  },
  completedAt: {
    type: Date,
    required: false,
  },
  cancelledAt: {
    type: Date,
    required: false,
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  cancellationReason: {
    type: String,
    required: false,
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
    required: false,
  },
  pickupLocation: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: [true, "Pickup coordinates are required"],
    },
    address: {
      type: String,
      required: [true, "Pickup address is required"],
    },
    zone: {
      type: String,
      required: [true, "Pickup zone is required"],
    },
  },
  dropoffLocation: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: [true, "Dropoff coordinates are required"],
    },
    address: {
      type: String,
      required: [true, "Dropoff address is required"],
    },
    zone: {
      type: String,
      required: [true, "Dropoff zone is required"],
    },
  },
  distance: {
    type: Number, // in kilometers
    required: [true, "Distance is required"],
  },
  fare: {
    type: Number, // in AED
    required: [true, "Fare is required"],
  },
  fareModificationRequest: {
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    originalFare: {
      type: Number,
      required: false,
    },
    requestedFare: {
      type: Number,
      required: false,
    },
    reason: {
      type: String,
      required: false,
    },
    requestedAt: {
      type: Date,
      required: false,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      required: false,
    },
    respondedAt: {
      type: Date,
      required: false,
    },
    userResponse: {
      response: {
        type: String,
        enum: ["accept", "reject"],
        required: false,
      },
      reason: {
        type: String,
        required: false,
      },
    },
  },
  fareModifiedAt: {
    type: Date,
    required: false,
  },
  status: {
    type: String,
    enum: [
      "pending",
      "accepted",
      "started",
      "in_progress",
      "completed",
      "cancelled",
    ],
    default: "pending",
  },
  serviceType: {
    type: String,
    enum: ["car cab", "bike", "car recovery", "shifting & movers"],
    required: [true, "Service type is required"],
  },
  serviceCategory: {
    type: String,
    required: false,
    enum: [
      // Car Recovery categories
      "towing services",
      "winching services",
      "roadside assistance",
      "specialized/heavy recovery",
      // Shifting & Movers categories
      "small mover",
      "medium mover",
      "heavy mover",
    ],
  },
  vehicleType: {
    type: String,
    required: false,
    enum: [
      // Car Cab
      "economy",
      "premium",
      "xl",
      "family",
      "luxury",
      // Bike
      "vip",
      // Car Recovery
      "flatbed towing",
      "wheel lift towing",
      "on-road winching",
      "off-road winching",
      "battery jump start",
      "fuel delivery",
      "luxury & exotic car recovery",
      "accident & collision recovery",
      "heavy-duty vehicle recovery",
      "basement pull-out",
      // Shifting & Movers
      "mini pickup",
      "suzuki carry",
      "small van",
      "medium truck",
      "mazda",
      "covered van",
      "large truck",
      "6-wheeler",
      "container truck",
    ],
  },
  routeType: {
    type: String,
    enum: ["one_way", "two_way"],
    default: "one_way",
  },
  driverPreference: {
    type: String,
    enum: ["nearby", "pinned", "favorite", "pink_captain"],
    default: "nearby",
  },
  pinnedDriverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  pinkCaptainOptions: {
    femalePassengersOnly: {
      type: Boolean,
      default: false,
    },
    familyRides: {
      type: Boolean,
      default: false,
    },
    safeZoneRides: {
      type: Boolean,
      default: false,
    },
    familyWithGuardianMale: {
      type: Boolean,
      default: false,
    },
    maleWithoutFemale: {
      type: Boolean,
      default: false,
    },
    noMaleCompanion: {
      type: Boolean,
      default: false,
    },
  },
  furnitureDetails: {
    sofas: {
      type: Number,
      default: 0,
    },
    beds: {
      type: Number,
      default: 0,
    },
    tables: {
      type: Number,
      default: 0,
    },
    chairs: {
      type: Number,
      default: 0,
    },
    wardrobes: {
      type: Number,
      default: 0,
    },
    refrigerator: {
      type: Number,
      default: 0,
    },
    washingMachine: {
      type: Number,
      default: 0,
    },
    boxes: {
      type: Number,
      default: 0,
    },
    diningTable: {
      type: Number,
      default: 0,
    },
    bookshelf: {
      type: Number,
      default: 0,
    },
    piano: {
      type: Number,
      default: 0,
    },
    treadmill: {
      type: Number,
      default: 0,
    },
    officeDesk: {
      type: Number,
      default: 0,
    },
    artwork: {
      type: Number,
      default: 0,
    },
    tvStand: {
      type: Number,
      default: 0,
    },
    dresser: {
      type: Number,
      default: 0,
    },
    mattress: {
      type: Number,
      default: 0,
    },
    mirror: {
      type: Number,
      default: 0,
    },
    other: {
      type: String,
      default: "",
    },
  },
  offeredFare: {
    type: Number,
    required: [true, "Offered fare is required"],
  },
  raisedFare: {
    type: Number,
    required: false,
  },
  userFareIncreases: [
    {
      originalFare: {
        type: Number,
        required: true,
      },
      increasedFare: {
        type: Number,
        required: true,
      },
      reason: {
        type: String,
        default: "No drivers responding",
      },
      increasedAt: {
        type: Date,
        default: Date.now,
      },
      resendAttempt: {
        type: Number,
        required: true,
      },
    },
  ],
  resendAttempts: {
    type: Number,
    default: 0,
  },
  maxResendAttempts: {
    type: Number,
    default: 3,
  },
  lastResendAt: {
    type: Date,
    required: false,
  },
  driverOffers: [
    {
      amount: {
        type: Number,
        required: true,
      },
      offeredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      driverName: {
        type: String,
        required: false,
      },
      driverRating: {
        type: Number,
        required: false,
      },
      vehicleInfo: {
        model: { type: String, required: false },
        plateNumber: { type: String, required: false },
        color: { type: String, required: false },
      },
      estimatedArrival: {
        type: Number, // in minutes
        required: false,
      },
      offeredAt: {
        type: Date,
        default: Date.now,
      },
      status: {
        type: String,
        enum: ["pending", "accepted", "rejected", "expired", "withdrawn"],
        default: "pending",
      },
      userResponse: {
        type: String,
        enum: ["accepted", "rejected"],
        required: false,
      },
      respondedAt: {
        type: Date,
        required: false,
      },
      expiresAt: {
        type: Date,
        required: false,
      },
    },
  ],
  fareNegotiationHistory: [
    {
      offeredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      amount: {
        type: Number,
        required: true,
      },
      offeredAt: {
        type: Date,
        default: Date.now,
      },
      status: {
        type: String,
        enum: ["pending", "accepted", "rejected", "expired"],
        required: true,
      },
      userResponse: {
        type: String,
        enum: ["accepted", "rejected"],
        required: false,
      },
      respondedAt: {
        type: Date,
        required: false,
      },
    },
  ],
  distanceInMeters: {
    type: Number,
    required: [true, "Distance in meters is required"],
  },
  paymentMethod: {
    type: String,
    enum: ["cash", "card", "wallet", "bank_transfer"],
    default: "cash",
    required: [true, "Payment method is required"],
  },
  // Real-time messaging during ride
  messages: [
    {
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      senderType: {
        type: String,
        enum: ["user", "driver"],
        required: true,
      },
      message: {
        type: String,
        required: true,
        maxlength: 500,
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
      messageType: {
        type: String,
        enum: ["text", "location", "system"],
        default: "text",
      },
      location: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: {
          type: [Number],
          required: false,
        },
      },
      language: { type: String, required: false },
      voiceToText: { type: String, required: false },
      attachments: [
        {
          url: { type: String, required: true },
          type: {
            type: String,
            enum: ["image", "video", "audio", "file"],
            default: "file",
          },
          mime: { type: String, required: false },
          sizeBytes: { type: Number, required: false },
        },
      ],
    },
  ],
  // Payment and MLM tracking
  paymentDetails: {
    totalAmount: {
      type: Number,
      required: false,
    },
    mlmCommission: {
      type: Number,
      default: 0, // 15% of total amount
    },
    driverEarnings: {
      type: Number,
      default: 0, // 85% of total amount
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    processedAt: {
      type: Date,
      required: false,
    },
    // For cash payments - track pending amounts
    pendingDriverPayment: {
      amount: {
        type: Number,
        default: 0,
      },
      dueDate: {
        type: Date,
        required: false,
      },
      isPaid: {
        type: Boolean,
        default: false,
      },
      paidAt: {
        type: Date,
        required: false,
      },
    },
  },
  // Rating system
  rating: {
    userRating: {
      stars: {
        type: Number,
        min: 1,
        max: 5,
        required: false,
      },
      comment: {
        type: String,
        maxlength: 500,
        required: false,
      },
      ratedAt: {
        type: Date,
        required: false,
      },
    },
    driverRating: {
      stars: {
        type: Number,
        min: 1,
        max: 5,
        required: false,
      },
      comment: {
        type: String,
        maxlength: 500,
        required: false,
      },
      ratedAt: {
        type: Date,
        required: false,
      },
    },
  },
  // Ride receipt/slip details
  receipt: {
    receiptNumber: {
      type: String,
      required: false,
    },
    generatedAt: {
      type: Date,
      required: false,
    },
    fromAddress: {
      type: String,
      required: false,
    },
    toAddress: {
      type: String,
      required: false,
    },
    rideDistance: {
      type: Number,
      required: false,
    },
    rideDuration: {
      type: Number, // in minutes
      required: false,
    },
    fareBreakdown: {
      baseFare: { type: Number, default: 0 },
      distanceFare: { type: Number, default: 0 },
      timeFare: { type: Number, default: 0 },
      surgeMultiplier: { type: Number, default: 1 },
      taxes: { type: Number, default: 0 },
      totalFare: { type: Number, default: 0 },
    },
  },
  // Enhanced fare calculation fields
  fareCalculation: {
    baseFare: {
      type: Number,
      default: 0,
    },
    distanceFare: {
      type: Number,
      default: 0,
    },
    serviceFees: {
      loadingUnloading: { type: Number, default: 0 },
      packing: { type: Number, default: 0 },
      fixing: { type: Number, default: 0 },
      helpers: { type: Number, default: 0 },
    },
    locationCharges: {
      pickupStairs: { type: Number, default: 0 },
      pickupLift: { type: Number, default: 0 },
      dropoffStairs: { type: Number, default: 0 },
      dropoffLift: { type: Number, default: 0 },
    },
    itemCharges: {
      type: Number,
      default: 0,
    },
    platformCharges: {
      percentage: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
    },
    totalCalculatedFare: {
      type: Number,
      default: 0,
    },
  },
  // Passenger information
  passengerCount: {
    type: Number,
    default: 1,
    min: 1,
  },
  wheelchairAccessible: {
    type: Boolean,
    default: false,
    required: false,
  },
  // Driver filtering preferences
  driverFilters: {
    vehicleModel: {
      type: String,
      required: false,
    },
    specificDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    searchRadius: {
      type: Number,
      default: 10, // in kilometers
      min: 1,
      max: 50,
    },
  },
  // Appointment-based service fields
  appointmentDetails: {
    isAppointmentBased: {
      type: Boolean,
      default: false,
    },
    appointmentTime: {
      type: Date,
      required: false,
    },
    serviceProviderLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: false,
      },
      address: {
        type: String,
        required: false,
      },
    },
    gpsCheckIn: {
      providerCheckedIn: {
        type: Boolean,
        default: false,
      },
      checkInTime: {
        type: Date,
        required: false,
      },
      checkInLocation: {
        type: [Number],
        required: false,
      },
    },
    confirmationSurvey: {
      customerSurvey: {
        completed: { type: Boolean, default: false },
        experience: {
          type: String,
          enum: ["good", "bad", "didnt_visit"],
          required: false,
        },
        rating: { type: Number, min: 1, max: 5, required: false },
        feedback: { type: String, required: false },
        submittedAt: { type: Date, required: false },
      },
      providerSurvey: {
        completed: { type: Boolean, default: false },
        experience: {
          type: String,
          enum: ["good", "bad", "didnt_meet_yet"],
          required: false,
        },
        rating: { type: Number, min: 1, max: 5, required: false },
        feedback: { type: String, required: false },
        submittedAt: { type: Date, required: false },
      },
      finalStatus: {
        type: String,
        enum: ["successful", "unsuccessful", "pending_review"],
        required: false,
      },
      adminReview: {
        required: { type: Boolean, default: false },
        reviewedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: false,
        },
        reviewedAt: { type: Date, required: false },
        decision: {
          type: String,
          enum: ["successful", "unsuccessful"],
          required: false,
        },
      },
    },
  },
  // Service-specific details
  serviceDetails: {
    shiftingMovers: {
      selectedServices: {
        loadingUnloading: { type: Boolean, default: false },
        packing: { type: Boolean, default: false },
        fixing: { type: Boolean, default: false },
        helpers: { type: Boolean, default: false },
        wheelchairHelper: { type: Boolean, default: false },
      },
      pickupFloorDetails: {
        floor: { type: Number, default: 0 },
        hasLift: { type: Boolean, default: true },
        accessType: {
          type: String,
          enum: ["ground", "stairs", "lift"],
          default: "ground",
        },
      },
      dropoffFloorDetails: {
        floor: { type: Number, default: 0 },
        hasLift: { type: Boolean, default: true },
        accessType: {
          type: String,
          enum: ["ground", "stairs", "lift"],
          default: "ground",
        },
      },
      extras: [
        {
          name: { type: String, required: true },
          count: { type: Number, required: true, min: 1 },
        },
      ],
    },
    carRecovery: {
      // Vehicle details
      vehicleDetails: {
        make: { type: String, required: false },
        model: { type: String, required: false },
        year: { type: Number, required: false },
        color: { type: String, required: false },
        licensePlate: { type: String, required: false },
        vin: { type: String, required: false },
      },
      // Recovery details
      issueType: {
        type: String,
        enum: [
          "breakdown",
          "accident",
          "flat_tire",
          "battery",
          "out_of_fuel",
          "lockout",
          "other",
        ],
        required: false,
      },
      issueDescription: {
        type: String,
        required: false,
      },
      urgencyLevel: {
        type: String,
        enum: ["low", "medium", "high", "emergency"],
        default: "medium",
      },
      // Service options
      serviceOptions: {
        towingRequired: { type: Boolean, default: false },
        winchingRequired: { type: Boolean, default: false },
        jumpStart: { type: Boolean, default: false },
        fuelDelivery: { type: Boolean, default: false },
        tireChange: { type: Boolean, default: false },
        lockoutService: { type: Boolean, default: false },
        longDistanceTowing: { type: Boolean, default: false },
      },
      // Location details
      locationDetails: {
        isVehicleDrivable: { type: Boolean, default: false },
        isVehicleInGarage: { type: Boolean, default: false },
        hasSteeringLock: { type: Boolean, default: false },
        isInDangerousLocation: { type: Boolean, default: false },
        additionalLocationInfo: { type: String, required: false },
      },
      // Additional services
      additionalServices: {
        needHelper: { type: Boolean, default: false },
        needMechanic: { type: Boolean, default: false },
        needFlatbed: { type: Boolean, default: false },
        needSpecialEquipment: { type: Boolean, default: false },
        specialEquipmentDetails: { type: String, required: false },
      },
      // Driver/mechanic notes
      notes: {
        driverNotes: { type: String, required: false },
        mechanicNotes: { type: String, required: false },
        customerNotes: { type: String, required: false },
      },
      // Status tracking
      statusUpdates: [
        {
          status: { type: String, required: true },
          timestamp: { type: Date, default: Date.now },
          updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
          },
          notes: { type: String, required: false },
          location: {
            type: {
              type: String,
              enum: ["Point"],
              default: "Point",
            },
            coordinates: {
              type: [Number],
              required: false,
            },
          },
        },
      ],
      // Photo documentation
      photos: [
        {
          url: { type: String, required: true },
          type: {
            type: String,
            enum: [
              "damage",
              "location",
              "vehicle_condition",
              "before_service",
              "after_service",
              "other",
            ],
            required: true,
          },
          description: { type: String, required: false },
          timestamp: { type: Date, default: Date.now },
        },
      ],
      // Signature
      customerSignature: {
        url: { type: String, required: false },
        signedAt: { type: Date, required: false },
        ipAddress: { type: String, required: false },
      },
      // Payment details specific to recovery
      paymentDetails: {
        baseFee: { type: Number, default: 0 },
        distanceFee: { type: Number, default: 0 },
        serviceFees: { type: Number, default: 0 },
        additionalCharges: { type: Number, default: 0 },
        discount: { type: Number, default: 0 },
        totalAmount: { type: Number, default: 0 },
        paymentMethod: {
          type: String,
          enum: ["cash", "card", "insurance", "other"],
          required: false,
        },
        isPaid: { type: Boolean, default: false },
        paidAt: { type: Date, required: false },
        invoiceNumber: { type: String, required: false },
      },
      // Insurance information
      insuranceInfo: {
        hasInsurance: { type: Boolean, default: false },
        insuranceProvider: { type: String, required: false },
        policyNumber: { type: String, required: false },
        claimNumber: { type: String, required: false },
        isClaimApproved: { type: Boolean, default: false },
        insuranceNotes: { type: String, required: false },
      },
      // Driver/mechanic assignment
      serviceProvider: {
        driverId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: false,
        },
        mechanicId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: false,
        },
        assignedAt: { type: Date, required: false },
        estimatedArrival: { type: Date, required: false },
        actualArrival: { type: Date, required: false },
        completionTime: { type: Date, required: false },
      },
      // Customer feedback
      feedback: {
        rating: { type: Number, min: 1, max: 5, required: false },
        comments: { type: String, required: false },
        submittedAt: { type: Date, required: false },
        followUpRequired: { type: Boolean, default: false },
        followUpNotes: { type: String, required: false },
      },
      // Additional metadata
      metadata: {
        isHighPriority: { type: Boolean, default: false },
        requiresFollowUp: { type: Boolean, default: false },
        isRecurringCustomer: { type: Boolean, default: false },
        tags: [{ type: String, required: false }],
        customFields: { type: Map, of: String, required: false },
      },
    },
  },
  distanceInMeters: {
    type: Number,
    required: [true, "Distance in meters is required"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// ---- Final fare auto-stamping helpers ----

// Terminal states
function isTerminalStatus(status) {
  return status === "completed" || status === "cancelled";
}

// Ensure finalFare gets stamped from current fare when terminal
async function stampFinalFareIfNeeded(doc) {
  try {
    if (!doc) return;
    const status = doc.status;
    if (!isTerminalStatus(status)) return;

    const fare = Number(doc.fare || 0);
    const fd = doc.fareDetails || {};

    // If not set or mismatched, update it
    if (fd.finalFare == null || Number(fd.finalFare) !== fare) {
      await mongoose.model("Booking").updateOne(
        { _id: doc._id },
        {
          $set: {
            "fareDetails.finalFare": fare,
            updatedAt: new Date(),
          },
        }
      );
    }
  } catch (e) {
    // avoid throwing from middleware
  }
}

// When new booking is saved or updated via save()
bookingSchema.post("save", async function (doc, next) {
  try {
    await stampFinalFareIfNeeded(doc);
  } finally {
    next && next();
  }
});

// When booking is updated via findOneAndUpdate()
bookingSchema.post("findOneAndUpdate", async function (doc, next) {
  try {
    await stampFinalFareIfNeeded(doc);
  } finally {
    next && next();
  }
});

bookingSchema.index({ "pickupLocation.coordinates": "2dsphere" });
bookingSchema.index({ "dropoffLocation.coordinates": "2dsphere" });
bookingSchema.index({ user: 1 });
bookingSchema.index({ driver: 1 });
bookingSchema.index({ "rejectedDrivers.driver": 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ serviceType: 1 });
bookingSchema.index({ serviceCategory: 1 });
bookingSchema.index({ vehicleType: 1 });
bookingSchema.index({ driverPreference: 1 });
bookingSchema.index({ pinnedDriverId: 1 });
// New indexes for enhanced features
bookingSchema.index({ "driverFilters.specificDriverId": 1 });
bookingSchema.index({ "driverFilters.vehicleModel": 1 });
bookingSchema.index({ "appointmentDetails.isAppointmentBased": 1 });
bookingSchema.index({ "appointmentDetails.appointmentTime": 1 });
bookingSchema.index({ "appointmentDetails.confirmationSurvey.finalStatus": 1 });
bookingSchema.index({ "fareCalculation.totalCalculatedFare": 1 });
bookingSchema.index({ passengerCount: 1 });
// New indexes for ride system
bookingSchema.index({ "messages.timestamp": 1 });
bookingSchema.index({ "paymentDetails.paymentStatus": 1 });
bookingSchema.index({ "paymentDetails.pendingDriverPayment.isPaid": 1 });
bookingSchema.index({ "rating.userRating.stars": 1 });
bookingSchema.index({ "rating.driverRating.stars": 1 });
bookingSchema.index({ "receipt.receiptNumber": 1 });
bookingSchema.index({ cancelledBy: 1 });
bookingSchema.index({ cancelledAt: 1 });
bookingSchema.index({ resendAttempts: 1 });
bookingSchema.index({ lastResendAt: 1 });
bookingSchema.index({ "userFareIncreases.increasedAt": 1 });
// Unique sparse index for idempotency (allows many nulls, but unique when set)
bookingSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

bookingSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

bookingSchema.pre("findOneAndUpdate", function (next) {
  try {
    const update = this.getUpdate() || {};
    const $set = update.$set || {};

    // Status being set in this update
    const nextStatus =
      $set.status != null
        ? $set.status
        : update.status != null
        ? update.status
        : undefined;

    if (isTerminalStatus(String(nextStatus))) {
      // Fare being set in this update (prefer $set)
      const fareValue =
        $set.fare != null
          ? $set.fare
          : update.fare != null
          ? update.fare
          : undefined;

      if (fareValue != null) {
        // Merge finalFare into the same update
        const merged = { ...update };
        merged.$set = merged.$set || {};
        merged.$set["fareDetails.finalFare"] = Number(fareValue);
        merged.$set.updatedAt = new Date();

        this.setUpdate(merged);
      }
    }
  } catch {
    // never throw from middleware
  }
  next();
});

export default mongoose.models.Booking ||
  mongoose.model("Booking", bookingSchema);
