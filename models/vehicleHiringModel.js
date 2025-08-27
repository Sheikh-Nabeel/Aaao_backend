import mongoose from "mongoose";

const vehicleRegistrationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
        "towing services",
        "winching services",
        "roadside assistance",
        "specialized/heavy recovery",
        "small mover",
        "medium mover",
        "heavy mover",
      ],
      trim: true,
    },
    vehicleType: {
      type: String,
      required: false,
      enum: [
        "economy",
        "premium",
        "xl",
        "family",
        "luxury",
        "vip",
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
  },
  { timestamps: true }
);

const driverHiringSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VehicleRegistration",
      required: [true, "Vehicle ID is required"],
    },
    vehicleOwnerName: { type: String, required: true },
    companyName: { type: String, required: false },
    companyEmirate: { type: String, required: false },
    vehicleType: { type: String, required: false },
    vehiclePlateNumber: { type: String, required: true },
    vehicleMakeModel: { type: String, required: false },
    registrationCard: {
      front: {
        type: String,
        required: [true, "Vehicle registration card front is required"],
      },
      back: {
        type: String,
        required: [true, "Vehicle registration card back is required"],
      },
    },
    vehicleImages: {
      type: [String],
      required: [true, "At least one vehicle image is required"],
      validate: {
        validator: (arr) => arr.length > 0,
        message: "At least one vehicle image is required",
      },
    },
    engagementType: {
      type: String,
      enum: ["Salary Based", "Rental Based", "Sharing"],
      required: true,
    },
    salaryOffered: {
      type: Number,
      required: function () {
        return this.engagementType === "Salary Based";
      },
    },
    driverCanOfferCounterRent: { type: Boolean, default: false },
    agreementDuration: {
      type: String,
      enum: ["Open End", "6 month", "8 month", "Custom"],
      required: true,
    },
    customDurationAmount: {
      type: Number,
      required: function () {
        return this.agreementDuration === "Custom";
      },
    },
    maintenanceResponsibilities: {
      minor: {
        dailyFuel: {
          owner: { type: Boolean, default: false },
          driver: { type: Boolean, default: false },
        },
        carWash: {
          owner: { type: Boolean, default: false },
          driver: { type: Boolean, default: false },
        },
        oilChange: {
          owner: { type: Boolean, default: false },
          driver: { type: Boolean, default: false },
        },
        tyrePressureCheck: {
          owner: { type: Boolean, default: false },
          driver: { type: Boolean, default: false },
        },
      },
      major: {
        engineRepairs: {
          owner: { type: Boolean, default: false },
          driver: { type: Boolean, default: false },
        },
        transmissionSystem: {
          owner: { type: Boolean, default: false },
          driver: { type: Boolean, default: false },
        },
        acSystem: {
          owner: { type: Boolean, default: false },
          driver: { type: Boolean, default: false },
        },
      },
      custom: [
        {
          name: { type: String, required: true },
          owner: { type: Boolean, default: false },
          driver: { type: Boolean, default: false },
        },
      ],
    },
    workSchedule: {
      type: String,
      enum: [
        "Full-Time",
        "Part-Time",
        "Family Use",
        "Ride-Hailing",
        "Tourism/Inter-Emirate",
      ],
      required: true,
    },
    shiftTimingOrDutyHours: { type: String, required: true },
    preferredStartDate: { type: Date, required: true },
    informationConfirmed: { type: Boolean, default: false },
    autoGeneratedAgreement: { type: Boolean, default: false },
    mutualApproval: { type: Boolean, default: false },
    termsAgreed: { type: Boolean, default: false },
    digitalSignature: { type: String, required: true },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", null],
      default: "pending",
      required: true,
    },
    adminComments: {
      type: String,
      required: false,
      default: null,
    },
    driverApplications: [
      {
        driverId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        proposal: { type: String, required: true },
        applicationStatus: {
          type: String,
          enum: ["pending", "accepted", "rejected"],
          default: "pending",
        },
        appliedAt: { type: Date, default: Date.now },
      },
    ],
    selectedDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

vehicleRegistrationSchema.index({ userId: 1 });
driverHiringSchema.index({ userId: 1, vehicleId: 1, approvalStatus: 1 });
driverHiringSchema.index({ "driverApplications.driverId": 1 });
driverHiringSchema.index({ "driverApplications.applicationStatus": 1 });
driverHiringSchema.index({ selectedDriverId: 1 });

export const VehicleRegistration =
  mongoose.models.VehicleRegistration ||
  mongoose.model("VehicleRegistration", vehicleRegistrationSchema);
export const DriverHiring =
  mongoose.models.DriverHiring ||
  mongoose.model("DriverHiring", driverHiringSchema);