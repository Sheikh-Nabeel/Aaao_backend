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
      enum: ["vehicle cab", "car recovery"],
      required: false,
    },
    vehicleType: {
      type: String,
      required: false,
      validate: {
        validator: function (value) {
          if (!this.serviceType) return true;
          const validTypes = {
            "vehicle cab": ["bike", "minicar", "accar", "luxurycar", "premium"],
            "car recovery": ["recovery truck", "hook-and-chain tow truck"],
          };
          return validTypes[this.serviceType]?.includes(value);
        },
        message: (props) =>
          `Invalid vehicleType '${props.value}' for serviceType '${
            props.instance.serviceType
          }'. Valid options are: ${
            props.instance.serviceType === "vehicle cab"
              ? "bike, minicar, accar, luxurycar, premium"
              : "recovery truck, hook-and-chain tow truck"
          }`,
      },
    },
    wheelchair: {
      type: Boolean,
      default: false,
      required: false,
    },
    status: {
      type: String,
      enum: ["pending", "approved", null],
      default: "pending",
    },
  },
  { timestamps: true } // Add timestamps option
);

vehicleSchema.index({ userId: 1 });
vehicleSchema.index({ status: 1 });

export default mongoose.models.Vehicle ||
  mongoose.model("Vehicle", vehicleSchema);
