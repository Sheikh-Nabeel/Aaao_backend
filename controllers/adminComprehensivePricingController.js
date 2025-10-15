import ComprehensivePricing from "../models/comprehensivePricingModel.js";

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
    throw new Error(
      `${fieldName} must be an integer between ${min} and ${max || "infinity"}`
    );
  }
  return num;
};

const validateBoolean = (value, fieldName) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean value`);
  }
  return value;
};

// Get comprehensive pricing configuration
const getComprehensivePricing = async (req, res) => {
  try {
    const config = await ComprehensivePricing.findOne({
      isActive: true,
    }).populate("lastUpdatedBy", "name email");

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Comprehensive pricing configuration not found",
      });
    }

    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching comprehensive pricing configuration",
      error: error.message,
    });
  }
};

// Update base fare configuration
const updateBaseFare = async (req, res) => {
  try {
    const { amount, coverageKm } = req.body;
    const adminId = req.user.id;

    // Validate input
    const validatedAmount = validatePositiveNumber(amount, "Base fare amount");
    const validatedCoverageKm = validatePositiveNumber(
      coverageKm,
      "Coverage distance"
    );

    if (validatedAmount === null && validatedCoverageKm === null) {
      return res.status(400).json({
        success: false,
        message: "At least one field (amount or coverageKm) must be provided",
      });
    }

    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Comprehensive pricing configuration not found",
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
      message: "Base fare updated successfully",
      data: config.baseFare,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Error updating base fare",
      error: error.message,
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
        message: "Comprehensive pricing configuration not found",
      });
    }

    if (afterBaseCoverage !== undefined) {
      config.perKmRate.afterBaseCoverage = afterBaseCoverage;
    }

    if (cityWiseAdjustment) {
      if (cityWiseAdjustment.enabled !== undefined) {
        config.perKmRate.cityWiseAdjustment.enabled =
          cityWiseAdjustment.enabled;
      }
      if (cityWiseAdjustment.aboveKm !== undefined) {
        config.perKmRate.cityWiseAdjustment.aboveKm =
          cityWiseAdjustment.aboveKm;
      }
      if (cityWiseAdjustment.adjustedRate !== undefined) {
        config.perKmRate.cityWiseAdjustment.adjustedRate =
          cityWiseAdjustment.adjustedRate;
      }
    }

    config.lastUpdatedBy = adminId;
    await config.save();

    res.status(200).json({
      success: true,
      message: "Per KM rates updated successfully",
      data: config.perKmRate,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating per KM rates",
      error: error.message,
    });
  }
};

// Update platform fees
const updatePlatformFees = async (req, res) => {
  try {
    const { percentage, driverShare, customerShare } = req.body;
    const adminId = req.user.id;

    // Validate input
    const validatedPercentage = validatePercentage(
      percentage,
      "Platform fee percentage"
    );
    const validatedDriverShare = validatePercentage(
      driverShare,
      "Driver share percentage"
    );
    const validatedCustomerShare = validatePercentage(
      customerShare,
      "Customer share percentage"
    );

    if (
      validatedPercentage === null &&
      validatedDriverShare === null &&
      validatedCustomerShare === null
    ) {
      return res.status(400).json({
        success: false,
        message: "At least one field must be provided",
      });
    }

    // Validate that driver and customer shares don't exceed total percentage
    if (validatedDriverShare !== null && validatedCustomerShare !== null) {
      if (validatedDriverShare + validatedCustomerShare > 100) {
        return res.status(400).json({
          success: false,
          message:
            "Driver share and customer share combined cannot exceed 100%",
        });
      }
    }

    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Comprehensive pricing configuration not found",
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
      message: "Platform fees updated successfully",
      data: config.platformFee,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Error updating platform fees",
      error: error.message,
    });
  }
};

// Update cancellation charges
const updateCancellationCharges = async (req, res) => {
  try {
    const {
      beforeArrival,
      after25PercentDistance,
      after50PercentDistance,
      afterArrival,
    } = req.body;
    const adminId = req.user.id;

    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Comprehensive pricing configuration not found",
      });
    }

    if (beforeArrival !== undefined)
      config.cancellationCharges.beforeArrival = beforeArrival;
    if (after25PercentDistance !== undefined)
      config.cancellationCharges.after25PercentDistance =
        after25PercentDistance;
    if (after50PercentDistance !== undefined)
      config.cancellationCharges.after50PercentDistance =
        after50PercentDistance;
    if (afterArrival !== undefined)
      config.cancellationCharges.afterArrival = afterArrival;
    config.lastUpdatedBy = adminId;

    await config.save();

    res.status(200).json({
      success: true,
      message: "Cancellation charges updated successfully",
      data: config.cancellationCharges,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating cancellation charges",
      error: error.message,
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
        message: "Comprehensive pricing configuration not found",
      });
    }

    if (freeMinutes !== undefined)
      config.waitingCharges.freeMinutes = freeMinutes;
    if (perMinuteRate !== undefined)
      config.waitingCharges.perMinuteRate = perMinuteRate;
    if (maximumCharge !== undefined)
      config.waitingCharges.maximumCharge = maximumCharge;
    config.lastUpdatedBy = adminId;

    await config.save();

    res.status(200).json({
      success: true,
      message: "Waiting charges updated successfully",
      data: config.waitingCharges,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating waiting charges",
      error: error.message,
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
        message: "Comprehensive pricing configuration not found",
      });
    }

    if (enabled !== undefined) config.nightCharges.enabled = enabled;
    if (startHour !== undefined) config.nightCharges.startHour = startHour;
    if (endHour !== undefined) config.nightCharges.endHour = endHour;
    if (fixedAmount !== undefined)
      config.nightCharges.fixedAmount = fixedAmount;
    if (multiplier !== undefined) config.nightCharges.multiplier = multiplier;
    config.lastUpdatedBy = adminId;

    await config.save();

    res.status(200).json({
      success: true,
      message: "Night charges updated successfully",
      data: config.nightCharges,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating night charges",
      error: error.message,
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
        message: "Comprehensive pricing configuration not found",
      });
    }

    if (enabled !== undefined) config.surgePricing.enabled = enabled;
    if (adminControlled !== undefined)
      config.surgePricing.adminControlled = adminControlled;
    if (levels && Array.isArray(levels)) config.surgePricing.levels = levels;
    config.lastUpdatedBy = adminId;

    await config.save();

    res.status(200).json({
      success: true,
      message: "Surge pricing updated successfully",
      data: config.surgePricing,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating surge pricing",
      error: error.message,
    });
  }
};

// Update car recovery service rates (Towing, Flatbed, Wheel Lift, Jumpstart)
const updateCarRecoveryRates = async (req, res) => {
  try {
    // Backward-compatible fields
    const { enabled, flatbed, wheelLift, jumpstart } = req.body;
    // New-style: allow full carRecovery payload (direct or nested)
    const carRecoveryPayload =
      req.body?.serviceTypes?.carRecovery ?? req.body?.carRecovery ?? null;

    const adminId = req.user.id;

    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Comprehensive pricing configuration not found",
      });
    }

    // Local deep-merge helper (objects only; arrays replaced)
    function deepMergeReplaceArrays(target, source) {
      if (!source || typeof source !== "object" || Array.isArray(source))
        return target;
      Object.keys(source).forEach((key) => {
        const srcVal = source[key];
        if (srcVal && typeof srcVal === "object" && !Array.isArray(srcVal)) {
          if (
            !target[key] ||
            typeof target[key] !== "object" ||
            Array.isArray(target[key])
          ) {
            target[key] = {};
          }
          deepMergeReplaceArrays(target[key], srcVal);
        } else {
          target[key] = srcVal;
        }
      });
      return target;
    }

    // Ensure base branch exists
    config.serviceTypes = config.serviceTypes || {};
    config.serviceTypes.carRecovery = config.serviceTypes.carRecovery || {};

    // If we received a new-style carRecovery payload, init subtrees and merge
    if (carRecoveryPayload && typeof carRecoveryPayload === "object") {
      const cr = config.serviceTypes.carRecovery;

      // Initialize nested serviceTypes as needed
      if (
        carRecoveryPayload.serviceTypes &&
        typeof carRecoveryPayload.serviceTypes === "object"
      ) {
        cr.serviceTypes = cr.serviceTypes || {};

        // winching
        if (carRecoveryPayload.serviceTypes.winching) {
          cr.serviceTypes.winching = cr.serviceTypes.winching || {};
          cr.serviceTypes.winching.subCategories =
            cr.serviceTypes.winching.subCategories || {};
          const wSubs =
            carRecoveryPayload.serviceTypes.winching.subCategories || {};
          Object.keys(wSubs).forEach((name) => {
            cr.serviceTypes.winching.subCategories[name] =
              cr.serviceTypes.winching.subCategories[name] || {};
          });
        }

        // roadsideAssistance
        if (carRecoveryPayload.serviceTypes.roadsideAssistance) {
          cr.serviceTypes.roadsideAssistance =
            cr.serviceTypes.roadsideAssistance || {};
          cr.serviceTypes.roadsideAssistance.subCategories =
            cr.serviceTypes.roadsideAssistance.subCategories || {};
          const rSubs =
            carRecoveryPayload.serviceTypes.roadsideAssistance.subCategories ||
            {};
          Object.keys(rSubs).forEach((name) => {
            cr.serviceTypes.roadsideAssistance.subCategories[name] =
              cr.serviceTypes.roadsideAssistance.subCategories[name] || {};
          });
        }

        // keyUnlockerServices (category-level)
        if (carRecoveryPayload.serviceTypes.keyUnlockerServices) {
          cr.serviceTypes.keyUnlockerServices =
            cr.serviceTypes.keyUnlockerServices || {};
        }
      }

      // Deep-merge payload into carRecovery (arrays replaced)
      deepMergeReplaceArrays(
        config.serviceTypes.carRecovery,
        carRecoveryPayload
      );
    }

    // Backward compatibility: legacy fields (flatbed/wheelLift/jumpstart)
    config.serviceTypes.carRecovery.flatbed =
      config.serviceTypes.carRecovery.flatbed || {};
    config.serviceTypes.carRecovery.wheelLift =
      config.serviceTypes.carRecovery.wheelLift || {};
    config.serviceTypes.carRecovery.jumpstart =
      config.serviceTypes.carRecovery.jumpstart || {};

    if (enabled !== undefined) {
      config.serviceTypes.carRecovery.enabled = !!enabled;
    }

    if (flatbed && flatbed.perKmRate !== undefined) {
      config.serviceTypes.carRecovery.flatbed.perKmRate = Number(
        flatbed.perKmRate
      );
    }

    if (wheelLift && wheelLift.perKmRate !== undefined) {
      config.serviceTypes.carRecovery.wheelLift.perKmRate = Number(
        wheelLift.perKmRate
      );
    }

    if (jumpstart) {
      if (jumpstart.fixedRate !== undefined) {
        config.serviceTypes.carRecovery.jumpstart.fixedRate = Number(
          jumpstart.fixedRate
        );
      }
      if (jumpstart.minAmount !== undefined) {
        config.serviceTypes.carRecovery.jumpstart.minAmount = Number(
          jumpstart.minAmount
        );
      }
      if (jumpstart.maxAmount !== undefined) {
        config.serviceTypes.carRecovery.jumpstart.maxAmount = Number(
          jumpstart.maxAmount
        );
      }
    }

    config.lastUpdatedBy = adminId;
    await config.save();

    res.status(200).json({
      success: true,
      message: "Car recovery rates updated successfully",
      data: config.serviceTypes.carRecovery,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating car recovery rates",
      error: error.message,
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
        message: "Comprehensive pricing configuration not found",
      });
    }

    if (enabled !== undefined) config.serviceTypes.carCab.enabled = enabled;

    if (vehicleTypes) {
      const validVehicleTypes = [
        "economy",
        "premium",
        "luxury",
        "xl",
        "family",
      ];

      validVehicleTypes.forEach((vehicleType) => {
        if (vehicleTypes[vehicleType]) {
          if (vehicleTypes[vehicleType].baseFare !== undefined) {
            config.serviceTypes.carCab.vehicleTypes[vehicleType].baseFare =
              vehicleTypes[vehicleType].baseFare;
          }
          if (vehicleTypes[vehicleType].perKmRate !== undefined) {
            config.serviceTypes.carCab.vehicleTypes[vehicleType].perKmRate =
              vehicleTypes[vehicleType].perKmRate;
          }
        }
      });
    }

    config.lastUpdatedBy = adminId;
    await config.save();

    res.status(200).json({
      success: true,
      message: "Car cab rates updated successfully",
      data: config.serviceTypes.carCab,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating car cab rates",
      error: error.message,
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
        message: "Comprehensive pricing configuration not found",
      });
    }

    if (enabled !== undefined) config.serviceTypes.bike.enabled = enabled;
    if (baseFare !== undefined) config.serviceTypes.bike.baseFare = baseFare;
    if (perKmRate !== undefined) config.serviceTypes.bike.perKmRate = perKmRate;
    config.lastUpdatedBy = adminId;

    await config.save();

    res.status(200).json({
      success: true,
      message: "Bike rates updated successfully",
      data: config.serviceTypes.bike,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating bike rates",
      error: error.message,
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
        message: "Comprehensive pricing configuration not found",
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
        config.roundTrip.freeStayMinutes.maximumMinutes =
          freeStayMinutes.maximumMinutes;
      }
    }

    if (refreshmentAlert) {
      if (refreshmentAlert.enabled !== undefined) {
        config.roundTrip.refreshmentAlert.enabled = refreshmentAlert.enabled;
      }
      if (refreshmentAlert.minimumDistance !== undefined) {
        config.roundTrip.refreshmentAlert.minimumDistance =
          refreshmentAlert.minimumDistance;
      }
      if (refreshmentAlert.minimumDuration !== undefined) {
        config.roundTrip.refreshmentAlert.minimumDuration =
          refreshmentAlert.minimumDuration;
      }
    }

    config.lastUpdatedBy = adminId;
    await config.save();

    res.status(200).json({
      success: true,
      message: "Round trip features updated successfully",
      data: config.roundTrip,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating round trip features",
      error: error.message,
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
        message: "Comprehensive pricing configuration not found",
      });
    }

    if (enabled !== undefined) config.vat.enabled = enabled;
    if (percentage !== undefined) config.vat.percentage = percentage;
    config.lastUpdatedBy = adminId;

    await config.save();

    res.status(200).json({
      success: true,
      message: "VAT configuration updated successfully",
      data: config.vat,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating VAT configuration",
      error: error.message,
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
        message: "Comprehensive pricing configuration not found",
      });
    }

    if (minimumFare !== undefined) config.minimumFare = minimumFare;
    config.lastUpdatedBy = adminId;

    await config.save();

    res.status(200).json({
      success: true,
      message: "Minimum fare updated successfully",
      data: { minimumFare: config.minimumFare },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating minimum fare",
      error: error.message,
    });
  }
};

// Deep merge helper (objects only; arrays are replaced for predictability)
function deepMergeReplaceArrays(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source))
    return target;
  Object.keys(source).forEach((key) => {
    const srcVal = source[key];
    if (srcVal && typeof srcVal === "object" && !Array.isArray(srcVal)) {
      if (
        !target[key] ||
        typeof target[key] !== "object" ||
        Array.isArray(target[key])
      ) {
        target[key] = {};
      }
      deepMergeReplaceArrays(target[key], srcVal);
    } else {
      target[key] = srcVal;
    }
  });
  return target;
}

// Bulk update comprehensive pricing (flow-name strict + validation + deep-merge)
export const bulkUpdatePricing = async (req, res) => {
  try {
    const updates = req.body || {};
    const adminId = req.user?.id;

    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Comprehensive pricing configuration not found",
      });
    }

    // STRICT allowed flow keys (exact)
    const ALLOWED_FLOW = {
      services: ["car recovery", "shifting & movers", "car cab", "bike"],
      carRecoveryCategories: [
        "towing services",
        "winching services",
        "roadside assistance",
        "specialized/heavy recovery", // schema doesn't support; will be rejected if sent with data
      ],
      towingSub: ["flatbed towing", "wheel lift towing"], // maps to flatbed, wheelLift
      roadsideSub: ["battery jump start", "fuel delivery"], // maps to jumpstart, fuelDelivery
      // NOTE: If you need more, extend model and add them here.
    };

    // Map flow keys -> schema keys (only exact allowed above are accepted)
    const MAP = {
      serviceTypes: {
        "car recovery": "carRecovery",
        "shifting & movers": "shiftingMovers",
        "car cab": "carCab",
        bike: "bike",
      },
      carRecoveryCategories: {
        "towing services": "winching",
        "winching services": "winching", // treated same as winching
        "roadside assistance": "roadsideAssistance",
        // "specialized/heavy recovery": no schema; reject if data provided
      },
      towingSub: {
        "flatbed towing": "flatbed",
        "wheel lift towing": "wheelLift",
      },
      roadsideSub: {
        "battery jump start": "jumpstart",
        "fuel delivery": "fuelDelivery",
      },
    };

    // Transform flow-style payload to schema-style (strict). Throws 400 for unknown/unsupported names.
    function transformFlowToSchema(flowPayload) {
      const out = {};
      if (
        !flowPayload?.serviceTypes ||
        typeof flowPayload.serviceTypes !== "object"
      ) {
        return out;
      }

      out.serviceTypes = {};
      for (const svcName of Object.keys(flowPayload.serviceTypes)) {
        if (!ALLOWED_FLOW.services.includes(svcName)) {
          throw new Error(
            `Unknown service '${svcName}'. Allowed: ${ALLOWED_FLOW.services.join(
              ", "
            )}`
          );
        }
        const svcKey = MAP.serviceTypes[svcName];
        const svcBlock = flowPayload.serviceTypes[svcName] || {};
        out.serviceTypes[svcKey] = out.serviceTypes[svcKey] || {};

        // Car Recovery special-handling for nested categories
        if (svcName === "car recovery") {
          const srcCR = svcBlock;
          const dstCR = out.serviceTypes[svcKey];

          // Pass-through known top-level carRecovery blocks if present
          [
            "baseFare",
            "perKmRate",
            "minimumFare",
            "platformFee",
            "cancellationCharges",
            "waitingCharges",
            "nightCharges",
            "surgePricing",
            "refreshmentAlert",
            "freeStayMinutes",
            "vat",
          ].forEach((k) => {
            if (srcCR[k] !== undefined) dstCR[k] = srcCR[k];
          });

          if (srcCR.serviceTypes && typeof srcCR.serviceTypes === "object") {
            dstCR.serviceTypes = dstCR.serviceTypes || {};
            for (const catName of Object.keys(srcCR.serviceTypes)) {
              if (!ALLOWED_FLOW.carRecoveryCategories.includes(catName)) {
                throw new Error(
                  `Unknown car recovery category '${catName}'. Allowed: ${ALLOWED_FLOW.carRecoveryCategories.join(
                    ", "
                  )}`
                );
              }
              // Not supported in schema
              if (catName === "specialized/heavy recovery") {
                throw new Error(
                  "'specialized/heavy recovery' is not supported by the current schema"
                );
              }

              const catKey = MAP.carRecoveryCategories[catName];
              const srcCat = srcCR.serviceTypes[catName] || {};
              const dstCat = (dstCR.serviceTypes[catKey] =
                dstCR.serviceTypes[catKey] || {});

              // Towing/Winching subcategories
              if (
                catName === "towing services" ||
                catName === "winching services"
              ) {
                if (
                  srcCat.subCategories &&
                  typeof srcCat.subCategories === "object"
                ) {
                  dstCat.subCategories = dstCat.subCategories || {};
                  for (const subName of Object.keys(srcCat.subCategories)) {
                    if (!ALLOWED_FLOW.towingSub.includes(subName)) {
                      throw new Error(
                        `Unknown towing sub-service '${subName}'. Allowed: ${ALLOWED_FLOW.towingSub.join(
                          ", "
                        )}`
                      );
                    }
                    const subKey = MAP.towingSub[subName];
                    dstCat.subCategories[subKey] =
                      srcCat.subCategories[subName];
                  }
                }
              }

              // Roadside Assistance subcategories
              if (catName === "roadside assistance") {
                if (
                  srcCat.subCategories &&
                  typeof srcCat.subCategories === "object"
                ) {
                  dstCat.subCategories = dstCat.subCategories || {};
                  for (const subName of Object.keys(srcCat.subCategories)) {
                    if (!ALLOWED_FLOW.roadsideSub.includes(subName)) {
                      throw new Error(
                        `Unknown roadside sub-service '${subName}'. Allowed: ${ALLOWED_FLOW.roadsideSub.join(
                          ", "
                        )}`
                      );
                    }
                    const subKey = MAP.roadsideSub[subName];
                    dstCat.subCategories[subKey] =
                      srcCat.subCategories[subName];
                  }
                }
              }
            }
          }
        } else {
          // Other services: pass-through as-is (schema validation will apply)
          Object.assign(out.serviceTypes[svcKey], svcBlock);
        }
      }
      return out;
    }

    // Determine if incoming is flow-style (strict flow keys) or schema-style
    let normalized = updates;
    const isFlowStyle =
      !!updates?.serviceTypes &&
      Object.keys(updates.serviceTypes).some((k) =>
        ALLOWED_FLOW.services.includes(k)
      );

    if (isFlowStyle) {
      try {
        normalized = transformFlowToSchema(updates);
      } catch (e) {
        return res.status(400).json({ success: false, message: e.message });
      }
    }

    // 1) Light validations (top-level numeric blocks) — keep your existing validators
    if (normalized.baseFare) {
      if (normalized.baseFare.amount !== undefined) {
        normalized.baseFare.amount = validatePositiveNumber(
          normalized.baseFare.amount,
          "Base fare amount"
        );
      }
      if (normalized.baseFare.coverageKm !== undefined) {
        normalized.baseFare.coverageKm = validatePositiveNumber(
          normalized.baseFare.coverageKm,
          "Coverage distance"
        );
      }
    }

    if (normalized.platformFee) {
      const { percentage, driverShare, customerShare } = normalized.platformFee;
      if (percentage !== undefined)
        normalized.platformFee.percentage = validatePercentage(
          percentage,
          "Platform fee percentage"
        );
      if (driverShare !== undefined)
        normalized.platformFee.driverShare = validatePercentage(
          driverShare,
          "Driver share percentage"
        );
      if (customerShare !== undefined)
        normalized.platformFee.customerShare = validatePercentage(
          customerShare,
          "Customer share percentage"
        );
      if (
        normalized.platformFee.driverShare != null &&
        normalized.platformFee.customerShare != null &&
        normalized.platformFee.driverShare +
          normalized.platformFee.customerShare >
          100
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Driver share and customer share combined cannot exceed 100%",
        });
      }
    }

    if (normalized.waitingCharges) {
      const { freeMinutes, perMinuteRate, maximumCharge } =
        normalized.waitingCharges;
      if (freeMinutes !== undefined)
        normalized.waitingCharges.freeMinutes = validateInteger(
          freeMinutes,
          "Free minutes",
          0
        );
      if (perMinuteRate !== undefined)
        normalized.waitingCharges.perMinuteRate = validatePositiveNumber(
          perMinuteRate,
          "Per-minute rate"
        );
      if (maximumCharge !== undefined)
        normalized.waitingCharges.maximumCharge = validatePositiveNumber(
          maximumCharge,
          "Maximum waiting charge"
        );
    }

    if (normalized.nightCharges) {
      const { enabled, startHour, endHour, fixedAmount, multiplier } =
        normalized.nightCharges;
      if (enabled !== undefined && typeof enabled !== "boolean")
        return res.status(400).json({
          success: false,
          message: "nightCharges.enabled must be boolean",
        });
      if (startHour !== undefined)
        normalized.nightCharges.startHour = validateInteger(
          startHour,
          "Night startHour",
          0,
          23
        );
      if (endHour !== undefined)
        normalized.nightCharges.endHour = validateInteger(
          endHour,
          "Night endHour",
          0,
          23
        );
      if (fixedAmount !== undefined)
        normalized.nightCharges.fixedAmount = validatePositiveNumber(
          fixedAmount,
          "Night fixedAmount"
        );
      if (multiplier !== undefined)
        normalized.nightCharges.multiplier = validatePositiveNumber(
          multiplier,
          "Night multiplier"
        );
    }

    if (normalized.vat) {
      const { enabled, percentage } = normalized.vat;
      if (enabled !== undefined && typeof enabled !== "boolean")
        return res
          .status(400)
          .json({ success: false, message: "vat.enabled must be boolean" });
      if (percentage !== undefined)
        normalized.vat.percentage = validatePercentage(
          percentage,
          "VAT percentage"
        );
    }

    if (normalized.minimumFare !== undefined) {
      normalized.minimumFare = validatePositiveNumber(
        normalized.minimumFare,
        "Minimum fare"
      );
    }

    // 2) Initializers for branches we may merge into
    if (
      normalized?.serviceTypes &&
      typeof normalized.serviceTypes === "object"
    ) {
      config.serviceTypes = config.serviceTypes || {};

      // carRecovery nested
      if (normalized.serviceTypes.carRecovery) {
        config.serviceTypes.carRecovery = config.serviceTypes.carRecovery || {};
        const cr = normalized.serviceTypes.carRecovery;
        if (cr.serviceTypes && typeof cr.serviceTypes === "object") {
          const cfgCR = config.serviceTypes.carRecovery;
          cfgCR.serviceTypes = cfgCR.serviceTypes || {};
          if (cr.serviceTypes.winching) {
            const cfgW = (cfgCR.serviceTypes.winching =
              cfgCR.serviceTypes.winching || {});
            cfgW.subCategories = cfgW.subCategories || {};
            if (cr.serviceTypes.winching.subCategories) {
              Object.keys(cr.serviceTypes.winching.subCategories).forEach(
                (name) => {
                  cfgW.subCategories[name] = cfgW.subCategories[name] || {};
                }
              );
            }
          }
          if (cr.serviceTypes.roadsideAssistance) {
            const cfgR = (cfgCR.serviceTypes.roadsideAssistance =
              cfgCR.serviceTypes.roadsideAssistance || {});
            cfgR.subCategories = cfgR.subCategories || {};
            if (cr.serviceTypes.roadsideAssistance.subCategories) {
              Object.keys(
                cr.serviceTypes.roadsideAssistance.subCategories
              ).forEach((name) => {
                cfgR.subCategories[name] = cfgR.subCategories[name] || {};
              });
            }
          }
          if (cr.serviceTypes.keyUnlockerServices) {
            cfgCR.serviceTypes.keyUnlockerServices =
              cfgCR.serviceTypes.keyUnlockerServices || {};
          }
        }
      }

      // carCab/bike initializers
      if (normalized.serviceTypes.carCab) {
        config.serviceTypes.carCab = config.serviceTypes.carCab || {};
        config.serviceTypes.carCab.vehicleTypes =
          config.serviceTypes.carCab.vehicleTypes || {};
      }
      if (normalized.serviceTypes.bike) {
        config.serviceTypes.bike = config.serviceTypes.bike || {};
        config.serviceTypes.bike.vehicleTypes =
          config.serviceTypes.bike.vehicleTypes || {};
      }
    }

    // 3) APPLY MERGE (objects deep-merged; arrays replaced)
    Object.keys(normalized).forEach((key) => {
      const src = normalized[key];
      if (src && typeof src === "object" && !Array.isArray(src)) {
        if (
          !config[key] ||
          typeof config[key] !== "object" ||
          Array.isArray(config[key])
        ) {
          config[key] = {};
        }
        deepMergeReplaceArrays(config[key], src);
      } else {
        // primitives and arrays replace
        config[key] = src;
      }
    });

    config.lastUpdatedBy = adminId || config.lastUpdatedBy || null;
    await config.save();

    res.status(200).json({
      success: true,
      message: "Comprehensive pricing updated successfully",
      data: config,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating comprehensive pricing",
      error: error.message,
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
        message: "Active pricing configuration not found",
      });
    }

    res.status(200).json({
      success: true,
      data: config.serviceSpecificRates?.shiftingMovers?.itemPricing || [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching item pricing",
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
    const adminId = req.user.id;

    // Validate input
    if (!itemName || typeof itemName !== "string" || itemName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Valid item name is required",
      });
    }

    const validatedStairsFare = validatePositiveNumber(
      stairsFarePerFloor,
      "Stairs fare per floor"
    );
    const validatedLiftFare = validatePositiveNumber(
      liftFarePerItem,
      "Lift fare per item"
    );
    const validatedPackingFare = validatePositiveNumber(
      packingFare,
      "Packing fare"
    );
    const validatedFixingFare = validatePositiveNumber(
      fixingFare,
      "Fixing fare"
    );
    const validatedLoadingFare = validatePositiveNumber(
      loadingUnloadingFare,
      "Loading/unloading fare"
    );

    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Active pricing configuration not found",
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
    const existingItem =
      config.serviceSpecificRates.shiftingMovers.itemPricing.find(
        (item) => item.itemName.toLowerCase() === itemName.toLowerCase()
      );

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: "Item pricing already exists. Use update endpoint instead.",
      });
    }

    const itemPricingData = {
      itemName: itemName.trim(),
      stairsFarePerFloor: validatedStairsFare || 0,
      liftFarePerItem: validatedLiftFare || 0,
      packingFare: validatedPackingFare || 0,
      fixingFare: validatedFixingFare || 0,
      loadingUnloadingFare: validatedLoadingFare || 0,
    };

    config.serviceSpecificRates.shiftingMovers.itemPricing.push(
      itemPricingData
    );
    config.lastUpdatedBy = adminId;
    await config.save();

    res.status(201).json({
      success: true,
      message: "Item pricing added successfully",
      data: itemPricingData,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Error adding item pricing",
      error: error.message,
    });
  }
};

// Update existing item pricing for shifting/movers
const updateItemPricing = async (req, res) => {
  try {
    const { itemName } = req.params;
    const {
      stairsFarePerFloor,
      liftFarePerItem,
      packingFare,
      fixingFare,
      loadingUnloadingFare,
    } = req.body;
    const adminId = req.user.id;

    // Validate input
    const validatedStairsFare = validatePositiveNumber(
      stairsFarePerFloor,
      "Stairs fare per floor"
    );
    const validatedLiftFare = validatePositiveNumber(
      liftFarePerItem,
      "Lift fare per item"
    );
    const validatedPackingFare = validatePositiveNumber(
      packingFare,
      "Packing fare"
    );
    const validatedFixingFare = validatePositiveNumber(
      fixingFare,
      "Fixing fare"
    );
    const validatedLoadingFare = validatePositiveNumber(
      loadingUnloadingFare,
      "Loading/unloading fare"
    );

    if (
      validatedStairsFare === null &&
      validatedLiftFare === null &&
      validatedPackingFare === null &&
      validatedFixingFare === null &&
      validatedLoadingFare === null
    ) {
      return res.status(400).json({
        success: false,
        message: "At least one pricing field must be provided",
      });
    }

    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Active pricing configuration not found",
      });
    }

    // Initialize if not exists
    if (!config.serviceSpecificRates?.shiftingMovers?.itemPricing) {
      return res.status(404).json({
        success: false,
        message: "Item pricing configuration not found",
      });
    }

    // Find existing item
    const existingItemIndex =
      config.serviceSpecificRates.shiftingMovers.itemPricing.findIndex(
        (item) => item.itemName.toLowerCase() === itemName.toLowerCase()
      );

    if (existingItemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found. Use add endpoint to create new item.",
      });
    }

    // Update only provided fields
    const existingItem =
      config.serviceSpecificRates.shiftingMovers.itemPricing[existingItemIndex];
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
      message: "Item pricing updated successfully",
      data: existingItem,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Error updating item pricing",
      error: error.message,
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
        message: "Active pricing configuration not found",
      });
    }

    if (!config.serviceSpecificRates?.shiftingMovers?.itemPricing) {
      return res.status(404).json({
        success: false,
        message: "Item pricing configuration not found",
      });
    }

    const initialLength =
      config.serviceSpecificRates.shiftingMovers.itemPricing.length;
    config.serviceSpecificRates.shiftingMovers.itemPricing =
      config.serviceSpecificRates.shiftingMovers.itemPricing.filter(
        (item) => item.itemName.toLowerCase() !== itemName.toLowerCase()
      );

    if (
      config.serviceSpecificRates.shiftingMovers.itemPricing.length ===
      initialLength
    ) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    config.lastUpdatedBy = adminId;
    await config.save();

    res.status(200).json({
      success: true,
      message: "Item pricing deleted successfully",
      data: config.serviceSpecificRates.shiftingMovers.itemPricing,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting item pricing",
      error: error.message,
    });
  }
};

// Update currency (global)
const updateCurrency = async (req, res) => {
  try {
    const { currency } = req.body;
    if (!currency || typeof currency !== "string")
      return res
        .status(400)
        .json({ success: false, message: "currency is required" });

    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config)
      return res
        .status(404)
        .json({ success: false, message: "Config not found" });

    config.currency = currency.trim();
    config.lastUpdatedBy = req.user.id;
    await config.save();
    res.status(200).json({
      success: true,
      message: "Currency updated",
      data: { currency: config.currency },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error updating currency",
      error: err.message,
    });
  }
};

// Update car recovery core base/per-km (+ city-wise adjustment)
const updateRecoveryCoreRates = async (req, res) => {
  try {
    const { baseFare, perKmRate } = req.body; // baseFare: { amount, coverageKm }, perKmRate: { afterBaseCoverage, cityWiseAdjustment{enabled,aboveKm,adjustedRate} }
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config)
      return res
        .status(404)
        .json({ success: false, message: "Config not found" });

    if (baseFare) {
      if (baseFare.amount !== undefined)
        config.serviceTypes.carRecovery.baseFare.amount = Number(
          baseFare.amount
        );
      if (baseFare.coverageKm !== undefined)
        config.serviceTypes.carRecovery.baseFare.coverageKm = Number(
          baseFare.coverageKm
        );
    }
    if (perKmRate) {
      if (perKmRate.afterBaseCoverage !== undefined)
        config.serviceTypes.carRecovery.perKmRate.afterBaseCoverage = Number(
          perKmRate.afterBaseCoverage
        );
      if (perKmRate.cityWiseAdjustment) {
        const c = perKmRate.cityWiseAdjustment;
        if (c.enabled !== undefined)
          config.serviceTypes.carRecovery.perKmRate.cityWiseAdjustment.enabled =
            !!c.enabled;
        if (c.aboveKm !== undefined)
          config.serviceTypes.carRecovery.perKmRate.cityWiseAdjustment.aboveKm =
            Number(c.aboveKm);
        if (c.adjustedRate !== undefined)
          config.serviceTypes.carRecovery.perKmRate.cityWiseAdjustment.adjustedRate =
            Number(c.adjustedRate);
      }
    }
    config.lastUpdatedBy = req.user.id;
    await config.save();
    res.status(200).json({
      success: true,
      message: "Recovery core rates updated",
      data: config.serviceTypes.carRecovery,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error updating recovery core rates",
      error: err.message,
    });
  }
};

// Update car recovery waiting charges (service-specific)
const updateRecoveryWaitingCharges = async (req, res) => {
  try {
    const { freeMinutes, perMinuteRate, maximumCharge } = req.body;
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config)
      return res
        .status(404)
        .json({ success: false, message: "Config not found" });

    if (freeMinutes !== undefined)
      config.serviceTypes.carRecovery.waitingCharges.freeMinutes =
        Number(freeMinutes);
    if (perMinuteRate !== undefined)
      config.serviceTypes.carRecovery.waitingCharges.perMinuteRate =
        Number(perMinuteRate);
    if (maximumCharge !== undefined)
      config.serviceTypes.carRecovery.waitingCharges.maximumCharge =
        Number(maximumCharge);
    config.lastUpdatedBy = req.user.id;
    await config.save();
    res.status(200).json({
      success: true,
      message: "Recovery waiting charges updated",
      data: config.serviceTypes.carRecovery.waitingCharges,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error updating recovery waiting",
      error: err.message,
    });
  }
};

// Update car recovery cancellation charges (service-specific)
const updateRecoveryCancellationCharges = async (req, res) => {
  try {
    const { beforeArrival, after25Percent, after50Percent, afterArrival } =
      req.body;
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config)
      return res
        .status(404)
        .json({ success: false, message: "Config not found" });

    const cc = config.serviceTypes.carRecovery.cancellationCharges;
    if (beforeArrival !== undefined) cc.beforeArrival = Number(beforeArrival);
    if (after25Percent !== undefined)
      cc.after25Percent = Number(after25Percent);
    if (after50Percent !== undefined)
      cc.after50Percent = Number(after50Percent);
    if (afterArrival !== undefined) cc.afterArrival = Number(afterArrival);
    config.lastUpdatedBy = req.user.id;
    await config.save();
    res.status(200).json({
      success: true,
      message: "Recovery cancellation charges updated",
      data: cc,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error updating recovery cancellation",
      error: err.message,
    });
  }
};

// Update car recovery night charges (service-specific)
const updateRecoveryNightCharges = async (req, res) => {
  try {
    const { enabled, startHour, endHour, fixedAmount, multiplier } = req.body;
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config)
      return res
        .status(404)
        .json({ success: false, message: "Config not found" });

    const nc = config.serviceTypes.carRecovery.nightCharges;
    if (enabled !== undefined) nc.enabled = !!enabled;
    if (startHour !== undefined) nc.startHour = Number(startHour);
    if (endHour !== undefined) nc.endHour = Number(endHour);
    if (fixedAmount !== undefined) nc.fixedAmount = Number(fixedAmount);
    if (multiplier !== undefined) nc.multiplier = Number(multiplier);
    config.lastUpdatedBy = req.user.id;
    await config.save();
    res.status(200).json({
      success: true,
      message: "Recovery night charges updated",
      data: nc,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error updating recovery night",
      error: err.message,
    });
  }
};

// Update car recovery surge flags (service-specific quick toggles)
const updateRecoverySurgeFlags = async (req, res) => {
  try {
    const { enabled, adminControlled, noSurge, surge1_5x, surge2_0x, levels } =
      req.body;
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config)
      return res
        .status(404)
        .json({ success: false, message: "Config not found" });

    const sp = config.serviceTypes.carRecovery.surgePricing;
    if (enabled !== undefined) sp.enabled = !!enabled;
    if (adminControlled !== undefined) sp.adminControlled = !!adminControlled;
    if (noSurge !== undefined) sp.noSurge = !!noSurge;
    if (surge1_5x !== undefined) sp.surge1_5x = !!surge1_5x;
    if (surge2_0x !== undefined) sp.surge2_0x = !!surge2_0x;
    if (levels && Array.isArray(levels)) sp.levels = levels;
    config.lastUpdatedBy = req.user.id;
    await config.save();
    res.status(200).json({
      success: true,
      message: "Recovery surge flags updated",
      data: sp,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error updating recovery surge flags",
      error: err.message,
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
  // bulkUpdatePricing,
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
};
