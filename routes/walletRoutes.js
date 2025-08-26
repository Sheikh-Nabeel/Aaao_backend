import express from "express";
import {
  getUserWallet,
  getWalletTransactions,
  getDriverPaymentHistory,
  getPendingCashPayments,
  recordDriverPayment,
  addToWallet,
  deductFromWallet
} from "../controllers/walletController.js";
import authHandler from "../middlewares/authMIddleware.js";

const router = express.Router();

// All routes require authentication
router.use(authHandler);

// Get user wallet information
router.get("/", getUserWallet);

// Get wallet transaction history
router.get("/transactions", getWalletTransactions);

// Driver-specific routes
router.get("/driver/payment-history", getDriverPaymentHistory);
router.get("/driver/pending-payments", getPendingCashPayments);

// Admin-only routes
router.post("/driver/record-payment", recordDriverPayment);
router.post("/add", addToWallet);
router.post("/deduct", deductFromWallet);

export default router;