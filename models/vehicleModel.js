import mongoose from "mongoose";

// Define the vehicle schema
const vehicleSchema = new mongoose.Schema({
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
    front: { type: String, required: false },
    back: { type: String, required: false },
  },
  roadAuthorityCertificate: { type: String, required: false },
  insuranceCertificate: { type: String, required: false },
  vehicleImages: [{ type: String, required: false }],
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
  vehicleType: {
    type: String,
    enum: ["bike", "minicar", "accar", "luxurycar", "premium"],
    required: false,
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

vehicleSchema.index({ userId: 1 });
vehicleSchema.index({ status: 1 });

// Export the Vehicle model, reusing existing model if already compiled
export default mongoose.models.Vehicle ||
  mongoose.model("Vehicle", vehicleSchema);
