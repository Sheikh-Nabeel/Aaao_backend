import express from "express";
import { validateUserId } from "../middlewares/userIdValidation.js";
import authHandler from "../middlewares/authMIddleware.js";
import {
  createMLM,
  getMLM,
  updateMLM,
  updateAllMLMDistributions,
  addMoneyToMLM,
  getUserMLMInfo,
  getMLMStats,
  getMLMFields,
  distributeDualTreeMLMEarnings,
  getUserMLMEarningsSummary,
  getMLMEarningsStats,
  deleteMLM,
  resetMLMData,
  distributeRideMLM,
  getAdminMLMDashboard,
  getUserDDRTree,
  getUserDDREarnings,
  getDDRTransactionHistory,
  getDDRLeaderboard,
  getUserCRREarnings,
  getCRRTransactionHistory,
  getCRRLeaderboard,
  getUserCRRRankTracking,
  getMotivationalQuotes,
  updateMotivationalQuotes,
  getCRRRankConfig,
  updateCRRRankConfig,
  getCRRLegPercentages,
  updateCRRLegPercentages,
  updateAllCRRLegPercentages,
  updateGlobalCRRLegPercentages,
  getDDRCRRStats,
  // BBR Controller Functions
  getCurrentBBRCampaign,
  getBBRCampaignInfo,
  getBBRLeaderboard,
  getPastBBRWins,
  createBBRCampaign,
  updateBBRCampaign,
  deleteBBRCampaign,
  getBBRCampaignManagement,
  // HLR Controller Functions
  getUserHLRProgress,
  getHLRLeaderboard,
  updateHLRConfig,
  manuallyAwardHLR,
  getHLRManagement,
  // Regional Ambassador Controller Functions
  getUserRegionalProgress,
  getRegionalLeaderboard,
  getGlobalAmbassadors,
  handleCountryUpdateRequest,
  processCountryUpdateRequest,
  updateRegionalAmbassadorConfig,
  getPendingApprovalsAndEarnings,
  // Comprehensive Earnings Controller
  getUserComprehensiveEarnings,
  // Admin MLM Initialization Functions
  initializeCompleteMLMSystem,
  getMLMSystemStatus,
  resetAndReinitializeMLM,
  // CRR Admin Functions
   getAdminCRROverview,
   getCRRRankAnalysis,
   testCRRRankSystem,
   // CRR and BBR Reward Functions
   claimCRRReward,
   distributeBBRRewards,
   // User Dashboard Functions
   getUserMLMDashboard,
  cleanupDuplicateTransactions
} from "../controllers/mlmController.js";
import adminHandler from '../middlewares/adminMiddleware.js';

const router = express.Router();

// Create MLM system (Admin only)
router.post("/create", createMLM);

// Get MLM system
router.get("/", getMLM);

// Update MLM system (Admin only)
router.put("/update", updateMLM);

// Update all MLM distributions (Admin only)
router.put("/update-all", updateAllMLMDistributions);

// Add money to MLM system (called after ride completion)
router.post("/add-money", addMoneyToMLM);

// Get user's MLM information
router.get("/user/:userId", validateUserId, getUserMLMInfo);

// Get MLM statistics (Admin only)
router.get("/stats", getMLMStats);

// Get specific MLM fields
router.get("/fields", getMLMFields);

// Dual-Tree MLM Routes
// Distribute MLM earnings after ride completion (Dual-Tree System)
router.post("/distribute-dual-tree", distributeDualTreeMLMEarnings);

// Admin delete and reset functions
router.delete("/delete", adminHandler, deleteMLM);
router.post("/reset-data", adminHandler, resetMLMData);

// Ride completion MLM distribution
router.post("/distribute-ride", distributeRideMLM);

// Admin dashboard - all payments from all users
router.get("/admin-dashboard", getAdminMLMDashboard);

// User DDR tree view
router.get("/user-tree/:userId", validateUserId, getUserDDRTree);

// Get user's MLM earnings summary (Dual-Tree System)
router.get("/user-earnings/:userId", validateUserId, getUserMLMEarningsSummary);

// Get comprehensive user MLM dashboard with all earnings breakdown
router.get("/user-dashboard/:userId", validateUserId, getUserMLMDashboard);

// Get MLM earnings statistics for admin (Dual-Tree System)
router.get("/earnings-stats", getMLMEarningsStats);

// DDR Dashboard Routes
// Get user DDR earnings by level
router.get("/ddr/earnings/:userId", validateUserId, getUserDDREarnings);

// Get DDR transaction history with pagination
router.get("/ddr/transactions/:userId", validateUserId, getDDRTransactionHistory);

// Get DDR leaderboard
router.get("/ddr/leaderboard", getDDRLeaderboard);

// CRR Dashboard Routes
// Get user CRR earnings and qualification status
router.get("/crr/earnings/:userId", validateUserId, getUserCRREarnings);

// Get CRR transaction history
router.get("/crr/transactions/:userId", validateUserId, getCRRTransactionHistory);

// Get CRR leaderboard with rank-based grouping
router.get("/crr/leaderboard", getCRRLeaderboard);

// Get user's CRR rank tracking (all ranks with achievement status)
router.get("/crr/rank-tracking/:userId", validateUserId, getUserCRRRankTracking);

// Admin Management Routes
// Get motivational quotes for DDR/CRR dashboards
router.get("/admin/quotes", adminHandler, getMotivationalQuotes);

// Update motivational quotes
router.put("/admin/quotes", adminHandler, updateMotivationalQuotes);

// Get CRR rank configuration
router.get("/admin/crr/config",  getCRRRankConfig);

// Update CRR rank configuration
router.put("/admin/crr/config",  updateCRRRankConfig);

// Get CRR leg percentages (public)
router.get("/crr/leg-percentages", getCRRLegPercentages);

// Get CRR leg percentages (admin)
router.get("/admin/crr/leg-percentages", getCRRLegPercentages);

// Update CRR leg percentages (Admin only)
router.put("/admin/crr/leg-percentages", adminHandler, updateCRRLegPercentages);

// Update ALL CRR leg percentages at once (Admin only)
router.put("/admin/crr/leg-percentages/bulk", adminHandler, updateAllCRRLegPercentages);

// Update global CRR leg percentages (Admin only)
router.put("/admin/crr/global-leg-percentages", updateGlobalCRRLegPercentages);

// Get DDR/CRR system statistics for admin
router.get("/admin/ddr-crr-stats",  getDDRCRRStats);

// BBR (Bonus Booster Rewards) Routes
// Get current BBR campaign (general information)
router.get("/bbr/campaign", getBBRCampaignInfo);

// Get current BBR campaign with user progress
router.get("/bbr/current-campaign/:userId", validateUserId, getCurrentBBRCampaign);

// Get BBR leaderboard
router.get("/bbr/leaderboard", getBBRLeaderboard);

// Get user's past BBR wins history
router.get("/bbr/past-wins/:userId", validateUserId, getPastBBRWins);

// Admin BBR Routes
// Create new BBR campaign (Admin only)
router.post("/admin/bbr/campaign",  createBBRCampaign);

// Update BBR campaign (Admin only)
router.put("/admin/bbr/campaign",  updateBBRCampaign);

// Delete/End BBR campaign (Admin only)
router.delete("/admin/bbr/campaign",  deleteBBRCampaign);

// Get BBR campaign management (Admin only)
router.get("/admin/bbr/management",  getBBRCampaignManagement);

// Claim CRR Rank Reward
router.post("/crr/claim-reward/:userId", validateUserId, claimCRRReward);

// Distribute BBR Campaign Rewards (Admin only)
router.post("/admin/bbr/distribute-rewards/:campaignId", adminHandler, distributeBBRRewards);

// HLR (HonorPay Loyalty Rewards) Routes
// Get user's HLR progress and qualification status
router.get("/hlr/progress/:userId", validateUserId, getUserHLRProgress);

// Get HLR leaderboard
router.get("/hlr/leaderboard", getHLRLeaderboard);

// Admin HLR Routes
// Update HLR configuration (Admin only)
router.put("/admin/hlr/config", updateHLRConfig);

// Manually award HLR to user (Admin only)
router.post("/admin/hlr/award", manuallyAwardHLR);

// Get HLR management dashboard (Admin only)
router.get("/admin/hlr/management", getHLRManagement);

// Regional Ambassador Routes
// Get user's Regional Ambassador progress
router.get("/regional/progress/:userId", validateUserId, getUserRegionalProgress);

// Get regional leaderboard by country
router.get("/regional/leaderboard", getRegionalLeaderboard);

// Get global ambassadors list
router.get("/regional/global-ambassadors", getGlobalAmbassadors);

// Comprehensive Earnings Route
// Get user's comprehensive earnings and progress from all MLM programs
router.get("/comprehensive-earnings/:userId", validateUserId, getUserComprehensiveEarnings);

// Get pending approvals and total MLM earnings for user
router.get("/pending-approvals-earnings", authHandler, getPendingApprovalsAndEarnings);

// Handle country update request from user
router.post("/regional/country-update-request", handleCountryUpdateRequest);

// Admin Regional Ambassador Routes
// Process country update requests (Admin only)
router.put("/admin/regional/country-update",  processCountryUpdateRequest);

// Update regional ambassador configuration (Admin only)
router.put("/admin/regional/config", updateRegionalAmbassadorConfig);

// ==================== ADMIN MLM INITIALIZATION ROUTES ====================

// Initialize complete MLM system with all configurations (Admin only)
router.post("/admin/initialize-system", initializeCompleteMLMSystem);

// Get complete MLM system status and statistics (Admin only)
router.get("/admin/system-status", getMLMSystemStatus);

// Reset and reinitialize entire MLM system (Admin only)
router.post("/admin/reset-reinitialize", resetAndReinitializeMLM);

// CRR Admin Routes
// Get CRR overview for admin dashboard
router.get("/admin/crr/overview", getAdminCRROverview);

// Get CRR rank analysis for specific rank
router.get("/admin/crr/rank/:rank", getCRRRankAnalysis);

// Get CRR rank configuration
router.get("/admin/crr/config", getCRRRankConfig);

// Test CRR rank system
router.post("/admin/crr/test", testCRRRankSystem);

// Cleanup duplicate transactions route
router.post("/admin/cleanup-duplicates", cleanupDuplicateTransactions);

export default router;