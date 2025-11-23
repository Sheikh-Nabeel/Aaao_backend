import ComprehensivePricing from "../models/comprehensivePricingModel.js";

// Get current time for night charge calculation
const getCurrentHour = () => new Date().getHours();
const isNightTime = (nightCharges) => {
  if (!nightCharges || nightCharges.enabled !== true) return false;
  const currentHour = getCurrentHour();
  const startHour = Number(nightCharges.startHour);
  const endHour = Number(nightCharges.endHour);
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return false;
  if (startHour === endHour) return false;
  if (startHour > endHour)
    return currentHour >= startHour || currentHour < endHour;
  return currentHour >= startHour && currentHour < endHour;
};

// Calculate surge multiplier based on demand
const calculateSurgeMultiplier = (demandRatio, surgePricing) => {
  if (!surgePricing?.enabled) return 1;
  const surgeLevel = (surgePricing.levels || [])
    .slice()
    .sort((a, b) => b.demandRatio - a.demandRatio)
    .find((level) => Number(demandRatio) >= Number(level.demandRatio));
  return surgeLevel ? Number(surgeLevel.multiplier || 1) : 1;
};

// Calculate cancellation charges based on trip progress
const calculateCancellationCharges = (
  tripProgress,
  cancellationReason,
  cancellationCharges
) => {
  const {
    beforeArrival,
    after25PercentDistance,
    after50PercentDistance,
    afterArrival,
  } = cancellationCharges || {};
  if (cancellationReason === "driver_cancelled") return 0;
  if (
    cancellationReason === "customer_cancelled_after_arrival" ||
    tripProgress === "arrived"
  )
    return Number(afterArrival || 0);
  if (Number(tripProgress) >= 0.5) return Number(after50PercentDistance || 0);
  if (Number(tripProgress) >= 0.25) return Number(after25PercentDistance || 0);
  return Number(beforeArrival || 0);
};

// Calculate waiting charges
const calculateWaitingCharges = (waitingMinutes, waitingCharges) => {
  const {
    freeMinutes = 0,
    perMinuteRate = 0,
    maximumCharge = Infinity,
  } = waitingCharges || {};
  if (Number(waitingMinutes) <= Number(freeMinutes)) return 0;
  const chargeableMinutes = Math.max(
    0,
    Number(waitingMinutes) - Number(freeMinutes)
  );
  const calculatedCharge = chargeableMinutes * Number(perMinuteRate);
  return Math.min(calculatedCharge, Number(maximumCharge));
};

// Calculate free stay minutes for round trips
const calculateFreeStayMinutes = (distance, roundTripConfig) => {
  if (!roundTripConfig?.freeStayMinutes?.enabled) return 0;
  const minutes =
    Number(distance) * Number(roundTripConfig.freeStayMinutes.ratePerKm || 0);
  return Math.min(
    minutes,
    Number(roundTripConfig.freeStayMinutes.maximumMinutes || 0)
  );
};

// Check if refreshment alert should be shown
const shouldShowRefreshmentAlert = (
  distance,
  estimatedDuration,
  roundTripConfig,
  serviceType = null,
  recoveryConfig = null
) => {
  if (serviceType === "car recovery" && recoveryConfig?.refreshmentAlert) {
    if (!recoveryConfig.refreshmentAlert.enabled) return false;
    return (
      Number(distance) >=
        Number(recoveryConfig.refreshmentAlert.minimumDistance || 0) ||
      Number(estimatedDuration) >=
        Number(recoveryConfig.refreshmentAlert.minimumDuration || 0)
    );
  }
  if (!roundTripConfig?.refreshmentAlert?.enabled) return false;
  return (
    Number(distance) >=
      Number(roundTripConfig.refreshmentAlert.minimumDistance || 0) ||
    Number(estimatedDuration) >=
      Number(roundTripConfig.refreshmentAlert.minimumDuration || 0)
  );
};

// Calculate refreshment/overtime charges for car recovery
const calculateRefreshmentCharges = (overtimeMinutes, refreshmentConfig) => {
  if (!refreshmentConfig?.enabled || Number(overtimeMinutes) <= 0) return 0;
  const perMinuteCharge =
    Number(overtimeMinutes) * Number(refreshmentConfig.perMinuteCharges || 0);
  return Math.min(
    perMinuteCharge,
    Number(refreshmentConfig.maximumCharges || Infinity)
  );
};

// Calculate free stay minutes for car recovery round trips
const calculateCarRecoveryFreeStay = (distance, freeStayConfig) => {
  if (!freeStayConfig?.enabled) return 0;
  const minutes = Number(distance) * Number(freeStayConfig.ratePerKm || 0);
  return Math.min(minutes, Number(freeStayConfig.maximumCap || 0));
};

// Helper: find Car Recovery sub-service override (towing/winching/roadside/keyUnlocker)
const getCRSubOverride = (recoveryConfig, vehicleType) => {
  if (!vehicleType || !recoveryConfig?.serviceTypes) return null;

  const T = MAP_KEYS.carRecovery.categories["towing services"];
  const W = MAP_KEYS.carRecovery.categories["winching services"];
  const R = MAP_KEYS.carRecovery.categories["roadside assistance"];

  const towing = recoveryConfig.serviceTypes[T]?.subCategories?.[vehicleType];
  const winching = recoveryConfig.serviceTypes[W]?.subCategories?.[vehicleType];
  const roadside = recoveryConfig.serviceTypes[R]?.subCategories?.[vehicleType];

  if (towing) return { scope: T, block: towing };
  if (winching) return { scope: W, block: winching };
  if (roadside) return { scope: R, block: roadside };

  if (vehicleType === "keyUnlocker") {
    const keyBlock = recoveryConfig.serviceTypes.keyUnlockerServices;
    if (keyBlock) return { scope: "keyUnlocker", block: keyBlock };
  }
  return null;
};

// Helper: compute Shifting & Movers additional charges
function computeShiftingMoversExtras(config, moversOptions = {}) {
  let extras = 0;
  const sm = config?.serviceTypes?.shiftingMovers || {};
  const bsCfg = sm.basicServices || {};
  const selectedBS = moversOptions.basicServices || {};
  if (selectedBS.loadingUnloadingHelper && bsCfg.loadingUnloadingHelper) {
    extras += Number(bsCfg.loadingUnloadingHelper.flatFee || 0);
  }
  if (selectedBS.packers && bsCfg.packers) {
    extras += Number(bsCfg.packers.flatFee || 0);
  }
  if (selectedBS.fixers && bsCfg.fixers) {
    extras += Number(bsCfg.fixers.flatFee || 0);
  }

  const itemsDefault = {};
  const multiplyItems = (items, perFare) => {
    let sum = 0;
    const keys = Object.keys(items || {});
    for (const k of keys) {
      const qty = Number(items[k] || 0);
      const rate = Number(perFare?.[k] || 0);
      sum += qty * rate;
    }
    return sum;
  };

  const pickup = moversOptions.pickup || {};
  if (pickup.type === "stairs") {
    const floors = Math.max(0, Number(pickup.floors || 0));
    const perFare = sm.pickupLocationPolicy?.stairs?.perFloorFare || {};
    extras += floors * multiplyItems(pickup.items || itemsDefault, perFare);
  } else if (pickup.type === "lift") {
    const perFare = sm.pickupLocationPolicy?.lift?.minorCharge || {};
    extras += multiplyItems(pickup.items || itemsDefault, perFare);
  } else if (pickup.type === "groundFloor") {
    extras += Number(sm.pickupLocationPolicy?.groundFloor?.extraCharge || 0);
  }

  const dropoff = moversOptions.dropoff || {};
  if (dropoff.type === "stairs") {
    const floors = Math.max(0, Number(dropoff.floors || 0));
    const perFare = sm.dropoffLocationPolicy?.stairs?.perFloorFare || {};
    extras += floors * multiplyItems(dropoff.items || itemsDefault, perFare);
  } else if (dropoff.type === "lift") {
    const perFare = sm.dropoffLocationPolicy?.lift?.minorCharge || {};
    extras += multiplyItems(dropoff.items || itemsDefault, perFare);
  } else if (dropoff.type === "groundFloor") {
    extras += Number(sm.dropoffLocationPolicy?.groundFloor?.extraCharge || 0);
  }

  const packingItems = moversOptions.packingItems || {};
  const packingFares = sm.packingFares || {};
  extras += multiplyItems(packingItems, packingFares);

  const fixingItems = moversOptions.fixingItems || {};
  const fixingFares = sm.fixingFares || {};
  extras += multiplyItems(fixingItems, fixingFares);

  const loadItems = moversOptions.loadingUnloadingItems || {};
  const loadFares = sm.loadingUnloadingFares || {};
  extras += multiplyItems(loadItems, loadFares);

  return extras;
}

// Main comprehensive fare calculation function
const calculateComprehensiveFare = async (bookingData) => {
  try {
    // Get pricing configuration
    const pricingConfig = await ComprehensivePricing.findOne({
      isActive: true,
    }).lean();
    if (!pricingConfig) {
      throw new Error("Comprehensive pricing configuration not found");
    }

    const {
      serviceType,
      vehicleType,
      distance,
      routeType = "one_way",
      demandRatio = 1,
      waitingMinutes = 0,
      tripProgress = 0,
      estimatedDuration = 0,
      isNightTime: isNightTimeParam = false,
      isCancelled = false,
      cancellationReason = null,
      // Optional service-specific inputs
      moversOptions = {},
      appointmentOptions = {},
    } = bookingData;

    const normalizedServiceType = String(serviceType || "")
      .replace(/\s+/g, "_")
      .toLowerCase();

    // Local working variables (do not rely on non-existent top-level fields)
    let baseFare = 0;
    let coverageKm = 0;
    let perKmRate = 0;
    let cityWiseAdjustment = { enabled: false };
    let nightChargesConfigToUse = null;

    // 1. Resolve per-service base/per-km/night configs
    if (
      (normalizedServiceType === "car_cab" || serviceType === "car cab") &&
      pricingConfig.serviceTypes?.carCab?.enabled
    ) {
      const vehicleCfg =
        pricingConfig.serviceTypes.carCab.vehicleTypes?.[
          String(vehicleType || "").toLowerCase()
        ];
      if (vehicleCfg) {
        baseFare = Number(vehicleCfg.baseFare || 0);
        perKmRate = Number(vehicleCfg.perKmRate || 0);
        nightChargesConfigToUse = vehicleCfg.nightCharges?.enabled
          ? vehicleCfg.nightCharges
          : null;
      } else {
        // Fallback to minimumFare as a floor only; perKmRate remains 0 unless defined per vehicle
        baseFare = Number(pricingConfig.serviceTypes.carCab.minimumFare || 0);
      }
    } else if (
      serviceType === "bike" &&
      pricingConfig.serviceTypes?.bike?.enabled
    ) {
      const vehicleCfg =
        pricingConfig.serviceTypes.bike.vehicleTypes?.[
          String(vehicleType || "").toLowerCase()
        ];
      if (vehicleCfg) {
        baseFare = Number(vehicleCfg.baseFare || 0);
        perKmRate = Number(vehicleCfg.perKmRate || 0);
        nightChargesConfigToUse = vehicleCfg.nightCharges?.enabled
          ? vehicleCfg.nightCharges
          : null;
      } else {
        // Bike service also has fallback numbers at service level
        baseFare = Number(pricingConfig.serviceTypes.bike.baseFare || 0);
        perKmRate = Number(pricingConfig.serviceTypes.bike.perKmRate || 0);
      }
    } else if (
      normalizedServiceType === "car_recovery" ||
      serviceType === "car recovery"
    ) {
      const recovery = pricingConfig.serviceTypes?.carRecovery || {};
      // Defaults from service-level
      baseFare = Number(recovery.baseFare?.amount || 0);
      coverageKm = Number(recovery.baseFare?.coverageKm || 0);
      perKmRate = Number(recovery.perKmRate?.afterBaseCoverage || 0);
      cityWiseAdjustment = recovery.perKmRate?.cityWiseAdjustment || {
        enabled: false,
      };
      nightChargesConfigToUse = recovery.nightCharges?.enabled
        ? recovery.nightCharges
        : null;

      // Optional sub-service overrides driven by vehicleType key
      const sub = getCRSubOverride(recovery, vehicleType);
      if (sub) {
        const scopeMinArriving = Number(
          recovery?.serviceTypes?.[sub.scope]
            ?.minimumChargesForDriverArriving || 0
        );
        const convenienceFee = Number(sub.block?.convenienceFee || 0);

        const subBaseAmount = Number(sub.block?.baseFare?.amount || 0);
        if (subBaseAmount > 0) {
          baseFare = subBaseAmount + convenienceFee;
        } else {
          baseFare = scopeMinArriving + convenienceFee;
        }

        // Effective overrides
        const effCoverageKm =
          sub.block?.baseFare?.coverageKm ?? recovery.baseFare?.coverageKm ?? 0;
        const effPerKm =
          sub.block?.perKmRate?.afterBaseCoverage ??
          recovery.perKmRate?.afterBaseCoverage ??
          0;
        const effCityWise = sub.block?.perKmRate?.cityWiseAdjustment ??
          recovery.perKmRate?.cityWiseAdjustment ?? { enabled: false };

        coverageKm = Number(effCoverageKm || 0);
        perKmRate = Number(effPerKm || 0);
        cityWiseAdjustment = effCityWise || { enabled: false };

        // Waiting/night/surge/platform/cancellation/VAT overrides
        // These blocks are used later when computing totals
        pricingConfig._runtime = pricingConfig._runtime || {};
        pricingConfig._runtime.waitingCharges =
          sub.block?.waitingCharges || recovery.waitingCharges || {};
        pricingConfig._runtime.surgePricing =
          sub.block?.surgePricing || recovery.surgePricing || {};
        nightChargesConfigToUse =
          (sub.block?.nightCharges?.enabled && sub.block.nightCharges) ||
          nightChargesConfigToUse;

        pricingConfig._runtime.minimumFare = Number(recovery.minimumFare || 0);
        pricingConfig._runtime.platformFee = recovery.platformFee || {};
        pricingConfig._runtime.cancellationCharges =
          recovery.cancellationCharges || {};
        if (recovery.vat?.enabled) {
          pricingConfig._runtime.vat = recovery.vat;
        }
      } else {
        // Service-level policies
        pricingConfig._runtime = pricingConfig._runtime || {};
        pricingConfig._runtime.minimumFare = Number(recovery.minimumFare || 0);
        pricingConfig._runtime.platformFee = recovery.platformFee || {};
        pricingConfig._runtime.cancellationCharges =
          recovery.cancellationCharges || {};
        pricingConfig._runtime.waitingCharges = recovery.waitingCharges || {};
        pricingConfig._runtime.surgePricing = recovery.surgePricing || {};
        if (recovery.vat?.enabled) {
          pricingConfig._runtime.vat = recovery.vat;
        }
      }
    } else if (
      normalizedServiceType === "shifting_&_movers" ||
      normalizedServiceType === "shifting_movers" ||
      serviceType === "shifting & movers"
    ) {
      const sm = pricingConfig.serviceTypes?.shiftingMovers || {};
      const vc = sm.vehicleCost || {};
      baseFare = Number(vc.startFare || 0);
      coverageKm = Number(vc.coverageKm || 0);
      perKmRate = Number(vc.perKmRate || 0);
      // night/surge/waiting not overridden for movers; leave as null/0
    } else if (
      normalizedServiceType === "appointment" ||
      serviceType === "appointment"
    ) {
      const appt = pricingConfig.appointmentServices || {};
      if (appt.enabled) baseFare = Number(appt.fixedAppointmentFee || 0);
    }

    // Fare breakdown scaffold
    let fareBreakdown = {
      baseFare: 0,
      distanceFare: 0,
      platformFee: 0,
      nightCharges: 0,
      surgeCharges: 0,
      waitingCharges: 0,
      cancellationCharges: 0,
      vatAmount: 0,
      subtotal: 0,
      totalFare: 0,
      currency: pricingConfig.currency || "AED",
      breakdown: {},
      alerts: [],
    };

    // Base fare
    fareBreakdown.baseFare = Number(baseFare || 0);

    // 2. Distance fare with coverage and city-wise adjustment
    if (Number(distance) > Number(coverageKm || 0)) {
      let remainingDistance = Number(distance) - Number(coverageKm || 0);

      const cwa = cityWiseAdjustment || { enabled: false };
      const aboveKm = Number(cwa.aboveKm || 0);
      if (cwa.enabled && Number(distance) > aboveKm) {
        const adjustmentPoint = Math.max(0, aboveKm - Number(coverageKm || 0));
        if (remainingDistance > adjustmentPoint) {
          const beforeAdjustment = adjustmentPoint * Number(perKmRate || 0);
          const afterAdjustment =
            (remainingDistance - adjustmentPoint) *
            Number(cwa.adjustedRate || 0);
          fareBreakdown.distanceFare = beforeAdjustment + afterAdjustment;
        } else {
          fareBreakdown.distanceFare =
            remainingDistance * Number(perKmRate || 0);
        }
      } else {
        fareBreakdown.distanceFare = remainingDistance * Number(perKmRate || 0);
      }
    }

    // Subtotal before extras
    fareBreakdown.subtotal =
      Number(fareBreakdown.baseFare || 0) +
      Number(fareBreakdown.distanceFare || 0);

    // Movers extras
    if (
      normalizedServiceType === "shifting_&_movers" ||
      normalizedServiceType === "shifting_movers" ||
      serviceType === "shifting & movers"
    ) {
      const moversExtras = computeShiftingMoversExtras(
        pricingConfig,
        moversOptions
      );
      if (moversExtras > 0) {
        fareBreakdown.breakdown.shiftingMoversExtras = moversExtras;
        fareBreakdown.subtotal += Number(moversExtras);
      }
    }

    // Round trip multiplier: EXACT double for two-way/round-trip (applies to all services)
    if (routeType === "round_trip" || routeType === "two_way") {
      fareBreakdown.roundTripMultiplier = 2.0;
      fareBreakdown.subtotal *= fareBreakdown.roundTripMultiplier;
    }

    // Free stay minutes (generic round trip block)
    const genericFreeStayMinutes = calculateFreeStayMinutes(
      Number(distance || 0),
      pricingConfig.roundTrip || {}
    );
    if (genericFreeStayMinutes > 0) {
      fareBreakdown.breakdown.freeStayMinutes = genericFreeStayMinutes;
    }

    // Refreshment alert
    if (
      shouldShowRefreshmentAlert(
        Number(distance || 0),
        Number(estimatedDuration || 0),
        pricingConfig.roundTrip || {},
        serviceType,
        pricingConfig.serviceTypes?.carRecovery || {}
      )
    ) {
      if (serviceType === "car recovery") {
        fareBreakdown.alerts.push({
          type: "refreshment_alert",
          title:
            pricingConfig.serviceTypes.carRecovery.refreshmentAlert
              ?.popupTitle || "Free Stay Time Ended – Select Action",
          options:
            pricingConfig.serviceTypes.carRecovery.refreshmentAlert
              ?.driverOptions || {},
        });
      } else {
        fareBreakdown.alerts.push("Refreshment recommended for long trip");
      }
    }

    // Car recovery free stay minutes (service-specific)
    if (
      serviceType === "car recovery" &&
      pricingConfig.serviceTypes?.carRecovery?.freeStayMinutes?.enabled
    ) {
      const carRecoveryFreeStay = calculateCarRecoveryFreeStay(
        Number(distance || 0),
        pricingConfig.serviceTypes.carRecovery.freeStayMinutes || {}
      );
      if (carRecoveryFreeStay > 0) {
        fareBreakdown.breakdown.carRecoveryFreeStayMinutes =
          carRecoveryFreeStay;

        if (
          pricingConfig.serviceTypes.carRecovery.freeStayMinutes?.notifications
            ?.fiveMinRemaining
        ) {
          fareBreakdown.alerts.push({
            type: "free_stay_warning",
            message: "5 minutes remaining for free stay",
          });
        }
      }
    }

    // 3. Minimum fare (service-specific)
    let minimumFare = 0;
    if (serviceType === "car cab" || normalizedServiceType === "car_cab") {
      minimumFare = Number(
        pricingConfig.serviceTypes?.carCab?.minimumFare || 0
      );
    } else if (serviceType === "bike") {
      minimumFare = Number(pricingConfig.serviceTypes?.bike?.minimumFare || 0);
    } else if (
      serviceType === "car recovery" ||
      normalizedServiceType === "car_recovery"
    ) {
      minimumFare =
        Number(pricingConfig._runtime?.minimumFare) ||
        Number(pricingConfig.serviceTypes?.carRecovery?.minimumFare || 0);
    } else if (serviceType === "shifting & movers") {
      const startFare = Number(
        pricingConfig.serviceTypes?.shiftingMovers?.vehicleCost?.startFare || 0
      );
      minimumFare = Math.max(Number(minimumFare || 0), startFare);
    }

    if (fareBreakdown.subtotal < minimumFare) {
      fareBreakdown.subtotal = minimumFare;
      fareBreakdown.breakdown.minimumFareApplied = true;
    }

    // 4. Night charges (use resolved config)
    if (
      nightChargesConfigToUse?.enabled &&
      (isNightTimeParam || isNightTime(nightChargesConfigToUse))
    ) {
      const nightChargeFixed = Number(nightChargesConfigToUse.fixedAmount || 0);
      const nightMultiplier = Number(nightChargesConfigToUse.multiplier || 1);
      const nightChargeMultiplied =
        fareBreakdown.subtotal * (Math.max(1, nightMultiplier) - 1);

      fareBreakdown.nightCharges = Math.max(
        nightChargeFixed,
        nightChargeMultiplied
      );
      fareBreakdown.breakdown.nightChargeType =
        nightChargeFixed > nightChargeMultiplied ? "fixed" : "multiplier";
    }

    // 5. Surge pricing
    const effectiveSurge =
      pricingConfig._runtime?.surgePricing ||
      pricingConfig.surgePricing ||
      null;
    if (effectiveSurge?.enabled && Number(demandRatio || 1) > 1) {
      const surgeMultiplier = calculateSurgeMultiplier(
        Number(demandRatio || 1),
        effectiveSurge
      );
      if (surgeMultiplier > 1) {
        fareBreakdown.surgeCharges =
          fareBreakdown.subtotal * (surgeMultiplier - 1);
        fareBreakdown.breakdown.surgeMultiplier = surgeMultiplier;
        fareBreakdown.breakdown.demandRatio = Number(demandRatio || 1);
      }
    }

    // 6. Waiting charges
    const effectiveWaiting =
      pricingConfig._runtime?.waitingCharges ||
      pricingConfig.waitingCharges ||
      {};
    if (Number(waitingMinutes || 0) > 0) {
      fareBreakdown.waitingCharges = calculateWaitingCharges(
        Number(waitingMinutes || 0),
        effectiveWaiting
      );
    }

    // 7. Cancellation charges
    const effectiveCancellation =
      pricingConfig._runtime?.cancellationCharges ||
      pricingConfig.cancellationCharges ||
      {};
    if (isCancelled) {
      fareBreakdown.cancellationCharges = calculateCancellationCharges(
        tripProgress,
        cancellationReason,
        effectiveCancellation
      );
    }

    // 8. Platform fee
    const fareBeforePlatformFee =
      Number(fareBreakdown.subtotal || 0) +
      Number(fareBreakdown.nightCharges || 0) +
      Number(fareBreakdown.surgeCharges || 0) +
      Number(fareBreakdown.waitingCharges || 0);

    const effectivePlatform =
      pricingConfig._runtime?.platformFee || pricingConfig.platformFee || {};
    const platformPct = Number(effectivePlatform.percentage || 0);
    fareBreakdown.platformFee = (fareBeforePlatformFee * platformPct) / 100;

    fareBreakdown.breakdown.platformFeeBreakdown = {
      driverShare:
        (fareBreakdown.platformFee *
          Number(effectivePlatform.driverShare || 0)) /
        Math.max(1, platformPct || 1),
      customerShare:
        (fareBreakdown.platformFee *
          Number(effectivePlatform.customerShare || 0)) /
        Math.max(1, platformPct || 1),
    };

    // 9. VAT
    const effectiveVAT = pricingConfig._runtime?.vat ||
      pricingConfig.vat || { enabled: false };
    if (effectiveVAT?.enabled) {
      const fareBeforeVAT = fareBeforePlatformFee + fareBreakdown.platformFee;
      fareBreakdown.vatAmount =
        (fareBeforeVAT * Number(effectiveVAT.percentage || 0)) / 100;
    }

    // 10. Total fare
    fareBreakdown.totalFare =
      Number(fareBreakdown.subtotal || 0) +
      Number(fareBreakdown.nightCharges || 0) +
      Number(fareBreakdown.surgeCharges || 0) +
      Number(fareBreakdown.waitingCharges || 0) +
      Number(fareBreakdown.platformFee || 0) +
      Number(fareBreakdown.vatAmount || 0) +
      Number(fareBreakdown.cancellationCharges || 0);

    // Round to 2 decimals (numbers only)
    Object.keys(fareBreakdown).forEach((key) => {
      if (typeof fareBreakdown[key] === "number") {
        fareBreakdown[key] = Math.round(fareBreakdown[key] * 100) / 100;
      }
    });

    return fareBreakdown;
  } catch (error) {
    throw new Error(`Comprehensive fare calculation error: ${error.message}`);
  }
};

// Export functions
export {
  calculateComprehensiveFare,
  calculateCancellationCharges,
  calculateWaitingCharges,
  calculateFreeStayMinutes,
  shouldShowRefreshmentAlert,
  calculateRefreshmentCharges,
  calculateCarRecoveryFreeStay,
};

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
      "towing services": "towingServices",
      "winching services": "winchingServices",
      "roadside assistance": "roadsideAssistance",
      "specialized/heavy recovery": "specializedHeavyRecovery",
    },
    towingSub: {
      "flatbed towing": "flatbedTowing",
      "wheel lift towing": "wheelLiftTowing",
    },
    winchingSub: {
      "on-road winching": "onRoadWinching",
      "off-road winching": "offRoadWinching",
    },
    roadsideSub: {
      "battery jump start": "batteryJumpStart",
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
    if (srcVal === undefined) return;
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
      if (srcVal === null) return;
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

  const T = MAP_KEYS.carRecovery.categories["towing services"]; // towingServices
  const W = MAP_KEYS.carRecovery.categories["winching services"]; // winchingServices
  const R = MAP_KEYS.carRecovery.categories["roadside assistance"]; // roadsideAssistance
  const S = MAP_KEYS.carRecovery.categories["specialized/heavy recovery"]; // specializedHeavyRecovery

  const desiredCats = {
    [T]: { subCategories: {} },
    [W]: { subCategories: {} },
    [R]: { subCategories: {} },
    [S]: { subCategories: {} },
  };

  const current = (out.serviceTypes = out.serviceTypes || {});

  // Category meta
  desiredCats[T].label = current[T]?.label || "Towing Services";
  desiredCats[T].imageHint = current[T]?.imageHint || "";
  desiredCats[W].label = current[W]?.label || "Winching Services";
  desiredCats[W].imageHint = current[W]?.imageHint || "";
  desiredCats[R].label = current[R]?.label || "Roadside Assistance";
  desiredCats[R].imageHint = current[R]?.imageHint || "";
  desiredCats[S].label = current[S]?.label || "Specialized/Heavy Recovery";
  desiredCats[S].imageHint = current[S]?.imageHint || "";

  const copyLeaf = (src, fallbackLabel) => {
    const dst = {};
    if (!src || typeof src !== "object")
      return { label: fallbackLabel, info: "" };
    [
      "enabled",
      "convenienceFee",
      "baseFare",
      "perKmRate",
      "waitingCharges",
      "nightCharges",
      "surgePricing",
    ].forEach((f) => {
      if (src[f] !== undefined) dst[f] = src[f];
    });
    dst.label = src.label || fallbackLabel || "";
    dst.info = src.info || "";
    return dst;
  };

  // Towing subCategories (support legacy flatbed/wheelLift)
  const towSrc = current[T]?.subCategories || {};
  desiredCats[T].subCategories.flatbedTowing = copyLeaf(
    towSrc.flatbedTowing ?? towSrc.flatbed,
    "Flatbed Towing"
  );
  desiredCats[T].subCategories.wheelLiftTowing = copyLeaf(
    towSrc.wheelLiftTowing ?? towSrc.wheelLift,
    "Wheel Lift Towing"
  );

  // Winching
  const winSrc = current[W]?.subCategories || {};
  desiredCats[W].subCategories.onRoadWinching = copyLeaf(
    winSrc.onRoadWinching,
    "On-Road Winching"
  );
  desiredCats[W].subCategories.offRoadWinching = copyLeaf(
    winSrc.offRoadWinching,
    "Off-Road Winching"
  );

  // Roadside (support legacy jumpstart)
  const roadSrc = current[R]?.subCategories || {};
  desiredCats[R].subCategories.batteryJumpStart = copyLeaf(
    roadSrc.batteryJumpStart ?? roadSrc.jumpstart,
    "Battery Jump Start"
  );
  desiredCats[R].subCategories.fuelDelivery = copyLeaf(
    roadSrc.fuelDelivery,
    "Fuel Delivery"
  );

  // Specialized (support both long/legacy)
  const specSrc = current[S]?.subCategories || {};
  desiredCats[S].subCategories.luxuryExoticCarRecovery = copyLeaf(
    specSrc.luxuryExoticCarRecovery ?? specSrc.luxuryExotic,
    "Luxury & Exotic Car Recovery"
  );
  desiredCats[S].subCategories.accidentCollisionRecovery = copyLeaf(
    specSrc.accidentCollisionRecovery ?? specSrc.accidentCollision,
    "Accident & Collision Recovery"
  );
  desiredCats[S].subCategories.heavyDutyVehicleRecovery = copyLeaf(
    specSrc.heavyDutyVehicleRecovery ?? specSrc.heavyDutyVehicle,
    "Heavy-Duty Vehicle Recovery"
  );
  desiredCats[S].subCategories.basementPullOut = copyLeaf(
    specSrc.basementPullOut,
    "Basement Pull-Out"
  );

  out.serviceTypes = desiredCats;
  return out;
}

function alignShiftingMoversToFlow(sm) {
  if (!sm || typeof sm !== "object") return sm;
  const out = { ...sm };
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
    res.status(200).json({ success: true, data: json });
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
          // Optional UI metadata passthrough
          if (vehicleTypes[vehicleType].label !== undefined) {
            config.serviceTypes.carCab.vehicleTypes[vehicleType].label =
              vehicleTypes[vehicleType].label;
          }
          if (vehicleTypes[vehicleType].info !== undefined) {
            config.serviceTypes.carCab.vehicleTypes[vehicleType].info =
              vehicleTypes[vehicleType].info;
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
    const { enabled, baseFare, perKmRate, vehicleTypes } = req.body;
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

    // Optional UI metadata for bike vehicle types
    if (vehicleTypes) {
      const validBikeTypes = ["economy", "premium", "vip"];
      validBikeTypes.forEach((vt) => {
        if (vehicleTypes[vt]) {
          if (vehicleTypes[vt].label !== undefined) {
            config.serviceTypes.bike.vehicleTypes[vt].label =
              vehicleTypes[vt].label;
          }
          if (vehicleTypes[vt].info !== undefined) {
            config.serviceTypes.bike.vehicleTypes[vt].info =
              vehicleTypes[vt].info;
          }
          if (vehicleTypes[vt].baseFare !== undefined) {
            config.serviceTypes.bike.vehicleTypes[vt].baseFare =
              vehicleTypes[vt].baseFare;
          }
          if (vehicleTypes[vt].perKmRate !== undefined) {
            config.serviceTypes.bike.vehicleTypes[vt].perKmRate =
              vehicleTypes[vt].perKmRate;
          }
        }
      });
    }

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

              // Category display metadata
              if (cat.label !== undefined) dstCat.label = cat.label;
              if (cat.imageHint !== undefined) dstCat.imageHint = cat.imageHint;

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

                  // Subcategory display metadata
                  if (sub.label !== undefined)
                    dstCat.subCategories[mapped].label = sub.label;
                  if (sub.info !== undefined)
                    dstCat.subCategories[mapped].info = sub.info;
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
              if (sub.label !== undefined)
                cab.vehicleTypes[sub.key].label = sub.label;
              if (sub.info !== undefined)
                cab.vehicleTypes[sub.key].info = sub.info;
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
              if (sub.label !== undefined)
                bike.vehicleTypes[sub.key].label = sub.label;
              if (sub.info !== undefined)
                bike.vehicleTypes[sub.key].info = sub.info;
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

// Local mappers for query values -> schema keys
const crMapQuery = {
  category(v) {
    const s = String(v || "").trim();
    const k = s.toLowerCase().replace(/\s+/g, "-");
    if (k === "car-recovery" || k === "car_recovery" || s === "carRecovery")
      return "carRecovery";
    return null;
  },
  service(v) {
    const s = String(v || "").trim();
    const k = s.toLowerCase().replace(/\s+/g, "-");
    if (s === "towingServices" || k === "towing-services" || k === "towing")
      return MAP_KEYS.carRecovery.categories["towing services"];
    if (
      s === "winchingServices" ||
      k === "winching-services" ||
      k === "winching"
    )
      return MAP_KEYS.carRecovery.categories["winching services"];
    if (
      s === "roadsideAssistance" ||
      k === "roadside-assistance" ||
      k === "roadside"
    )
      return MAP_KEYS.carRecovery.categories["roadside assistance"];
    if (
      s === "specializedHeavyRecovery" ||
      k === "specialized-heavy-recovery" ||
      k === "specialized"
    )
      return MAP_KEYS.carRecovery.categories["specialized/heavy recovery"];
    return null;
  },
  subService(v, serviceKey) {
    const s = String(v || "").trim();
    const k = s.toLowerCase().replace(/\s+/g, "-");
    const T = MAP_KEYS.carRecovery.categories["towing services"];
    const W = MAP_KEYS.carRecovery.categories["winching services"];
    const R = MAP_KEYS.carRecovery.categories["roadside assistance"];
    const S = MAP_KEYS.carRecovery.categories["specialized/heavy recovery"];

    if (serviceKey === T) {
      if (s === "flatbedTowing" || k === "flatbed-towing" || k === "flatbed")
        return "flatbedTowing";
      if (
        s === "wheelLiftTowing" ||
        k === "wheel-lift-towing" ||
        k === "wheel-lift"
      )
        return "wheelLiftTowing";
    }
    if (serviceKey === W) {
      if (s === "onRoadWinching" || k === "on-road-winching" || k === "on-road")
        return "onRoadWinching";
      if (
        s === "offRoadWinching" ||
        k === "off-road-winching" ||
        k === "off-road"
      )
        return "offRoadWinching";
    }
    if (serviceKey === R) {
      if (
        s === "batteryJumpStart" ||
        k === "battery-jump-start" ||
        k === "jumpstart"
      )
        return "batteryJumpStart";
      if (s === "fuelDelivery" || k === "fuel-delivery") return "fuelDelivery";
    }
    if (serviceKey === S) {
      if (s === "luxuryExoticCarRecovery" || k.startsWith("luxury-exotic"))
        return "luxuryExoticCarRecovery";
      if (
        s === "accidentCollisionRecovery" ||
        k.startsWith("accident-collision")
      )
        return "accidentCollisionRecovery";
      if (
        s === "heavyDutyVehicleRecovery" ||
        k.startsWith("heavy-duty-vehicle")
      )
        return "heavyDutyVehicleRecovery";
      if (s === "basementPullOut" || k.startsWith("basement-pull"))
        return "basementPullOut";
    }
    return null;
  },
};

// NEW: Shifting & Movers mapper for selective queries
const moversMapQuery = {
  serviceType(v) {
    const s = String(v || "").trim();
    const k = s.toLowerCase().replace(/\s+/g, "-");
    if (
      s === "shiftingMovers" ||
      k === "shifting-movers" ||
      k === "shifting-&-movers" ||
      k === "shifting_-_movers"
    )
      return "shiftingMovers";
    return null;
  },
  categoryKey(v) {
    const k = String(v || "")
      .toLowerCase()
      .trim();
    if (k === "small mover") return "smallMover";
    if (k === "medium mover") return "mediumMover";
    if (k === "heavy mover") return "heavyMover";
    return null;
  },
};

// Ensure path exists and return node reference with defaults + legacy self-heal
function resolveCRNodeByKeys(config, serviceKey, subKey) {
  // Map public/camelCase service keys to schema keys
  const mapServiceKeyToSchema = (k) => {
    if (k === "towingServices") return "towing";
    if (k === "winchingServices") return "winching";
    if (k === "roadsideAssistance") return "roadsideAssistance";
    if (k === "specializedHeavyRecovery") return "specializedHeavyRecovery";
    return k;
  };

  // Map public/camelCase sub keys to schema sub keys under each service
  const mapSubKeyToSchema = (svc, sk) => {
    if (svc === "towing") {
      if (sk === "flatbedTowing" || sk === "flatbed") return "flatbed";
      if (sk === "wheelLiftTowing" || sk === "wheelLift") return "wheelLift";
    }
    if (svc === "winching") {
      if (sk === "onRoadWinching") return "onRoadWinching";
      if (sk === "offRoadWinching") return "offRoadWinching";
    }
    if (svc === "roadsideAssistance") {
      if (sk === "batteryJumpStart" || sk === "jumpstart") return "jumpstart";
      if (sk === "fuelDelivery") return "fuelDelivery";
    }
    if (svc === "specializedHeavyRecovery") {
      if (sk === "luxuryExoticCarRecovery" || sk === "luxuryExotic")
        return "luxuryExotic";
      if (sk === "accidentCollisionRecovery" || sk === "accidentCollision")
        return "accidentCollision";
      if (sk === "heavyDutyVehicleRecovery" || sk === "heavyDutyVehicle")
        return "heavyDutyVehicle";
      if (sk === "basementPullOut") return "basementPullOut";
    }
    return sk;
  };

  // Map schema service to flow container key (legacy)
  const schemaSvcToFlowKey = (svc) => {
    if (svc === "towing") return "towingServices";
    if (svc === "winching") return "winchingServices";
    if (svc === "roadsideAssistance") return "roadsideAssistance";
    if (svc === "specializedHeavyRecovery") return "specializedHeavyRecovery";
    return svc;
  };

  // Legacy alternates present in older docs (used for self-heal)
  const legacyAlternates = (svc, mappedSub) => {
    if (svc === "towing") {
      if (mappedSub === "wheelLift") return ["wheelLiftTowing"];
      if (mappedSub === "flatbed") return ["flatbedTowing"];
    }
    if (svc === "roadsideAssistance") {
      if (mappedSub === "jumpstart") return ["batteryJumpStart"];
    }
    if (svc === "specializedHeavyRecovery") {
      if (mappedSub === "luxuryExotic") return ["luxuryExoticCarRecovery"];
      if (mappedSub === "accidentCollision")
        return ["accidentCollisionRecovery"];
      if (mappedSub === "heavyDutyVehicle") return ["heavyDutyVehicleRecovery"];
    }
    return [];
  };

  const svc = mapServiceKeyToSchema(serviceKey);
  const sub = mapSubKeyToSchema(svc, subKey);

  // Ensure tree containers exist
  config.serviceTypes = config.serviceTypes || {};
  config.serviceTypes.carRecovery = ensureCarRecoveryServiceLevel(
    config.serviceTypes.carRecovery || {}
  );
  const cr = config.serviceTypes.carRecovery;
  cr.serviceTypes = cr.serviceTypes || {};

  // Prefer schema container; if only legacy(flow) exists, read from it without persisting
  const flowKey = schemaSvcToFlowKey(svc);
  let holder = cr.serviceTypes[svc] || cr.serviceTypes[flowKey];
  if (!holder) {
    holder = { subCategories: {} };
    // Do not persist during resolve; just prepare an in-memory holder
    cr.serviceTypes[svc] = holder;
  }
  holder.subCategories = holder.subCategories || {};

  // Resolve legacy: read-only. Do not write or markModified during GET
  let resolvedNode = holder.subCategories[sub];
  if (!resolvedNode || Object.keys(resolvedNode || {}).length === 0) {
    for (const alt of legacyAlternates(svc, sub)) {
      const legacyNode = holder.subCategories[alt];
      if (legacyNode && Object.keys(legacyNode).length > 0) {
        resolvedNode = legacyNode; // response-only; no persistence
        break;
      }
    }
  }

  // Provide defaults so a fresh node isn't an empty object
  const humanize = (s = "") =>
    String(s)
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const ensureLeafDefaults = (leaf, fallbackLabel = "") => {
    // Normalize potential Mongoose subdocument to a plain object first
    let src = leaf && typeof leaf === "object" ? leaf : {};
    if (src && typeof src.toObject === "function") {
      try {
        src = src.toObject({ virtuals: false, getters: false });
      } catch (e) {}
    } else if (src && src._doc && typeof src._doc === "object") {
      src = src._doc;
    }

    const d = { ...src };
    d.label = d.label || fallbackLabel;
    d.info = d.info || "";
    d.enabled = d.enabled ?? false;
    d.convenienceFee = d.convenienceFee ?? 0;

    d.baseFare = d.baseFare || { amount: 0, coverageKm: 0 };
    d.perKmRate = d.perKmRate || {
      afterBaseCoverage: 0,
      cityWiseAdjustment: { enabled: false, aboveKm: 0, adjustedRate: 0 },
    };

    d.waitingCharges = d.waitingCharges || {
      freeMinutes: 0,
      perMinuteRate: 0,
      maximumCharge: 0,
      driverControlPopup: { enabled: false },
    };

    d.nightCharges = d.nightCharges || {
      enabled: false,
      startHour: 22,
      endHour: 6,
      fixedAmount: 0,
      multiplier: 1,
    };

    d.surgePricing = d.surgePricing || {
      enabled: false,
      adminControlled: false,
      noSurge: true,
      surge1_5x: false,
      surge2_0x: false,
      levels: [],
    };

    // Optional leaf-level extras if your model supports them
    if (d.minimumFare == null) d.minimumFare = 0;
    return d;
  };

  // Return ensured leaf for this resolved node, without persisting
  const d = ensureLeafDefaults(resolvedNode, humanize(sub));
  return d;
}

// GET /admin/comprehensive-pricing?category=...&service=...&sub-service=...
// Returns only the requested sub-service leaf; no wrappers; no in-memory writes
const getPricingByQuery = async (req, res, next) => {
  try {
    const q = req.query || {};

    if (q.category === "shiftingMovers") {
      const config = await ComprehensivePricing.findOne({
        isActive: true,
      }).lean();
      if (!config) {
        return res.status(404).json({
          success: false,
          message: "Pricing configuration not found",
        });
      }

      const sm = config.serviceTypes?.shiftingMovers;
      if (!sm) {
        return res.status(404).json({
          success: false,
          message: "Shifting & Movers configuration not found",
        });
      }

      // Map service names
      const serviceMap = {
        small: "smallMover",
        medium: "mediumMover",
        heavy: "heavyMover",
      };

      const serviceKey = serviceMap[q.service] || q.service;

      if (q.service) {
        // Return specific service if requested
        if (!sm.categories?.[serviceKey]) {
          return res.status(404).json({
            success: false,
            message: `Service '${q.service}' not found in Shifting & Movers`,
          });
        }

        // Return the complete pricing structure for the service
        return res.status(200).json({
          success: true,
          data: {
            category: "shiftingMovers",
            service: serviceKey,
            node: {
              ...sm,
              selectedCategory: sm.categories[serviceKey],
            },
          },
        });
      }

      // Return all services if no specific one requested
      return res.status(200).json({
        success: true,
        data: {
          category: "shiftingMovers",
          node: sm,
        },
      });
    }

    // Car Recovery selective GET
    const category = crMapQuery.category(q.category);
    const service = crMapQuery.service(q.service);
    const subService = crMapQuery.subService(
      q["sub-service"] ?? q.subService,
      service
    );

    const anySelectiveProvided =
      q.category != null ||
      q.service != null ||
      q["sub-service"] != null ||
      q.subService != null;
    if (!category || !service || !subService) {
      if (anySelectiveProvided) {
        return res.status(400).json({
          success: false,
          message:
            "Missing or invalid category, service, or sub-service. Expected category=carRecovery, service=towingServices|winchingServices|roadsideAssistance|specializedHeavyRecovery, sub-service per service.",
        });
      }
      // Fallback to full GET (already aligned)
      return getComprehensivePricing(req, res, next);
    }
    if (category !== "carRecovery") {
      return res.status(400).json({
        success: false,
        message: "Only car-recovery is supported in this path",
      });
    }

    const config = await ComprehensivePricing.findOne({
      isActive: true,
    }).lean();
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Comprehensive pricing configuration not found",
      });
    }

    // Map public service/sub-service keys to schema keys
    const mapServiceKeyToSchema = (k) => {
      if (k === "towingServices") return "towing";
      if (k === "winchingServices") return "winching";
      if (k === "roadsideAssistance") return "roadsideAssistance";
      if (k === "specializedHeavyRecovery") return "specializedHeavyRecovery";
      return k;
    };

    const mapSubKeyToSchema = (svc, sk) => {
      if (svc === "towing") {
        if (sk === "flatbedTowing" || sk === "flatbed") return "flatbed";
        if (sk === "wheelLiftTowing" || sk === "wheelLift") return "wheelLift";
      }
      if (svc === "winching") {
        if (sk === "onRoadWinching") return "onRoadWinching";
        if (sk === "offRoadWinching") return "offRoadWinching";
      }
      if (svc === "roadsideAssistance") {
        if (sk === "batteryJumpStart" || sk === "jumpstart") return "jumpstart";
        if (sk === "fuelDelivery") return "fuelDelivery";
      }
      if (svc === "specializedHeavyRecovery") {
        if (sk === "luxuryExoticCarRecovery" || sk === "luxuryExotic")
          return "luxuryExotic";
        if (sk === "accidentCollisionRecovery" || sk === "accidentCollision")
          return "accidentCollision";
        if (sk === "heavyDutyVehicleRecovery" || sk === "heavyDutyVehicle")
          return "heavyDutyVehicle";
        if (sk === "basementPullOut") return "basementPullOut";
      }
      return sk;
    };

    const svcSchema = mapServiceKeyToSchema(service);
    const subSchema = mapSubKeyToSchema(svcSchema, subService);

    const leaf = (((config.serviceTypes || {}).carRecovery || {})
      .serviceTypes || {})[svcSchema]?.subCategories?.[subSchema];
    if (!leaf) {
      return res.status(404).json({
        success: false,
        message: "Requested pricing node not found",
      });
    }
    return res.status(200).json({
      success: true,
      data: leaf,
    });
  } catch (error) {
    console.error("Error in getPricingByQuery:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching pricing node",
      error: error.message,
    });
  }
};

// PUT /admin/comprehensive-pricing?category=...&service=...&sub-service=...
// Updates only the specified node, merges body into that node, returns that node only.
const updatePricingByQuery = async (req, res) => {
  try {
    const q = req.query || {};

    if (q.category === "shiftingMovers") {
      if (!q.service) {
        return res.status(400).json({
          success: false,
          message: "Service parameter is required for Shifting & Movers update",
        });
      }

      // Map service names
      const serviceMap = {
        small: "smallMover",
        medium: "mediumMover",
        heavy: "heavyMover",
      };

      const serviceKey = serviceMap[q.service] || q.service;
      const adminId = req.user?.id || req.user?._id || null;
      const config = await ComprehensivePricing.findOne({ isActive: true });

      if (!config) {
        return res.status(404).json({
          success: false,
          message: "Pricing configuration not found",
        });
      }

      // Initialize if not exists
      if (!config.serviceTypes) config.serviceTypes = {};
      if (!config.serviceTypes.shiftingMovers) {
        config.serviceTypes.shiftingMovers = {
          enabled: true,
          vehicleCost: {
            startFare: 0,
            coverageKm: 0,
            perKmRate: 0,
          },
          basicServices: {},
          pickupLocationPolicy: {},
          dropoffLocationPolicy: {},
          packingFares: {},
          fixingFares: {},
          loadingUnloadingFares: {},
          categories: {
            smallMover: {},
            mediumMover: {},
            heavyMover: {},
          },
        };
      }

      const sm = config.serviceTypes.shiftingMovers;
      const payload = req.body || {};

      // Update the specific service category
      if (!sm.categories) sm.categories = {};
      sm.categories[serviceKey] = {
        ...(sm.categories[serviceKey] || {}),
        ...payload,
        updatedAt: new Date(),
      };

      // If updating the entire config
      if (payload.enabled !== undefined) sm.enabled = payload.enabled;
      if (payload.vehicleCost)
        sm.vehicleCost = { ...(sm.vehicleCost || {}), ...payload.vehicleCost };
      if (payload.basicServices)
        sm.basicServices = {
          ...(sm.basicServices || {}),
          ...payload.basicServices,
        };
      if (payload.pickupLocationPolicy)
        sm.pickupLocationPolicy = {
          ...(sm.pickupLocationPolicy || {}),
          ...payload.pickupLocationPolicy,
        };
      if (payload.dropoffLocationPolicy)
        sm.dropoffLocationPolicy = {
          ...(sm.dropoffLocationPolicy || {}),
          ...payload.dropoffLocationPolicy,
        };
      if (payload.packingFares)
        sm.packingFares = {
          ...(sm.packingFares || {}),
          ...payload.packingFares,
        };
      if (payload.fixingFares)
        sm.fixingFares = { ...(sm.fixingFares || {}), ...payload.fixingFares };
      if (payload.loadingUnloadingFares)
        sm.loadingUnloadingFares = {
          ...(sm.loadingUnloadingFares || {}),
          ...payload.loadingUnloadingFares,
        };

      config.markModified("serviceTypes");
      config.lastUpdatedBy = adminId;
      await config.save();

      return res.status(200).json({
        success: true,
        message: "Shifting & Movers pricing updated successfully",
        data: {
          category: "shiftingMovers",
          service: serviceKey,
          node: sm,
        },
      });
    }

    // Car Recovery
    const category = crMapQuery.category(q.category);
    const service = crMapQuery.service(q.service);
    const subService = crMapQuery.subService(
      q["sub-service"] ?? q.subService,
      service
    );

    if (!category || !service || !subService) {
      return res.status(400).json({
        success: false,
        message: "category, service and sub-service query params are required",
      });
    }
    if (category !== "carRecovery") {
      return res.status(400).json({
        success: false,
        message: "Only car-recovery is supported in this path",
      });
    }

    const adminId = req.user?.id || req.user?._id || null;

    // Map service keys to schema
    const mapServiceKeyToSchema = (k) => {
      if (k === "towingServices") return "towing";
      if (k === "winchingServices") return "winching";
      if (k === "roadsideAssistance") return "roadsideAssistance";
      if (k === "specializedHeavyRecovery") return "specializedHeavyRecovery";
      return k;
    };

    const mapSubKeyToSchema = (svcKey, sk) => {
      if (svcKey === "towing") {
        if (sk === "flatbedTowing" || sk === "flatbed") return "flatbed";
        if (sk === "wheelLiftTowing" || sk === "wheelLift") return "wheelLift";
      }
      if (svcKey === "winching") {
        if (sk === "onRoadWinching") return "onRoadWinching";
        if (sk === "offRoadWinching") return "offRoadWinching";
      }
      if (svcKey === "roadsideAssistance") {
        if (sk === "batteryJumpStart" || sk === "jumpstart") return "jumpstart";
        if (sk === "fuelDelivery") return "fuelDelivery";
      }
      if (svcKey === "specializedHeavyRecovery") {
        if (sk === "luxuryExoticCarRecovery" || sk === "luxuryExotic")
          return "luxuryExotic";
        if (sk === "accidentCollisionRecovery" || sk === "accidentCollision")
          return "accidentCollision";
        if (sk === "heavyDutyVehicleRecovery" || sk === "heavyDutyVehicle")
          return "heavyDutyVehicle";
        if (sk === "basementPullOut") return "basementPullOut";
      }
      return sk;
    };

    const svcSchema = mapServiceKeyToSchema(service);
    const subSchema = mapSubKeyToSchema(svcSchema, subService);
    const dotPath = `serviceTypes.carRecovery.serviceTypes.${svcSchema}.subCategories.${subSchema}`;

    const payload = { ...(req.body || {}) };
    payload.updatedAt = new Date();

    // Directly set the leaf
    const updated = await ComprehensivePricing.findOneAndUpdate(
      { isActive: true },
      {
        $set: {
          [dotPath]: payload,
          lastUpdatedBy: adminId,
          updatedAt: new Date(),
        },
      },
      { new: true, projection: { [dotPath]: 1 } }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Comprehensive pricing configuration not found",
      });
    }

    const updatedLeaf =
      (((updated.serviceTypes || {}).carRecovery || {}).serviceTypes || {})[
        svcSchema
      ]?.subCategories?.[subSchema] || {};

    return res.status(200).json({
      success: true,
      data: updatedLeaf,
    });
  } catch (error) {
    console.error("Error in updatePricingByQuery:", error);
    res.status(500).json({
      success: false,
      message: "Error updating pricing node",
      error: error.message,
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
  getPricingByQuery,
  updatePricingByQuery,
};
