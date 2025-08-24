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
      required: [true, "Last name is required"],
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
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
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
    // Driver payment tracking for cash rides
    driverPaymentTracking: {
      totalPendingAmount: {
        type: Number,
        default: 0,
      },
      unpaidRidesCount: {
        type: Number,
        default: 0,
      },
      lastPaymentDate: {
        type: Date,
        required: false,
      },
      isRestricted: {
        type: Boolean,
        default: false, // true if driver has 3+ unpaid rides
      },
      restrictedAt: {
        type: Date,
        required: false,
      },
      paymentHistory: [{
        amount: {
          type: Number,
          required: true,
        },
        paidAt: {
          type: Date,
          default: Date.now,
        },
        bookingId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Booking",
          required: false,
        },
        paymentMethod: {
          type: String,
          enum: ["cash", "bank_transfer", "adjustment"],
          default: "cash",
        },
      }],
    },
    // Driver wallet for earnings
    wallet: {
      balance: {
        type: Number,
        default: 0,
      },
      totalEarnings: {
        type: Number,
        default: 0,
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },
    // Game Points System
    gamePoints: {
      tgp: {
        type: Number,
        default: 0,
        min: 0,
      },
      pgp: {
        type: Number,
        default: 0,
        min: 0,
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },
    // Driver location tracking
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      },
      address: {
        type: String,
        default: ''
      },
      lastUpdated: {
        type: Date,
        default: Date.now
      }
    },
    // Driver status for real-time tracking
    isActive: {
      type: Boolean,
      default: false
    },
    driverStatus: {
      type: String,
      enum: ['online', 'offline', 'busy'],
      default: 'offline'
    },
    lastActiveAt: {
      type: Date,
      default: Date.now
    },
    // Driver settings for auto-accept and ride preferences
    driverSettings: {
      autoAccept: {
        enabled: {
          type: Boolean,
          default: false,
        },
        minFare: {
          type: Number,
          default: 100,
        },
      },
      ridePreferences: {
        acceptBike: {
          type: Boolean,
          default: true,
        },
        acceptRickshaw: {
          type: Boolean,
          default: true,
        },
        acceptCar: {
          type: Boolean,
          default: true,
        },
        acceptMini: {
          type: Boolean,
          default: true,
        },
        pinkCaptainMode: {
          type: Boolean,
          default: false,
        },
        acceptFemaleOnly: {
          type: Boolean,
          default: false,
        },
        acceptFamilyRides: {
          type: Boolean,
          default: false,
        },
        acceptSafeRides: {
          type: Boolean,
          default: false,
        },
      },
    },
  },
  { timestamps: true } // Add timestamps option
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
userSchema.index({ createdAt: -1 }); // Index on createdAt (auto-generated by timestamps)
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
// New indexes for driver payment tracking
userSchema.index({ "driverPaymentTracking.isRestricted": 1 });
userSchema.index({ "driverPaymentTracking.unpaidRidesCount": 1 });
userSchema.index({ "driverPaymentTracking.totalPendingAmount": 1 });
userSchema.index({ "wallet.balance": 1 });
// Indexes for game points
userSchema.index({ "gamePoints.tgp": 1 });
userSchema.index({ "gamePoints.pgp": 1 });
// Indexes for driver location and status
userSchema.index({ "currentLocation": "2dsphere" });
userSchema.index({ "isActive": 1 });
userSchema.index({ "driverStatus": 1 });
userSchema.index({ "lastActiveAt": 1 });
userSchema.index({ "role": 1, "isActive": 1, "driverStatus": 1 });
// Indexes for driver settings
userSchema.index({ "driverSettings.autoAccept.enabled": 1 });
userSchema.index({ "driverSettings.ridePreferences.pinkCaptainMode": 1 });
userSchema.index({ role: 1, "driverSettings.autoAccept.enabled": 1 });

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
