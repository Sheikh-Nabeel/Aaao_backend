import MLM from "../models/mlmModel.js";

/**
 * Add money to MLM system after ride completion
 * @param {string} userId - User ID who completed the ride
 * @param {number} amount - Amount to add (already calculated as 15% of ride fare)
 * @param {string} rideId - Unique ride identifier
 * @returns {Object} Distribution breakdown
 */
export const addMoneyToMLM = async (userId, amount, rideId) => {
  try {
    // Get MLM system
    const mlm = await MLM.findOne();
    if (!mlm) {
      throw new Error("MLM system not found");
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

    // Add transaction
    mlm.transactions.push({
      userId,
      amount,
      rideId,
      distribution,
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

    return {
      success: true,
      distribution,
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