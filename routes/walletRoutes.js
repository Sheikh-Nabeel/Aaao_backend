import express from "express";
import {
  getUserWallet,
  getWalletTransactions,
  getDriverPaymentHistory,
  getPendingCashPayments,
  recordDriverPayment,
  addToWallet,
  deductFromWallet,
  getAdminWalletOverview,
  adminAdjustWallet,
  createWithdrawalRequest,
  approveWithdrawal,
  rejectWithdrawal,
  pauseWithdrawal,
  resumeWithdrawal,
  getFrozenAccounts,
  setReverifyNeeded,
  getWalletSettings,
  updateWalletSettings,
  freezeWallet,
  unfreezeWallet,
  getAdminTransactionLogs,
  getAdminAdjustmentLogs,
  getAdminPendingWithdrawals,
  updateTransactionNote,
  createAdminAlert,
  listAlerts,
  resolveAlert,
  getAdjustmentTargets
} from "../controllers/walletController.js";
import authHandler from "../middlewares/authMIddleware.js";
import adminHandler from "../middlewares/adminMiddleware.js";

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

// Panels
router.get("/admin/overview", adminHandler, getAdminWalletOverview);
router.post("/admin/adjust", adminHandler, adminAdjustWallet);
router.post("/withdrawal/request", createWithdrawalRequest);
router.put("/admin/withdrawal/:userId/:requestId/approve", adminHandler, approveWithdrawal);
router.put("/admin/withdrawal/:userId/:requestId/reject", adminHandler, rejectWithdrawal);
router.put("/admin/withdrawal/:userId/:requestId/pause", adminHandler, pauseWithdrawal);
router.put("/admin/withdrawal/:userId/:requestId/resume", adminHandler, resumeWithdrawal);
router.get("/admin/settings", adminHandler, getWalletSettings);
router.put("/admin/settings", adminHandler, updateWalletSettings);
router.put("/admin/freeze/:userId", adminHandler, freezeWallet);
router.put("/admin/unfreeze/:userId", adminHandler, unfreezeWallet);
router.get("/admin/transactions", adminHandler, getAdminTransactionLogs);
router.get("/admin/adjustments/logs", adminHandler, getAdminAdjustmentLogs);
router.get("/admin/adjustments/targets", adminHandler, getAdjustmentTargets);
router.get("/admin/withdrawals", adminHandler, getAdminPendingWithdrawals);
router.put("/admin/transactions/:userId/:transactionId/note", adminHandler, updateTransactionNote);
router.post("/admin/alerts/:userId", adminHandler, createAdminAlert);
router.get("/admin/alerts", adminHandler, listAlerts);
router.put("/admin/alerts/:userId/:alertId/resolve", adminHandler, resolveAlert);

export default router;
router.get("/admin/frozen-accounts", adminHandler, getFrozenAccounts);
router.put("/admin/frozen-accounts/:userId/reverify", adminHandler, setReverifyNeeded);
