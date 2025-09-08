import express from "express";
import {
  addOffer,
  getAllOffers,
  getOfferById,
  updateOffer,
  deleteOffer,
} from "../controllers/offerController.js";
import adminHandler from "../middlewares/adminMiddleware.js";
import authHandler from "../middlewares/authMIddleware.js";

const router = express.Router();

// Public routes (if needed)
// For example: router.get("/", getAllOffers); // But since offers might be public or protected

// Protected routes
router.use(authHandler);

// Get all offers (accessible to authenticated users)
router.get("/", getAllOffers);
router.get("/:id", getOfferById);

// Admin/Superadmin only routes
router.post("/", adminHandler, addOffer);
router.put("/:id", adminHandler, updateOffer);
router.delete("/:id", adminHandler, deleteOffer);

export default router;
