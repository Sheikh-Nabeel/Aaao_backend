import User from "../models/userModel.js";
import Booking from "../models/bookingModel.js";
import asyncHandler from "express-async-handler";

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