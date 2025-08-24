import PricingConfig from '../models/pricingModel.js';

// Get all pricing configurations
const getAllPricingConfigs = async (req, res) => {
  try {
    const configs = await PricingConfig.find({ isActive: true })
      .populate('lastUpdatedBy', 'name email')
      .sort({ serviceType: 1 });
    
    res.status(200).json({
      success: true,
      data: configs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching pricing configurations',
      error: error.message
    });
  }
};

// Get pricing config by service type
const getPricingByServiceType = async (req, res) => {
  try {
    const { serviceType } = req.params;
    
    const config = await PricingConfig.findOne({ 
      serviceType, 
      isActive: true 
    }).populate('lastUpdatedBy', 'name email');
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Pricing configuration not found for this service type'
      });
    }
    
    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching pricing configuration',
      error: error.message
    });
  }
};

// Create or update shifting/movers pricing
const updateShiftingMoversPricing = async (req, res) => {
  try {
    const {
      vehicleType,
      vehicleStartFare,
      perKmFare,
      basicServices,
      itemPricing,
      pickupDropoffPolicy
    } = req.body;
    
    // Validate required fields
    if (!vehicleType || !vehicleStartFare || !perKmFare) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle type, start fare, and per km fare are required'
      });
    }
    
    const shiftingMoversConfig = {
      vehicleType,
      vehicleStartFare,
      perKmFare,
      basicServices: basicServices || {
        loadingUnloadingHelper: { fare: 20, includeInBasicFare: false, baseLimit: 3 },
        packers: { fare: 20, includeInBasicFare: false, baseLimit: 3 },
        fixers: { fare: 20, includeInBasicFare: false, baseLimit: 3 }
      },
      itemPricing: itemPricing || [],
      pickupDropoffPolicy: pickupDropoffPolicy || {
        groundFloorIncluded: true,
        baseCoverageFloors: 1,
        liftMinorCharge: true
      }
    };
    
    const config = await PricingConfig.findOneAndUpdate(
      { serviceType: 'shifting_movers' },
      {
        serviceType: 'shifting_movers',
        shiftingMoversConfig,
        lastUpdatedBy: req.user._id,
        isActive: true
      },
      { new: true, upsert: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Shifting/Movers pricing updated successfully',
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating shifting/movers pricing',
      error: error.message
    });
  }
};

// Create or update car recovery pricing
const updateCarRecoveryPricing = async (req, res) => {
  try {
    const {
      serviceType: recoveryServiceType,
      serviceCharges,
      platformCharges
    } = req.body;
    
    // Validate required fields
    if (!recoveryServiceType || !serviceCharges) {
      return res.status(400).json({
        success: false,
        message: 'Recovery service type and service charges are required'
      });
    }
    
    const carRecoveryConfig = {
      serviceType: recoveryServiceType,
      serviceCharges,
      platformCharges: platformCharges || {
        percentage: 15,
        splitRatio: { customer: 50, serviceProvider: 50 }
      }
    };
    
    const config = await PricingConfig.findOneAndUpdate(
      { serviceType: 'car_recovery' },
      {
        serviceType: 'car_recovery',
        carRecoveryConfig,
        lastUpdatedBy: req.user._id,
        isActive: true
      },
      { new: true, upsert: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Car recovery pricing updated successfully',
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating car recovery pricing',
      error: error.message
    });
  }
};

// Create or update appointment-based service pricing
const updateAppointmentServicePricing = async (req, res) => {
  try {
    const {
      serviceCategory,
      fixedAppointmentFee,
      confirmationSettings
    } = req.body;
    
    // Validate required fields
    if (!serviceCategory) {
      return res.status(400).json({
        success: false,
        message: 'Service category is required'
      });
    }
    
    const appointmentServiceConfig = {
      serviceCategory,
      fixedAppointmentFee: fixedAppointmentFee || 5,
      confirmationSettings: confirmationSettings || {
        surveyTimeoutHours: 24,
        gpsCheckInRequired: true,
        autoDecisionEnabled: true
      }
    };
    
    const config = await PricingConfig.findOneAndUpdate(
      { serviceType: 'appointment_based' },
      {
        serviceType: 'appointment_based',
        appointmentServiceConfig,
        lastUpdatedBy: req.user._id,
        isActive: true
      },
      { new: true, upsert: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Appointment service pricing updated successfully',
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating appointment service pricing',
      error: error.message
    });
  }
};

// Add new item pricing for shifting/movers
const addItemPricing = async (req, res) => {
  try {
    const { itemName, stairsFarePerFloor, liftFarePerItem, packingFare, fixingFare, loadingUnloadingFare } = req.body;
    
    if (!itemName) {
      return res.status(400).json({
        success: false,
        message: 'Item name is required'
      });
    }
    
    const config = await PricingConfig.findOne({ serviceType: 'shifting_movers' });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Shifting/Movers pricing configuration not found'
      });
    }
    
    // Check if item already exists
    const existingItem = config.shiftingMoversConfig.itemPricing.find(
      item => item.itemName.toLowerCase() === itemName.toLowerCase()
    );
    
    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'Item pricing already exists. Use update endpoint instead.'
      });
    }
    
    const itemPricingData = {
      itemName,
      stairsFarePerFloor: stairsFarePerFloor || 0,
      liftFarePerItem: liftFarePerItem || 0,
      packingFare: packingFare || 0,
      fixingFare: fixingFare || 0,
      loadingUnloadingFare: loadingUnloadingFare || 0
    };
    
    config.shiftingMoversConfig.itemPricing.push(itemPricingData);
    config.lastUpdatedBy = req.user._id;
    await config.save();
    
    res.status(201).json({
      success: true,
      message: 'Item pricing added successfully',
      data: itemPricingData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding item pricing',
      error: error.message
    });
  }
};

// Update existing item pricing for shifting/movers
const updateItemPricing = async (req, res) => {
  try {
    const { itemName, stairsFarePerFloor, liftFarePerItem, packingFare, fixingFare, loadingUnloadingFare } = req.body;
    
    if (!itemName) {
      return res.status(400).json({
        success: false,
        message: 'Item name is required'
      });
    }
    
    const config = await PricingConfig.findOne({ serviceType: 'shifting_movers' });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Shifting/Movers pricing configuration not found'
      });
    }
    
    // Find existing item or create new one
    const existingItemIndex = config.shiftingMoversConfig.itemPricing.findIndex(
      item => item.itemName.toLowerCase() === itemName.toLowerCase()
    );
    
    const itemPricingData = {
      itemName,
      stairsFarePerFloor: stairsFarePerFloor || 0,
      liftFarePerItem: liftFarePerItem || 0,
      packingFare: packingFare || 0,
      fixingFare: fixingFare || 0,
      loadingUnloadingFare: loadingUnloadingFare || 0
    };
    
    if (existingItemIndex >= 0) {
      config.shiftingMoversConfig.itemPricing[existingItemIndex] = itemPricingData;
    } else {
      return res.status(404).json({
        success: false,
        message: 'Item not found. Use add endpoint to create new item.'
      });
    }
    
    config.lastUpdatedBy = req.user._id;
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Item pricing updated successfully',
      data: config.shiftingMoversConfig.itemPricing
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating item pricing',
      error: error.message
    });
  }
};

// Delete item pricing
const deleteItemPricing = async (req, res) => {
  try {
    const { itemName } = req.params;
    
    const config = await PricingConfig.findOne({ serviceType: 'shifting_movers' });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Shifting/Movers pricing configuration not found'
      });
    }
    
    config.shiftingMoversConfig.itemPricing = config.shiftingMoversConfig.itemPricing.filter(
      item => item.itemName.toLowerCase() !== itemName.toLowerCase()
    );
    
    config.lastUpdatedBy = req.user._id;
    await config.save();
    
    res.status(200).json({
      success: true,
      message: 'Item pricing deleted successfully',
      data: config.shiftingMoversConfig.itemPricing
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting item pricing',
      error: error.message
    });
  }
};

// Get all item pricing for shifting/movers
const getItemPricing = async (req, res) => {
  try {
    const config = await PricingConfig.findOne({ serviceType: 'shifting_movers' });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Shifting/Movers pricing configuration not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: config.shiftingMoversConfig.itemPricing
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching item pricing',
      error: error.message
    });
  }
};

// Deactivate pricing configuration
const deactivatePricingConfig = async (req, res) => {
  try {
    const { serviceType } = req.params;
    
    const config = await PricingConfig.findOneAndUpdate(
      { serviceType },
      { isActive: false, lastUpdatedBy: req.user._id },
      { new: true }
    );
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Pricing configuration not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Pricing configuration deactivated successfully',
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deactivating pricing configuration',
      error: error.message
    });
  }
};

export {
  getAllPricingConfigs,
  getPricingByServiceType,
  updateShiftingMoversPricing,
  updateCarRecoveryPricing,
  updateAppointmentServicePricing,
  addItemPricing,
  updateItemPricing,
  deleteItemPricing,
  getItemPricing,
  deactivatePricingConfig
};