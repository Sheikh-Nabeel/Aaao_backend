import ComprehensivePricing from "../models/comprehensivePricingModel.js";

// Get current time for night charge calculation
const getCurrentHour = () => {
  return new Date().getHours();
};

// Check if current time is within night hours
const isNightTime = (nightCharges) => {
  const currentHour = getCurrentHour();
  const { startHour, endHour } = nightCharges;

  if (startHour > endHour) {
    // Night time spans midnight (e.g., 22:00 to 06:00)
    return currentHour >= startHour || currentHour < endHour;
  } else {
    // Night time within same day
    return currentHour >= startHour && currentHour < endHour;
  }
};

// Calculate surge multiplier based on demand
const calculateSurgeMultiplier = (demandRatio, surgePricing) => {
  if (!surgePricing?.enabled) return 1;

  // Find appropriate surge level
  const surgeLevel = (surgePricing.levels || [])
    .slice()
    .sort((a, b) => b.demandRatio - a.demandRatio)
    .find((level) => demandRatio >= level.demandRatio);

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

  if (waitingMinutes <= freeMinutes) return 0;

  const chargeableMinutes = Math.max(0, waitingMinutes - freeMinutes);
  const calculatedCharge = chargeableMinutes * perMinuteRate;

  return Math.min(calculatedCharge, maximumCharge);
};

// Calculate free stay minutes for round trips
const calculateFreeStayMinutes = (distance, roundTripConfig) => {
  if (!roundTripConfig?.freeStayMinutes?.enabled) return 0;

  const calculatedMinutes =
    distance * Number(roundTripConfig.freeStayMinutes.ratePerKm || 0);
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
      distance >=
        Number(recoveryConfig.refreshmentAlert.minimumDistance || 0) ||
      estimatedDuration >=
        Number(recoveryConfig.refreshmentAlert.minimumDuration || 0)
    );
  }

  // Default logic for other services
  if (!roundTripConfig?.refreshmentAlert?.enabled) return false;

  return (
    distance >= Number(roundTripConfig.refreshmentAlert.minimumDistance || 0) ||
    estimatedDuration >=
      Number(roundTripConfig.refreshmentAlert.minimumDuration || 0)
  );
};

// Calculate refreshment/overtime charges for car recovery
const calculateRefreshmentCharges = (overtimeMinutes, refreshmentConfig) => {
  if (!refreshmentConfig?.enabled || overtimeMinutes <= 0) return 0;

  // Calculate charges based on per minute or per 5-minute blocks
  const perMinuteCharge =
    overtimeMinutes * Number(refreshmentConfig.perMinuteCharges || 0);
  const per5MinCharge =
    Math.ceil(overtimeMinutes / 5) *
    Number(refreshmentConfig.per5MinCharges || 0);

  // Use the configured charging method (assuming per minute for now)
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

  const calculatedMinutes = distance * Number(freeStayConfig.ratePerKm || 0);
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
    });
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
      currency: pricingConfig.currency,
      breakdown: {},
      alerts: [],
    };

    // 1. Calculate base fare and distance fare
    let baseFare = Number(pricingConfig.baseFare.amount || 0);
    let perKmRate = Number(pricingConfig.perKmRate.afterBaseCoverage || 0);
    let nightChargesConfigToUse = pricingConfig.nightCharges;

    // Service-specific adjustments (normalize service type)
    const normalizedServiceType = String(serviceType || "")
      .replace(/\s+/g, "_")
      .toLowerCase();

    // Car Cab
    if (
      (normalizedServiceType === "car_cab" || serviceType === "car cab") &&
      pricingConfig.serviceTypes?.carCab?.enabled
    ) {
      const vehicleConfig =
        pricingConfig.serviceTypes.carCab.vehicleTypes?.[vehicleType];
      if (vehicleConfig) {
        baseFare = Number(vehicleConfig.baseFare || 0);
        perKmRate = Number(vehicleConfig.perKmRate || 0);
        if (vehicleConfig.nightCharges?.enabled) {
          nightChargesConfigToUse = vehicleConfig.nightCharges;
        }
      }

      // Bike
    } else if (
      serviceType === "bike" &&
      pricingConfig.serviceTypes?.bike?.enabled
    ) {
      const vehicleConfig =
        pricingConfig.serviceTypes.bike.vehicleTypes?.[vehicleType];

      if (vehicleConfig) {
        baseFare = Number(vehicleConfig.baseFare || 0);
        perKmRate = Number(vehicleConfig.perKmRate || 0);
        if (vehicleConfig.nightCharges?.enabled) {
          nightChargesConfigToUse = vehicleConfig.nightCharges;
        }
      } else {
        baseFare = Number(pricingConfig.serviceTypes.bike.baseFare || 0);
        perKmRate = Number(pricingConfig.serviceTypes.bike.perKmRate || 0);
      }

      // Car Recovery (with sub-service overrides)
    } else if (
      normalizedServiceType === "car_recovery" ||
      serviceType === "car recovery"
    ) {
      const recoveryConfig = pricingConfig.serviceTypes?.carRecovery || {};
      const sub = getCRSubOverride(recoveryConfig, vehicleType);

      if (sub) {
        // Scope-specific minimum driver-arrival fee (by scope: towing/winching/roadside)
        const scopeMinArriving = Number(
          recoveryConfig?.serviceTypes?.[sub.scope]
            ?.minimumChargesForDriverArriving || 0
        );

        // Sub convenience fee
        const convenienceFee = Number(sub.block?.convenienceFee || 0);

        // Prefer explicit sub-service base fare when provided
        const subBaseAmount = Number(sub.block?.baseFare?.amount || 0);
        if (subBaseAmount > 0) {
          baseFare = subBaseAmount + convenienceFee; // e.g., 70 + 100 = 170
        } else {
          baseFare = scopeMinArriving + convenienceFee; // fallback
        }

        fareBreakdown.baseFare = baseFare;
        fareBreakdown.distanceFare = 0;
        fareBreakdown.breakdown.convenienceFee = convenienceFee;
        fareBreakdown.breakdown.minimumDriverCharges = scopeMinArriving;
        fareBreakdown.breakdown.usedSubService = String(
          vehicleType || sub.scope || ""
        );

        // Effective overrides for coverage/per-km/city-wise
        const effCoverageKm =
          sub.block?.baseFare?.coverageKm ??
          recoveryConfig.baseFare?.coverageKm ??
          pricingConfig.baseFare.coverageKm;

        const effPerKm =
          sub.block?.perKmRate?.afterBaseCoverage ??
          recoveryConfig.perKmRate?.afterBaseCoverage ??
          pricingConfig.perKmRate.afterBaseCoverage;

        const effCityWise =
          sub.block?.perKmRate?.cityWiseAdjustment ??
          recoveryConfig.perKmRate?.cityWiseAdjustment ??
          pricingConfig.perKmRate.cityWiseAdjustment;

        pricingConfig.baseFare.coverageKm = Number(effCoverageKm || 0);
        perKmRate = Number(effPerKm || 0);
        pricingConfig.perKmRate.cityWiseAdjustment = effCityWise || {
          enabled: false,
        };

        // Waiting/night/surge overrides
        pricingConfig.waitingCharges =
          sub.block?.waitingCharges || recoveryConfig.waitingCharges || {};
        nightChargesConfigToUse =
          sub.block?.nightCharges || recoveryConfig.nightCharges || {};
        pricingConfig.surgePricing =
          sub.block?.surgePricing || recoveryConfig.surgePricing || {};

        // Service-level policies
        pricingConfig.minimumFare = Number(recoveryConfig.minimumFare || 0);
        pricingConfig.platformFee = recoveryConfig.platformFee || {};
        pricingConfig.cancellationCharges =
          recoveryConfig.cancellationCharges || {};

        // VAT override
        if (recoveryConfig.vat?.enabled) {
          pricingConfig.vat = recoveryConfig.vat;
        }
      } else {
        baseFare = Number(recoveryConfig.baseFare?.amount || 0);
        perKmRate = Number(recoveryConfig.perKmRate?.afterBaseCoverage || 0);

        pricingConfig.perKmRate.cityWiseAdjustment =
          recoveryConfig.perKmRate?.cityWiseAdjustment ||
          pricingConfig.perKmRate.cityWiseAdjustment;

        pricingConfig.baseFare.coverageKm = Number(
          recoveryConfig.baseFare?.coverageKm ||
            pricingConfig.baseFare.coverageKm
        );
        pricingConfig.minimumFare = Number(recoveryConfig.minimumFare || 0);
        pricingConfig.platformFee = recoveryConfig.platformFee || {};
        pricingConfig.cancellationCharges =
          recoveryConfig.cancellationCharges || {};
        pricingConfig.waitingCharges = recoveryConfig.waitingCharges || {};
        nightChargesConfigToUse = recoveryConfig.nightCharges || {};
        pricingConfig.surgePricing = recoveryConfig.surgePricing || {};
        if (recoveryConfig.vat?.enabled) {
          pricingConfig.vat = recoveryConfig.vat;
        }
      }

      // Shifting & Movers (full support)
    } else if (
      normalizedServiceType === "shifting_&_movers" ||
      normalizedServiceType === "shifting_movers" ||
      serviceType === "shifting & movers"
    ) {
      const sm = pricingConfig.serviceTypes?.shiftingMovers || {};
      const vc = sm.vehicleCost || {};
      const startFare = Number(vc.startFare || 0);
      const coverageKm = Number(vc.coverageKm || 0);
      const moversPerKm = Number(vc.perKmRate || 0);

      // Base + distance for movers
      baseFare = startFare;
      perKmRate = moversPerKm;
      pricingConfig.baseFare.coverageKm = coverageKm;

      // Distance fare (computed below with the generic logic)

      // Extras from basic services, pickup/dropoff policies, and per-item fares
      const moversExtras = computeShiftingMoversExtras(
        pricingConfig,
        moversOptions
      );
      if (moversExtras > 0) {
        // Track details
        fareBreakdown.breakdown.shiftingMoversExtras = moversExtras;
      }

      // Apply movers extras directly into subtotal after base+distance
      // We add it later after distance fare is computed by the common path.

      // Movers do not specify special night/surge/waiting overrides -> use global/top-level

      // Appointment services (optional, fixed fee)
    } else if (
      normalizedServiceType === "appointment" ||
      serviceType === "appointment"
    ) {
      const appt = pricingConfig.appointmentServices || {};
      if (appt.enabled) {
        baseFare = Number(appt.fixedAppointmentFee || 0);
        // You can extend this branch if you want to use rating thresholds and penalties in pricing.
      }
    }

    // Base fare
    fareBreakdown.baseFare = Number(baseFare || 0);

    // Calculate distance fare
    if (distance > Number(pricingConfig.baseFare.coverageKm || 0)) {
      let remainingDistance =
        Number(distance) - Number(pricingConfig.baseFare.coverageKm || 0);

      // City-wise pricing adjustment
      const cwa = pricingConfig.perKmRate?.cityWiseAdjustment || {};
      if (cwa.enabled && Number(distance) > Number(cwa.aboveKm || Infinity)) {
        const adjustmentPoint =
          Number(cwa.aboveKm || 0) -
          Number(pricingConfig.baseFare.coverageKm || 0);

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

    // Calculate subtotal before additional charges
    fareBreakdown.subtotal =
      Number(fareBreakdown.baseFare || 0) +
      Number(fareBreakdown.distanceFare || 0);

    // If Shifting & Movers, add computed extras now
    if (
      normalizedServiceType === "shifting_&_movers" ||
      normalizedServiceType === "shifting_movers" ||
      serviceType === "shifting & movers"
    ) {
      const add = Number(fareBreakdown.breakdown?.shiftingMoversExtras || 0);
      fareBreakdown.subtotal += add;
    }

    // Apply route type multiplier for round trips (exclude car recovery)
    if (
      (routeType === "round_trip" || routeType === "two_way") &&
      serviceType !== "car recovery"
    ) {
      fareBreakdown.roundTripMultiplier = 1.8;
      fareBreakdown.subtotal *= fareBreakdown.roundTripMultiplier;
    }

    // Calculate free stay minutes
    const freeStayMinutes = calculateFreeStayMinutes(
      Number(distance || 0),
      pricingConfig.roundTrip || {}
    );
    if (freeStayMinutes > 0) {
      fareBreakdown.breakdown.freeStayMinutes = freeStayMinutes;
    }

    // Check for refreshment alert
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

    // Car recovery free stay minutes
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

    // 2. Apply minimum fare (service-specific)
    let minimumFare = Number(pricingConfig.minimumFare || 0);

    if (
      serviceType === "car_cab" &&
      pricingConfig.serviceTypes?.carCab?.minimumFare != null
    ) {
      minimumFare = Number(pricingConfig.serviceTypes.carCab.minimumFare || 0);
    } else if (
      serviceType === "bike" &&
      pricingConfig.serviceTypes?.bike?.minimumFare != null
    ) {
      minimumFare = Number(pricingConfig.serviceTypes.bike.minimumFare || 0);
    } else if (
      (normalizedServiceType === "car_recovery" ||
        serviceType === "car recovery") &&
      pricingConfig.serviceTypes?.carRecovery?.minimumFare != null
    ) {
      minimumFare = Number(
        pricingConfig.serviceTypes.carRecovery.minimumFare || 0
      );
    } else if (
      serviceType === "shifting & movers" &&
      pricingConfig.serviceTypes?.shiftingMovers?.vehicleCost?.startFare != null
    ) {
      // Usually startFare already applied as base, but minimum safeguard:
      minimumFare = Math.max(
        minimumFare,
        Number(
          pricingConfig.serviceTypes.shiftingMovers.vehicleCost.startFare || 0
        )
      );
    }

    if (fareBreakdown.subtotal < minimumFare) {
      fareBreakdown.subtotal = minimumFare;
      fareBreakdown.breakdown.minimumFareApplied = true;
    }

    // 3. Night charges (top-level or overridden per-vehicle/per-subservice)
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

    // 4. Surge pricing
    if (pricingConfig.surgePricing?.enabled && Number(demandRatio || 1) > 1) {
      const surgeMultiplier = calculateSurgeMultiplier(
        Number(demandRatio || 1),
        pricingConfig.surgePricing
      );
      if (surgeMultiplier > 1) {
        fareBreakdown.surgeCharges =
          fareBreakdown.subtotal * (surgeMultiplier - 1);
        fareBreakdown.breakdown.surgeMultiplier = surgeMultiplier;
        fareBreakdown.breakdown.demandRatio = Number(demandRatio || 1);
      }
    }

    // 5. Waiting charges
    if (Number(waitingMinutes || 0) > 0) {
      fareBreakdown.waitingCharges = calculateWaitingCharges(
        Number(waitingMinutes || 0),
        pricingConfig.waitingCharges || {}
      );
    }

    // 6. Cancellation charges
    if (isCancelled) {
      fareBreakdown.cancellationCharges = calculateCancellationCharges(
        tripProgress,
        cancellationReason,
        pricingConfig.cancellationCharges || {}
      );
    }

    // 7. Platform fee
    const fareBeforePlatformFee =
      Number(fareBreakdown.subtotal || 0) +
      Number(fareBreakdown.nightCharges || 0) +
      Number(fareBreakdown.surgeCharges || 0) +
      Number(fareBreakdown.waitingCharges || 0);

    const platformPct = Number(pricingConfig.platformFee?.percentage || 0);
    fareBreakdown.platformFee = (fareBeforePlatformFee * platformPct) / 100;

    fareBreakdown.breakdown.platformFeeBreakdown = {
      driverShare:
        (fareBreakdown.platformFee *
          Number(pricingConfig.platformFee?.driverShare || 0)) /
        Math.max(1, platformPct),
      customerShare:
        (fareBreakdown.platformFee *
          Number(pricingConfig.platformFee?.customerShare || 0)) /
        Math.max(1, platformPct),
    };

    // 8. VAT
    if (pricingConfig.vat?.enabled) {
      const fareBeforeVAT = fareBeforePlatformFee + fareBreakdown.platformFee;
      fareBreakdown.vatAmount =
        (fareBeforeVAT * Number(pricingConfig.vat.percentage || 0)) / 100;
    }

    // 9. Total fare
    fareBreakdown.totalFare =
      Number(fareBreakdown.subtotal || 0) +
      Number(fareBreakdown.nightCharges || 0) +
      Number(fareBreakdown.surgeCharges || 0) +
      Number(fareBreakdown.waitingCharges || 0) +
      Number(fareBreakdown.platformFee || 0) +
      Number(fareBreakdown.vatAmount || 0) +
      Number(fareBreakdown.cancellationCharges || 0);

    // Round to 2 decimals
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
