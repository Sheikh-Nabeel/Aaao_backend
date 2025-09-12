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
    dateOfBirth: {
      type: Date,
      required: false,
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
      default: [],
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
    adminPermissions: {
      type: [String],
      default: [],
      enum: [
        'mlm',
        'home',
        'dispatch',
        'drivermanagement',
        'customermanagement',
        'proposalmanagement',
        'overview',
        'paymentoverview',
        'chatdetail',
        'kycverification',
        'reportanalytics',
        'reviewandrating',
        'adminmanagement',
      ],
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
        lastResetDate: { type: Date, default: Date.now },
      },
      tgp: {
        monthly: { type: Number, default: 0 },
        accumulated: { type: Number, default: 0 },
        lastResetDate: { type: Date, default: Date.now },
      },
      transactions: {
        type: [
          {
            points: { type: Number, required: true },
            rideId: { type: String, required: true },
            type: { type: String, enum: ["pgp", "tgp"], required: true },
            rideType: { type: String, default: "personal" },
            rideFare: { type: Number, default: 0 },
            timestamp: { type: Date, default: Date.now },
            month: { type: Number, required: true },
            year: { type: Number, required: true },
          },
        ],
        default: [],
      },
    },
    crrRank: {
      current: {
        type: String,
        enum: ["None", "Challenger", "Warrior", "Tycoon", "CHAMPION", "BOSS"],
        default: "None",
      },
      lastUpdated: { type: Date, default: Date.now },
      rewardClaimed: { type: Boolean, default: false },
      rewardAmount: { type: Number, default: 0 },
      history: {
        type: [
          {
            rank: {
              type: String,
              enum: ["Challenger", "Warrior", "Tycoon", "CHAMPION", "BOSS"],
              required: true,
            },
            achievedAt: { type: Date, default: Date.now },
            pgpPoints: { type: Number, required: true, default: 0 },
            tgpPoints: { type: Number, required: true, default: 0 },
            rewardAmount: { type: Number, default: 0 },
            rewardClaimed: { type: Boolean, default: false },
          },
        ],
        default: [],
      },
    },
    wallet: {
      balance: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: Date.now },
      transactions: {
        type: [
          {
            amount: { type: Number, required: true },
            type: { type: String, enum: ["credit", "debit"], required: true },
            description: { type: String, required: true },
            timestamp: { type: Date, default: Date.now },
          },
        ],
        default: [],
      },
    },
    bbrParticipation: {
      currentCampaign: {
        campaignId: { type: mongoose.Schema.Types.ObjectId },
        totalRides: { type: Number, default: 0 },
        soloRides: { type: Number, default: 0 },
        teamRides: { type: Number, default: 0 },
        achieved: { type: Boolean, default: false },
        joinedAt: { type: Date, default: Date.now },
        lastRideAt: { type: Date },
      },
      totalWins: { type: Number, default: 0 },
      totalRewardsEarned: { type: Number, default: 0 },
      history: {
        type: [
          {
            campaignId: { type: mongoose.Schema.Types.ObjectId },
            campaignName: { type: String },
            totalRides: { type: Number },
            soloRides: { type: Number },
            teamRides: { type: Number },
            achieved: { type: Boolean },
            isWinner: { type: Boolean },
            rewardAmount: { type: Number },
            participatedAt: { type: Date },
            completedAt: { type: Date },
          },
        ],
        default: [],
      },
    },
    // HLR Qualification
    hlrQualification: {
      isQualified: { type: Boolean, default: false },
      qualifiedAt: { type: Date },
      rewardClaimed: { type: Boolean, default: false },
      claimedAt: { type: Date },
      claimReason: {
        type: String,
        enum: ["retirement", "deceased"],
        default: null,
      },
      notes: [
        {
          note: { type: String, required: true },
          addedAt: { type: Date, default: Date.now },
          addedBy: { type: String, required: true },
        },
      ],
    },
    // Driver-specific fields
    currentLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0], // Default coordinates [longitude, latitude]
      },
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    driverStatus: {
      type: String,
      enum: ["offline", "online", "busy", "on_ride"],
      default: "offline",
    },
    lastActiveAt: {
      type: Date,
      required: false,
    },
    driverSettings: {
      autoAccept: {
        enabled: {
          type: Boolean,
          default: false,
        },
        maxDistance: {
          type: Number,
          default: 10, // in kilometers
        },
        minFare: {
          type: Number,
          default: 0,
        },
        serviceTypes: {
          type: [String],
          default: [],
        },
      },
      ridePreferences: {
        acceptBike: {
          type: Boolean,
          default: true,
        },
        acceptCar: {
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
        maxRideDistance: {
          type: Number,
          default: 50, // in kilometers
        },
      },
    },
  },
  { timestamps: true }
);

// Removed duplicate indexes for username, email, phoneNumber (already created by unique: true)
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
userSchema.index({ "bbrParticipation.currentCampaign.totalRides": -1 });
userSchema.index({ "bbrParticipation.currentCampaign.soloRides": -1 });
userSchema.index({ "bbrParticipation.currentCampaign.teamRides": -1 });
userSchema.index({ "bbrParticipation.currentCampaign.achieved": 1 });
userSchema.index({ "bbrParticipation.currentCampaign.joinedAt": -1 });
userSchema.index({ "bbrParticipation.currentCampaign.lastRideAt": -1 });
userSchema.index({ "bbrParticipation.totalWins": -1 });
userSchema.index({ "bbrParticipation.totalRewardsEarned": -1 });
userSchema.index({ "bbrParticipation.history.isWinner": 1 });
userSchema.index({ "bbrParticipation.history.completedAt": -1 });
userSchema.index({ "bbrParticipation.history.participatedAt": -1 });
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
  const { points, rideId, type, rideFare } = data;
  const currentDate = new Date();
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  // Add transaction
  this.qualificationPoints.transactions.push({
    points,
    rideId,
    type,
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
  // Calculate days left until monthly reset
  const calculateDaysUntilReset = (lastResetDate) => {
    const currentDate = new Date();
    const lastReset = new Date(lastResetDate);
    
    // Get the next reset date (1st day of next month after last reset)
    const nextResetDate = new Date(lastReset);
    nextResetDate.setMonth(nextResetDate.getMonth() + 1);
    nextResetDate.setDate(1); // First day of next month
    nextResetDate.setHours(0, 0, 0, 0); // Start of the day
    
    // Calculate days left
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysLeft = Math.ceil((nextResetDate - currentDate) / msPerDay);
    
    return daysLeft > 0 ? daysLeft : 0; // Ensure non-negative
  };
  
  const pgpDaysUntilReset = calculateDaysUntilReset(this.qualificationPoints.pgp.lastResetDate);
  const tgpDaysUntilReset = calculateDaysUntilReset(this.qualificationPoints.tgp.lastResetDate);
  
  return {
    pgp: {
      monthly: this.qualificationPoints.pgp.monthly,
      accumulated: this.qualificationPoints.pgp.accumulated,
      lastResetDate: this.qualificationPoints.pgp.lastResetDate,
      daysUntilReset: pgpDaysUntilReset
    },
    tgp: {
      monthly: this.qualificationPoints.tgp.monthly,
      accumulated: this.qualificationPoints.tgp.accumulated,
      lastResetDate: this.qualificationPoints.tgp.lastResetDate,
      daysUntilReset: tgpDaysUntilReset
    },
    total: {
      monthly:
        this.qualificationPoints.pgp.monthly +
        this.qualificationPoints.tgp.monthly,
      accumulated:
        this.qualificationPoints.pgp.accumulated +
        this.qualificationPoints.tgp.accumulated,
      daysUntilReset: Math.min(pgpDaysUntilReset, tgpDaysUntilReset) // Use the minimum days left
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

// Helper method to calculate TGP distribution from individual legs
userSchema.methods.calculateIndividualLegTgpDistribution = async function() {
  const User = mongoose.model('User');
  
  // Get user's direct referrals (level 1 members - legs A, B, C)
  const directReferrals = await User.find({ _id: { $in: this.directReferrals } })
    .select('qualificationPoints directReferrals level2Referrals level3Referrals level4Referrals nextLevels');
  
  if (directReferrals.length < 3) {
    return {
      hasMinimumLegs: false,
      legDistribution: [],
      userTotalTgp: this.qualificationPoints.tgp.accumulated
    };
  }
  
  // Calculate TGP from each leg (direct referral + their downlines)
  const legDistribution = [];
  
  for (const directReferral of directReferrals) {
    let legTgp = directReferral.qualificationPoints.tgp.accumulated;
    
    // Add TGP from all downlines of this direct referral
    const allDownlineIds = [
      ...directReferral.directReferrals,
      ...directReferral.level2Referrals,
      ...directReferral.level3Referrals,
      ...directReferral.level4Referrals,
      ...(directReferral.nextLevels ? directReferral.nextLevels.flat() : [])
    ];
    
    if (allDownlineIds.length > 0) {
      const downlineMembers = await User.find({ _id: { $in: allDownlineIds } })
        .select('qualificationPoints');
      
      for (const downlineMember of downlineMembers) {
        legTgp += downlineMember.qualificationPoints.tgp.accumulated;
      }
    }
    
    const userTotalTgp = this.qualificationPoints.tgp.accumulated;
    const legPercentage = userTotalTgp > 0 ? (legTgp / userTotalTgp) * 100 : 0;
    
    legDistribution.push({
      legId: directReferral._id,
      tgpPoints: legTgp,
      percentage: legPercentage
    });
  }
  
  // Sort legs by TGP (highest to lowest)
  legDistribution.sort((a, b) => b.tgpPoints - a.tgpPoints);
  
  return {
    hasMinimumLegs: directReferrals.length >= 3,
    legDistribution,
    userTotalTgp: this.qualificationPoints.tgp.accumulated
  };
};

// CRR Rank Management Methods
userSchema.methods.updateCRRRank = async function(crrRanks) {
  // If crrRanks is not provided, get them from MLM model
  if (!crrRanks) {
    const MLM = mongoose.model('MLM');
    const mlm = await MLM.findOne();
    if (mlm && mlm.crrRanks) {
      crrRanks = mlm.crrRanks;
    } else {
      // Default CRR ranks if MLM is not available
      crrRanks = {
        Challenger: { requirements: { pgp: 2500, tgp: 50000, legPercentages: { legA: 25, legB: 20 } }, reward: 1000 },
        Warrior: { requirements: { pgp: 5000, tgp: 100000, legPercentages: { legA: 30, legB: 25 } }, reward: 5000 },
        Tycoon: { requirements: { pgp: 10000, tgp: 200000, legPercentages: { legA: 30, legB: 40 } }, reward: 20000 },
        CHAMPION: { requirements: { pgp: 25000, tgp: 500000, legPercentages: { legA: 35, legB: 30 } }, reward: 50000 },
        BOSS: { requirements: { pgp: 50000, tgp: 1000000, legPercentages: { legA: 40, legB: 35 } }, reward: 200000 }
      };
    }
  }

  const stats = this.getQualificationPointsStats();
  const tgpPoints = stats.tgp.accumulated;
  const pgpPoints = stats.pgp.accumulated;
  
  // Calculate individual leg TGP distribution
  const legData = await this.calculateIndividualLegTgpDistribution();
  
  // Determine new rank based on PGP, TGP, and individual leg percentage requirements (progressive system)
  let newRank = 'None';
  let rewardAmount = 0;
  
  // Helper function to check if user meets all requirements for a rank
  const meetsRankRequirements = (rank) => {
    const requirements = crrRanks[rank].requirements;
    const pgpMet = pgpPoints >= requirements.pgp;
    const tgpMet = tgpPoints >= requirements.tgp;
    
    // Check individual leg percentage requirements
    let legRequirementsMet = false;
    if (legData.hasMinimumLegs && legData.legDistribution.length >= 3) {
      const legA = legData.legDistribution[0]; // Highest TGP leg
      const legB = legData.legDistribution[1]; // Second highest TGP leg
      const legC = legData.legDistribution[2]; // Third highest TGP leg
      
      const legAMet = legA.percentage >= requirements.legPercentages.legA;
      const legBMet = legB.percentage >= requirements.legPercentages.legB;
      const legCMet = legC.percentage >= requirements.legPercentages.legC;
      
      legRequirementsMet = legAMet && legBMet && legCMet;
    }
    
    return pgpMet && tgpMet && legRequirementsMet;
  };
  
  // Check ranks in order - user must achieve each rank sequentially
  if (meetsRankRequirements('BOSS')) {
    newRank = 'BOSS';
    rewardAmount = crrRanks.BOSS.reward;
  } else if (meetsRankRequirements('CHAMPION')) {
    newRank = 'CHAMPION';
    rewardAmount = crrRanks.CHAMPION.reward;
  } else if (meetsRankRequirements('Tycoon')) {
    newRank = 'Tycoon';
    rewardAmount = crrRanks.Tycoon.reward;
  } else if (meetsRankRequirements('Warrior')) {
    newRank = 'Warrior';
    rewardAmount = crrRanks.Warrior.reward;
  } else if (meetsRankRequirements('Challenger')) {
    newRank = 'Challenger';
    rewardAmount = crrRanks.Challenger.reward;
  }
  
  // Update rank if it has changed and user has achieved a rank
  if (this.crrRank.current !== newRank && newRank !== 'None') {
    // Add to history
    this.crrRank.history.push({
      rank: newRank,
      achievedAt: new Date(),
      pgpPoints: pgpPoints,
      tgpPoints: tgpPoints,
      rewardAmount: rewardAmount,
      rewardClaimed: false
    });
    
    this.crrRank.current = newRank;
    this.crrRank.rewardAmount = rewardAmount;
    this.crrRank.rewardClaimed = false;
    this.crrRank.lastUpdated = new Date();
    
    return this.save();
  }

  return Promise.resolve(this);
};

userSchema.methods.getCRRRankProgress = function(crrRanks) {
  const stats = this.getQualificationPointsStats();
  const tgpPoints = stats.tgp.accumulated;
  const pgpPoints = stats.pgp.accumulated;
  const currentRank = this.crrRank.current;
  
  // If crrRanks is not provided, use default values
  if (!crrRanks) {
    crrRanks = {
      Challenger: { requirements: { pgp: 2500, tgp: 50000 }, reward: 1000, icon: "🥇" },
      Warrior: { requirements: { pgp: 5000, tgp: 100000 }, reward: 5000, icon: "🥈" },
      Tycoon: { requirements: { pgp: 10000, tgp: 200000 }, reward: 20000, icon: "🥉" },
      CHAMPION: { requirements: { pgp: 25000, tgp: 500000 }, reward: 50000, icon: "🏅" },
      BOSS: { requirements: { pgp: 50000, tgp: 1000000 }, reward: 200000, icon: "🎖" }
    };
  }
  
  let nextRank = null;
  let pgpProgress = 0;
  let tgpProgress = 0;
  let overallProgress = 0;
  let pgpToNext = 0;
  let tgpToNext = 0;
  
  // Determine next rank and progress based on current rank
  if (currentRank === 'None') {
    // User has no rank yet - working towards Challenger
    nextRank = 'Challenger';
    pgpProgress = Math.min(100, (pgpPoints / crrRanks.Challenger.requirements.pgp) * 100);
    tgpProgress = Math.min(100, (tgpPoints / crrRanks.Challenger.requirements.tgp) * 100);
    pgpToNext = Math.max(0, crrRanks.Challenger.requirements.pgp - pgpPoints);
    tgpToNext = Math.max(0, crrRanks.Challenger.requirements.tgp - tgpPoints);
  } else if (currentRank === 'Challenger') {
    nextRank = 'Warrior';
    pgpProgress = Math.min(100, (pgpPoints / crrRanks.Warrior.requirements.pgp) * 100);
    tgpProgress = Math.min(100, (tgpPoints / crrRanks.Warrior.requirements.tgp) * 100);
    pgpToNext = Math.max(0, crrRanks.Warrior.requirements.pgp - pgpPoints);
    tgpToNext = Math.max(0, crrRanks.Warrior.requirements.tgp - tgpPoints);
  } else if (currentRank === 'Warrior') {
    nextRank = 'Tycoon';
    pgpProgress = Math.min(100, (pgpPoints / crrRanks.Tycoon.requirements.pgp) * 100);
    tgpProgress = Math.min(100, (tgpPoints / crrRanks.Tycoon.requirements.tgp) * 100);
    pgpToNext = Math.max(0, crrRanks.Tycoon.requirements.pgp - pgpPoints);
    tgpToNext = Math.max(0, crrRanks.Tycoon.requirements.tgp - tgpPoints);
  } else if (currentRank === 'Tycoon') {
    nextRank = 'CHAMPION';
    pgpProgress = Math.min(100, (pgpPoints / crrRanks.CHAMPION.requirements.pgp) * 100);
    tgpProgress = Math.min(100, (tgpPoints / crrRanks.CHAMPION.requirements.tgp) * 100);
    pgpToNext = Math.max(0, crrRanks.CHAMPION.requirements.pgp - pgpPoints);
    tgpToNext = Math.max(0, crrRanks.CHAMPION.requirements.tgp - tgpPoints);
  } else if (currentRank === 'CHAMPION') {
    nextRank = 'BOSS';
    pgpProgress = Math.min(100, (pgpPoints / crrRanks.BOSS.requirements.pgp) * 100);
    tgpProgress = Math.min(100, (tgpPoints / crrRanks.BOSS.requirements.tgp) * 100);
    pgpToNext = Math.max(0, crrRanks.BOSS.requirements.pgp - pgpPoints);
    tgpToNext = Math.max(0, crrRanks.BOSS.requirements.tgp - tgpPoints);
  } else if (currentRank === 'BOSS') {
    nextRank = null;
    pgpProgress = 100;
    tgpProgress = 100;
    pgpToNext = 0;
    tgpToNext = 0;
  }
  
  overallProgress = (pgpProgress + tgpProgress) / 2;
  
  return {
    currentRank,
    nextRank,
    currentPoints: { pgp: pgpPoints, tgp: tgpPoints },
    pointsToNext: { pgp: pgpToNext, tgp: tgpToNext },
    progress: {
      pgp: Math.round(pgpProgress),
      tgp: Math.round(tgpProgress),
      overall: Math.round(overallProgress)
    },
    requirements: {
      current: currentRank !== 'None' ? crrRanks[currentRank]?.requirements : { pgp: 0, tgp: 0 },
      next: nextRank ? crrRanks[nextRank]?.requirements : null
    },
    reward: {
      current: currentRank !== 'None' ? crrRanks[currentRank]?.reward : 0,
      next: nextRank ? crrRanks[nextRank]?.reward : 0
    },
    icon: currentRank !== 'None' ? crrRanks[currentRank]?.icon : "🔒",
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
