import express from "express";
import auth from "../middlewares/authMIddleware.js";
import admin from "../middlewares/adminMiddleware.js";
import {
  listUsers,
  getUserById,
  updateUserRole,
} from "../controllers/adminUserController.js";
import {
  getAdminOverview,
  getBookingChats,
  getAdminDashboard,
  addChatKeywords,
  getChatKeywords,
  deleteChatKeyword,
  searchChatsByKeywords,
  getDriverReports,
  getRideServiceReports,
  getAnalyticsReports,
} from "../controllers/adminDashboardController.js";

const router = express.Router();

// Secure all routes
router.use(auth);
router.use(admin);

// Helper to set default type for list endpoints
const setType = (type) => (req, _res, next) => {
  if (!req.query) req.query = {};
  if (!req.query.type) req.query.type = type;
  next();
};

// Admin dashboard - combined (supports ?type=bookings|customers|drivers&page&limit&bookingId)
router.get("/dashboard", getAdminDashboard);

// Admin dashboard - separate list endpoints (pagination via ?page&limit)
router.get("/dashboard/bookings", setType("bookings"), getAdminDashboard);
router.get("/dashboard/customers", setType("customers"), getAdminDashboard);
router.get("/dashboard/drivers", setType("drivers"), getAdminDashboard);

// Admin dashboard - totals only
router.get("/dashboard/overview", getAdminOverview);

// Admin dashboard - chats for a booking
router.get("/dashboard/booking/:bookingId/chats", getBookingChats);

// Admin dashboard - reports
router.get("/dashboard/reports/drivers", getDriverReports);
router.get("/dashboard/reports/rides-services", getRideServiceReports);
router.get("/dashboard/reports/analytics", getAnalyticsReports); // optional ?days=30

// Admin dashboard - chat keywords management
router.post("/dashboard/keywords", addChatKeywords); // body: { words: string[] }
router.get("/dashboard/keywords", getChatKeywords);
router.delete("/dashboard/keywords/:word", deleteChatKeyword);
router.get("/dashboard/keywords/search-chats", searchChatsByKeywords); // ?page&limit&words=optional,comma,separated

router.get("/", listUsers);
router.get("/:id", getUserById);
router.put("/:id/role", updateUserRole);

export default router;
