// Example: Integrating Dual-Tree MLM System with Ride Completion
// This file shows how to integrate the new MLM system into your ride completion workflow

import { distributeDualTreeMLM } from '../utils/mlmHelper.js';

/**
 * Example function showing how to integrate MLM distribution
 * into your existing ride completion workflow
 */
export const completeRideWithMLM = async (rideData) => {
  try {
    const { rideId, userId, driverId, totalFare, paymentStatus } = rideData;
    
    console.log(`Processing ride completion for ride: ${rideId}`);
    
    // Step 1: Complete the ride (your existing logic)
    // await updateRideStatus(rideId, 'completed');
    // await processPayment(rideId, totalFare);
    
    // Step 2: Distribute MLM earnings (new dual-tree system)
    if (paymentStatus === 'completed' && totalFare > 0) {
      console.log('Distributing MLM earnings...');
      
      const mlmResult = await distributeDualTreeMLM(
        userId,
        driverId,
        totalFare,
        rideId
      );
      
      if (mlmResult.success) {
        console.log('✅ MLM earnings distributed successfully');
        console.log(`Total MLM Amount: $${mlmResult.distribution.totalMLMAmount / 100}`);
        console.log(`User Tree Amount: $${mlmResult.distribution.userTreeAmount / 100}`);
        console.log(`Driver Tree Amount: $${mlmResult.distribution.driverTreeAmount / 100}`);
        
        // Log the distribution for audit purposes
        await logMLMDistribution(rideId, mlmResult.distribution);
        
        return {
          success: true,
          rideCompleted: true,
          mlmDistributed: true,
          mlmData: mlmResult.distribution
        };
      } else {
        console.error('❌ MLM distribution failed:', mlmResult.error);
        
        // You might want to retry or log this for manual processing
        await logMLMError(rideId, mlmResult.error);
        
        return {
          success: true,
          rideCompleted: true,
          mlmDistributed: false,
          mlmError: mlmResult.error
        };
      }
    } else {
      console.log('Skipping MLM distribution - payment not completed or invalid fare');
      return {
        success: true,
        rideCompleted: true,
        mlmDistributed: false,
        reason: 'Payment not completed or invalid fare'
      };
    }
    
  } catch (error) {
    console.error('Error completing ride with MLM:', error);
    throw error;
  }
};

/**
 * Example API endpoint for ride completion with MLM
 */
export const rideCompletionEndpoint = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { totalFare, paymentMethod } = req.body;
    
    // Validate request
    if (!rideId || !totalFare) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: rideId, totalFare'
      });
    }
    
    // Get ride details (your existing logic)
    // const ride = await getRideById(rideId);
    // if (!ride) {
    //   return res.status(404).json({ success: false, message: 'Ride not found' });
    // }
    
    // Example ride data (replace with your actual ride retrieval logic)
    const rideData = {
      rideId,
      userId: 'user_id_from_ride', // Get from ride document
      driverId: 'driver_id_from_ride', // Get from ride document
      totalFare,
      paymentStatus: 'completed' // Set based on your payment processing
    };
    
    // Complete ride with MLM distribution
    const result = await completeRideWithMLM(rideData);
    
    res.status(200).json({
      success: true,
      message: 'Ride completed successfully',
      data: result
    });
    
  } catch (error) {
    console.error('Error in ride completion endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing ride',
      error: error.message
    });
  }
};

/**
 * Example function to get user's MLM earnings
 */
export const getUserMLMEarningsEndpoint = async (req, res) => {
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
    
    // Format the response
    const formattedEarnings = {
      totalEarnings: earnings.total / 100, // Convert cents to dollars
      userTreeEarnings: earnings.userTree / 100,
      driverTreeEarnings: earnings.driverTree / 100,
      transactionCount: earnings.transactions.length,
      recentTransactions: earnings.transactions
        .slice(-10) // Get last 10 transactions
        .map(tx => ({
          amount: tx.amount / 100,
          rideId: tx.rideId,
          level: tx.level,
          treeType: tx.treeType,
          timestamp: tx.timestamp,
          type: tx.type
        }))
    };
    
    res.status(200).json({
      success: true,
      data: formattedEarnings
    });
    
  } catch (error) {
    console.error('Error getting user MLM earnings:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting MLM earnings',
      error: error.message
    });
  }
};

/**
 * Helper function to log MLM distribution for audit purposes
 */
const logMLMDistribution = async (rideId, distribution) => {
  try {
    // You can implement your own logging logic here
    console.log(`MLM Distribution Log for Ride ${rideId}:`, {
      timestamp: new Date(),
      rideId,
      totalMLMAmount: distribution.totalMLMAmount,
      userTreeDistributions: distribution.userTree.distributions.length,
      driverTreeDistributions: distribution.driverTree.distributions.length,
      userTreeTotalDistributed: distribution.userTree.totalDistributed,
      driverTreeTotalDistributed: distribution.driverTree.totalDistributed
    });
    
    // You might want to save this to a separate audit log collection
    // await MLMAuditLog.create({ rideId, distribution, timestamp: new Date() });
    
  } catch (error) {
    console.error('Error logging MLM distribution:', error);
  }
};

/**
 * Helper function to log MLM errors for manual processing
 */
const logMLMError = async (rideId, error) => {
  try {
    console.error(`MLM Error for Ride ${rideId}:`, {
      timestamp: new Date(),
      rideId,
      error: error.toString()
    });
    
    // You might want to save this to an error log for manual review
    // await MLMErrorLog.create({ rideId, error: error.toString(), timestamp: new Date() });
    
  } catch (logError) {
    console.error('Error logging MLM error:', logError);
  }
};

/**
 * Example webhook handler for payment completion
 * This shows how you might trigger MLM distribution from a payment webhook
 */
export const paymentWebhookHandler = async (req, res) => {
  try {
    const { event, data } = req.body;
    
    if (event === 'payment.completed') {
      const { rideId, amount, status } = data;
      
      if (status === 'success') {
        // Get ride details
        // const ride = await getRideById(rideId);
        
        // Trigger MLM distribution
        const rideData = {
          rideId,
          userId: 'user_id_from_ride',
          driverId: 'driver_id_from_ride',
          totalFare: amount,
          paymentStatus: 'completed'
        };
        
        await completeRideWithMLM(rideData);
        
        console.log(`MLM distribution triggered for ride ${rideId} via payment webhook`);
      }
    }
    
    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Error in payment webhook handler:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Example usage in Express routes
 */
/*
import express from 'express';
const router = express.Router();

// Complete ride with MLM distribution
router.post('/rides/:rideId/complete', rideCompletionEndpoint);

// Get user's MLM earnings
router.get('/users/:userId/mlm-earnings', getUserMLMEarningsEndpoint);

// Payment webhook
router.post('/webhooks/payment', paymentWebhookHandler);

export default router;
*/

/**
 * Example of how to test the integration
 */
export const testMLMIntegration = async () => {
  const testRideData = {
    rideId: 'TEST_RIDE_001',
    userId: '60d5ecb74b24c72d88f4e001', // Replace with actual user ID
    driverId: '60d5ecb74b24c72d88f4e002', // Replace with actual driver ID
    totalFare: 2500, // $25.00 in cents
    paymentStatus: 'completed'
  };
  
  try {
    const result = await completeRideWithMLM(testRideData);
    console.log('Test Result:', result);
  } catch (error) {
    console.error('Test Error:', error);
  }
};