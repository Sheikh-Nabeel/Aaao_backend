import express from "express";
import multer from "multer";
import path from "path";

import authHandler from "../middlewares/authMIddleware.js";
import { 
  getVehicleAndDriverHiring, 
  registerVehicle, 
  setDriverDecision, 
  submitDriverHiring,
  deleteVehicle,
  deleteDriverHiring 
} from "../controllers/vehicleHiringController.js";

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

const router = express.Router();

// API 1: Register Vehicle
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

// API 2: Set Driver Decision
router.post("/decision", authHandler, setDriverDecision);

// API 3: Submit Driver Hiring
router.post(
  "/submit",
  authHandler,
  upload.fields([
    { name: "registrationCardFront", maxCount: 1 },
    { name: "registrationCardBack", maxCount: 1 },
    { name: "vehicleImages", maxCount: 8 },
  ]),
  submitDriverHiring
);

// API 4: Get Vehicle and Driver Hiring Data
router.get("/data", authHandler, getVehicleAndDriverHiring);

// API 5: Delete Vehicle Registration
router.delete("/vehicle/:userId/:vehicleId",  deleteVehicle);

// API 6: Delete Driver Hiring Post
router.delete("/driver-hiring/:userId/:driverHiringId",  deleteDriverHiring);

export default router;