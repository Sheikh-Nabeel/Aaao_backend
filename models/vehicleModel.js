import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  licenseImage: {
    type: String, // URL from Cloudinary, now set only via uploadLicense
    required: false,
  },
  vehicleRegistrationCard: {
    front: { type: String, required: false }, // URL from Cloudinary
    back: { type: String, required: false }, // URL from Cloudinary
  },
  roadAuthorityCertificate: { type: String, required: false }, // URL from Cloudinary
  insuranceCertificate: { type: String, required: false }, // URL from Cloudinary
  vehicleImages: [{ type: String, required: false }], // Array of URLs from Cloudinary
  vehicleOwnerName: { type: String, required: false },
  companyName: { type: String, required: false },
  vehiclePlateNumber: { type: String, required: false },
  vehicleMakeModel: {
    type: String, // e.g., "Toyota Camry 2005"
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Vehicle", vehicleSchema);
