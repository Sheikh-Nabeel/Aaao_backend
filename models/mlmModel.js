import mongoose from "mongoose";

const mlmSchema = new mongoose.Schema({
  // Main MLM Configuration
  name: {
    type: String,
    required: true,
    default: "Default MLM System"
  },

  
  // Main Distribution Percentages (Total 100%)
  ddr: { type: Number, default: 24, min: 0, max: 100 },
  crr: { type: Number, default: 13.3, min: 0, max: 100 },
  bbr: { type: Number, default: 6, min: 0, max: 100 },
  hlr: { type: Number, default: 6.7, min: 0, max: 100 },
  regionalAmbassador: { type: Number, default: 0.4, min: 0, max: 100 },
  porparleTeam: { type: Number, default: 10, min: 0, max: 100 },
  rop: { type: Number, default: 3, min: 0, max: 100 },
  companyOperations: { type: Number, default: 3, min: 0, max: 100 },
  technologyPool: { type: Number, default: 2.6, min: 0, max: 100 },
  foundationPool: { type: Number, default: 1, min: 0, max: 100 },
  publicShare: { type: Number, default: 15, min: 0, max: 100 },
  netProfit: { type: Number, default: 15, min: 0, max: 100 },
  
  // DDR Sub-distribution (Total 24%)
  ddrLevel1: { type: Number, default: 14, min: 0, max: 100 },
  ddrLevel2: { type: Number, default: 6, min: 0, max: 100 },
  ddrLevel3: { type: Number, default: 3.6, min: 0, max: 100 },
  ddrLevel4: { type: Number, default: 0.4, min: 0, max: 100 },
  
  // Porparle Team Sub-distribution (Total 10%)
  gc: { type: Number, default: 1.7, min: 0, max: 100 },
  la: { type: Number, default: 1.3, min: 0, max: 100 },
  ceo: { type: Number, default: 1.8, min: 0, max: 100 },
  coo: { type: Number, default: 1.4, min: 0, max: 100 },
  cmo: { type: Number, default: 0.9, min: 0, max: 100 },
  cfo: { type: Number, default: 0.9, min: 0, max: 100 },
  cto: { type: Number, default: 0.7, min: 0, max: 100 },
  chro: { type: Number, default: 1.1, min: 0, max: 100 },
  topTeamPerform: { type: Number, default: 0.2, min: 0, max: 100 },
  
  // Top Team Performance Sub-distribution
  winner: { type: Number, default: 0.13, min: 0, max: 10 },
  fighter: { type: Number, default: 0.07, min: 0, max: 10 },
  
  // Company Operations Sub-distribution (Total 3%)
  operationExpense: { type: Number, default: 1, min: 0, max: 10 },
  organizationEvent: { type: Number, default: 2, min: 0, max: 10 },
  
  // Public Share Sub-distribution (Total 15%)
  chairmanFounder: { type: Number, default: 3, min: 0, max: 15 },
  shareholder1: { type: Number, default: 3, min: 0, max: 15 },
  shareholder2: { type: Number, default: 3, min: 0, max: 15 },
  shareholder3: { type: Number, default: 6, min: 0, max: 15 },
  
  // Transaction History
  transactions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    rideId: {
      type: String,
      required: true
    },
    distribution: {
      // Main distribution
      ddr: { type: Number, default: 0 },
      crr: { type: Number, default: 0 },
      bbr: { type: Number, default: 0 },
      hlr: { type: Number, default: 0 },
      regionalAmbassador: { type: Number, default: 0 },
      porparleTeam: { type: Number, default: 0 },
      rop: { type: Number, default: 0 },
      companyOperations: { type: Number, default: 0 },
      technologyPool: { type: Number, default: 0 },
      foundationPool: { type: Number, default: 0 },
      publicShare: { type: Number, default: 0 },
      netProfit: { type: Number, default: 0 },
      
      // DDR sub-distributions
      ddrLevel1: { type: Number, default: 0 },
      ddrLevel2: { type: Number, default: 0 },
      ddrLevel3: { type: Number, default: 0 },
      ddrLevel4: { type: Number, default: 0 },
      
      // Porparle Team sub-distributions
      gc: { type: Number, default: 0 },
      la: { type: Number, default: 0 },
      ceo: { type: Number, default: 0 },
      coo: { type: Number, default: 0 },
      cmo: { type: Number, default: 0 },
      cfo: { type: Number, default: 0 },
      cto: { type: Number, default: 0 },
      chro: { type: Number, default: 0 },
      topTeamPerform: { type: Number, default: 0 },
      
      // Top Team Performance sub-distributions
      winner: { type: Number, default: 0 },
      fighter: { type: Number, default: 0 },
      
      // Company Operations sub-distributions
      operationExpense: { type: Number, default: 0 },
      organizationEvent: { type: Number, default: 0 },
      
      // Public Share sub-distributions
      chairmanFounder: { type: Number, default: 0 },
      shareholder1: { type: Number, default: 0 },
      shareholder2: { type: Number, default: 0 },
      shareholder3: { type: Number, default: 0 }
    },
    // Qualification Points
    qualificationPoints: {
      tgp: { type: Number, default: 0 }, // Team Growth Points
      pgp: { type: Number, default: 0 }  // Personal Growth Points
    },
    
    // Ride Type
    rideType: {
      type: String,
      enum: ['personal', 'team', 'user_standard', 'driver_standard'],
      required: true
    },
    
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Total Accumulated Amounts
  totalAmount: {
    type: Number,
    default: 0
  },
  
  // Current Pool Balances
  currentBalances: {
    // Main Distribution Balances
    ddr: { type: Number, default: 0 },
    crr: { type: Number, default: 0 },
    bbr: { type: Number, default: 0 },
    hlr: { type: Number, default: 0 },
    regionalAmbassador: { type: Number, default: 0 },
    porparleTeam: { type: Number, default: 0 },
    rop: { type: Number, default: 0 },
    companyOperations: { type: Number, default: 0 },
    technologyPool: { type: Number, default: 0 },
    foundationPool: { type: Number, default: 0 },
    publicShare: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },
    
    // DDR Level Balances
    ddrLevel1: { type: Number, default: 0 },
    ddrLevel2: { type: Number, default: 0 },
    ddrLevel3: { type: Number, default: 0 },
    ddrLevel4: { type: Number, default: 0 },
    
    // Porparle Team Balances
    gc: { type: Number, default: 0 },
    la: { type: Number, default: 0 },
    ceo: { type: Number, default: 0 },
    coo: { type: Number, default: 0 },
    cmo: { type: Number, default: 0 },
    cfo: { type: Number, default: 0 },
    cto: { type: Number, default: 0 },
    chro: { type: Number, default: 0 },
    topTeamPerform: { type: Number, default: 0 },
    
    // Top Team Performance Balances
    winner: { type: Number, default: 0 },
    fighter: { type: Number, default: 0 },
    
    // Company Operations Balances
    operationExpense: { type: Number, default: 0 },
    organizationEvent: { type: Number, default: 0 },
    
    // Public Share Balances
    chairmanFounder: { type: Number, default: 0 },
    shareholder1: { type: Number, default: 0 },
    shareholder2: { type: Number, default: 0 },
    shareholder3: { type: Number, default: 0 }
  },
  
  // System Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Motivational Quotes for DDR/CRR Dashboards
  motivationalQuotes: {
    ddr: {
      type: [String],
      default: [
        "Build your network, build your wealth - every connection counts!",
        "Your downline success is your success - support and grow together!",
        "Consistency in building relationships leads to consistent DDR income!"
      ]
    },
    crr: {
      type: [String],
      default: [
        "Champions are made through consistent qualification point growth!",
        "Your rank reflects your commitment - keep climbing!",
        "Every TGP and PGP point brings you closer to championship status!"
      ]
    }
  },
  
  // CRR Rank System Configuration
  crrRanks: {
    Challenger: {
      name: { type: String, default: "Challenger" },
      icon: { type: String, default: "🥇" },
      reward: { type: Number, default: 1000 },
      status: { type: String, default: "Achieved" },
      requirements: {
        pgp: { type: Number, default: 2500 },
        tgp: { type: Number, default: 50000 },
        legPercentages: {
          legA: { type: Number, default: 25 }, // User must earn at least 25% from leg A
          legB: { type: Number, default: 20 }, // User must earn at least 20% from leg B
          legC: { type: Number, default: 15 }  // User must earn at least 15% from leg C
        }
      }
    },
    Warrior: {
      name: { type: String, default: "Warrior" },
      icon: { type: String, default: "🥈" },
      reward: { type: Number, default: 5000 },
      status: { type: String, default: "Achieved" },
      requirements: {
        pgp: { type: Number, default: 5000 },
        tgp: { type: Number, default: 100000 },
        legPercentages: {
          legA: { type: Number, default: 30 }, // User must earn at least 30% from leg A
          legB: { type: Number, default: 25 }, // User must earn at least 25% from leg B
          legC: { type: Number, default: 20 }  // User must earn at least 20% from leg C
        }
      }
    },
    Tycoon: {
      name: { type: String, default: "Tycoon" },
      icon: { type: String, default: "🥉" },
      reward: { type: Number, default: 20000 },
      status: { type: String, default: "Locked" },
      requirements: {
        pgp: { type: Number, default: 10000 },
        tgp: { type: Number, default: 200000 },
        legPercentages: {
          legA: { type: Number, default: 30 }, // User must earn at least 30% from leg A
          legB: { type: Number, default: 40 }, // User must earn at least 40% from leg B
          legC: { type: Number, default: 30 }  // User must earn at least 30% from leg C
        }
      }
    },
    CHAMPION: {
      name: { type: String, default: "CHAMPION" },
      icon: { type: String, default: "🏅" },
      reward: { type: Number, default: 50000 },
      status: { type: String, default: "Locked" },
      requirements: {
        pgp: { type: Number, default: 25000 },
        tgp: { type: Number, default: 500000 },
        legPercentages: {
          legA: { type: Number, default: 35 }, // User must earn at least 35% from leg A
          legB: { type: Number, default: 30 }, // User must earn at least 30% from leg B
          legC: { type: Number, default: 25 }  // User must earn at least 25% from leg C
        }
      }
    },
    BOSS: {
      name: { type: String, default: "BOSS" },
      icon: { type: String, default: "🎖" },
      reward: { type: Number, default: 200000 },
      status: { type: String, default: "Locked" },
      requirements: {
        pgp: { type: Number, default: 50000 },
        tgp: { type: Number, default: 1000000 },
        legPercentages: {
          legA: { type: Number, default: 40 }, // User must earn at least 40% from leg A
          legB: { type: Number, default: 35 }, // User must earn at least 35% from leg B
          legC: { type: Number, default: 25 }  // User must earn at least 25% from leg C
        }
      }
    }
  },

  // CRR System Configuration
  crrConfig: {
    monthlyReset: { type: Boolean, default: true },
    resetDay: { type: Number, default: 1 }, // 1st of each month
    pointValue: { type: Number, default: 1 }, // 1 PGP/TGP = 1 AED
    leaderboardUpdateInterval: { type: Number, default: 300000 }, // 5 minutes
    // Global leg percentages for all CRR ranks (set by admin)
    legPercentages: {
      legA: { type: Number, default: 33.33 },
      legB: { type: Number, default: 33.33 },
      legC: { type: Number, default: 33.34 }
    }
  },

  // BBR (Bonus Booster Rewards) Campaign Management
  bbrCampaigns: {
    current: {
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
      name: { type: String, default: "Weekly Turbo Booster" },
      requirement: { type: Number, default: 100 }, // rides count
      duration: { type: Number, default: 7 }, // days
      startDate: { type: Date, default: Date.now },
      endDate: { type: Date },
      type: { 
        type: String, 
        enum: ['solo', 'team', 'solo_or_team'], 
        default: 'solo_or_team' 
      },
      newbieRidesOnly: { type: Boolean, default: true },
      reward: {
        amount: { type: Number, default: 550 }, // AED
        perks: { 
          type: [String], 
          default: ['Priority Rides (1 Week)'] 
        }
      },
      isActive: { type: Boolean, default: true },
      participants: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        soloRides: { type: Number, default: 0 },
        teamRides: { type: Number, default: 0 },
        totalRides: { type: Number, default: 0 },
        achieved: { type: Boolean, default: false },
        rewardClaimed: { type: Boolean, default: false },
        joinedAt: { type: Date, default: Date.now }
      }],
      totalParticipants: { type: Number, default: 0 },
      totalWinners: { type: Number, default: 0 },
      totalRewardDistributed: { type: Number, default: 0 }
    },
    past: [{
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
      name: { type: String, required: true },
      requirement: { type: Number, required: true },
      duration: { type: Number, required: true },
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      type: { 
        type: String, 
        enum: ['solo', 'team', 'solo_or_team'], 
        required: true 
      },
      newbieRidesOnly: { type: Boolean, default: true },
      reward: {
        amount: { type: Number, required: true },
        perks: { type: [String], default: [] }
      },
      winners: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        soloRides: { type: Number, default: 0 },
        teamRides: { type: Number, default: 0 },
        totalRides: { type: Number, default: 0 },
        rewardAmount: { type: Number, default: 0 },
        achievedAt: { type: Date, default: Date.now }
      }],
      totalParticipants: { type: Number, default: 0 },
      totalWinners: { type: Number, default: 0 },
      totalRewardDistributed: { type: Number, default: 0 }
    }]
  },

  // BBR Tips and Motivational Content
  bbrTips: {
    type: [String],
    default: [
      "Focus on peak hours to get more rides",
      "Encourage newbie team to stay active",
      "Consistency is key to winning campaigns",
      "Team collaboration increases your chances"
    ]
  },

  // HLR (HonorPay Loyalty Rewards) Configuration
  hlrConfig: {
    retirementAge: { type: Number, default: 55 },
    requirements: {
      pgp: { type: Number, default: 200000 },
      tgp: { type: Number, default: 6000000 }
    },
    rewardAmount: { type: Number, default: 60000 }, // AED
    qualifiedMembers: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      qualifiedAt: { type: Date, default: Date.now },
      pgpAtQualification: { type: Number, required: true },
      tgpAtQualification: { type: Number, required: true },
      country: { type: String, required: true },
      rewardClaimed: { type: Boolean, default: false },
      claimedAt: { type: Date },
      claimReason: { 
        type: String, 
        enum: ['retirement', 'deceased'], 
        default: 'retirement' 
      }
    }],
    tips: {
      type: [String],
      default: [
        "Boost your TGP by mentoring active leaders in your team",
        "Consistent PGP growth ensures qualification",
        "Help your team members achieve their goals"
      ]
    }
  },

  // Regional Ambassador Configuration
  regionalAmbassadorConfig: {
    ranks: {
      type: Map,
      of: {
        level: { type: Number, required: true },
        minProgress: { type: Number, required: true }
      },
      default: {
        Challenger: { level: 1, minProgress: 0 },
        Warrior: { level: 2, minProgress: 25 },
        Tycoon: { level: 3, minProgress: 50 },
        Champion: { level: 4, minProgress: 75 },
        Boss: { level: 5, minProgress: 90 }
      }
    },
    ambassadors: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      country: { type: String, required: true },
      rank: { 
        type: String, 
        enum: ['Challenger', 'Warrior', 'Tycoon', 'Champion', 'Boss'],
        default: 'Challenger' 
      },
      progress: { type: Number, default: 0 }, // percentage
      totalEarnings: { type: Number, default: 0 },
      achievedAt: { type: Date, default: Date.now },
      isActive: { type: Boolean, default: true }
    }],
    countryUpdateRequests: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      currentCountry: { type: String, required: true },
      requestedCountry: { type: String, required: true },
      reason: { type: String },
      status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected'], 
        default: 'pending' 
      },
      requestedAt: { type: Date, default: Date.now },
      processedAt: { type: Date },
      processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }]
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Validation middleware
mlmSchema.pre('save', function(next) {
  // Validate main distribution adds up to 100%
  const mainTotal = this.ddr + this.crr + this.bbr + this.hlr + this.regionalAmbassador + 
                    this.porparleTeam + this.rop + this.companyOperations + this.technologyPool + 
                    this.foundationPool + this.publicShare + this.netProfit;
  
  if (Math.abs(mainTotal - 100) > 0.01) {
    return next(new Error('Main distribution percentages must equal 100%'));
  }
  
  // Validate DDR sub-distribution adds up to DDR total
  const ddrTotal = this.ddrLevel1 + this.ddrLevel2 + this.ddrLevel3 + this.ddrLevel4;
  if (Math.abs(ddrTotal - this.ddr) > 0.01) {
    return next(new Error('DDR sub-distribution must equal DDR total'));
  }
  
  // Validate Porparle Team sub-distribution adds up to porparleTeam total
  const ptTotal = this.gc + this.la + this.ceo + this.coo + this.cmo + this.cfo + 
                  this.cto + this.chro + this.topTeamPerform;
  if (Math.abs(ptTotal - this.porparleTeam) > 0.01) {
    return next(new Error('Porparle Team sub-distribution must equal porparleTeam total'));
  }
  
  // Validate Top Team Performance sub-distribution
  if (Math.abs(this.winner + this.fighter - this.topTeamPerform) > 0.01) {
    return next(new Error('Top Team Performance sub-distribution must equal topTeamPerform total'));
  }
  
  // Validate Company Operations sub-distribution
  if (Math.abs(this.operationExpense + this.organizationEvent - this.companyOperations) > 0.01) {
    return next(new Error('Company Operations sub-distribution must equal companyOperations total'));
  }
  
  // Validate Public Share sub-distribution
  if (Math.abs(this.chairmanFounder + this.shareholder1 + this.shareholder2 + this.shareholder3 - this.publicShare) > 0.01) {
    return next(new Error('Public Share sub-distribution must equal publicShare total'));
  }
  
  this.updatedAt = Date.now();
  next();
});

// Method to add money to MLM system
mlmSchema.methods.addMoney = function(userId, amount, rideId, rideType = 'personal') {
  console.log('addMoney method called with userId:', userId);
  console.log('this object:', this);
  console.log('this.transactions:', this.transactions);
  
  // Ensure transactions is initialized as an array
  console.log('Checking transactions initialization...');
  console.log('this.transactions before check:', this.transactions);
  console.log('typeof this.transactions:', typeof this.transactions);
  console.log('Array.isArray(this.transactions):', Array.isArray(this.transactions));
  
  if (!this.transactions) {
    console.log('Initializing transactions as empty array');
    this.transactions = [];
    this.markModified('transactions');
  } else if (!Array.isArray(this.transactions)) {
    console.log('transactions exists but is not an array, resetting to empty array');
    this.transactions = [];
    this.markModified('transactions');
  }
  
  // Ensure currentBalances is initialized as an object
  if (!this.currentBalances) {
    this.currentBalances = {};
    this.markModified('currentBalances');
  } else if (typeof this.currentBalances !== 'object') {
    console.log('currentBalances exists but is not an object, resetting to empty object');
    this.currentBalances = {};
    this.markModified('currentBalances');
  }
  
  console.log('this.transactions after initialization:', Array.isArray(this.transactions));
  console.log('this.transactions length:', this.transactions ? this.transactions.length : 0);
  
  // Ensure userId is valid
  if (!userId) {
    throw new Error('userId is required for MLM transaction');
  }
  // Calculate main distribution amounts
  const distribution = {
    ddr: (amount * this.ddr) / 100,
    crr: (amount * this.crr) / 100,
    bbr: (amount * this.bbr) / 100,
    hlr: (amount * this.hlr) / 100,
    regionalAmbassador: (amount * this.regionalAmbassador) / 100,
    porparleTeam: (amount * this.porparleTeam) / 100,
    rop: (amount * this.rop) / 100,
    companyOperations: (amount * this.companyOperations) / 100,
    technologyPool: (amount * this.technologyPool) / 100,
    foundationPool: (amount * this.foundationPool) / 100,
    publicShare: (amount * this.publicShare) / 100,
    netProfit: (amount * this.netProfit) / 100
  };
  
  // Calculate DDR level amounts
  const ddrAmount = distribution.ddr;
  const ddrDistribution = {
    ddrLevel1: this.ddr ? (ddrAmount * this.ddrLevel1) / this.ddr : 0,
    ddrLevel2: this.ddr ? (ddrAmount * this.ddrLevel2) / this.ddr : 0,
    ddrLevel3: this.ddr ? (ddrAmount * this.ddrLevel3) / this.ddr : 0,
    ddrLevel4: this.ddr ? (ddrAmount * this.ddrLevel4) / this.ddr : 0
  };
  
  // Calculate Porparle Team amounts
  const ptAmount = distribution.porparleTeam;
  const ptDistribution = {
    gc: this.porparleTeam ? (ptAmount * this.gc) / this.porparleTeam : 0,
    la: this.porparleTeam ? (ptAmount * this.la) / this.porparleTeam : 0,
    ceo: this.porparleTeam ? (ptAmount * this.ceo) / this.porparleTeam : 0,
    coo: this.porparleTeam ? (ptAmount * this.coo) / this.porparleTeam : 0,
    cmo: this.porparleTeam ? (ptAmount * this.cmo) / this.porparleTeam : 0,
    cfo: this.porparleTeam ? (ptAmount * this.cfo) / this.porparleTeam : 0,
    cto: this.porparleTeam ? (ptAmount * this.cto) / this.porparleTeam : 0,
    chro: this.porparleTeam ? (ptAmount * this.chro) / this.porparleTeam : 0,
    topTeamPerform: this.porparleTeam ? (ptAmount * this.topTeamPerform) / this.porparleTeam : 0
  };
  
  // Calculate Top Team Performance amounts
  const ttAmount = ptDistribution.topTeamPerform;
  const ttDistribution = {
    winner: this.topTeamPerform ? (ttAmount * this.winner) / this.topTeamPerform : 0,
    fighter: this.topTeamPerform ? (ttAmount * this.fighter) / this.topTeamPerform : 0
  };
  
  // Calculate Company Operations amounts
  const coAmount = distribution.companyOperations;
  const coDistribution = {
    operationExpense: this.companyOperations ? (coAmount * this.operationExpense) / this.companyOperations : 0,
    organizationEvent: this.companyOperations ? (coAmount * this.organizationEvent) / this.companyOperations : 0
  };
  
  // Calculate Public Share amounts
  const psAmount = distribution.publicShare;
  const psDistribution = {
    chairmanFounder: this.publicShare ? (psAmount * this.chairmanFounder) / this.publicShare : 0,
    shareholder1: this.publicShare ? (psAmount * this.shareholder1) / this.publicShare : 0,
    shareholder2: this.publicShare ? (psAmount * this.shareholder2) / this.publicShare : 0,
    shareholder3: this.publicShare ? (psAmount * this.shareholder3) / this.publicShare : 0
  };
  
  // Create a new transaction record
  const transaction = {
    userId,
    amount,
    rideId,
    rideType,
    distribution: {
      // Main distribution
      ddr: distribution.ddr,
      crr: distribution.crr,
      bbr: distribution.bbr,
      hlr: distribution.hlr,
      regionalAmbassador: distribution.regionalAmbassador,
      porparleTeam: distribution.porparleTeam,
      rop: distribution.rop,
      companyOperations: distribution.companyOperations,
      technologyPool: distribution.technologyPool,
      foundationPool: distribution.foundationPool,
      publicShare: distribution.publicShare,
      netProfit: distribution.netProfit,
      
      // DDR sub-distributions
      ddrLevel1: ddrDistribution.ddrLevel1,
      ddrLevel2: ddrDistribution.ddrLevel2,
      ddrLevel3: ddrDistribution.ddrLevel3,
      ddrLevel4: ddrDistribution.ddrLevel4,
      
      // Porparle Team sub-distributions
      gc: ptDistribution.gc,
      la: ptDistribution.la,
      ceo: ptDistribution.ceo,
      coo: ptDistribution.coo,
      cmo: ptDistribution.cmo,
      cfo: ptDistribution.cfo,
      cto: ptDistribution.cto,
      chro: ptDistribution.chro,
      topTeamPerform: ptDistribution.topTeamPerform,
      
      // Top Team Performance sub-distributions
      winner: ttDistribution.winner,
      fighter: ttDistribution.fighter,
      
      // Company Operations sub-distributions
      operationExpense: coDistribution.operationExpense,
      organizationEvent: coDistribution.organizationEvent,
      
      // Public Share sub-distributions
      chairmanFounder: psDistribution.chairmanFounder,
      shareholder1: psDistribution.shareholder1,
      shareholder2: psDistribution.shareholder2,
      shareholder3: psDistribution.shareholder3
    },
    qualificationPoints: {
      tgp: 0, // Will be calculated separately
      pgp: 0  // Will be calculated separately
    },
    timestamp: new Date()
  };
  
  // Add the transaction to the transactions array
  // Double-check that transactions is an array before pushing
  if (!Array.isArray(this.transactions)) {
    console.log('Warning: transactions is still not an array before push, reinitializing');
    this.transactions = [];
  }
  
  this.transactions.push(transaction);
  this.markModified('transactions');
  console.log('Transaction successfully added to transactions array');
  
  // Update total amount
  if (!this.totalAmount) {
    this.totalAmount = 0;
  }
  this.totalAmount += amount;
  
  // Update main distribution balances
  Object.keys(distribution).forEach(key => {
    if (!this.currentBalances) {
      this.currentBalances = {};
    }
    if (!this.currentBalances[key]) {
      this.currentBalances[key] = 0;
    }
    this.currentBalances[key] += distribution[key];
  });
  
  // Update DDR level balances
  Object.keys(ddrDistribution).forEach(key => {
    if (!this.currentBalances) {
      this.currentBalances = {};
    }
    if (!this.currentBalances[key]) {
      this.currentBalances[key] = 0;
    }
    this.currentBalances[key] += ddrDistribution[key];
  });
  
  // Update Porparle Team balances
  Object.keys(ptDistribution).forEach(key => {
    if (!this.currentBalances) {
      this.currentBalances = {};
    }
    if (!this.currentBalances[key]) {
      this.currentBalances[key] = 0;
    }
    this.currentBalances[key] += ptDistribution[key];
  });
  
  // Update Top Team Performance balances
  Object.keys(ttDistribution).forEach(key => {
    if (!this.currentBalances) {
      this.currentBalances = {};
    }
    if (!this.currentBalances[key]) {
      this.currentBalances[key] = 0;
    }
    this.currentBalances[key] += ttDistribution[key];
  });
  
  // Update Company Operations balances
  Object.keys(coDistribution).forEach(key => {
    if (!this.currentBalances) {
      this.currentBalances = {};
    }
    if (!this.currentBalances[key]) {
      this.currentBalances[key] = 0;
    }
    this.currentBalances[key] += coDistribution[key];
  });
  
  // Update Public Share balances
  Object.keys(psDistribution).forEach(key => {
    if (!this.currentBalances) {
      this.currentBalances = {};
    }
    if (!this.currentBalances[key]) {
      this.currentBalances[key] = 0;
    }
    this.currentBalances[key] += psDistribution[key];
  });
  
  return {
    mainDistribution: distribution,
    ddrDistribution,
    porparleTeamDistribution: ptDistribution,
    topTeamDistribution: ttDistribution,
    companyOperationsDistribution: coDistribution,
    publicShareDistribution: psDistribution
  };
};

// Method to auto-adjust sub-distributions when main percentages change
mlmSchema.methods.autoAdjustSubDistributions = function() {
  // Auto-adjust DDR levels to match DDR total
  if (this.ddr > 0) {
    const ddrTotal = this.ddrLevel1 + this.ddrLevel2 + this.ddrLevel3 + this.ddrLevel4;
    if (Math.abs(ddrTotal - this.ddr) > 0.01) {
      // Redistribute DDR levels proportionally
      const ratio = this.ddr / ddrTotal;
      this.ddrLevel1 = Math.round((this.ddrLevel1 * ratio) * 100) / 100;
      this.ddrLevel2 = Math.round((this.ddrLevel2 * ratio) * 100) / 100;
      this.ddrLevel3 = Math.round((this.ddrLevel3 * ratio) * 100) / 100;
      this.ddrLevel4 = Math.round((this.ddrLevel4 * ratio) * 100) / 100;
    }
  }
  
  // Auto-adjust Porparle Team sub-distributions to match porparleTeam total
  if (this.porparleTeam > 0) {
    const ptTotal = this.gc + this.la + this.ceo + this.coo + this.cmo + this.cfo + this.cto + this.chro + this.topTeamPerform;
    if (Math.abs(ptTotal - this.porparleTeam) > 0.01) {
      // Redistribute proportionally to match porparleTeam total
      const ratio = this.porparleTeam / ptTotal;
      this.gc = Math.round((this.gc * ratio) * 100) / 100;
      this.la = Math.round((this.la * ratio) * 100) / 100;
      this.ceo = Math.round((this.ceo * ratio) * 100) / 100;
      this.coo = Math.round((this.coo * ratio) * 100) / 100;
      this.cmo = Math.round((this.cmo * ratio) * 100) / 100;
      this.cfo = Math.round((this.cfo * ratio) * 100) / 100;
      this.cto = Math.round((this.cto * ratio) * 100) / 100;
      this.chro = Math.round((this.chro * ratio) * 100) / 100;
      this.topTeamPerform = Math.round((this.topTeamPerform * ratio) * 100) / 100;
    }
  }
  
  // Auto-adjust Top Team Performance to match topTeamPerform total
  if (this.topTeamPerform > 0) {
    const ttTotal = this.winner + this.fighter;
    if (Math.abs(ttTotal - this.topTeamPerform) > 0.01) {
      const ratio = this.topTeamPerform / ttTotal;
      this.winner = Math.round((this.winner * ratio) * 100) / 100;
      this.fighter = Math.round((this.fighter * ratio) * 100) / 100;
    }
  }
  
  // Auto-adjust Company Operations to match companyOperations total
  if (this.companyOperations > 0) {
    const coTotal = this.operationExpense + this.organizationEvent;
    if (Math.abs(coTotal - this.companyOperations) > 0.01) {
      const ratio = this.companyOperations / coTotal;
      this.operationExpense = Math.round((this.operationExpense * ratio) * 100) / 100;
      this.organizationEvent = Math.round((this.organizationEvent * ratio) * 100) / 100;
    }
  }
  
  // Auto-adjust Public Share to match publicShare total
  if (this.publicShare > 0) {
    const psTotal = this.chairmanFounder + this.shareholder1 + this.shareholder2 + this.shareholder3;
    if (Math.abs(psTotal - this.publicShare) > 0.01) {
      const ratio = this.publicShare / psTotal;
      this.chairmanFounder = Math.round((this.chairmanFounder * ratio) * 100) / 100;
      this.shareholder1 = Math.round((this.shareholder1 * ratio) * 100) / 100;
      this.shareholder2 = Math.round((this.shareholder2 * ratio) * 100) / 100;
      this.shareholder3 = Math.round((this.shareholder3 * ratio) * 100) / 100;
    }
  }
};

export default mongoose.model("MLM", mlmSchema);