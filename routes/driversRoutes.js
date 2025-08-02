const express = require("express");
const {
  uploadLicense,
  handleVehicleDecision,
  registerVehicle,
  updateVehicle,
  getUserVehicleInfo,
  getCurrentUser,
} = require("../controllers/driversController");
const authHandler = require("../middlewares/authMIddleware");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

const router = express.Router();

router.post(
  "/upload-license",
  authHandler,
  upload.single("licenseImage"),
  uploadLicense
);
router.post("/vehicle-decision", authHandler, handleVehicleDecision);
router.post(
  "/register-vehicle",
  authHandler,
  upload.fields([
    { name: "vehicleRegistrationCardFront", maxCount: 1 },
    { name: "vehicleRegistrationCardBack", maxCount: 1 },
    { name: "roadAuthorityCertificate", maxCount: 1 },
    { name: "insuranceCertificate", maxCount: 1 },
    { name: "vehicleImages", maxCount: 4 },
  ]),
  registerVehicle
);
router.post(
  "/update-vehicle",
  authHandler,
  upload.fields([
    { name: "vehicleRegistrationCardFront", maxCount: 1 },
    { name: "vehicleRegistrationCardBack", maxCount: 1 },
    { name: "roadAuthorityCertificate", maxCount: 1 },
    { name: "insuranceCertificate", maxCount: 1 },
    { name: "vehicleImages", maxCount: 4 },
  ]),
  updateVehicle
);
router.get("/user-vehicle-info", authHandler, getUserVehicleInfo);
router.get("/get-current-user", authHandler, getCurrentUser);


module.exports = router;
