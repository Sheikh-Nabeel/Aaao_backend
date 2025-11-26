import User from "../models/userModel.js";
import Booking from "../models/bookingModel.js";
import asyncHandler from "express-async-handler";
import WalletSettings from "../models/walletSettingsModel.js";
import MLM from "../models/mlmModel.js";

// Get user wallet information
const getUserWallet = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  try {
    const user = await User.findById(userId).select('wallet driverPaymentTracking role');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const walletData = {
      balance: user.wallet.balance
    };
    
    // Add driver-specific payment tracking if user is a driver
    if (user.role === 'driver') {
      walletData.driverPaymentTracking = {
        totalPendingAmount: user.driverPaymentTracking.totalPendingAmount,
        unpaidRidesCount: user.driverPaymentTracking.unpaidRidesCount,
        lastPaymentDate: user.driverPaymentTracking.lastPaymentDate,
        isRestricted: user.driverPaymentTracking.isRestricted,
        restrictedAt: user.driverPaymentTracking.restrictedAt
      };
    }
    
    res.status(200).json({
      success: true,
      message: 'Wallet information retrieved successfully',
      data: walletData
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving wallet information',
      error: error.message
    });
  }
});

// Get wallet transaction history
const getWalletTransactions = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20, type } = req.query;
  
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Build query for bookings where user was involved
    const query = {
      $or: [
        { user: userId },
        { driver: userId }
      ],
      status: 'completed'
    };
    
    // Filter by transaction type if specified
    if (type === 'earnings') {
      query.driver = userId;
    } else if (type === 'payments') {
      query.user = userId;
    }
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const [transactions, total] = await Promise.all([
      Booking.find(query)
        .populate('user', 'firstName lastName')
        .populate('driver', 'firstName lastName')
        .select('paymentDetails receipt completedAt serviceType vehicleType fare paymentMethod')
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Booking.countDocuments(query)
    ]);
    
    const formattedTransactions = transactions.map(booking => {
      const isDriver = booking.driver && booking.driver._id.toString() === userId.toString();
      
      return {
        id: booking._id,
        type: isDriver ? 'earning' : 'payment',
        amount: isDriver ? booking.paymentDetails.driverEarnings : booking.fare,
        totalFare: booking.fare,
        serviceType: booking.serviceType,
        vehicleType: booking.vehicleType,
        paymentMethod: booking.paymentMethod,
        receiptNumber: booking.receipt?.receiptNumber,
        completedAt: booking.completedAt,
        counterparty: isDriver ? 
          `${booking.user.firstName} ${booking.user.lastName}` : 
          `${booking.driver.firstName} ${booking.driver.lastName}`,
        status: 'completed'
      };
    });
    
    res.status(200).json({
      success: true,
      message: 'Transaction history retrieved successfully',
      data: {
        transactions: formattedTransactions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving transaction history',
      error: error.message
    });
  }
});

// Get driver payment history (for drivers only)
const getDriverPaymentHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;
  
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (user.role !== 'driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can access payment history'
      });
    }
    
    const skip = (Number(page) - 1) * Number(limit);
    const paymentHistory = user.driverPaymentTracking.paymentHistory
      .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))
      .slice(skip, skip + Number(limit));
    
    const total = user.driverPaymentTracking.paymentHistory.length;
    
    res.status(200).json({
      success: true,
      message: 'Driver payment history retrieved successfully',
      data: {
        paymentHistory,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        },
        summary: {
          totalPendingAmount: user.driverPaymentTracking.totalPendingAmount,
          unpaidRidesCount: user.driverPaymentTracking.unpaidRidesCount,
          isRestricted: user.driverPaymentTracking.isRestricted
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving payment history',
      error: error.message
    });
  }
});

// Get pending cash payments for driver
const getPendingCashPayments = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (user.role !== 'driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can access pending payments'
      });
    }
    
    // Find completed cash rides with pending payments
    const pendingPayments = await Booking.find({
      driver: userId,
      status: 'completed',
      paymentMethod: 'cash',
      'paymentDetails.pendingDriverPayment.isPaid': false
    })
    .populate('user', 'firstName lastName phoneNumber')
    .select('receipt paymentDetails completedAt serviceType vehicleType fare')
    .sort({ completedAt: -1 });
    
    const formattedPayments = pendingPayments.map(booking => ({
      bookingId: booking._id,
      receiptNumber: booking.receipt?.receiptNumber,
      amount: booking.paymentDetails.pendingDriverPayment.amount,
      dueDate: booking.paymentDetails.pendingDriverPayment.dueDate,
      completedAt: booking.completedAt,
      serviceType: booking.serviceType,
      vehicleType: booking.vehicleType,
      totalFare: booking.fare,
      user: {
        name: `${booking.user.firstName} ${booking.user.lastName}`,
        phone: booking.user.phoneNumber
      },
      isOverdue: new Date() > new Date(booking.paymentDetails.pendingDriverPayment.dueDate)
    }));
    
    res.status(200).json({
      success: true,
      message: 'Pending cash payments retrieved successfully',
      data: {
        pendingPayments: formattedPayments,
        summary: {
          totalPendingAmount: user.driverPaymentTracking.totalPendingAmount,
          unpaidRidesCount: user.driverPaymentTracking.unpaidRidesCount,
          overdueCount: formattedPayments.filter(p => p.isOverdue).length
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving pending payments',
      error: error.message
    });
  }
});

// Record driver payment (admin only)
const recordDriverPayment = asyncHandler(async (req, res) => {
  const { driverId, amount, bookingId, paymentMethod = 'cash' } = req.body;
  
  try {
    // Only admin can record payments
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can record driver payments'
      });
    }
    
    const driver = await User.findById(driverId);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    if (driver.role !== 'driver') {
      return res.status(400).json({
        success: false,
        message: 'User is not a driver'
      });
    }
    
    // Update driver's payment tracking
    driver.driverPaymentTracking.totalPendingAmount = Math.max(0, driver.driverPaymentTracking.totalPendingAmount - amount);
    driver.driverPaymentTracking.lastPaymentDate = new Date();
    
    // Add to payment history
    driver.driverPaymentTracking.paymentHistory.push({
      amount,
      paidAt: new Date(),
      bookingId: bookingId || null,
      paymentMethod
    });
    
    // If specific booking provided, mark it as paid
    if (bookingId) {
      const booking = await Booking.findById(bookingId);
      if (booking && booking.paymentDetails.pendingDriverPayment) {
        booking.paymentDetails.pendingDriverPayment.isPaid = true;
        booking.paymentDetails.pendingDriverPayment.paidAt = new Date();
        await booking.save();
        
        // Decrease unpaid rides count
        driver.driverPaymentTracking.unpaidRidesCount = Math.max(0, driver.driverPaymentTracking.unpaidRidesCount - 1);
      }
    }
    
    // Remove restriction if pending amount is cleared
    if (driver.driverPaymentTracking.totalPendingAmount === 0) {
      driver.driverPaymentTracking.isRestricted = false;
      driver.driverPaymentTracking.restrictedAt = null;
    }
    
    await driver.save();
    
    res.status(200).json({
      success: true,
      message: 'Driver payment recorded successfully',
      data: {
        driverId: driver._id,
        amountPaid: amount,
        remainingPendingAmount: driver.driverPaymentTracking.totalPendingAmount,
        unpaidRidesCount: driver.driverPaymentTracking.unpaidRidesCount,
        isRestricted: driver.driverPaymentTracking.isRestricted
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error recording driver payment',
      error: error.message
    });
  }
});

// Add money to user wallet (admin only)
const addToWallet = asyncHandler(async (req, res) => {
  const { userId, amount, description = 'Admin credit' } = req.body;
  
  try {
    // Only admin can add money to wallet
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can add money to wallet'
      });
    }
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const previousBalance = user.wallet.balance;
    await user.addToWallet(amount);
  user.wallet.transactions.push({
    amount,
    type: "credit",
    description: description || "Admin credit",
    source: "admin_direct",
    tags: ["topup"],
    adminNote: "",
    adminBy: req.user?._id,
    adminName: req.user?.username || `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim(),
    adminEmail: req.user?.email || ""
  });
    user.wallet.lastUpdated = new Date();
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Money added to wallet successfully',
      data: {
        userId: user._id,
        previousBalance,
        amountAdded: amount,
        newBalance: user.wallet.balance,
        description
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding money to wallet',
      error: error.message
    });
  }
});

// Deduct money from user wallet (admin only)
const deductFromWallet = asyncHandler(async (req, res) => {
  const { userId, amount, description = 'Admin debit' } = req.body;
  
  try {
    // Only admin can deduct money from wallet
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can deduct money from wallet'
      });
    }
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (!user.hasWalletBalance(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance'
      });
    }
    
    const previousBalance = user.wallet.balance;
    await user.deductFromWallet(amount);
  user.wallet.transactions.push({
    amount,
    type: "debit",
    description: description || "Admin debit",
    source: "admin_direct",
    tags: ["adjustment"],
    adminNote: "",
    adminBy: req.user?._id,
    adminName: req.user?.username || `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim(),
    adminEmail: req.user?.email || ""
  });
    user.wallet.lastUpdated = new Date();
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Money deducted from wallet successfully',
      data: {
        userId: user._id,
        previousBalance,
        amountDeducted: amount,
        newBalance: user.wallet.balance,
        description
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deducting money from wallet',
      error: error.message
    });
  }
});

export {
  getUserWallet,
  getWalletTransactions,
  getDriverPaymentHistory,
  getPendingCashPayments,
  recordDriverPayment,
  addToWallet,
  deductFromWallet
};

// ===== Admin Panels Additions =====

// Get admin overview metrics
export const getAdminWalletOverview = asyncHandler(async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const mlm = await MLM.findOne();
  const [settings, users] = await Promise.all([
    WalletSettings.findOne({ key: "global" }),
    User.find({}).select("wallet status role").lean()
  ]);

  const balances = mlm?.currentBalances || {};
  const totalMLMAmount = Number(mlm?.totalAmount || mlm?.totalMLMAmount || 0);

  const pools = {
    ddr: Number(balances.ddr || 0),
    crr: Number(balances.crr || 0),
    bbr: Number(balances.bbr || 0),
    hlr: Number(balances.hlr || 0),
    regionalAmbassador: Number(balances.regionalAmbassador || 0),
    porparleTeam: Number(balances.porparleTeam || 0),
    rop: Number(balances.rop || 0),
    companyOperations: Number(balances.companyOperations || 0),
    technologyPool: Number(balances.technologyPool || 0),
    foundationPool: Number(balances.foundationPool || 0),
    publicShare: Number(balances.publicShare || 0),
    netProfit: Number(balances.netProfit || 0)
  };

  const ddrLevels = {
    level1: Number(balances.ddrLevel1 || 0),
    level2: Number(balances.ddrLevel2 || 0),
    level3: Number(balances.ddrLevel3 || 0),
    level4: Number(balances.ddrLevel4 || 0)
  };

  const porparleTeamDetail = {
    gc: Number(balances.gc || 0),
    la: Number(balances.la || 0),
    ceo: Number(balances.ceo || 0),
    coo: Number(balances.coo || 0),
    cmo: Number(balances.cmo || 0),
    cfo: Number(balances.cfo || 0),
    cto: Number(balances.cto || 0),
    chro: Number(balances.chro || 0),
    topTeamPerform: Number(balances.topTeamPerform || 0),
    winner: Number(balances.winner || 0),
    fighter: Number(balances.fighter || 0)
  };

  const companyOperationsDetail = {
    operationExpense: Number(balances.operationExpense || 0),
    organizationEvent: Number(balances.organizationEvent || 0)
  };

  const publicShareDetail = {
    chairmanFounder: Number(balances.chairmanFounder || 0),
    shareholder1: Number(balances.shareholder1 || 0),
    shareholder2: Number(balances.shareholder2 || 0),
    shareholder3: Number(balances.shareholder3 || 0)
  };

  const totalWallets = users.length;
  const totalBalance = users.reduce((sum, u) => sum + (u.wallet?.balance || 0), 0);
  const pendingWithdrawals = users.reduce((sum, u) => {
    const reqs = u.wallet?.withdrawalRequests || [];
    return sum + reqs.filter(r => r.status === "pending").reduce((s, r) => s + (r.amount || 0), 0);
  }, 0);
  const frozenWallets = users.filter(u => u.wallet?.status === "frozen" || u.wallet?.freezeInfo?.isFrozen).length;

  res.status(200).json({
    success: true,
    data: {
      mlm: {
        totalAmount: totalMLMAmount,
        pools,
        ddrLevels,
        porparleTeamDetail,
        companyOperationsDetail,
        publicShareDetail
      },
      walletSummary: {
        totalWallets,
        totalBalance,
        pendingWithdrawals,
        frozenWallets
      },
      settings
    }
  });
});

// Admin adjust wallet (credit/debit with reason and optional bonus)
export const adminAdjustWallet = asyncHandler(async (req, res) => {
  const { userId, amount, operation, reason = "", adjustmentType } = req.body;
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  if (!userId || !amount || amount <= 0) {
    return res.status(400).json({ success: false, message: "userId and amount > 0 required" });
  }
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  const total = amount;
  let finalOperation = operation;
  if (!finalOperation) {
    if (adjustmentType === "Penalty") finalOperation = "debit";
    else finalOperation = "credit";
  }
  const prev = user.wallet.balance;
  if (finalOperation === "credit") await user.addToWallet(total);
  else {
    if (!user.hasWalletBalance(total)) return res.status(400).json({ success: false, message: "Insufficient balance" });
    await user.deductFromWallet(total);
  }

  user.wallet.transactions.push({
    amount: total,
    type: finalOperation === "credit" ? "credit" : "debit",
    description: `Admin adjustment (${adjustmentType || finalOperation})`,
    source: "admin_adjustment",
    adminNote: reason,
    adminBy: req.user?._id,
    adminName: req.user?.username || `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim(),
    adminEmail: req.user?.email || "",
    tags: adjustmentType ? [String(adjustmentType).toLowerCase()] : [],
    adjustmentType: adjustmentType || null
  });
  user.wallet.lastUpdated = new Date();
  await user.save();

  res.status(200).json({
    success: true,
    message: "Wallet adjusted",
    data: { userId: user._id, previousBalance: prev, newBalance: user.wallet.balance }
  });
});

// Create withdrawal request (user)
export const createWithdrawalRequest = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { amount, method = "bank_transfer", accountLabel = "" } = req.body;
  const settings = await WalletSettings.findOne({ key: "global" });
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "Amount > 0 required" });
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  // Basic limits check
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayTotal = (user.wallet.withdrawalRequests || [])
    .filter(r => r.requestedAt >= startOfDay && r.status === "pending")
    .reduce((s, r) => s + r.amount, 0);
  if (settings?.withdrawalSettings?.dailyLimitPerUser && dayTotal + amount > settings.withdrawalSettings.dailyLimitPerUser) {
    return res.status(400).json({ success: false, message: "Daily limit exceeded" });
  }

  user.wallet.withdrawalRequests.push({ amount, status: "pending", method, accountLabel });
  user.wallet.onHold += amount; // Track hold without deducting balance until approval
  await user.save();
  res.status(200).json({ success: true, message: "Withdrawal requested", data: { onHold: user.wallet.onHold } });
});

// Approve withdrawal (admin)
export const approveWithdrawal = asyncHandler(async (req, res) => {
  const { userId, requestId } = req.params;
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  const reqIdx = (user.wallet.withdrawalRequests || []).findIndex(r => String(r._id) === String(requestId));
  if (reqIdx === -1) return res.status(404).json({ success: false, message: "Request not found" });
  const wreq = user.wallet.withdrawalRequests[reqIdx];
  if (wreq.status !== "pending") return res.status(400).json({ success: false, message: "Not pending" });
  if (!user.hasWalletBalance(wreq.amount)) return res.status(400).json({ success: false, message: "Insufficient balance" });
  await user.deductFromWallet(wreq.amount);
  user.wallet.onHold = Math.max(0, user.wallet.onHold - wreq.amount);
  user.wallet.withdrawalRequests[reqIdx].status = "approved";
  user.wallet.withdrawalRequests[reqIdx].processedAt = new Date();
  user.wallet.transactions.push({ amount: wreq.amount, type: "debit", description: "Withdrawal approved", source: "withdrawal" });
  await user.save();
  res.status(200).json({ success: true, message: "Withdrawal approved" });
});

// Reject withdrawal (admin)
export const rejectWithdrawal = asyncHandler(async (req, res) => {
  const { userId, requestId, reason = "" } = req.params;
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  const reqIdx = (user.wallet.withdrawalRequests || []).findIndex(r => String(r._id) === String(requestId));
  if (reqIdx === -1) return res.status(404).json({ success: false, message: "Request not found" });
  const wreq = user.wallet.withdrawalRequests[reqIdx];
  if (wreq.status !== "pending") return res.status(400).json({ success: false, message: "Not pending" });
  user.wallet.onHold = Math.max(0, user.wallet.onHold - wreq.amount);
  user.wallet.withdrawalRequests[reqIdx].status = "rejected";
  user.wallet.withdrawalRequests[reqIdx].processedAt = new Date();
  user.wallet.withdrawalRequests[reqIdx].adminNote = reason;
  await user.save();
  res.status(200).json({ success: true, message: "Withdrawal rejected" });
});

// Pause withdrawal (admin)
export const pauseWithdrawal = asyncHandler(async (req, res) => {
  const { userId, requestId, reason = "" } = req.params;
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  const idx = (user.wallet?.withdrawalRequests || []).findIndex(r => String(r._id) === String(requestId));
  if (idx === -1) return res.status(404).json({ success: false, message: "Request not found" });
  const wreq = user.wallet.withdrawalRequests[idx];
  if (wreq.status !== "pending") return res.status(400).json({ success: false, message: "Only pending requests can be paused" });
  user.wallet.withdrawalRequests[idx].status = "paused";
  user.wallet.withdrawalRequests[idx].adminNote = reason;
  await user.save();
  res.status(200).json({ success: true, message: "Withdrawal paused" });
});

// Resume withdrawal (admin)
export const resumeWithdrawal = asyncHandler(async (req, res) => {
  const { userId, requestId } = req.params;
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  const idx = (user.wallet?.withdrawalRequests || []).findIndex(r => String(r._id) === String(requestId));
  if (idx === -1) return res.status(404).json({ success: false, message: "Request not found" });
  const wreq = user.wallet.withdrawalRequests[idx];
  if (wreq.status !== "paused") return res.status(400).json({ success: false, message: "Only paused requests can be resumed" });
  user.wallet.withdrawalRequests[idx].status = "pending";
  await user.save();
  res.status(200).json({ success: true, message: "Withdrawal resumed" });
});

// List auto-frozen accounts (admin)
export const getFrozenAccounts = asyncHandler(async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const { page = 1, limit = 20, sort = "date", reverifyOnly } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = {
    $or: [
      { 'wallet.status': 'frozen' },
      { 'wallet.freezeInfo.isFrozen': true }
    ]
  };
  if (String(reverifyOnly).toLowerCase() === 'true') {
    filter['wallet.freezeInfo.reverifyNeeded'] = true;
  }
  const users = await User.find(filter)
    .select('username firstName lastName email wallet.freezeInfo wallet.status')
    .lean();
  let rows = users.map(u => ({
    userId: u._id,
    userName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username,
    username: u.username,
    status: (u.wallet?.status === 'frozen' || u.wallet?.freezeInfo?.isFrozen) ? 'Frozen' : 'Active',
    triggerReason: u.wallet?.freezeInfo?.reason || '',
    reverifyNeeded: !!u.wallet?.freezeInfo?.reverifyNeeded,
    triggeredAt: u.wallet?.freezeInfo?.triggeredAt || null
  }));
  rows.sort((a, b) => {
    if (sort === 'reason') return String(a.triggerReason).localeCompare(String(b.triggerReason));
    return new Date(b.triggeredAt || 0) - new Date(a.triggeredAt || 0);
  });
  const paginated = rows.slice(skip, skip + Number(limit));
  res.status(200).json({ success: true, data: { accounts: paginated, total: rows.length, page: Number(page), pages: Math.ceil(rows.length / Number(limit)) } });
});

// Set reverify flag (admin)
export const setReverifyNeeded = asyncHandler(async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const { userId } = req.params; const { reverifyNeeded = true } = req.body || {};
  const result = await User.updateOne({ _id: userId }, { $set: { 'wallet.freezeInfo.reverifyNeeded': !!reverifyNeeded } });
  res.status(200).json({ success: true, message: 'Reverify flag updated', data: { modifiedCount: result.modifiedCount } });
});

// Get and update global settings
export const getWalletSettings = asyncHandler(async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const settings = await WalletSettings.findOne({ key: "global" });
  res.status(200).json({ success: true, data: settings });
});

export const updateWalletSettings = asyncHandler(async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const update = req.body || {};
  const settings = await WalletSettings.findOneAndUpdate({ key: "global" }, { $set: update }, { new: true, upsert: true });
  res.status(200).json({ success: true, message: "Settings updated", data: settings });
});

// Freeze/unfreeze wallet
export const freezeWallet = asyncHandler(async (req, res) => {
  const { userId } = req.params; const { reason = "" } = req.body;
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  await User.updateOne({ _id: userId }, { $set: { 'wallet.status': 'frozen', 'wallet.freezeInfo.isFrozen': true, 'wallet.freezeInfo.reason': reason, 'wallet.freezeInfo.triggeredBy': String(req.user?._id), 'wallet.freezeInfo.triggeredAt': new Date() } });
  res.status(200).json({ success: true, message: "Wallet frozen" });
});

export const unfreezeWallet = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  await User.updateOne({ _id: userId }, { $set: { 'wallet.status': 'active', 'wallet.freezeInfo.isFrozen': false, 'wallet.freezeInfo.reason': null, 'wallet.freezeInfo.triggeredBy': null, 'wallet.freezeInfo.triggeredAt': null } });
  res.status(200).json({ success: true, message: "Wallet unfrozen" });
});

// Admin transaction logs
export const getAdminTransactionLogs = asyncHandler(async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const { page = 1, limit = 50, userId, type, source, tag, minAmount, maxAmount, startDate, endDate } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = userId ? { _id: userId } : {};
  const users = await User.find(filter).select('username wallet.transactions').lean();
  const allTx = [];
  users.forEach(u => {
    (u.wallet?.transactions || []).forEach(t => allTx.push({ userId: u._id, username: u.username, ...t }));
  });
  const sDate = startDate ? new Date(startDate) : null;
  const eDate = endDate ? new Date(endDate) : null;
  const filtered = allTx.filter(t => {
    if (type && t.type !== String(type)) return false;
    if (source && t.source !== String(source)) return false;
    if (tag && !(t.tags || []).includes(String(tag))) return false;
    if (minAmount && Number(t.amount) < Number(minAmount)) return false;
    if (maxAmount && Number(t.amount) > Number(maxAmount)) return false;
    if (sDate && new Date(t.timestamp) < sDate) return false;
    if (eDate && new Date(t.timestamp) > eDate) return false;
    return true;
  });
  filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const paginated = filtered.slice(skip, skip + Number(limit));
  res.status(200).json({ success: true, data: { transactions: paginated, total: filtered.length, page: Number(page), pages: Math.ceil(filtered.length / Number(limit)) } });
});

export const updateTransactionNote = asyncHandler(async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const { userId, transactionId } = req.params;
  const { adminNote = "", tags = [] } = req.body || {};
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  const tx = (user.wallet?.transactions || []).find(t => String(t._id) === String(transactionId));
  if (!tx) return res.status(404).json({ success: false, message: "Transaction not found" });
  tx.adminNote = adminNote;
  tx.tags = Array.isArray(tags) ? tags : tx.tags;
  await user.save();
  res.status(200).json({ success: true, message: "Transaction updated" });
});

// List pending withdrawals across users (admin)
export const getAdminPendingWithdrawals = asyncHandler(async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const { page = 1, limit = 20, status, includePaused } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const users = await User.find({}).select("username firstName lastName kycStatus wallet.withdrawalRequests").lean();
  const rows = [];
  users.forEach(u => {
    (u.wallet?.withdrawalRequests || []).forEach(w => {
      const include = (() => {
        if (!status) return w.status === "pending" || w.status === "paused";
        if (status === "all") return true;
        if (status === "pending" && String(includePaused).toLowerCase() === "true") {
          return w.status === "pending" || w.status === "paused";
        }
        return w.status === status;
      })();
      if (include) {
        rows.push({
          userId: u._id,
          userName: `${u.firstName} ${u.lastName}`.trim(),
          username: u.username,
          kyc: u.kycStatus === "approved",
          amount: w.amount,
          date: w.requestedAt,
          accountType: w.method,
          status: w.status,
          requestId: w._id,
          adminNote: w.adminNote || ""
        });
      }
    });
  });
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  const paginated = rows.slice(skip, skip + Number(limit));
  res.status(200).json({ success: true, data: { withdrawals: paginated, total: rows.length, page: Number(page), pages: Math.ceil(rows.length / Number(limit)) } });
});

export const createAdminAlert = asyncHandler(async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const { userId } = req.params; const { type = "info", message = "" } = req.body || {};
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  user.wallet.alerts.push({ type, message });
  await user.save();
  res.status(200).json({ success: true, message: "Alert created" });
});

export const listAlerts = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  const filter = userId ? { _id: userId } : {};
  const users = await User.find(filter).select('username wallet.alerts').lean();
  const rows = [];
  users.forEach(u => (u.wallet?.alerts || []).forEach(a => rows.push({ userId: u._id, username: u.username, ...a })));
  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.status(200).json({ success: true, data: rows });
});

export const resolveAlert = asyncHandler(async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const { userId, alertId } = req.params;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  const idx = (user.wallet?.alerts || []).findIndex(a => String(a._id) === String(alertId));
  if (idx === -1) return res.status(404).json({ success: false, message: "Alert not found" });
  user.wallet.alerts[idx].resolved = true;
  user.wallet.alerts[idx].resolvedAt = new Date();
  await user.save();
  res.status(200).json({ success: true, message: "Alert resolved" });
});

// Admin-only: get adjustment logs (only admin_adjustment source)
export const getAdminAdjustmentLogs = asyncHandler(async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const { page = 1, limit = 20, userId, startDate, endDate, type, adjustmentType } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = userId ? { _id: userId } : {};
  const users = await User.find(filter).select('username firstName lastName wallet.transactions').lean();
  let rows = [];
  const sDate = startDate ? new Date(startDate) : null;
  const eDate = endDate ? new Date(endDate) : null;
  users.forEach(u => {
    (u.wallet?.transactions || []).forEach(t => {
      if (t.source !== 'admin_adjustment') return;
      if (type && t.type !== String(type)) return;
      if (adjustmentType && String(t.adjustmentType) !== String(adjustmentType)) return;
      if (sDate && new Date(t.timestamp) < sDate) return;
      if (eDate && new Date(t.timestamp) > eDate) return;
      rows.push({
        date: t.timestamp,
        userId: u._id,
        userName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username,
        username: u.username,
        type: t.adjustmentType || (t.type === 'credit' ? 'Credit' : 'Debit'),
        amount: Number(t.amount || 0),
        reason: t.adminNote || t.description || '',
        adminName: t.adminName || '',
        adminEmail: t.adminEmail || ''
      });
    });
  });
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  const paginated = rows.slice(skip, skip + Number(limit));
  res.status(200).json({ success: true, data: { logs: paginated, total: rows.length, page: Number(page), pages: Math.ceil(rows.length / Number(limit)) } });
});

// Admin: list selectable users/drivers for wallet adjustment
export const getAdjustmentTargets = asyncHandler(async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  const { role = "all", q = "", page = 1, limit = 20 } = req.query;
  const filter = {};
  const rl = String(role).toLowerCase();
  if (rl === "customer" || rl === "driver") filter.role = rl;
  else filter.role = { $in: ["customer", "driver"] };
  if (q) {
    filter.$or = [
      { username: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { firstName: { $regex: q, $options: "i" } },
      { lastName: { $regex: q, $options: "i" } }
    ];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    User.find(filter)
      .select("username firstName lastName email phoneNumber role kycStatus wallet.balance")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    User.countDocuments(filter)
  ]);
  const targets = items.map(u => ({
    id: u._id,
    username: u.username,
    name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
    role: u.role,
    email: u.email,
    phoneNumber: u.phoneNumber,
    kycStatus: u.kycStatus,
    walletBalance: Number(u.wallet?.balance || 0)
  }));
  res.status(200).json({
    success: true,
    data: {
      targets,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
    }
  });
});
