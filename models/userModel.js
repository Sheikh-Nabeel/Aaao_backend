import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
      match: [
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores",
      ],
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: false,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      minlength: [
        10,
        "Phone number must be exactly 13 characters including country code",
      ],
      maxlength: [
        13,
        "Phone number must be exactly 13 characters including country code",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
    },
    sponsorId: {
      type: String,
      unique: true,
      required: true,
      default: function () {
        return `${uuidv4().split("-")[0]}-${Date.now().toString().slice(-6)}`;
      },
    },
    directReferrals: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    level2Referrals: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    level3Referrals: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    level4Referrals: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    nextLevels: { type: [[mongoose.Schema.Types.ObjectId]], default: [] },
    level: { type: Number, default: 0 },
    sponsorBy: { type: String, trim: true },
    sponsorTree: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    country: { type: String, trim: true },
    cnicImages: { front: { type: String }, back: { type: String } },
    selfieImage: { type: String },
    licenseImage: { type: String },
    gender: { type: String, enum: ["Male", "Female", "Other"], trim: true },
    kycLevel: { type: Number, default: 0 },
    kycStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", null],
      default: null,
    },
    pendingVehicleData: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
    },
    hasVehicle: { type: String, enum: ["yes", "no", null], default: null },
    otp: { type: String, default: null },
    otpExpires: { type: Date, default: null },
    isVerified: { type: Boolean, default: false },
    resetOtp: { type: String, default: null },
    resetOtpExpires: { type: Date },
    role: {
      type: String,
      default: "customer",
      enum: ["customer", "driver", "admin", "superadmin"],
    },
    hasDriver: {
    type: String,
    default: "No",
  },
  },
  { timestamps: true }
);

userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ phoneNumber: 1 });
userSchema.index({ sponsorId: 1 });
userSchema.index({ sponsorBy: 1 });
userSchema.index({ level: 1 });
userSchema.index({ kycLevel: 1 });
userSchema.index({ kycStatus: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ firstName: 1, lastName: 1 });
userSchema.index({ directReferrals: 1 });
userSchema.index({ level2Referrals: 1 });
userSchema.index({ level3Referrals: 1 });
userSchema.index({ level4Referrals: 1 });
userSchema.index({ pendingVehicleData: 1 });
userSchema.index({ sponsorBy: 1, level: 1 });
userSchema.index({ level: 1, createdAt: -1 });
userSchema.index({ kycLevel: 1, role: 1 });

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.getReferralStats = function () {
  return {
    level1: this.directReferrals.length,
    level2: this.level2Referrals.length,
    level3: this.level3Referrals.length,
    level4: this.level4Referrals.length,
    totalReferrals:
      this.directReferrals.length +
      this.level2Referrals.length +
      this.level3Referrals.length +
      this.level4Referrals.length,
    currentLevel: this.level,
  };
};

userSchema.methods.canLevelUp = function () {
  const stats = this.getReferralStats();
  if (stats.level1 >= 3 && this.level < 1) return 1;
  if (stats.level2 >= 3 && this.level < 2) return 2;
  if (stats.level3 >= 3 && this.level < 3) return 3;
  if (stats.level4 >= 3 && this.level < 4) return 4;
  return null;
};

userSchema.methods.getReferralLink = function () {
  return `${process.env.APP_URL}/signup?ref=${this.username}`;
};

export default mongoose.model("User", userSchema);