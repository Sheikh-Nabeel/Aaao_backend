import mongoose from "mongoose";

// Item-specific pricing schema for shifting/movers
const itemPricingSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true,
    enum: [
      "bed",
      "sofa",
      "fridge",
      "washing_machine",
      "dining_table",
      "wardrobe",
      "tv",
      "ac",
      "other",
    ],
  },
  stairsFarePerFloor: {
    type: Number,
    default: 0,
  },
  liftFarePerItem: {
    type: Number,
    default: 0,
  },
  packingFare: {
    type: Number,
    default: 0,
  },
  fixingFare: {
    type: Number,
    default: 0,
  },
  loadingUnloadingFare: {
    type: Number,
    default: 0,
  },
});

// Shifting/Movers pricing configuration
const shiftingMoversPricingSchema = new mongoose.Schema({
  vehicleType: {
    type: String,
    required: true,
  },
  vehicleStartFare: {
    type: Number,
    required: true,
  },
  perKmFare: {
    type: Number,
    required: true,
  },
  basicServices: {
    loadingUnloadingHelper: {
      fare: { type: Number, default: 20 },
      includeInBasicFare: { type: Boolean, default: false },
      baseLimit: { type: Number, default: 3 },
    },
    packers: {
      fare: { type: Number, default: 20 },
      includeInBasicFare: { type: Boolean, default: false },
      baseLimit: { type: Number, default: 3 },
    },
    fixers: {
      fare: { type: Number, default: 20 },
      includeInBasicFare: { type: Boolean, default: false },
      baseLimit: { type: Number, default: 3 },
    },
  },
  itemPricing: [itemPricingSchema],
  locationPolicy: {
    groundFloor: {
      extraCharge: { type: Number, default: 0 },
    },
    stairs: {
      enabled: { type: Boolean, default: true },
      baseCoverageFloors: { type: Number, default: 1 },
    },
    lift: {
      enabled: { type: Boolean, default: true },
      baseCoverageFloors: { type: Number, default: 1 },
    },
  },
});

// Car Recovery pricing configuration (per sub-service map)
// Expected keys under serviceCharges: default, towing, winching, roadside_assistance, key_unlock, specialized_recovery
// Each entry should have: { baseKm, baseFare, perKm }
const carRecoveryPricingSchema = new mongoose.Schema({
  serviceCharges: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      default: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      towing: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      winching: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      roadside_assistance: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      key_unlock: { baseKm: 6, baseFare: 50, perKm: 7.5 },
      specialized_recovery: { baseKm: 6, baseFare: 50, perKm: 7.5 },
    },
  },
  platformCharges: {
    percentage: { type: Number, default: 15 },
    splitRatio: {
      customer: { type: Number, default: 50 },
      serviceProvider: { type: Number, default: 50 },
    },
  },
  // Optional: admin-defined cancellation stages (fallbacks exist in handler)
  cancellationCharges: {
    before25Percent: {
      amount: { type: Number, default: 2 },
      type: { type: String, enum: ["AED", "PERCENT"], default: "AED" },
    },
    after25Percent: {
      amount: { type: Number, default: 3 },
      type: { type: String, enum: ["AED", "PERCENT"], default: "AED" },
    },
    after50Percent: {
      amount: { type: Number, default: 5 },
      type: { type: String, enum: ["AED", "PERCENT"], default: "AED" },
    },
    afterArrival: {
      amount: { type: Number, default: 10 },
      type: { type: String, enum: ["AED", "PERCENT"], default: "AED" },
    },
  },
});

// Key Unlocker pricing configuration
const keyUnlockerPricingSchema = new mongoose.Schema({
  serviceCharges: {
    type: Number,
    required: true,
  },
  platformCharges: {
    percentage: { type: Number, default: 15 },
    splitRatio: {
      customer: { type: Number, default: 50 },
      serviceProvider: { type: Number, default: 50 },
    },
  },
});

// Appointment-based services pricing
const appointmentServicePricingSchema = new mongoose.Schema({
  serviceCategory: {
    type: String,
    enum: ["workshop", "tyre_shop", "key_unlocker", "other"],
    required: true,
  },
  fixedAppointmentFee: {
    type: Number,
    default: 5,
  },
  confirmationSettings: {
    surveyTimeoutHours: { type: Number, default: 24 },
    gpsCheckInRequired: { type: Boolean, default: true },
    autoDecisionEnabled: { type: Boolean, default: true },
  },
});

// Main pricing configuration schema
const pricingConfigSchema = new mongoose.Schema(
  {
    serviceType: {
      type: String,
      enum: [
        "car_cab",
        "bike",
        "shifting_movers",
        "car_recovery",
        "key_unlocker",
        "appointment_based",
      ],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    shiftingMoversConfig: shiftingMoversPricingSchema,
    carRecoveryConfig: carRecoveryPricingSchema,
    keyUnlockerConfig: keyUnlockerPricingSchema,
    appointmentServiceConfig: appointmentServicePricingSchema,

    // Global pricing settings
    currency: {
      type: String,
      default: "AED",
    },
    fareAdjustmentSettings: {
      allowedAdjustmentPercentage: {
        type: Number,
        default: 3,
        min: 0,
        max: 50,
      },
      enableUserFareAdjustment: {
        type: Boolean,
        default: true,
      },
      enablePendingBookingFareIncrease: {
        type: Boolean,
        default: true,
      },
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
pricingConfigSchema.index({ serviceType: 1 });
pricingConfigSchema.index({ isActive: 1 });

const PricingConfig = mongoose.model("PricingConfig", pricingConfigSchema);

export default PricingConfig;
