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

// Allowed flow model
const FLOW = {
  services: ["car recovery", "shifting & movers", "car cab", "bike"],
  carRecoveryCategories: [
    "towing services",
    "winching services",
    "roadside assistance",
    "specialized/heavy recovery",
  ],
  towingSub: ["flatbed towing", "wheel lift towing"],
  winchingSub: ["on-road winching", "off-road winching"],
  roadsideSub: ["battery jump start", "fuel delivery"],
  specializedSub: [
    "luxury & exotic car recovery",
    "accident & collision recovery",
    "heavy-duty vehicle recovery",
    "basement pull-out",
  ],
  moversCategories: ["small mover", "medium mover", "heavy mover"],
};

// Internal keys map for schema storage (controller-level shaping)
const MAP_KEYS = {
  carRecovery: {
    categories: {
      "towing services": "towing",
      "winching services": "winching",
      "roadside assistance": "roadsideAssistance",
      "specialized/heavy recovery": "specializedHeavyRecovery",
    },
    towingSub: {
      "flatbed towing": "flatbed",
      "wheel lift towing": "wheelLift",
    },
    winchingSub: {
      "on-road winching": "onRoadWinching",
      "off-road winching": "offRoadWinching",
    },
    roadsideSub: {
      "battery jump start": "jumpstart",
      "fuel delivery": "fuelDelivery",
    },
    specializedSub: {
      "luxury & exotic car recovery": "luxuryExotic",
      "accident & collision recovery": "accidentCollision",
      "heavy-duty vehicle recovery": "heavyDutyVehicle",
      "basement pull-out": "basementPullOut",
    },
  },
  movers: {
    "small mover": "smallMover",
    "medium mover": "mediumMover",
    "heavy mover": "heavyMover",
  },
};

// Helper: prune undefined recursively (avoid setting undefined in subdocs)
function pruneUndefinedDeep(obj) {
  if (!obj || typeof obj !== "object") return obj;
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    if (v === undefined) {
      delete obj[k];
    } else if (v && typeof v === "object") {
      pruneUndefinedDeep(v);
    }
  });
  return obj;
}

// Helper: deep-merge where arrays are replaced; skip undefined/null
function deepMergeReplaceArrays(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source))
    return target;
  Object.keys(source).forEach((key) => {
    const srcVal = source[key];
    if (srcVal === undefined) return; // skip undefined entirely
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
      if (srcVal === null) return; // skip null for object-typed schema nodes
      target[key] = srcVal;
    }
  });
  return target;
}

// Ensure ALL required carRecovery service-level docs exist (min shapes)
function ensureCarRecoveryServiceLevel(cr) {
  cr.baseFare = cr.baseFare || { amount: 0, coverageKm: 0 };
  cr.perKmRate = cr.perKmRate || {
    afterBaseCoverage: 0,
    cityWiseAdjustment: { enabled: false, aboveKm: 0, adjustedRate: 0 },
  };
  cr.minimumFare = cr.minimumFare ?? 0;
  cr.platformFee = cr.platformFee || {
    percentage: 0,
    driverShare: 0,
    customerShare: 0,
  };
  cr.cancellationCharges = cr.cancellationCharges || {
    beforeArrival: 0,
    after50PercentDistance: 0,
    afterArrival: 0,
  };
  cr.waitingCharges = cr.waitingCharges || {
    freeMinutes: 0,
    perMinuteRate: 0,
    maximumCharge: 0,
    driverControlPopup: { enabled: false },
  };
  cr.nightCharges = cr.nightCharges || {
    enabled: false,
    startHour: 22,
    endHour: 6,
    fixedAmount: 0,
    multiplier: 1,
  };
  cr.surgePricing = cr.surgePricing || {
    enabled: false,
    adminControlled: false,
    noSurge: true,
    surge1_5x: false,
    surge2_0x: false,
    levels: [],
  };
  cr.refreshmentAlert = cr.refreshmentAlert || {};
  cr.freeStayMinutes = cr.freeStayMinutes || {};
  cr.vat = cr.vat || {};
  return cr;
}

// Response aligner: keep all service-level blocks, but guarantee category trees
function alignCarRecoveryToFlow(cr) {
  if (!cr || typeof cr !== "object") return cr;
  const out = ensureCarRecoveryServiceLevel({ ...cr });

  const desiredCats = {
    [MAP_KEYS.carRecovery.categories["towing services"]]: { subCategories: {} },
    [MAP_KEYS.carRecovery.categories["winching services"]]: {
      subCategories: {},
    },
    [MAP_KEYS.carRecovery.categories["roadside assistance"]]: {
      subCategories: {},
    },
    [MAP_KEYS.carRecovery.categories["specialized/heavy recovery"]]: {
      subCategories: {},
    },
  };

  const current = (out.serviceTypes = out.serviceTypes || {});

  // Ensure each required subcategory key exists at least as {}
  // Towing
  const towing = current.towing || {};
  desiredCats.towing.subCategories.flatbed =
    towing.subCategories?.flatbed ?? {};
  desiredCats.towing.subCategories.wheelLift =
    towing.subCategories?.wheelLift ?? {};

  // Winching
  const winching = current.winching || {};
  desiredCats.winching.subCategories.onRoadWinching =
    winching.subCategories?.onRoadWinching ?? {};
  desiredCats.winching.subCategories.offRoadWinching =
    winching.subCategories?.offRoadWinching ?? {};

  // Roadside Assistance
  const roadside = current.roadsideAssistance || {};
  desiredCats.roadsideAssistance.subCategories.jumpstart =
    roadside.subCategories?.jumpstart ?? {};
  desiredCats.roadsideAssistance.subCategories.fuelDelivery =
    roadside.subCategories?.fuelDelivery ?? {};

  // Specialized/Heavy Recovery
  const spec = current.specializedHeavyRecovery || {};
  desiredCats.specializedHeavyRecovery.subCategories.luxuryExotic =
    spec.subCategories?.luxuryExotic ?? {};
  desiredCats.specializedHeavyRecovery.subCategories.accidentCollision =
    spec.subCategories?.accidentCollision ?? {};
  desiredCats.specializedHeavyRecovery.subCategories.heavyDutyVehicle =
    spec.subCategories?.heavyDutyVehicle ?? {};
  desiredCats.specializedHeavyRecovery.subCategories.basementPullOut =
    spec.subCategories?.basementPullOut ?? {};

  out.serviceTypes = desiredCats;
  return out;
}

function alignShiftingMoversToFlow(sm) {
  if (!sm || typeof sm !== "object") return sm;
  const out = { ...sm };

  // Ensure categories structure exists and keys exist as objects
  out.categories = out.categories || {};
  const cats = {};
  FLOW.moversCategories.forEach((name) => {
    const key = MAP_KEYS.movers[name];
    const src = out.categories[key] || {};
    cats[key] = {
      label: src.label || name[0].toUpperCase() + name.slice(1),
      info: src.info || "",
      vehicles: Array.isArray(src.vehicles) ? src.vehicles : [],
    };
  });
  out.categories = cats;

  // Ensure other pricing blocks are at least empty objects (avoid undefined cast)
  out.vehicleCost = out.vehicleCost || {};
  out.basicServices = out.basicServices || {};
  out.pickupLocationPolicy = out.pickupLocationPolicy || {};
  out.dropoffLocationPolicy = out.dropoffLocationPolicy || {};
  out.packingFares = out.packingFares || {};
  out.fixingFares = out.fixingFares || {};
  out.loadingUnloadingFares = out.loadingUnloadingFares || {};

  return out;
}

// Get comprehensive pricing configuration (exclude globals at DB level, align)
const getComprehensivePricing = async (req, res) => {
  try {
    const projection = {
      baseFare: 0,
      perKmRate: 0,
      platformFee: 0,
      cancellationCharges: 0,
      waitingCharges: 0,
      nightCharges: 0,
      surgePricing: 0,
      vat: 0,
      minimumFare: 0,
    };

    const config = await ComprehensivePricing.findOne(
      { isActive: true },
      projection
    ).populate("lastUpdatedBy", "name email");

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Comprehensive pricing configuration not found",
      });
    }

    const json = config.toObject({ virtuals: true }) || {};
    json.serviceTypes = json.serviceTypes || {};

    if (json.serviceTypes.carRecovery) {
      json.serviceTypes.carRecovery = alignCarRecoveryToFlow(
        json.serviceTypes.carRecovery
      );
    }
    if (json.serviceTypes.shiftingMovers) {
      json.serviceTypes.shiftingMovers = alignShiftingMoversToFlow(
        json.serviceTypes.shiftingMovers
      );
    }

    res.status(200).json({
      success: true,
      data: json,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching comprehensive pricing configuration",
      error: error.message,
    });
  }
};

// Update car recovery service rates (Towing/Winching/Roadside etc.)
const updateCarRecoveryRates = async (req, res) => {
  try {
    const { enabled, flatbed, wheelLift, jumpstart } = req.body;
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

    // Ensure base branches
    config.serviceTypes = config.serviceTypes || {};
    config.serviceTypes.carRecovery = ensureCarRecoveryServiceLevel(
      config.serviceTypes.carRecovery || {}
    );

    // Merge payload
    if (carRecoveryPayload && typeof carRecoveryPayload === "object") {
      const cr = config.serviceTypes.carRecovery;
      // Init categories we support
      cr.serviceTypes = cr.serviceTypes || {};
      cr.serviceTypes.towing = cr.serviceTypes.towing || { subCategories: {} };
      cr.serviceTypes.winching = cr.serviceTypes.winching || {
        subCategories: {},
      };
      cr.serviceTypes.roadsideAssistance = cr.serviceTypes
        .roadsideAssistance || { subCategories: {} };
      cr.serviceTypes.specializedHeavyRecovery = cr.serviceTypes
        .specializedHeavyRecovery || { subCategories: {} };

      pruneUndefinedDeep(carRecoveryPayload);
      deepMergeReplaceArrays(cr, carRecoveryPayload);

      // Align categories (keep service-level fields)
      config.serviceTypes.carRecovery = alignCarRecoveryToFlow(cr);
    }

    // Backward compatibility setters
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

// Bulk update comprehensive pricing (flow mapping; service-only)
const bulkUpdatePricing = async (req, res) => {
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

    // Transform Vehicle Select Flow to schema-oriented object (service-only)
    function transformFlowToSchema(flowPayload) {
      const out = { serviceTypes: {} };
      if (!Array.isArray(flowPayload?.flow)) return out;

      for (const svc of flowPayload.flow) {
        if (!FLOW.services.includes(svc.key)) {
          throw new Error(`Unknown service '${svc.key}'`);
        }
        if (svc.key === "car recovery") {
          const cr = (out.serviceTypes.carRecovery =
            out.serviceTypes.carRecovery || {});
          if (Array.isArray(svc.categories)) {
            cr.serviceTypes = cr.serviceTypes || {};
            for (const cat of svc.categories) {
              if (!FLOW.carRecoveryCategories.includes(cat.key)) continue;
              const catKey = MAP_KEYS.carRecovery.categories[cat.key];
              const dstCat = (cr.serviceTypes[catKey] = cr.serviceTypes[
                catKey
              ] || { subCategories: {} });
              if (Array.isArray(cat.subServices)) {
                for (const sub of cat.subServices) {
                  let mapGroup = null;
                  if (cat.key === "towing services") mapGroup = "towingSub";
                  if (cat.key === "winching services") mapGroup = "winchingSub";
                  if (cat.key === "roadside assistance")
                    mapGroup = "roadsideSub";
                  if (cat.key === "specialized/heavy recovery")
                    mapGroup = "specializedSub";
                  const mapped =
                    mapGroup &&
                    MAP_KEYS.carRecovery[mapGroup] &&
                    MAP_KEYS.carRecovery[mapGroup][sub.key];
                  if (!mapped) continue;
                  dstCat.subCategories[mapped] =
                    dstCat.subCategories[mapped] || {};
                }
              }
            }
          }
          if (svc.helpers) cr.helpers = svc.helpers;
          if (svc.roundTrip) cr.roundTrip = svc.roundTrip;
        } else if (svc.key === "shifting & movers") {
          const sm = (out.serviceTypes.shiftingMovers =
            out.serviceTypes.shiftingMovers || {});
          sm.categories = sm.categories || {};
          if (Array.isArray(svc.categories)) {
            for (const cat of svc.categories) {
              if (!FLOW.moversCategories.includes(cat.key)) continue;
              const k = MAP_KEYS.movers[cat.key];
              sm.categories[k] = {
                label: cat.label,
                vehicles: Array.isArray(cat.vehicles) ? cat.vehicles : [],
                info: cat.info || "",
              };
            }
          }
          if (svc.helpers) sm.helpers = svc.helpers;
          if (svc.roundTrip) sm.roundTrip = svc.roundTrip;
        } else if (svc.key === "car cab") {
          const cab = (out.serviceTypes.carCab = out.serviceTypes.carCab || {});
          if (Array.isArray(svc.subServices)) {
            cab.vehicleTypes = cab.vehicleTypes || {};
            for (const sub of svc.subServices) {
              cab.vehicleTypes[sub.key] = cab.vehicleTypes[sub.key] || {};
            }
          }
          if (svc.helpers) cab.helpers = svc.helpers;
          if (svc.roundTrip) cab.roundTrip = svc.roundTrip;
        } else if (svc.key === "bike") {
          const bike = (out.serviceTypes.bike = out.serviceTypes.bike || {});
          if (Array.isArray(svc.subServices)) {
            bike.vehicleTypes = bike.vehicleTypes || {};
            for (const sub of svc.subServices) {
              bike.vehicleTypes[sub.key] = bike.vehicleTypes[sub.key] || {};
            }
          }
          if (svc.helpers) bike.helpers = svc.helpers;
          if (svc.roundTrip) bike.roundTrip = svc.roundTrip;
        }
      }
      return out;
    }

    // Decide if incoming is flow. If not, only accept serviceTypes (no globals)
    let normalized;
    if (Array.isArray(updates.flow)) {
      try {
        normalized = transformFlowToSchema(updates);
      } catch (e) {
        return res.status(400).json({ success: false, message: e.message });
      }
    } else {
      normalized = {
        serviceTypes:
          (updates && typeof updates === "object" && updates.serviceTypes) ||
          {},
      };
    }

    // Prune undefined across payload to avoid casting errors
    pruneUndefinedDeep(normalized);

    // Initializers for branches we may merge into
    if (
      normalized?.serviceTypes &&
      typeof normalized.serviceTypes === "object"
    ) {
      config.serviceTypes = config.serviceTypes || {};

      // Car recovery service-level + categories
      if (normalized.serviceTypes.carRecovery) {
        const cr = (config.serviceTypes.carRecovery =
          ensureCarRecoveryServiceLevel(config.serviceTypes.carRecovery || {}));

        cr.serviceTypes = cr.serviceTypes || {};
        cr.serviceTypes.towing = cr.serviceTypes.towing || {
          subCategories: {},
        };
        cr.serviceTypes.winching = cr.serviceTypes.winching || {
          subCategories: {},
        };
        cr.serviceTypes.roadsideAssistance = cr.serviceTypes
          .roadsideAssistance || { subCategories: {} };
        cr.serviceTypes.specializedHeavyRecovery = cr.serviceTypes
          .specializedHeavyRecovery || { subCategories: {} };
      }

      // Shifting movers categories container
      if (normalized.serviceTypes.shiftingMovers) {
        const sm = (config.serviceTypes.shiftingMovers =
          config.serviceTypes.shiftingMovers || {});
        sm.categories = sm.categories || {};
        // ensure other blocks at least objects
        sm.vehicleCost = sm.vehicleCost || {};
        sm.basicServices = sm.basicServices || {};
        sm.pickupLocationPolicy = sm.pickupLocationPolicy || {};
        sm.dropoffLocationPolicy = sm.dropoffLocationPolicy || {};
        sm.packingFares = sm.packingFares || {};
        sm.fixingFares = sm.fixingFares || {};
        sm.loadingUnloadingFares = sm.loadingUnloadingFares || {};
      }

      // car cab/bike vehicleTypes init
      if (normalized.serviceTypes.carCab) {
        const cab = (config.serviceTypes.carCab =
          config.serviceTypes.carCab || {});
        cab.vehicleTypes = cab.vehicleTypes || {};
      }
      if (normalized.serviceTypes.bike) {
        const bike = (config.serviceTypes.bike =
          config.serviceTypes.bike || {});
        bike.vehicleTypes = bike.vehicleTypes || {};
      }
    }

    // APPLY MERGE (objects deep-merged; arrays replaced)
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
        if (src !== undefined && src !== null) {
          config[key] = src;
        }
      }
    });

    // Align shapes post-merge (guarantee required category subdocs exist)
    if (config.serviceTypes?.carRecovery) {
      config.serviceTypes.carRecovery = alignCarRecoveryToFlow(
        config.serviceTypes.carRecovery
      );
    }
    if (config.serviceTypes?.shiftingMovers) {
      config.serviceTypes.shiftingMovers = alignShiftingMoversToFlow(
        config.serviceTypes.shiftingMovers
      );
    }

    config.lastUpdatedBy = adminId || config.lastUpdatedBy || null;
    await config.save();

    // Reload excluding globals and aligned
    const projection = {
      baseFare: 0,
      perKmRate: 0,
      platformFee: 0,
      cancellationCharges: 0,
      waitingCharges: 0,
      nightCharges: 0,
      surgePricing: 0,
      vat: 0,
      minimumFare: 0,
    };
    const fresh = await ComprehensivePricing.findById(config._id, projection);
    const json = fresh ? fresh.toObject({ virtuals: true }) : {};

    if (json.serviceTypes?.carRecovery) {
      json.serviceTypes.carRecovery = alignCarRecoveryToFlow(
        json.serviceTypes.carRecovery
      );
    }
    if (json.serviceTypes?.shiftingMovers) {
      json.serviceTypes.shiftingMovers = alignShiftingMoversToFlow(
        json.serviceTypes.shiftingMovers
      );
    }

    res.status(200).json({
      success: true,
      message: "Comprehensive pricing updated successfully",
      data: json,
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

    if (!config.serviceSpecificRates) {
      config.serviceSpecificRates = {};
    }
    if (!config.serviceSpecificRates.shiftingMovers) {
      config.serviceSpecificRates.shiftingMovers = { itemPricing: [] };
    }
    if (!config.serviceSpecificRates.shiftingMovers.itemPricing) {
      config.serviceSpecificRates.shiftingMovers.itemPricing = [];
    }

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

    if (!config.serviceSpecificRates?.shiftingMovers?.itemPricing) {
      return res.status(404).json({
        success: false,
        message: "Item pricing configuration not found",
      });
    }

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

// Update currency
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

// Recovery granular (service-specific)
const updateRecoveryCoreRates = async (req, res) => {
  try {
    const { baseFare, perKmRate } = req.body;
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config)
      return res
        .status(404)
        .json({ success: false, message: "Config not found" });

    // SAFE initializers
    config.serviceTypes = config.serviceTypes || {};
    config.serviceTypes.carRecovery = ensureCarRecoveryServiceLevel(
      config.serviceTypes.carRecovery || {}
    );

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

const updateRecoveryWaitingCharges = async (req, res) => {
  try {
    const { freeMinutes, perMinuteRate, maximumCharge } = req.body;
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config)
      return res
        .status(404)
        .json({ success: false, message: "Config not found" });

    // SAFE initializers
    config.serviceTypes = config.serviceTypes || {};
    config.serviceTypes.carRecovery = ensureCarRecoveryServiceLevel(
      config.serviceTypes.carRecovery || {}
    );

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

const updateRecoveryCancellationCharges = async (req, res) => {
  try {
    const { beforeArrival, after25Percent, after50Percent, afterArrival } =
      req.body;
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config)
      return res
        .status(404)
        .json({ success: false, message: "Config not found" });

    // SAFE initializers
    config.serviceTypes = config.serviceTypes || {};
    config.serviceTypes.carRecovery = ensureCarRecoveryServiceLevel(
      config.serviceTypes.carRecovery || {}
    );

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

const updateRecoveryNightCharges = async (req, res) => {
  try {
    const { enabled, startHour, endHour, fixedAmount, multiplier } = req.body;
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config)
      return res
        .status(404)
        .json({ success: false, message: "Config not found" });

    // SAFE initializers
    config.serviceTypes = config.serviceTypes || {};
    config.serviceTypes.carRecovery = ensureCarRecoveryServiceLevel(
      config.serviceTypes.carRecovery || {}
    );

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

const updateRecoverySurgeFlags = async (req, res) => {
  try {
    const { enabled, adminControlled, noSurge, surge1_5x, surge2_0x, levels } =
      req.body;
    const config = await ComprehensivePricing.findOne({ isActive: true });
    if (!config)
      return res
        .status(404)
        .json({ success: false, message: "Config not found" });

    // SAFE initializers
    config.serviceTypes = config.serviceTypes || {};
    config.serviceTypes.carRecovery = ensureCarRecoveryServiceLevel(
      config.serviceTypes.carRecovery || {}
    );

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
};
