import express from "express";
import multer from "multer";
import path from "path";

import authHandler from "../middlewares/authMIddleware.js";
import { getSelectFlow, registerVehicle, updateVehicle, getUserVehicle, listVehicles, adminListVehicles, adminReviewVehicle, adminUpdateVehicle } from "../controllers/vehiclesController.js";

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

const router = express.Router();

// Public options for hierarchical selects
router.get("/select-flow", getSelectFlow);

// Vehicle registration and updates (auth required)
router.post(
  "/register",
  authHandler,
  upload.fields([
    { name: "vehicleRegistrationCardFront", maxCount: 1 },
    { name: "vehicleRegistrationCardBack", maxCount: 1 },
    { name: "roadAuthorityCertificate", maxCount: 1 },
    { name: "insuranceCertificate", maxCount: 1 },
    { name: "vehicleImages", maxCount: 8 },
  ]),
  registerVehicle
);

router.post(
  "/update",
  authHandler,
  upload.fields([
    { name: "vehicleRegistrationCardFront", maxCount: 1 },
    { name: "vehicleRegistrationCardBack", maxCount: 1 },
    { name: "roadAuthorityCertificate", maxCount: 1 },
    { name: "insuranceCertificate", maxCount: 1 },
    { name: "vehicleImages", maxCount: 8 },
  ]),
  updateVehicle
);

router.get("/me", authHandler, getUserVehicle);
router.get("/", listVehicles);

// Admin vehicle moderation
router.get("/admin/list", authHandler, adminListVehicles);
router.post("/admin/review", authHandler, adminReviewVehicle);
router.post(
  "/admin/update",
  authHandler,
  upload.fields([
    { name: "vehicleRegistrationCardFront", maxCount: 1 },
    { name: "vehicleRegistrationCardBack", maxCount: 1 },
    { name: "roadAuthorityCertificate", maxCount: 1 },
    { name: "insuranceCertificate", maxCount: 1 },
    { name: "vehicleImages", maxCount: 8 },
  ]),
  adminUpdateVehicle
);

export default router;

