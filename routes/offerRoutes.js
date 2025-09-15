import express from "express";
import multer from "multer";
import path from "path";
import {
  addOffer,
  getAllOffers,
  getOfferById,
  updateOffer,
  deleteOffer,
  likeOffer,
  unlikeOffer,
} from "../controllers/offerController.js";
import authHandler from "../middlewares/authMIddleware.js";
import adminHandler from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "offer-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Routes
router.get("/", authHandler, getAllOffers);
router.get("/:id", authHandler, getOfferById);
router.post("/", authHandler, adminHandler, upload.single("picture"), addOffer);
router.put("/:id", authHandler, adminHandler, upload.single("picture"), updateOffer);
router.delete("/:id", authHandler, adminHandler, deleteOffer);

// Like/Unlike routes (Authenticated users only)
router.post("/:id/like", authHandler, likeOffer);
router.delete("/:id/like", authHandler, unlikeOffer);

export default router;
