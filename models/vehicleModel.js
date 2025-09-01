import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    licenseImage: {
      type: String,
      required: false,
    },
    vehicleRegistrationCard: {
      front: {
        type: String,
        required: [true, "Vehicle registration card front is required"],
      },
      back: {
        type: String,
        required: [true, "Vehicle registration card back is required"],
      },
    },
    roadAuthorityCertificate: {
      type: String,
      required: [true, "Road authority certificate is required"],
    },
    insuranceCertificate: {
      type: String,
      required: [true, "Insurance certificate is required"],
    },
    vehicleImages: {
      type: [String],
      required: [true, "At least one vehicle image is required"],
      validate: {
        validator: (arr) => arr.length > 0,
        message: "At least one vehicle image is required",
      },
    },
    vehicleOwnerName: { type: String, required: false },
    companyName: { type: String, required: false },
    vehiclePlateNumber: { type: String, required: false },
    vehicleMakeModel: {
      type: String,
      required: false,
      match: [
        /^[A-Za-z\s]+[A-Za-z\s]+\d{4}$/,
        "Format should be 'Make Model Year' (e.g., 'Toyota Camry 2005')",
      ],
    },
    chassisNumber: { type: String, required: false },
    vehicleColor: { type: String, required: false },
    registrationExpiryDate: { type: Date, required: false },
    serviceType: {
      type: String,
      enum: ["car cab", "bike", "car recovery", "shifting & movers"],
      required: false,
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
        // Allow null/undefined by keeping required false
      ],
      trim: true,
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
      validate: {
        validator: function (value) {
          if (!this.serviceType) return true;
          const validTypes = {
            "car cab": ["economy", "premium", "xl", "family", "luxury"],
            bike: ["economy", "premium", "vip"],
            "car recovery": [
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
            ],
            "shifting & movers": [
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
          };
          return validTypes[this.serviceType]?.includes(value);
        },
        message: (props) =>
          `Invalid vehicleType '${props.value}' for serviceType '${
            props.instance.serviceType
          }'. Valid options are: ${
            props.instance.serviceType === "car cab"
              ? "economy, premium, xl, family, luxury"
              : props.instance.serviceType === "bike"
              ? "economy, premium, vip"
              : props.instance.serviceType === "car recovery"
              ? "flatbed towing, wheel lift towing, on-road winching, off-road winching, battery jump start, fuel delivery, luxury & exotic car recovery, accident & collision recovery, heavy-duty vehicle recovery, basement pull-out"
              : "mini pickup, suzuki carry, small van, medium truck, mazda, covered van, large truck, 6-wheeler, container truck"
          }`,
      },
    },
    wheelchair: {
      type: Boolean,
      default: false,
      required: false,
    },
    packingHelper: {
      type: Boolean,
      default: false,
      required: false,
    },
    loadingUnloadingHelper: {
      type: Boolean,
      default: false,
      required: false,
    },
    fixingHelper: {
      type: Boolean,
      default: false,
      required: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: false,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", null],
      default: "pending",
    },
    rejectionReason: { type: String, required: false },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

// Note: For UI implementation, ensure Round Trip bookings for all categories (car cab and bike) display:
// 1. A discount of AED 10 (e.g., "You saved AED 10").
// 2. Free stay minutes (e.g., "30 minutes free waiting time for round trip").
// This is not stored in the schema but should be handled in the frontend logic based on booking type (round trip) and service category.

vehicleSchema.index({ userId: 1 });
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ serviceType: 1 });
vehicleSchema.index({ serviceCategory: 1 });
vehicleSchema.index({ vehicleType: 1 });

export default mongoose.models.Vehicle ||
  mongoose.model("Vehicle", vehicleSchema);
