import MLM from "../models/mlmModel.js";
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import { distributeDualTreeMLM, getUserMLMEarnings } from "../utils/mlmHelper.js";
import { getUplineMembers } from '../utils/mlmHelper.js';

// Create MLM system
export const createMLM = asyncHandler(async (req, res) => {
  try {
    const existingMLM = await MLM.findOne();
    if (existingMLM) {
      return res.status(400).json({
        success: false,
        message: "MLM system already exists"
      });
    }

    const { name } = req.body;
    
    const mlm = new MLM({
      name: name || "MLM System",
      ddr: 24,
      crr: 13.3,
      bbr: 6,
      hlr: 6.7,
      regionalAmbassador: 0.4,
      porparleTeam: 10,
      rop: 3,
      companyOperations: 3,
      technologyPool: 2.6,
      foundationPool: 1,
      publicShare: 15,
      netProfit: 15,
      totalMLMAmount: 0,
      currentBalances: {
        ddr: 0,
        crr: 0,
        bbr: 0,
        hlr: 0,
        regionalAmbassador: 0,
        porparleTeam: 0,
        rop: 0,
        companyOperations: 0,
        technologyPool: 0,
        foundationPool: 0,
        publicShare: 0,
        netProfit: 0
      },
      transactions: []
    });

    await mlm.save();

    res.status(201).json({
      success: true,
      message: "MLM system created successfully",
      mlm
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete MLM system (Admin only)
export const deleteMLM = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    await MLM.deleteOne({ _id: mlm._id });

    res.status(200).json({
      success: true,
      message: "MLM system deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Reset MLM data (Admin only)
export const resetMLMData = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Reset all balances and transactions
    mlm.transactions = [];
    mlm.totalAmount = 0;
    
    // Reset current balances
    const balanceFields = [
      'ddr', 'crr', 'bbr', 'hlr', 'regionalAmbassador', 'porparleTeam',
      'rop', 'companyOperations', 'technologyPool', 'foundationPool',
      'publicShare', 'netProfit', 'ddrLevel1', 'ddrLevel2', 'ddrLevel3',
      'ddrLevel4', 'gc', 'la', 'ceo', 'coo', 'cmo', 'cfo', 'cto', 'chro',
      'topTeamPerform', 'winner', 'fighter', 'operationExpense',
      'organizationEvent', 'chairmanFounder', 'shareholder1',
      'shareholder2', 'shareholder3'
    ];
    
    balanceFields.forEach(field => {
      if (mlm.currentBalances[field] !== undefined) {
        mlm.currentBalances[field] = 0;
      }
    });

    await mlm.save();

    res.status(200).json({
      success: true,
      message: "MLM data reset successfully",
      data: mlm
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Ride completion MLM distribution
export const distributeRideMLM = asyncHandler(async (req, res) => {
  try {
    const { userId, driverId, rideId, totalFare, rideType } = req.body;
    
    if (!userId || !rideId || !totalFare) {
      return res.status(400).json({
        success: false,
        message: "userId, rideId, and totalFare are required"
      });
    }

    // Calculate 15% of ride fare for MLM
    const mlmAmount = totalFare * 0.15;
    
    // Calculate qualification points for TGP/PGP
    const driverPoints = totalFare;
    const userPoints = totalFare;
    
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Get user and driver for TGP/PGP distribution
    const user = await User.findById(userId);
    const driver = driverId ? await User.findById(driverId) : null;
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Determine if it's a personal ride (user personally completes as driver/user) or team ride
    const isPersonalRide = userId === driverId || !driverId;
    
    // User gets PGP for personal rides, TGP for team rides
    const userQualificationPointType = isPersonalRide ? 'pgp' : 'tgp';
    
    // Add qualification points to user
    await user.addQualificationPoints({
      points: userPoints,
      rideId,
      type: userQualificationPointType,
      rideType: rideType || (isPersonalRide ? 'personal' : 'team'),
      rideFare: totalFare
    });
    
    // Add PGP qualification points to driver if different from user (driver always gets PGP for personal completion)
    if (driver && userId !== driverId) {
      await driver.addQualificationPoints({
        points: driverPoints,
        rideId,
        type: 'pgp', // Driver always gets PGP for personal completion
        rideType: 'personal',
        rideFare: totalFare
      });
    }
    
    // Now distribute TGP to team members (upline sponsors) when any team member completes a ride
    // This is the key change: TGP distribution to team hierarchy
    const teamDistributions = [];
    
    // Get upline members (team sponsors) for both user and driver
    const userUpline = await getUplineMembers(userId, 4);
    const driverUpline = driver ? await getUplineMembers(driverId, 4) : {};
    
    // Distribute TGP to user's upline team (sponsors get TGP from team member's activity)
    for (let level = 1; level <= 4; level++) {
      const sponsor = userUpline[`level${level}`];
      if (sponsor) {
        await sponsor.addQualificationPoints({
          points: userPoints,
          rideId,
          type: 'tgp', // Team members get TGP from downline activity
          rideType: 'team',
          rideFare: totalFare
        });
        teamDistributions.push({
          sponsorId: sponsor._id,
          sponsorName: sponsor.username,
          level,
          points: userPoints,
          type: 'tgp',
          source: 'user_activity'
        });
      }
    }
    
    // Distribute TGP to driver's upline team if driver exists and is different from user
    if (driver && userId !== driverId) {
      for (let level = 1; level <= 4; level++) {
        const sponsor = driverUpline[`level${level}`];
        if (sponsor) {
          await sponsor.addQualificationPoints({
            points: driverPoints,
            rideId,
            type: 'tgp', // Team members get TGP from downline activity
            rideType: 'team',
            rideFare: totalFare
          });
          teamDistributions.push({
            sponsorId: sponsor._id,
            sponsorName: sponsor.username,
            level,
            points: driverPoints,
            type: 'tgp',
            source: 'driver_activity'
          });
        }
      }
    }

    // Calculate distribution based on current percentages
    const distribution = {
      ddr: (mlmAmount * mlm.ddr) / 100,
      crr: (mlmAmount * mlm.crr) / 100,
      bbr: (mlmAmount * mlm.bbr) / 100,
      hlr: (mlmAmount * mlm.hlr) / 100,
      regionalAmbassador: (mlmAmount * mlm.regionalAmbassador) / 100,
      porparleTeam: (mlmAmount * mlm.porparleTeam) / 100,
      rop: (mlmAmount * mlm.rop) / 100,
      companyOperations: (mlmAmount * mlm.companyOperations) / 100,
      technologyPool: (mlmAmount * mlm.technologyPool) / 100,
      foundationPool: (mlmAmount * mlm.foundationPool) / 100,
      publicShare: (mlmAmount * mlm.publicShare) / 100,
      netProfit: (mlmAmount * mlm.netProfit) / 100
    };

    // Calculate DDR sub-distributions
    const ddrSubDistribution = {
      ddrLevel1: (distribution.ddr * mlm.ddrLevel1) / 100,
      ddrLevel2: (distribution.ddr * mlm.ddrLevel2) / 100,
      ddrLevel3: (distribution.ddr * mlm.ddrLevel3) / 100,
      ddrLevel4: (distribution.ddr * mlm.ddrLevel4) / 100
    };

    // Separate qualification-based rewards that go to MLM pool
    const qualificationRewards = {
      crr: distribution.crr,
      bbr: distribution.bbr,
      hlr: distribution.hlr,
      regionalAmbassador: distribution.regionalAmbassador
    };

    // Add transaction
    mlm.transactions.push({
      userId,
      driverId,
      amount: mlmAmount,
      rideId,
      distribution: {
        ...distribution,
        ...ddrSubDistribution
      },
      qualificationRewards,
      qualificationPointsDistribution: {
        userPoints,
        driverPoints,
        userType: userQualificationPointType,
        driverType: driver ? 'pgp' : null,
        isPersonalRide,
        teamDistributions
      },
      timestamp: new Date(),
      note: "CRR, BBR, HLR, Regional Ambassador are qualification-based rewards that go to MLM pool. TGP/PGP qualification points distributed based on ride type."
    });

    // Update total amount
    mlm.totalAmount += mlmAmount;

    // Update current balances
    Object.keys(distribution).forEach(key => {
      mlm.currentBalances[key] += distribution[key];
    });
    
    Object.keys(ddrSubDistribution).forEach(key => {
      mlm.currentBalances[key] += ddrSubDistribution[key];
    });

    await mlm.save();

    res.status(200).json({
      success: true,
      message: "MLM distribution and TGP/PGP allocation completed successfully",
      data: {
        mlmAmount,
        distribution,
        ddrSubDistribution,
        qualificationRewards,
        qualificationPointsDistribution: {
          userPoints,
          driverPoints,
          userType: userQualificationPointType,
          driverType: driver ? 'pgp' : null,
          isPersonalRide,
          teamDistributions
        },
        note: "CRR, BBR, HLR, Regional Ambassador require qualification and go to MLM pool. TGP/PGP qualification points distributed based on ride type.",
        totalMLMAmount: mlm.totalAmount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get admin MLM dashboard (all payments from all users)
export const getAdminMLMDashboard = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne().populate('transactions.userId', 'firstName lastName email');
    
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Calculate total payments by section
    const sectionTotals = {
      ddr: mlm.currentBalances.ddr,
      crr: mlm.currentBalances.crr,
      bbr: mlm.currentBalances.bbr,
      hlr: mlm.currentBalances.hlr,
      regionalAmbassador: mlm.currentBalances.regionalAmbassador,
      porparleTeam: mlm.currentBalances.porparleTeam,
      rop: mlm.currentBalances.rop,
      companyOperations: mlm.currentBalances.companyOperations,
      technologyPool: mlm.currentBalances.technologyPool,
      foundationPool: mlm.currentBalances.foundationPool,
      publicShare: mlm.currentBalances.publicShare,
      netProfit: mlm.currentBalances.netProfit
    };

    // DDR level breakdown
    const ddrLevelTotals = {
      level1: mlm.currentBalances.ddrLevel1,
      level2: mlm.currentBalances.ddrLevel2,
      level3: mlm.currentBalances.ddrLevel3,
      level4: mlm.currentBalances.ddrLevel4
    };

    // Recent transactions
    const recentTransactions = mlm.transactions
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 50)
      .map(transaction => ({
        userId: transaction.userId,
        amount: transaction.amount,
        rideId: transaction.rideId,
        distribution: transaction.distribution,
        timestamp: transaction.timestamp
      }));

    res.status(200).json({
      success: true,
      data: {
        totalMLMAmount: mlm.totalAmount,
        sectionTotals,
        ddrLevelTotals,
        totalTransactions: mlm.transactions.length,
        recentTransactions,
        percentageConfiguration: {
          ddr: mlm.ddr,
          crr: mlm.crr,
          bbr: mlm.bbr,
          hlr: mlm.hlr,
          regionalAmbassador: mlm.regionalAmbassador,
          porparleTeam: mlm.porparleTeam,
          rop: mlm.rop,
          companyOperations: mlm.companyOperations,
          technologyPool: mlm.technologyPool,
          foundationPool: mlm.foundationPool,
          publicShare: mlm.publicShare,
          netProfit: mlm.netProfit
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get user DDR earnings by level (L1-L4)
export const getUserDDREarnings = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Get user's DDR transactions
    const userTransactions = mlm.transactions.filter(
      t => t.userId.toString() === userId
    );

    // Calculate DDR earnings by level
    const ddrEarnings = {
      level1: 0,
      level2: 0,
      level3: 0,
      level4: 0,
      total: 0
    };

    userTransactions.forEach(transaction => {
      if (transaction.distribution.ddrLevel1) {
        ddrEarnings.level1 += transaction.distribution.ddrLevel1;
      }
      if (transaction.distribution.ddrLevel2) {
        ddrEarnings.level2 += transaction.distribution.ddrLevel2;
      }
      if (transaction.distribution.ddrLevel3) {
        ddrEarnings.level3 += transaction.distribution.ddrLevel3;
      }
      if (transaction.distribution.ddrLevel4) {
        ddrEarnings.level4 += transaction.distribution.ddrLevel4;
      }
    });

    ddrEarnings.total = ddrEarnings.level1 + ddrEarnings.level2 + ddrEarnings.level3 + ddrEarnings.level4;

    // Calculate available balance (for withdrawal)
    const availableBalance = ddrEarnings.total; // In real implementation, subtract withdrawn amounts

    res.status(200).json({
      success: true,
      data: {
        userId,
        userName: `${user.firstName} ${user.lastName}`,
        joiningDate: user.createdAt,
        totalEarnings: ddrEarnings.total,
        availableBalance,
        levelEarnings: {
          L1: ddrEarnings.level1,
          L2: ddrEarnings.level2,
          L3: ddrEarnings.level3,
          L4: ddrEarnings.level4
        },
        totalTransactions: userTransactions.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get DDR transaction history with pagination
export const getDDRTransactionHistory = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const { level, page = 1, limit = 20, startDate, endDate } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Get user's transactions
    let userTransactions = mlm.transactions.filter(
      t => t.userId.toString() === userId
    );

    // Apply date filters
    if (startDate || endDate) {
      userTransactions = userTransactions.filter(t => {
        const transactionDate = new Date(t.timestamp);
        if (startDate && transactionDate < new Date(startDate)) return false;
        if (endDate && transactionDate > new Date(endDate)) return false;
        return true;
      });
    }

    // Transform transactions to include level-specific data
    const levelTransactions = userTransactions.map(transaction => {
      const levelData = {
        transactionId: transaction._id,
        rideId: transaction.rideId,
        date: transaction.timestamp,
        totalAmount: transaction.amount,
        levels: {
          L1: {
            amount: transaction.distribution.ddrLevel1 || 0,
            sourceMember: "Level 1 Member", // In real implementation, get actual member name
            sourceMemberId: "member_id_1"
          },
          L2: {
            amount: transaction.distribution.ddrLevel2 || 0,
            sourceMember: "Level 2 Member",
            sourceMemberId: "member_id_2"
          },
          L3: {
            amount: transaction.distribution.ddrLevel3 || 0,
            sourceMember: "Level 3 Member",
            sourceMemberId: "member_id_3"
          },
          L4: {
            amount: transaction.distribution.ddrLevel4 || 0,
            sourceMember: "Level 4 Member",
            sourceMemberId: "member_id_4"
          }
        }
      };
      return levelData;
    });

    // Filter by specific level if requested
    let filteredTransactions = levelTransactions;
    if (level && ['L1', 'L2', 'L3', 'L4'].includes(level)) {
      filteredTransactions = levelTransactions.filter(t => t.levels[level].amount > 0);
    }

    // Sort by date (newest first)
    filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      data: {
        transactions: paginatedTransactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(filteredTransactions.length / limit),
          totalTransactions: filteredTransactions.length,
          hasNextPage: endIndex < filteredTransactions.length,
          hasPrevPage: page > 1
        },
        filters: {
          level,
          startDate,
          endDate
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get DDR leaderboard
export const getDDRLeaderboard = asyncHandler(async (req, res) => {
  try {
    const { limit = 30, userId } = req.query;
    
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Calculate DDR earnings for all users
    const userEarnings = {};
    
    mlm.transactions.forEach(transaction => {
      const uId = transaction.userId.toString();
      if (!userEarnings[uId]) {
        userEarnings[uId] = {
          userId: uId,
          totalDDR: 0,
          level1: 0,
          level2: 0,
          level3: 0,
          level4: 0,
          transactionCount: 0
        };
      }
      
      const ddrLevel1 = transaction.distribution.ddrLevel1 || 0;
      const ddrLevel2 = transaction.distribution.ddrLevel2 || 0;
      const ddrLevel3 = transaction.distribution.ddrLevel3 || 0;
      const ddrLevel4 = transaction.distribution.ddrLevel4 || 0;
      
      userEarnings[uId].level1 += ddrLevel1;
      userEarnings[uId].level2 += ddrLevel2;
      userEarnings[uId].level3 += ddrLevel3;
      userEarnings[uId].level4 += ddrLevel4;
      userEarnings[uId].totalDDR += (ddrLevel1 + ddrLevel2 + ddrLevel3 + ddrLevel4);
      userEarnings[uId].transactionCount++;
    });

    // Get user details for leaderboard
    const userIds = Object.keys(userEarnings);
    const users = await User.find({ _id: { $in: userIds } }).select('firstName lastName username email profilePicture');
    
    // Create leaderboard with user details
    const leaderboardData = users.map(user => {
      const earnings = userEarnings[user._id.toString()];
      return {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        username: user.username,
        profilePicture: user.profilePicture,
        totalEarnings: earnings.totalDDR,
        levelBreakdown: {
          L1: earnings.level1,
          L2: earnings.level2,
          L3: earnings.level3,
          L4: earnings.level4
        },
        transactionCount: earnings.transactionCount
      };
    });

    // Sort by total earnings (highest first)
    leaderboardData.sort((a, b) => b.totalEarnings - a.totalEarnings);

    // Add rank positions
    const rankedLeaderboard = leaderboardData.map((user, index) => ({
      ...user,
      rank: index + 1
    }));

    // Get top earners based on limit
    const topEarners = rankedLeaderboard.slice(0, parseInt(limit));

    // Find current user's position if userId provided
    let currentUserPosition = null;
    if (userId) {
      const userIndex = rankedLeaderboard.findIndex(user => user.userId.toString() === userId);
      if (userIndex !== -1) {
        currentUserPosition = {
          ...rankedLeaderboard[userIndex],
          isInTopList: userIndex < parseInt(limit)
        };
      }
    }

    res.status(200).json({
      success: true,
      data: {
        topEarners,
        currentUser: currentUserPosition,
        totalParticipants: rankedLeaderboard.length,
        lastUpdated: new Date(),
        tip: "Active L1-L4 growth boosts all levels and increases your DDR income"
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get user CRR earnings and qualification status
export const getUserCRREarnings = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Get user's qualification points
    const qualificationStats = await user.getQualificationPointsStats();
    
    // Get user's CRR transactions
    const userTransactions = mlm.transactions.filter(
      t => t.userId.toString() === userId
    );

    // Calculate CRR earnings
    let totalCRREarnings = 0;
    userTransactions.forEach(transaction => {
      if (transaction.distribution.crr) {
        totalCRREarnings += transaction.distribution.crr;
      }
    });

    // Determine current rank based on qualification points
    // Note: These thresholds should be configurable
    let currentRank = "Bronze";
    let nextRank = "Silver";
    let pointsToNextRank = 1000;
    
    const totalPoints = qualificationStats.currentTGP + qualificationStats.currentPGP;
    
    if (totalPoints >= 10000) {
      currentRank = "Diamond";
      nextRank = "Diamond";
      pointsToNextRank = 0;
    } else if (totalPoints >= 5000) {
      currentRank = "Platinum";
      nextRank = "Diamond";
      pointsToNextRank = 10000 - totalPoints;
    } else if (totalPoints >= 2500) {
      currentRank = "Gold";
      nextRank = "Platinum";
      pointsToNextRank = 5000 - totalPoints;
    } else if (totalPoints >= 1000) {
      currentRank = "Silver";
      nextRank = "Gold";
      pointsToNextRank = 2500 - totalPoints;
    } else {
      pointsToNextRank = 1000 - totalPoints;
    }

    // Calculate progress percentage
    const progressPercentage = pointsToNextRank > 0 ? 
      Math.min(100, ((totalPoints % (totalPoints + pointsToNextRank)) / (totalPoints + pointsToNextRank)) * 100) : 100;

    res.status(200).json({
      success: true,
      data: {
        userId,
        userName: `${user.firstName} ${user.lastName}`,
        currentRank,
        nextRank,
        totalCRREarnings,
        availableBalance: totalCRREarnings, // In real implementation, subtract withdrawn amounts
        qualificationPoints: {
          TGP: qualificationStats.currentTGP,
          PGP: qualificationStats.currentPGP,
          total: totalPoints
        },
        rankProgress: {
          currentPoints: totalPoints,
          pointsToNextRank,
          progressPercentage: Math.round(progressPercentage)
        },
        monthlyStats: {
          TGP: qualificationStats.monthlyTGP,
          PGP: qualificationStats.monthlyPGP
        },
        totalTransactions: userTransactions.filter(t => t.distribution.crr > 0).length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get CRR transaction history
export const getCRRTransactionHistory = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, startDate, endDate } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Get user's CRR transactions
    let userTransactions = mlm.transactions.filter(
      t => t.userId.toString() === userId && t.distribution.crr > 0
    );

    // Apply date filters
    if (startDate || endDate) {
      userTransactions = userTransactions.filter(t => {
        const transactionDate = new Date(t.timestamp);
        if (startDate && transactionDate < new Date(startDate)) return false;
        if (endDate && transactionDate > new Date(endDate)) return false;
        return true;
      });
    }

    // Transform transactions for CRR display
    const crrTransactions = userTransactions.map(transaction => ({
      transactionId: transaction._id,
      rideId: transaction.rideId,
      date: transaction.timestamp,
      crrAmount: transaction.distribution.crr,
      totalRideAmount: transaction.amount,
      qualificationPointsEarned: {
        TGP: transaction.qualificationPoints?.tgp || 0,
        PGP: transaction.qualificationPoints?.pgp || 0
      },
      rankAtTransaction: "Silver", // In real implementation, calculate rank at time of transaction
      description: `CRR reward from ride #${transaction.rideId}`
    }));

    // Sort by date (newest first)
    crrTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedTransactions = crrTransactions.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      data: {
        transactions: paginatedTransactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(crrTransactions.length / limit),
          totalTransactions: crrTransactions.length,
          hasNextPage: endIndex < crrTransactions.length,
          hasPrevPage: page > 1
        },
        filters: {
          startDate,
          endDate
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get CRR leaderboard with rank-based grouping
export const getCRRLeaderboard = asyncHandler(async (req, res) => {
  try {
    const { rank, limit = 30, userId } = req.query;
    
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Calculate CRR earnings and qualification points for all users
    const userStats = {};
    
    mlm.transactions.forEach(transaction => {
      const uId = transaction.userId.toString();
      if (!userStats[uId]) {
        userStats[uId] = {
          userId: uId,
          totalCRR: 0,
          totalTGP: 0,
          totalPGP: 0,
          transactionCount: 0
        };
      }
      
      if (transaction.distribution.crr) {
        userStats[uId].totalCRR += transaction.distribution.crr;
      }
      
      if (transaction.qualificationPoints) {
        userStats[uId].totalTGP += transaction.qualificationPoints.tgp || 0;
        userStats[uId].totalPGP += transaction.qualificationPoints.pgp || 0;
      }
      
      userStats[uId].transactionCount++;
    });

    // Get user details for leaderboard
    const userIds = Object.keys(userStats);
    const users = await User.find({ _id: { $in: userIds } }).select('firstName lastName username profilePicture');
    
    // Create leaderboard with user details and ranks
    const leaderboardData = users.map(user => {
      const stats = userStats[user._id.toString()];
      const totalPoints = stats.totalTGP + stats.totalPGP;
      
      // Determine rank based on qualification points
      let userRank = "Bronze";
      if (totalPoints >= 10000) userRank = "Diamond";
      else if (totalPoints >= 5000) userRank = "Platinum";
      else if (totalPoints >= 2500) userRank = "Gold";
      else if (totalPoints >= 1000) userRank = "Silver";
      
      return {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        username: user.username,
        profilePicture: user.profilePicture,
        rank: userRank,
        totalCRREarnings: stats.totalCRR,
        qualificationPoints: {
          TGP: stats.totalTGP,
          PGP: stats.totalPGP,
          total: totalPoints
        },
        transactionCount: stats.transactionCount
      };
    });

    // Filter by rank if specified
    let filteredData = leaderboardData;
    if (rank && ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'].includes(rank)) {
      filteredData = leaderboardData.filter(user => user.rank === rank);
    }

    // Sort by total CRR earnings (highest first)
    filteredData.sort((a, b) => b.totalCRREarnings - a.totalCRREarnings);

    // Add rank positions within the filtered group
    const rankedLeaderboard = filteredData.map((user, index) => ({
      ...user,
      position: index + 1
    }));

    // Get top earners based on limit
    const topEarners = rankedLeaderboard.slice(0, parseInt(limit));

    // Find current user's position if userId provided
    let currentUserPosition = null;
    if (userId) {
      const userIndex = rankedLeaderboard.findIndex(user => user.userId.toString() === userId);
      if (userIndex !== -1) {
        currentUserPosition = {
          ...rankedLeaderboard[userIndex],
          isInTopList: userIndex < parseInt(limit)
        };
      }
    }

    // Get rank distribution
    const rankDistribution = {
      Bronze: leaderboardData.filter(u => u.rank === 'Bronze').length,
      Silver: leaderboardData.filter(u => u.rank === 'Silver').length,
      Gold: leaderboardData.filter(u => u.rank === 'Gold').length,
      Platinum: leaderboardData.filter(u => u.rank === 'Platinum').length,
      Diamond: leaderboardData.filter(u => u.rank === 'Diamond').length
    };

    res.status(200).json({
      success: true,
      data: {
        topEarners,
        currentUser: currentUserPosition,
        rankDistribution,
        totalParticipants: rankedLeaderboard.length,
        filterApplied: rank || 'All Ranks',
        lastUpdated: new Date(),
        tip: "Maintain consistent TGP and PGP growth to advance ranks and increase CRR rewards"
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Admin: Get motivational quotes for DDR/CRR dashboards
export const getMotivationalQuotes = asyncHandler(async (req, res) => {
  try {
    const { type } = req.query; // 'ddr' or 'crr'
    
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Default motivational quotes if not set in database
    const defaultQuotes = {
      ddr: [
        "Build your network, build your wealth - every connection counts!",
        "Your downline success is your success - support and grow together!",
        "Consistency in building relationships leads to consistent DDR income!"
      ],
      crr: [
        "Champions are made through consistent qualification point growth!",
        "Your rank reflects your commitment - keep climbing!",
        "Every TGP and PGP point brings you closer to championship status!"
      ]
    };

    const quotes = mlm.motivationalQuotes || defaultQuotes;
    const requestedQuotes = type ? quotes[type] : quotes;

    res.status(200).json({
      success: true,
      data: {
        quotes: requestedQuotes,
        type: type || 'all',
        lastUpdated: mlm.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Admin: Update motivational quotes
export const updateMotivationalQuotes = asyncHandler(async (req, res) => {
  try {
    const { type, quotes } = req.body; // type: 'ddr' or 'crr', quotes: array of strings
    
    if (!type || !quotes || !Array.isArray(quotes)) {
      return res.status(400).json({
        success: false,
        message: "Type and quotes array are required"
      });
    }

    if (!['ddr', 'crr'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be 'ddr' or 'crr'"
      });
    }

    let mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Initialize motivationalQuotes if it doesn't exist
    if (!mlm.motivationalQuotes) {
      mlm.motivationalQuotes = { ddr: [], crr: [] };
    }

    mlm.motivationalQuotes[type] = quotes;
    await mlm.save();

    res.status(200).json({
      success: true,
      message: `${type.toUpperCase()} motivational quotes updated successfully`,
      data: {
        type,
        quotes: mlm.motivationalQuotes[type],
        updatedAt: mlm.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Admin: Get rank qualification thresholds
export const getRankThresholds = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Default rank thresholds
    const defaultThresholds = {
      Bronze: { min: 0, max: 999 },
      Silver: { min: 1000, max: 2499 },
      Gold: { min: 2500, max: 4999 },
      Platinum: { min: 5000, max: 9999 },
      Diamond: { min: 10000, max: null }
    };

    const thresholds = mlm.rankThresholds || defaultThresholds;

    res.status(200).json({
      success: true,
      data: {
        thresholds,
        lastUpdated: mlm.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Admin: Update rank qualification thresholds
export const updateRankThresholds = asyncHandler(async (req, res) => {
  try {
    const { thresholds } = req.body;
    
    if (!thresholds || typeof thresholds !== 'object') {
      return res.status(400).json({
        success: false,
        message: "Thresholds object is required"
      });
    }

    let mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    mlm.rankThresholds = thresholds;
    await mlm.save();

    res.status(200).json({
      success: true,
      message: "Rank thresholds updated successfully",
      data: {
        thresholds: mlm.rankThresholds,
        updatedAt: mlm.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Admin: Get DDR/CRR system statistics
export const getDDRCRRStats = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Calculate DDR statistics
    let totalDDRDistributed = 0;
    let totalCRRDistributed = 0;
    let totalTransactions = mlm.transactions.length;
    
    const userStats = {};
    
    mlm.transactions.forEach(transaction => {
      const uId = transaction.userId.toString();
      
      // DDR calculations
      const ddrTotal = (transaction.distribution.ddrLevel1 || 0) +
                      (transaction.distribution.ddrLevel2 || 0) +
                      (transaction.distribution.ddrLevel3 || 0) +
                      (transaction.distribution.ddrLevel4 || 0);
      totalDDRDistributed += ddrTotal;
      
      // CRR calculations
      if (transaction.distribution.crr) {
        totalCRRDistributed += transaction.distribution.crr;
      }
      
      // User statistics
      if (!userStats[uId]) {
        userStats[uId] = {
          totalTGP: 0,
          totalPGP: 0,
          ddrEarnings: 0,
          crrEarnings: 0
        };
      }
      
      userStats[uId].ddrEarnings += ddrTotal;
      userStats[uId].crrEarnings += (transaction.distribution.crr || 0);
      
      if (transaction.qualificationPoints) {
        userStats[uId].totalTGP += transaction.qualificationPoints.tgp || 0;
        userStats[uId].totalPGP += transaction.qualificationPoints.pgp || 0;
      }
    });

    // Calculate rank distribution
    const rankDistribution = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0, Diamond: 0 };
    
    Object.values(userStats).forEach(stats => {
      const totalPoints = stats.totalTGP + stats.totalPGP;
      if (totalPoints >= 10000) rankDistribution.Diamond++;
      else if (totalPoints >= 5000) rankDistribution.Platinum++;
      else if (totalPoints >= 2500) rankDistribution.Gold++;
      else if (totalPoints >= 1000) rankDistribution.Silver++;
      else rankDistribution.Bronze++;
    });

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalDDRDistributed,
          totalCRRDistributed,
          totalTransactions,
          activeUsers: Object.keys(userStats).length
        },
        rankDistribution,
        topPerformers: {
          ddr: Object.entries(userStats)
            .sort(([,a], [,b]) => b.ddrEarnings - a.ddrEarnings)
            .slice(0, 5)
            .map(([userId, stats]) => ({ userId, earnings: stats.ddrEarnings })),
          crr: Object.entries(userStats)
            .sort(([,a], [,b]) => b.crrEarnings - a.crrEarnings)
            .slice(0, 5)
            .map(([userId, stats]) => ({ userId, earnings: stats.crrEarnings }))
        },
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get user DDR tree view with qualification-based visibility
export const getUserDDRTree = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Get user's transactions
    const userTransactions = mlm.transactions.filter(
      t => t.userId.toString() === userId
    );

    // Check user qualifications (this would come from user model in real implementation)
    // For now, we'll determine qualifications based on earnings history
    const userQualifications = {
      ddr: true, // All users are qualified for DDR
      crr: false,
      bbr: false, 
      hlr: false,
      regionalAmbassador: false
    };

    // Determine qualifications based on actual earnings (simplified logic)
    userTransactions.forEach(transaction => {
      if (transaction.distribution.crr && transaction.distribution.crr > 0) {
        userQualifications.crr = true;
      }
      if (transaction.distribution.bbr && transaction.distribution.bbr > 0) {
        userQualifications.bbr = true;
      }
      if (transaction.distribution.hlr && transaction.distribution.hlr > 0) {
        userQualifications.hlr = true;
      }
      if (transaction.distribution.regionalAmbassador && transaction.distribution.regionalAmbassador > 0) {
        userQualifications.regionalAmbassador = true;
      }
    });

    // Calculate DDR earnings by level (all users can see DDR)
    const ddrEarnings = {
      level1: 0,
      level2: 0,
      level3: 0,
      level4: 0,
      total: 0
    };

    userTransactions.forEach(transaction => {
      if (transaction.distribution.ddrLevel1) {
        ddrEarnings.level1 += transaction.distribution.ddrLevel1;
      }
      if (transaction.distribution.ddrLevel2) {
        ddrEarnings.level2 += transaction.distribution.ddrLevel2;
      }
      if (transaction.distribution.ddrLevel3) {
        ddrEarnings.level3 += transaction.distribution.ddrLevel3;
      }
      if (transaction.distribution.ddrLevel4) {
        ddrEarnings.level4 += transaction.distribution.ddrLevel4;
      }
    });

    ddrEarnings.total = ddrEarnings.level1 + ddrEarnings.level2 + ddrEarnings.level3 + ddrEarnings.level4;

    // Calculate qualification-based rewards (only show if qualified)
    const qualificationRewards = {};
    let totalQualificationEarnings = 0;

    if (userQualifications.crr) {
      const crrEarnings = userTransactions.reduce((sum, t) => sum + (t.distribution.crr || 0), 0);
      qualificationRewards.crr = crrEarnings;
      totalQualificationEarnings += crrEarnings;
    }

    if (userQualifications.bbr) {
      const bbrEarnings = userTransactions.reduce((sum, t) => sum + (t.distribution.bbr || 0), 0);
      qualificationRewards.bbr = bbrEarnings;
      totalQualificationEarnings += bbrEarnings;
    }

    if (userQualifications.hlr) {
      const hlrEarnings = userTransactions.reduce((sum, t) => sum + (t.distribution.hlr || 0), 0);
      qualificationRewards.hlr = hlrEarnings;
      totalQualificationEarnings += hlrEarnings;
    }

    if (userQualifications.regionalAmbassador) {
      const raEarnings = userTransactions.reduce((sum, t) => sum + (t.distribution.regionalAmbassador || 0), 0);
      qualificationRewards.regionalAmbassador = raEarnings;
      totalQualificationEarnings += raEarnings;
    }

    // Calculate other direct earnings
    const otherEarnings = {
      porparleTeam: userTransactions.reduce((sum, t) => sum + (t.distribution.porparleTeam || 0), 0),
      rop: userTransactions.reduce((sum, t) => sum + (t.distribution.rop || 0), 0),
      companyOperations: userTransactions.reduce((sum, t) => sum + (t.distribution.companyOperations || 0), 0),
      technologyPool: userTransactions.reduce((sum, t) => sum + (t.distribution.technologyPool || 0), 0),
      foundationPool: userTransactions.reduce((sum, t) => sum + (t.distribution.foundationPool || 0), 0),
      publicShare: userTransactions.reduce((sum, t) => sum + (t.distribution.publicShare || 0), 0),
      netProfit: userTransactions.reduce((sum, t) => sum + (t.distribution.netProfit || 0), 0)
    };

    const totalOtherEarnings = Object.values(otherEarnings).reduce((sum, val) => sum + val, 0);
    const totalUserEarnings = ddrEarnings.total + totalQualificationEarnings + totalOtherEarnings;

    // Prepare visible rewards list
    const visibleRewards = Object.keys(userQualifications).filter(key => userQualifications[key]);
    const hiddenRewards = Object.keys(userQualifications).filter(key => !userQualifications[key]);

    res.status(200).json({
      success: true,
      data: {
        userId,
        userQualifications,
        visibleRewards,
        hiddenRewards,
        earnings: {
          ddr: ddrEarnings,
          qualificationRewards: {
            ...qualificationRewards,
            total: totalQualificationEarnings,
            note: "Only qualified rewards are shown"
          },
          otherEarnings,
          totalEarnings: totalUserEarnings
        },
        totalTransactions: userTransactions.length,
        recentTransactions: userTransactions
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 10)
          .map(t => ({
            ...t,
            visibleDistribution: {
              ddr: {
                level1: t.distribution.ddrLevel1 || 0,
                level2: t.distribution.ddrLevel2 || 0,
                level3: t.distribution.ddrLevel3 || 0,
                level4: t.distribution.ddrLevel4 || 0
              },
              ...(userQualifications.crr && { crr: t.distribution.crr || 0 }),
              ...(userQualifications.bbr && { bbr: t.distribution.bbr || 0 }),
              ...(userQualifications.hlr && { hlr: t.distribution.hlr || 0 }),
              ...(userQualifications.regionalAmbassador && { regionalAmbassador: t.distribution.regionalAmbassador || 0 })
            }
          }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get MLM system
export const getMLM = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    res.status(200).json({
      success: true,
      data: mlm
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update MLM system
export const updateMLM = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Update any field that exists in the schema
    Object.keys(req.body).forEach(key => {
      if (mlm.schema.paths[key]) {
        mlm[key] = req.body[key];
      }
    });

    // Auto-adjust sub-distributions
    mlm.autoAdjustSubDistributions();

    // Save will trigger validation middleware
    await mlm.save();

    res.status(200).json({
      success: true,
      message: "MLM system updated successfully",
      data: mlm
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Update all MLM distributions in single call
export const updateAllMLMDistributions = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const {
      // Main distribution percentages
      ddr,
      crr,
      bbr,
      hlr,
      regionalAmbassador,
      porparleTeam,
      rop,
      companyOperations,
      technologyPool,
      foundationPool,
      publicShare,
      netProfit,
      
      // DDR sub-distributions
      ddrLevel1,
      ddrLevel2,
      ddrLevel3,
      ddrLevel4,
      
      // Porparle Team sub-distributions
      gc,
      la,
      ceo,
      coo,
      cmo,
      cfo,
      cto,
      chro,
      topTeamPerform,
      
      // Top Team Performance sub-distributions
      winner,
      fighter,
      
      // Company Operations sub-distributions
      operationExpense,
      organizationEvent,
      
      // Public Share sub-distributions
      chairmanFounder,
      shareholder1,
      shareholder2,
      shareholder3
    } = req.body;

    // Update main distribution percentages if provided
    if (ddr !== undefined) mlm.ddr = ddr;
    if (crr !== undefined) mlm.crr = crr;
    if (bbr !== undefined) mlm.bbr = bbr;
    if (hlr !== undefined) mlm.hlr = hlr;
    if (regionalAmbassador !== undefined) mlm.regionalAmbassador = regionalAmbassador;
    if (porparleTeam !== undefined) mlm.porparleTeam = porparleTeam;
    if (rop !== undefined) mlm.rop = rop;
    if (companyOperations !== undefined) mlm.companyOperations = companyOperations;
    if (technologyPool !== undefined) mlm.technologyPool = technologyPool;
    if (foundationPool !== undefined) mlm.foundationPool = foundationPool;
    if (publicShare !== undefined) mlm.publicShare = publicShare;
    if (netProfit !== undefined) mlm.netProfit = netProfit;

    // Update DDR sub-distributions if provided
    if (ddrLevel1 !== undefined) mlm.ddrLevel1 = ddrLevel1;
    if (ddrLevel2 !== undefined) mlm.ddrLevel2 = ddrLevel2;
    if (ddrLevel3 !== undefined) mlm.ddrLevel3 = ddrLevel3;
    if (ddrLevel4 !== undefined) mlm.ddrLevel4 = ddrLevel4;

    // Update Porparle Team sub-distributions if provided
    if (gc !== undefined) mlm.gc = gc;
    if (la !== undefined) mlm.la = la;
    if (ceo !== undefined) mlm.ceo = ceo;
    if (coo !== undefined) mlm.coo = coo;
    if (cmo !== undefined) mlm.cmo = cmo;
    if (cfo !== undefined) mlm.cfo = cfo;
    if (cto !== undefined) mlm.cto = cto;
    if (chro !== undefined) mlm.chro = chro;
    if (topTeamPerform !== undefined) mlm.topTeamPerform = topTeamPerform;

    // Update Top Team Performance sub-distributions if provided
    if (winner !== undefined) mlm.winner = winner;
    if (fighter !== undefined) mlm.fighter = fighter;

    // Update Company Operations sub-distributions if provided
    if (operationExpense !== undefined) mlm.operationExpense = operationExpense;
    if (organizationEvent !== undefined) mlm.organizationEvent = organizationEvent;

    // Update Public Share sub-distributions if provided
    if (chairmanFounder !== undefined) mlm.chairmanFounder = chairmanFounder;
    if (shareholder1 !== undefined) mlm.shareholder1 = shareholder1;
    if (shareholder2 !== undefined) mlm.shareholder2 = shareholder2;
    if (shareholder3 !== undefined) mlm.shareholder3 = shareholder3;

    // Normalize main distribution percentages to ensure they add up to 100%
    const mainFields = ['ddr', 'crr', 'bbr', 'hlr', 'regionalAmbassador', 'porparleTeam', 'rop', 'companyOperations', 'technologyPool', 'foundationPool', 'publicShare', 'netProfit'];
    const mainTotal = mainFields.reduce((sum, field) => sum + mlm[field], 0);
    
    console.log('Before normalization - Main total:', mainTotal);
    console.log('Before normalization - Values:', mainFields.map(field => `${field}: ${mlm[field]}`));
    
    if (Math.abs(mainTotal - 100) > 0.01) {
      // Normalize to 100%
      const ratio = 100 / mainTotal;
      mainFields.forEach(field => {
        mlm[field] = Math.round(mlm[field] * ratio * 100) / 100;
      });
      
      // Verify normalization worked
      const newTotal = mainFields.reduce((sum, field) => sum + mlm[field], 0);
      console.log('After normalization - New total:', newTotal);
      console.log('After normalization - Values:', mainFields.map(field => `${field}: ${mlm[field]}`));
      
      // Force exact 100% by adjusting the last field if needed
      if (Math.abs(newTotal - 100) > 0.01) {
        const lastField = mainFields[mainFields.length - 1];
        const adjustment = 100 - newTotal;
        mlm[lastField] = Math.round((mlm[lastField] + adjustment) * 100) / 100;
        console.log(`Adjusted ${lastField} by ${adjustment} to ensure 100% total`);
      }
    }

    // Auto-adjust sub-distributions to ensure they match their parent totals
    mlm.autoAdjustSubDistributions();
    
    // Additional normalization for sub-distributions to ensure they match their parent totals
    // DDR sub-distributions should equal DDR total
    if (mlm.ddr > 0) {
      const ddrSubTotal = mlm.ddrLevel1 + mlm.ddrLevel2 + mlm.ddrLevel3 + mlm.ddrLevel4;
      console.log(`DDR sub-total: ${ddrSubTotal}%, DDR total: ${mlm.ddr}%`);
      if (Math.abs(ddrSubTotal - mlm.ddr) > 0.01) {
        const ratio = mlm.ddr / ddrSubTotal;
        mlm.ddrLevel1 = Math.round((mlm.ddrLevel1 * ratio) * 100) / 100;
        mlm.ddrLevel2 = Math.round((mlm.ddrLevel2 * ratio) * 100) / 100;
        mlm.ddrLevel3 = Math.round((mlm.ddrLevel3 * ratio) * 100) / 100;
        mlm.ddrLevel4 = Math.round((mlm.ddrLevel4 * ratio) * 100) / 100;
        console.log(`Normalized DDR sub-distributions to match DDR total: ${mlm.ddr}%`);
        console.log(`New DDR levels: L1: ${mlm.ddrLevel1}%, L2: ${mlm.ddrLevel2}%, L3: ${mlm.ddrLevel3}%, L4: ${mlm.ddrLevel4}%`);
      }
    }
    
    // Porparle Team sub-distributions should equal porparleTeam total
    if (mlm.porparleTeam > 0) {
      const ptSubTotal = mlm.gc + mlm.la + mlm.ceo + mlm.coo + mlm.cmo + mlm.cfo + mlm.cto + mlm.chro + mlm.topTeamPerform;
      if (Math.abs(ptSubTotal - mlm.porparleTeam) > 0.01) {
        const ratio = mlm.porparleTeam / ptSubTotal;
        mlm.gc = Math.round((mlm.gc * ratio) * 100) / 100;
        mlm.la = Math.round((mlm.la * ratio) * 100) / 100;
        mlm.ceo = Math.round((mlm.ceo * ratio) * 100) / 100;
        mlm.coo = Math.round((mlm.coo * ratio) * 100) / 100;
        mlm.cmo = Math.round((mlm.cmo * ratio) * 100) / 100;
        mlm.cfo = Math.round((mlm.cfo * ratio) * 100) / 100;
        mlm.cto = Math.round((mlm.cto * ratio) * 100) / 100;
        mlm.chro = Math.round((mlm.chro * ratio) * 100) / 100;
        mlm.topTeamPerform = Math.round((mlm.topTeamPerform * ratio) * 100) / 100;
        console.log(`Normalized Porparle Team sub-distributions to match porparleTeam total: ${mlm.porparleTeam}%`);
      }
    }
    
    // Top Team Performance sub-distributions should equal topTeamPerform total
    if (mlm.topTeamPerform > 0) {
      const ttSubTotal = mlm.winner + mlm.fighter;
      if (Math.abs(ttSubTotal - mlm.topTeamPerform) > 0.01) {
        const ratio = mlm.topTeamPerform / ttSubTotal;
        mlm.winner = Math.round((mlm.winner * ratio) * 100) / 100;
        mlm.fighter = Math.round((mlm.fighter * ratio) * 100) / 100;
        console.log(`Normalized Top Team sub-distributions to match topTeamPerform total: ${mlm.topTeamPerform}%`);
      }
    }
    
    // Company Operations sub-distributions should equal companyOperations total
    if (mlm.companyOperations > 0) {
      const coSubTotal = mlm.operationExpense + mlm.organizationEvent;
      if (Math.abs(coSubTotal - mlm.companyOperations) > 0.01) {
        const ratio = mlm.companyOperations / coSubTotal;
        mlm.operationExpense = Math.round((mlm.operationExpense * ratio) * 100) / 100;
        mlm.organizationEvent = Math.round((mlm.organizationEvent * ratio) * 100) / 100;
        console.log(`Normalized Company Operations sub-distributions to match companyOperations total: ${mlm.companyOperations}%`);
      }
    }
    
    // Public Share sub-distributions should equal publicShare total
    if (mlm.publicShare > 0) {
      const psSubTotal = mlm.chairmanFounder + mlm.shareholder1 + mlm.shareholder2 + mlm.shareholder3;
      if (Math.abs(psSubTotal - mlm.publicShare) > 0.01) {
        const ratio = mlm.publicShare / psSubTotal;
        mlm.chairmanFounder = Math.round((mlm.chairmanFounder * ratio) * 100) / 100;
        mlm.shareholder1 = Math.round((mlm.shareholder1 * ratio) * 100) / 100;
        mlm.shareholder2 = Math.round((mlm.shareholder2 * ratio) * 100) / 100;
        mlm.shareholder3 = Math.round((mlm.shareholder3 * ratio) * 100) / 100;
        console.log(`Normalized Public Share sub-distributions to match publicShare total: ${mlm.publicShare}%`);
      }
    }
    
    // Final verification before save
    const finalTotal = mainFields.reduce((sum, field) => sum + mlm[field], 0);
    console.log('Final total before save:', finalTotal);
    if (Math.abs(finalTotal - 100) > 0.01) {
      console.log('WARNING: Total still not 100% after auto-adjustment!');
      // Force one more adjustment to ensure 100%
      const lastField = mainFields[mainFields.length - 1];
      const finalAdjustment = 100 - finalTotal;
      mlm[lastField] = Math.round((mlm[lastField] + finalAdjustment) * 100) / 100;
      console.log(`Final adjustment: ${lastField} by ${finalAdjustment}`);
      
      // Verify one more time
      const veryFinalTotal = mainFields.reduce((sum, field) => sum + mlm[field], 0);
      console.log('Very final total:', veryFinalTotal);
    }

    // Save will trigger validation middleware
    await mlm.save();

    res.status(200).json({
      success: true,
      message: "All MLM distributions updated successfully",
      data: {
        mainDistributions: {
          ddr: mlm.ddr,
          crr: mlm.crr,
          bbr: mlm.bbr,
          hlr: mlm.hlr,
          regionalAmbassador: mlm.regionalAmbassador,
          porparleTeam: mlm.porparleTeam,
          rop: mlm.rop,
          companyOperations: mlm.companyOperations,
          technologyPool: mlm.technologyPool,
          foundationPool: mlm.foundationPool,
          publicShare: mlm.publicShare,
          netProfit: mlm.netProfit
        },
        ddrSubDistributions: {
          ddrLevel1: mlm.ddrLevel1,
          ddrLevel2: mlm.ddrLevel2,
          ddrLevel3: mlm.ddrLevel3,
          ddrLevel4: mlm.ddrLevel4
        },
        porparleTeamSubDistributions: {
          gc: mlm.gc,
          la: mlm.la,
          ceo: mlm.ceo,
          coo: mlm.coo,
          cmo: mlm.cmo,
          cfo: mlm.cfo,
          cto: mlm.cto,
          chro: mlm.chro,
          topTeamPerform: mlm.topTeamPerform
        },
        topTeamSubDistributions: {
          winner: mlm.winner,
          fighter: mlm.fighter
        },
        companyOperationsSubDistributions: {
          operationExpense: mlm.operationExpense,
          organizationEvent: mlm.organizationEvent
        },
        publicShareSubDistributions: {
          chairmanFounder: mlm.chairmanFounder,
          shareholder1: mlm.shareholder1,
          shareholder2: mlm.shareholder2,
          shareholder3: mlm.shareholder3
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Get specific MLM fields
export const getMLMFields = asyncHandler(async (req, res) => {
  try {
    const { fields } = req.query;
    
    if (!fields) {
      return res.status(400).json({
        success: false,
        message: "Fields parameter is required"
      });
    }

    const mlm = await MLM.findOne();
    
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Parse fields (comma-separated)
    const fieldArray = fields.split(',').map(field => field.trim());
    
    // Filter MLM data to only include requested fields
    const filteredData = {};
    fieldArray.forEach(field => {
      if (mlm.schema.paths[field]) {
        filteredData[field] = mlm[field];
      }
    });

    res.status(200).json({
      success: true,
      data: filteredData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Add money to MLM system
export const addMoneyToMLM = asyncHandler(async (req, res) => {
  try {
    const { userId, amount, rideId } = req.body;

    if (!userId || !amount || !rideId) {
      return res.status(400).json({
        success: false,
        message: "userId, amount, and rideId are required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const distribution = mlm.addMoney(userId, amount, rideId);
    await mlm.save();

    res.status(200).json({
      success: true,
      message: "Money added to MLM system successfully",
      data: {
        distribution,
        totalAmount: mlm.totalAmount,
        currentBalances: mlm.currentBalances
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get user's MLM information
export const getUserMLMInfo = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const userTransactions = mlm.transactions.filter(
      t => t.userId.toString() === userId
    );

    const totalEarnings = userTransactions.reduce((sum, t) => sum + t.amount, 0);

    const userInfo = {
      userId: user._id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      level: user.level,
      sponsorBy: user.sponsorBy,
      directReferrals: Array.isArray(user.nextLevels) && user.nextLevels[0] ? user.nextLevels[0].length : user.directReferrals.length,
      level2Referrals: Array.isArray(user.nextLevels) && user.nextLevels[1] ? user.nextLevels[1].length : user.level2Referrals.length,
      level3Referrals: Array.isArray(user.nextLevels) && user.nextLevels[2] ? user.nextLevels[2].length : user.level3Referrals.length,
      level4Referrals: Array.isArray(user.nextLevels) && user.nextLevels[3] ? user.nextLevels[3].length : user.level4Referrals.length,
      totalReferrals: Array.isArray(user.nextLevels) ? user.nextLevels.reduce((sum, lvl) => sum + (lvl?.length || 0), 0) : (
        user.directReferrals.length + user.level2Referrals.length + user.level3Referrals.length + user.level4Referrals.length
      ),
      mlmEarnings: {
        totalEarnings,
        transactions: userTransactions,
        currentBalances: mlm.currentBalances
      }
    };

    res.status(200).json({
      success: true,
      data: userInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get MLM statistics
export const getMLMStats = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Get total users count
    const totalUsers = await User.countDocuments();
    
    // Get users with referrals
    const usersWithReferrals = await User.countDocuments({
      $or: [
        { directReferrals: { $exists: true, $ne: [] } },
        { level2Referrals: { $exists: true, $ne: [] } },
        { level3Referrals: { $exists: true, $ne: [] } },
        { level4Referrals: { $exists: true, $ne: [] } }
      ]
    });

    // Calculate total distributed amount
    const totalDistributed = mlm.currentBalances.ddr + 
                            mlm.currentBalances.crr + 
                            mlm.currentBalances.publicShare;

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        usersWithReferrals,
        totalDistributed,
        currentBalances: mlm.currentBalances,
        transactionCount: mlm.transactionHistory.length
      }
    });
  } catch (error) {
    console.error("Error getting MLM stats:", error);
    res.status(500).json({
      success: false,
      message: "Error getting MLM stats",
      error: error.message
    });
  }
});

// Distribute MLM earnings after ride completion (Dual-Tree System)
export const distributeDualTreeMLMEarnings = asyncHandler(async (req, res) => {
  try {
    const { userId, driverId, mlmAmount, rideId } = req.body;

    // Validate required fields
    if (!userId || !driverId || !mlmAmount || !rideId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: userId, driverId, mlmAmount, rideId"
      });
    }

    // Validate that mlmAmount is a positive number
    if (mlmAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "MLM amount must be greater than 0"
      });
    }

    // Distribute MLM earnings
    const result = await distributeDualTreeMLM(userId, driverId, mlmAmount, rideId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to distribute MLM earnings",
        error: result.error
      });
    }

    res.status(200).json({
      success: true,
      message: "MLM earnings distributed successfully",
      data: result.distribution
    });

  } catch (error) {
    console.error("Error distributing dual-tree MLM earnings:", error);
    res.status(500).json({
      success: false,
      message: "Error distributing MLM earnings",
      error: error.message
    });
  }
});

// Get user's MLM earnings summary
export const getUserMLMEarningsSummary = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }

    // Get user's MLM earnings
    const earnings = await getUserMLMEarnings(userId);

    res.status(200).json({
      success: true,
      data: earnings
    });

  } catch (error) {
    console.error("Error getting user MLM earnings:", error);
    res.status(500).json({
      success: false,
      message: "Error getting user MLM earnings",
      error: error.message
    });
  }
});

// Get MLM earnings statistics for admin
export const getMLMEarningsStats = asyncHandler(async (req, res) => {
  try {
    // Get total MLM earnings across all users
    const totalEarningsResult = await User.aggregate([
      {
        $match: {
          "mlmBalance.total": { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          totalMLMEarnings: { $sum: "$mlmBalance.total" },
          totalUserTreeEarnings: { $sum: "$mlmBalance.userTree" },
          totalDriverTreeEarnings: { $sum: "$mlmBalance.driverTree" },
          usersWithEarnings: { $sum: 1 }
        }
      }
    ]);

    // Get top earners
    const topEarners = await User.find(
      { "mlmBalance.total": { $gt: 0 } },
      { username: 1, firstName: 1, lastName: 1, mlmBalance: 1 }
    )
    .sort({ "mlmBalance.total": -1 })
    .limit(10);

    // Get recent transactions
    const recentTransactions = await User.aggregate([
      { $unwind: "$mlmBalance.transactions" },
      { $sort: { "mlmBalance.transactions.timestamp": -1 } },
      { $limit: 20 },
      {
        $project: {
          username: 1,
          firstName: 1,
          lastName: 1,
          transaction: "$mlmBalance.transactions"
        }
      }
    ]);

    const stats = totalEarningsResult[0] || {
      totalMLMEarnings: 0,
      totalUserTreeEarnings: 0,
      totalDriverTreeEarnings: 0,
      usersWithEarnings: 0
    };

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        topEarners,
        recentTransactions
      }
    });

  } catch (error) {
    console.error("Error getting MLM earnings stats:", error);
    res.status(500).json({
      success: false,
      message: "Error getting MLM earnings statistics",
      error: error.message
    });
  }
});

// ==================== BBR (Bonus Booster Rewards) Controllers ====================

// Get current BBR campaign
export const getCurrentBBRCampaign = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const currentCampaign = mlm.bbrCampaigns.current;
    if (!currentCampaign || !currentCampaign.isActive) {
      return res.status(404).json({
        success: false,
        message: "No active BBR campaign found"
      });
    }

    res.status(200).json({
      success: true,
      data: currentCampaign
    });
  } catch (error) {
    console.error("Error getting current BBR campaign:", error);
    res.status(500).json({
      success: false,
      message: "Error getting current BBR campaign",
      error: error.message
    });
  }
});

// Get user's BBR progress
export const getUserBBRProgress = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm || !mlm.bbrCampaigns.current || !mlm.bbrCampaigns.current.isActive) {
      return res.status(404).json({
        success: false,
        message: "No active BBR campaign found"
      });
    }

    const currentCampaign = mlm.bbrCampaigns.current;
    const userParticipation = user.bbrParticipation.currentCampaign;
    
    // Calculate progress
    const totalRides = userParticipation.ridesCompleted + userParticipation.teamRides;
    const progressPercentage = Math.min((totalRides / currentCampaign.requirement) * 100, 100);
    
    // Calculate time left
    const now = new Date();
    const timeLeft = currentCampaign.endDate - now;
    const daysLeft = Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24)));
    const hoursLeft = Math.max(0, Math.ceil((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
    
    // Calculate daily target
    const ridesNeeded = Math.max(0, currentCampaign.requirement - totalRides);
    const dailyTarget = daysLeft > 0 ? Math.ceil(ridesNeeded / daysLeft) : ridesNeeded;

    res.status(200).json({
      success: true,
      data: {
        campaign: currentCampaign,
        progress: {
          totalRides,
          userRides: userParticipation.ridesCompleted,
          teamRides: userParticipation.teamRides,
          progressPercentage,
          ridesNeeded,
          dailyTarget
        },
        timeLeft: {
          days: daysLeft,
          hours: hoursLeft
        },
        isQualified: totalRides >= currentCampaign.requirement
      }
    });
  } catch (error) {
    console.error("Error getting user BBR progress:", error);
    res.status(500).json({
      success: false,
      message: "Error getting user BBR progress",
      error: error.message
    });
  }
});

// Get BBR leaderboard
export const getBBRLeaderboard = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const mlm = await MLM.findOne();
    if (!mlm || !mlm.bbrCampaigns.current || !mlm.bbrCampaigns.current.isActive) {
      return res.status(404).json({
        success: false,
        message: "No active BBR campaign found"
      });
    }

    const currentCampaign = mlm.bbrCampaigns.current;
    
    // Get leaderboard data
    const leaderboard = await User.aggregate([
      {
        $match: {
          "bbrParticipation.currentCampaign.campaignId": currentCampaign._id
        }
      },
      {
        $addFields: {
          totalRides: {
            $add: [
              "$bbrParticipation.currentCampaign.ridesCompleted",
              "$bbrParticipation.currentCampaign.teamRides"
            ]
          }
        }
      },
      {
        $sort: { totalRides: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: limit
      },
      {
        $project: {
          username: 1,
          firstName: 1,
          lastName: 1,
          profilePicture: 1,
          totalRides: 1,
          isQualified: { $gte: ["$totalRides", currentCampaign.requirement] }
        }
      }
    ]);

    // Get user's position if userId provided
    let userPosition = null;
    if (userId) {
      const userRank = await User.aggregate([
        {
          $match: {
            "bbrParticipation.currentCampaign.campaignId": currentCampaign._id
          }
        },
        {
          $addFields: {
            totalRides: {
              $add: [
                "$bbrParticipation.currentCampaign.ridesCompleted",
                "$bbrParticipation.currentCampaign.teamRides"
              ]
            }
          }
        },
        {
          $sort: { totalRides: -1 }
        },
        {
          $group: {
            _id: null,
            users: { $push: { _id: "$_id", totalRides: "$totalRides" } }
          }
        },
        {
          $unwind: {
            path: "$users",
            includeArrayIndex: "position"
          }
        },
        {
          $match: {
            "users._id": new mongoose.Types.ObjectId(userId)
          }
        },
        {
          $project: {
            position: { $add: ["$position", 1] },
            totalRides: "$users.totalRides"
          }
        }
      ]);
      
      if (userRank.length > 0) {
        userPosition = userRank[0];
      }
    }

    res.status(200).json({
      success: true,
      data: {
        leaderboard,
        userPosition,
        campaign: currentCampaign,
        pagination: {
          page,
          limit,
          hasMore: leaderboard.length === limit
        }
      }
    });
  } catch (error) {
    console.error("Error getting BBR leaderboard:", error);
    res.status(500).json({
      success: false,
      message: "Error getting BBR leaderboard",
      error: error.message
    });
  }
});

// Get user's past BBR wins
export const getPastBBRWins = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Get past wins from user's BBR history
    const pastWins = user.bbrParticipation.history
      .filter(campaign => campaign.isWinner)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
      .slice(skip, skip + limit);

    res.status(200).json({
      success: true,
      data: {
        pastWins,
        pagination: {
          page,
          limit,
          total: user.bbrParticipation.history.filter(c => c.isWinner).length,
          hasMore: pastWins.length === limit
        }
      }
    });
  } catch (error) {
    console.error("Error getting past BBR wins:", error);
    res.status(500).json({
      success: false,
      message: "Error getting past BBR wins",
      error: error.message
    });
  }
});

// Get BBR tips
export const getBBRTips = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    res.status(200).json({
      success: true,
      data: mlm.bbrTips || []
    });
  } catch (error) {
    console.error("Error getting BBR tips:", error);
    res.status(500).json({
      success: false,
      message: "Error getting BBR tips",
      error: error.message
    });
  }
});

// Admin: Create new BBR campaign
export const createBBRCampaign = asyncHandler(async (req, res) => {
  try {
    const { name, requirement, duration, reward, type, description } = req.body;
    
    if (!name || !requirement || !duration || !reward || !type) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, requirement, duration, reward, type"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // End current campaign if active
    if (mlm.bbrCampaigns.current && mlm.bbrCampaigns.current.isActive) {
      mlm.bbrCampaigns.current.isActive = false;
      mlm.bbrCampaigns.current.endDate = new Date();
      mlm.bbrCampaigns.past.push(mlm.bbrCampaigns.current);
    }

    // Create new campaign
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + (duration * 24 * 60 * 60 * 1000));
    
    const newCampaign = {
      _id: new mongoose.Types.ObjectId(),
      name,
      requirement,
      duration,
      startDate,
      endDate,
      reward,
      type,
      description: description || '',
      isActive: true,
      participants: [],
      winners: []
    };

    mlm.bbrCampaigns.current = newCampaign;
    await mlm.save();

    res.status(201).json({
      success: true,
      message: "BBR campaign created successfully",
      data: newCampaign
    });
  } catch (error) {
    console.error("Error creating BBR campaign:", error);
    res.status(500).json({
      success: false,
      message: "Error creating BBR campaign",
      error: error.message
    });
  }
});

// Admin: Update BBR tips
export const updateBBRTips = asyncHandler(async (req, res) => {
  try {
    const { tips } = req.body;
    
    if (!Array.isArray(tips)) {
      return res.status(400).json({
        success: false,
        message: "Tips must be an array"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    mlm.bbrTips = tips;
    await mlm.save();

    res.status(200).json({
      success: true,
      message: "BBR tips updated successfully",
      data: tips
    });
  } catch (error) {
    console.error("Error updating BBR tips:", error);
    res.status(500).json({
      success: false,
      message: "Error updating BBR tips",
      error: error.message
    });
  }
});

// ==================== HLR (HonorPay Loyalty Rewards) Controllers ====================

// Get user's HLR progress
export const getUserHLRProgress = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const hlrConfig = mlm.hlrConfig;
    const userQualification = user.hlrQualification;
    
    // Calculate progress percentages
    const pgpProgress = Math.min((userQualification.currentPGP / hlrConfig.requiredPGP) * 100, 100);
    const tgpProgress = Math.min((userQualification.currentTGP / hlrConfig.requiredTGP) * 100, 100);
    const overallProgress = Math.min(((pgpProgress + tgpProgress) / 2), 100);
    
    // Check if user is qualified
    const isQualified = userQualification.currentPGP >= hlrConfig.requiredPGP && 
                       userQualification.currentTGP >= hlrConfig.requiredTGP;
    
    // Calculate age and retirement eligibility
    const currentAge = user.dateOfBirth ? 
      Math.floor((new Date() - new Date(user.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000)) : 0;
    const isRetirementEligible = currentAge >= hlrConfig.retirementAge;

    res.status(200).json({
      success: true,
      data: {
        requirements: {
          requiredPGP: hlrConfig.requiredPGP,
          requiredTGP: hlrConfig.requiredTGP,
          retirementAge: hlrConfig.retirementAge,
          rewardAmount: hlrConfig.rewardAmount
        },
        progress: {
          currentPGP: userQualification.currentPGP,
          currentTGP: userQualification.currentTGP,
          pgpProgress,
          tgpProgress,
          overallProgress
        },
        eligibility: {
          isQualified,
          isRetirementEligible,
          currentAge,
          canClaimReward: isQualified && isRetirementEligible
        },
        qualification: userQualification
      }
    });
  } catch (error) {
    console.error("Error getting user HLR progress:", error);
    res.status(500).json({
      success: false,
      message: "Error getting user HLR progress",
      error: error.message
    });
  }
});

// Get HLR qualified members leaderboard
export const getHLRQualifiedMembers = asyncHandler(async (req, res) => {
  try {
    const { country } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const hlrConfig = mlm.hlrConfig;
    
    // Build match criteria
    const matchCriteria = {
      "hlrQualification.isQualified": true,
      $expr: {
        $and: [
          { $gte: ["$hlrQualification.currentPGP", hlrConfig.requiredPGP] },
          { $gte: ["$hlrQualification.currentTGP", hlrConfig.requiredTGP] }
        ]
      }
    };

    // Add country filter if specified
    if (country) {
      matchCriteria.country = country;
    }
    
    // Get qualified members
    const qualifiedMembers = await User.aggregate([
      {
        $match: matchCriteria
      },
      {
        $addFields: {
          totalPoints: {
            $add: ["$hlrQualification.currentPGP", "$hlrQualification.currentTGP"]
          }
        }
      },
      {
        $sort: { totalPoints: -1, "hlrQualification.qualifiedAt": 1 }
      },
      {
        $skip: skip
      },
      {
        $limit: limit
      },
      {
        $project: {
          username: 1,
          firstName: 1,
          lastName: 1,
          country: 1,
          profilePicture: 1,
          "hlrQualification.currentPGP": 1,
          "hlrQualification.currentTGP": 1,
          "hlrQualification.qualifiedAt": 1,
          "hlrQualification.rewardClaimed": 1,
          totalPoints: 1
        }
      }
    ]);

    // Get total count of qualified members
    const totalQualified = await User.countDocuments(matchCriteria);

    res.status(200).json({
      success: true,
      data: {
        qualifiedMembers,
        totalQualified,
        requirements: {
          requiredPGP: hlrConfig.requiredPGP,
          requiredTGP: hlrConfig.requiredTGP,
          rewardAmount: hlrConfig.rewardAmount
        },
        pagination: {
          page,
          limit,
          total: totalQualified,
          hasMore: qualifiedMembers.length === limit
        }
      }
    });
  } catch (error) {
    console.error("Error getting HLR qualified members:", error);
    res.status(500).json({
      success: false,
      message: "Error getting HLR qualified members",
      error: error.message
    });
  }
});

// Process HLR reward (for retirement or death)
export const processHLRReward = asyncHandler(async (req, res) => {
  try {
    const { userId, reason } = req.body; // reason: 'retirement' or 'death'
    
    if (!userId || !reason || !['retirement', 'death'].includes(reason)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId or reason. Reason must be 'retirement' or 'death'"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const hlrConfig = mlm.hlrConfig;
    const userQualification = user.hlrQualification;
    
    // Check if user is qualified
    const isQualified = userQualification.currentPGP >= hlrConfig.requiredPGP && 
                       userQualification.currentTGP >= hlrConfig.requiredTGP;
    
    if (!isQualified) {
      return res.status(400).json({
        success: false,
        message: "User does not meet HLR qualification requirements"
      });
    }

    // Check if reward already claimed
    if (userQualification.rewardClaimed) {
      return res.status(400).json({
        success: false,
        message: "HLR reward has already been claimed"
      });
    }

    // For retirement, check age
    if (reason === 'retirement') {
      const currentAge = user.dateOfBirth ? 
        Math.floor((new Date() - new Date(user.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000)) : 0;
      
      if (currentAge < hlrConfig.retirementAge) {
        return res.status(400).json({
          success: false,
          message: `User must be at least ${hlrConfig.retirementAge} years old for retirement reward`
        });
      }
    }

    // Process the reward
    user.hlrQualification.rewardClaimed = true;
    user.hlrQualification.rewardClaimedAt = new Date();
    user.hlrQualification.rewardReason = reason;
    user.hlrQualification.rewardAmount = hlrConfig.rewardAmount;
    
    // Add to user's wallet
    user.wallet.balance += hlrConfig.rewardAmount;
    user.wallet.transactions.push({
      type: 'credit',
      amount: hlrConfig.rewardAmount,
      description: `HLR reward for ${reason}`,
      timestamp: new Date()
    });

    await user.save();

    res.status(200).json({
      success: true,
      message: "HLR reward processed successfully",
      data: {
        rewardAmount: hlrConfig.rewardAmount,
        reason,
        claimedAt: user.hlrQualification.rewardClaimedAt
      }
    });
  } catch (error) {
    console.error("Error processing HLR reward:", error);
    res.status(500).json({
      success: false,
      message: "Error processing HLR reward",
      error: error.message
    });
  }
});

// Get HLR tips
export const getHLRTips = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    res.status(200).json({
      success: true,
      data: mlm.hlrConfig.tips || []
    });
  } catch (error) {
    console.error("Error getting HLR tips:", error);
    res.status(500).json({
      success: false,
      message: "Error getting HLR tips",
      error: error.message
    });
  }
});

// Admin: Update HLR configuration
export const updateHLRConfig = asyncHandler(async (req, res) => {
  try {
    const { requiredPGP, requiredTGP, retirementAge, rewardAmount, tips } = req.body;
    
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Update configuration
    if (requiredPGP !== undefined) mlm.hlrConfig.requiredPGP = requiredPGP;
    if (requiredTGP !== undefined) mlm.hlrConfig.requiredTGP = requiredTGP;
    if (retirementAge !== undefined) mlm.hlrConfig.retirementAge = retirementAge;
    if (rewardAmount !== undefined) mlm.hlrConfig.rewardAmount = rewardAmount;
    if (tips !== undefined) mlm.hlrConfig.tips = tips;

    await mlm.save();

    res.status(200).json({
      success: true,
      message: "HLR configuration updated successfully",
      data: mlm.hlrConfig
    });
  } catch (error) {
    console.error("Error updating HLR configuration:", error);
    res.status(500).json({
      success: false,
      message: "Error updating HLR configuration",
      error: error.message
    });
  }
});

// ==================== Regional Ambassador Controllers ====================

// Get user's Regional Ambassador progress
export const getUserRegionalProgress = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const regionalConfig = mlm.regionalAmbassadorConfig;
    const userRegional = user.regionalAmbassador;
    
    // Find current rank details
    const currentRankDetails = regionalConfig.ranks.find(rank => rank.name === userRegional.currentRank);
    const nextRankDetails = regionalConfig.ranks.find(rank => rank.level === (currentRankDetails?.level + 1));
    
    // Calculate progress to next rank
    let progressPercentage = 0;
    if (nextRankDetails) {
      progressPercentage = Math.min((userRegional.totalEarnings / nextRankDetails.requiredEarnings) * 100, 100);
    } else {
      progressPercentage = 100; // Already at highest rank
    }
    
    // Get current title holder for user's country
    const titleHolder = regionalConfig.ambassadors.find(amb => amb.country === user.country);

    res.status(200).json({
      success: true,
      data: {
        totalEarnings: userRegional.totalEarnings,
        titleHolder: titleHolder || null,
        currentRank: {
          name: userRegional.currentRank,
          level: currentRankDetails?.level || 1,
          country: user.country
        },
        nextRank: nextRankDetails ? {
          name: nextRankDetails.name,
          level: nextRankDetails.level,
          requiredEarnings: nextRankDetails.requiredEarnings
        } : null,
        progress: {
          percentage: progressPercentage,
          earningsNeeded: nextRankDetails ? Math.max(0, nextRankDetails.requiredEarnings - userRegional.totalEarnings) : 0
        },
        rankHistory: userRegional.rankHistory.sort((a, b) => new Date(b.achievedAt) - new Date(a.achievedAt))
      }
    });
  } catch (error) {
    console.error("Error getting user regional progress:", error);
    res.status(500).json({
      success: false,
      message: "Error getting user regional progress",
      error: error.message
    });
  }
});

// Get Regional Ambassador leaderboard
export const getRegionalLeaderboard = asyncHandler(async (req, res) => {
  try {
    const { country, userId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (!country) {
      return res.status(400).json({
        success: false,
        message: "Country parameter is required"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const regionalConfig = mlm.regionalAmbassadorConfig;
    
    // Get leaderboard for specific country
    const leaderboard = await User.aggregate([
      {
        $match: {
          country: country,
          "regionalAmbassador.totalEarnings": { $gt: 0 }
        }
      },
      {
        $addFields: {
          currentRankLevel: {
            $let: {
              vars: {
                rankDetails: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: regionalConfig.ranks,
                        cond: { $eq: ["$$this.name", "$regionalAmbassador.currentRank"] }
                      }
                    },
                    0
                  ]
                }
              },
              in: "$$rankDetails.level"
            }
          }
        }
      },
      {
        $sort: {
          "regionalAmbassador.totalEarnings": -1,
          currentRankLevel: -1
        }
      },
      {
        $skip: skip
      },
      {
        $limit: limit
      },
      {
        $project: {
          username: 1,
          firstName: 1,
          lastName: 1,
          profilePicture: 1,
          country: 1,
          "regionalAmbassador.currentRank": 1,
          "regionalAmbassador.totalEarnings": 1,
          currentRankLevel: 1
        }
      }
    ]);

    // Get user's position if userId provided
    let userPosition = null;
    if (userId) {
      const userRank = await User.aggregate([
        {
          $match: {
            country: country,
            "regionalAmbassador.totalEarnings": { $gt: 0 }
          }
        },
        {
          $addFields: {
            currentRankLevel: {
              $let: {
                vars: {
                  rankDetails: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: regionalConfig.ranks,
                          cond: { $eq: ["$$this.name", "$regionalAmbassador.currentRank"] }
                        }
                      },
                      0
                    ]
                  }
                },
                in: "$$rankDetails.level"
              }
            }
          }
        },
        {
          $sort: {
            "regionalAmbassador.totalEarnings": -1,
            currentRankLevel: -1
          }
        },
        {
          $group: {
            _id: null,
            users: { $push: { _id: "$_id", totalEarnings: "$regionalAmbassador.totalEarnings" } }
          }
        },
        {
          $unwind: {
            path: "$users",
            includeArrayIndex: "position"
          }
        },
        {
          $match: {
            "users._id": new mongoose.Types.ObjectId(userId)
          }
        },
        {
          $project: {
            position: { $add: ["$position", 1] },
            totalEarnings: "$users.totalEarnings"
          }
        }
      ]);
      
      if (userRank.length > 0) {
        userPosition = userRank[0];
      }
    }

    res.status(200).json({
      success: true,
      data: {
        leaderboard,
        userPosition,
        country,
        ranks: regionalConfig.ranks,
        pagination: {
          page,
          limit,
          hasMore: leaderboard.length === limit
        }
      }
    });
  } catch (error) {
    console.error("Error getting regional leaderboard:", error);
    res.status(500).json({
      success: false,
      message: "Error getting regional leaderboard",
      error: error.message
    });
  }
});

// Get Global Ambassadors list
export const getGlobalAmbassadors = asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const ambassadors = mlm.regionalAmbassadorConfig.ambassadors
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
      .slice(skip, skip + limit);

    res.status(200).json({
      success: true,
      data: {
        ambassadors,
        pagination: {
          page,
          limit,
          total: mlm.regionalAmbassadorConfig.ambassadors.length,
          hasMore: ambassadors.length === limit
        }
      }
    });
  } catch (error) {
    console.error("Error getting global ambassadors:", error);
    res.status(500).json({
      success: false,
      message: "Error getting global ambassadors",
      error: error.message
    });
  }
});

// Handle country update request
export const handleCountryUpdateRequest = asyncHandler(async (req, res) => {
  try {
    const { userId, newCountry, reason } = req.body;
    
    if (!userId || !newCountry) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: userId, newCountry"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Check if there's already a pending request
    const existingRequest = mlm.regionalAmbassadorConfig.countryUpdateRequests.find(
      req => req.userId.toString() === userId && req.status === 'pending'
    );

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending country update request"
      });
    }

    // Create new country update request
    const newRequest = {
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(userId),
      currentCountry: user.country,
      requestedCountry: newCountry,
      reason: reason || '',
      status: 'pending',
      requestedAt: new Date()
    };

    mlm.regionalAmbassadorConfig.countryUpdateRequests.push(newRequest);
    await mlm.save();

    res.status(201).json({
      success: true,
      message: "Country update request submitted successfully",
      data: newRequest
    });
  } catch (error) {
    console.error("Error handling country update request:", error);
    res.status(500).json({
      success: false,
      message: "Error handling country update request",
      error: error.message
    });
  }
});

// Admin: Approve/Reject country update request
export const processCountryUpdateRequest = asyncHandler(async (req, res) => {
  try {
    const { requestId, action, adminNotes } = req.body; // action: 'approve' or 'reject'
    
    if (!requestId || !action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid requestId or action. Action must be 'approve' or 'reject'"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const request = mlm.regionalAmbassadorConfig.countryUpdateRequests.find(
      req => req._id.toString() === requestId
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Country update request not found"
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: "Request has already been processed"
      });
    }

    // Update request status
    request.status = action === 'approve' ? 'approved' : 'rejected';
    request.processedAt = new Date();
    request.adminNotes = adminNotes || '';

    // If approved, update user's country
    if (action === 'approve') {
      const user = await User.findById(request.userId);
      if (user) {
        user.country = request.requestedCountry;
        await user.save();
      }
    }

    await mlm.save();

    res.status(200).json({
      success: true,
      message: `Country update request ${action}d successfully`,
      data: request
    });
  } catch (error) {
    console.error("Error processing country update request:", error);
    res.status(500).json({
      success: false,
      message: "Error processing country update request",
      error: error.message
    });
  }
});

// Admin: Update Regional Ambassador configuration
export const updateRegionalAmbassadorConfig = asyncHandler(async (req, res) => {
  try {
    const { ranks, ambassadors } = req.body;
    
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Update configuration
    if (ranks !== undefined) mlm.regionalAmbassadorConfig.ranks = ranks;
    if (ambassadors !== undefined) mlm.regionalAmbassadorConfig.ambassadors = ambassadors;

    await mlm.save();

    res.status(200).json({
      success: true,
      message: "Regional Ambassador configuration updated successfully",
      data: mlm.regionalAmbassadorConfig
    });
  } catch (error) {
    console.error("Error updating Regional Ambassador configuration:", error);
    res.status(500).json({
      success: false,
      message: "Error updating Regional Ambassador configuration",
      error: error.message
    });
  }
});

// ==================== ADMIN MLM INITIALIZATION FUNCTIONS ====================

// Admin: Initialize complete MLM system with all configurations
export const initializeCompleteMLMSystem = asyncHandler(async (req, res) => {
  try {
    // Check if MLM system already exists
    const existingMLM = await MLM.findOne();
    if (existingMLM) {
      return res.status(400).json({
        success: false,
        message: "MLM system already exists. Use update endpoints to modify configurations."
      });
    }

    const { name } = req.body;
    
    // Create MLM system with comprehensive default configurations
    const mlm = new MLM({
      name: name || "AAAO MLM System",
      // Main distribution percentages
      ddr: 24,
      crr: 13.3,
      bbr: 6,
      hlr: 6.7,
      regionalAmbassador: 0.4,
      porparleTeam: 10,
      rop: 3,
      companyOperations: 3,
      technologyPool: 2.6,
      foundationPool: 1,
      publicShare: 15,
      netProfit: 15,
      
      // DDR sub-distributions
      ddrLevel1: 40,
      ddrLevel2: 30,
      ddrLevel3: 20,
      ddrLevel4: 10,
      
      // CRR sub-distributions
      gc: 15,
      la: 15,
      ceo: 10,
      coo: 10,
      cmo: 10,
      cfo: 10,
      cto: 10,
      chro: 10,
      topTeamPerform: 5,
      winner: 2.5,
      fighter: 2.5,
      
      // Company operations sub-distributions
      operationExpense: 70,
      organizationEvent: 30,
      
      // Foundation pool sub-distributions
      chairmanFounder: 40,
      shareholder1: 20,
      shareholder2: 20,
      shareholder3: 20,
      
      totalMLMAmount: 0,
      currentBalances: {
        ddr: 0, crr: 0, bbr: 0, hlr: 0, regionalAmbassador: 0,
        porparleTeam: 0, rop: 0, companyOperations: 0, technologyPool: 0,
        foundationPool: 0, publicShare: 0, netProfit: 0,
        ddrLevel1: 0, ddrLevel2: 0, ddrLevel3: 0, ddrLevel4: 0,
        gc: 0, la: 0, ceo: 0, coo: 0, cmo: 0, cfo: 0, cto: 0, chro: 0,
        topTeamPerform: 0, winner: 0, fighter: 0, operationExpense: 0,
        organizationEvent: 0, chairmanFounder: 0, shareholder1: 0,
        shareholder2: 0, shareholder3: 0
      },
      
      // Initialize BBR with default campaign
      bbrCampaigns: [{
        _id: new mongoose.Types.ObjectId(),
        name: "Welcome Bonus Campaign",
        description: "Complete rides to earn bonus rewards!",
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        targetRides: 50,
        rewardAmount: 1000,
        isActive: true,
        participants: [],
        winners: []
      }],
      
      bbrTips: [
        "Complete more rides to climb the leaderboard!",
        "Consistency is key - aim for daily ride targets.",
        "Check your progress regularly to stay motivated.",
        "Bonus campaigns offer extra earning opportunities."
      ],
      
      // Initialize HLR configuration
      hlrConfig: {
        retirementAge: 60,
        pgpRequirement: 500000,
        tgpRequirement: 1000000,
        retirementReward: 50000,
        deathReward: 100000,
        qualificationPeriodMonths: 12
      },
      
      hlrTips: [
        "Build your PGP through personal ride completions.",
        "Grow your TGP by building a strong team.",
        "Qualify for retirement benefits at age 60.",
        "HLR provides long-term financial security."
      ],
      
      // Initialize Regional Ambassador configuration
      regionalAmbassadorConfig: {
        ranks: new Map([
          ['Challenger', { level: 1, minProgress: 10000 }],
          ['Warrior', { level: 2, minProgress: 50000 }],
          ['Tycoon', { level: 3, minProgress: 100000 }],
          ['Champion', { level: 4, minProgress: 250000 }],
          ['Boss', { level: 5, minProgress: 500000 }]
        ]),
        ambassadors: [],
        countryUpdateRequests: []
      },
      
      transactions: [],
      isActive: true,
      lastUpdated: new Date()
    });

    await mlm.save();

    res.status(201).json({
      success: true,
      message: "Complete MLM system initialized successfully with all configurations",
      data: {
        mlmId: mlm._id,
        name: mlm.name,
        distributionPercentages: {
          ddr: mlm.ddr,
          crr: mlm.crr,
          bbr: mlm.bbr,
          hlr: mlm.hlr,
          regionalAmbassador: mlm.regionalAmbassador
        },
        bbrCampaigns: mlm.bbrCampaigns.length,
        hlrConfig: mlm.hlrConfig,
        regionalAmbassadorRanks: Object.fromEntries(mlm.regionalAmbassadorConfig.ranks),
        isActive: mlm.isActive
      }
    });
  } catch (error) {
    console.error("Error initializing MLM system:", error);
    res.status(500).json({
      success: false,
      message: "Error initializing MLM system",
      error: error.message
    });
  }
});

// Admin: Get complete MLM system status
export const getMLMSystemStatus = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found. Please initialize the system first."
      });
    }

    // Get user statistics
    const totalUsers = await User.countDocuments();
    const usersWithReferrals = await User.countDocuments({ 'mlm.totalReferrals': { $gt: 0 } });
    const qualifiedHLRUsers = await User.countDocuments({ 'hlrQualification.isQualified': true });
    const regionalAmbassadors = await User.countDocuments({ 'regionalAmbassador.rank': { $exists: true, $ne: null } });
    
    // Get active BBR participants
    const activeBBRCampaign = mlm.bbrCampaigns.find(campaign => campaign.isActive);
    const activeBBRParticipants = activeBBRCampaign ? activeBBRCampaign.participants.length : 0;

    res.status(200).json({
      success: true,
      data: {
        systemInfo: {
          name: mlm.name,
          isActive: mlm.isActive,
          totalMLMAmount: mlm.totalMLMAmount,
          lastUpdated: mlm.lastUpdated
        },
        distributionPercentages: {
          ddr: mlm.ddr,
          crr: mlm.crr,
          bbr: mlm.bbr,
          hlr: mlm.hlr,
          regionalAmbassador: mlm.regionalAmbassador,
          porparleTeam: mlm.porparleTeam,
          rop: mlm.rop,
          companyOperations: mlm.companyOperations,
          technologyPool: mlm.technologyPool,
          foundationPool: mlm.foundationPool,
          publicShare: mlm.publicShare,
          netProfit: mlm.netProfit
        },
        currentBalances: mlm.currentBalances,
        userStatistics: {
          totalUsers,
          usersWithReferrals,
          qualifiedHLRUsers,
          regionalAmbassadors,
          activeBBRParticipants
        },
        systemComponents: {
          bbrCampaigns: {
            total: mlm.bbrCampaigns.length,
            active: mlm.bbrCampaigns.filter(c => c.isActive).length,
            tips: mlm.bbrTips.length
          },
          hlrConfig: {
            retirementAge: mlm.hlrConfig.retirementAge,
            pgpRequirement: mlm.hlrConfig.pgpRequirement,
            tgpRequirement: mlm.hlrConfig.tgpRequirement,
            tips: mlm.hlrTips.length
          },
          regionalAmbassador: {
            ranks: Object.fromEntries(mlm.regionalAmbassadorConfig.ranks),
            ambassadors: mlm.regionalAmbassadorConfig.ambassadors.length,
            pendingRequests: mlm.regionalAmbassadorConfig.countryUpdateRequests.filter(r => r.status === 'pending').length
          }
        },
        recentActivity: {
          totalTransactions: mlm.transactions.length,
          recentTransactions: mlm.transactions.slice(-5).map(t => ({
            amount: t.amount,
            timestamp: t.timestamp,
            rideId: t.rideId
          }))
        }
      }
    });
  } catch (error) {
    console.error("Error getting MLM system status:", error);
    res.status(500).json({
      success: false,
      message: "Error getting MLM system status",
      error: error.message
    });
  }
});

// Admin: Reset and reinitialize MLM system
export const resetAndReinitializeMLM = asyncHandler(async (req, res) => {
  try {
    const { confirmReset } = req.body;
    
    if (!confirmReset) {
      return res.status(400).json({
        success: false,
        message: "Please confirm reset by setting confirmReset to true. This will delete all MLM data."
      });
    }

    // Delete existing MLM system
    await MLM.deleteMany({});
    
    // Reset all user MLM data
    await User.updateMany({}, {
      $unset: {
        'bbrParticipation': 1,
        'hlrQualification': 1,
        'regionalAmbassador': 1
      },
      $set: {
        'mlm.totalEarnings': 0,
        'mlm.totalReferrals': 0,
        'mlm.level': 1,
        'mlm.qualificationPoints.pgp': 0,
        'mlm.qualificationPoints.tgp': 0,
        'mlm.qualificationPoints.history': []
      }
    });

    // Reinitialize with default configuration
    const mlm = new MLM({
      name: "AAAO MLM System (Reinitialized)",
      ddr: 24, crr: 13.3, bbr: 6, hlr: 6.7, regionalAmbassador: 0.4,
      porparleTeam: 10, rop: 3, companyOperations: 3, technologyPool: 2.6,
      foundationPool: 1, publicShare: 15, netProfit: 15,
      ddrLevel1: 40, ddrLevel2: 30, ddrLevel3: 20, ddrLevel4: 10,
      gc: 15, la: 15, ceo: 10, coo: 10, cmo: 10, cfo: 10, cto: 10, chro: 10,
      topTeamPerform: 5, winner: 2.5, fighter: 2.5,
      operationExpense: 70, organizationEvent: 30,
      chairmanFounder: 40, shareholder1: 20, shareholder2: 20, shareholder3: 20,
      totalMLMAmount: 0,
      currentBalances: {
        ddr: 0, crr: 0, bbr: 0, hlr: 0, regionalAmbassador: 0,
        porparleTeam: 0, rop: 0, companyOperations: 0, technologyPool: 0,
        foundationPool: 0, publicShare: 0, netProfit: 0,
        ddrLevel1: 0, ddrLevel2: 0, ddrLevel3: 0, ddrLevel4: 0,
        gc: 0, la: 0, ceo: 0, coo: 0, cmo: 0, cfo: 0, cto: 0, chro: 0,
        topTeamPerform: 0, winner: 0, fighter: 0, operationExpense: 0,
        organizationEvent: 0, chairmanFounder: 0, shareholder1: 0,
        shareholder2: 0, shareholder3: 0
      },
      bbrCampaigns: [{
        _id: new mongoose.Types.ObjectId(),
        name: "Fresh Start Campaign",
        description: "New beginning, new opportunities!",
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        targetRides: 50,
        rewardAmount: 1000,
        isActive: true,
        participants: [],
        winners: []
      }],
      bbrTips: [
        "Fresh start - make the most of it!",
        "Build momentum with consistent rides.",
        "Track your progress daily.",
        "New campaigns bring new opportunities."
      ],
      hlrConfig: {
        retirementAge: 60,
        pgpRequirement: 500000,
        tgpRequirement: 1000000,
        retirementReward: 50000,
        deathReward: 100000,
        qualificationPeriodMonths: 12
      },
      hlrTips: [
        "Start building your qualification points today.",
        "Personal and team growth both matter.",
        "Plan for your financial future.",
        "Every ride counts towards your goals."
      ],
      regionalAmbassadorConfig: {
        ranks: new Map([
          ['Challenger', { level: 1, minProgress: 10000 }],
          ['Warrior', { level: 2, minProgress: 50000 }],
          ['Tycoon', { level: 3, minProgress: 100000 }],
          ['Champion', { level: 4, minProgress: 250000 }],
          ['Boss', { level: 5, minProgress: 500000 }]
        ]),
        ambassadors: [],
        countryUpdateRequests: []
      },
      transactions: [],
      isActive: true,
      lastUpdated: new Date()
    });

    await mlm.save();

    res.status(200).json({
      success: true,
      message: "MLM system reset and reinitialized successfully",
      data: {
        mlmId: mlm._id,
        name: mlm.name,
        resetTimestamp: new Date(),
        usersReset: true,
        systemReady: true
      }
    });
  } catch (error) {
    console.error("Error resetting MLM system:", error);
    res.status(500).json({
      success: false,
      message: "Error resetting MLM system",
      error: error.message
    });
  }
});