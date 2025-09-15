import mongoose from "mongoose";

const offerSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true,
    minlength: [3, "Title must be at least 3 characters"],
    maxlength: [100, "Title cannot exceed 100 characters"],
    default: null,
  },
  description: {
    type: String,
    trim: true,
    minlength: [10, "Description must be at least 10 characters"],
    default: null,
  },
  picture: {
    type: String,
    trim: true,
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }],
  likeCount: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

offerSchema.index({ createdAt: -1 });
offerSchema.index({ createdBy: 1 });
offerSchema.index({ likes: 1 });

export default mongoose.model("Offer", offerSchema);
