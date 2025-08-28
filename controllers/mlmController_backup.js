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
      rideType: 'personal',
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
        rideType: 'personal',
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
          rideType: 'team',
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
        
        // Calculate the amount for this level - split between user and driver contributions
        const userDdrAmount = (userMlmAmount * levelPercentage) / 100;
        const driverDdrAmount = (driverMlmAmount * levelPercentage) / 100;
        const ddrLevelAmount = userDdrAmount + driverDdrAmount;
        
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
            user: userDdrAmount,
            driver: driverDdrAmount
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
            rideType: 'team',
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
      userMlmDistribution = mlm.addMoney(userId, userMlmAmount, rideId, 'user_' + rideType);
      
      // Add the driver's MLM amount to the MLM system if driver exists
      if (driver) {
        driverMlmDistribution = mlm.addMoney(driverId, driverMlmAmount, rideId, 'driver_' + rideType);
      }
      
      // Save the MLM model
      await mlm.save();
    } catch (error) {
      console.error('Error in MLM distribution:', error);
      throw new Error(`MLM distribution error: ${error.message}`);
    }

    // Update BBR team rides for sponsors (only count team members who registered after campaign creation)
    const activeBBRCampaign = mlm.bbrCampaigns?.current;
    if (activeBBRCampaign && activeBBRCampaign.isActive) {
      const campaignStartDate = new Date(activeBBRCampaign.startDate);
      
      // Update BBR participation for user's upline sponsors if user registered after campaign start
      if (user.createdAt > campaignStartDate) {
        for (let level = 1; level <= 4; level++) {
          const sponsor = userUpline[`level${level}`];
          if (sponsor) {
            // Update sponsor's BBR participation
            if (!sponsor.bbrParticipation) {
              sponsor.bbrParticipation = {
                currentCampaign: {
                  campaignId: activeBBRCampaign._id,
                  totalRides: 0,
                  achieved: false,
                  joinedAt: new Date(),
                  lastRideAt: null
                },
                totalWins: 0,
                totalRewardsEarned: 0,
                history: []
              };
            }
            
            if (!sponsor.bbrParticipation.currentCampaign || 
                !sponsor.bbrParticipation.currentCampaign.campaignId ||
                sponsor.bbrParticipation.currentCampaign.campaignId.toString() !== activeBBRCampaign._id.toString()) {
              sponsor.bbrParticipation.currentCampaign = {
                campaignId: activeBBRCampaign._id,
                totalRides: 0,
                achieved: false,
                joinedAt: new Date(),
                lastRideAt: null
              };
            }
            
            // Increment team rides for sponsor
            if (!sponsor.bbrParticipation.currentCampaign.teamRides) {
              sponsor.bbrParticipation.currentCampaign.teamRides = 0;
            }
            sponsor.bbrParticipation.currentCampaign.teamRides += 1;
            sponsor.bbrParticipation.currentCampaign.totalRides = 
              (sponsor.bbrParticipation.currentCampaign.soloRides || 0) + 
              sponsor.bbrParticipation.currentCampaign.teamRides;
            sponsor.bbrParticipation.currentCampaign.lastRideAt = new Date();
            
            await sponsor.save();
          }
        }
      }
      
      // Update team rides for driver's upline sponsors if driver exists and registered after campaign start
      if (driver && userId !== driverId && driver.createdAt > campaignStartDate) {
        for (let level = 1; level <= 4; level++) {
          const sponsor = driverUpline[`level${level}`];
          if (sponsor) {
            // Update sponsor's BBR participation
            if (!sponsor.bbrParticipation) {
              sponsor.bbrParticipation = {
                currentCampaign: {
                  campaignId: activeBBRCampaign._id,
                  totalRides: 0,
                  achieved: false,
                  joinedAt: new Date(),
                  lastRideAt: null
                },
                totalWins: 0,
                totalRewardsEarned: 0,
                history: []
              };
            }
            
            if (!sponsor.bbrParticipation.currentCampaign || 
                !sponsor.bbrParticipation.currentCampaign.campaignId ||
                sponsor.bbrParticipation.currentCampaign.campaignId.toString() !== activeBBRCampaign._id.toString()) {
              sponsor.bbrParticipation.currentCampaign = {
                campaignId: activeBBRCampaign._id,
                totalRides: 0,
                achieved: false,
                joinedAt: new Date(),
                lastRideAt: null
              };
            }
            
            // Increment team rides for sponsor
            if (!sponsor.bbrParticipation.currentCampaign.teamRides) {
              sponsor.bbrParticipation.currentCampaign.teamRides = 0;
            }
            sponsor.bbrParticipation.currentCampaign.teamRides += 1;
            sponsor.bbrParticipation.currentCampaign.totalRides = 
              (sponsor.bbrParticipation.currentCampaign.soloRides || 0) + 
              sponsor.bbrParticipation.currentCampaign.teamRides;
            sponsor.bbrParticipation.currentCampaign.lastRideAt = new Date();
            
            await sponsor.save();
          }
        }
      }
      
      // Update user's own BBR participation for solo rides
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
      
      // Increment solo rides for user
      if (!user.bbrParticipation.currentCampaign.soloRides) {
        user.bbrParticipation.currentCampaign.soloRides = 0;
      }
      user.bbrParticipation.currentCampaign.soloRides += 1;
      user.bbrParticipation.currentCampaign.totalRides = 
        user.bbrParticipation.currentCampaign.soloRides + 
        (user.bbrParticipation.currentCampaign.teamRides || 0);
      user.bbrParticipation.currentCampaign.lastRideAt = new Date();
      
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

    // Get CRR ranks configuration
    const crrRanks = mlm.crrRanks || {
      Challenger: { requirements: { pgp: 2500, tgp: 50000 }, reward: 1000, icon: "🥇" },
      Warrior: { requirements: { pgp: 5000, tgp: 100000 }, reward: 5000, icon: "🥈" },
      Tycoon: { requirements: { pgp: 10000, tgp: 200000 }, reward: 20000, icon: "🥉" },
      CHAMPION: { requirements: { pgp: 25000, tgp: 500000 }, reward: 50000, icon: "🏅" },
      BOSS: { requirements: { pgp: 50000, tgp: 1000000 }, reward: 200000, icon: "🎖" }
    };

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
      
      return {
        rank: rankName,
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
      
      // Calculate CRR earnings (1 PGP = 1 AED, 1 TGP = 1 AED)
      const totalCRREarnings = stats.pgp.accumulated + stats.tgp.accumulated;
      
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
          total: stats.total.accumulated
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
    const formattedTopEarners = topEarners.map(user => ({
      position: user.position,
      name: user.name,
      rank: user.rank,
      rankIcon: user.rankIcon,
      earnings: user.totalCRREarnings,
      qualificationPoints: user.qualificationPoints,
      progress: user.rankProgress.progress
    }));

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
            rank: currentUserPosition.rank,
            rankIcon: currentUserPosition.rankIcon,
            earnings: currentUserPosition.totalCRREarnings,
            isHighlighted: true,
            isInTopList: currentUserPosition.isInTopList
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

    // Calculate time left
    const now = new Date();
    const timeLeft = currentCampaign.endDate - now;
    const daysLeft = Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24)));
    const hoursLeft = Math.max(0, Math.ceil((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));

    res.status(200).json({
      success: true,
      data: {
        ...currentCampaign.toObject(),
        timeLeft: {
          days: daysLeft,
          hours: hoursLeft
        }
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
    const userParticipation = user.bbrParticipation?.currentCampaign;
    
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
    const pastWins = user.bbrParticipation?.history
      ?.filter(campaign => campaign.isWinner)
      .sort((a, b) => new Date(b.completedAt || b.participatedAt) - new Date(a.completedAt || a.participatedAt))
      .slice(skip, skip + limit) || [];

    res.status(200).json({
      success: true,
      data: {
        pastWins,
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
    const { name, requirement, duration, reward, type, newbieRidesOnly } = req.body;
    
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

// Admin: End current BBR campaign
export const endBBRCampaign = asyncHandler(async (req, res) => {
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
        message: "No active BBR campaign to end"
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
      message: "BBR campaign ended successfully",
      data: {
        campaign: currentCampaign,
        winners: qualifiedUsers.length,
        totalRewardDistributed: currentCampaign.totalRewardDistributed
      }
    });
  } catch (error) {
    console.error("Error ending BBR campaign:", error);
    res.status(500).json({
      success: false,
      message: "Error ending BBR campaign",
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
    const currentPGP = userQualification.progress?.pgpPoints || 0;
    const currentTGP = userQualification.progress?.tgpPoints || 0;
    const pgpProgress = Math.min((currentPGP / hlrConfig.requiredPGP) * 100, 100);
    const tgpProgress = Math.min((currentTGP / hlrConfig.requiredTGP) * 100, 100);
    const overallProgress = Math.min(((pgpProgress + tgpProgress) / 2), 100);
    
    // Check if user is qualified
    const isQualified = currentPGP >= hlrConfig.requiredPGP && 
                       currentTGP >= hlrConfig.requiredTGP;
    
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
          currentPGP,
          currentTGP,
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
          { $gte: ["$hlrQualification.progress.pgpPoints", hlrConfig.requiredPGP] },
          { $gte: ["$hlrQualification.progress.tgpPoints", hlrConfig.requiredTGP] }
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
            $add: ["$hlrQualification.progress.pgpPoints", "$hlrQualification.progress.tgpPoints"]
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
          "hlrQualification.progress.pgpPoints": 1,
          "hlrQualification.progress.tgpPoints": 1,
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
    const currentPGP = userQualification.progress?.pgpPoints || 0;
    const currentTGP = userQualification.progress?.tgpPoints || 0;
    const isQualified = currentPGP >= hlrConfig.requiredPGP && 
                       currentTGP >= hlrConfig.requiredTGP;
    
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
    const userRegional = user.regionalAmbassador;
    
    // Convert Map to Array for easier processing
    const ranksArray = Array.from(regionalConfig.ranks.entries()).map(([name, details]) => ({
      name,
      level: details.level,
      minProgress: details.minProgress
    })).sort((a, b) => a.level - b.level);
    
    // Find current rank details
    const currentRankDetails = ranksArray.find(rank => rank.name === userRegional.rank) || ranksArray[0];
    const nextRankDetails = ranksArray.find(rank => rank.level === (currentRankDetails.level + 1));
    
    // Calculate progress to next rank
    let progressPercentage = 0;
    if (nextRankDetails) {
      progressPercentage = Math.min((userRegional.progress / nextRankDetails.minProgress) * 100, 100);
    } else {
      progressPercentage = 100; // Already at highest rank
    }
    
    // Get current title holder for user's country
    const titleHolder = regionalConfig.ambassadors.find(amb => amb.country === user.country && amb.isActive);
    
    // Check if user is a victory rank holder (Boss rank + CRR-based)
    const isVictoryRank = userRegional.rank === 'Boss' && userRegional.crrRankBased;
    
    // Get achievement details
    const achievements = {
      isAmbassador: userRegional.isAmbassador,
      isPermanent: userRegional.isPermanent,
      isVictoryRank: isVictoryRank,
      crrRankBased: userRegional.crrRankBased,
      achievedAt: userRegional.achievedAt,
      diamondAchievedAt: userRegional.diamondAchievedAt
    };

    res.status(200).json({
      success: true,
      data: {
        totalEarnings: userRegional.totalEarnings || 0,
        progress: userRegional.progress || 0,
        titleHolder: titleHolder || null,
        currentRank: {
          name: userRegional.rank || 'Challenger',
          level: currentRankDetails.level,
          country: user.country,
          countryRank: userRegional.countryRank,
          globalRank: userRegional.globalRank
        },
        nextRank: nextRankDetails ? {
          name: nextRankDetails.name,
          level: nextRankDetails.level,
          minProgress: nextRankDetails.minProgress
        } : null,
        progressToNext: {
          percentage: progressPercentage,
          progressNeeded: nextRankDetails ? Math.max(0, nextRankDetails.minProgress - userRegional.progress) : 0
        },
        achievements: achievements,
        allRanks: ranksArray,
        isActive: userRegional.isActive
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
    
    // Convert ranks Map to object for aggregation
    const ranksObj = Object.fromEntries(regionalConfig.ranks);
    
    // Get leaderboard for specific country
    const leaderboard = await User.aggregate([
      {
        $match: {
          country: country,
          $or: [
            { "regionalAmbassador.totalEarnings": { $gt: 0 } },
            { "regionalAmbassador.progress": { $gt: 0 } },
            { "regionalAmbassador.rank": { $ne: null } }
          ]
        }
      },
      {
        $addFields: {
          rankLevel: {
            $switch: {
              branches: [
                { case: { $eq: ["$regionalAmbassador.rank", "Challenger"] }, then: 1 },
                { case: { $eq: ["$regionalAmbassador.rank", "Warrior"] }, then: 2 },
                { case: { $eq: ["$regionalAmbassador.rank", "Tycoon"] }, then: 3 },
                { case: { $eq: ["$regionalAmbassador.rank", "Champion"] }, then: 4 },
                { case: { $eq: ["$regionalAmbassador.rank", "Boss"] }, then: 5 }
              ],
              default: 1
            }
          }
        }
      },
      {
        $sort: {
          rankLevel: -1,
          "regionalAmbassador.progress": -1,
          "regionalAmbassador.totalEarnings": -1
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
          "regionalAmbassador.rank": 1,
          "regionalAmbassador.progress": 1,
          "regionalAmbassador.totalEarnings": 1,
          "regionalAmbassador.isAmbassador": 1,
          "regionalAmbassador.isPermanent": 1,
          "regionalAmbassador.crrRankBased": 1,
          "regionalAmbassador.countryRank": 1,
          "regionalAmbassador.globalRank": 1,
          "regionalAmbassador.achievedAt": 1,
          rankLevel: 1
        }
      }
    ]);

    // Get user's position if userId provided
    let userPosition = null;
    if (userId) {
      const allUsers = await User.aggregate([
        {
          $match: {
            country: country,
            $or: [
              { "regionalAmbassador.totalEarnings": { $gt: 0 } },
              { "regionalAmbassador.progress": { $gt: 0 } },
              { "regionalAmbassador.rank": { $ne: null } }
            ]
          }
        },
        {
          $addFields: {
            rankLevel: {
              $switch: {
                branches: [
                  { case: { $eq: ["$regionalAmbassador.rank", "Challenger"] }, then: 1 },
                  { case: { $eq: ["$regionalAmbassador.rank", "Warrior"] }, then: 2 },
                  { case: { $eq: ["$regionalAmbassador.rank", "Tycoon"] }, then: 3 },
                  { case: { $eq: ["$regionalAmbassador.rank", "Champion"] }, then: 4 },
                  { case: { $eq: ["$regionalAmbassador.rank", "Boss"] }, then: 5 }
                ],
                default: 1
              }
            }
          }
        },
        {
          $sort: {
            rankLevel: -1,
            "regionalAmbassador.progress": -1,
            "regionalAmbassador.totalEarnings": -1
          }
        },
        {
          $project: {
            _id: 1,
            "regionalAmbassador.progress": 1,
            "regionalAmbassador.totalEarnings": 1
          }
        }
      ]);
      
      const userIndex = allUsers.findIndex(user => user._id.toString() === userId);
      if (userIndex !== -1) {
        userPosition = {
          position: userIndex + 1,
          progress: allUsers[userIndex].regionalAmbassador.progress || 0,
          totalEarnings: allUsers[userIndex].regionalAmbassador.totalEarnings || 0
        };
      }
    }

    // Convert ranks Map to array for response
    const ranksArray = Array.from(regionalConfig.ranks.entries()).map(([name, details]) => ({
      name,
      level: details.level,
      minProgress: details.minProgress
    })).sort((a, b) => a.level - b.level);

    res.status(200).json({
      success: true,
      data: {
        leaderboard,
        userPosition,
        country,
        ranks: ranksArray,
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

    // Get all users who are Regional Ambassadors
    const globalAmbassadors = await User.aggregate([
      {
        $match: {
          "regionalAmbassador.isAmbassador": true,
          "regionalAmbassador.isActive": true
        }
      },
      {
        $addFields: {
          rankLevel: {
            $switch: {
              branches: [
                { case: { $eq: ["$regionalAmbassador.rank", "Challenger"] }, then: 1 },
                { case: { $eq: ["$regionalAmbassador.rank", "Warrior"] }, then: 2 },
                { case: { $eq: ["$regionalAmbassador.rank", "Tycoon"] }, then: 3 },
                { case: { $eq: ["$regionalAmbassador.rank", "Champion"] }, then: 4 },
                { case: { $eq: ["$regionalAmbassador.rank", "Boss"] }, then: 5 }
              ],
              default: 1
            }
          },
          isVictoryRank: {
            $and: [
              { $eq: ["$regionalAmbassador.rank", "Boss"] },
              { $eq: ["$regionalAmbassador.crrRankBased", true] }
            ]
          }
        }
      },
      {
        $sort: {
          rankLevel: -1,
          "regionalAmbassador.progress": -1,
          "regionalAmbassador.totalEarnings": -1,
          "regionalAmbassador.achievedAt": 1
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
          "regionalAmbassador.rank": 1,
          "regionalAmbassador.progress": 1,
          "regionalAmbassador.totalEarnings": 1,
          "regionalAmbassador.isAmbassador": 1,
          "regionalAmbassador.isPermanent": 1,
          "regionalAmbassador.crrRankBased": 1,
          "regionalAmbassador.countryRank": 1,
          "regionalAmbassador.globalRank": 1,
          "regionalAmbassador.achievedAt": 1,
          "regionalAmbassador.diamondAchievedAt": 1,
          rankLevel: 1,
          isVictoryRank: 1
        }
      }
    ]);

    // Get total count for pagination
    const totalCount = await User.countDocuments({
      "regionalAmbassador.isAmbassador": true,
      "regionalAmbassador.isActive": true
    });

    // Group by country for better organization
    const ambassadorsByCountry = globalAmbassadors.reduce((acc, ambassador) => {
      const country = ambassador.country || 'Unknown';
      if (!acc[country]) {
        acc[country] = [];
      }
      acc[country].push(ambassador);
      return acc;
    }, {});

    // Convert ranks Map to array for response
    const ranksArray = Array.from(mlm.regionalAmbassadorConfig.ranks.entries()).map(([name, details]) => ({
      name,
      level: details.level,
      minProgress: details.minProgress
    })).sort((a, b) => a.level - b.level);

    res.status(200).json({
      success: true,
      data: {
        ambassadors: globalAmbassadors,
        ambassadorsByCountry,
        ranks: ranksArray,
        statistics: {
          totalAmbassadors: totalCount,
          victoryRankHolders: globalAmbassadors.filter(amb => amb.isVictoryRank).length,
          permanentAmbassadors: globalAmbassadors.filter(amb => amb.regionalAmbassador.isPermanent).length,
          crrBasedAmbassadors: globalAmbassadors.filter(amb => amb.regionalAmbassador.crrRankBased).length
        },
        pagination: {
          page,
          limit,
          total: totalCount,
          hasMore: globalAmbassadors.length === limit
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

    // Calculate CRR earnings (1 PGP = 1 AED, 1 TGP = 1 AED)
    const crrEarnings = {
      pgpEarnings: qualificationStats.pgp.accumulated,
      tgpEarnings: qualificationStats.tgp.accumulated,
      totalEarnings: qualificationStats.total.accumulated,
      currentRank: user.crrRank?.current || 'Bronze',
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
      crr: crrEarnings.totalEarnings,
      bbr: bbrEarnings.totalRewardsEarned,
      hlr: hlrEarnings.totalEarnings,
      regionalAmbassador: regionalAmbassadorEarnings.totalEarnings,
      total: ddrEarnings.total + crrEarnings.totalEarnings + bbrEarnings.totalRewardsEarned + hlrEarnings.totalEarnings + regionalAmbassadorEarnings.totalEarnings
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
        totalEarnings: totalEarnings.total
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
        earnings: crrEarnings,
        qualificationPoints: qualificationStats,
        rankProgress: {
          current: crrEarnings.currentRank,
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
      summary: {
        totalEarnings: totalEarnings,
        earningsBreakdown: {
          ddr: { amount: totalEarnings.ddr, percentage: totalEarnings.total > 0 ? (totalEarnings.ddr / totalEarnings.total * 100).toFixed(2) : 0 },
          crr: { amount: totalEarnings.crr, percentage: totalEarnings.total > 0 ? (totalEarnings.crr / totalEarnings.total * 100).toFixed(2) : 0 },
          bbr: { amount: totalEarnings.bbr, percentage: totalEarnings.total > 0 ? (totalEarnings.bbr / totalEarnings.total * 100).toFixed(2) : 0 },
          hlr: { amount: totalEarnings.hlr, percentage: totalEarnings.total > 0 ? (totalEarnings.hlr / totalEarnings.total * 100).toFixed(2) : 0 },
          regionalAmbassador: { amount: totalEarnings.regionalAmbassador, percentage: totalEarnings.total > 0 ? (totalEarnings.regionalAmbassador / totalEarnings.total * 100).toFixed(2) : 0 }
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

// Simplified BBR Campaign Management - Update Campaign (Admin only)
export const updateBBRCampaign = asyncHandler(async (req, res) => {
  try {
    const { campaignId, name, requirement, duration, reward, type, newbieRidesOnly } = req.body;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: "Campaign ID is required"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Find the campaign to update
    const campaignIndex = mlm.bbrCampaigns.findIndex(
      campaign => campaign._id.toString() === campaignId
    );

    if (campaignIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found"
      });
    }

    const campaign = mlm.bbrCampaigns[campaignIndex];

    // Update campaign fields
    if (name !== undefined) campaign.name = name;
    if (requirement !== undefined) campaign.requirement = requirement;
    if (duration !== undefined) campaign.duration = duration;
    if (reward !== undefined) campaign.reward = reward;
    if (type !== undefined) campaign.type = type;
    if (newbieRidesOnly !== undefined) campaign.newbieRidesOnly = newbieRidesOnly;

    // Recalculate end date if duration changed
    if (duration !== undefined) {
      campaign.endDate = new Date(campaign.startDate.getTime() + (duration * 24 * 60 * 60 * 1000));
    }

    await mlm.save();

    res.status(200).json({
      success: true,
      message: "BBR campaign updated successfully",
      data: {
        campaignId: campaign._id,
        name: campaign.name,
        requirement: campaign.requirement,
        duration: campaign.duration,
        reward: campaign.reward,
        type: campaign.type,
        newbieRidesOnly: campaign.newbieRidesOnly,
        startDate: campaign.startDate,
        endDate: campaign.endDate
      }
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

// Simplified BBR Campaign Management - Delete Campaign (Admin only)
export const deleteBBRCampaign = asyncHandler(async (req, res) => {
  try {
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: "Campaign ID is required"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Find and remove the campaign
    const campaignIndex = mlm.bbrCampaigns.findIndex(
      campaign => campaign._id.toString() === campaignId
    );

    if (campaignIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found"
      });
    }

    const deletedCampaign = mlm.bbrCampaigns.splice(campaignIndex, 1)[0];

    // If this was the active campaign, clear it
    if (mlm.activeBBRCampaign && mlm.activeBBRCampaign._id.toString() === campaignId) {
      mlm.activeBBRCampaign = null;
    }

    await mlm.save();

    res.status(200).json({
      success: true,
      message: "BBR campaign deleted successfully",
      data: {
        campaignId: deletedCampaign._id,
        name: deletedCampaign.name
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

// Simplified BBR Campaign Management - Update Campaign (Admin only)
export const updateBBRCampaign = asyncHandler(async (req, res) => {
  try {
    const { campaignId, name, requirement, duration, reward, type, newbieRidesOnly } = req.body;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: "Campaign ID is required"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Find the campaign to update
    const campaignIndex = mlm.bbrCampaigns.findIndex(
      campaign => campaign._id.toString() === campaignId
    );

    if (campaignIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found"
      });
    }

    const campaign = mlm.bbrCampaigns[campaignIndex];

    // Update campaign fields
    if (name !== undefined) campaign.name = name;
    if (requirement !== undefined) campaign.requirement = requirement;
    if (duration !== undefined) campaign.duration = duration;
    if (reward !== undefined) campaign.reward = reward;
    if (type !== undefined) campaign.type = type;
    if (newbieRidesOnly !== undefined) campaign.newbieRidesOnly = newbieRidesOnly;

    // Recalculate end date if duration changed
    if (duration !== undefined) {
      campaign.endDate = new Date(campaign.startDate.getTime() + (duration * 24 * 60 * 60 * 1000));
    }

    await mlm.save();

    res.status(200).json({
      success: true,
      message: "BBR campaign updated successfully",
      data: {
        campaignId: campaign._id,
        name: campaign.name,
        requirement: campaign.requirement,
        duration: campaign.duration,
        reward: campaign.reward,
        type: campaign.type,
        newbieRidesOnly: campaign.newbieRidesOnly,
        startDate: campaign.startDate,
        endDate: campaign.endDate
      }
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

// Simplified BBR Campaign Management - Delete Campaign (Admin only)
export const deleteBBRCampaign = asyncHandler(async (req, res) => {
  try {
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: "Campaign ID is required"
      });
    }

    const mlm = await MLM.findOne();
    if (!mlm) {
      return res.status(404).json({
        success: false,
        message: "MLM system not found"
      });
    }

    // Find and remove the campaign
    const campaignIndex = mlm.bbrCampaigns.findIndex(
      campaign => campaign._id.toString() === campaignId
    );

    if (campaignIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found"
      });
    }

    const deletedCampaign = mlm.bbrCampaigns.splice(campaignIndex, 1)[0];

    // If this was the active campaign, clear it
    if (mlm.activeBBRCampaign && mlm.activeBBRCampaign._id.toString() === campaignId) {
      mlm.activeBBRCampaign = null;
    }

    await mlm.save();

    res.status(200).json({
      success: true,
      message: "BBR campaign deleted successfully",
      data: {
        campaignId: deletedCampaign._id,
        name: deletedCampaign.name
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
