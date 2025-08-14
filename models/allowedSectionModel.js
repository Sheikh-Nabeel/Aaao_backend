import mongoose from "mongoose";

const allowedSectionSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Admin ID is required"],
  },
  sections: {
    type: [String],
    default: [],
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

allowedSectionSchema.index({ adminId: 1 });

allowedSectionSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.models.AllowedSection ||
  mongoose.model("AllowedSection", allowedSectionSchema);
