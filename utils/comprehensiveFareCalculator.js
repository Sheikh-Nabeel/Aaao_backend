import ComprehensivePricing from "../models/comprehensivePricingModel.js";

// Get current time for night charge calculation
const getCurrentHour = () => {
  return new Date().getHours();
};

// Check if current time is within night hours
const isNightTime = (nightCharges) => {
  if (!nightCharges || nightCharges.enabled !== true) return false;
  const currentHour = getCurrentHour();
  const startHour = Number(nightCharges.startHour);
  const endHour = Number(nightCharges.endHour);
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return false;

  if (startHour === endHour) return false; // treat as disabled

  if (startHour > endHour) {
    // Night spans midnight (e.g., 22 -> 06)
    return currentHour >= startHour || currentHour < endHour;
  } else {
    // Same day window
    return currentHour >= startHour && currentHour < endHour;
  }
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

  // No charge for driver cancellations
  if (cancellationReason === "driver_cancelled") return 0;

  // Customer cancellation charges based on trip progress
  if (
    cancellationReason === "customer_cancelled_after_arrival" ||
    tripProgress === "arrived"
  ) {
    return Number(afterArrival || 0);
  }
  if (Number(tripProgress) >= 0.5) return Number(after50PercentDistance || 0);
  if (Number(tripProgress) >= 0.25) return Number(after25PercentDistance || 0);

  // Default charge for early customer cancellation
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

  const calculatedMinutes =
    Number(distance) * Number(roundTripConfig.freeStayMinutes.ratePerKm || 0);
  return Math.min(
    calculatedMinutes,
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
  // For car recovery services, use specific refreshment alert config
  if (
    serviceType === "car recovery" &&
    recoveryConfig &&
    recoveryConfig.refreshmentAlert
  ) {
    if (!recoveryConfig.refreshmentAlert.enabled) return false;
    return (
      Number(distance) >=
        Number(recoveryConfig.refreshmentAlert.minimumDistance || 0) ||
      Number(estimatedDuration) >=
        Number(recoveryConfig.refreshmentAlert.minimumDuration || 0)
    );
  }

  // Default logic for other services
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

  // Calculate charges based on per minute or per 5-minute blocks
  const perMinuteCharge =
    Number(overtimeMinutes) * Number(refreshmentConfig.perMinuteCharges || 0);
  // For now we keep per-minute; if desired, switch to per-5-min:
  // const per5MinCharge = Math.ceil(overtimeMinutes / 5) * Number(refreshmentConfig.per5MinCharges || 0);

  const calculatedCharge = perMinuteCharge;

  // Apply maximum charge cap
  return Math.min(
    calculatedCharge,
    Number(refreshmentConfig.maximumCharges || Infinity)
  );
};

// Calculate free stay minutes for car recovery round trips
const calculateCarRecoveryFreeStay = (distance, freeStayConfig) => {
  if (!freeStayConfig?.enabled) return 0;

  const calculatedMinutes =
    Number(distance) * Number(freeStayConfig.ratePerKm || 0);
  return Math.min(calculatedMinutes, Number(freeStayConfig.maximumCap || 0));
};

// Helper: find Car Recovery sub-service override (towing/winching/roadside/keyUnlocker)
const getCRSubOverride = (recoveryConfig, vehicleType) => {
  if (!vehicleType || !recoveryConfig?.serviceTypes) return null;

  const towing =
    recoveryConfig.serviceTypes.towing?.subCategories?.[vehicleType];
  const winching =
    recoveryConfig.serviceTypes.winching?.subCategories?.[vehicleType];
  const roadside =
    recoveryConfig.serviceTypes.roadsideAssistance?.subCategories?.[
      vehicleType
    ];

  if (towing) return { scope: "towing", block: towing };
  if (winching) return { scope: "winching", block: winching };
  if (roadside) return { scope: "roadside", block: roadside };

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

  // 1) Basic services (flat fee if selected)
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

  // 2) Pickup/Drop-off policies
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

  // Pickup
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

  // Drop-off
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

  // 3) Packing per item
  const packingItems = moversOptions.packingItems || {};
  const packingFares = sm.packingFares || {};
  extras += multiplyItems(packingItems, packingFares);

  // 4) Fixing per item
  const fixingItems = moversOptions.fixingItems || {};
  const fixingFares = sm.fixingFares || {};
  extras += multiplyItems(fixingItems, fixingFares);

  // 5) Loading/Unloading per item
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
      distance, // in km
      routeType = "one_way",
      demandRatio = 1,
      waitingMinutes = 0,
      tripProgress = 0,
      estimatedDuration = 0,
      isNightTime: isNightTimeParam = false,
      isCancelled = false,
      cancellationReason = null,
      // Optional service-specific inputs
      moversOptions = {}, // for shifting & movers
      appointmentOptions = {}, // for appointment services (if you choose to use it)
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

      // Optional sub-service overrides driven by vehicleType key (e.g., flatbed, wheelLift, jumpstart, fuelDelivery)
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

    // Round trip multiplier (exclude car recovery)
    if (
      (routeType === "round_trip" || routeType === "two_way") &&
      serviceType !== "car recovery"
    ) {
      fareBreakdown.roundTripMultiplier = 1.8;
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
