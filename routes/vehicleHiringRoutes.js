import express from "express";
import multer from "multer";
import path from "path";
import authHandler from "../middlewares/authMIddleware.js";
import adminMiddleware from "../middlewares/adminMiddleware.js";
import { 
  getVehicleAndDriverHiring, 
  registerVehicle, 
  setDriverDecision, 
  submitDriverHiring,
  deleteVehicle,
  deleteDriverHiring,
  getPendingDriverHirings,
  acceptDriverHiring,
  rejectDriverHiring,
  applyForDriverHiring,
  getDriverApplications,
  acceptDriverApplication,
  getAllDriverHirings
} from "../controllers/vehicleHiringController.js";

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "Uploads/"),
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

// API 5: Delete Vehicle
router.delete("/vehicle/:userId/:vehicleId", authHandler, deleteVehicle);

// API 6: Delete Driver Hiring
router.delete("/driver-hiring/:userId/:driverHiringId", authHandler, deleteDriverHiring);

// API 7: Get Pending Driver Hirings (Admin Only)
router.get("/pending-driver-hirings", authHandler, adminMiddleware, getPendingDriverHirings);

// API 8: Accept Driver Hiring (Admin Only)
router.post("/accept-driver-hiring/:driverHiringId", authHandler, adminMiddleware, acceptDriverHiring);

// API 9: Reject Driver Hiring (Admin Only)
router.post("/reject-driver-hiring/:driverHiringId", authHandler, adminMiddleware, rejectDriverHiring);

// API 10: Apply for Driver Hiring
router.post("/apply-driver-hiring", authHandler, applyForDriverHiring);

// API 11: Get Driver Applications for a Hiring Post
router.get("/driver-applications/:driverHiringId", authHandler, getDriverApplications);

// API 12: Accept Driver Application
router.post("/accept-driver-application/:driverHiringId/:driverId", authHandler, acceptDriverApplication);
router.get("/all-driver-hirings",  getAllDriverHirings);

export default router;