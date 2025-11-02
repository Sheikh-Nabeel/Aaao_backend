import ComprehensivePricing from "../models/comprehensivePricingModel.js";

// Get current time for night charge calculation
const getCurrentHour = () => new Date().getHours();

// Check if current time is within night hours
const isNightTime = (nightCharges) => {
  if (!nightCharges || nightCharges.enabled !== true) return false;
  const currentHour = getCurrentHour();
  const startHour = Number(nightCharges.startHour);
  const endHour = Number(nightCharges.endHour);
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return false;
  if (startHour === endHour) return false;

  if (startHour > endHour) {
    return currentHour >= startHour || currentHour < endHour;
  }
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
  ) {
    return Number(afterArrival || 0);
  }
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

  const calculatedMinutes =
    Number(distance) * Number(freeStayConfig.ratePerKm || 0);
  return Math.min(calculatedMinutes, Number(freeStayConfig.maximumCap || 0));
};

// Helper: find Car Recovery sub-service override
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

// Main comprehensive fare calculation function
const calculateComprehensiveFare = async (bookingData) => {
  try {
    const pricingConfig = await ComprehensivePricing.findOne({
      isActive: true,
    }).lean();
    if (!pricingConfig) {
      throw new Error("Comprehensive pricing configuration not found");
    }

    const {
      serviceType,
      vehicleType,
      distance, // km
      routeType = "one_way",
      demandRatio = 1,
      waitingMinutes = 0,
      tripProgress = 0,
      estimatedDuration = 0,
      isNightTime: isNightTimeParam = false,
      isCancelled = false,
      cancellationReason = null,
      moversOptions = {},
      appointmentOptions = {},
    } = bookingData;

    const normalizedServiceType = String(serviceType || "")
      .replace(/\s+/g, "_")
      .toLowerCase();

    let baseFare = 0;
    let coverageKm = 0;
    let perKmRate = 0;
    let cityWiseAdjustment = { enabled: false };
    let nightChargesConfigToUse = null;

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
        baseFare = Number(pricingConfig.serviceTypes.bike.baseFare || 0);
        perKmRate = Number(pricingConfig.serviceTypes.bike.perKmRate || 0);
      }
    } else if (
      normalizedServiceType === "car_recovery" ||
      serviceType === "car recovery"
    ) {
      const recovery = pricingConfig.serviceTypes?.carRecovery || {};
      baseFare = Number(recovery.baseFare?.amount || 0);
      coverageKm = Number(recovery.baseFare?.coverageKm || 0);
      perKmRate = Number(recovery.perKmRate?.afterBaseCoverage || 0);
      cityWiseAdjustment = recovery.perKmRate?.cityWiseAdjustment || {
        enabled: false,
      };
      nightChargesConfigToUse = recovery.nightCharges?.enabled
        ? recovery.nightCharges
        : null;

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
    } else if (
      normalizedServiceType === "appointment" ||
      serviceType === "appointment"
    ) {
      const appt = pricingConfig.appointmentServices || {};
      if (appt.enabled) baseFare = Number(appt.fixedAppointmentFee || 0);
    }

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

    fareBreakdown.baseFare = Number(baseFare || 0);

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

    fareBreakdown.subtotal =
      Number(fareBreakdown.baseFare || 0) +
      Number(fareBreakdown.distanceFare || 0);

    if (
      normalizedServiceType === "shifting_&_movers" ||
      normalizedServiceType === "shifting_movers" ||
      serviceType === "shifting & movers"
    ) {
      const sm = pricingConfig.serviceTypes?.shiftingMovers || {};
      // If you need movers extras, inject via caller just like admin controller
      // Here we keep subtotal as is to avoid dependency on controller-only helpers
    }

    // EXACT double for two-way/round-trip
    if (routeType === "round_trip" || routeType === "two_way") {
      fareBreakdown.roundTripMultiplier = 2.0;
      fareBreakdown.subtotal *= fareBreakdown.roundTripMultiplier;
    }

    const genericFreeStayMinutes = calculateFreeStayMinutes(
      Number(distance || 0),
      pricingConfig.roundTrip || {}
    );
    if (genericFreeStayMinutes > 0) {
      fareBreakdown.breakdown.freeStayMinutes = genericFreeStayMinutes;
    }

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

    const fareBeforePlatformFee =
      Number(fareBreakdown.subtotal || 0) +
      Number(fareBreakdown.nightCharges || 0) +
      Number(fareBreakdown.surgeCharges || 0) +
      Number(fareBreakdown.waitingCharges || 0);

    const effectivePlatform =
      pricingConfig._runtime?.platformFee || pricingConfig.platformFee || {};
    const platformPct = Number(effectivePlatform.percentage || 0);
    fareBreakdown.platformFee = (fareBeforePlatformFee * platformPct) / 100;

    fareBreakdown.breakdown = {
      ...fareBreakdown.breakdown,
      platformFeeBreakdown: {
        driverShare:
          (fareBreakdown.platformFee *
            Number(effectivePlatform.driverShare || 0)) /
          Math.max(1, platformPct || 1),
        customerShare:
          (fareBreakdown.platformFee *
            Number(effectivePlatform.customerShare || 0)) /
          Math.max(1, platformPct || 1),
      },
    };

    const effectiveVAT = pricingConfig._runtime?.vat ||
      pricingConfig.vat || { enabled: false };
    if (effectiveVAT?.enabled) {
      const fareBeforeVAT = fareBeforePlatformFee + fareBreakdown.platformFee;
      fareBreakdown.vatAmount =
        (fareBeforeVAT * Number(effectiveVAT.percentage || 0)) / 100;
    }

    fareBreakdown.totalFare =
      Number(fareBreakdown.subtotal || 0) +
      Number(fareBreakdown.nightCharges || 0) +
      Number(fareBreakdown.surgeCharges || 0) +
      Number(fareBreakdown.waitingCharges || 0) +
      Number(fareBreakdown.platformFee || 0) +
      Number(fareBreakdown.vatAmount || 0) +
      Number(fareBreakdown.cancellationCharges || 0);

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

export {
  calculateComprehensiveFare,
  calculateCancellationCharges,
  calculateWaitingCharges,
  calculateFreeStayMinutes,
  shouldShowRefreshmentAlert,
  calculateRefreshmentCharges,
  calculateCarRecoveryFreeStay,
};
