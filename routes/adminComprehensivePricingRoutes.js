import express from 'express';
import {
    getComprehensivePricing,
    updateBaseFare,
    updatePerKmRates,
    updatePlatformFees,
    updateCancellationCharges,
    updateWaitingCharges,
    updateNightCharges,
    updateSurgePricing,
    updateCarRecoveryRates,
    updateCarCabRates,
    updateBikeRates,
    updateRoundTripFeatures,
    updateVATConfiguration,
    updateMinimumFare,
    bulkUpdatePricing,
    getItemPricing,
    addItemPricing,
    updateItemPricing,
    deleteItemPricing
} from '../controllers/adminComprehensivePricingController.js';
import authHandler from '../middlewares/authMIddleware.js';
import adminHandler from '../middlewares/adminMiddleware.js';

const router = express.Router();

// Apply authentication and admin authorization to all routes
router.use(authHandler);
router.use(adminHandler);

// Get comprehensive pricing configuration
router.get('/', getComprehensivePricing);

// Update base fare configuration
router.put('/base-fare', updateBaseFare);

// Update per KM rates
router.put('/per-km-rates', updatePerKmRates);

// Update platform fees
router.put('/platform-fees', updatePlatformFees);

// Update cancellation charges
router.put('/cancellation-charges', updateCancellationCharges);

// Update waiting charges
router.put('/waiting-charges', updateWaitingCharges);

// Update night charges
router.put('/night-charges', updateNightCharges);

// Update surge pricing
router.put('/surge-pricing', updateSurgePricing);

// Update car recovery rates (Towing, Flatbed, Wheel Lift, Jumpstart)
router.put('/car-recovery-rates', updateCarRecoveryRates);

// Update car cab rates
router.put('/car-cab-rates', updateCarCabRates);

// Update bike rates
router.put('/bike-rates', updateBikeRates);

// Update round trip features
router.put('/round-trip-features', updateRoundTripFeatures);

// Update VAT configuration
router.put('/vat-configuration', updateVATConfiguration);

// Update minimum fare
router.put('/minimum-fare', updateMinimumFare);

// Bulk update comprehensive pricing
router.put('/bulk-update', bulkUpdatePricing);

// Item pricing routes for shifting/movers
router.get('/item-pricing', getItemPricing);
router.post('/item-pricing', addItemPricing);
router.put('/item-pricing/:itemName', updateItemPricing);
router.delete('/item-pricing/:itemName', deleteItemPricing);

export default router;