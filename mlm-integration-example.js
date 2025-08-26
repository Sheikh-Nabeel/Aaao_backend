/**
 * MLM Integration Example
 * This file demonstrates how to integrate the dual-tree MLM system
 * with upward distribution (earnings flow to sponsors) into your ride completion workflow
 */

import { distributeDualTreeMLM, getUserMLMEarnings } from './utils/mlmHelper.js';
import User from './models/userModel.js';

/**
 * Complete a ride and distribute MLM earnings (UPWARD DISTRIBUTION)
 * This function should be called when a ride is successfully completed
 * Earnings flow upward to sponsors in the referral tree
 */
const completeRideWithMLM = async (rideData) => {
  try {
    const { rideId, userId, driverId, totalFare, paymentStatus } = rideData;
    
    // Ensure payment is completed before MLM distribution
    if (paymentStatus !== 'completed') {
      throw new Error('Payment must be completed before MLM distribution');
    }
    
    console.log(`Processing MLM distribution for ride ${rideId}`);
    console.log(`User: ${userId}, Driver: ${driverId}, Fare: $${totalFare / 100}`);
    console.log('Note: Earnings will flow UPWARD to sponsors');
    
    // Calculate 15% MLM amount from ride fare
    const mlmAmount = totalFare * 0.15;
    
    // Distribute MLM earnings using the dual-tree system (upward distribution)
    const mlmResult = await distributeDualTreeMLM(
      userId,
      driverId,
      mlmAmount,
      rideId
    );
    
    console.log('MLM Distribution completed (Upward to Sponsors):');
    console.log(`- Total distributed: $${mlmResult.totalDistributed.toFixed(2)}`);
    console.log(`- User tree: $${mlmResult.userTree.totalDistributed.toFixed(2)}`);
    console.log(`- Driver tree: $${mlmResult.driverTree.totalDistributed.toFixed(2)}`);
    
    // Log the distribution details
    console.log('\nUser Tree Sponsors (who received earnings):');
    mlmResult.userTree.distributions.forEach(dist => {
      console.log(`  Level ${dist.level}: ${dist.username} (${dist.relationship}) received $${dist.amount.toFixed(2)}`);
    });
    
    console.log('\nDriver Tree Sponsors (who received earnings):');
    mlmResult.driverTree.distributions.forEach(dist => {
      console.log(`  Level ${dist.level}: ${dist.username} (${dist.relationship}) received $${dist.amount.toFixed(2)}`);
    });
    
    return {
      success: true,
      rideId,
      mlmDistribution: mlmResult,
      message: 'Ride completed and MLM earnings distributed upward to sponsors successfully'
    };
    
  } catch (error) {
    console.error('Error completing ride with MLM:', error);
    throw error;
  }
};

/**
 * Example API endpoint for ride completion with MLM
 */
const rideCompletionEndpoint = async (req, res) => {
  try {
    const { rideId, userId, driverId, totalFare } = req.body;
    
    // Validate required fields
    if (!rideId || !userId || !driverId || !totalFare) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: rideId, userId, driverId, totalFare'
      });
    }
    
    // Simulate payment completion (replace with actual payment verification)
    const paymentStatus = 'completed';
    
    // Complete ride with MLM distribution
    const result = await completeRideWithMLM({
      rideId,
      userId,
      driverId,
      totalFare,
      paymentStatus
    });
    
    res.status(200).json({
      success: true,
      data: result,
      message: 'Ride completed and MLM earnings distributed to sponsors successfully'
    });
    
  } catch (error) {
    console.error('Ride completion endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete ride with MLM distribution',
      error: error.message
    });
  }
};

/**
 * Example API endpoint to get user's MLM earnings
 */
const getUserMLMEarningsEndpoint = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Get user's MLM earnings
    const earnings = await getUserMLMEarnings(userId);
    
    res.status(200).json({
      success: true,
      data: {
        userId,
        totalBalance: earnings.totalBalance,
        userTreeBalance: earnings.userTreeBalance,
        driverTreeBalance: earnings.driverTreeBalance,
        totalTransactions: earnings.transactions.length,
        recentTransactions: earnings.transactions.slice(0, 10), // Last 10 transactions
        summary: {
          totalEarned: earnings.totalBalance,
          fromUserTree: earnings.userTreeBalance,
          fromDriverTree: earnings.driverTreeBalance,
          averagePerTransaction: earnings.transactions.length > 0 
            ? earnings.totalBalance / earnings.transactions.length 
            : 0
        }
      },
      message: 'MLM earnings retrieved successfully'
    });
    
  } catch (error) {
    console.error('Get MLM earnings endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve MLM earnings',
      error: error.message
    });
  }
};

/**
 * Example webhook handler for payment completion
 * This would be called by your payment processor when payment is confirmed
 */
const paymentCompletionWebhook = async (req, res) => {
  try {
    const { rideId, paymentStatus, amount, userId, driverId } = req.body;
    
    // Verify webhook authenticity (implement your payment provider's verification)
    // ...
    
    if (paymentStatus === 'completed') {
      console.log(`Payment completed for ride ${rideId}, processing MLM distribution...`);
      
      // Trigger MLM distribution
      const mlmResult = await completeRideWithMLM({
        rideId,
        userId,
        driverId,
        totalFare: amount,
        paymentStatus: 'completed'
      });
      
      console.log('MLM distribution completed via webhook');
      
      // You might want to send notifications to users about their earnings
      await notifyUsersAboutEarnings(mlmResult);
    }
    
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('Payment webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

/**
 * Notify users about their MLM earnings (example implementation)
 */
const notifyUsersAboutEarnings = async (mlmResult) => {
  try {
    const allDistributions = [
      ...mlmResult.userTree.distributions,
      ...mlmResult.driverTree.distributions
    ];
    
    for (const distribution of allDistributions) {
      // Send notification to user about their earnings
      console.log(`Notifying ${distribution.username} about $${distribution.amount.toFixed(2)} earnings`);
      
      // Example: Send push notification, email, or in-app notification
      // await sendNotification(distribution.userId, {
      //   type: 'mlm_earnings',
      //   amount: distribution.amount,
      //   level: distribution.level,
      //   treeType: distribution.treeType,
      //   rideId: mlmResult.rideId
      // });
    }
    
  } catch (error) {
    console.error('Error notifying users about earnings:', error);
  }
};

/**
 * Example usage in your existing ride controller
 */
const exampleRideController = {
  // Your existing ride completion logic
  completeRide: async (req, res) => {
    try {
      const { rideId } = req.params;
      const { rating, feedback } = req.body;
      
      // Your existing ride completion logic
      // ...
      
      // Get ride details
      const ride = await Ride.findById(rideId);
      
      // After successful ride completion, trigger MLM distribution
      if (ride.paymentStatus === 'completed') {
        const mlmResult = await completeRideWithMLM({
          rideId: ride._id,
          userId: ride.userId,
          driverId: ride.driverId,
          totalFare: ride.totalFare,
          paymentStatus: ride.paymentStatus
        });
        
        console.log('MLM distribution completed for ride:', rideId);
      }
      
      res.status(200).json({
        success: true,
        message: 'Ride completed successfully'
      });
      
    } catch (error) {
      console.error('Ride completion error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to complete ride'
      });
    }
  }
};

// Export functions for use in your application
export {
  completeRideWithMLM,
  rideCompletionEndpoint,
  getUserMLMEarningsEndpoint,
  paymentCompletionWebhook,
  notifyUsersAboutEarnings,
  exampleRideController
};

/**
 * Example Express.js route setup
 * Add these routes to your existing Express app
 */
/*
import express from 'express';
const router = express.Router();

// Route to complete ride with MLM distribution
router.post('/rides/complete', rideCompletionEndpoint);

// Route to get user's MLM earnings
router.get('/users/:userId/mlm-earnings', getUserMLMEarningsEndpoint);

// Webhook route for payment completion
router.post('/webhooks/payment-completed', paymentCompletionWebhook);

export default router;
*/