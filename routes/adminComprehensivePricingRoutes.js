import express from "express";
import {
  getComprehensivePricing,
  updateCarRecoveryRates,
  updateCarCabRates,
  updateBikeRates,
  updateRoundTripFeatures,
  bulkUpdatePricing,
  getItemPricing,
  addItemPricing,
  updateItemPricing,
  deleteItemPricing,
  updateCurrency,
  updateRecoveryCoreRates,
  updateRecoveryWaitingCharges,
  updateRecoveryCancellationCharges,
  updateRecoveryNightCharges,
  updateRecoverySurgeFlags,
} from "../controllers/adminComprehensivePricingController.js";
import authHandler from "../middlewares/authMIddleware.js";
import adminHandler from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.use(authHandler);
router.use(adminHandler);

router.get("/", getComprehensivePricing);
router.put("/car-recovery-rates", updateCarRecoveryRates);
router.put("/car-cab-rates", updateCarCabRates);
router.put("/bike-rates", updateBikeRates);
router.put("/round-trip-features", updateRoundTripFeatures);
router.put("/update-all", bulkUpdatePricing);
router.get("/item-pricing", getItemPricing);
router.post("/item-pricing", addItemPricing);
router.put("/item-pricing/:itemName", updateItemPricing);
router.delete("/item-pricing/:itemName", deleteItemPricing);

router.put("/pricing/currency", authHandler, updateCurrency);

router.put("/pricing/recovery/core", authHandler, updateRecoveryCoreRates);
router.put(
  "/pricing/recovery/waiting",
  authHandler,
  updateRecoveryWaitingCharges
);
router.put(
  "/pricing/recovery/cancellation",
  authHandler,
  updateRecoveryCancellationCharges
);
router.put("/pricing/recovery/night", authHandler, updateRecoveryNightCharges);
router.put(
  "/pricing/recovery/surge-flags",
  authHandler,
  updateRecoverySurgeFlags
);

export default router;
