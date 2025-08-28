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
    assignedVehicles: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "VehicleRegistration",
      default:[],
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
    services: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service",
        default: [],
      },
    ],
    hasDriver: {
      type: String,
      default: "No",
    },
    pinnedDrivers: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    favoriteDrivers: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    qualificationPoints: {
      pgp: {
        monthly: { type: Number, default: 0 },
        accumulated: { type: Number, default: 0 },
        lastResetDate: { type: Date, default: Date.now }
      },
      tgp: {
        monthly: { type: Number, default: 0 },
        accumulated: { type: Number, default: 0 },
        lastResetDate: { type: Date, default: Date.now }
      },
      transactions: {
        type: [{
          points: { type: Number, required: true },
          rideId: { type: String, required: true },
          type: { type: String, enum: ['pgp', 'tgp'], required: true },
          rideType: { type: String, default: 'personal' },
          rideFare: { type: Number, default: 0 },
          timestamp: { type: Date, default: Date.now },
          month: { type: Number, required: true },
          year: { type: Number, required: true }
        }],
        default: []
      }
    },
    crrRank: {
      current: { type: String, enum: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'], default: 'Bronze' },
      lastUpdated: { type: Date, default: Date.now },
      history: {
        type: [{
          rank: { type: String, enum: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'], required: true },
          achievedAt: { type: Date, default: Date.now },
          qualificationPoints: { type: Number, required: true }
        }],
        default: []
      }
    },
    wallet: {
      balance: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: Date.now },
      transactions: {
        type: [{
          amount: { type: Number, required: true },
          type: { type: String, enum: ['credit', 'debit'], required: true },
          description: { type: String, required: true },
          timestamp: { type: Date, default: Date.now }
        }],
        default: []
      }
    },
    bbrParticipation: {
      currentCampaign: {
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'MLM' },
        totalRides: { type: Number, default: 0 },
        soloRides: { type: Number, default: 0 },
        teamRides: { type: Number, default: 0 },
        achieved: { type: Boolean, default: false },
        joinedAt: { type: Date, default: Date.now },
        lastRideAt: { type: Date }
      },
      totalWins: { type: Number, default: 0 },
      totalRewardsEarned: { type: Number, default: 0 },
      history: {
        type: [{
          campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'MLM' },
          totalRides: { type: Number },
          soloRides: { type: Number },
          teamRides: { type: Number },
          achieved: { type: Boolean },
          isWinner: { type: Boolean },
          rewardAmount: { type: Number },
          participatedAt: { type: Date }
        }],
        default: []
      }
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
// New indexes for driver payment tracking
userSchema.index({ "driverPaymentTracking.isRestricted": 1 });
userSchema.index({ "driverPaymentTracking.unpaidRidesCount": 1 });
userSchema.index({ "driverPaymentTracking.totalPendingAmount": 1 });
userSchema.index({ "wallet.balance": 1 });
// Indexes for game points
userSchema.index({ "gamePoints.tgp": 1 });
userSchema.index({ "gamePoints.pgp": 1 });
// Indexes for driver location and status
userSchema.index({ currentLocation: "2dsphere" });
userSchema.index({ isActive: 1 });
userSchema.index({ driverStatus: 1 });
userSchema.index({ lastActiveAt: 1 });
userSchema.index({ role: 1, isActive: 1, driverStatus: 1 });
// Indexes for driver settings
userSchema.index({ "driverSettings.autoAccept.enabled": 1 });
userSchema.index({ "driverSettings.ridePreferences.pinkCaptainMode": 1 });
userSchema.index({ role: 1, "driverSettings.autoAccept.enabled": 1 });
userSchema.index({ "mlmBalance.total": 1 });
userSchema.index({ "mlmBalance.userTree": 1 });
userSchema.index({ "mlmBalance.driverTree": 1 });
userSchema.index({ "mlmBalance.transactions.rideId": 1 });
userSchema.index({ "mlmBalance.transactions.timestamp": -1 });
// Indexes for TGP and PGP tracking
userSchema.index({ "qualificationPoints.pgp.monthly": 1 });
userSchema.index({ "qualificationPoints.pgp.accumulated": 1 });
userSchema.index({ "qualificationPoints.tgp.monthly": 1 });
userSchema.index({ "qualificationPoints.tgp.accumulated": 1 });
userSchema.index({ "qualificationPoints.pgp.lastResetDate": 1 });
userSchema.index({ "qualificationPoints.tgp.lastResetDate": 1 });
userSchema.index({ "qualificationPoints.transactions.rideId": 1 });
userSchema.index({ "qualificationPoints.transactions.timestamp": -1 });
userSchema.index({ "qualificationPoints.transactions.type": 1 });
userSchema.index({
  "qualificationPoints.transactions.month": 1,
  "qualificationPoints.transactions.year": 1,
});
// Indexes for CRR rank tracking
userSchema.index({ "crrRank.current": 1 });
userSchema.index({ "crrRank.lastUpdated": -1 });
userSchema.index({ "crrRank.history.rank": 1 });
userSchema.index({ "crrRank.history.achievedAt": -1 });
// Indexes for BBR participation
userSchema.index({ "bbrParticipation.currentCampaign.campaignId": 1 });
userSchema.index({ "bbrParticipation.currentCampaign.totalRides": 1 });
userSchema.index({ "bbrParticipation.currentCampaign.achieved": 1 });
userSchema.index({ "bbrParticipation.totalWins": 1 });
userSchema.index({ "bbrParticipation.totalRewardsEarned": 1 });
// Indexes for HLR qualification
userSchema.index({ "hlrQualification.isQualified": 1 });
userSchema.index({ "hlrQualification.qualifiedAt": -1 });
userSchema.index({ "hlrQualification.rewardClaimed": 1 });
userSchema.index({ "hlrQualification.retirementEligible": 1 });
userSchema.index({ "hlrQualification.progress.overallProgress": 1 });
// Indexes for Regional Ambassador
userSchema.index({ "regionalAmbassador.isAmbassador": 1 });
userSchema.index({ "regionalAmbassador.rank": 1 });
userSchema.index({ "regionalAmbassador.progress": 1 });
userSchema.index({ "regionalAmbassador.totalEarnings": 1 });
userSchema.index({ "regionalAmbassador.countryRank": 1 });
userSchema.index({ "regionalAmbassador.globalRank": 1 });
userSchema.index({ "regionalAmbassador.isActive": 1 });
userSchema.index({ country: 1, "regionalAmbassador.rank": 1 });

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

// Helper methods for TGP and PGP qualification points management
userSchema.methods.addQualificationPoints = function (data) {
  const { points, rideId, type, rideType, rideFare } = data;
  const currentDate = new Date();
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  // Add transaction
  this.qualificationPoints.transactions.push({
    points,
    rideId,
    type,
    rideType,
    rideFare,
    timestamp: currentDate,
    month,
    year,
  });

  // Update monthly and accumulated totals
  if (type === "pgp") {
    this.qualificationPoints.pgp.monthly += points;
    this.qualificationPoints.pgp.accumulated += points;
  } else if (type === "tgp") {
    this.qualificationPoints.tgp.monthly += points;
    this.qualificationPoints.tgp.accumulated += points;
  }

  return this.save();
};

userSchema.methods.checkAndResetMonthlyQualificationPoints = function () {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  const lastResetPGP = new Date(this.qualificationPoints.pgp.lastResetDate);
  const lastResetTGP = new Date(this.qualificationPoints.tgp.lastResetDate);

  let needsReset = false;

  // Check if PGP needs reset
  if (
    lastResetPGP.getMonth() + 1 !== currentMonth ||
    lastResetPGP.getFullYear() !== currentYear
  ) {
    this.qualificationPoints.pgp.monthly = 0;
    this.qualificationPoints.pgp.lastResetDate = currentDate;
    needsReset = true;
  }

  // Check if TGP needs reset
  if (
    lastResetTGP.getMonth() + 1 !== currentMonth ||
    lastResetTGP.getFullYear() !== currentYear
  ) {
    this.qualificationPoints.tgp.monthly = 0;
    this.qualificationPoints.tgp.lastResetDate = currentDate;
    needsReset = true;
  }

  if (needsReset) {
    return this.save();
  }

  return Promise.resolve(this);
};

userSchema.methods.getQualificationPointsStats = function () {
  return {
    pgp: {
      monthly: this.qualificationPoints.pgp.monthly,
      accumulated: this.qualificationPoints.pgp.accumulated,
      lastResetDate: this.qualificationPoints.pgp.lastResetDate,
    },
    tgp: {
      monthly: this.qualificationPoints.tgp.monthly,
      accumulated: this.qualificationPoints.tgp.accumulated,
      lastResetDate: this.qualificationPoints.tgp.lastResetDate,
    },
    total: {
      monthly:
        this.qualificationPoints.pgp.monthly +
        this.qualificationPoints.tgp.monthly,
      accumulated:
        this.qualificationPoints.pgp.accumulated +
        this.qualificationPoints.tgp.accumulated,
    },
  };
};

userSchema.methods.getQualificationPointsTransactions = function (limit = 50) {
  return this.qualificationPoints.transactions
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

// Method to check MLM level qualification based on TGP/PGP points
userSchema.methods.checkMLMQualification = function () {
  const stats = this.getQualificationPointsStats();

  // Placeholder for qualification logic - will be updated when conditions are provided
  const qualifications = {
    crr: false,
    bbr: false,
    hlr: false,
    regionalAmbassador: false,
  };

  // TODO: Implement qualification logic based on TGP/PGP thresholds
  // This will be updated when user provides the qualification conditions

  return qualifications;
};

// CRR Rank Management Methods
userSchema.methods.updateCRRRank = async function(rankThresholds) {
  // If rankThresholds is not provided, get them from MLM model
  if (!rankThresholds) {
    const MLM = mongoose.model('MLM');
    const mlm = await MLM.findOne();
    if (mlm && mlm.rankThresholds) {
      rankThresholds = mlm.rankThresholds;
    } else {
      // Default rank thresholds if MLM is not available
      rankThresholds = {
        Bronze: { min: 0, max: 999 },
        Silver: { min: 1000, max: 2499 },
        Gold: { min: 2500, max: 4999 },
        Platinum: { min: 5000, max: 9999 },
        Diamond: { min: 10000, max: null }
      };
    }
  }
  const stats = this.getQualificationPointsStats();
  const tgpPoints = stats.tgp.accumulated;
  const pgpPoints = stats.pgp.accumulated;
  const totalPoints = stats.total.accumulated;
  
  let newRank = 'Bronze';
  
  // Determine rank based on total qualification points
  if (totalPoints >= rankThresholds.Diamond.min) {
    newRank = 'Diamond';
  } else if (totalPoints >= rankThresholds.Platinum.min) {
    newRank = 'Platinum';
  } else if (totalPoints >= rankThresholds.Gold.min) {
    newRank = 'Gold';
  } else if (totalPoints >= rankThresholds.Silver.min) {
    newRank = 'Silver';
  }
  
  // Update rank if it has changed
  if (this.crrRank.current !== newRank) {
    // Add to history
    this.crrRank.history.push({
      rank: newRank,
      achievedAt: new Date(),
      qualificationPoints: totalPoints
    });
    
    this.crrRank.current = newRank;
    this.crrRank.lastUpdated = new Date();
    
    return this.save();
  }

  return Promise.resolve(this);
};

userSchema.methods.getCRRRankProgress = function(rankThresholds) {
  const stats = this.getQualificationPointsStats();
  const tgpPoints = stats.tgp.accumulated;
  const pgpPoints = stats.pgp.accumulated;
  const totalPoints = stats.total.accumulated;
  const currentRank = this.crrRank.current;
  
  let nextRank = null;
  let pointsToNext = 0;
  let progressPercentage = 0;
  
  // Determine next rank and progress
  switch (currentRank) {
    case 'Bronze':
      nextRank = 'Silver';
      pointsToNext = rankThresholds.Silver.min - totalPoints;
      progressPercentage = (totalPoints / rankThresholds.Silver.min) * 100;
      break;
    case 'Silver':
      nextRank = 'Gold';
      pointsToNext = rankThresholds.Gold.min - totalPoints;
      progressPercentage = ((totalPoints - rankThresholds.Silver.min) / (rankThresholds.Gold.min - rankThresholds.Silver.min)) * 100;
      break;
    case 'Gold':
      nextRank = 'Platinum';
      pointsToNext = rankThresholds.Platinum.min - totalPoints;
      progressPercentage = ((totalPoints - rankThresholds.Gold.min) / (rankThresholds.Platinum.min - rankThresholds.Gold.min)) * 100;
      break;
    case 'Platinum':
      nextRank = 'Diamond';
      pointsToNext = rankThresholds.Diamond.min - totalPoints;
      progressPercentage = ((totalPoints - rankThresholds.Platinum.min) / (rankThresholds.Diamond.min - rankThresholds.Platinum.min)) * 100;
      break;
    case 'Diamond':
      nextRank = null;
      pointsToNext = 0;
      progressPercentage = 100;
      break;
  }

  return {
    currentRank,
    nextRank: threshold.next,
    currentPoints: { total: totalPoints, tgp: tgpPoints, pgp: pgpPoints },
    pointsToNext: { tgp: tgpPointsToNext, pgp: pgpPointsToNext },
    progressPercentage: Math.min(100, Math.max(0, progressPercentage)),
    rankHistory: this.crrRank.history.sort((a, b) => new Date(b.achievedAt) - new Date(a.achievedAt))
  };
};

userSchema.methods.getCRRRankHistory = function () {
  return this.crrRank.history.sort(
    (a, b) => new Date(b.achievedAt) - new Date(a.achievedAt)
  );
};

// Wallet management methods
userSchema.methods.addToWallet = function (amount) {
  this.wallet.balance += amount;
  return this.save();
};

userSchema.methods.deductFromWallet = function (amount) {
  if (this.wallet.balance >= amount) {
    this.wallet.balance -= amount;
    return this.save();
  }
  throw new Error("Insufficient wallet balance");
};

userSchema.methods.getWalletBalance = function () {
  return this.wallet.balance;
};

userSchema.methods.hasWalletBalance = function (amount) {
  return this.wallet.balance >= amount;
};

export default mongoose.model("User", userSchema);
