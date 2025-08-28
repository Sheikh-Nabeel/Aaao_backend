import MLM from "../models/mlmModel.js";
import User from "../models/userModel.js";
import mongoose from "mongoose";

/**
 * Add money to MLM system after ride completion with enhanced progress tracking
 * @param {string} userId - User ID who completed the ride
 * @param {number} amount - Amount to add (already calculated as 15% of ride fare)
 * @param {string} rideId - Unique ride identifier
 * @param {number} rideFare - Original ride fare for progress calculations
 * @param {string} rideType - Type of ride ('personal' or 'team')
 * @returns {Object} Distribution breakdown
 */
export const addMoneyToMLM = async (userId, amount, rideId, rideFare = null, rideType = 'personal') => {
  try {
    // Get MLM system
    const mlm = await MLM.findOne();
    if (!mlm) {
      throw new Error("MLM system not found");
    }

    // Get user for progress tracking
    // Handle both ObjectId and username/sponsorId
    const searchConditions = [
      { username: userId },
      { sponsorId: userId }
    ];
    
    // Only add _id condition if userId is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(userId)) {
      searchConditions.push({ _id: userId });
    }
    
    const user = await User.findOne({ 
      $or: searchConditions
    });
    if (!user) {
      throw new Error("User not found");
    }

    // Calculate distribution based on current percentages
    const distribution = {
      ddr: (amount * mlm.ddr) / 100,
      crr: (amount * mlm.crr) / 100,
      bbr: (amount * mlm.bbr) / 100,
      hlr: (amount * mlm.hlr) / 100,
      regionalAmbassador: (amount * mlm.regionalAmbassador) / 100,
      porparleTeam: (amount * mlm.porparleTeam) / 100,
      rop: (amount * mlm.rop) / 100,
      companyOperations: (amount * mlm.companyOperations) / 100,
      technologyPool: (amount * mlm.technologyPool) / 100,
      foundationPool: (amount * mlm.foundationPool) / 100,
      publicShare: (amount * mlm.publicShare) / 100,
      netProfit: (amount * mlm.netProfit) / 100
    };

    // Update user progress for BBR, HLR, and Regional Ambassador
    const progressUpdates = await updateUserProgress(user, rideFare || (amount / 0.15), distribution, mlm);

    // Ensure transactions array exists
    if (!mlm.transactions) mlm.transactions = [];
    if (mlm.transactions === undefined) mlm.transactions = [];
    
    // Add transaction with progress tracking
    mlm.transactions.push({
      userId,
      amount,
      rideId,
      rideType,
      distribution,
      progressUpdates,
      timestamp: new Date()
    });

    // Update total amount
    mlm.totalAmount += amount;

    // Update current balances
    Object.keys(distribution).forEach(key => {
      mlm.currentBalances[key] += distribution[key];
    });

    // Save changes
    await mlm.save();
    await user.save();

    return {
      success: true,
      distribution,
      progressUpdates,
      totalAmount: mlm.totalAmount,
      currentBalances: mlm.currentBalances
    };

  } catch (error) {
    console.error("Error adding money to MLM:", error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get MLM distribution for a specific amount
 * @param {number} amount - Amount to calculate distribution for
 * @returns {Object} Distribution breakdown
 */
export const getMLMDistribution = async (amount) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      throw new Error("MLM system not found");
    }

    return {
      ddr: (amount * mlm.ddr) / 100,
      crr: (amount * mlm.crr) / 100,
      bbr: (amount * mlm.bbr) / 100,
      hlr: (amount * mlm.hlr) / 100,
      regionalAmbassador: (amount * mlm.regionalAmbassador) / 100,
      porparleTeam: (amount * mlm.porparleTeam) / 100,
      rop: (amount * mlm.rop) / 100,
      companyOperations: (amount * mlm.companyOperations) / 100,
      technologyPool: (amount * mlm.technologyPool) / 100,
      foundationPool: (amount * mlm.foundationPool) / 100,
      publicShare: (amount * mlm.publicShare) / 100,
      netProfit: (amount * mlm.netProfit) / 100
    };

  } catch (error) {
    console.error("Error getting MLM distribution:", error);
    return null;
  }
};

/**
 * Validate MLM percentages add up to 100%
 * @param {Object} percentages - Object containing percentage values
 * @returns {boolean} True if valid, false otherwise
 */
export const validateMLMPercentages = (percentages) => {
  const total = Object.values(percentages).reduce((sum, val) => sum + val, 0);
  return Math.abs(total - 100) < 0.01;
};

/**
 * Distribute MLM earnings in dual-tree system (user tree + driver tree)
 * @param {string} userId - User ID who took the ride
 * @param {string} driverId - Driver ID who completed the ride
 * @param {number} mlmAmount - MLM amount to distribute (15% of ride fare, passed directly)
 * @param {string} rideId - Unique ride identifier
 * @returns {Object} Distribution breakdown
 */
export const distributeDualTreeMLM = async (userId, driverId, mlmAmount, rideId) => {
  try {
    // The mlmAmount is already the 15% amount passed directly
    // Split into 7.5% for user tree and 7.5% for driver tree
    const userTreeAmount = mlmAmount / 2; // Half for user tree
    const driverTreeAmount = mlmAmount / 2; // Half for driver tree
    
    // Distribution percentages for each level
    const levelPercentages = {
      level1: 14, // 14% of the 7.5%
      level2: 6,  // 6% of the 7.5%
      level3: 3.6, // 3.6% of the 7.5%
      level4: 1   // 1% of the 7.5%
    };
    
    // Distribute in user tree
    const userTreeDistribution = await distributeInTree(userId, userTreeAmount, levelPercentages, rideId, 'user');
    
    // Distribute in driver tree
    const driverTreeDistribution = await distributeInTree(driverId, driverTreeAmount, levelPercentages, rideId, 'driver');
    
    // Combine distributions
    const totalDistribution = {
      userTree: userTreeDistribution,
      driverTree: driverTreeDistribution,
      totalMLMAmount: mlmAmount,
      userTreeAmount,
      driverTreeAmount
    };
    
    return {
      success: true,
      distribution: totalDistribution,
      rideId
    };
    
  } catch (error) {
    console.error("Error in dual-tree MLM distribution:", error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Distribute amount in a specific tree (user or driver) - UPWARD DISTRIBUTION
 * @param {string} personId - ID of the person (user or driver) who completed the ride
 * @param {number} treeAmount - Amount to distribute in this tree (7.5% of total fare)
 * @param {Object} levelPercentages - Percentage for each level
 * @param {string} rideId - Ride identifier
 * @param {string} treeType - 'user' or 'driver'
 * @returns {Object} Tree distribution breakdown
 */
const distributeInTree = async (personId, treeAmount, levelPercentages, rideId, treeType) => {
  try {
    // Handle both ObjectId and username/sponsorId
    const searchConditions = [
      { username: personId },
      { sponsorId: personId }
    ];
    
    // Only add _id condition if personId is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(personId)) {
      searchConditions.push({ _id: personId });
    }
    
    const person = await User.findOne({ 
      $or: searchConditions
    });
    if (!person) {
      throw new Error(`${treeType} not found`);
    }
    
    const distributions = [];
    let totalDistributed = 0;
    
    // Find the upline members (sponsors) to distribute earnings to
    const uplineMembers = await getUplineMembers(personId, 4); // Get up to 4 levels up
    
    // Level 1 - Direct sponsor (14%)
    if (uplineMembers.level1) {
      const level1Amount = (treeAmount * levelPercentages.level1) / 100;
      
      await addToUserMLMBalance(uplineMembers.level1._id, level1Amount, rideId, 1, treeType);
      
      distributions.push({
        level: 1,
        userId: uplineMembers.level1._id,
        username: uplineMembers.level1.username,
        amount: level1Amount,
        percentage: levelPercentages.level1,
        relationship: 'Direct Sponsor'
      });
      
      totalDistributed += level1Amount;
    }
    
    // Level 2 - Second level sponsor (6%)
    if (uplineMembers.level2) {
      const level2Amount = (treeAmount * levelPercentages.level2) / 100;
      
      await addToUserMLMBalance(uplineMembers.level2._id, level2Amount, rideId, 2, treeType);
      
      distributions.push({
        level: 2,
        userId: uplineMembers.level2._id,
        username: uplineMembers.level2.username,
        amount: level2Amount,
        percentage: levelPercentages.level2,
        relationship: 'Level 2 Sponsor'
      });
      
      totalDistributed += level2Amount;
    }
    
    // Level 3 - Third level sponsor (3.6%)
    if (uplineMembers.level3) {
      const level3Amount = (treeAmount * levelPercentages.level3) / 100;
      
      await addToUserMLMBalance(uplineMembers.level3._id, level3Amount, rideId, 3, treeType);
      
      distributions.push({
        level: 3,
        userId: uplineMembers.level3._id,
        username: uplineMembers.level3.username,
        amount: level3Amount,
        percentage: levelPercentages.level3,
        relationship: 'Level 3 Sponsor'
      });
      
      totalDistributed += level3Amount;
    }
    
    // Level 4 - Fourth level sponsor (1%)
    if (uplineMembers.level4) {
      const level4Amount = (treeAmount * levelPercentages.level4) / 100;
      
      await addToUserMLMBalance(uplineMembers.level4._id, level4Amount, rideId, 4, treeType);
      
      distributions.push({
        level: 4,
        userId: uplineMembers.level4._id,
        username: uplineMembers.level4.username,
        amount: level4Amount,
        percentage: levelPercentages.level4,
        relationship: 'Level 4 Sponsor'
      });
      
      totalDistributed += level4Amount;
    }
    
    return {
      treeType,
      personId,
      personUsername: person.username,
      treeAmount,
      totalDistributed,
      undistributedAmount: treeAmount - totalDistributed,
      distributions,
      uplineStructure: uplineMembers
    };
    
  } catch (error) {
    console.error(`Error distributing in ${treeType} tree:`, error);
    throw error;
  }
};

/**
 * Get upline members (sponsors) for a given user
 * @param {string} userId - User ID to find upline for
 * @param {number} levels - Number of levels to traverse up
 * @returns {Object} Upline members by level
 */
export const getUplineMembers = async (userId, levels = 4) => {
  console.log('getUplineMembers called with userId:', userId, 'levels:', levels);
  try {
    const upline = {};
    // Handle both ObjectId and username/sponsorId
    const searchConditions = [
      { username: userId },
      { sponsorId: userId }
    ];
    
    // Only add _id condition if userId is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(userId)) {
      searchConditions.push({ _id: userId });
    }
    
    let currentUser = await User.findOne({ 
      $or: searchConditions
    });
    
    if (!currentUser || !currentUser.sponsorBy) {
      return upline; // No sponsor, return empty upline
    }
    
    // Level 1 - Direct sponsor
    // sponsorBy can contain either a sponsorId, user _id, or username, so we check all three
    const level1SearchConditions = [
      { sponsorId: currentUser.sponsorBy },
      { username: currentUser.sponsorBy }
    ];
    
    // Only add _id condition if sponsorBy is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(currentUser.sponsorBy)) {
      level1SearchConditions.push({ _id: currentUser.sponsorBy });
    }
    
    const level1Sponsor = await User.findOne({ 
      $or: level1SearchConditions
    });
    if (level1Sponsor && levels >= 1) {
      upline.level1 = level1Sponsor;
      
      // Level 2 - Sponsor's sponsor
      if (level1Sponsor.sponsorBy && levels >= 2) {
        const level2SearchConditions = [
          { sponsorId: level1Sponsor.sponsorBy },
          { username: level1Sponsor.sponsorBy }
        ];
        
        // Only add _id condition if sponsorBy is a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(level1Sponsor.sponsorBy)) {
          level2SearchConditions.push({ _id: level1Sponsor.sponsorBy });
        }
        
        const level2Sponsor = await User.findOne({ 
          $or: level2SearchConditions
        });
        if (level2Sponsor) {
          upline.level2 = level2Sponsor;
          
          // Level 3 - Level 2's sponsor
          if (level2Sponsor.sponsorBy && levels >= 3) {
            const level3SearchConditions = [
              { sponsorId: level2Sponsor.sponsorBy },
              { username: level2Sponsor.sponsorBy }
            ];
            
            // Only add _id condition if sponsorBy is a valid ObjectId
            if (mongoose.Types.ObjectId.isValid(level2Sponsor.sponsorBy)) {
              level3SearchConditions.push({ _id: level2Sponsor.sponsorBy });
            }
            
            const level3Sponsor = await User.findOne({ 
              $or: level3SearchConditions
            });
            if (level3Sponsor) {
              upline.level3 = level3Sponsor;
              
              // Level 4 - Level 3's sponsor
              if (level3Sponsor.sponsorBy && levels >= 4) {
                const level4SearchConditions = [
                  { sponsorId: level3Sponsor.sponsorBy },
                  { username: level3Sponsor.sponsorBy }
                ];
                
                // Only add _id condition if sponsorBy is a valid ObjectId
                if (mongoose.Types.ObjectId.isValid(level3Sponsor.sponsorBy)) {
                  level4SearchConditions.push({ _id: level3Sponsor.sponsorBy });
                }
                
                const level4Sponsor = await User.findOne({ 
                  $or: level4SearchConditions
                });
                if (level4Sponsor) {
                  upline.level4 = level4Sponsor;
                }
              }
            }
          }
        }
      }
    }
    
    return upline;
    
  } catch (error) {
    console.error('Error getting upline members:', error);
    throw error;
  }
};

/**
 * Add MLM earnings to user's balance
 * @param {string} userId - User ID
 * @param {number} amount - Amount to add
 * @param {string} rideId - Ride identifier
 * @param {number} level - MLM level (1-4)
 * @param {string} treeType - 'user' or 'driver'
 */
const addToUserMLMBalance = async (userId, amount, rideId, level, treeType) => {
  try {
    // Handle both ObjectId and username/sponsorId
    const searchConditions = [
      { username: userId },
      { sponsorId: userId }
    ];
    
    // Only add _id condition if userId is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(userId)) {
      searchConditions.push({ _id: userId });
    }
    
    const user = await User.findOne({ 
      $or: searchConditions
    });
    if (!user) {
      throw new Error('User not found');
    }
    
    // Initialize MLM balance if it doesn't exist
    if (!user.mlmBalance) {
      user.mlmBalance = {
        total: 0,
        userTree: 0,
        driverTree: 0,
        transactions: []
      };
    }
    
    // Add to appropriate tree balance
    if (treeType === 'user') {
      user.mlmBalance.userTree += amount;
    } else {
      user.mlmBalance.driverTree += amount;
    }
    
    user.mlmBalance.total += amount;
    
    // Add transaction record
    user.mlmBalance.transactions.push({
      amount,
      rideId,
      timestamp: new Date(),
      type: treeType === 'user' ? 'userTree' : 'driverTree'
    });
    
    await user.save();
    
  } catch (error) {
    console.error('Error adding MLM balance to user:', error);
    throw error;
  }
};

/**
 * Update user progress for BBR, HLR, and Regional Ambassador systems
 * @param {Object} user - User document
 * @param {number} rideFare - Original ride fare
 * @param {Object} distribution - MLM distribution amounts
 * @param {Object} mlm - MLM system document
 * @returns {Object} Progress updates summary
 */
const updateUserProgress = async (user, rideFare, distribution, mlm) => {
  const updates = {
    bbr: null,
    hlr: null,
    regionalAmbassador: null
  };

  try {
    // Update BBR progress
    const activeBBRCampaign = mlm.bbrCampaigns.find(campaign => campaign.isActive);
    if (activeBBRCampaign) {
      let participant = activeBBRCampaign.participants.find(p => p.userId.toString() === user._id.toString());
      
      if (!participant) {
        // Add new participant
        participant = {
          userId: user._id,
          ridesCompleted: 1,
          totalEarnings: rideFare,
          joinedAt: new Date(),
          lastRideAt: new Date()
        };
        activeBBRCampaign.participants.push(participant);
      } else {
        // Update existing participant
        participant.ridesCompleted += 1;
        participant.totalEarnings += rideFare;
        participant.lastRideAt = new Date();
      }
      
      updates.bbr = {
        campaignId: activeBBRCampaign._id,
        ridesCompleted: participant.ridesCompleted,
        targetRides: activeBBRCampaign.targetRides,
        progress: Math.min((participant.ridesCompleted / activeBBRCampaign.targetRides) * 100, 100)
      };
    }

    // Update HLR progress
    if (!user.hlrQualification) {
      user.hlrQualification = {
        isQualified: false,
        qualifiedAt: null,
        rewardClaimed: false,
        progress: {
          pgpPoints: 0,
          tgpPoints: 0,
          overallProgress: 0
        }
      };
    }
    
    // Ensure progress object exists
    if (!user.hlrQualification.progress) {
      user.hlrQualification.progress = {
        pgpPoints: 0,
        tgpPoints: 0,
        overallProgress: 0
      };
    }
    
    // Add PGP points for personal ride (assuming 50 PGP per ride >= ₹100)
    if (rideFare >= 100) {
      user.hlrQualification.progress.pgpPoints += 50;
      
      // Check if user qualifies for HLR
      const hlrConfig = mlm.hlrConfig;
      if (user.hlrQualification.progress.pgpPoints >= hlrConfig.requiredPGP && 
          user.hlrQualification.progress.tgpPoints >= hlrConfig.requiredTGP && 
          !user.hlrQualification.isQualified) {
        user.hlrQualification.isQualified = true;
        user.hlrQualification.qualifiedAt = new Date();
      }
      
      // Calculate overall progress
      const pgpProgress = Math.min((user.hlrQualification.progress.pgpPoints / hlrConfig.requiredPGP) * 100, 100);
      const tgpProgress = Math.min((user.hlrQualification.progress.tgpPoints / hlrConfig.requiredTGP) * 100, 100);
      user.hlrQualification.progress.overallProgress = Math.min(((pgpProgress + tgpProgress) / 2), 100);
      
      updates.hlr = {
        pgpPoints: user.hlrQualification.progress.pgpPoints,
        tgpPoints: user.hlrQualification.progress.tgpPoints,
        isQualified: user.hlrQualification.isQualified,
        requiredPGP: hlrConfig.requiredPGP,
        requiredTGP: hlrConfig.requiredTGP
      };
    }

    // Update Regional Ambassador progress
    if (!user.regionalAmbassador) {
      user.regionalAmbassador = {
        currentRank: 'Challenger',
        totalEarnings: 0,
        lastUpdated: new Date()
      };
    }
    
    // Add earnings to regional ambassador progress
    user.regionalAmbassador.totalEarnings += distribution.regionalAmbassador;
    user.regionalAmbassador.lastUpdated = new Date();
    
    // Check for rank progression
    const ranks = Array.from(mlm.regionalAmbassadorConfig.ranks.entries());
    const currentRank = ranks.find(([name]) => name === user.regionalAmbassador.currentRank);
    const nextRank = ranks.find(([name, details]) => details.level === (currentRank[1].level + 1));
    
    if (nextRank && user.regionalAmbassador.totalEarnings >= nextRank[1].minProgress) {
      user.regionalAmbassador.currentRank = nextRank[0];
    }
    
    updates.regionalAmbassador = {
      currentRank: user.regionalAmbassador.currentRank,
      totalEarnings: user.regionalAmbassador.totalEarnings,
      nextRank: nextRank ? nextRank[0] : null,
      nextRankRequirement: nextRank ? nextRank[1].minProgress : null
    };

    return updates;
    
  } catch (error) {
    console.error('Error updating user progress:', error);
    return updates;
  }
};

/**
 * Get user's MLM earnings summary
 * @param {string} userId - User ID
 * @returns {Object} MLM earnings summary
 */
export const getUserMLMEarnings = async (userId) => {
  try {
    // Handle both ObjectId and username/sponsorId
    const searchConditions = [
      { username: userId },
      { sponsorId: userId }
    ];
    
    // Only add _id condition if userId is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(userId)) {
      searchConditions.push({ _id: userId });
    }
    
    const user = await User.findOne({ 
      $or: searchConditions
    });
    if (!user) {
      throw new Error('User not found');
    }
    
    if (!user.mlmBalance) {
      return {
        total: 0,
        userTree: 0,
        driverTree: 0,
        transactions: []
      };
    }
    
    return user.mlmBalance;
    
  } catch (error) {
    console.error('Error getting user MLM earnings:', error);
    throw error;
  }
};