import MLM from "../models/mlmModel.js";
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";

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

    const mlm = new MLM(req.body);
    await mlm.save();

    res.status(201).json({
      success: true,
      message: "MLM system created successfully",
      data: mlm
    });
  } catch (error) {
    res.status(400).json({
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
      directReferrals: user.directReferrals.length,
      level2Referrals: user.level2Referrals.length,
      level3Referrals: user.level3Referrals.length,
      level4Referrals: user.level4Referrals.length,
      totalReferrals: user.directReferrals.length + user.level2Referrals.length + 
                     user.level3Referrals.length + user.level4Referrals.length,
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

    const stats = {
      totalTransactions: mlm.transactions.length,
      totalAmount: mlm.totalAmount,
      currentBalances: mlm.currentBalances,
      averageTransactionAmount: mlm.transactions.length > 0 ? 
        mlm.totalAmount / mlm.transactions.length : 0,
      recentTransactions: mlm.transactions.slice(-10),
      systemStatus: {
        isActive: mlm.isActive,
        createdAt: mlm.createdAt,
        updatedAt: mlm.updatedAt
      }
    };

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}); 