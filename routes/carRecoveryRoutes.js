import express from "express";
import protect from "../middlewares/authMIddleware.js";
import {
  getCarRecoveryServices,
  createCarRecoveryRequest,
  getCarRecoveryRequest,
  updateBookingStatus,
  getUserCarRecoveryRequests,
  getDriverCarRecoveryRequests,
  cancelCarRecoveryRequest,
  updateDriverLocation,
  sendMessage,
  getMessages,
  getCarRecoveryHistoryStats,
  // new
  searchDrivers,
  pinDriver,
  unpinDriver,
  getPinnedDrivers,
  favoriteDriver,
  unfavoriteDriver,
  getFavoriteDrivers,
  addSavedLocation,
  updateSavedLocation,
  deleteSavedLocation,
  getSavedLocations,
} from "../controllers/carRecoveryController.js";
 
const router = express.Router();

// Public routes
router.get("/services", getCarRecoveryServices);

// Protected routes (require authentication)
router.use(protect);

// Search drivers
router.get("/drivers/search", searchDrivers);

// Pinned drivers
router.post("/drivers/:driverId/pin", pinDriver);
router.delete("/drivers/:driverId/pin", unpinDriver);
router.get("/drivers/pinned", getPinnedDrivers);

// Favorite drivers
router.post("/drivers/:driverId/favorite", favoriteDriver);
router.delete("/drivers/:driverId/favorite", unfavoriteDriver);
router.get("/drivers/favorites", getFavoriteDrivers);

// Saved locations
router.post("/saved-locations", addSavedLocation);
router.put("/saved-locations/:locationId", updateSavedLocation);
router.delete("/saved-locations/:locationId", deleteSavedLocation);
router.get("/saved-locations", getSavedLocations);

// History & stats (customer or driver)
router.get("/history", getCarRecoveryHistoryStats);

// User routes
router.post("/", createCarRecoveryRequest);
router.get("/user/requests", getUserCarRecoveryRequests);
router.get("/:id", getCarRecoveryRequest);
router.put("/:id/cancel", cancelCarRecoveryRequest);

// Driver routes
router.get("/driver/requests", getDriverCarRecoveryRequests);
router.put("/:id/status", updateBookingStatus);
router.post("/:id/location", updateDriverLocation);

// Messaging
router.post("/:id/messages", sendMessage);
router.get("/:id/messages", getMessages);

export default router;
