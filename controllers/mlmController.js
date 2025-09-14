import MLM from "../models/mlmModel.js";
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import { distributeDualTreeMLM, getUserMLMEarnings, getUplineMembers } from "../utils/mlmHelper.js";

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

// Cleanup duplicate transactions (Admin only)
export const cleanupDuplicateTransactions = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Group transactions by rideId and userId
    const transactionGroups = {};
    mlm.transactions.forEach((transaction, index) => {
      const key = `${transaction.rideId}_${transaction.userId}`;
      if (!transactionGroups[key]) {
        transactionGroups[key] = [];
      }
      transactionGroups[key].push({ transaction, index });
    });

    // Find duplicates and keep only the latest one
    let duplicatesRemoved = 0;
    const indicesToRemove = [];
    
    Object.keys(transactionGroups).forEach(key => {
      const group = transactionGroups[key];
      if (group.length > 1) {
        // Sort by timestamp, keep the latest
        group.sort((a, b) => new Date(b.transaction.timestamp) - new Date(a.transaction.timestamp));
        // Mark older transactions for removal
        for (let i = 1; i < group.length; i++) {
          indicesToRemove.push(group[i].index);
          duplicatesRemoved++;
        }
      }
    });

    // Remove duplicates (in reverse order to maintain indices)
    indicesToRemove.sort((a, b) => b - a);
    indicesToRemove.forEach(index => {
      mlm.transactions.splice(index, 1);
    });

    // Recalculate balances
    mlm.currentBalances = {};
    mlm.totalAmount = 0;
    
    mlm.transactions.forEach(transaction => {
      mlm.totalAmount += transaction.amount;
      
      // Update balances
      Object.keys(transaction.distribution).forEach(key => {
        if (!mlm.currentBalances[key]) {
          mlm.currentBalances[key] = 0;
        }
        mlm.currentBalances[key] += transaction.distribution[key];
      });
    });

    mlm.markModified('transactions');
    mlm.markModified('currentBalances');
    await mlm.save();

    res.status(200).json({
      success: true,
      message: `Cleanup completed. Removed ${duplicatesRemoved} duplicate transactions.`,
      data: {
        duplicatesRemoved,
        remainingTransactions: mlm.transactions.length,
        recalculatedTotalAmount: mlm.totalAmount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update global CRR leg percentages (Admin only)
export const updateGlobalCRRLegPercentages = asyncHandler(async (req, res) => {
  try {
    const { legPercentages } = req.body;

    // Validate input structure
    if (!legPercentages || typeof legPercentages !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'legPercentages object is required'
      });
    }

    // Validate that we have exactly 3 legs (A, B, C)
    const requiredLegs = ['legA', 'legB', 'legC'];
    const providedLegs = Object.keys(legPercentages);
    
    if (providedLegs.length !== 3 || !requiredLegs.every(leg => providedLegs.includes(leg))) {
      return res.status(400).json({
        success: false,
        message: 'legPercentages must contain exactly legA, legB, and legC'
      });
    }

    // Validate percentage values
    const percentageValues = Object.values(legPercentages);
    const invalidValues = percentageValues.filter(val => 
      typeof val !== 'number' || val < 0 || val > 100
    );
    
    if (invalidValues.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'All leg percentages must be numbers between 0 and 100'
      });
    }

    // Validate total percentage
    const totalPercentage = percentageValues.reduce((sum, val) => sum + val, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `Total percentage must equal 100. Current total: ${totalPercentage}`
      });
    }

    // Get MLM document
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: 'MLM system not found'
      });
    }

    // Update global leg percentages
    if (!mlm.crrConfig) {
      mlm.crrConfig = {};
    }
    
    mlm.crrConfig.legPercentages = {
      legA: legPercentages.legA,
      legB: legPercentages.legB,
      legC: legPercentages.legC
    };

    await mlm.save();

    res.status(200).json({
      success: true,
      message: 'Global CRR leg percentages updated successfully',
      data: {
        legPercentages: mlm.crrConfig.legPercentages,
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

// Get leg percentages for all CRR ranks
export const getCRRLegPercentages = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Get global leg percentages from crrConfig (applies to all ranks)
    const legPercentages = mlm.crrConfig?.legPercentages || {
      legA: 33.33,
      legB: 33.33,
      legC: 33.34
    };

    res.status(200).json({
      success: true,
      data: {
        legPercentages,
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

// Update leg percentages for CRR ranks
export const updateCRRLegPercentages = asyncHandler(async (req, res) => {
  try {
    const { rankName, legPercentages } = req.body;
    
    if (!rankName || !legPercentages) {
      return res.status(400).json({
        success: false,
        message: "rankName and legPercentages are required"
      });
    }

    // Validate leg percentages structure
    const requiredLegs = ['legA', 'legB', 'legC'];
    const missingLegs = requiredLegs.filter(leg => !legPercentages.hasOwnProperty(leg));
    
    if (missingLegs.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing leg percentages: ${missingLegs.join(', ')}`
      });
    }

    // Validate percentage values
    const totalPercentage = legPercentages.legA + legPercentages.legB + legPercentages.legC;
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `Total leg percentages must equal 100%. Current total: ${totalPercentage}%`
      });
    }

    // Validate individual percentages
    for (const leg of requiredLegs) {
      const percentage = legPercentages[leg];
      if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
        return res.status(400).json({
          success: false,
          message: `Invalid percentage for ${leg}: ${percentage}. Must be between 0 and 100.`
        });
      }
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Check if rank exists
    if (!mlm.crrRanks || !mlm.crrRanks[rankName]) {
      return res.status(404).json({
        success: false,
        message: `Rank '${rankName}' not found`
      });
    }

    // Update leg percentages for the specific rank
    mlm.crrRanks[rankName].legPercentages = {
      legA: legPercentages.legA,
      legB: legPercentages.legB,
      legC: legPercentages.legC
    };

    await mlm.save();

    res.status(200).json({
      success: true,
      message: `Leg percentages updated successfully for rank '${rankName}'`,
      data: {
        rankName,
        legPercentages: mlm.crrRanks[rankName].legPercentages,
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

// Update leg percentages for ALL CRR ranks at once
export const updateAllCRRLegPercentages = asyncHandler(async (req, res) => {
  try {
    const { legPercentages } = req.body;
    
    if (!legPercentages) {
      return res.status(400).json({
        success: false,
        message: "legPercentages are required"
      });
    }

    // Validate leg percentages structure
    const requiredLegs = ['legA', 'legB', 'legC'];
    const missingLegs = requiredLegs.filter(leg => !legPercentages.hasOwnProperty(leg));
    
    if (missingLegs.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing leg percentages: ${missingLegs.join(', ')}`
      });
    }

    // Validate percentage values
    const totalPercentage = legPercentages.legA + legPercentages.legB + legPercentages.legC;
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `Total leg percentages must equal 100%. Current total: ${totalPercentage}%`
      });
    }

    // Validate individual percentages
    for (const leg of requiredLegs) {
      const percentage = legPercentages[leg];
      if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
        return res.status(400).json({
          success: false,
          message: `Invalid percentage for ${leg}: ${percentage}. Must be between 0 and 100.`
        });
      }
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    if (!mlm.crrRanks) {
      return res.status(404).json({
        success: false,
        message: "CRR ranks not found in MLM system"
      });
    }

    // Update leg percentages for ALL CRR ranks
    const updatedRanks = [];
    const legPercentageData = {
      legA: legPercentages.legA,
      legB: legPercentages.legB,
      legC: legPercentages.legC
    };

    Object.keys(mlm.crrRanks).forEach(rankName => {
      mlm.crrRanks[rankName].legPercentages = { ...legPercentageData };
      updatedRanks.push(rankName);
    });

    await mlm.save();

    res.status(200).json({
      success: true,
      message: `Leg percentages updated successfully for all CRR ranks`,
      data: {
        updatedRanks,
        legPercentages: legPercentageData,
        totalRanksUpdated: updatedRanks.length,
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

// Test CRR rank system with new structure (Admin only)
export const testCRRRankSystem = asyncHandler(async (req, res) => {
  try {
    const { userId, testPoints } = req.body;
    
    if (!userId || !testPoints) {
      return res.status(400).json({
        success: false,
        message: "userId and testPoints are required"
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    // Temporarily set test points
    const originalPGP = user.qualificationPoints.pgp.accumulated;
    const originalTGP = user.qualificationPoints.tgp.accumulated;
    
    user.qualificationPoints.pgp.accumulated = testPoints / 2;
    user.qualificationPoints.tgp.accumulated = testPoints / 2;
    
    // Test rank calculation
    const rankProgress = user.getCRRRankProgress();
    
    // Test rank update
    await user.updateCRRRank();
    
    // Restore original points
    user.qualificationPoints.pgp.accumulated = originalPGP;
    user.qualificationPoints.tgp.accumulated = originalTGP;
    
    res.status(200).json({
      success: true,
      data: {
        testPoints,
        rankProgress,
        updatedRank: user.crrRank.current,
        rewardAmount: user.crrRank.rewardAmount,
        isRegionalAmbassador: user.regionalAmbassador.isAmbassador,
        isPermanentAmbassador: user.regionalAmbassador.isPermanent,
        rankSystem: {
          Challenger: "1,000+ points = AED 1,000 (Achieved)",
          Warrior: "5,000+ points = AED 5,000 (Achieved)",
          Tycoon: "20,000+ points = AED 20,000 (Locked)",
          Champion: "50,000+ points = AED 50,000 (Locked)",
          Boss: "200,000+ points = AED 200,000 (Locked) + Regional Ambassador"
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
  console.log('Starting distributeRideMLM function');
  try {
    console.log('Request body:', JSON.stringify(req.body));
    const { userId, driverId, rideId, totalFare, rideType } = req.body;
    
    if (!userId || !rideId || !totalFare) {
      return res.status(400).json({
        success: false,
        message: "userId, rideId, and totalFare are required"
      });
    }

    // Validate ObjectId format for userId and driverId
    const mongoose = await import('mongoose');
    if (!mongoose.default.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId format. Must be a valid MongoDB ObjectId."
      });
    }
    
    if (driverId && !mongoose.default.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driverId format. Must be a valid MongoDB ObjectId."
      });
    }

    // Calculate payment distribution
    // 85% of ride fare goes to driver
    // MLM gets 7.5% from user and 7.5% from driver (total 15%)
    const driverPayment = totalFare * 0.85;
    
    // Calculate MLM amounts separately for user and driver
    const userMlmAmount = totalFare * 0.075; // 7.5% from user
    const driverMlmAmount = totalFare * 0.075; // 7.5% from driver
    const mlmAmount = userMlmAmount + driverMlmAmount; // Total MLM amount (15%)
    
    // Calculate qualification points for TGP/PGP
    // User and driver each get 50% of ride fare as PGP
    const pgpPoints = totalFare * 0.5;
    // Upliners get equivalent TGP points (1 PGP = 1 TGP)
    const tgpPoints = pgpPoints; // Same as PGP points
    
    let mlm = await MLM.findOne();
    console.log('MLM found:', mlm ? 'Yes' : 'No');
    console.log('MLM object keys:', mlm ? Object.keys(mlm) : 'No MLM');
    console.log('MLM transactions type:', mlm ? typeof mlm.transactions : 'No MLM');
    console.log('MLM transactions:', mlm ? mlm.transactions : 'No MLM');
    
    if (!mlm) {
      console.log('Creating new MLM system');
      // Create a new MLM system if one doesn't exist
      mlm = new MLM({
        name: "MLM System",
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
        totalAmount: 0,
        transactions: [],
        currentBalances: {}
      });
      // Save the newly created MLM immediately to ensure it's properly initialized
      await mlm.save();
      
      // Reload the MLM from database to ensure it's a proper document instance
      mlm = await MLM.findOne();
      if (!mlm) {
        throw new Error('Failed to initialize MLM system properly');
      }
    }
    
    console.log('MLM transactions:', mlm && mlm.transactions ? 'Exists' : 'Undefined');
    console.log('About to check MLM initialization...');
    
    // Ensure transactions array and currentBalances object are initialized
    if (!mlm) {
      throw new Error('MLM object is undefined');
    }
    
    console.log('MLM is defined, checking transactions...');
    console.log('mlm object at this point:', mlm);
        console.log('mlm.transactions at this point:', mlm.transactions);
    console.log('About to call getUplineMembers...');
    console.log('getUplineMembers function:', typeof getUplineMembers);
    
    try {
    if (!mlm.transactions) {
      mlm.transactions = [];
      mlm.markModified('transactions');
      await mlm.save();
      // Reload the MLM from database to ensure it's properly initialized
      mlm = await MLM.findOne();
      if (!mlm || !mlm.transactions) {
        throw new Error('Failed to initialize MLM transactions properly');
      }
    }
    
    if (!mlm.currentBalances) {
      mlm.currentBalances = {};
      mlm.markModified('currentBalances');
      await mlm.save();
      }
    } catch (error) {
      console.error('Error in MLM initialization:', error);
      throw error;
    }
    
    // Get user and driver
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    // Add PGP to user
    await user.addQualificationPoints({
      points: pgpPoints,
      rideId,
      type: 'pgp',
      rideFare: totalFare
    });
    
    // Update user's CRR rank
    await user.updateCRRRank();
    
    let driver = null;
    if (driverId) {
      driver = await User.findById(driverId);
      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver not found"
        });
      }
      
      // Add driver payment to driver's wallet with transaction record
      driver.wallet.balance += driverPayment;
      driver.wallet.transactions.push({
        type: 'credit',
        amount: driverPayment,
        description: `Driver payment for ride ${rideId}`,
        timestamp: new Date()
      });
      await driver.save();
      
      // Add PGP to driver
      await driver.addQualificationPoints({
        points: pgpPoints,
        rideId,
        type: 'pgp',
        rideFare: totalFare
      });
      
      // Update driver's CRR rank
      await driver.updateCRRRank();
    }
    
    // Get upline members (team sponsors) for both user and driver

    // Now distribute TGP and DDR payments to upline members
    // This is the key change: TGP distribution to team hierarchy
    const teamDistributions = [];
    const ddrDistributions = [];
    
    // Get upline members (team sponsors) for both user and driver
    console.log('Getting user upline members...');
    const userUpline = await getUplineMembers(userId, 4);
    console.log('User upline members:', userUpline);
    
    console.log('Getting driver upline members...');
    const driverUpline = driver ? await getUplineMembers(driverId, 4) : {};
    console.log('Driver upline members:', driverUpline);
    
    // Distribute TGP to user's upline team (sponsors get TGP from downline activity)
    for (let level = 1; level <= 4; level++) {
      const sponsor = userUpline[`level${level}`];
      if (sponsor) {
        // Add TGP points to sponsor
        await sponsor.addQualificationPoints({
          points: tgpPoints,
          rideId,
          type: 'tgp', // Team members get TGP from downline activity
          rideFare: totalFare
        });
        
        // Update sponsor's CRR rank after adding TGP points
        await sponsor.updateCRRRank();
        
        teamDistributions.push({
          sponsorId: sponsor._id,
          sponsorName: sponsor.username,
          level,
          points: tgpPoints,
          type: 'tgp',
          source: 'user_activity'
        });
        
        // Calculate DDR payment for this level based on MLM configuration
        // Get the percentage for this level from MLM configuration
        let levelPercentage = 0;
        switch(level) {
          case 1: levelPercentage = mlm.ddrLevel1; break;
          case 2: levelPercentage = mlm.ddrLevel2; break;
          case 3: levelPercentage = mlm.ddrLevel3; break;
          case 4: levelPercentage = mlm.ddrLevel4; break;
        }
        
        // Calculate the amount for this level
        // For personal rides (user = driver), use full MLM amount to avoid duplicates
        // For team rides, split between user and driver contributions
        let ddrLevelAmount;
        if (userId === driverId) {
          // Personal ride: use full MLM amount (15% of fare)
          ddrLevelAmount = (mlmAmount * levelPercentage) / 100;
        } else {
          // Team ride: split between user and driver contributions
          const userDdrAmount = (userMlmAmount * levelPercentage) / 100;
          const driverDdrAmount = (driverMlmAmount * levelPercentage) / 100;
          ddrLevelAmount = userDdrAmount + driverDdrAmount;
        }
        
        // Add to sponsor's wallet with transaction record
        sponsor.wallet.balance += ddrLevelAmount;
        sponsor.wallet.transactions.push({
          type: 'credit',
          amount: ddrLevelAmount,
          description: `DDR Level ${level} earnings from ride completion`,
          timestamp: new Date()
        });
        await sponsor.save();
        
        ddrDistributions.push({
          sponsorId: sponsor._id,
          sponsorName: sponsor.username,
          level,
          amount: {
            total: ddrLevelAmount,
            user: userId === driverId ? ddrLevelAmount : (userMlmAmount * levelPercentage) / 100,
            driver: userId === driverId ? 0 : (driverMlmAmount * levelPercentage) / 100
          },
          percentage: levelPercentage,
          source: 'ride_activity'
        });
      }
    }
    
    // Distribute TGP to driver's upline team if driver exists and is different from user
    if (driver && userId !== driverId) {
      for (let level = 1; level <= 4; level++) {
        const sponsor = driverUpline[`level${level}`];
        if (sponsor) {
          // Add TGP points to sponsor
          await sponsor.addQualificationPoints({
            points: tgpPoints,
            rideId,
            type: 'tgp', // Team members get TGP from downline activity
            rideFare: totalFare
          });
          
          // Update sponsor's CRR rank after adding TGP points
          await sponsor.updateCRRRank();
          
          teamDistributions.push({
            sponsorId: sponsor._id,
            sponsorName: sponsor.username,
            level,
            points: tgpPoints,
            type: 'tgp',
            source: 'driver_activity'
          });
          
          // Calculate DDR payment for this level based on MLM configuration
          // Get the percentage for this level from MLM configuration
          let levelPercentage = 0;
          switch(level) {
            case 1: levelPercentage = mlm.ddrLevel1; break;
            case 2: levelPercentage = mlm.ddrLevel2; break;
            case 3: levelPercentage = mlm.ddrLevel3; break;
            case 4: levelPercentage = mlm.ddrLevel4; break;
          }
          
          // Calculate the amount for this level - split between user and driver contributions
          const userDdrAmount = (userMlmAmount * levelPercentage) / 100;
          const driverDdrAmount = (driverMlmAmount * levelPercentage) / 100;
          const ddrLevelAmount = userDdrAmount + driverDdrAmount;
          
          // Add to sponsor's wallet with transaction record
          sponsor.wallet.balance += ddrLevelAmount;
          sponsor.wallet.transactions.push({
            type: 'credit',
            amount: ddrLevelAmount,
            description: `DDR Level ${level} earnings from driver ride completion`,
            timestamp: new Date()
          });
          await sponsor.save();
          
          ddrDistributions.push({
            sponsorId: sponsor._id,
            sponsorName: sponsor.username,
            level,
            amount: {
              total: ddrLevelAmount,
              user: userDdrAmount,
              driver: driverDdrAmount
            },
            percentage: levelPercentage,
            source: 'ride_activity'
          });
        }
      }
    }

    // Add the user's MLM amount to the MLM system
    // Ensure MLM model is properly initialized
    console.log('Before initialization - mlm.transactions type:', typeof mlm.transactions);
    
    // Create a new MLM document if it doesn't exist
    if (!mlm) {
      console.log('Creating new MLM document');
      mlm = new MLM();
      await mlm.save();
    }
    
    // Ensure transactions is initialized as an array
    if (!mlm.transactions || !Array.isArray(mlm.transactions)) {
      console.log('Initializing empty transactions array');
      mlm.transactions = [];
      mlm.markModified('transactions');
    }
    
    // Ensure currentBalances is initialized as an object
    if (!mlm.currentBalances) {
      console.log('Initializing empty currentBalances object');
      mlm.currentBalances = {};
      mlm.markModified('currentBalances');
    }
    
    // Save the MLM document with initialized properties
    await mlm.save();
    
    // Reload the MLM document to ensure it's properly initialized
    mlm = await MLM.findOne();
    
    console.log('After initialization - mlm.transactions type:', typeof mlm.transactions);
    console.log('mlm.transactions instanceof Array:', Array.isArray(mlm.transactions));
    console.log('mlm.transactions length:', mlm.transactions ? mlm.transactions.length : 'undefined');
    
    // Initialize distribution variables
    let userMlmDistribution = null;
    let driverMlmDistribution = null;
    
    try {
      // Process user MLM distribution
      userMlmDistribution = mlm.addMoney(userId, userMlmAmount, rideId, 'personal');
      
      // Add the driver's MLM amount to the MLM system if driver exists and is different from user
      if (driver && userId !== driverId) {
        driverMlmDistribution = mlm.addMoney(driverId, driverMlmAmount, rideId, 'personal');
      } else if (driver && userId === driverId) {
        // For personal rides (user = driver), add the driver's MLM amount to the same user's transaction
        // This prevents duplicate transactions for the same person
        mlm.addMoney(userId, driverMlmAmount, rideId, 'driver_contribution');
      }
      
      // Save the MLM model
      await mlm.save();
    } catch (error) {
      console.error('Error in MLM distribution:', error);
      throw new Error(`MLM distribution error: ${error.message}`);
    }

    // Update BBR participation for the campaign
    const activeBBRCampaign = mlm.bbrCampaigns?.current;
    
    // Declare variables at function scope to avoid "not defined" errors
    let shouldCountTeamRides = false;
    let shouldCountDriverTeamRides = false;
    
    if (activeBBRCampaign && activeBBRCampaign.isActive) {
      const campaignStartDate = new Date(activeBBRCampaign.startDate);
      
      // Update BBR participation automatically for all users
      
      if (activeBBRCampaign) {
        // Calculate newbie check for team ride counting
        const campaignStartDate = new Date(activeBBRCampaign.startDate);
        shouldCountTeamRides = !activeBBRCampaign.newbieRidesOnly || (user.createdAt > campaignStartDate);
        
        if (driver && userId !== driverId) {
          shouldCountDriverTeamRides = !activeBBRCampaign.newbieRidesOnly || (driver.createdAt > campaignStartDate);
        }
        // Initialize user's BBR participation if not exists
        if (!user.bbrParticipation) {
          user.bbrParticipation = {
            currentCampaign: {
              campaignId: activeBBRCampaign._id,
              totalRides: 0,
              soloRides: 0,
              teamRides: 0,
              achieved: false,
              joinedAt: new Date(),
              lastRideAt: null
            },
            totalWins: 0,
            totalRewardsEarned: 0,
            history: []
          };
        }
        
        // Check if user is participating in current campaign
        if (!user.bbrParticipation.currentCampaign || 
            !user.bbrParticipation.currentCampaign.campaignId ||
            user.bbrParticipation.currentCampaign.campaignId.toString() !== activeBBRCampaign._id.toString()) {
          user.bbrParticipation.currentCampaign = {
            campaignId: activeBBRCampaign._id,
            totalRides: 0,
            soloRides: 0,
            teamRides: 0,
            achieved: false,
            joinedAt: new Date(),
            lastRideAt: null
          };
        }
        
        // Count rides for the user (always increment)
        user.bbrParticipation.currentCampaign.soloRides = (user.bbrParticipation.currentCampaign.soloRides || 0) + 1;
        
        user.bbrParticipation.currentCampaign.totalRides = 
          user.bbrParticipation.currentCampaign.soloRides + 
          (user.bbrParticipation.currentCampaign.teamRides || 0);
        user.bbrParticipation.currentCampaign.lastRideAt = new Date();
        
        // Count rides for the driver (always increment if driver exists)
        if (driver) {
          // Initialize driver's BBR participation if not exists
          if (!driver.bbrParticipation) {
            driver.bbrParticipation = {
              currentCampaign: {
                campaignId: activeBBRCampaign._id,
                totalRides: 0,
                soloRides: 0,
                teamRides: 0,
                achieved: false,
                joinedAt: new Date(),
                lastRideAt: null
              },
              totalWins: 0,
              totalRewardsEarned: 0,
              history: []
            };
          }
          
          // Check if driver is participating in current campaign
          if (!driver.bbrParticipation.currentCampaign || 
              !driver.bbrParticipation.currentCampaign.campaignId ||
              driver.bbrParticipation.currentCampaign.campaignId.toString() !== activeBBRCampaign._id.toString()) {
            driver.bbrParticipation.currentCampaign = {
              campaignId: activeBBRCampaign._id,
              totalRides: 0,
              soloRides: 0,
              teamRides: 0,
              achieved: false,
              joinedAt: new Date(),
              lastRideAt: null
            };
          }
          
          // Count as solo ride for driver (driver completed a ride)
          driver.bbrParticipation.currentCampaign.soloRides = (driver.bbrParticipation.currentCampaign.soloRides || 0) + 1;
          driver.bbrParticipation.currentCampaign.totalRides = 
            driver.bbrParticipation.currentCampaign.soloRides + 
            (driver.bbrParticipation.currentCampaign.teamRides || 0);
          driver.bbrParticipation.currentCampaign.lastRideAt = new Date();
          
          await driver.save();
        }
        
        // Process team rides for upliners with newbie check
        // Count rides for user's upline sponsors
        if (shouldCountTeamRides) {
          for (let level = 1; level <= 4; level++) {
            const sponsor = userUpline[`level${level}`];
            if (sponsor) {
              // Initialize BBR participation if not exists
              if (!sponsor.bbrParticipation) {
                sponsor.bbrParticipation = {
                  currentCampaign: {
                    campaignId: activeBBRCampaign._id,
                    totalRides: 0,
                    soloRides: 0,
                    teamRides: 0,
                    achieved: false,
                    joinedAt: new Date(),
                    lastRideAt: null
                  },
                  totalWins: 0,
                  totalRewardsEarned: 0,
                  history: []
                };
              }
              
              // Check if participating in current campaign
              if (!sponsor.bbrParticipation.currentCampaign || 
                  !sponsor.bbrParticipation.currentCampaign.campaignId ||
                  sponsor.bbrParticipation.currentCampaign.campaignId.toString() !== activeBBRCampaign._id.toString()) {
                sponsor.bbrParticipation.currentCampaign = {
                  campaignId: activeBBRCampaign._id,
                  totalRides: 0,
                  soloRides: 0,
                  teamRides: 0,
                  achieved: false,
                  joinedAt: new Date(),
                  lastRideAt: null
                };
              }
              
              // Increment team rides for sponsor
              sponsor.bbrParticipation.currentCampaign.teamRides = (sponsor.bbrParticipation.currentCampaign.teamRides || 0) + 1;
              sponsor.bbrParticipation.currentCampaign.totalRides = 
                (sponsor.bbrParticipation.currentCampaign.soloRides || 0) + 
                sponsor.bbrParticipation.currentCampaign.teamRides;
              sponsor.bbrParticipation.currentCampaign.lastRideAt = new Date();
              
              await sponsor.save();
            }
          }
        }
        
        // Count rides for driver's upline sponsors if driver is different from user
        if (driver && userId !== driverId) {
          const shouldCountDriverTeamRides = !activeBBRCampaign.newbieRidesOnly || (driver.createdAt > campaignStartDate);
          
          if (shouldCountDriverTeamRides) {
            for (let level = 1; level <= 4; level++) {
              const sponsor = driverUpline[`level${level}`];
              if (sponsor) {
                // Initialize BBR participation if not exists
                if (!sponsor.bbrParticipation) {
                  sponsor.bbrParticipation = {
                    currentCampaign: {
                      campaignId: activeBBRCampaign._id,
                      totalRides: 0,
                      soloRides: 0,
                      teamRides: 0,
                      achieved: false,
                      joinedAt: new Date(),
                      lastRideAt: null
                    },
                    totalWins: 0,
                    totalRewardsEarned: 0,
                    history: []
                  };
                }
                
                // Check if participating in current campaign
                if (!sponsor.bbrParticipation.currentCampaign || 
                    !sponsor.bbrParticipation.currentCampaign.campaignId ||
                    sponsor.bbrParticipation.currentCampaign.campaignId.toString() !== activeBBRCampaign._id.toString()) {
                  sponsor.bbrParticipation.currentCampaign = {
                    campaignId: activeBBRCampaign._id,
                    totalRides: 0,
                    soloRides: 0,
                    teamRides: 0,
                    achieved: false,
                    joinedAt: new Date(),
                    lastRideAt: null
                  };
                }
                
                // Increment team rides for sponsor
                sponsor.bbrParticipation.currentCampaign.teamRides = (sponsor.bbrParticipation.currentCampaign.teamRides || 0) + 1;
                sponsor.bbrParticipation.currentCampaign.totalRides = 
                  (sponsor.bbrParticipation.currentCampaign.soloRides || 0) + 
                  sponsor.bbrParticipation.currentCampaign.teamRides;
                sponsor.bbrParticipation.currentCampaign.lastRideAt = new Date();
                
                await sponsor.save();
              }
            }
          }
        }
      }
      
      await user.save();
    }

    // Return the complete distribution information
    res.status(200).json({
      success: true,
      message: 'Ride MLM distribution completed successfully',
      data: {
        rideId,
        totalFare,
        driverPayment,

        participants: {
          userId,
          driverId,
          sameUserAndDriver: userId === driverId
        },
        mlmAmount: {
          total: mlmAmount,
          user: userMlmAmount,
          driver: driverMlmAmount
        },
        pgpPoints: {
          user: pgpPoints,
          driver: pgpPoints
        },
        tgpDistributions: teamDistributions,
        ddrDistributions,
        // Only include mlmDistribution if it was successfully created
        mlmDistribution: {
          user: userMlmDistribution || null,
          driver: driverMlmDistribution || null
        },
        rideCounting: {
          userRidesCounted: true,
          driverRidesCounted: !!driver,
          uplineTeamRidesCounted: activeBBRCampaign ? shouldCountTeamRides : false,
          driverUplineTeamRidesCounted: activeBBRCampaign && driver && userId !== driverId ? shouldCountDriverTeamRides : false,
          bbrParticipationUpdated: !!activeBBRCampaign,
          newbieCheckApplied: activeBBRCampaign ? activeBBRCampaign.newbieRidesOnly : false
        }
      }
    });
  } catch (error) {
    console.error('Error in distributeRideMLM:', error);
    console.error('Error stack:', error.stack);
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

    // Calculate total earnings from all sources
    const totalEarnings = Object.values(sectionTotals).reduce((sum, value) => sum + value, 0);

    res.status(200).json({
      success: true,
      data: {
        totalMLMAmount: mlm.totalAmount,
        totalEarnings,
        sectionTotals,
        ddrLevelTotals,
        totalTransactions: mlm.transactions.length,
        recentTransactions,
        percentageConfiguration: {
          // Main distribution percentages
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
          netProfit: mlm.netProfit,
          
          // DDR sub-distributions
          ddrSubDistribution: {
            level1: mlm.ddrLevel1,
            level2: mlm.ddrLevel2,
            level3: mlm.ddrLevel3,
            level4: mlm.ddrLevel4
          },
          
          // CRR sub-distributions (based on rank system)
          crrSubDistribution: {
            Challenger: mlm.crrRanks?.Challenger?.reward || 1000,
            Warrior: mlm.crrRanks?.Warrior?.reward || 5000,
            Tycoon: mlm.crrRanks?.Tycoon?.reward || 20000,
            Champion: mlm.crrRanks?.CHAMPION?.reward || 50000,
            Boss: mlm.crrRanks?.BOSS?.reward || 200000
          },
          
          // BBR sub-distributions (based on campaigns)
          bbrSubDistribution: {
            weeklyTurboBooster: mlm.bbrCampaigns?.current?.reward?.amount || 550
          },
          
          // HLR sub-distributions
          hlrSubDistribution: {
            retirementReward: mlm.hlrConfig?.rewardAmount || 60000
          },
          
          // Regional Ambassador sub-distributions
          regionalAmbassadorSubDistribution: {
            Challenger: 'Level 1',
            Warrior: 'Level 2',
            Tycoon: 'Level 3',
            Champion: 'Level 4',
            Boss: 'Level 5'
          },
          
          // Porparle Team sub-distributions
          porparleTeamSubDistribution: {
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
          
          // Top Team Performance sub-distributions
          topTeamPerformSubDistribution: {
            winner: mlm.winner,
            fighter: mlm.fighter
          },
          
          // Company Operations sub-distributions
          companyOperationsSubDistribution: {
            operationExpense: mlm.operationExpense,
            organizationEvent: mlm.organizationEvent
          },
          
          // Public Share sub-distributions
          publicShareSubDistribution: {
            chairmanFounder: mlm.chairmanFounder,
            shareholder1: mlm.shareholder1,
            shareholder2: mlm.shareholder2,
            shareholder3: mlm.shareholder3
          }
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

// Get DDR leaderboard with wallet transaction calculation
export const getDDRLeaderboard = asyncHandler(async (req, res) => {
  try {
    const { limit = 10, userId } = req.query;
    
    // Get all users with their wallet transactions
    const users = await User.find({
      'wallet.transactions': { $exists: true, $ne: [] }
    }).select('firstName lastName username email profilePicture wallet');

    // Calculate DDR earnings for all users from wallet transactions
    const userEarnings = [];
    
    users.forEach(user => {
      let totalDDR = 0;
      let level1 = 0;
      let level2 = 0;
      let level3 = 0;
      let level4 = 0;
      let transactionCount = 0;
      
      if (user.wallet && user.wallet.transactions) {
        user.wallet.transactions.forEach(transaction => {
          if (transaction.description && transaction.description.includes('DDR')) {
            const levelMatch = transaction.description.match(/Level (\d+)/);
            if (levelMatch) {
              const level = parseInt(levelMatch[1]);
              const amount = transaction.amount || 0;
              
              switch(level) {
                case 1: level1 += amount; break;
                case 2: level2 += amount; break;
                case 3: level3 += amount; break;
                case 4: level4 += amount; break;
              }
              
              totalDDR += amount;
              transactionCount++;
            }
          }
        });
      }
      
      // Only include users who have DDR earnings
      if (totalDDR > 0) {
        userEarnings.push({
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        username: user.username,
        profilePicture: user.profilePicture,
          totalEarnings: totalDDR,
        levelBreakdown: {
            level1: level1,
            level2: level2,
            level3: level3,
            level4: level4
          },
          transactionCount: transactionCount
        });
      }
    });

    // Sort by total earnings (highest first)
    userEarnings.sort((a, b) => b.totalEarnings - a.totalEarnings);

    // Add rank positions
    const rankedLeaderboard = userEarnings.map((user, index) => ({
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

    // Format the response to match your requirements
    const formattedTopEarners = topEarners.map(user => ({
      rank: user.rank,
      name: user.name,
      username: user.username, // Ensure username is included
      earnings: user.totalEarnings,
      levelBreakdown: user.levelBreakdown,
      profilePicture: user.profilePicture
    }));

    res.status(200).json({
      success: true,
      message: "DDR Leaderboard retrieved successfully",
      data: {
        leaderboard: {
          title: "🏅 Leaderboard – Top Earners:",
          topEarners: formattedTopEarners,
          currentUser: currentUserPosition ? {
            rank: currentUserPosition.rank,
            name: currentUserPosition.name,
            username: currentUserPosition.username, // Ensure username is included
            earnings: currentUserPosition.totalEarnings,
            isHighlighted: true,
            isInTopList: currentUserPosition.isInTopList
          } : null,
        totalParticipants: rankedLeaderboard.length,
        lastUpdated: new Date(),
        tip: "Active L1-L4 growth boosts all levels and increases your DDR income"
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

    // Get user's qualification points using proper User model method
    const qualificationStats = user.getQualificationPointsStats();
    
    // Get user's CRR rank progress using proper User model method
    const crrRankProgress = user.getCRRRankProgress(mlm.crrRanks);
    
    // Update user's CRR rank if needed
    await user.updateCRRRank(mlm.crrRanks);
    
    // Calculate CRR earnings (1 PGP = 1 AED, 1 TGP = 1 AED)
    const totalCRREarnings = qualificationStats.pgp.accumulated + qualificationStats.tgp.accumulated;

    res.status(200).json({
      success: true,
      message: "CRR earnings retrieved successfully",
      data: {
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          username: user.username,
          email: user.email
        },
        crrEarnings: {
          currentRank: crrRankProgress.currentRank,
          rankIcon: crrRankProgress.icon,
          nextRank: crrRankProgress.nextRank,
        totalCRREarnings,
          availableBalance: totalCRREarnings,
          lastUpdated: new Date()
        },
        qualificationProgress: {
          currentPoints: crrRankProgress.currentPoints,
          pointsToNext: crrRankProgress.pointsToNext,
          progress: crrRankProgress.progress,
          requirements: crrRankProgress.requirements,
          reward: crrRankProgress.reward
        },
        rankReward: {
          rewardAmount: crrRankProgress.reward.current,
          nextReward: crrRankProgress.reward.next,
          rankHistory: crrRankProgress.rankHistory
        },
        rankStatus: {
          hasRank: crrRankProgress.currentRank !== 'None',
          isLocked: crrRankProgress.currentRank === 'None',
          nextRankToUnlock: crrRankProgress.nextRank
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

    // Get user's qualification points transactions (both PGP and TGP)
    let userQualificationTransactions = user.qualificationPoints.transactions;

    // Apply date filters
    if (startDate || endDate) {
      userQualificationTransactions = userQualificationTransactions.filter(t => {
        const transactionDate = new Date(t.timestamp);
        if (startDate && transactionDate < new Date(startDate)) return false;
        if (endDate && transactionDate > new Date(endDate)) return false;
        return true;
      });
    }

    // Group transactions by rideId to get PGP and TGP for each ride
    const rideGroups = {};
    userQualificationTransactions.forEach(transaction => {
      if (!rideGroups[transaction.rideId]) {
        rideGroups[transaction.rideId] = {
          pgp: 0,
          tgp: 0,
          timestamp: transaction.timestamp
        };
      }
      if (transaction.type === 'pgp') {
        rideGroups[transaction.rideId].pgp = transaction.points;
      } else if (transaction.type === 'tgp') {
        rideGroups[transaction.rideId].tgp = transaction.points;
      }
      // Use the latest timestamp
      if (new Date(transaction.timestamp) > new Date(rideGroups[transaction.rideId].timestamp)) {
        rideGroups[transaction.rideId].timestamp = transaction.timestamp;
      }
    });

    // Transform to CRR transaction format
    const crrTransactions = Object.entries(rideGroups).map(([rideId, data]) => {
      return {
        transactionId: rideId, // Use rideId as transactionId since we don't have MLM transaction IDs
        rideId: rideId,
        date: data.timestamp,
        crrAmount: 0, // CRR amount would need to be calculated or stored separately
        totalRideAmount: 0, // Total ride amount would need to be stored separately
      qualificationPointsEarned: {
          PGP: data.pgp,
          TGP: data.tgp
        },
        rankAtTransaction: "Historical",
        description: `CRR qualification points from ride #${rideId}`
      };
    });

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

// Get user's CRR rank tracking (all ranks with achievement status)
export const getUserCRRRankTracking = asyncHandler(async (req, res) => {
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

    const stats = user.getQualificationPointsStats();
    const pgpPoints = stats.pgp.accumulated;
    const tgpPoints = stats.tgp.accumulated;
    const currentRank = user.crrRank.current;

    // Get CRR ranks configuration from database
    const crrRanks = mlm.crrRanks;
    if (!crrRanks || Object.keys(crrRanks).length === 0) {
      return res.status(404).json({
        success: false,
        message: "CRR ranks configuration not found. Please configure CRR ranks first."
      });
    }

    // Define rank order
    const rankOrder = ['Challenger', 'Warrior', 'Tycoon', 'CHAMPION', 'BOSS'];
    
    // Track all ranks
    const rankTracking = rankOrder.map((rankName, index) => {
      const rankConfig = crrRanks[rankName];

      const requirements = rankConfig.requirements;
      
      // Check if user meets requirements
      const pgpMet = pgpPoints >= requirements.pgp;
      const tgpMet = tgpPoints >= requirements.tgp;
      const isAchieved = pgpMet && tgpMet;
      
      // Check if this rank is locked (previous rank not achieved)
      const previousRank = index > 0 ? rankOrder[index - 1] : null;
      const previousRankAchieved = !previousRank || 
        (pgpPoints >= crrRanks[previousRank].requirements.pgp && 
         tgpPoints >= crrRanks[previousRank].requirements.tgp);
      
      const isLocked = !previousRankAchieved;
      
      // Calculate progress
      const pgpProgress = Math.min(100, (pgpPoints / requirements.pgp) * 100);
      const tgpProgress = Math.min(100, (tgpPoints / requirements.tgp) * 100);
      const overallProgress = (pgpProgress + tgpProgress) / 2;
      
      // Check if this is the current rank
      const isCurrentRank = currentRank === rankName;
      
      const result = {
        rank: rankConfig.name || rankName,
        rankName: rankName,
        name: rankConfig.name || rankName,
        icon: rankConfig.icon,
        reward: rankConfig.reward,
        requirements: {
          pgp: requirements.pgp,
          tgp: requirements.tgp
        },
        currentPoints: {
          pgp: pgpPoints,
          tgp: tgpPoints
        },
        progress: {
          pgp: Math.round(pgpProgress),
          tgp: Math.round(tgpProgress),
          overall: Math.round(overallProgress)
        },
        status: isLocked ? 'Locked' : (isAchieved ? 'Achieved' : 'In Progress'),
        isAchieved,
        isLocked,
        isCurrentRank,
        pointsNeeded: {
          pgp: Math.max(0, requirements.pgp - pgpPoints),
          tgp: Math.max(0, requirements.tgp - tgpPoints)
        }
      };
      
      console.log('Rank result for', rankName, ':', JSON.stringify(result, null, 2));
      return result;
    });

    res.status(200).json({
      success: true,
      message: "CRR rank tracking retrieved successfully",
      data: {
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          username: user.username,
          email: user.email
        },
        currentRank,
        totalPoints: {
          pgp: pgpPoints,
          tgp: tgpPoints,
          total: pgpPoints + tgpPoints
        },
        rankTracking,
        summary: {
          totalRanks: rankOrder.length,
          achievedRanks: rankTracking.filter(r => r.isAchieved).length,
          lockedRanks: rankTracking.filter(r => r.isLocked).length,
          inProgressRanks: rankTracking.filter(r => !r.isAchieved && !r.isLocked).length
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

// Get CRR leaderboard with new rank system
export const getCRRLeaderboard = asyncHandler(async (req, res) => {
  try {
    const { limit = 10, userId } = req.query;
    
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Get all users with their qualification points and CRR ranks
    const users = await User.find({
      'qualificationPoints.pgp.accumulated': { $gt: 0 },
      'qualificationPoints.tgp.accumulated': { $gt: 0 }
    }).select('firstName lastName username email profilePicture qualificationPoints crrRank');

    // Calculate CRR earnings and create leaderboard
    const leaderboardData = users.map(user => {
      const stats = user.getQualificationPointsStats();
      const crrRankProgress = user.getCRRRankProgress(mlm.crrRanks);
      
      // Calculate CRR earnings (only count if user has achieved a rank)
      let totalCRREarnings = 0;
      
      // If user has a rank other than 'None', calculate earnings based on qualification points
      // Otherwise, earnings should be 0 until they achieve a rank
      if (crrRankProgress.currentRank && crrRankProgress.currentRank !== 'None') {
        totalCRREarnings = stats.pgp.accumulated + stats.tgp.accumulated;
      }
      
      return {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        username: user.username,
        profilePicture: user.profilePicture,
        rank: crrRankProgress.currentRank,
        rankIcon: crrRankProgress.icon,
        totalCRREarnings: totalCRREarnings,
        qualificationPoints: {
          pgp: stats.pgp.accumulated,
          tgp: stats.tgp.accumulated,
          total: stats.total.accumulated,
          daysUntilReset: stats.total.daysUntilReset
        },
        rankProgress: {
          currentRank: crrRankProgress.currentRank,
          nextRank: crrRankProgress.nextRank,
          progress: crrRankProgress.progress,
          requirements: crrRankProgress.requirements,
          reward: crrRankProgress.reward
        }
      };
    });

    // Sort by total CRR earnings (highest first)
    leaderboardData.sort((a, b) => b.totalCRREarnings - a.totalCRREarnings);

    // Add rank positions
    const rankedLeaderboard = leaderboardData.map((user, index) => ({
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

    // Format the response to match your requirements
    const formattedTopEarners = topEarners.map(user => {
      return {
        position: user.position,
        name: user.name,
        username: user.username, // Include username in the response
        rank: user.rank,
        rankIcon: user.rankIcon,
        earnings: user.totalCRREarnings,
        qualificationPoints: user.qualificationPoints,
        progress: user.rankProgress.progress,
        daysUntilReset: user.qualificationPoints.daysUntilReset // Days left until monthly points reset
      };
    });

    res.status(200).json({
      success: true,
      message: "CRR Leaderboard retrieved successfully",
      data: {
        leaderboard: {
          title: "🥇 CRR Leaderboard – Top Earners:",
          topEarners: formattedTopEarners,
          currentUser: currentUserPosition ? {
            position: currentUserPosition.position,
            name: currentUserPosition.name,
            username: currentUserPosition.username, // Include username in the response
            rank: currentUserPosition.rank,
            rankIcon: currentUserPosition.rankIcon,
            earnings: currentUserPosition.totalCRREarnings,
            isHighlighted: true,
            isInTopList: currentUserPosition.isInTopList,
            daysUntilReset: currentUserPosition.qualificationPoints.daysUntilReset // Days left until monthly points reset
          } : null,
        totalParticipants: rankedLeaderboard.length,
        lastUpdated: new Date(),
        tip: "Maintain consistent TGP and PGP growth to advance ranks and increase CRR rewards"
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

// Admin: Get CRR rank configuration
export const getCRRRankConfig = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Default CRR ranks if not set
    const defaultCRRRanks = {
      Challenger: {
        name: "Challenger",
        icon: "🥇",
        reward: 1000,
        status: "Achieved",
        requirements: { pgp: 2500, tgp: 50000 }
      },
      Warrior: {
        name: "Warrior",
        icon: "🥈",
        reward: 5000,
        status: "Achieved",
        requirements: { pgp: 5000, tgp: 100000 }
      },
      Tycoon: {
        name: "Tycoon",
        icon: "🥉",
        reward: 20000,
        status: "Locked",
        requirements: { pgp: 10000, tgp: 200000 }
      },
      CHAMPION: {
        name: "CHAMPION",
        icon: "🏅",
        reward: 50000,
        status: "Locked",
        requirements: { pgp: 25000, tgp: 500000 }
      },
      BOSS: {
        name: "BOSS",
        icon: "🎖",
        reward: 200000,
        status: "Locked",
        requirements: { pgp: 50000, tgp: 1000000 }
      }
    };

    const crrRanks = mlm.crrRanks || defaultCRRRanks;
    const crrConfig = mlm.crrConfig || {
      monthlyReset: true,
      resetDay: 1,
      pointValue: 1,
      leaderboardUpdateInterval: 300000
    };

    res.status(200).json({
      success: true,
      data: {
        crrRanks,
        crrConfig,
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

// Admin: Update CRR rank configuration
export const updateCRRRankConfig = asyncHandler(async (req, res) => {
  try {
    const { crrRanks, crrConfig } = req.body;
    
    if (!crrRanks || typeof crrRanks !== 'object') {
      return res.status(400).json({
        success: false,
        message: "CRR ranks object is required"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Update CRR ranks
    if (crrRanks) {
      mlm.crrRanks = crrRanks;
    }

    // Update CRR config
    if (crrConfig) {
      mlm.crrConfig = { ...mlm.crrConfig, ...crrConfig };
    }

    await mlm.save();

    res.status(200).json({
      success: true,
      message: "CRR rank configuration updated successfully",
      data: {
        crrRanks: mlm.crrRanks,
        crrConfig: mlm.crrConfig,
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

    // Calculate rank distribution using proper CRR rank system
    const rankDistribution = { 'No Rank': 0, Challenger: 0, Warrior: 0, Tycoon: 0, Champion: 0, Boss: 0 };
    
    Object.values(userStats).forEach(stats => {
      const tgpPoints = stats.totalTGP;
      const pgpPoints = stats.totalPGP;
      
      // Determine rank based on BOTH TGP and PGP qualification points
      if (tgpPoints >= 100000 && pgpPoints >= 100000) {
        rankDistribution.Boss++;
      } else if (tgpPoints >= 25000 && pgpPoints >= 25000) {
        rankDistribution.Champion++;
      } else if (tgpPoints >= 10000 && pgpPoints >= 10000) {
        rankDistribution.Tycoon++;
      } else if (tgpPoints >= 2500 && pgpPoints >= 2500) {
        rankDistribution.Warrior++;
      } else if (tgpPoints >= 500 && pgpPoints >= 500) {
        rankDistribution.Challenger++;
      } else {
        rankDistribution['No Rank']++;
      }
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

    // Migration: Add missing rideType field to existing transactions
    let migratedCount = 0;
    mlm.transactions.forEach(transaction => {
      if (!transaction.rideType) {
        transaction.rideType = 'personal'; // Default to 'personal' for existing transactions
        migratedCount++;
      }
    });
    
    if (migratedCount > 0) {
      console.log(`Migrated ${migratedCount} transactions with missing rideType field`);
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
    const { userId, amount, rideId, rideType } = req.body;

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

    const distribution = mlm.addMoney(userId, amount, rideId, rideType);
    await mlm.save();

    // Distribute Regional Ambassador earnings automatically
    await distributeRegionalAmbassadorEarnings(amount, rideId);

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

    const user = await User.findById(userId).select('_id username firstName lastName level sponsorBy directReferrals level2Referrals level3Referrals level4Referrals nextLevels');
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
    const { userId, driverId, mlmAmount, rideId, totalFare } = req.body;

    // Validate required fields
    if (!userId || !driverId || !mlmAmount || !rideId || !totalFare) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: userId, driverId, mlmAmount, rideId, totalFare"
      });
    }

    // Import mongoose for ObjectId validation
    const mongoose = await import('mongoose');
    
    // Verify that users exist (handle both ObjectId and username/sponsorId)
    const userSearchConditions = [
      { username: userId },
      { sponsorId: userId }
    ];
    
    // Only add _id condition if userId is a valid ObjectId
    if (mongoose.default.Types.ObjectId.isValid(userId)) {
      userSearchConditions.push({ _id: userId });
    }
    
    const user = await User.findOne({ $or: userSearchConditions });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    const driverSearchConditions = [
      { username: driverId },
      { sponsorId: driverId }
    ];
    
    // Only add _id condition if driverId is a valid ObjectId
    if (mongoose.default.Types.ObjectId.isValid(driverId)) {
      driverSearchConditions.push({ _id: driverId });
    }
    
    const driver = await User.findOne({ $or: driverSearchConditions });
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    // Validate that mlmAmount and totalFare are positive numbers
    if (mlmAmount <= 0 || totalFare <= 0) {
      return res.status(400).json({
        success: false,
        message: "MLM amount and total fare must be greater than 0"
      });
    }

    // Use the actual totalFare for qualification points calculation
    const rideFare = totalFare;

    // First, add money to the overall MLM system
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Add money to MLM system (this updates totalAmount and currentBalances)
    const mlmDistribution = mlm.addMoney(userId, mlmAmount, rideId, 'personal');
    await mlm.save();

    // Add TGP and PGP qualification points
    const qualificationPointsDistribution = await addQualificationPointsForRide(userId, driverId, rideFare, rideId);

    // Then distribute MLM earnings to individual users
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
      message: "MLM earnings and qualification points distributed successfully",
      data: {
        systemDistribution: mlmDistribution,
        userDistribution: result.distribution,
        qualificationPointsDistribution,
        rideFare,
        mlmAmount
      }
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

/**
 * Add TGP and PGP qualification points for a completed ride
 * @param {string} userId - User ID who completed the ride
 * @param {string} driverId - Driver ID who completed the ride
 * @param {number} rideFare - Total ride fare
 * @param {string} rideId - Ride identifier
 * @returns {Object} Qualification points distribution summary
 */
const addQualificationPointsForRide = async (userId, driverId, rideFare, rideId) => {
  try {
    // Calculate qualification points - split fare in half
    const driverPoints = rideFare / 2;
    const userPoints = rideFare / 2;
    const tgpPoints = rideFare / 2;

    const pointsDistribution = {
      pgpDistribution: [],
      tgpDistribution: [],
      totalPGPDistributed: 0,
      totalTGPDistributed: 0
    };

    // Get user and driver (handle both ObjectId and username/sponsorId)
    const userSearchConditions = [
      { username: userId },
      { sponsorId: userId }
    ];
    
    // Only add _id condition if userId is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(userId)) {
      userSearchConditions.push({ _id: userId });
    }
    
    const user = await User.findOne({ $or: userSearchConditions });
    
    let driver = null;
    if (driverId) {
      const driverSearchConditions = [
        { username: driverId },
        { sponsorId: driverId }
      ];
      
      // Only add _id condition if driverId is a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(driverId)) {
        driverSearchConditions.push({ _id: driverId });
      }
      
      driver = await User.findOne({ $or: driverSearchConditions });
    }

    if (!user) {
      throw new Error('User not found');
    }

    // Add PGP qualification points to user
    await user.addQualificationPoints({
      points: userPoints,
      rideId,
      type: 'pgp',
      rideType: 'personal',
      rideFare
    });

    // Update user's CRR rank after adding points
    await user.updateCRRRank();

    pointsDistribution.pgpDistribution.push({
      userId: user._id,
      username: user.username,
      points: userPoints,
      type: 'pgp',
      reason: 'ride_completion'
    });
    pointsDistribution.totalPGPDistributed += userPoints;

    // Add PGP qualification points to driver if different from user
    if (driver && userId !== driverId) {
      await driver.addQualificationPoints({
        points: driverPoints,
        rideId,
        type: 'pgp',
        rideType: 'team',
        rideFare
      });

      // Update driver's CRR rank after adding points
      await driver.updateCRRRank();

      pointsDistribution.pgpDistribution.push({
        userId: driver._id,
        username: driver.username,
        points: driverPoints,
        type: 'pgp',
        reason: 'ride_completion'
      });
      pointsDistribution.totalPGPDistributed += driverPoints;
    }

    // Distribute TGP to team members (upline sponsors)
    const userUpline = await getUplineMembers(userId, 4);
    const driverUpline = driver ? await getUplineMembers(driverId, 4) : {};

    // Distribute TGP to user's upline team
    for (let level = 1; level <= 4; level++) {
      const sponsor = userUpline[`level${level}`];
      if (sponsor) {
        await sponsor.addQualificationPoints({
           points: tgpPoints,
           rideId,
           type: 'tgp',
           rideType: 'team',
           rideFare
         });

        // Update sponsor's CRR rank after adding TGP points
        await sponsor.updateCRRRank();

        pointsDistribution.tgpDistribution.push({
          sponsorId: sponsor._id,
          sponsorName: sponsor.username,
          level,
          points: tgpPoints,
          type: 'tgp',
          source: 'user_activity'
        });
        pointsDistribution.totalTGPDistributed += tgpPoints;
      }
    }

    // Distribute TGP to driver's upline team if driver exists and is different from user
    if (driver && userId !== driverId) {
      for (let level = 1; level <= 4; level++) {
        const sponsor = driverUpline[`level${level}`];
        if (sponsor) {
          await sponsor.addQualificationPoints({
            points: tgpPoints,
            rideId,
            type: 'tgp',
            rideType: 'team',
            rideFare
          });

          // Update sponsor's CRR rank after adding TGP points
          await sponsor.updateCRRRank();

          pointsDistribution.tgpDistribution.push({
            sponsorId: sponsor._id,
            sponsorName: sponsor.username,
            level,
            points: tgpPoints,
            type: 'tgp',
            source: 'driver_activity'
          });
          pointsDistribution.totalTGPDistributed += tgpPoints;
        }
      }
    }

    return pointsDistribution;

  } catch (error) {
    console.error('Error adding qualification points for ride:', error);
    throw error;
  }
};

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

// Get current BBR campaign info (general, no user required)
export const getBBRCampaignInfo = asyncHandler(async (req, res) => {
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
      return res.status(200).json({
        success: true,
        data: {
          currentCampaign: null,
          message: "No active BBR campaign"
        }
      });
    }

    // Calculate time left
    const now = new Date();
    const timeLeft = currentCampaign.endDate - now;
    const daysLeft = Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24)));
    const hoursLeft = Math.max(0, Math.ceil((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));

    res.status(200).json({
      success: true,
      data: {
        currentCampaign: {
          name: currentCampaign.name,
          requirement: currentCampaign.requirement,
          duration: currentCampaign.duration,
          type: currentCampaign.type,
          newbieRidesOnly: currentCampaign.newbieRidesOnly,
          reward: currentCampaign.reward,
          period: `${new Date(currentCampaign.startDate).toLocaleDateString()} – ${new Date(currentCampaign.endDate).toLocaleDateString()}`,
          timeLeft: {
            days: daysLeft,
            hours: hoursLeft
          }
        }
      }
    });
  } catch (error) {
    console.error("Error getting BBR campaign info:", error);
    res.status(500).json({
      success: false,
      message: "Error getting BBR campaign info",
      error: error.message
    });
  }
});

// Get current BBR campaign for user (with progress)
export const getCurrentBBRCampaign = asyncHandler(async (req, res) => {
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

    const currentCampaign = mlm.bbrCampaigns.current;
    if (!currentCampaign || !currentCampaign.isActive) {
      return res.status(200).json({
        success: true,
        data: {
          currentCampaign: null,
          progress: null,
          message: "No active BBR campaign"
        }
      });
    }

    // Get user's progress automatically
    const userParticipation = user.bbrParticipation?.currentCampaign;
    let progress = {
      totalRides: 0,
      soloRides: 0,
      teamRides: 0,
      progressPercentage: 0,
      ridesNeeded: currentCampaign.requirement,
      isQualified: false
    };

    if (userParticipation && userParticipation.campaignId?.toString() === currentCampaign._id.toString()) {
      const soloRides = userParticipation.soloRides || 0;
      const teamRides = userParticipation.teamRides || 0;
      const totalRides = soloRides + teamRides;
      const progressPercentage = Math.min((totalRides / currentCampaign.requirement) * 100, 100);
      
      progress = {
        totalRides,
        soloRides,
        teamRides,
        progressPercentage,
        ridesNeeded: Math.max(0, currentCampaign.requirement - totalRides),
        isQualified: totalRides >= currentCampaign.requirement
      };
    }

    // Calculate time left
    const now = new Date();
    const timeLeft = currentCampaign.endDate - now;
    const daysLeft = Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24)));
    const hoursLeft = Math.max(0, Math.ceil((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));

    res.status(200).json({
      success: true,
      data: {
        currentCampaign: {
          name: currentCampaign.name,
          requirement: currentCampaign.requirement,
          duration: currentCampaign.duration,
          type: currentCampaign.type,
          newbieRidesOnly: currentCampaign.newbieRidesOnly,
          reward: currentCampaign.reward,
          period: `${new Date(currentCampaign.startDate).toLocaleDateString()} – ${new Date(currentCampaign.endDate).toLocaleDateString()}`,
          timeLeft: {
            days: daysLeft,
            hours: hoursLeft
          }
        },
        progress
      }
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

// Get BBR leaderboard
export const getBBRLeaderboard = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const mlm = await MLM.findOne();
    if (!mlm || !mlm.bbrCampaigns.current || !mlm.bbrCampaigns.current.isActive) {
      return res.status(404).json({
        success: false,
        message: "No active BBR campaign found"
      });
    }

    const currentCampaign = mlm.bbrCampaigns.current;
    
    // Get leaderboard data with better indexing - include both customers and drivers
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
              { $ifNull: ["$bbrParticipation.currentCampaign.soloRides", 0] },
              { $ifNull: ["$bbrParticipation.currentCampaign.teamRides", 0] }
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
          role: 1, // Include user role to distinguish between customers and drivers
          totalRides: 1,
          isQualified: { $gte: ["$totalRides", currentCampaign.requirement] }
        }
      }
    ]);

    // Get user's position if userId provided
    let userPosition = null;
    let userRole = null;
    if (userId) {
      // Get user's role
      const user = await User.findById(userId).select('role');
      if (user) {
        userRole = user.role;
      }
      
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
                { $ifNull: ["$bbrParticipation.currentCampaign.soloRides", 0] },
                { $ifNull: ["$bbrParticipation.currentCampaign.teamRides", 0] }
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

    // Debug log to check user roles in leaderboard
    console.log('Leaderboard users with roles:', leaderboard.map(user => ({ username: user.username, role: user.role })));
    if (userRole) {
      console.log('Current user role:', userRole);
    }
    
    res.status(200).json({
      success: true,
      data: {
        leaderboard: leaderboard.map((user, index) => {
          // Debug log for each user
          console.log(`User ${user.username} has role: ${user.role}`);
          return {
            rank: skip + index + 1,
            name: `${user.firstName} ${user.lastName}`,
            role: user.role, // Include user role (customer or driver)
            rides: user.totalRides,
            rideType: user.role === 'driver' ? 'driver' : 'standard', // Add ride type based on user role
            status: user.isQualified ? 'Achieved' : 'Locked',
            reward: currentCampaign.reward.amount
          };
        }),
        userPosition: userPosition ? {
          rank: userPosition.position,
          role: userRole, // Include user role
          rides: userPosition.totalRides,
          rideType: userRole === 'driver' ? 'driver' : 'standard', // Add ride type based on user role
          status: userPosition.totalRides >= currentCampaign.requirement ? 'Achieved' : 'Locked',
          reward: currentCampaign.reward.amount
        } : null,
        campaign: {
          name: currentCampaign.name,
          requirement: currentCampaign.requirement,
          reward: currentCampaign.reward.amount
        },
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

// Get user's BBR progress
export const getUserBBRProgress = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Only select the fields we need
    const user = await User.findById(userId).select('_id bbrParticipation');
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
    const userParticipation = user.bbrParticipation?.currentCampaign;
    
    // Handle case where user has no participation in current campaign
    if (!userParticipation || userParticipation.campaignId?.toString() !== currentCampaign._id.toString()) {
      return res.status(200).json({
        success: true,
        data: {
          campaign: currentCampaign,
          progress: {
            totalRides: 0,
            soloRides: 0,
            teamRides: 0,
            progressPercentage: 0,
            ridesNeeded: currentCampaign.requirement,
            dailyTarget: currentCampaign.requirement
          },
          timeLeft: {
            days: Math.max(0, Math.ceil((currentCampaign.endDate - new Date()) / (1000 * 60 * 60 * 24))),
            hours: Math.max(0, Math.ceil(((currentCampaign.endDate - new Date()) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)))
          },
          isQualified: false
        }
      });
    }
    
    // Calculate progress using soloRides and teamRides
    const soloRides = userParticipation.soloRides || 0;
    const teamRides = userParticipation.teamRides || 0;
    const totalRides = soloRides + teamRides;
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
          soloRides,
          teamRides,
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

// Get past BBR wins
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
    const pastWins = user.bbrParticipation?.history
      ?.filter(campaign => campaign.isWinner)
      .sort((a, b) => new Date(b.completedAt || b.participatedAt) - new Date(a.completedAt || a.participatedAt))
      .slice(skip, skip + limit) || [];

    res.status(200).json({
      success: true,
      data: {
        pastWins: pastWins.map(win => ({
          name: win.campaignName || 'BBR Campaign',
          status: 'Achieved',
          reward: win.rewardAmount,
          date: win.completedAt || win.participatedAt
        })),
        pagination: {
          page,
          limit,
          total: user.bbrParticipation?.history?.filter(c => c.isWinner)?.length || 0,
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

// Admin: Create new BBR campaign
export const createBBRCampaign = asyncHandler(async (req, res) => {
  try {
    const { name, requirement, duration, reward, type, newbieRidesOnly, description } = req.body;
    
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
      reward: {
        amount: reward,
        perks: []
      },
      type,
      newbieRidesOnly: newbieRidesOnly !== undefined ? newbieRidesOnly : true,
      description: description || '',
      isActive: true,
      participants: [],
      totalParticipants: 0,
      totalWinners: 0,
      totalRewardDistributed: 0
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

// Admin: Update BBR campaign
export const updateBBRCampaign = asyncHandler(async (req, res) => {
  try {
    const { name, requirement, duration, reward, type, newbieRidesOnly, description } = req.body;
    
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    if (!mlm.bbrCampaigns.current || !mlm.bbrCampaigns.current.isActive) {
      return res.status(400).json({
        success: false,
        message: "No active BBR campaign to update"
      });
    }

    const currentCampaign = mlm.bbrCampaigns.current;
    
    // Update fields if provided
    if (name) currentCampaign.name = name;
    if (requirement) currentCampaign.requirement = requirement;
    if (duration) {
      currentCampaign.duration = duration;
      currentCampaign.endDate = new Date(currentCampaign.startDate.getTime() + (duration * 24 * 60 * 60 * 1000));
    }
    if (reward) currentCampaign.reward.amount = reward;
    if (type) currentCampaign.type = type;
    if (newbieRidesOnly !== undefined) currentCampaign.newbieRidesOnly = newbieRidesOnly;
    if (description) currentCampaign.description = description;

    await mlm.save();

    res.status(200).json({
      success: true,
      message: "BBR campaign updated successfully",
      data: currentCampaign
    });
  } catch (error) {
    console.error("Error updating BBR campaign:", error);
    res.status(500).json({
      success: false,
      message: "Error updating BBR campaign",
      error: error.message
    });
  }
});

// Admin: Delete/End BBR campaign
export const deleteBBRCampaign = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    if (!mlm.bbrCampaigns.current || !mlm.bbrCampaigns.current.isActive) {
      return res.status(400).json({
        success: false,
        message: "No active BBR campaign to delete"
      });
    }

    const currentCampaign = mlm.bbrCampaigns.current;
    currentCampaign.isActive = false;
    currentCampaign.endDate = new Date();

    // Find all qualified users and add them as winners
    const qualifiedUsers = await User.find({
      "bbrParticipation.currentCampaign.campaignId": currentCampaign._id,
      $expr: {
        $gte: [
          { $add: [
            { $ifNull: ["$bbrParticipation.currentCampaign.soloRides", 0] },
            { $ifNull: ["$bbrParticipation.currentCampaign.teamRides", 0] }
          ]},
          currentCampaign.requirement
        ]
      }
    });

    // Add winners to campaign
    currentCampaign.winners = qualifiedUsers.map(user => ({
      userId: user._id,
      soloRides: user.bbrParticipation.currentCampaign.soloRides || 0,
      teamRides: user.bbrParticipation.currentCampaign.teamRides || 0,
      totalRides: (user.bbrParticipation.currentCampaign.soloRides || 0) + (user.bbrParticipation.currentCampaign.teamRides || 0),
      rewardAmount: currentCampaign.reward.amount,
      achievedAt: new Date()
    }));

    currentCampaign.totalParticipants = qualifiedUsers.length;
    currentCampaign.totalWinners = qualifiedUsers.length;
    currentCampaign.totalRewardDistributed = qualifiedUsers.length * currentCampaign.reward.amount;

    // Move to past campaigns
    mlm.bbrCampaigns.past.push(currentCampaign);
    mlm.bbrCampaigns.current = null;

    await mlm.save();

    res.status(200).json({
      success: true,
      message: "BBR campaign deleted successfully",
      data: {
        campaign: currentCampaign,
        winners: qualifiedUsers.length,
        totalRewardDistributed: currentCampaign.totalRewardDistributed
      }
    });
  } catch (error) {
    console.error("Error deleting BBR campaign:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting BBR campaign",
      error: error.message
    });
  }
});

// Admin: Get BBR campaign management
export const getBBRCampaignManagement = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const currentCampaign = mlm.bbrCampaigns.current;
    const pastCampaigns = mlm.bbrCampaigns.past || [];

    // Get current campaign statistics
    let currentStats = null;
    if (currentCampaign && currentCampaign.isActive) {
      const participants = await User.countDocuments({
        "bbrParticipation.currentCampaign.campaignId": currentCampaign._id
      });

      const qualifiedUsers = await User.countDocuments({
        "bbrParticipation.currentCampaign.campaignId": currentCampaign._id,
        $expr: {
          $gte: [
            { $add: [
              { $ifNull: ["$bbrParticipation.currentCampaign.soloRides", 0] },
              { $ifNull: ["$bbrParticipation.currentCampaign.teamRides", 0] }
            ]},
            currentCampaign.requirement
          ]
        }
      });

      currentStats = {
        totalParticipants: participants,
        qualifiedUsers,
        qualificationRate: participants > 0 ? (qualifiedUsers / participants * 100).toFixed(2) : 0
      };
    }

    res.status(200).json({
      success: true,
      data: {
        currentCampaign,
        currentStats,
        pastCampaigns: pastCampaigns.slice(-10), // Last 10 campaigns
        totalPastCampaigns: pastCampaigns.length
      }
    });
  } catch (error) {
    console.error("Error getting BBR campaign management:", error);
    res.status(500).json({
      success: false,
      message: "Error getting BBR campaign management",
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
    
    // Get user's accumulated PGP and TGP
    const currentPGP = user.qualificationPoints?.pgp?.accumulated || 0;
    const currentTGP = user.qualificationPoints?.tgp?.accumulated || 0;
    
    // Calculate progress percentages
    const pgpProgress = Math.min((currentPGP / hlrConfig.requirements.pgp) * 100, 100);
    const tgpProgress = Math.min((currentTGP / hlrConfig.requirements.tgp) * 100, 100);
    const overallProgress = Math.min(((pgpProgress + tgpProgress) / 2), 100);
    
    // Check if user is qualified
    const isQualified = currentPGP >= hlrConfig.requirements.pgp && 
                       currentTGP >= hlrConfig.requirements.tgp;
    
    // Calculate age and retirement eligibility
    const currentAge = user.dateOfBirth ? 
      Math.floor((new Date() - new Date(user.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000)) : 0;
    const isRetirementEligible = currentAge >= hlrConfig.retirementAge;
    const isRewardClaimed = userQualification?.rewardClaimed || false;

    res.status(200).json({
      success: true,
      data: {
        requirements: {
          requiredPGP: hlrConfig.requirements.pgp,
          requiredTGP: hlrConfig.requirements.tgp,
          retirementAge: hlrConfig.retirementAge,
          rewardAmount: hlrConfig.rewardAmount
        },
        progress: {
          currentPGP,
          currentTGP,
          pgpProgress,
          tgpProgress,
          overallProgress,
          pgpNeeded: Math.max(0, hlrConfig.requirements.pgp - currentPGP),
          tgpNeeded: Math.max(0, hlrConfig.requirements.tgp - currentTGP)
        },
        qualification: {
          isQualified,
          isRetirementEligible,
          isRewardClaimed,
          canClaim: isQualified && (isRetirementEligible || userQualification?.claimReason === 'deceased'),
          currentAge
        },
        reward: {
          amount: hlrConfig.rewardAmount,
          claimedAt: userQualification?.claimedAt,
          claimReason: userQualification?.claimReason
        }
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

// Get HLR leaderboard
export const getHLRLeaderboard = asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const hlrConfig = mlm.hlrConfig;
    
    // Get ALL users with PGP/TGP (participating in HLR system)
    const allUsers = await User.aggregate([
      {
        $addFields: {
          currentPGP: { $ifNull: ["$qualificationPoints.pgp.accumulated", 0] },
          currentTGP: { $ifNull: ["$qualificationPoints.tgp.accumulated", 0] },
          totalPoints: { 
            $add: [
              { $ifNull: ["$qualificationPoints.pgp.accumulated", 0] },
              { $ifNull: ["$qualificationPoints.tgp.accumulated", 0] }
            ]
          },
          isQualified: {
            $and: [
              { $gte: [{ $ifNull: ["$qualificationPoints.pgp.accumulated", 0] }, hlrConfig.requirements.pgp] },
              { $gte: [{ $ifNull: ["$qualificationPoints.tgp.accumulated", 0] }, hlrConfig.requirements.tgp] }
            ]
          },
          pgpProgress: {
            $min: [
              100,
              { $multiply: [{ $divide: [{ $ifNull: ["$qualificationPoints.pgp.accumulated", 0] }, hlrConfig.requirements.pgp] }, 100] }
            ]
          },
          tgpProgress: {
            $min: [
              100,
              { $multiply: [{ $divide: [{ $ifNull: ["$qualificationPoints.tgp.accumulated", 0] }, hlrConfig.requirements.tgp] }, 100] }
            ]
          }
        }
      },
      {
        $match: {
          $or: [
            { currentPGP: { $gt: 0 } },
            { currentTGP: { $gt: 0 } }
          ]
        }
      },
      {
        $sort: { 
          totalPoints: -1,
          currentPGP: -1,
          currentTGP: -1
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
          dateOfBirth: 1,
          currentPGP: 1,
          currentTGP: 1,
          totalPoints: 1,
          isQualified: 1,
          pgpProgress: 1,
          tgpProgress: 1,
          qualifiedAt: "$hlrQualification.qualifiedAt",
          rewardClaimed: "$hlrQualification.rewardClaimed",
          claimedAt: "$hlrQualification.claimedAt",
          claimReason: "$hlrQualification.claimReason"
        }
      }
    ]);

    // Get total count of participating users
    const totalParticipating = await User.countDocuments({
      $or: [
        { "qualificationPoints.pgp.accumulated": { $gt: 0 } },
        { "qualificationPoints.tgp.accumulated": { $gt: 0 } }
      ]
    });

    // Get count of qualified users
    const totalQualified = await User.countDocuments({
      $expr: {
        $and: [
          { $gte: [{ $ifNull: ["$qualificationPoints.pgp.accumulated", 0] }, hlrConfig.requirements.pgp] },
          { $gte: [{ $ifNull: ["$qualificationPoints.tgp.accumulated", 0] }, hlrConfig.requirements.tgp] }
        ]
      }
    });

    res.status(200).json({
      success: true,
      data: {
        leaderboard: allUsers.map((member, index) => {
          const currentAge = member.dateOfBirth ? 
            Math.floor((new Date() - new Date(member.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000)) : 0;
          
          let status = 'Participating';
          if (member.isQualified) {
            if (member.rewardClaimed) {
              status = 'Reward Claimed';
            } else if (currentAge >= hlrConfig.retirementAge) {
              status = 'Eligible for Reward';
            } else {
              status = 'Qualified (Waiting for Age)';
            }
          } else {
            status = 'In Progress';
          }

          return {
            rank: skip + index + 1,
            name: `${member.firstName} ${member.lastName}`,
            country: member.country || 'Unknown',
            flag: getCountryFlag(member.country),
            age: currentAge,
            pgp: member.currentPGP,
            tgp: member.currentTGP,
            totalPoints: member.totalPoints,
            pgpProgress: Math.round(member.pgpProgress),
            tgpProgress: Math.round(member.tgpProgress),
            overallProgress: Math.round((member.pgpProgress + member.tgpProgress) / 2),
            isQualified: member.isQualified,
            status: status,
            qualifiedAt: member.qualifiedAt,
            rewardClaimed: member.rewardClaimed,
            claimedAt: member.claimedAt,
            claimReason: member.claimReason
          };
        }),
        statistics: {
          totalParticipating,
          totalQualified,
          qualificationRate: totalParticipating > 0 ? ((totalQualified / totalParticipating) * 100).toFixed(1) : 0
        },
        requirements: {
          requiredPGP: hlrConfig.requirements.pgp,
          requiredTGP: hlrConfig.requirements.tgp,
          retirementAge: hlrConfig.retirementAge,
          rewardAmount: hlrConfig.rewardAmount
        },
        pagination: {
          page,
          limit,
          total: totalParticipating,
          hasMore: allUsers.length === limit
        }
      }
    });
  } catch (error) {
    console.error("Error getting HLR leaderboard:", error);
    res.status(500).json({
      success: false,
      message: "Error getting HLR leaderboard",
      error: error.message
    });
  }
});

// Helper function to get country flag emoji
function getCountryFlag(country) {
  const flagMap = {
    'UAE': '🇦🇪',
    'Pakistan': '🇵🇰',
    'Saudi Arabia': '🇸🇦',
    'India': '🇮🇳',
    'UK': '🇬🇧',
    'USA': '🇺🇸',
    'Canada': '🇨🇦',
    'Australia': '🇦🇺',
    'Germany': '🇩🇪',
    'France': '🇫🇷',
    'Italy': '🇮🇹',
    'Spain': '🇪🇸',
    'Netherlands': '🇳🇱',
    'Belgium': '🇧🇪',
    'Switzerland': '🇨🇭',
    'Austria': '🇦🇹',
    'Sweden': '🇸🇪',
    'Norway': '🇳🇴',
    'Denmark': '🇩🇰',
    'Finland': '🇫🇮'
  };
  return flagMap[country] || '🌍';
}

// Distribute Regional Ambassador earnings automatically
async function distributeRegionalAmbassadorEarnings(totalAmount, rideId) {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      console.error("MLM system not found for Regional Ambassador distribution");
      return;
    }

    // Calculate Regional Ambassador share (0.4% of total amount)
    const regionalAmbassadorShare = totalAmount * (mlm.regionalAmbassador / 100);
    
    if (regionalAmbassadorShare <= 0) {
      return; // No Regional Ambassador earnings to distribute
    }

    // Get all current Regional Ambassadors (highest CRR rank in each country)
    const ambassadors = await getGlobalAmbassadorsList();
    
    if (ambassadors.length === 0) {
      console.log("No Regional Ambassadors found for distribution");
      return;
    }

    // Distribute earnings equally among all ambassadors
    const earningsPerAmbassador = regionalAmbassadorShare / ambassadors.length;

    console.log(`Distributing Regional Ambassador earnings: ${regionalAmbassadorShare} AED among ${ambassadors.length} ambassadors (${earningsPerAmbassador} AED each)`);

    // Update each ambassador's wallet
    for (const ambassador of ambassadors) {
      try {
        const user = await User.findById(ambassador.userId);
        if (user) {
          // Initialize wallet if it doesn't exist
          if (!user.wallet) {
            user.wallet = {
              balance: 0,
              transactions: []
            };
          }

          // Add earnings to wallet
          user.wallet.balance += earningsPerAmbassador;
          user.wallet.transactions.push({
            amount: earningsPerAmbassador,
            type: 'credit',
            description: `Regional Ambassador Earnings - Ride ${rideId}`,
            timestamp: new Date()
          });

          await user.save();
          console.log(`Added ${earningsPerAmbassador} AED to ${user.firstName} ${user.lastName} (${user.country}) wallet`);
        }
      } catch (error) {
        console.error(`Error updating ambassador ${ambassador.userId} wallet:`, error);
      }
    }

    console.log(`Regional Ambassador earnings distribution completed for ride ${rideId}`);
  } catch (error) {
    console.error("Error distributing Regional Ambassador earnings:", error);
  }
}

// Claim CRR Rank Reward
export const claimCRRReward = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if user has unclaimed CRR reward
    if (!user.crrRank.rewardAmount || user.crrRank.rewardClaimed) {
      return res.status(400).json({
        success: false,
        message: "No unclaimed CRR reward available"
      });
    }

    const rewardAmount = user.crrRank.rewardAmount;

    // Initialize wallet if it doesn't exist
    if (!user.wallet) {
      user.wallet = {
        balance: 0,
        transactions: []
      };
    }

    // Add reward to wallet
    user.wallet.balance += rewardAmount;
    user.wallet.transactions.push({
      amount: rewardAmount,
      type: 'credit',
      description: `CRR Rank Reward - ${user.crrRank.current}`,
      timestamp: new Date()
    });

    // Mark reward as claimed
    user.crrRank.rewardClaimed = true;
    user.crrRank.rewardClaimedAt = new Date();

    await user.save();

    res.status(200).json({
      success: true,
      message: "CRR reward claimed successfully",
      data: {
        rewardAmount,
        newBalance: user.wallet.balance,
        rank: user.crrRank.current,
        claimedAt: user.crrRank.rewardClaimedAt
      }
    });
  } catch (error) {
    console.error("Error claiming CRR reward:", error);
    res.status(500).json({
      success: false,
      message: "Error claiming CRR reward",
      error: error.message
    });
  }
});

// Distribute BBR Campaign Rewards
export const distributeBBRRewards = asyncHandler(async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Find the campaign
    const campaign = mlm.bbrCampaigns.find(c => c._id.toString() === campaignId);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "BBR campaign not found"
      });
    }

    // Check if campaign is ended
    if (!campaign.isEnded) {
      return res.status(400).json({
        success: false,
        message: "Campaign is still active"
      });
    }

    // Get all users who achieved the campaign
    const users = await User.find({
      'bbrParticipation.history.campaignId': campaignId,
      'bbrParticipation.history.achieved': true,
      'bbrParticipation.history.isWinner': false // Not already processed
    });

    let totalDistributed = 0;
    const distributionResults = [];

    for (const user of users) {
      try {
        // Find the campaign participation record
        const participation = user.bbrParticipation.history.find(
          h => h.campaignId.toString() === campaignId && h.achieved && !h.isWinner
        );

        if (participation) {
          // Initialize wallet if it doesn't exist
          if (!user.wallet) {
            user.wallet = {
              balance: 0,
              transactions: []
            };
          }

          // Add reward to wallet
          user.wallet.balance += campaign.rewardAmount;
          user.wallet.transactions.push({
            amount: campaign.rewardAmount,
            type: 'credit',
            description: `BBR Campaign Reward - ${campaign.name}`,
            timestamp: new Date()
          });

          // Mark as winner and update total rewards
          participation.isWinner = true;
          participation.completedAt = new Date();
          user.bbrParticipation.totalWins += 1;
          user.bbrParticipation.totalRewardsEarned += campaign.rewardAmount;

          await user.save();
          totalDistributed += campaign.rewardAmount;

          distributionResults.push({
            userId: user._id,
            name: `${user.firstName} ${user.lastName}`,
            rewardAmount: campaign.rewardAmount,
            totalRides: participation.totalRides
          });
        }
      } catch (error) {
        console.error(`Error distributing BBR reward to user ${user._id}:`, error);
      }
    }

    res.status(200).json({
      success: true,
      message: "BBR rewards distributed successfully",
      data: {
        campaignId,
        campaignName: campaign.name,
        totalDistributed,
        totalWinners: distributionResults.length,
        distributionResults
      }
    });
  } catch (error) {
    console.error("Error distributing BBR rewards:", error);
    res.status(500).json({
      success: false,
      message: "Error distributing BBR rewards",
      error: error.message
    });
  }
});

// Admin: Update HLR configuration
export const updateHLRConfig = asyncHandler(async (req, res) => {
  try {
    const { requiredPGP, requiredTGP, retirementAge, rewardAmount } = req.body;
    
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Update HLR configuration
    if (requiredPGP !== undefined) mlm.hlrConfig.requirements.pgp = requiredPGP;
    if (requiredTGP !== undefined) mlm.hlrConfig.requirements.tgp = requiredTGP;
    if (retirementAge !== undefined) mlm.hlrConfig.retirementAge = retirementAge;
    if (rewardAmount !== undefined) mlm.hlrConfig.rewardAmount = rewardAmount;

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

// Admin: Manually award HLR to user
export const manuallyAwardHLR = asyncHandler(async (req, res) => {
  try {
    const { userId, claimReason, notes } = req.body;
    
    if (!userId || !claimReason) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: userId, claimReason"
      });
    }

    if (!['retirement', 'deceased'].includes(claimReason)) {
      return res.status(400).json({
        success: false,
        message: "claimReason must be 'retirement' or 'deceased'"
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

    // Check if user is already qualified
    const currentPGP = user.qualificationPoints?.pgp?.accumulated || 0;
    const currentTGP = user.qualificationPoints?.tgp?.accumulated || 0;
    
    const isQualified = currentPGP >= mlm.hlrConfig.requirements.pgp && 
                       currentTGP >= mlm.hlrConfig.requirements.tgp;

    if (!isQualified) {
      return res.status(400).json({
        success: false,
        message: "User does not meet HLR qualification requirements",
        data: {
          currentPGP,
          currentTGP,
          requiredPGP: mlm.hlrConfig.requirements.pgp,
          requiredTGP: mlm.hlrConfig.requirements.tgp
        }
      });
    }

    // Check if reward already claimed
    if (user.hlrQualification?.rewardClaimed) {
      return res.status(400).json({
        success: false,
        message: "HLR reward already claimed by this user"
      });
    }

    // Award HLR to user
    if (!user.hlrQualification) {
      user.hlrQualification = {
        isQualified: false,
        qualifiedAt: null,
        rewardClaimed: false,
        claimedAt: null,
        claimReason: null,
        notes: []
      };
    }

    user.hlrQualification.isQualified = true;
    user.hlrQualification.qualifiedAt = new Date();
    user.hlrQualification.rewardClaimed = true;
    user.hlrQualification.claimedAt = new Date();
    user.hlrQualification.claimReason = claimReason;
    
    if (notes) {
      user.hlrQualification.notes.push({
        note: notes,
        addedAt: new Date(),
        addedBy: 'admin'
      });
    }

    // Add reward to user's wallet
    if (!user.wallet) {
      user.wallet = {
        balance: 0,
        transactions: []
      };
    }

    user.wallet.balance += mlm.hlrConfig.rewardAmount;
    user.wallet.transactions.push({
      amount: mlm.hlrConfig.rewardAmount,
      type: 'credit',
      description: `HLR Reward - ${claimReason}`,
      timestamp: new Date()
    });

    await user.save();

    res.status(200).json({
      success: true,
      message: "HLR reward awarded successfully",
      data: {
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          country: user.country
        },
        reward: {
          amount: mlm.hlrConfig.rewardAmount,
          claimReason,
          claimedAt: user.hlrQualification.claimedAt
        },
        qualification: {
          currentPGP,
          currentTGP,
          requiredPGP: mlm.hlrConfig.requirements.pgp,
          requiredTGP: mlm.hlrConfig.requirements.tgp
        }
      }
    });
  } catch (error) {
    console.error("Error manually awarding HLR:", error);
    res.status(500).json({
      success: false,
      message: "Error manually awarding HLR",
      error: error.message
    });
  }
});

// Admin: Get HLR management dashboard
export const getHLRManagement = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const hlrConfig = mlm.hlrConfig;
    
    // Get HLR statistics
    const totalQualified = await User.countDocuments({
      $expr: {
        $and: [
          { $gte: [{ $ifNull: ["$qualificationPoints.pgp.accumulated", 0] }, hlrConfig.requirements.pgp] },
          { $gte: [{ $ifNull: ["$qualificationPoints.tgp.accumulated", 0] }, hlrConfig.requirements.tgp] }
        ]
      }
    });

    const totalRewardsClaimed = await User.countDocuments({
      "hlrQualification.rewardClaimed": true
    });

    const totalRewardsDistributed = totalRewardsClaimed * hlrConfig.rewardAmount;

    const pendingClaims = await User.countDocuments({
      $expr: {
        $and: [
          { $gte: [{ $ifNull: ["$qualificationPoints.pgp.accumulated", 0] }, hlrConfig.requirements.pgp] },
          { $gte: [{ $ifNull: ["$qualificationPoints.tgp.accumulated", 0] }, hlrConfig.requirements.tgp] }
        ]
      },
      "hlrQualification.rewardClaimed": { $ne: true }
    });

    // Get recent HLR awards
    const recentAwards = await User.find({
      "hlrQualification.rewardClaimed": true
    })
    .sort({ "hlrQualification.claimedAt": -1 })
    .limit(10)
    .select('firstName lastName country hlrQualification.claimedAt hlrQualification.claimReason');

    res.status(200).json({
      success: true,
      data: {
        config: hlrConfig,
        statistics: {
          totalQualified,
          totalRewardsClaimed,
          totalRewardsDistributed,
          pendingClaims
        },
        recentAwards: recentAwards.map(award => ({
          name: `${award.firstName} ${award.lastName}`,
          country: award.country,
          claimedAt: award.hlrQualification.claimedAt,
          claimReason: award.hlrQualification.claimReason
        }))
      }
    });
  } catch (error) {
    console.error("Error getting HLR management:", error);
    res.status(500).json({
      success: false,
      message: "Error getting HLR management",
      error: error.message
    });
  }
});

// ==================== Comprehensive User Earnings & Progress ====================

// Get comprehensive user earnings and progress from all MLM programs
export const getUserComprehensiveEarnings = asyncHandler(async (req, res) => {
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

    // Get user's transactions
    const userTransactions = mlm.transactions.filter(
      t => t.userId.toString() === userId
    );

    // Calculate DDR earnings by level
    const ddrEarnings = {
      level1: userTransactions.reduce((sum, t) => sum + (t.distribution.ddrLevel1 || 0), 0),
      level2: userTransactions.reduce((sum, t) => sum + (t.distribution.ddrLevel2 || 0), 0),
      level3: userTransactions.reduce((sum, t) => sum + (t.distribution.ddrLevel3 || 0), 0),
      level4: userTransactions.reduce((sum, t) => sum + (t.distribution.ddrLevel4 || 0), 0)
    };
    ddrEarnings.total = ddrEarnings.level1 + ddrEarnings.level2 + ddrEarnings.level3 + ddrEarnings.level4;

    // Calculate CRR earnings and progress using proper User model methods
    const qualificationStats = user.getQualificationPointsStats();
    const crrRankProgress = user.getCRRRankProgress();
    const crrEarnings = userTransactions.reduce((sum, t) => sum + (t.distribution.crr || 0), 0);
    
    // Update user's CRR rank if needed
    await user.updateCRRRank();

    const crrProgress = {
      currentRank: crrRankProgress.currentRank || 'No Rank',
      nextRank: crrRankProgress.nextRank || 'N/A',
      currentPoints: crrRankProgress.currentPoints,
      pointsToNext: crrRankProgress.pointsToNext,
      progressPercentage: Math.round(crrRankProgress.progressPercentage),
      tgpProgress: Math.round(crrRankProgress.tgpProgress),
      pgpProgress: Math.round(crrRankProgress.pgpProgress),
      status: crrRankProgress.status,
      isAchieved: crrRankProgress.isAchieved,
      rewardAmount: crrRankProgress.rewardAmount,
      earnings: crrEarnings
    };

    // Calculate HLR progress
    const hlrEarnings = userTransactions.reduce((sum, t) => sum + (t.distribution.hlr || 0), 0);
    const hlrProgress = {
      isQualified: qualificationStats.tgp.accumulated >= mlm.hlrConfig.requiredTGP && qualificationStats.pgp.accumulated >= mlm.hlrConfig.requiredPGP,
      requiredTGP: mlm.hlrConfig.requiredTGP,
      requiredPGP: mlm.hlrConfig.requiredPGP,
      currentTGP: qualificationStats.tgp.accumulated,
      currentPGP: qualificationStats.pgp.accumulated,
      monthlyTGP: qualificationStats.tgp.monthly,
      monthlyPGP: qualificationStats.pgp.monthly,
      tgpProgress: (qualificationStats.tgp.accumulated / mlm.hlrConfig.requiredTGP) * 100,
      pgpProgress: (qualificationStats.pgp.accumulated / mlm.hlrConfig.requiredPGP) * 100,
      earnings: hlrEarnings,
      rewardAmount: mlm.hlrConfig.rewardAmount
    };

    // Calculate BBR progress
    const bbrEarnings = userTransactions.reduce((sum, t) => sum + (t.distribution.bbr || 0), 0);
    const currentBBRCampaign = mlm.bbrCampaigns.current;
    let bbrProgress = {
      earnings: bbrEarnings,
      hasActiveCampaign: false
    };

    if (currentBBRCampaign && currentBBRCampaign.isActive && user.bbrParticipation?.currentCampaign) {
      const userParticipation = user.bbrParticipation.currentCampaign;
      const soloRides = userParticipation.soloRides || 0;
      const teamRides = userParticipation.teamRides || 0;
      const totalRides = soloRides + teamRides;
      
      bbrProgress = {
        ...bbrProgress,
        hasActiveCampaign: true,
        campaignName: currentBBRCampaign.name,
        totalRides,
        soloRides,
        teamRides,
        targetRides: currentBBRCampaign.requirement,
        progressPercentage: Math.min((totalRides / currentBBRCampaign.requirement) * 100, 100),
        ridesNeeded: Math.max(0, currentBBRCampaign.requirement - totalRides),
        rewardAmount: currentBBRCampaign.rewardAmount,
        endDate: currentBBRCampaign.endDate,
        achieved: userParticipation.achieved || false
      };
    }

    // Calculate Regional Ambassador progress
    const regionalEarnings = userTransactions.reduce((sum, t) => sum + (t.distribution.regionalAmbassador || 0), 0);
    const userRegional = user.regionalAmbassador;
    const regionalConfig = mlm.regionalAmbassadorConfig;
    
    const ranksArray = Array.from(regionalConfig.ranks.entries()).map(([name, details]) => ({
      name,
      level: details.level,
      minProgress: details.minProgress
    })).sort((a, b) => a.level - b.level);
    
    const currentRankDetails = ranksArray.find(rank => rank.name === userRegional.rank) || ranksArray[0];
    const nextRankDetails = ranksArray.find(rank => rank.level === (currentRankDetails.level + 1));
    
    const regionalProgress = {
      currentRank: userRegional.rank || 'Challenger',
      nextRank: nextRankDetails?.name || null,
      progress: userRegional.progress || 0,
      progressToNext: nextRankDetails ? Math.max(0, nextRankDetails.minProgress - userRegional.progress) : 0,
      progressPercentage: nextRankDetails ? Math.min((userRegional.progress / nextRankDetails.minProgress) * 100, 100) : 100,
      isAmbassador: userRegional.isAmbassador || false,
      isPermanent: userRegional.isPermanent || false,
      country: user.country,
      earnings: regionalEarnings
    };

    // Calculate total earnings
    const totalEarnings = ddrEarnings.total + crrEarnings + hlrEarnings + bbrEarnings + regionalEarnings;

    // Prepare summary
    const summary = {
      totalEarnings,
      totalTransactions: userTransactions.length,
      programsParticipating: [
        'DDR',
        ...(crrEarnings > 0 ? ['CRR'] : []),
        ...(hlrEarnings > 0 ? ['HLR'] : []),
        ...(bbrEarnings > 0 ? ['BBR'] : []),
        ...(regionalEarnings > 0 ? ['Regional Ambassador'] : [])
      ],
      lastActivity: userTransactions.length > 0 ? 
        userTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0].timestamp : null
    };

    res.status(200).json({
      success: true,
      data: {
        userId,
        summary,
        programs: {
          ddr: {
            earnings: ddrEarnings,
            description: "Direct Distribution Rewards - Earnings from your downline network"
          },
          crr: {
            progress: crrProgress,
            description: "Competitive Rank Rewards - Rank-based qualification rewards"
          },
          hlr: {
            progress: hlrProgress,
            description: "HonorPay Loyalty Rewards - Long-term loyalty benefits"
          },
          bbr: {
            progress: bbrProgress,
            description: "Bonus Booster Rewards - Campaign-based ride completion bonuses"
          },
          regionalAmbassador: {
            progress: regionalProgress,
            description: "Regional Ambassador Program - Country and global leadership rewards"
          }
        },
        recentTransactions: userTransactions
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 10)
          .map(t => ({
            timestamp: t.timestamp,
            rideId: t.rideId,
            totalAmount: (t.distribution.ddrLevel1 || 0) + (t.distribution.ddrLevel2 || 0) + 
                        (t.distribution.ddrLevel3 || 0) + (t.distribution.ddrLevel4 || 0) + 
                        (t.distribution.crr || 0) + (t.distribution.hlr || 0) + 
                        (t.distribution.bbr || 0) + (t.distribution.regionalAmbassador || 0),
            breakdown: {
              ddr: {
                level1: t.distribution.ddrLevel1 || 0,
                level2: t.distribution.ddrLevel2 || 0,
                level3: t.distribution.ddrLevel3 || 0,
                level4: t.distribution.ddrLevel4 || 0
              },
              crr: t.distribution.crr || 0,
              hlr: t.distribution.hlr || 0,
              bbr: t.distribution.bbr || 0,
              regionalAmbassador: t.distribution.regionalAmbassador || 0
            }
          }))
      }
    });
  } catch (error) {
    console.error("Error getting comprehensive user earnings:", error);
    res.status(500).json({
      success: false,
      message: "Error getting comprehensive user earnings",
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
    
    // Get user's CRR rank
    const currentCRRRank = user.crrRank?.current || 'None';
    const rankLevel = getCRRRankLevel(currentCRRRank);
    
    // Calculate progress based on CRR rank
    const progress = calculateRegionalProgress(currentCRRRank, regionalConfig);

    // Get user's position in country leaderboard
    const userPosition = await getUserCountryPosition(userId, user.country);

    // Get current country ambassador (highest CRR rank in country)
    const currentAmbassador = await getCurrentCountryAmbassador(user.country);

    // Check if user is the current ambassador for their country
    const isCurrentAmbassador = currentAmbassador && currentAmbassador._id && currentAmbassador._id.toString() === userId;

    // Get total regional earnings
    const totalEarnings = await calculateRegionalEarnings(userId);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          username: user.username,
          country: user.country,
          profilePicture: user.profilePicture
        },
        totalEarnings: totalEarnings,
        titleHolder: currentAmbassador ? {
          name: `${currentAmbassador.firstName} ${currentAmbassador.lastName}`,
          country: currentAmbassador.country,
          flag: getCountryFlag(currentAmbassador.country),
          rank: currentAmbassador.crrRank?.current || 'None',
          totalEarnings: currentAmbassador.totalEarnings || 0
        } : null,
        currentRank: {
          rank: currentCRRRank,
          level: rankLevel,
          icon: getCRRRankIcon(currentCRRRank)
        },
        victoryRank: currentCRRRank === 'BOSS' ? 'Tycoon' : null,
        progress: {
          percentage: progress
        },
        position: {
          rank: userPosition,
          country: user.country
        },
        isCurrentAmbassador: isCurrentAmbassador,
        isPermanentAmbassador: currentAmbassador?.isPermanent || false
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
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    const regionalConfig = mlm.regionalAmbassadorConfig;
    
    // Build match criteria
    const matchCriteria = {};
    if (country) {
      matchCriteria.country = country;
    }

    // Get users with CRR ranks (Regional Race) - only KYC Level 1+ approved users
    const leaderboard = await User.aggregate([
      {
        $match: {
          ...matchCriteria,
          kycLevel: { $gte: 1 },
          kycStatus: 'approved'
        }
      },
      {
        $addFields: {
          rankLevel: {
            $switch: {
              branches: [
                { case: { $eq: ["$crrRank.current", "None"] }, then: 0 },
                { case: { $eq: ["$crrRank.current", "Challenger"] }, then: 1 },
                { case: { $eq: ["$crrRank.current", "Warrior"] }, then: 2 },
                { case: { $eq: ["$crrRank.current", "Tycoon"] }, then: 3 },
                { case: { $eq: ["$crrRank.current", "CHAMPION"] }, then: 4 },
                { case: { $eq: ["$crrRank.current", "BOSS"] }, then: 5 }
              ],
              default: 0
            }
          },
          totalPoints: {
            $add: [
              { $ifNull: ["$qualificationPoints.pgp.accumulated", 0] },
              { $ifNull: ["$qualificationPoints.tgp.accumulated", 0] }
            ]
          }
        }
      },
      {
        $sort: { 
          rankLevel: -1,
          totalPoints: -1,
          "crrRank.lastUpdated": 1
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
          "crrRank.current": 1,
          "crrRank.lastUpdated": 1,
          rankLevel: 1,
          totalPoints: 1
        }
      }
    ]);

    // Get total count - only KYC Level 1+ approved users
    const totalUsers = await User.countDocuments({
      ...matchCriteria,
      kycLevel: { $gte: 1 },
      kycStatus: 'approved'
    });

    // Get user's position if userId provided
    let userPosition = null;
    if (userId) {
      userPosition = await getUserCountryPosition(userId, country);
    }

    res.status(200).json({
      success: true,
      data: {
        leaderboard: leaderboard.map((user, index) => ({
          rank: skip + index + 1,
          name: `${user.firstName} ${user.lastName}`,
          username: user.username,
          country: user.country,
          flag: getCountryFlag(user.country),
          profilePicture: user.profilePicture,
          crrRank: user.crrRank.current,
          rankIcon: getCRRRankIcon(user.crrRank.current),
          achievedAt: user.crrRank.lastUpdated,
          totalPoints: user.totalPoints
        })),
        userPosition: userPosition ? {
          rank: userPosition,
          country: country || 'All Countries'
        } : null,
        country: country || 'All Countries',
        pagination: {
          page,
          limit,
          total: totalUsers,
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
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Get all country ambassadors (highest CRR rank in each country)
    const globalAmbassadors = await getGlobalAmbassadorsList();

    // Apply pagination
    const paginatedAmbassadors = globalAmbassadors.slice(skip, skip + limit);

    res.status(200).json({
      success: true,
      data: {
        ambassadors: paginatedAmbassadors.map(ambassador => ({
          id: ambassador.userId,
          name: `${ambassador.firstName} ${ambassador.lastName}`,
          username: ambassador.username,
          profilePicture: ambassador.profilePicture,
          country: ambassador.country,
          flag: getCountryFlag(ambassador.country),
          rank: ambassador.crrRank,
          rankIcon: getCRRRankIcon(ambassador.crrRank),
          totalEarnings: ambassador.totalEarnings || 0,
          achievedAt: ambassador.achievedAt,
          isPermanent: ambassador.isPermanent || false
        })),
        totalAmbassadors: globalAmbassadors.length,
        totalCountries: new Set(globalAmbassadors.map(amb => amb.country)).size,
        pagination: {
          page,
          limit,
          total: globalAmbassadors.length,
          hasMore: paginatedAmbassadors.length === limit
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

// Helper functions for Regional Ambassador system
async function getCurrentCountryAmbassador(country) {
  try {
    const ambassador = await User.aggregate([
      {
        $match: { country: country }
      },
      {
        $addFields: {
          rankLevel: {
            $switch: {
              branches: [
                { case: { $eq: ["$crrRank.current", "None"] }, then: 0 },
                { case: { $eq: ["$crrRank.current", "Challenger"] }, then: 1 },
                { case: { $eq: ["$crrRank.current", "Warrior"] }, then: 2 },
                { case: { $eq: ["$crrRank.current", "Tycoon"] }, then: 3 },
                { case: { $eq: ["$crrRank.current", "CHAMPION"] }, then: 4 },
                { case: { $eq: ["$crrRank.current", "BOSS"] }, then: 5 }
              ],
              default: 0
            }
          }
        }
      },
      {
        $sort: { rankLevel: -1, "crrRank.lastUpdated": 1 }
      },
      {
        $limit: 1
      }
    ]);

    return ambassador.length > 0 ? ambassador[0] : null;
  } catch (error) {
    console.error("Error getting current country ambassador:", error);
    return null;
  }
}

async function getGlobalAmbassadorsList() {
  try {
    // Get the highest CRR rank user from each country - only KYC Level 1+ approved users
    const ambassadors = await User.aggregate([
      {
        $match: {
          kycLevel: { $gte: 1 },
          kycStatus: 'approved'
        }
      },
      {
        $addFields: {
          rankLevel: {
            $switch: {
              branches: [
                { case: { $eq: ["$crrRank.current", "None"] }, then: 0 },
                { case: { $eq: ["$crrRank.current", "Challenger"] }, then: 1 },
                { case: { $eq: ["$crrRank.current", "Warrior"] }, then: 2 },
                { case: { $eq: ["$crrRank.current", "Tycoon"] }, then: 3 },
                { case: { $eq: ["$crrRank.current", "CHAMPION"] }, then: 4 },
                { case: { $eq: ["$crrRank.current", "BOSS"] }, then: 5 }
              ],
              default: 0
            }
          }
        }
      },
      {
        $sort: { rankLevel: -1, "crrRank.lastUpdated": 1 }
      },
      {
        $group: {
          _id: "$country",
          userId: { $first: "$_id" },
          firstName: { $first: "$firstName" },
          lastName: { $first: "$lastName" },
          username: { $first: "$username" },
          profilePicture: { $first: "$profilePicture" },
          country: { $first: "$country" },
          crrRank: { $first: "$crrRank.current" },
          rankLevel: { $first: "$rankLevel" },
          achievedAt: { $first: "$crrRank.lastUpdated" },
          isPermanent: { $first: { $eq: ["$crrRank.current", "BOSS"] } }
        }
      },
      {
        $sort: { rankLevel: -1, achievedAt: 1 }
      }
    ]);

    return ambassadors;
  } catch (error) {
    console.error("Error getting global ambassadors list:", error);
    return [];
  }
}

async function calculateRegionalEarnings(userId) {
  try {
    // This would calculate regional earnings based on the user's position
    // For now, return a placeholder value
    return 1250.00; // Placeholder
  } catch (error) {
    console.error("Error calculating regional earnings:", error);
    return 0;
  }
}

// Helper functions for Regional Ambassador system
function getCRRRankLevel(rank) {
  const rankLevels = {
    'None': 0,
    'Challenger': 1,
    'Warrior': 2,
    'Tycoon': 3,
    'CHAMPION': 4,
    'BOSS': 5
  };
  return rankLevels[rank] || 0;
}

function getCRRRankIcon(rank) {
  const rankIcons = {
    'None': '🔒',
    'Challenger': '🥇',
    'Warrior': '🥈',
    'Tycoon': '🥉',
    'CHAMPION': '🏅',
    'BOSS': '🎖'
  };
  return rankIcons[rank] || '🔒';
}

function calculateRegionalProgress(currentRank, regionalConfig) {
  const rankLevel = getCRRRankLevel(currentRank);
  const maxLevel = 5; // BOSS rank
  return Math.round((rankLevel / maxLevel) * 100);
}



async function getUserCountryPosition(userId, country) {
  try {
    const matchCriteria = {
      ...(country ? { country } : {}),
      kycLevel: { $gte: 1 },
      kycStatus: 'approved'
    };
    
    const userPosition = await User.aggregate([
      {
        $match: matchCriteria
      },
      {
        $addFields: {
          rankLevel: {
            $switch: {
              branches: [
                { case: { $eq: ["$crrRank.current", "None"] }, then: 0 },
                { case: { $eq: ["$crrRank.current", "Challenger"] }, then: 1 },
                { case: { $eq: ["$crrRank.current", "Warrior"] }, then: 2 },
                { case: { $eq: ["$crrRank.current", "Tycoon"] }, then: 3 },
                { case: { $eq: ["$crrRank.current", "CHAMPION"] }, then: 4 },
                { case: { $eq: ["$crrRank.current", "BOSS"] }, then: 5 }
              ],
              default: 0
            }
          }
        }
      },
      {
        $sort: { rankLevel: -1, "crrRank.lastUpdated": 1 }
      },
      {
        $group: {
          _id: null,
          users: { $push: { userId: "$_id", rankLevel: "$rankLevel" } }
        }
      },
      {
        $unwind: { path: "$users", includeArrayIndex: "position" }
      },
      {
        $match: { "users.userId": new mongoose.Types.ObjectId(userId) }
      },
      {
        $project: { position: { $add: ["$position", 1] } }
      }
    ]);

    return userPosition.length > 0 ? userPosition[0].position : null;
  } catch (error) {
    console.error("Error getting user country position:", error);
    return null;
  }
}



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

// Get pending approvals and total MLM earnings
export const getPendingApprovalsAndEarnings = asyncHandler(async (req, res) => {
  try {
    // Use user ID from token instead of URL parameter
    const userId = req.user._id;
    
    // Get MLM system data
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Get user data
    const user = await User.findById(userId).select('mlmBalance firstName lastName email country');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Get pending country update requests for this user
    const pendingCountryRequests = mlm.regionalAmbassadorConfig.countryUpdateRequests.filter(
      req => req.userId.toString() === userId && req.status === 'pending'
    );

    // Calculate total MLM earnings
    const totalEarnings = {
      total: user.mlmBalance?.total || 0,
      userTree: user.mlmBalance?.userTree || 0,
      driverTree: user.mlmBalance?.driverTree || 0,
      transactions: user.mlmBalance?.transactions || []
    };

    // Get recent transactions (last 10)
    const recentTransactions = totalEarnings.transactions
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10)
      .map(transaction => ({
        rideId: transaction.rideId,
        amount: transaction.amount,
        type: transaction.type,
        timestamp: transaction.timestamp
      }));

    // Get pending KYC approvals count (if admin)
    let pendingKYCCount = 0;
    let systemTotalEarnings = null;
    
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
      pendingKYCCount = await User.countDocuments({ kycStatus: 'pending' });
      
      // Calculate total system MLM earnings for admin
      const systemTotals = {
        ddr: mlm.currentBalances.ddr || 0,
        crr: mlm.currentBalances.crr || 0,
        bbr: mlm.currentBalances.bbr || 0,
        hlr: mlm.currentBalances.hlr || 0,
        regionalAmbassador: mlm.currentBalances.regionalAmbassador || 0,
        porparleTeam: mlm.currentBalances.porparleTeam || 0,
        rop: mlm.currentBalances.rop || 0,
        companyOperations: mlm.currentBalances.companyOperations || 0,
        technologyPool: mlm.currentBalances.technologyPool || 0,
        foundationPool: mlm.currentBalances.foundationPool || 0,
        publicShare: mlm.currentBalances.publicShare || 0,
        netProfit: mlm.currentBalances.netProfit || 0
      };
      
      const totalSystemAmount = Object.values(systemTotals).reduce((sum, value) => sum + value, 0);
      
      systemTotalEarnings = {
        totalSystemAmount,
        sectionTotals: systemTotals,
        totalMLMTransactions: mlm.transactions?.length || 0,
        totalMLMAmount: mlm.totalAmount || 0
      };
    }

    const responseData = {
      user: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        country: user.country
      },
      pendingApprovals: {
        countryUpdateRequests: pendingCountryRequests.map(req => ({
          id: req._id,
          currentCountry: req.currentCountry,
          requestedCountry: req.requestedCountry,
          reason: req.reason,
          requestedAt: req.requestedAt,
          status: req.status
        })),
        totalPendingRequests: pendingCountryRequests.length,
        pendingKYCCount: pendingKYCCount
      },
      mlmEarnings: {
        totalEarnings: totalEarnings.total,
        userTreeEarnings: totalEarnings.userTree,
        driverTreeEarnings: totalEarnings.driverTree,
        totalTransactions: totalEarnings.transactions.length,
        recentTransactions: recentTransactions
      }
    };
    
    // Add system total earnings for admin users
    if (systemTotalEarnings) {
      responseData.systemTotalEarnings = systemTotalEarnings;
    }

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("Error getting pending approvals and earnings:", error);
    res.status(500).json({
      success: false,
      message: "Error getting pending approvals and earnings",
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

// Get CRR system overview with sub-distributions (Admin only)
export const getAdminCRROverview = asyncHandler(async (req, res) => {
  try {
    const mlm = await MLM.findOne().populate('transactions.userId', 'firstName lastName email country crrRank');
    
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Get all CRR transactions with user details
    const crrTransactions = mlm.transactions.filter(t => t.distribution.crr > 0);
    
    // Calculate CRR sub-distributions by rank
    const crrByRank = {
      'No Rank': { totalAmount: 0, userCount: 0, transactions: [], rewardAmount: 0 },
      Challenger: { totalAmount: 0, userCount: 0, transactions: [], rewardAmount: 1000 },
      Warrior: { totalAmount: 0, userCount: 0, transactions: [], rewardAmount: 5000 },
      Tycoon: { totalAmount: 0, userCount: 0, transactions: [], rewardAmount: 20000 },
      Champion: { totalAmount: 0, userCount: 0, transactions: [], rewardAmount: 50000 },
      Boss: { totalAmount: 0, userCount: 0, transactions: [], rewardAmount: 200000 }
    };
    
    // Get all users (including those without CRR ranks)
    const allUsers = await User.find({})
      .select('firstName lastName email country crrRank qualificationPoints')
      .sort({ 'crrRank.current': 1, 'qualificationPoints.tgp.accumulated': -1, 'qualificationPoints.pgp.accumulated': -1 });
    
    // Get users with CRR ranks
    const usersWithCRR = allUsers.filter(user => user.crrRank && user.crrRank.current);
    
    // Process CRR transactions
    crrTransactions.forEach(transaction => {
      if (transaction.userId && transaction.userId.crrRank) {
        const userRank = transaction.userId.crrRank.current;
        if (crrByRank[userRank]) {
          crrByRank[userRank].totalAmount += transaction.distribution.crr;
          crrByRank[userRank].transactions.push({
            userId: transaction.userId._id,
            userName: `${transaction.userId.firstName} ${transaction.userId.lastName}`,
            email: transaction.userId.email,
            country: transaction.userId.country,
            amount: transaction.distribution.crr,
            rideId: transaction.rideId,
            timestamp: transaction.timestamp
          });
        }
      }
    });
    
    // Count users by rank (including those without ranks)
    allUsers.forEach(user => {
      const rank = (user.crrRank && user.crrRank.current) ? user.crrRank.current : 'No Rank';
      if (crrByRank[rank]) {
        crrByRank[rank].userCount++;
      }
    });
    
    // Get Regional Ambassadors based on CRR Boss rank
    const bossRegionalAmbassadors = await User.find({
      'crrRank.current': 'Boss',
      'regionalAmbassador.crrRankBased': true
    }).select('firstName lastName email country regionalAmbassador crrRank qualificationPoints');
    
    // Calculate total CRR pool and distribution
    const totalCRRAmount = mlm.currentBalances.crr;
    const totalCRRDistributed = Object.values(crrByRank).reduce((sum, rank) => sum + rank.totalAmount, 0);
    
    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalCRRPool: totalCRRAmount,
          totalDistributed: totalCRRDistributed,
          remainingPool: totalCRRAmount - totalCRRDistributed,
          distributionPercentage: mlm.crr
        },
        rankDistribution: crrByRank,
        usersByRank: {
          'No Rank': allUsers.filter(u => !u.crrRank || !u.crrRank.current).length,
          Challenger: allUsers.filter(u => u.crrRank && u.crrRank.current === 'Challenger').length,
          Warrior: allUsers.filter(u => u.crrRank && u.crrRank.current === 'Warrior').length,
          Tycoon: allUsers.filter(u => u.crrRank && u.crrRank.current === 'Tycoon').length,
          Champion: allUsers.filter(u => u.crrRank && u.crrRank.current === 'Champion').length,
          Boss: allUsers.filter(u => u.crrRank && u.crrRank.current === 'Boss').length
        },
        regionalAmbassadors: {
          total: bossRegionalAmbassadors.length,
          permanent: bossRegionalAmbassadors.filter(u => u.regionalAmbassador.isPermanent).length,
          list: bossRegionalAmbassadors.map(user => ({
            userId: user._id,
            name: `${user.firstName} ${user.lastName}`,
            email: user.email,
            country: user.country,
            isPermanent: user.regionalAmbassador.isPermanent,
            rank: user.regionalAmbassador.rank,
            totalEarnings: user.regionalAmbassador.totalEarnings,
            bossAchievedAt: user.regionalAmbassador.diamondAchievedAt,
            qualificationPoints: user.qualificationPoints,
            rewardAmount: user.crrRank.rewardAmount
          }))
        },
        recentTransactions: crrTransactions.slice(-20).reverse()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get detailed CRR rank analysis (Admin only)
export const getCRRRankAnalysis = asyncHandler(async (req, res) => {
  try {
    const { rank } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    if (!['Challenger', 'Warrior', 'Tycoon', 'Champion', 'Boss'].includes(rank)) {
      return res.status(400).json({
        success: false,
        message: "Invalid CRR rank specified"
      });
    }
    
    // Get users with specific CRR rank
    const users = await User.find({ 'crrRank.current': rank })
      .select('firstName lastName email country crrRank qualificationPoints regionalAmbassador')
      .sort({ 'qualificationPoints.tgp.accumulated': -1, 'qualificationPoints.pgp.accumulated': -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const totalUsers = await User.countDocuments({ 'crrRank.current': rank });
    
    // Get MLM transactions for these users
    const mlm = await MLM.findOne();
    const userIds = users.map(u => u._id);
    const crrTransactions = mlm.transactions.filter(t => 
      userIds.some(id => id.equals(t.userId)) && t.distribution.crr > 0
    );
    
    // Calculate earnings by user
    const userEarnings = {};
    crrTransactions.forEach(transaction => {
      const userId = transaction.userId.toString();
      if (!userEarnings[userId]) {
        userEarnings[userId] = 0;
      }
      userEarnings[userId] += transaction.distribution.crr;
    });
    
    const usersWithEarnings = users.map(user => ({
      userId: user._id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      country: user.country,
      crrRank: user.crrRank,
      qualificationPoints: user.qualificationPoints,
      totalCRREarnings: userEarnings[user._id.toString()] || 0,
      isRegionalAmbassador: user.regionalAmbassador?.isAmbassador || false,
      isPermanentAmbassador: user.regionalAmbassador?.isPermanent || false
    }));
    
    res.status(200).json({
      success: true,
      data: {
        rank,
        users: usersWithEarnings,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalUsers / limit),
          totalUsers,
          limit: parseInt(limit)
        },
        summary: {
          totalUsers,
          totalEarnings: Object.values(userEarnings).reduce((sum, earnings) => sum + earnings, 0),
          averageEarnings: totalUsers > 0 ? Object.values(userEarnings).reduce((sum, earnings) => sum + earnings, 0) / totalUsers : 0,
          regionalAmbassadors: usersWithEarnings.filter(u => u.isRegionalAmbassador).length
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



// Get comprehensive user MLM dashboard with all earnings breakdown
export const getUserMLMDashboard = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }

    // Validate ObjectId format
    const mongoose = await import('mongoose');
    if (!mongoose.default.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId format. Must be a valid MongoDB ObjectId."
      });
    }

    // Get user with all MLM data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Get MLM system data
    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Calculate DDR earnings by level
    const ddrEarnings = {
      level1: 0,
      level2: 0,
      level3: 0,
      level4: 0,
      total: 0
    };

    // Get DDR transactions from wallet
    if (user.wallet && user.wallet.transactions) {
      user.wallet.transactions.forEach(transaction => {
        if (transaction.description && transaction.description.includes('DDR')) {
          const levelMatch = transaction.description.match(/Level (\d+)/);
          if (levelMatch) {
            const level = parseInt(levelMatch[1]);
            if (level >= 1 && level <= 4) {
              ddrEarnings[`level${level}`] += transaction.amount;
              ddrEarnings.total += transaction.amount;
            }
          }
        }
      });
    }

    // Get qualification points stats
    const qualificationStats = user.getQualificationPointsStats ? user.getQualificationPointsStats() : {
      pgp: { accumulated: 0, current: 0 },
      tgp: { accumulated: 0, current: 0 },
      total: { accumulated: 0, current: 0 }
    };

    // Calculate CRR earnings based on rank achievement, not qualification points
    const crrEarnings = {
      pgpEarnings: qualificationStats.pgp.accumulated, // Keep for reference
      tgpEarnings: qualificationStats.tgp.accumulated, // Keep for reference
      totalEarnings: user.crrRank?.rewardAmount || 0, // Use rank-based reward amount instead of points
      currentRank: user.crrRank?.current || 'None',
      nextRank: null,
      progressToNext: 0
    };

    // Calculate progress to next rank
    const rankThresholds = mlm.rankThresholds || {
      Bronze: { min: 0, max: 999 },
      Silver: { min: 1000, max: 4999 },
      Gold: { min: 5000, max: 19999 },
      Platinum: { min: 20000, max: 49999 },
      Diamond: { min: 50000, max: Infinity }
    };

    const currentRankData = rankThresholds[crrEarnings.currentRank];
    if (currentRankData) {
      const nextRanks = Object.keys(rankThresholds);
      const currentIndex = nextRanks.indexOf(crrEarnings.currentRank);
      if (currentIndex < nextRanks.length - 1) {
        const nextRank = nextRanks[currentIndex + 1];
        const nextRankData = rankThresholds[nextRank];
        crrEarnings.nextRank = nextRank;
        crrEarnings.progressToNext = Math.min(100, ((qualificationStats.total.accumulated - currentRankData.min) / (nextRankData.min - currentRankData.min)) * 100);
      }
    }

    // Get BBR earnings and progress
    const bbrEarnings = {
      currentCampaign: null,
      totalWins: user.bbrParticipation?.totalWins || 0,
      totalRewardsEarned: user.bbrParticipation?.totalRewardsEarned || 0,
      currentProgress: {
        totalRides: 0,
        soloRides: 0,
        teamRides: 0,
        achieved: false
      }
    };

    if (user.bbrParticipation?.currentCampaign) {
      bbrEarnings.currentCampaign = {
        campaignId: user.bbrParticipation.currentCampaign.campaignId,
        totalRides: user.bbrParticipation.currentCampaign.totalRides || 0,
        soloRides: user.bbrParticipation.currentCampaign.soloRides || 0,
        teamRides: user.bbrParticipation.currentCampaign.teamRides || 0,
        achieved: user.bbrParticipation.currentCampaign.achieved || false,
        joinedAt: user.bbrParticipation.currentCampaign.joinedAt
      };
      bbrEarnings.currentProgress = {
        totalRides: user.bbrParticipation.currentCampaign.totalRides || 0,
        soloRides: user.bbrParticipation.currentCampaign.soloRides || 0,
        teamRides: user.bbrParticipation.currentCampaign.teamRides || 0,
        achieved: user.bbrParticipation.currentCampaign.achieved || false
      };
    }

    // Get HLR earnings and qualification
    const hlrEarnings = {
      isQualified: user.hlrQualification?.isQualified || false,
      qualifiedAt: user.hlrQualification?.qualifiedAt,
      totalEarnings: user.hlrQualification?.totalEarnings || 0,
      progress: {
        pgpPoints: user.hlrQualification?.progress?.pgpPoints || 0,
        tgpPoints: user.hlrQualification?.progress?.tgpPoints || 0,
        overallProgress: user.hlrQualification?.progress?.overallProgress || 0
      },
      requirements: {
        requiredPGP: mlm.hlrConfig?.requiredPGP || 50000,
        requiredTGP: mlm.hlrConfig?.requiredTGP || 50000
      }
    };

    // Get Regional Ambassador earnings and status
    const regionalAmbassadorEarnings = {
      currentRank: user.regionalAmbassador?.currentRank || 'Challenger',
      totalEarnings: user.regionalAmbassador?.totalEarnings || 0,
      isAmbassador: user.regionalAmbassador?.isAmbassador || false,
      isPermanent: user.regionalAmbassador?.isPermanent || false,
      lastUpdated: user.regionalAmbassador?.lastUpdated,
      nextRank: null,
      progressToNext: 0
    };

    // Calculate Regional Ambassador progress
    if (mlm.regionalAmbassadorConfig?.ranks) {
      const ranks = Array.from(mlm.regionalAmbassadorConfig.ranks.entries());
      const currentRank = ranks.find(([name]) => name === regionalAmbassadorEarnings.currentRank);
      const nextRank = ranks.find(([name, details]) => details.level === (currentRank[1].level + 1));
      
      if (nextRank) {
        regionalAmbassadorEarnings.nextRank = nextRank[0];
        regionalAmbassadorEarnings.progressToNext = Math.min(100, (regionalAmbassadorEarnings.totalEarnings / nextRank[1].minProgress) * 100);
      }
    }

    // Get recent transactions (last 10)
    const recentTransactions = user.wallet?.transactions?.slice(-10).reverse() || [];

    // Calculate total earnings
    const totalEarnings = {
      ddr: ddrEarnings.total,
      crr: crrEarnings.totalEarnings, // Now using rank-based reward amount
      bbr: bbrEarnings.totalRewardsEarned,
      hlr: hlrEarnings.totalEarnings,
      regionalAmbassador: regionalAmbassadorEarnings.totalEarnings,
      countryAmbassador: 0.00, // Added COUNTRY Ambassador field
      total: ddrEarnings.total + crrEarnings.totalEarnings + bbrEarnings.totalRewardsEarned + hlrEarnings.totalEarnings + regionalAmbassadorEarnings.totalEarnings + 0.00 // Added countryAmbassador to total
    };

    // Prepare response
    const dashboardData = {
      user: {
        id: user._id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        country: user.country,
        sponsorId: user.sponsorId,
        joinedAt: user.createdAt
      },
      wallet: {
        currentBalance: user.wallet?.balance || 0,
        totalEarnings: totalEarnings.total,
        totalEarned: totalEarnings.total
      },
      ddr: {
        earnings: ddrEarnings,
        levelBreakdown: {
          level1: { amount: ddrEarnings.level1, percentage: ddrEarnings.total > 0 ? (ddrEarnings.level1 / ddrEarnings.total * 100).toFixed(2) : 0 },
          level2: { amount: ddrEarnings.level2, percentage: ddrEarnings.total > 0 ? (ddrEarnings.level2 / ddrEarnings.total * 100).toFixed(2) : 0 },
          level3: { amount: ddrEarnings.level3, percentage: ddrEarnings.total > 0 ? (ddrEarnings.level3 / ddrEarnings.total * 100).toFixed(2) : 0 },
          level4: { amount: ddrEarnings.level4, percentage: ddrEarnings.total > 0 ? (ddrEarnings.level4 / ddrEarnings.total * 100).toFixed(2) : 0 }
        }
      },
      crr: {
        earnings: {
          pgpEarnings: qualificationStats.pgp.accumulated, // Points for reference
          tgpEarnings: qualificationStats.tgp.accumulated, // Points for reference
          totalEarnings: user.crrRank?.rewardAmount || 0, // Rank-based reward amount
          currentRank: user.crrRank?.current || 'None',
          nextRank: crrEarnings.nextRank,
          progressToNext: crrEarnings.progressToNext,
          rewardClaimed: user.crrRank?.rewardClaimed || false // Add reward claim status
        },
        qualificationPoints: qualificationStats,
        rankProgress: {
          current: user.crrRank?.current || 'None',
          next: crrEarnings.nextRank,
          progress: crrEarnings.progressToNext
        }
      },
      bbr: {
        earnings: bbrEarnings,
        currentCampaign: bbrEarnings.currentCampaign
      },
      hlr: {
        earnings: hlrEarnings,
        qualification: {
          isQualified: hlrEarnings.isQualified,
          qualifiedAt: hlrEarnings.qualifiedAt
        }
      },
      regionalAmbassador: {
        earnings: regionalAmbassadorEarnings,
        status: {
          currentRank: regionalAmbassadorEarnings.currentRank,
          nextRank: regionalAmbassadorEarnings.nextRank,
          progress: regionalAmbassadorEarnings.progressToNext,
          isAmbassador: regionalAmbassadorEarnings.isAmbassador,
          isPermanent: regionalAmbassadorEarnings.isPermanent
        }
      },
      countryAmbassador: {
        earnings: 0.00,
        status: {
          isAmbassador: false,
          isPermanent: false
        }
      },
      summary: {
        totalEarnings: totalEarnings,
        totalEarned: totalEarnings.total,
        earningsBreakdown: {
          ddr: { amount: totalEarnings.ddr, percentage: totalEarnings.total > 0 ? (totalEarnings.ddr / totalEarnings.total * 100).toFixed(2) : 0 },
          crr: { amount: totalEarnings.crr, percentage: totalEarnings.total > 0 ? (totalEarnings.crr / totalEarnings.total * 100).toFixed(2) : 0 },
          bbr: { amount: totalEarnings.bbr, percentage: totalEarnings.total > 0 ? (totalEarnings.bbr / totalEarnings.total * 100).toFixed(2) : 0 },
          hlr: { amount: totalEarnings.hlr, percentage: totalEarnings.total > 0 ? (totalEarnings.hlr / totalEarnings.total * 100).toFixed(2) : 0 },
          regionalAmbassador: { amount: totalEarnings.regionalAmbassador, percentage: totalEarnings.total > 0 ? (totalEarnings.regionalAmbassador / totalEarnings.total * 100).toFixed(2) : 0 },
          countryAmbassador: { amount: totalEarnings.countryAmbassador, percentage: totalEarnings.total > 0 ? (totalEarnings.countryAmbassador / totalEarnings.total * 100).toFixed(2) : 0 }
        }
      },
      recentTransactions: recentTransactions.map(tx => ({
        amount: tx.amount,
        type: tx.type,
        description: tx.description,
        timestamp: tx.timestamp
      }))
    };

    res.status(200).json({
      success: true,
      message: "User MLM dashboard retrieved successfully",
      data: dashboardData
    });

  } catch (error) {
    console.error("Error getting user MLM dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Error getting user MLM dashboard",
      error: error.message
    });
  }
});

// Get comprehensive BBR dashboard for user
export const getBBRDashboard = asyncHandler(async (req, res) => {
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

    const currentCampaign = mlm.bbrCampaigns.current;
    if (!currentCampaign || !currentCampaign.isActive) {
      return res.status(200).json({
        success: true,
        data: {
          currentCampaign: null,
          progress: null,
          leaderboard: [],
          pastWins: [],
          tips: mlm.bbrTips || []
        }
      });
    }

    // Get user progress
    const userParticipation = user.bbrParticipation?.currentCampaign;
    let progress = null;
    
    if (userParticipation && userParticipation.campaignId?.toString() === currentCampaign._id.toString()) {
      const soloRides = userParticipation.soloRides || 0;
      const teamRides = userParticipation.teamRides || 0;
      const totalRides = soloRides + teamRides;
      const progressPercentage = Math.min((totalRides / currentCampaign.requirement) * 100, 100);
      
      // Calculate time left
      const now = new Date();
      const timeLeft = currentCampaign.endDate - now;
      const daysLeft = Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24)));
      const hoursLeft = Math.max(0, Math.ceil((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
      
      // Calculate daily target
      const ridesNeeded = Math.max(0, currentCampaign.requirement - totalRides);
      const dailyTarget = daysLeft > 0 ? Math.ceil(ridesNeeded / daysLeft) : ridesNeeded;

      progress = {
        totalRides,
        soloRides,
        teamRides,
        progressPercentage,
        ridesNeeded,
        dailyTarget,
        timeLeft: {
          days: daysLeft,
          hours: hoursLeft
        },
        isQualified: totalRides >= currentCampaign.requirement
      };
    } else {
      // User not participating in current campaign
      const now = new Date();
      const timeLeft = currentCampaign.endDate - now;
      const daysLeft = Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24)));
      const hoursLeft = Math.max(0, Math.ceil((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));

      progress = {
        totalRides: 0,
        soloRides: 0,
        teamRides: 0,
        progressPercentage: 0,
        ridesNeeded: currentCampaign.requirement,
        dailyTarget: currentCampaign.requirement,
        timeLeft: {
          days: daysLeft,
          hours: hoursLeft
        },
        isQualified: false
      };
    }

    // Get leaderboard
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
              { $ifNull: ["$bbrParticipation.currentCampaign.soloRides", 0] },
              { $ifNull: ["$bbrParticipation.currentCampaign.teamRides", 0] }
            ]
          }
        }
      },
      {
        $sort: { totalRides: -1 }
      },
      {
        $limit: 10
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

    // Get user's position
    let userPosition = null;
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
              { $ifNull: ["$bbrParticipation.currentCampaign.soloRides", 0] },
              { $ifNull: ["$bbrParticipation.currentCampaign.teamRides", 0] }
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

    // Get past wins
    const pastWins = user.bbrParticipation?.history
      ?.filter(campaign => campaign.isWinner)
      .sort((a, b) => new Date(b.completedAt || b.participatedAt) - new Date(a.completedAt || a.participatedAt))
      .slice(0, 10) || [];

    // Format campaign data
    const campaignData = {
      name: currentCampaign.name,
      requirement: currentCampaign.requirement,
      duration: currentCampaign.duration,
      startDate: currentCampaign.startDate,
      endDate: currentCampaign.endDate,
      type: currentCampaign.type,
      newbieRidesOnly: currentCampaign.newbieRidesOnly,
      reward: currentCampaign.reward,
      period: `${new Date(currentCampaign.startDate).toLocaleDateString()} – ${new Date(currentCampaign.endDate).toLocaleDateString()}`
    };
    
    res.status(200).json({
      success: true,
      data: {
        currentCampaign: campaignData,
        progress,
        leaderboard: leaderboard.map((user, index) => ({
          rank: index + 1,
          name: `${user.firstName} ${user.lastName}`,
          rides: user.totalRides,
          status: user.isQualified ? 'Achieved' : 'Locked',
          reward: currentCampaign.reward.amount
        })),
        userPosition: userPosition ? {
          rank: userPosition.position,
          rides: userPosition.totalRides,
          status: progress.isQualified ? 'Achieved' : 'Locked',
          reward: currentCampaign.reward.amount
        } : null,
        pastWins: pastWins.map(win => ({
          name: win.campaignName || 'BBR Campaign',
          status: 'Achieved',
          reward: win.rewardAmount,
          date: win.completedAt || win.participatedAt
        })),
        tips: mlm.bbrTips || []
      }
    });
  } catch (error) {
    console.error("Error getting BBR dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Error getting BBR dashboard",
      error: error.message
    });
  }
});