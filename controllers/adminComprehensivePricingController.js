import ComprehensivePricing from '../models/comprehensivePricingModel.js';

// Validation helper functions
const validatePositiveNumber = (value, fieldName) => {
    if (value === undefined || value === null) return null;
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
        throw new Error(`${fieldName} must be a positive number`);
    }
    return num;
};

const validatePercentage = (value, fieldName) => {
    if (value === undefined || value === null) return null;
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 100) {
        throw new Error(`${fieldName} must be a percentage between 0 and 100`);
    }
    return num;
};

const validateInteger = (value, fieldName, min = 0, max = null) => {
    if (value === undefined || value === null) return null;
    const num = parseInt(value);
    if (isNaN(num) || num < min || (max !== null && num > max)) {
        throw new Error(`${fieldName} must be an integer between ${min} and ${max || 'infinity'}`);
    }
    return num;
};

const validateBoolean = (value, fieldName) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'boolean') {
        throw new Error(`${fieldName} must be a boolean value`);
    }
    return value;
};

// Get comprehensive pricing configuration
const getComprehensivePricing = async (req, res) => {
  try {
    const config = await ComprehensivePricing.findOne({ isActive: true })
      .populate('lastUpdatedBy', 'name email');
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching comprehensive pricing configuration',
      error: error.message
    });
  }
};

// Update base fare configuration
const updateBaseFare = async (req, res) => {
  try {
    const { amount, coverageKm } = req.body;
    const adminId = req.user.id;
    
    // Validate input
    const validatedAmount = validatePositiveNumber(amount, 'Base fare amount');
    const validatedCoverageKm = validatePositiveNumber(coverageKm, 'Coverage distance');
    
    if (validatedAmount === null && validatedCoverageKm === null) {
      return res.status(400).json({
        success: false,
        message: 'At least one field (amount or coverageKm) must be provided'
      });
    }
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    // Update only provided fields
    if (validatedAmount !== null) {
      config.baseFare.amount = validatedAmount;
    }
    if (validatedCoverageKm !== null) {
      config.baseFare.coverageKm = validatedCoverageKm;
    }
    config.lastUpdatedBy = adminId;
    
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Base fare updated successfully',
      data: config.baseFare
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Error updating base fare',
      error: error.message
    });
  }
};

// Update per KM rates
const updatePerKmRates = async (req, res) => {
  try {
    const { afterBaseCoverage, cityWiseAdjustment } = req.body;
    const adminId = req.user.id;
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    if (afterBaseCoverage !== undefined) {
      config.perKmRate.afterBaseCoverage = afterBaseCoverage;
    }
    
    if (cityWiseAdjustment) {
      if (cityWiseAdjustment.enabled !== undefined) {
        config.perKmRate.cityWiseAdjustment.enabled = cityWiseAdjustment.enabled;
      }
      if (cityWiseAdjustment.aboveKm !== undefined) {
        config.perKmRate.cityWiseAdjustment.aboveKm = cityWiseAdjustment.aboveKm;
      }
      if (cityWiseAdjustment.adjustedRate !== undefined) {
        config.perKmRate.cityWiseAdjustment.adjustedRate = cityWiseAdjustment.adjustedRate;
      }
    }
    
    config.lastUpdatedBy = adminId;
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Per KM rates updated successfully',
      data: config.perKmRate
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating per KM rates',
      error: error.message
    });
  }
};

// Update platform fees
const updatePlatformFees = async (req, res) => {
  try {
    const { percentage, driverShare, customerShare } = req.body;
    const adminId = req.user.id;
    
    // Validate input
    const validatedPercentage = validatePercentage(percentage, 'Platform fee percentage');
    const validatedDriverShare = validatePercentage(driverShare, 'Driver share percentage');
    const validatedCustomerShare = validatePercentage(customerShare, 'Customer share percentage');
    
    if (validatedPercentage === null && validatedDriverShare === null && validatedCustomerShare === null) {
      return res.status(400).json({
        success: false,
        message: 'At least one field must be provided'
      });
    }
    
    // Validate that driver and customer shares don't exceed total percentage
    if (validatedDriverShare !== null && validatedCustomerShare !== null) {
      if (validatedDriverShare + validatedCustomerShare > 100) {
        return res.status(400).json({
          success: false,
          message: 'Driver share and customer share combined cannot exceed 100%'
        });
      }
    }
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    // Update only provided fields
    if (validatedPercentage !== null) {
      config.platformFee.percentage = validatedPercentage;
    }
    if (validatedDriverShare !== null) {
      config.platformFee.driverShare = validatedDriverShare;
    }
    if (validatedCustomerShare !== null) {
      config.platformFee.customerShare = validatedCustomerShare;
    }
    config.lastUpdatedBy = adminId;
    
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Platform fees updated successfully',
      data: config.platformFee
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Error updating platform fees',
      error: error.message
    });
  }
};

// Update cancellation charges
const updateCancellationCharges = async (req, res) => {
  try {
    const { beforeArrival, after25PercentDistance, after50PercentDistance, afterArrival } = req.body;
    const adminId = req.user.id;
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    if (beforeArrival !== undefined) config.cancellationCharges.beforeArrival = beforeArrival;
    if (after25PercentDistance !== undefined) config.cancellationCharges.after25PercentDistance = after25PercentDistance;
    if (after50PercentDistance !== undefined) config.cancellationCharges.after50PercentDistance = after50PercentDistance;
    if (afterArrival !== undefined) config.cancellationCharges.afterArrival = afterArrival;
    config.lastUpdatedBy = adminId;
    
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Cancellation charges updated successfully',
      data: config.cancellationCharges
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating cancellation charges',
      error: error.message
    });
  }
};

// Update waiting charges
const updateWaitingCharges = async (req, res) => {
  try {
    const { freeMinutes, perMinuteRate, maximumCharge } = req.body;
    const adminId = req.user.id;
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    if (freeMinutes !== undefined) config.waitingCharges.freeMinutes = freeMinutes;
    if (perMinuteRate !== undefined) config.waitingCharges.perMinuteRate = perMinuteRate;
    if (maximumCharge !== undefined) config.waitingCharges.maximumCharge = maximumCharge;
    config.lastUpdatedBy = adminId;
    
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Waiting charges updated successfully',
      data: config.waitingCharges
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating waiting charges',
      error: error.message
    });
  }
};

// Update night charges
const updateNightCharges = async (req, res) => {
  try {
    const { enabled, startHour, endHour, fixedAmount, multiplier } = req.body;
    const adminId = req.user.id;
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    if (enabled !== undefined) config.nightCharges.enabled = enabled;
    if (startHour !== undefined) config.nightCharges.startHour = startHour;
    if (endHour !== undefined) config.nightCharges.endHour = endHour;
    if (fixedAmount !== undefined) config.nightCharges.fixedAmount = fixedAmount;
    if (multiplier !== undefined) config.nightCharges.multiplier = multiplier;
    config.lastUpdatedBy = adminId;
    
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Night charges updated successfully',
      data: config.nightCharges
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating night charges',
      error: error.message
    });
  }
};

// Update surge pricing
const updateSurgePricing = async (req, res) => {
  try {
    const { enabled, adminControlled, levels } = req.body;
    const adminId = req.user.id;
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    if (enabled !== undefined) config.surgePricing.enabled = enabled;
    if (adminControlled !== undefined) config.surgePricing.adminControlled = adminControlled;
    if (levels && Array.isArray(levels)) config.surgePricing.levels = levels;
    config.lastUpdatedBy = adminId;
    
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Surge pricing updated successfully',
      data: config.surgePricing
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating surge pricing',
      error: error.message
    });
  }
};

// Update car recovery service rates (Towing, Flatbed, Wheel Lift, Jumpstart)
const updateCarRecoveryRates = async (req, res) => {
  try {
    const { enabled, flatbed, wheelLift, jumpstart } = req.body;
    const adminId = req.user.id;
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    if (enabled !== undefined) config.serviceTypes.carRecovery.enabled = enabled;
    
    if (flatbed && flatbed.perKmRate !== undefined) {
      config.serviceTypes.carRecovery.flatbed.perKmRate = flatbed.perKmRate;
    }
    
    if (wheelLift && wheelLift.perKmRate !== undefined) {
      config.serviceTypes.carRecovery.wheelLift.perKmRate = wheelLift.perKmRate;
    }
    
    if (jumpstart) {
      if (jumpstart.fixedRate !== undefined) {
        config.serviceTypes.carRecovery.jumpstart.fixedRate = jumpstart.fixedRate;
      }
      if (jumpstart.minAmount !== undefined) {
        config.serviceTypes.carRecovery.jumpstart.minAmount = jumpstart.minAmount;
      }
      if (jumpstart.maxAmount !== undefined) {
        config.serviceTypes.carRecovery.jumpstart.maxAmount = jumpstart.maxAmount;
      }
    }
    
    config.lastUpdatedBy = adminId;
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Car recovery rates updated successfully',
      data: config.serviceTypes.carRecovery
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating car recovery rates',
      error: error.message
    });
  }
};

// Update car cab service rates
const updateCarCabRates = async (req, res) => {
  try {
    const { enabled, vehicleTypes } = req.body;
    const adminId = req.user.id;
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    if (enabled !== undefined) config.serviceTypes.carCab.enabled = enabled;
    
    if (vehicleTypes) {
      const validVehicleTypes = ['economy', 'premium', 'luxury', 'xl', 'family'];
      
      validVehicleTypes.forEach(vehicleType => {
        if (vehicleTypes[vehicleType]) {
          if (vehicleTypes[vehicleType].baseFare !== undefined) {
            config.serviceTypes.carCab.vehicleTypes[vehicleType].baseFare = vehicleTypes[vehicleType].baseFare;
          }
          if (vehicleTypes[vehicleType].perKmRate !== undefined) {
            config.serviceTypes.carCab.vehicleTypes[vehicleType].perKmRate = vehicleTypes[vehicleType].perKmRate;
          }
        }
      });
    }
    
    config.lastUpdatedBy = adminId;
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Car cab rates updated successfully',
      data: config.serviceTypes.carCab
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating car cab rates',
      error: error.message
    });
  }
};

// Update bike service rates
const updateBikeRates = async (req, res) => {
  try {
    const { enabled, baseFare, perKmRate } = req.body;
    const adminId = req.user.id;
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    if (enabled !== undefined) config.serviceTypes.bike.enabled = enabled;
    if (baseFare !== undefined) config.serviceTypes.bike.baseFare = baseFare;
    if (perKmRate !== undefined) config.serviceTypes.bike.perKmRate = perKmRate;
    config.lastUpdatedBy = adminId;
    
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Bike rates updated successfully',
      data: config.serviceTypes.bike
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating bike rates',
      error: error.message
    });
  }
};

// Update round trip features
const updateRoundTripFeatures = async (req, res) => {
  try {
    const { freeStayMinutes, refreshmentAlert } = req.body;
    const adminId = req.user.id;
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    if (freeStayMinutes) {
      if (freeStayMinutes.enabled !== undefined) {
        config.roundTrip.freeStayMinutes.enabled = freeStayMinutes.enabled;
      }
      if (freeStayMinutes.ratePerKm !== undefined) {
        config.roundTrip.freeStayMinutes.ratePerKm = freeStayMinutes.ratePerKm;
      }
      if (freeStayMinutes.maximumMinutes !== undefined) {
        config.roundTrip.freeStayMinutes.maximumMinutes = freeStayMinutes.maximumMinutes;
      }
    }
    
    if (refreshmentAlert) {
      if (refreshmentAlert.enabled !== undefined) {
        config.roundTrip.refreshmentAlert.enabled = refreshmentAlert.enabled;
      }
      if (refreshmentAlert.minimumDistance !== undefined) {
        config.roundTrip.refreshmentAlert.minimumDistance = refreshmentAlert.minimumDistance;
      }
      if (refreshmentAlert.minimumDuration !== undefined) {
        config.roundTrip.refreshmentAlert.minimumDuration = refreshmentAlert.minimumDuration;
      }
    }
    
    config.lastUpdatedBy = adminId;
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Round trip features updated successfully',
      data: config.roundTrip
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating round trip features',
      error: error.message
    });
  }
};

// Update VAT configuration
const updateVATConfiguration = async (req, res) => {
  try {
    const { enabled, percentage } = req.body;
    const adminId = req.user.id;
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    if (enabled !== undefined) config.vat.enabled = enabled;
    if (percentage !== undefined) config.vat.percentage = percentage;
    config.lastUpdatedBy = adminId;
    
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'VAT configuration updated successfully',
      data: config.vat
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating VAT configuration',
      error: error.message
    });
  }
};

// Update minimum fare
const updateMinimumFare = async (req, res) => {
  try {
    const { minimumFare } = req.body;
    const adminId = req.user.id;
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    if (minimumFare !== undefined) config.minimumFare = minimumFare;
    config.lastUpdatedBy = adminId;
    
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Minimum fare updated successfully',
      data: { minimumFare: config.minimumFare }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating minimum fare',
      error: error.message
    });
  }
};

// Bulk update comprehensive pricing
const bulkUpdatePricing = async (req, res) => {
  try {
    const updates = req.body;
    const adminId = req.user.id;
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Comprehensive pricing configuration not found'
      });
    }
    
    // Apply all updates
    Object.keys(updates).forEach(key => {
      if (key !== 'lastUpdatedBy' && updates[key] !== undefined) {
        if (typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
          // Handle nested objects
          Object.keys(updates[key]).forEach(nestedKey => {
            if (config[key] && updates[key][nestedKey] !== undefined) {
              if (typeof updates[key][nestedKey] === 'object' && !Array.isArray(updates[key][nestedKey])) {
                // Handle deeply nested objects
                Object.keys(updates[key][nestedKey]).forEach(deepKey => {
                  if (config[key][nestedKey] && updates[key][nestedKey][deepKey] !== undefined) {
                    config[key][nestedKey][deepKey] = updates[key][nestedKey][deepKey];
                  }
                });
              } else {
                config[key][nestedKey] = updates[key][nestedKey];
              }
            }
          });
        } else {
          config[key] = updates[key];
        }
      }
    });
    
    config.lastUpdatedBy = adminId;
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Comprehensive pricing updated successfully',
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating comprehensive pricing',
      error: error.message
    });
  }
};

// Get all item pricing for shifting/movers
const getItemPricing = async (req, res) => {
  try {
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Active pricing configuration not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: config.serviceSpecificRates?.shiftingMovers?.itemPricing || []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching item pricing',
      error: error.message
    });
  }
};

// Add new item pricing for shifting/movers
const addItemPricing = async (req, res) => {
  try {
    const { itemName, stairsFarePerFloor, liftFarePerItem, packingFare, fixingFare, loadingUnloadingFare } = req.body;
    const adminId = req.user.id;
    
    // Validate input
    if (!itemName || typeof itemName !== 'string' || itemName.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Valid item name is required'
      });
    }
    
    const validatedStairsFare = validatePositiveNumber(stairsFarePerFloor, 'Stairs fare per floor');
    const validatedLiftFare = validatePositiveNumber(liftFarePerItem, 'Lift fare per item');
    const validatedPackingFare = validatePositiveNumber(packingFare, 'Packing fare');
    const validatedFixingFare = validatePositiveNumber(fixingFare, 'Fixing fare');
    const validatedLoadingFare = validatePositiveNumber(loadingUnloadingFare, 'Loading/unloading fare');
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Active pricing configuration not found'
      });
    }
    
    // Initialize serviceSpecificRates.shiftingMovers if not exists
    if (!config.serviceSpecificRates) {
      config.serviceSpecificRates = {};
    }
    if (!config.serviceSpecificRates.shiftingMovers) {
      config.serviceSpecificRates.shiftingMovers = { itemPricing: [] };
    }
    if (!config.serviceSpecificRates.shiftingMovers.itemPricing) {
      config.serviceSpecificRates.shiftingMovers.itemPricing = [];
    }
    
    // Check if item already exists
    const existingItem = config.serviceSpecificRates.shiftingMovers.itemPricing.find(
      item => item.itemName.toLowerCase() === itemName.toLowerCase()
    );
    
    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'Item pricing already exists. Use update endpoint instead.'
      });
    }
    
    const itemPricingData = {
      itemName: itemName.trim(),
      stairsFarePerFloor: validatedStairsFare || 0,
      liftFarePerItem: validatedLiftFare || 0,
      packingFare: validatedPackingFare || 0,
      fixingFare: validatedFixingFare || 0,
      loadingUnloadingFare: validatedLoadingFare || 0
    };
    
    config.serviceSpecificRates.shiftingMovers.itemPricing.push(itemPricingData);
    config.lastUpdatedBy = adminId;
    await config.save();
    
    res.status(201).json({
      success: true,
      message: 'Item pricing added successfully',
      data: itemPricingData
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Error adding item pricing',
      error: error.message
    });
  }
};

// Update existing item pricing for shifting/movers
const updateItemPricing = async (req, res) => {
  try {
    const { itemName } = req.params;
    const { stairsFarePerFloor, liftFarePerItem, packingFare, fixingFare, loadingUnloadingFare } = req.body;
    const adminId = req.user.id;
    
    // Validate input
    const validatedStairsFare = validatePositiveNumber(stairsFarePerFloor, 'Stairs fare per floor');
    const validatedLiftFare = validatePositiveNumber(liftFarePerItem, 'Lift fare per item');
    const validatedPackingFare = validatePositiveNumber(packingFare, 'Packing fare');
    const validatedFixingFare = validatePositiveNumber(fixingFare, 'Fixing fare');
    const validatedLoadingFare = validatePositiveNumber(loadingUnloadingFare, 'Loading/unloading fare');
    
    if (validatedStairsFare === null && validatedLiftFare === null && 
        validatedPackingFare === null && validatedFixingFare === null && 
        validatedLoadingFare === null) {
      return res.status(400).json({
        success: false,
        message: 'At least one pricing field must be provided'
      });
    }
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Active pricing configuration not found'
      });
    }
    
    // Initialize if not exists
    if (!config.serviceSpecificRates?.shiftingMovers?.itemPricing) {
      return res.status(404).json({
        success: false,
        message: 'Item pricing configuration not found'
      });
    }
    
    // Find existing item
    const existingItemIndex = config.serviceSpecificRates.shiftingMovers.itemPricing.findIndex(
      item => item.itemName.toLowerCase() === itemName.toLowerCase()
    );
    
    if (existingItemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found. Use add endpoint to create new item.'
      });
    }
    
    // Update only provided fields
    const existingItem = config.serviceSpecificRates.shiftingMovers.itemPricing[existingItemIndex];
    if (validatedStairsFare !== null) {
      existingItem.stairsFarePerFloor = validatedStairsFare;
    }
    if (validatedLiftFare !== null) {
      existingItem.liftFarePerItem = validatedLiftFare;
    }
    if (validatedPackingFare !== null) {
      existingItem.packingFare = validatedPackingFare;
    }
    if (validatedFixingFare !== null) {
      existingItem.fixingFare = validatedFixingFare;
    }
    if (validatedLoadingFare !== null) {
      existingItem.loadingUnloadingFare = validatedLoadingFare;
    }
    
    config.lastUpdatedBy = adminId;
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Item pricing updated successfully',
      data: existingItem
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Error updating item pricing',
      error: error.message
    });
  }
};

// Delete item pricing
const deleteItemPricing = async (req, res) => {
  try {
    const { itemName } = req.params;
    const adminId = req.user.id;
    
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Active pricing configuration not found'
      });
    }
    
    if (!config.serviceSpecificRates?.shiftingMovers?.itemPricing) {
      return res.status(404).json({
        success: false,
        message: 'Item pricing configuration not found'
      });
    }
    
    const initialLength = config.serviceSpecificRates.shiftingMovers.itemPricing.length;
    config.serviceSpecificRates.shiftingMovers.itemPricing = 
      config.serviceSpecificRates.shiftingMovers.itemPricing.filter(
        item => item.itemName.toLowerCase() !== itemName.toLowerCase()
      );
    
    if (config.serviceSpecificRates.shiftingMovers.itemPricing.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }
    
    config.lastUpdatedBy = adminId;
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Item pricing deleted successfully',
      data: config.serviceSpecificRates.shiftingMovers.itemPricing
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting item pricing',
      error: error.message
    });
  }
};

export {
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
};