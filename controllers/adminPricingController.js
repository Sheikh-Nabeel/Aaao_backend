import PricingConfig from "../models/pricingModel.js";

// Helpers
const toKebab = (v) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
const normalizeServiceTypeParam = (serviceTypeParam) => {
  const k = toKebab(serviceTypeParam);
  if (k === "shifting-movers" || k === "shifting_movers")
    return "shiftingMovers";
  if (k === "car-recovery" || k === "car_recovery") return "carRecovery";
  if (k === "appointment-service" || k === "appointment_based")
    return "appointmentService";
  // already camelCase or something custom
  if (serviceTypeParam === "shiftingMovers") return "shiftingMovers";
  if (serviceTypeParam === "carRecovery") return "carRecovery";
  if (serviceTypeParam === "appointmentService") return "appointmentService";
  return serviceTypeParam;
};

const LEGACY_ALT = {
  shiftingMovers: ["shiftingMovers", "shifting_movers"],
  carRecovery: ["carRecovery", "car_recovery"],
  appointmentService: ["appointmentService", "appointment_based"],
};

const userIdOf = (req) => req?.user?.id || req?.user?._id || null;

// Get all pricing configurations
const getAllPricingConfigs = async (req, res) => {
  try {
    const configs = await PricingConfig.find({ isActive: true })
      .populate("lastUpdatedBy", "name email")
      .sort({ serviceType: 1 });

    res.status(200).json({
      success: true,
      data: configs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching pricing configurations",
      error: error.message,
    });
  }
};

// Get pricing config by service type
const getPricingByServiceType = async (req, res) => {
  try {
    const normalized = normalizeServiceTypeParam(req.params.serviceType);
    const candidates = LEGACY_ALT[normalized] || [normalized];

    const config = await PricingConfig.findOne({
      serviceType: { $in: candidates },
      isActive: true,
    }).populate("lastUpdatedBy", "name email");

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Pricing configuration not found for this service type",
      });
    }

    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching pricing configuration",
      error: error.message,
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
      pickupDropoffPolicy,
    } = req.body;

    // Validate required fields
    if (!vehicleType || vehicleStartFare == null || perKmFare == null) {
      return res.status(400).json({
        success: false,
        message: "Vehicle type, start fare, and per km fare are required",
      });
    }

    const shiftingMoversConfig = {
      vehicleType,
      vehicleStartFare: Number(vehicleStartFare),
      perKmFare: Number(perKmFare),
      basicServices: basicServices || {
        loadingUnloadingHelper: {
          fare: 20,
          includeInBasicFare: false,
          baseLimit: 3,
        },
        packers: { fare: 20, includeInBasicFare: false, baseLimit: 3 },
        fixers: { fare: 20, includeInBasicFare: false, baseLimit: 3 },
      },
      itemPricing: Array.isArray(itemPricing) ? itemPricing : [],
      pickupDropoffPolicy: pickupDropoffPolicy || {
        groundFloorIncluded: true,
        baseCoverageFloors: 1,
        liftMinorCharge: true,
      },
    };

    const config = await PricingConfig.findOneAndUpdate(
      { serviceType: { $in: LEGACY_ALT.shiftingMovers } },
      {
        serviceType: "shiftingMovers",
        shiftingMoversConfig,
        lastUpdatedBy: userIdOf(req),
        isActive: true,
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Shifting/Movers pricing updated successfully",
      data: config,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating shifting/movers pricing",
      error: error.message,
    });
  }
};

// Create or update car recovery pricing
const updateCarRecoveryPricing = async (req, res) => {
  try {
    const {
      serviceType: recoveryServiceType,
      serviceCharges,
      platformCharges,
    } = req.body;

    if (!recoveryServiceType || !serviceCharges) {
      return res.status(400).json({
        success: false,
        message: "Recovery service type and service charges are required",
      });
    }

    const carRecoveryConfig = {
      serviceType: recoveryServiceType,
      serviceCharges,
      platformCharges: platformCharges || {
        percentage: 15,
        splitRatio: { customer: 50, serviceProvider: 50 },
      },
    };

    const config = await PricingConfig.findOneAndUpdate(
      { serviceType: { $in: LEGACY_ALT.carRecovery } },
      {
        serviceType: "carRecovery",
        carRecoveryConfig,
        lastUpdatedBy: userIdOf(req),
        isActive: true,
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Car recovery pricing updated successfully",
      data: config,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating car recovery pricing",
      error: error.message,
    });
  }
};

// Create or update appointment-based service pricing
const updateAppointmentServicePricing = async (req, res) => {
  try {
    const { serviceCategory, fixedAppointmentFee, confirmationSettings } =
      req.body;

    if (!serviceCategory) {
      return res.status(400).json({
        success: false,
        message: "Service category is required",
      });
    }

    const appointmentServiceConfig = {
      serviceCategory,
      fixedAppointmentFee: Number(fixedAppointmentFee ?? 5),
      confirmationSettings: confirmationSettings || {
        surveyTimeoutHours: 24,
        gpsCheckInRequired: true,
        autoDecisionEnabled: true,
      },
    };

    const config = await PricingConfig.findOneAndUpdate(
      { serviceType: { $in: LEGACY_ALT.appointmentService } },
      {
        serviceType: "appointmentService",
        appointmentServiceConfig,
        lastUpdatedBy: userIdOf(req),
        isActive: true,
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Appointment service pricing updated successfully",
      data: config,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating appointment service pricing",
      error: error.message,
    });
  }
};

// Add new item pricing for shifting/movers
const addItemPricing = async (req, res) => {
  try {
    const {
      itemName,
      stairsFarePerFloor,
      liftFarePerItem,
      packingFare,
      fixingFare,
      loadingUnloadingFare,
    } = req.body;

    if (!itemName) {
      return res.status(400).json({
        success: false,
        message: "Item name is required",
      });
    }

    const config = await PricingConfig.findOne({
      serviceType: { $in: LEGACY_ALT.shiftingMovers },
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Shifting/Movers pricing configuration not found",
      });
    }

    const existingItem = (config.shiftingMoversConfig?.itemPricing || []).find(
      (item) => item.itemName.toLowerCase() === String(itemName).toLowerCase()
    );

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: "Item pricing already exists. Use update endpoint instead.",
      });
    }

    const itemPricingData = {
      itemName: String(itemName).trim(),
      stairsFarePerFloor: Number(stairsFarePerFloor || 0),
      liftFarePerItem: Number(liftFarePerItem || 0),
      packingFare: Number(packingFare || 0),
      fixingFare: Number(fixingFare || 0),
      loadingUnloadingFare: Number(loadingUnloadingFare || 0),
    };

    config.shiftingMoversConfig = config.shiftingMoversConfig || {};
    config.shiftingMoversConfig.itemPricing =
      config.shiftingMoversConfig.itemPricing || [];
    config.shiftingMoversConfig.itemPricing.push(itemPricingData);
    config.lastUpdatedBy = userIdOf(req);
    await config.save();

    res.status(201).json({
      success: true,
      message: "Item pricing added successfully",
      data: itemPricingData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error adding item pricing",
      error: error.message,
    });
  }
};

// Update existing item pricing for shifting/movers
const updateItemPricing = async (req, res) => {
  try {
    const {
      itemName,
      stairsFarePerFloor,
      liftFarePerItem,
      packingFare,
      fixingFare,
      loadingUnloadingFare,
    } = req.body;

    if (!itemName) {
      return res.status(400).json({
        success: false,
        message: "Item name is required",
      });
    }

    const config = await PricingConfig.findOne({
      serviceType: { $in: LEGACY_ALT.shiftingMovers },
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Shifting/Movers pricing configuration not found",
      });
    }

    const list = config.shiftingMoversConfig?.itemPricing || [];
    const idx = list.findIndex(
      (item) => item.itemName.toLowerCase() === String(itemName).toLowerCase()
    );

    if (idx === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found. Use add endpoint to create new item.",
      });
    }

    const itemPricingData = {
      itemName: String(itemName).trim(),
      stairsFarePerFloor: Number(stairsFarePerFloor || 0),
      liftFarePerItem: Number(liftFarePerItem || 0),
      packingFare: Number(packingFare || 0),
      fixingFare: Number(fixingFare || 0),
      loadingUnloadingFare: Number(loadingUnloadingFare || 0),
    };

    config.shiftingMoversConfig.itemPricing[idx] = itemPricingData;
    config.lastUpdatedBy = userIdOf(req);
    await config.save();

    res.status(200).json({
      success: true,
      message: "Item pricing updated successfully",
      data: config.shiftingMoversConfig.itemPricing,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating item pricing",
      error: error.message,
    });
  }
};

// Delete item pricing
const deleteItemPricing = async (req, res) => {
  try {
    const { itemName } = req.params;

    const config = await PricingConfig.findOne({
      serviceType: { $in: LEGACY_ALT.shiftingMovers },
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Shifting/Movers pricing configuration not found",
      });
    }

    const before = (config.shiftingMoversConfig?.itemPricing || []).length;
    config.shiftingMoversConfig.itemPricing = (
      config.shiftingMoversConfig?.itemPricing || []
    ).filter(
      (item) => item.itemName.toLowerCase() !== String(itemName).toLowerCase()
    );

    if (config.shiftingMoversConfig.itemPricing.length === before) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    config.lastUpdatedBy = userIdOf(req);
    await config.save();

    res.status(200).json({
      success: true,
      message: "Item pricing deleted successfully",
      data: config.shiftingMoversConfig.itemPricing,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting item pricing",
      error: error.message,
    });
  }
};

// Get all item pricing for shifting/movers
const getItemPricing = async (req, res) => {
  try {
    const config = await PricingConfig.findOne({
      serviceType: { $in: LEGACY_ALT.shiftingMovers },
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Shifting/Movers pricing configuration not found",
      });
    }

    res.status(200).json({
      success: true,
      data: config.shiftingMoversConfig?.itemPricing || [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching item pricing",
      error: error.message,
    });
  }
};

// Deactivate pricing configuration
const deactivatePricingConfig = async (req, res) => {
  try {
    const normalized = normalizeServiceTypeParam(req.params.serviceType);
    const candidates = LEGACY_ALT[normalized] || [normalized];

    const config = await PricingConfig.findOneAndUpdate(
      { serviceType: { $in: candidates } },
      { isActive: false, lastUpdatedBy: userIdOf(req) },
      { new: true }
    );

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Pricing configuration not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Pricing configuration deactivated successfully",
      data: config,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deactivating pricing configuration",
      error: error.message,
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
  deactivatePricingConfig,
};
