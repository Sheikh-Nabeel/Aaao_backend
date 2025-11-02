import mongoose from "mongoose";

const { Schema } = mongoose;

// Helper: build a sub-schema that defaults to {}
const Sub = (shape) => new Schema(shape, { _id: false, minimize: false });

// Reusable tiny subs
const NightChargesSub = Sub({
  enabled: { type: Boolean, default: false },
  startHour: { type: Number, default: 22 },
  endHour: { type: Number, default: 6 },
  fixedAmount: { type: Number, default: 0 },
  multiplier: { type: Number, default: 1 },
});

const CityWiseAdjustSub = Sub({
  enabled: { type: Boolean, default: false },
  aboveKm: { type: Number, default: 0 },
  adjustedRate: { type: Number, default: 0 },
});

const PerKmRateSub = Sub({
  afterBaseCoverage: { type: Number, default: 0 },
  cityWiseAdjustment: { type: CityWiseAdjustSub, default: {} },
});

const BaseFareSub = Sub({
  amount: { type: Number, default: 0 },
  coverageKm: { type: Number, default: 0 },
});

const WaitingChargesSub = Sub({
  freeMinutes: { type: Number, default: 0 },
  perMinuteRate: { type: Number, default: 0 },
  maximumCharge: { type: Number, default: 0 },
});

const SurgeLevelsSub = new Schema(
  {
    demandRatio: { type: Number, default: 2 },
    multiplier: { type: Number, default: 1.5 },
  },
  { _id: false, minimize: false }
);

const SurgePricingSub = Sub({
  enabled: { type: Boolean, default: false },
  adminControlled: { type: Boolean, default: false },
  noSurge: { type: Boolean, default: true },
  surge1_5x: { type: Boolean, default: false },
  surge2_0x: { type: Boolean, default: false },
  levels: { type: [SurgeLevelsSub], default: [] },
});

// Car Cab and Bike per-vehicle sub
const VehicleTypeSub = Sub({
  baseFare: { type: Number, default: 0 },
  perKmRate: { type: Number, default: 0 },
  nightCharges: { type: NightChargesSub, default: {} },
  // Display metadata
  label: { type: String, default: "" },
  info: { type: String, default: "" },
});

// Towing/winching/roadside specialized leaf
const CategoryLeafSub = Sub({
  enabled: { type: Boolean, default: true },
  convenienceFee: { type: Number, default: 0 },
  baseFare: { type: BaseFareSub, default: {} },
  perKmRate: { type: PerKmRateSub, default: {} },
  waitingCharges: { type: WaitingChargesSub, default: {} },
  nightCharges: { type: NightChargesSub, default: {} },
  surgePricing: { type: SurgePricingSub, default: {} },
  // Display metadata
  label: { type: String, default: "" },
  info: { type: String, default: "" },
});

// Car Recovery service-level subs
const PlatformFeeSub = Sub({
  percentage: { type: Number, default: 15 },
  driverShare: { type: Number, default: 7.5 },
  customerShare: { type: Number, default: 7.5 },
});

const CancellationChargesSub = Sub({
  beforeArrival: { type: Number, default: 2 },
  after50PercentDistance: { type: Number, default: 5 },
  afterArrival: { type: Number, default: 10 },
});

const DriverControlPopupSub = Sub({
  enabled: { type: Boolean, default: true },
  popupTitle: {
    type: String,
    default: "Free Stay Time Ended – Select Action",
  },
  driverOptions: Sub({
    continueNoCharges: Sub({
      label: { type: String, default: "Continue – No Overtime Charges" },
      description: {
        type: String,
        default: "Driver is okay to still wait, overtime won't start",
      },
    }),
    startOvertimeCharges: Sub({
      label: { type: String, default: "Start Overtime Charges" },
      description: {
        type: String,
        default: "Driver wants the system to begin charging the customer",
      },
    }),
  }),
  failsafeCondition: Sub({
    autoStart: { type: Boolean, default: false },
    description: {
      type: String,
      default: "System keeps waiting until driver makes a choice",
    },
  }),
});

const CarRecoveryWaitingChargesSub = Sub({
  freeMinutes: { type: Number, default: 5 },
  perMinuteRate: { type: Number, default: 2 },
  maximumCharge: { type: Number, default: 20 },
  driverControlPopup: { type: DriverControlPopupSub, default: {} },
});

const CarRecoveryNightChargesSub = Sub({
  enabled: { type: Boolean, default: true },
  startHour: { type: Number, default: 22 },
  endHour: { type: Number, default: 6 },
  fixedAmount: { type: Number, default: 10 },
  multiplier: { type: Number, default: 1.25 },
  adminConfigurable: { type: Boolean, default: true },
});

const RefreshmentAlertSub = Sub({
  enabled: { type: Boolean, default: true },
  minimumDistance: { type: Number, default: 20 },
  minimumDuration: { type: Number, default: 30 },
  perMinuteCharges: { type: Number, default: 1 },
  per5MinCharges: { type: Number, default: 5 },
  maximumCharges: { type: Number, default: 30 },
  popupTitle: {
    type: String,
    default: "Free Stay Time Ended – Select Action",
  },
  driverOptions: Sub({
    continueNoCharges: {
      type: String,
      default: "Continue – No Overtime Charges",
    },
    startOvertimeCharges: { type: String, default: "Start Overtime Charges" },
  }),
  failsafeCondition: Sub({
    autoStart: { type: Boolean, default: false },
    waitForDriverChoice: { type: Boolean, default: true },
  }),
});

const FreeStayMinutesSub = Sub({
  enabled: { type: Boolean, default: true },
  ratePerKm: { type: Number, default: 0.5 },
  maximumCap: { type: Number, default: 60 },
  notifications: Sub({
    fiveMinRemaining: { type: Boolean, default: true },
    freeStayOver: { type: Boolean, default: true },
  }),
});

const VATDetailSub = Sub({
  enabled: { type: Boolean, default: true },
  countryBased: { type: Boolean, default: true },
  percentage: { type: Number, default: 5 },
  showTotalIncludingTax: { type: Boolean, default: true },
});

// Car Recovery categories containers
const TowingSub = Sub({
  enabled: { type: Boolean, default: true },
  minimumChargesForDriverArriving: { type: Number, default: 5 },
  convenienceFee: Sub({
    options: { type: [Number], default: [50, 100] },
    default: { type: Number, default: 50 },
  }),
  // Display metadata
  label: { type: String, default: "" },
  imageHint: { type: String, default: "" },
  subCategories: Sub({
    flatbed: { type: CategoryLeafSub, default: {} },
    wheelLift: { type: CategoryLeafSub, default: {} },
  }),
});

const WinchingSub = Sub({
  enabled: { type: Boolean, default: true },
  minimumChargesForDriverArriving: { type: Number, default: 5 },
  convenienceFee: Sub({
    options: { type: [Number], default: [50, 100] },
    default: { type: Number, default: 50 },
  }),
  // Display metadata
  label: { type: String, default: "" },
  imageHint: { type: String, default: "" },
  subCategories: Sub({
    onRoadWinching: { type: CategoryLeafSub, default: {} },
    offRoadWinching: { type: CategoryLeafSub, default: {} },
  }),
});

const RoadsideAssistanceSub = Sub({
  enabled: { type: Boolean, default: true },
  minimumChargesForDriverArriving: { type: Number, default: 5 },
  convenienceFee: Sub({
    options: { type: [Number], default: [50, 100] },
    default: { type: Number, default: 50 },
  }),
  // Display metadata
  label: { type: String, default: "" },
  imageHint: { type: String, default: "" },
  subCategories: Sub({
    jumpstart: { type: CategoryLeafSub, default: {} },
    fuelDelivery: { type: CategoryLeafSub, default: {} },
  }),
});

const SpecializedHeavyRecoverySub = Sub({
  enabled: { type: Boolean, default: true },
  minimumChargesForDriverArriving: { type: Number, default: 5 },
  convenienceFee: { type: Number, default: 150 },
  // Display metadata
  label: { type: String, default: "" },
  imageHint: { type: String, default: "" },
  subCategories: Sub({
    luxuryExotic: { type: CategoryLeafSub, default: {} },
    accidentCollision: { type: CategoryLeafSub, default: {} },
    heavyDutyVehicle: { type: CategoryLeafSub, default: {} },
    basementPullOut: { type: CategoryLeafSub, default: {} },
  }),
});

// Shifting & Movers blocks
const VehicleCostSub = Sub({
  startFare: { type: Number, default: 100 },
  coverageKm: { type: Number, default: 5 },
  perKmRate: { type: Number, default: 15 },
});

const BasicServiceUnitSub = Sub({
  flatFee: { type: Number, default: 20 },
  includeInBasicFare: { type: Boolean, default: true },
  baseLimit: { type: Number, default: 3 },
});

const BasicServicesSub = Sub({
  loadingUnloadingHelper: { type: BasicServiceUnitSub, default: {} },
  packers: { type: BasicServiceUnitSub, default: {} },
  fixers: { type: BasicServiceUnitSub, default: {} },
});

const PerFloorFareSub = Sub({
  bed: { type: Number, default: 5 },
  fridge: { type: Number, default: 15 },
  sofa: { type: Number, default: 8 },
  table: { type: Number, default: 4 },
  chair: { type: Number, default: 2 },
  wardrobe: { type: Number, default: 10 },
  washingMachine: { type: Number, default: 12 },
  tv: { type: Number, default: 6 },
  microwave: { type: Number, default: 3 },
  other: { type: Number, default: 5 },
});

const MinorChargeSub = Sub({
  bed: { type: Number, default: 5 },
  fridge: { type: Number, default: 7 },
  sofa: { type: Number, default: 6 },
  table: { type: Number, default: 3 },
  chair: { type: Number, default: 2 },
  wardrobe: { type: Number, default: 8 },
  washingMachine: { type: Number, default: 9 },
  tv: { type: Number, default: 4 },
  microwave: { type: Number, default: 2 },
  other: { type: Number, default: 4 },
});

const PickupPolicySub = Sub({
  groundFloor: Sub({ extraCharge: { type: Number, default: 0 } }),
  stairs: Sub({ perFloorFare: { type: PerFloorFareSub, default: {} } }),
  lift: Sub({
    minorCharge: { type: MinorChargeSub, default: {} },
    baseLimit: { type: Number, default: 1 },
    baseCoverage: { type: String, default: "Ground +1 Floor" },
  }),
});

const DropoffPolicySub = PickupPolicySub; // same structure

const ItemsFareSub = Sub({
  bed: { type: Number, default: 15 },
  fridge: { type: Number, default: 10 },
  sofa: { type: Number, default: 12 },
  table: { type: Number, default: 8 },
  chair: { type: Number, default: 5 },
  wardrobe: { type: Number, default: 20 },
  washingMachine: { type: Number, default: 15 },
  tv: { type: Number, default: 10 },
  microwave: { type: Number, default: 6 },
  other: { type: Number, default: 8 },
});

const FixingFareSub = Sub({
  bed: { type: Number, default: 20 },
  sofa: { type: Number, default: 15 },
  table: { type: Number, default: 10 },
  chair: { type: Number, default: 8 },
  wardrobe: { type: Number, default: 25 },
  washingMachine: { type: Number, default: 30 },
  tv: { type: Number, default: 15 },
  microwave: { type: Number, default: 12 },
  fridge: { type: Number, default: 35 },
  other: { type: Number, default: 15 },
});

const LoadingFareSub = Sub({
  bed: { type: Number, default: 20 },
  sofa: { type: Number, default: 15 },
  table: { type: Number, default: 10 },
  chair: { type: Number, default: 5 },
  wardrobe: { type: Number, default: 18 },
  washingMachine: { type: Number, default: 25 },
  tv: { type: Number, default: 12 },
  microwave: { type: Number, default: 8 },
  fridge: { type: Number, default: 30 },
  other: { type: Number, default: 12 },
});

const MoversCategorySub = Sub({
  label: { type: String, default: "" },
  info: { type: String, default: "" },
  vehicles: { type: [String], default: [] },
});

const MoversCategoriesSub = Sub({
  smallMover: { type: MoversCategorySub, default: {} },
  mediumMover: { type: MoversCategorySub, default: {} },
  heavyMover: { type: MoversCategorySub, default: {} },
});

// Appointment services
const AppointmentQuestionSub = new Schema(
  {
    question: { type: String, default: "" },
    options: { type: [String], default: ["Good", "Bad", "Didn't Visit"] },
  },
  { _id: false, minimize: false }
);

const ConfirmationSystemSub = Sub({
  enabled: { type: Boolean, default: true },
  surveyTimeoutHours: { type: Number, default: 24 },
  autoGpsCheckIn: { type: Boolean, default: true },
  ratingThreshold: { type: Number, default: 3 },
  disputeHandling: Sub({
    enabled: { type: Boolean, default: true },
    adminReviewRequired: { type: Boolean, default: true },
  }),
});

const SuccessCriteriaSub = Sub({
  bothConfirmGood: { type: Boolean, default: true },
  oneConfirmsService: { type: Boolean, default: true },
  noShowBoth: { type: Boolean, default: false },
  conflictResolution: { type: String, default: "admin_review" },
});

const PenaltySystemSub = Sub({
  enabled: { type: Boolean, default: true },
  tooManyNoShows: Sub({
    threshold: { type: Number, default: 3 },
    penalty: { type: String, default: "lower_visibility" },
  }),
  badRatings: Sub({
    threshold: { type: Number, default: 2 },
    consecutiveLimit: { type: Number, default: 3 },
    penalty: { type: String, default: "flag_account" },
  }),
});

// RoundTrip at root
const RoundTripSub = Sub({
  freeStayMinutes: Sub({
    enabled: { type: Boolean, default: true },
    ratePerKm: { type: Number, default: 0.5 },
    maximumMinutes: { type: Number, default: 60 },
  }),
  refreshmentAlert: Sub({
    enabled: { type: Boolean, default: true },
    minimumDistance: { type: Number, default: 20 },
    minimumDuration: { type: Number, default: 30 },
  }),
});

// Comprehensive pricing configuration schema
const comprehensivePricingSchema = new mongoose.Schema(
  {
    // Service type specific rates
    serviceTypes: {
      carCab: {
        enabled: { type: Boolean, default: true },
        vehicleTypes: {
          economy: { type: VehicleTypeSub, default: {} },
          premium: { type: VehicleTypeSub, default: {} },
          luxury: { type: VehicleTypeSub, default: {} },
          xl: { type: VehicleTypeSub, default: {} },
          family: { type: VehicleTypeSub, default: {} },
        },
        minimumFare: { type: Number, default: 40 },
      },

      bike: {
        enabled: { type: Boolean, default: true },
        vehicleTypes: {
          economy: { type: VehicleTypeSub, default: {} },
          premium: { type: VehicleTypeSub, default: {} },
          vip: { type: VehicleTypeSub, default: {} },
        },
        minimumFare: { type: Number, default: 15 },
        baseFare: { type: Number, default: 25 },
        perKmRate: { type: Number, default: 4 },
      },

      carRecovery: {
        enabled: { type: Boolean, default: true },

        baseFare: { type: BaseFareSub, default: {} },
        perKmRate: {
          type: Sub({
            afterBaseCoverage: { type: Number, default: 7.5 },
            cityWiseAdjustment: {
              type: Sub({
                enabled: { type: Boolean, default: true },
                aboveKm: { type: Number, default: 10 },
                adjustedRate: { type: Number, default: 5 },
              }),
              default: {},
            },
          }),
          default: {},
        },
        minimumFare: { type: Number, default: 50 },
        platformFee: { type: PlatformFeeSub, default: {} },
        cancellationCharges: { type: CancellationChargesSub, default: {} },
        waitingCharges: { type: CarRecoveryWaitingChargesSub, default: {} },
        nightCharges: { type: CarRecoveryNightChargesSub, default: {} },
        surgePricing: {
          type: Sub({
            enabled: { type: Boolean, default: true },
            adminControlled: { type: Boolean, default: true },
            noSurge: { type: Boolean, default: true },
            surge1_5x: { type: Boolean, default: false },
            surge2_0x: { type: Boolean, default: false },
            levels: {
              type: [
                new Schema(
                  {
                    demandRatio: { type: Number, default: 2 },
                    multiplier: { type: Number, default: 1.5 },
                  },
                  { _id: false, minimize: false }
                ),
              ],
              default: [
                { demandRatio: 2, multiplier: 1.5 },
                { demandRatio: 3, multiplier: 2.0 },
              ],
            },
          }),
          default: {},
        },

        serviceTypes: {
          towing: { type: TowingSub, default: {} },
          winching: { type: WinchingSub, default: {} },
          roadsideAssistance: { type: RoadsideAssistanceSub, default: {} },
          specializedHeavyRecovery: {
            type: SpecializedHeavyRecoverySub,
            default: {},
          },
          // Optional: Key Unlocker Services (kept for backward compatibility)
          keyUnlockerServices: {
            type: Sub({
              enabled: { type: Boolean, default: true },
              minimumChargesForDriverArriving: { type: Number, default: 5 },
              convenienceFee: { type: Number, default: 75 },
              baseFare: { type: BaseFareSub, default: {} },
              perKmRate: { type: PerKmRateSub, default: {} },
              waitingCharges: { type: WaitingChargesSub, default: {} },
              nightCharges: { type: NightChargesSub, default: {} },
              surgePricing: { type: SurgePricingSub, default: {} },
            }),
            default: {},
          },
        },

        refreshmentAlert: { type: RefreshmentAlertSub, default: {} },
        freeStayMinutes: { type: FreeStayMinutesSub, default: {} },
        vat: { type: VATDetailSub, default: {} },
      },

      shiftingMovers: {
        enabled: { type: Boolean, default: true },
        categories: { type: MoversCategoriesSub, default: {} },
        vehicleCost: { type: VehicleCostSub, default: {} },
        basicServices: { type: BasicServicesSub, default: {} },
        pickupLocationPolicy: { type: PickupPolicySub, default: {} },
        dropoffLocationPolicy: { type: DropoffPolicySub, default: {} },
        packingFares: { type: ItemsFareSub, default: {} },
        fixingFares: { type: FixingFareSub, default: {} },
        loadingUnloadingFares: { type: LoadingFareSub, default: {} },
      },
    },

    // Appointment-based services (Workshop, Tyre Shop, etc.)
    appointmentServices: {
      enabled: { type: Boolean, default: true },
      fixedAppointmentFee: { type: Number, default: 5 },
      confirmationSystem: { type: ConfirmationSystemSub, default: {} },
      customerSurvey: Sub({
        questions: {
          type: [AppointmentQuestionSub],
          default: [
            {
              question: "How was your experience with [Service Provider Name]?",
              options: ["Good", "Bad", "Didn't Visit"],
            },
          ],
        },
        ratingRequired: { type: Boolean, default: true },
        feedbackOptional: { type: Boolean, default: true },
      }),
      providerSurvey: Sub({
        questions: {
          type: [AppointmentQuestionSub],
          default: [
            {
              question: "How was [Customer Name]? Behavior?",
              options: ["Good", "Bad", "Didn't Meet Yet"],
            },
          ],
        },
        ratingRequired: { type: Boolean, default: true },
        feedbackOptional: { type: Boolean, default: true },
      }),
      successCriteria: { type: SuccessCriteriaSub, default: {} },
      penaltySystem: { type: PenaltySystemSub, default: {} },
    },

    // Round trip features
    roundTrip: { type: RoundTripSub, default: {} },

    // VAT (root – non-pricing settings, keep as-is)
    vat: {
      enabled: { type: Boolean, default: true },
      percentage: { type: Number, default: 5 },
    },

    // Currency and general settings
    currency: { type: String, default: "AED" },
    isActive: { type: Boolean, default: true },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    minimize: false, // keep empty objects so controllers can safely initialize
  }
);

// Indexes for better performance
comprehensivePricingSchema.index({ isActive: 1 });
comprehensivePricingSchema.index({ "serviceTypes.carCab.enabled": 1 });
comprehensivePricingSchema.index({ "serviceTypes.bike.enabled": 1 });
comprehensivePricingSchema.index({ "serviceTypes.carRecovery.enabled": 1 });
comprehensivePricingSchema.index({ "serviceTypes.shiftingMovers.enabled": 1 });
comprehensivePricingSchema.index({ "appointmentServices.enabled": 1 });

const ComprehensivePricing = mongoose.model(
  "ComprehensivePricing",
  comprehensivePricingSchema
);

export default ComprehensivePricing;
