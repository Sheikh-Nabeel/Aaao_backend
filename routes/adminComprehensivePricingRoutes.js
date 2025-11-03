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
  getPricingByQuery,
  updatePricingByQuery,
} from "../controllers/adminComprehensivePricingController.js";
import authHandler from "../middlewares/authMIddleware.js";
import adminHandler from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.use(authHandler);
router.use(adminHandler);

// Selective GET/PUT with camelCase queries supported at controller level
router.get("/", getPricingByQuery);
router.put("/", updatePricingByQuery);

// Service-level updates (camelCase paths)
router.put("/carRecoveryRates", updateCarRecoveryRates);
router.put("/carCabRates", updateCarCabRates);
router.put("/bikeRates", updateBikeRates);
router.put("/roundTripFeatures", updateRoundTripFeatures);
router.put("/updateAll", bulkUpdatePricing);

// Item pricing (camelCase paths)
router.get("/itemPricing", getItemPricing);
router.post("/itemPricing", addItemPricing);
router.put("/itemPricing/:itemName", updateItemPricing);
router.delete("/itemPricing/:itemName", deleteItemPricing);

// Currency and granular recovery pricing (camelCase paths)
router.put("/pricing/currency", authHandler, updateCurrency);
router.put("/pricing/recovery/coreRates", authHandler, updateRecoveryCoreRates);
router.put(
  "/pricing/recovery/waitingCharges",
  authHandler,
  updateRecoveryWaitingCharges
);
router.put(
  "/pricing/recovery/cancellationCharges",
  authHandler,
  updateRecoveryCancellationCharges
);
router.put(
  "/pricing/recovery/nightCharges",
  authHandler,
  updateRecoveryNightCharges
);
router.put(
  "/pricing/recovery/surgeFlags",
  authHandler,
  updateRecoverySurgeFlags
);

export default router;
