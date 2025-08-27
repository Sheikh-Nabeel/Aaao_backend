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
    
    // MLM Balance and Earnings Tracking
    mlmBalance: {
      total: { type: Number, default: 0 },
      userTree: { type: Number, default: 0 },
      driverTree: { type: Number, default: 0 },
      transactions: [{
        rideId: { type: String, required: true },
        amount: { type: Number, required: true },
        type: { type: String, enum: ['userTree', 'driverTree'], required: true },
        timestamp: { type: Date, default: Date.now }
      }]
    },
    
    // Qualification Points (TGP/PGP) System
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
      transactions: [{
        points: { type: Number, required: true },
        rideId: { type: String, required: true },
        type: { type: String, enum: ['pgp', 'tgp'], required: true },
        rideType: { type: String, enum: ['personal', 'team'], required: true },
        rideFare: { type: Number, required: true },
        timestamp: { type: Date, default: Date.now },
        month: { type: Number, required: true },
        year: { type: Number, required: true }
      }]
    },
    
    // CRR Rank System
    crrRank: {
      current: { type: String, enum: ['Challenger', 'Warrior', 'Tycoon', 'Champion', 'Boss'], default: null },
      lastUpdated: { type: Date, default: null },
      rewardAmount: { type: Number, default: 0 },
      history: [{
        rank: { type: String, enum: ['Challenger', 'Warrior', 'Tycoon', 'Champion', 'Boss'], required: true },
        achievedAt: { type: Date, default: Date.now },
        qualificationPoints: { type: Number, required: true },
        rewardAmount: { type: Number, default: 0 }
      }]
    },
    
    // BBR Participation Tracking
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
      pastCampaigns: [{
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'MLM' },
        ridesCompleted: { type: Number, default: 0 },
        achieved: { type: Boolean, default: false },
        rewardEarned: { type: Number, default: 0 },
        completedAt: { type: Date }
      }]
    },
    
    // HLR Qualification System
    hlrQualification: {
      isQualified: { type: Boolean, default: false },
      qualifiedAt: { type: Date },
      rewardClaimed: { type: Boolean, default: false },
      claimedAt: { type: Date },
      claimReason: { type: String, enum: ['retirement', 'deceased'] },
      retirementEligible: { type: Boolean, default: false },
      progress: {
        pgpPoints: { type: Number, default: 0 },
        tgpPoints: { type: Number, default: 0 },
        overallProgress: { type: Number, default: 0 }
      }
    },
    
    // Regional Ambassador System
    regionalAmbassador: {
      isAmbassador: {
        type: Boolean,
        default: false
      },
      rank: {
        type: String,
        enum: ['Challenger', 'Warrior', 'Tycoon', 'Champion', 'Boss'],
        default: null
      },
      progress: {
        type: Number,
        default: 0
      },
      totalEarnings: {
        type: Number,
        default: 0
      },
      countryRank: {
        type: Number,
        default: null
      },
      globalRank: {
        type: Number,
        default: null
      },
      isActive: {
        type: Boolean,
        default: true
      },
      // CRR-based Regional Ambassador fields
      crrRankBased: {
        type: Boolean,
        default: false
      },
      isPermanent: {
        type: Boolean,
        default: false
      },
      diamondAchievedAt: {
        type: Date,
        default: null
      },
      achievedAt: {
        type: Date,
        default: null
      }
    },
    
    // Wallet System
    wallet: {
      balance: { type: Number, default: 0 },
      transactions: [{
        amount: { type: Number, required: true },
        type: { type: String, enum: ['credit', 'debit'], required: true },
        description: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
      }]
    }
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
userSchema.index({ "currentLocation": "2dsphere" });
userSchema.index({ "isActive": 1 });
userSchema.index({ "driverStatus": 1 });
userSchema.index({ "lastActiveAt": 1 });
userSchema.index({ "role": 1, "isActive": 1, "driverStatus": 1 });
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
userSchema.index({ "qualificationPoints.transactions.month": 1, "qualificationPoints.transactions.year": 1 });
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
userSchema.index({ "country": 1, "regionalAmbassador.rank": 1 });

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
userSchema.methods.addQualificationPoints = function(data) {
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
    year
  });
  
  // Update monthly and accumulated totals
  if (type === 'pgp') {
    this.qualificationPoints.pgp.monthly += points;
    this.qualificationPoints.pgp.accumulated += points;
  } else if (type === 'tgp') {
    this.qualificationPoints.tgp.monthly += points;
    this.qualificationPoints.tgp.accumulated += points;
  }
  
  return this.save();
};

userSchema.methods.checkAndResetMonthlyQualificationPoints = function() {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  const lastResetPGP = new Date(this.qualificationPoints.pgp.lastResetDate);
  const lastResetTGP = new Date(this.qualificationPoints.tgp.lastResetDate);
  
  let needsReset = false;
  
  // Check if PGP needs reset
  if (lastResetPGP.getMonth() + 1 !== currentMonth || lastResetPGP.getFullYear() !== currentYear) {
    this.qualificationPoints.pgp.monthly = 0;
    this.qualificationPoints.pgp.lastResetDate = currentDate;
    needsReset = true;
  }
  
  // Check if TGP needs reset
  if (lastResetTGP.getMonth() + 1 !== currentMonth || lastResetTGP.getFullYear() !== currentYear) {
    this.qualificationPoints.tgp.monthly = 0;
    this.qualificationPoints.tgp.lastResetDate = currentDate;
    needsReset = true;
  }
  
  if (needsReset) {
    return this.save();
  }
  
  return Promise.resolve(this);
};

userSchema.methods.getQualificationPointsStats = function() {
  return {
    pgp: {
      monthly: this.qualificationPoints.pgp.monthly,
      accumulated: this.qualificationPoints.pgp.accumulated,
      lastResetDate: this.qualificationPoints.pgp.lastResetDate
    },
    tgp: {
      monthly: this.qualificationPoints.tgp.monthly,
      accumulated: this.qualificationPoints.tgp.accumulated,
      lastResetDate: this.qualificationPoints.tgp.lastResetDate
    },
    total: {
      monthly: this.qualificationPoints.pgp.monthly + this.qualificationPoints.tgp.monthly,
      accumulated: this.qualificationPoints.pgp.accumulated + this.qualificationPoints.tgp.accumulated
    }
  };
};

userSchema.methods.getQualificationPointsTransactions = function(limit = 50) {
  return this.qualificationPoints.transactions
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

// Method to check MLM level qualification based on TGP/PGP points
userSchema.methods.checkMLMQualification = function() {
  const stats = this.getQualificationPointsStats();
  
  // Placeholder for qualification logic - will be updated when conditions are provided
  const qualifications = {
    crr: false,
    bbr: false,
    hlr: false,
    regionalAmbassador: false
  };
  
  // TODO: Implement qualification logic based on TGP/PGP thresholds
  // This will be updated when user provides the qualification conditions
  
  return qualifications;
};

// CRR Rank Management Methods
userSchema.methods.updateCRRRank = async function() {
  const stats = this.getQualificationPointsStats();
  const tgpPoints = stats.tgp.accumulated;
  const pgpPoints = stats.pgp.accumulated;
  const totalPoints = stats.total.accumulated;
  
  let newRank = null;
  let rewardAmount = 0;
  
  // Determine rank based on BOTH TGP and PGP qualification points
  // Users must achieve minimum points in BOTH categories to get any rank
  if (tgpPoints >= 100000 && pgpPoints >= 100000) {
    newRank = 'Boss';
    rewardAmount = 200000;
  } else if (tgpPoints >= 25000 && pgpPoints >= 25000) {
    newRank = 'Champion';
    rewardAmount = 50000;
  } else if (tgpPoints >= 10000 && pgpPoints >= 10000) {
    newRank = 'Tycoon';
    rewardAmount = 20000;
  } else if (tgpPoints >= 2500 && pgpPoints >= 2500) {
    newRank = 'Warrior';
    rewardAmount = 5000;
  } else if (tgpPoints >= 500 && pgpPoints >= 500) {
    newRank = 'Challenger';
    rewardAmount = 1000;
  }
  // If either TGP or PGP is below minimum threshold, newRank remains null (no rank)
  
  // Update rank if it has changed
  if (this.crrRank.current !== newRank) {
    const oldRank = this.crrRank.current;
    
    // Only add to history if user achieved a rank (not null)
    if (newRank !== null) {
      this.crrRank.history.push({
        rank: newRank,
        achievedAt: new Date(),
        qualificationPoints: totalPoints,
        rewardAmount: rewardAmount
      });
    }
    
    this.crrRank.current = newRank;
    this.crrRank.lastUpdated = newRank ? new Date() : null;
    this.crrRank.rewardAmount = rewardAmount;
    
    // Handle Regional Ambassador selection based on CRR Boss rank
    if (newRank === 'Boss' && oldRank !== 'Boss') {
      await this.handleBossRankAchievement();
    }
    
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Handle Boss CRR rank achievement for Regional Ambassador selection
userSchema.methods.handleBossRankAchievement = async function() {
  const User = this.constructor;
  
  // Check if this is the first person to achieve Boss rank
  const existingBossUsers = await User.countDocuments({
    'crrRank.current': 'Boss',
    '_id': { $ne: this._id }
  });
  
  const currentTime = new Date();
  
  // If this is the first Boss achiever, make them permanent Regional Ambassador
  if (existingBossUsers === 0) {
    this.regionalAmbassador = {
      isAmbassador: true,
      isPermanent: true,
      rank: 'Boss', // Highest rank for permanent ambassador
      progress: 100,
      totalEarnings: this.regionalAmbassador?.totalEarnings || 0,
      countryRank: 1,
      globalRank: 1,
      isActive: true,
      achievedAt: currentTime,
      crrRankBased: true,
      diamondAchievedAt: currentTime
    };
  } else {
    // For subsequent Boss achievers, make them regular Regional Ambassadors
    this.regionalAmbassador = {
      ...this.regionalAmbassador,
      isAmbassador: true,
      isPermanent: false,
      crrRankBased: true,
      diamondAchievedAt: currentTime,
      achievedAt: this.regionalAmbassador?.achievedAt || currentTime
    };
  }
};

userSchema.methods.getCRRRankProgress = function() {
  const stats = this.getQualificationPointsStats();
  const tgpPoints = stats.tgp.accumulated;
  const pgpPoints = stats.pgp.accumulated;
  const totalPoints = stats.total.accumulated;
  
  const thresholds = {
    Challenger: { tgpMin: 500, pgpMin: 500, next: 'Warrior', reward: 1000 },
    Warrior: { tgpMin: 2500, pgpMin: 2500, next: 'Tycoon', reward: 5000 },
    Tycoon: { tgpMin: 10000, pgpMin: 10000, next: 'Champion', reward: 20000 },
    Champion: { tgpMin: 25000, pgpMin: 25000, next: 'Boss', reward: 50000 },
    Boss: { tgpMin: 100000, pgpMin: 100000, next: null, reward: 200000 }
  };
  
  let currentRank = null;
   
   // Determine current rank based on BOTH TGP and PGP points
   if (tgpPoints >= 100000 && pgpPoints >= 100000) {
     currentRank = 'Boss';
   } else if (tgpPoints >= 25000 && pgpPoints >= 25000) {
     currentRank = 'Champion';
   } else if (tgpPoints >= 10000 && pgpPoints >= 10000) {
     currentRank = 'Tycoon';
   } else if (tgpPoints >= 2500 && pgpPoints >= 2500) {
     currentRank = 'Warrior';
   } else if (tgpPoints >= 500 && pgpPoints >= 500) {
     currentRank = 'Challenger';
   }
   // If either TGP or PGP is below minimum threshold, currentRank remains null
   
   // Check if rank is achieved based on user's actual CRR rank
   const actualRank = this.crrRank.current;
   const isAchieved = actualRank === currentRank;
  
  // Handle case where user has no rank yet
  if (currentRank === null) {
    const tgpNeeded = Math.max(0, 500 - tgpPoints);
    const pgpNeeded = Math.max(0, 500 - pgpPoints);
    const tgpProgress = Math.min(100, (tgpPoints / 500) * 100);
    const pgpProgress = Math.min(100, (pgpPoints / 500) * 100);
    
    let status = 'No Rank';
    if (tgpNeeded > 0 && pgpNeeded > 0) {
      status = `Need ${tgpNeeded} TGP and ${pgpNeeded} PGP for Challenger`;
    } else if (tgpNeeded > 0) {
      status = `Need ${tgpNeeded} more TGP for Challenger`;
    } else if (pgpNeeded > 0) {
      status = `Need ${pgpNeeded} more PGP for Challenger`;
    }
    
    return {
      currentRank: null,
      nextRank: 'Challenger',
      currentPoints: { total: totalPoints, tgp: tgpPoints, pgp: pgpPoints },
      pointsToNext: { tgp: tgpNeeded, pgp: pgpNeeded },
      progressPercentage: Math.min(tgpProgress, pgpProgress),
      tgpProgress,
      pgpProgress,
      rewardAmount: 0,
      isAchieved: false,
      status,
      rankHistory: this.crrRank.history.sort((a, b) => new Date(b.achievedAt) - new Date(a.achievedAt))
    };
  }
  
  const threshold = thresholds[currentRank];
  
  let progressPercentage = 0;
  let tgpPointsToNext = 0;
  let pgpPointsToNext = 0;
  
  if (threshold.next) {
    const nextThreshold = thresholds[threshold.next];
    tgpPointsToNext = Math.max(0, nextThreshold.tgpMin - tgpPoints);
    pgpPointsToNext = Math.max(0, nextThreshold.pgpMin - pgpPoints);
    
    const tgpProgress = Math.min(100, ((tgpPoints - threshold.tgpMin) / (nextThreshold.tgpMin - threshold.tgpMin)) * 100);
    const pgpProgress = Math.min(100, ((pgpPoints - threshold.pgpMin) / (nextThreshold.pgpMin - threshold.pgpMin)) * 100);
    progressPercentage = Math.min(tgpProgress, pgpProgress);
  } else {
    progressPercentage = 100; // Max rank achieved
  }
  
  return {
    currentRank,
    nextRank: threshold.next,
    currentPoints: { total: totalPoints, tgp: tgpPoints, pgp: pgpPoints },
    pointsToNext: { tgp: tgpPointsToNext, pgp: pgpPointsToNext },
    progressPercentage: Math.min(100, Math.max(0, progressPercentage)),
    tgpProgress: threshold.next ? Math.min(100, ((tgpPoints - threshold.tgpMin) / (thresholds[threshold.next].tgpMin - threshold.tgpMin)) * 100) : 100,
    pgpProgress: threshold.next ? Math.min(100, ((pgpPoints - threshold.pgpMin) / (thresholds[threshold.next].pgpMin - threshold.pgpMin)) * 100) : 100,
    rewardAmount: threshold.reward,
    isAchieved,
    status: isAchieved ? 'Achieved' : 'Locked',
    rankHistory: this.crrRank.history.sort((a, b) => new Date(b.achievedAt) - new Date(a.achievedAt))
  };
};

userSchema.methods.getCRRRankHistory = function() {
  return this.crrRank.history.sort((a, b) => new Date(b.achievedAt) - new Date(a.achievedAt));
};

// Wallet management methods
userSchema.methods.addToWallet = function(amount) {
  this.wallet.balance += amount;
  return this.save();
};

userSchema.methods.deductFromWallet = function(amount) {
  if (this.wallet.balance >= amount) {
    this.wallet.balance -= amount;
    return this.save();
  }
  throw new Error('Insufficient wallet balance');
};

userSchema.methods.getWalletBalance = function() {
  return this.wallet.balance;
};

userSchema.methods.hasWalletBalance = function(amount) {
  return this.wallet.balance >= amount;
};

export default mongoose.model("User", userSchema);