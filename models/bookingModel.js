import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User ID is required"],
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
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
  status: {
    type: String,
    enum: ["pending", "accepted", "in_progress", "completed", "cancelled"],
    default: "pending",
  },
  serviceType: {
    type: String,
    enum: ["vehicle cab", "car recovery"],
    required: [true, "Service type is required"],
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

bookingSchema.index({ "pickupLocation.coordinates": "2dsphere" });
bookingSchema.index({ "dropoffLocation.coordinates": "2dsphere" });
bookingSchema.index({ userId: 1 });
bookingSchema.index({ driverId: 1 });
bookingSchema.index({ status: 1 });

bookingSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.models.Booking ||
  mongoose.model("Booking", bookingSchema);
