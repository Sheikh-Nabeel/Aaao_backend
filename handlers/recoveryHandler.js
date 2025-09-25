import {
  WS_EVENTS,
  VEHICLE_TYPES,
  ERROR_CODES,
  SERVICE_TYPES,
} from "../constants/websocketEvents.js";
import logger from "../utils/logger.js";
import PricingConfig from "../models/pricingModel.js";
import ComprehensivePricing from "../models/comprehensivePricingModel.js";
import FareCalculator from "../utils/fareCalculator.js";
import Booking from "../models/bookingModel.js";
import User from "../models/userModel.js";
import { v4 as uuidv4 } from "uuid";

// Service sub-types
const SERVICE_SUB_TYPES = {
  // Towing
  FLATBED_TOWING: "flatbed_towing",
  WHEEL_LIFT_TOWING: "wheel_lift_towing",

  // Winching
  ON_ROAD_WINCHING: "on_road_winching",
  OFF_ROAD_WINCHING: "off_road_winching",

  // Roadside Assistance
  BATTERY_JUMP_START: "battery_jump_start",
  FUEL_DELIVERY: "fuel_delivery",

  // Specialized Recovery
  LUXURY_CAR_RECOVERY: "luxury_car_recovery",
  ACCIDENT_RECOVERY: "accident_recovery",
  HEAVY_DUTY_RECOVERY: "heavy_duty_recovery",
  BASEMENT_PULL_OUT: "basement_pull_out",
};

// Service configuration with base prices and rules
const SERVICE_CONFIG = {
  [SERVICE_TYPES.TOWING]: {
    basePrice: 50, // AED for first 6km
    perKmPrice: 7.5,
    minDistance: 6, // km
    minPrice: 50,
    availableSubTypes: [
      SERVICE_SUB_TYPES.FLATBED_TOWING,
      SERVICE_SUB_TYPES.WHEEL_LIFT_TOWING,
    ],
  },
  [SERVICE_TYPES.WINCHING]: {
    basePrice: 100, // AED for first 5km
    perKmPrice: 10,
    minDistance: 5, // km
    minPrice: 100,
    availableSubTypes: [
      SERVICE_SUB_TYPES.ON_ROAD_WINCHING,
      SERVICE_SUB_TYPES.OFF_ROAD_WINCHING,
    ],
  },
  [SERVICE_TYPES.ROADSIDE_ASSISTANCE]: {
    basePrice: 35, // Flat fee for standard assistance
    perKmPrice: 0,
    minDistance: 0,
    minPrice: 35,
    availableSubTypes: [
      SERVICE_SUB_TYPES.BATTERY_JUMP_START,
      SERVICE_SUB_TYPES.FUEL_DELIVERY,
    ],
  },
  [SERVICE_TYPES.KEY_UNLOCK]: {
    basePrice: 45, // Flat fee for key unlock
    perKmPrice: 0,
    minDistance: 0,
    minPrice: 45,
    availableSubTypes: [],
  },
};

// Pink captain configuration
const PINK_CAPTAIN_CONFIG = {
  premiumMultiplier: 1.1, // 10% premium for pink captain
  allowedServices: [
    SERVICE_TYPES.ROADSIDE_ASSISTANCE,
    SERVICE_TYPES.KEY_UNLOCK,
  ],
};

// Constants for cancellation fees (in AED)
const CANCELLATION_FEES = {
  before25Percent: 2, // AED 2 if cancelled before driver reaches 25% of the distance
  after50Percent: 5, // AED 5 if cancelled after driver has gone more than 50% of the distance
  afterArrival: 10, // AED 10 if cancelled after driver arrives at pickup location
};

// Constants for waiting charges (in AED)
const WAITING_CHARGES = {
  freeMinutes: 5, // 5 minutes free waiting time
  perMinuteCharge: 2, // AED 2 per minute after free period
  maxCharge: 20, // Maximum waiting charge of AED 20
};

class RecoveryHandler {
  constructor(webSocketService, fareCalculator = new FareCalculator()) {
    this.webSocketService = webSocketService;
    this.fareCalculator = fareCalculator;
    this.activeRecoveries = new Map();
    this.availableDrivers = new Set();
    this.locationTracks = new Map(); // bookingId -> { driver: [{lat,lng,at}], user: [{lat,lng,at}] }
    this.negotiationLocks = new Map(); // driverId -> bookingId
    this.requestIdToBookingId = new Map(); // requestId -> bookingId
    this.initializeEventHandlers();
  }

  /**
   * Initialize WebSocket event handlers
   */
  initializeEventHandlers() {
    // Core recovery events
    this.webSocketService.on(
      "recovery.request",
      this.handleRecoveryRequest.bind(this)
    );
    this.webSocketService.on(
      "driver.assignment",
      this.handleDriverAssignment.bind(this)
    );
    this.webSocketService.on(
      "driver.accept",
      this.handleAcceptRequest.bind(this)
    );
    this.webSocketService.on(
      "driver.location.update",
      this.handleDriverLocationUpdate.bind(this)
    );
    this.webSocketService.on(
      "recovery.cancel",
      this.handleCancelRequest.bind(this)
    );

    // Car recovery specific events
    this.webSocketService.on(
      "carRecovery:getDrivers",
      this.handleGetDrivers.bind(this)
    );
    this.webSocketService.on(
      "driver.arrival",
      this.handleDriverArrival.bind(this)
    );
    this.webSocketService.on(
      "waiting.time.update",
      this.handleWaitingTimeUpdate.bind(this)
    );
    this.webSocketService.on(
      "service.start",
      this.handleServiceStart.bind(this)
    );

    // New: Service lifecycle
    this.webSocketService.on(
      "service.complete",
      this.handleServiceComplete.bind(this)
    );

    // New: Realtime chat
    this.webSocketService.on(
      "recovery.message.send",
      this.handleRecoveryMessageSend.bind(this)
    );
    this.webSocketService.on(
      "recovery.messages.get",
      this.handleRecoveryMessagesGet.bind(this)
    );
    if (typeof this.handleRecoveryMessageRead === "function") {
      this.webSocketService.on(
        "recovery.message.read",
        this.handleRecoveryMessageRead.bind(this)
      );
    }
    if (typeof this.handleRecoveryTyping === "function") {
      this.webSocketService.on(
        "recovery.typing",
        this.handleRecoveryTyping.bind(this)
      );
    }

    // New: Discovery filters (pink/safety)
    this.webSocketService.on(
      "discovery.filters.set",
      this.handleDiscoveryFiltersSet.bind(this)
    );

    // New: Favourites & direct dispatch
    this.webSocketService.on(
      "booking.toFavourite",
      this.handleBookingToFavourite.bind(this)
    );
    this.webSocketService.on(
      "favourites.add",
      this.handleFavouritesAdd.bind(this)
    );
    this.webSocketService.on(
      "favourites.list",
      this.handleFavouritesList.bind(this)
    );
    this.webSocketService.on(
      "favourites.remove",
      this.handleFavouritesRemove.bind(this)
    );

    // New: Multi-stop rules
    this.webSocketService.on(
      "multiStop.set",
      this.handleMultiStopSet.bind(this)
    );
    this.webSocketService.on(
      "multiStop.rules",
      this.handleMultiStopRules.bind(this)
    );

    // New: Waiting/overtime consent
    this.webSocketService.on(
      "service.waiting.consent",
      this.handleWaitingConsent.bind(this)
    );

    // New: Presence signals
    this.webSocketService.on(
      "presence.enroute",
      this.handlePresenceEnroute.bind(this)
    );
    if (typeof this.handlePresenceStatus === "function") {
      this.webSocketService.on(
        "presence.status",
        this.handlePresenceStatus.bind(this)
      );
    }
    // Aliases for presence
    this.webSocketService.on(
      "presence.im_coming",
      this.handlePresenceEnroute.bind(this)
    );
    this.webSocketService.on(
      "presence.im_arrived",
      this.handleDriverArrival.bind(this)
    );

    // New: Driver cancel with rebroadcast
    if (typeof this.handleDriverCancel === "function") {
      this.webSocketService.on(
        "driver.cancel",
        this.handleDriverCancel.bind(this)
      );
    }

    // New: Services catalog for info buttons/images
    if (typeof this.handleServicesCatalogGet === "function") {
      this.webSocketService.on(
        "services.catalog.get",
        this.handleServicesCatalogGet.bind(this)
      );
    }

    // New: Chat file upload
    if (typeof this.handleChatUpload === "function") {
      this.webSocketService.on("chat.upload", this.handleChatUpload.bind(this));
    }

    // New: Post-ride ratings
    this.webSocketService.on(
      "rating.submit",
      this.handleRatingSubmit.bind(this)
    );

    // Availability + user location (optional)
    this.webSocketService.on(
      "driver.availability",
      this.handleDriverAvailability.bind(this)
    );
    this.webSocketService.on(
      "user.location.update",
      this.handleUserLocationUpdate.bind(this)
    );

    // Negotiation WS
    this.webSocketService.on("fare.offer", this.handleFareOffer.bind(this));
    this.webSocketService.on("fare.counter", this.handleFareCounter.bind(this));
    this.webSocketService.on("fare.accept", this.handleFareAccept.bind(this));
    this.webSocketService.on("fare.reject", this.handleFareReject.bind(this));
  }

  /**
   * Handle recovery request from client
   */
  async handleRecoveryRequest(ws, message) {
    const { data } = message || {};

    try {
      // Validate request data
      if (!data || !data.pickupLocation || !data.serviceType) {
        throw new Error(
          "Missing required fields: pickupLocation and serviceType are required"
        );
      }

      // Do NOT create DB booking yet; generate a working requestId for WS lifecycle
      const creatorId =
        ws?.user?.id ||
        ws?.user?._id?.toString?.() ||
        data.customerId ||
        data.userId ||
        null;

      const workingId = uuidv4();

      // Normalize incoming coordinates
      const pLat =
        data.pickupLocation.coordinates?.lat ??
        data.pickupLocation.coordinates?.latitude;
      const pLng =
        data.pickupLocation.coordinates?.lng ??
        data.pickupLocation.coordinates?.longitude;
      const dLat =
        (data.destinationLocation || data.dropoffLocation)?.coordinates?.lat ??
        (data.destinationLocation || data.dropoffLocation)?.coordinates
          ?.latitude;
      const dLng =
        (data.destinationLocation || data.dropoffLocation)?.coordinates?.lng ??
        (data.destinationLocation || data.dropoffLocation)?.coordinates
          ?.longitude;

      // Build GeoJSON locations to satisfy schema
      const pickupGeo = {
        type: "Point",
        coordinates: [Number(pLng) || 0, Number(pLat) || 0], // [lng, lat]
        address: data.pickupLocation.address || "Unknown",
        zone: data.pickupLocation.zone || "general",
      };
      const dropoffGeo =
        dLat != null && dLng != null
          ? {
              type: "Point",
              coordinates: [Number(dLng) || 0, Number(dLat) || 0],
              address:
                (data.destinationLocation || data.dropoffLocation)?.address ||
                "Unknown",
              zone:
                (data.destinationLocation || data.dropoffLocation)?.zone ||
                "general",
            }
          : {
              type: "Point",
              coordinates: [Number(pLng) || 0, Number(pLat) || 0],
              address: data.pickupLocation.address || "Unknown",
              zone: data.pickupLocation.zone || "general",
            };

      // Compute distance and initial fare to meet required fields
      const distanceKm =
        this._calcDistanceKm(
          { lat: pickupGeo.coordinates[1], lng: pickupGeo.coordinates[0] },
          { lat: dropoffGeo.coordinates[1], lng: dropoffGeo.coordinates[0] }
        ) || 0;
      const distanceInMeters = Math.round(distanceKm * 1000);

      // Determine search radius (km) from client or booking defaults, clamp 1-50
      const selectedRadiusKm = Math.max(
        1,
        Math.min(50, Number(data?.searchRadiusKm ?? data?.searchRadius ?? 10))
      );

      // Map service type/category to schema enums
      const mapCategory = (t) => {
        const v = String(t || "")
          .toLowerCase()
          .trim();
        if (["towing", "flatbed", "wheel_lift", "wheel-lift"].includes(v))
          return "towing services";
        if (["winching", "on-road winching", "off-road winching"].includes(v))
          return "winching services";
        if (
          [
            "roadside",
            "roadside_assistance",
            "roadside assistance",
            "battery",
            "fuel",
          ].includes(v)
        )
          return "roadside assistance";
        return "specialized/heavy recovery";
      };
      // bookingModel requires serviceType enum: ['car cab','bike','car recovery','shifting & movers']
      const bookingServiceType = "car recovery";
      const bookingServiceCategory = mapCategory(data.serviceType);

      // Prefer Admin Pricing for per-subservice
      const mapToCalcType = (st) => {
        const v = String(st || "").toLowerCase();
        if (v.includes("towing")) return "towing";
        if (v.includes("winching")) return "winching";
        if (v.includes("roadside")) return "roadside_assistance";
        if (v.includes("key")) return "key_unlock";
        return "specialized_recovery";
      };
      let estimatedFare = 0;
      let _convFee = 0;
      try {
        const cfg = await PricingConfig.findOne({
          serviceType: "car_recovery",
          isActive: true,
        }).lean();
        const admin = cfg?.carRecoveryConfig;
        if (admin?.serviceCharges) {
          const preferredSub = String(data?.subService || "")
            .trim()
            .toLowerCase();
          const broad = mapToCalcType(data?.serviceType);
          const sc =
            admin.serviceCharges[preferredSub] ||
            admin.serviceCharges[broad] ||
            admin.serviceCharges.default ||
            {};
          const baseKm = Number(sc.baseKm ?? 6);
          const base = Number(sc.baseFare ?? 50);
          const perKm = Number(sc.perKm ?? 7.5);
          _convFee = Number(sc.convenienceFee || 0);
          const platformPct = Number(admin.platformCharges?.percentage ?? 0);
          const vatPct = Number(process.env.VAT_PERCENT || 0);
          const extraKmKm = Math.max(0, distanceKm - baseKm);
          const distanceFare = Math.round(extraKmKm * perKm);
          const subtotal = Math.round(base + distanceFare + _convFee);
          const platformFee = Math.round((subtotal * platformPct) / 100);
          const subtotalWithPlatform = subtotal + platformFee;
          const vatAmount = Math.round((subtotalWithPlatform * vatPct) / 100);
          estimatedFare = subtotalWithPlatform + vatAmount;
        }
      } catch (_) {}
      if (!estimatedFare || estimatedFare <= 0) {
        // Fallback simple fare (base 6km + 7.5/km)
        const baseFare = 50;
        const perKmRate = 7.5;
        const extraKm = Math.max(0, distanceKm - 6);
        estimatedFare = Math.max(
          baseFare,
          baseFare + Math.ceil(extraKm * perKmRate)
        );
      }

      // Use workingId as the temporary identifier for this request until persisted
      const rid = workingId;

      // Create new recovery request
      const recoveryRequest = {
        requestId: rid,
        status: "pending",
        createdAt: new Date(),
        ...data,
        // Ensure we persist who created this request for authorization
        userId: creatorId,
        // Initialize additional fields
        driverId: null,
        driverLocation: null,
        statusHistory: [
          {
            status: "pending",
            timestamp: new Date(),
            message: "Recovery request created",
          },
        ],
        bookingId: null, // will be set once persisted in DB after accept
        searchRadiusKm: selectedRadiusKm,
        // Capture pink captain and safety preferences if provided at creation
        discoveryFilters: {
          pinkCaptainOnly: !!(
            data?.pinkCaptainOnly || data?.preferences?.pinkCaptainOnly
          ),
          safety: {
            familyWithGuardianMale: !!data?.preferences?.familyWithGuardianMale,
            noMaleCompanion: !!data?.preferences?.noMaleCompanion,
            maleWithoutFemale: !!data?.preferences?.maleWithoutFemale,
          },
          // New: dispatch preference - favourite | pinned | female_only
          preferredDispatch: {
            mode:
              data?.dispatchPreference ||
              data?.preferredDispatch?.mode ||
              data?.preferences?.dispatchMode ||
              null,
            driverId:
              data?.pinnedDriverId ||
              data?.preferredDispatch?.driverId ||
              data?.preferences?.pinnedDriverId ||
              null,
          },
        },
        // Store initial fare context in memory for later persistence
        fareContext: {
          estimatedDistance: distanceKm,
          estimatedFare: estimatedFare,
          currency: "AED",
          clientEstimatedFare: (typeof data?.estimatedFare === 'number' ? data.estimatedFare : (typeof data?.estimated?.amount === 'number' ? data.estimated.amount : undefined))
        },
        pickupLocation: pickupGeo,
        dropoffLocation: dropoffGeo,
        distance: distanceKm,
        distanceInMeters,
        serviceType: bookingServiceType,
        serviceCategory: bookingServiceCategory,
        vehicleDetails: data.vehicleDetails || {},
      };

      // Store the recovery request
      this.activeRecoveries.set(rid, recoveryRequest);

      // Notify client of successful request creation, include adjustment info and both estimates (server/client)
       this.emitToClient(ws, {
         event: "recovery.request_created",
         bookingId: rid,
         data: {
           bookingId: rid,
           status: "pending",
           estimatedTime: "Calculating...",
           message: "Looking for available drivers",
           fare: {
             estimated: {
               admin: estimatedFare,
               customer: (typeof data?.estimatedFare === 'number' ? data.estimatedFare : (typeof data?.estimated?.amount === 'number' ? data.estimated.amount : null))
             },
             selected: null,
             adjustment: data.__fareAdjust ? {
               allowedPct: data.__fareAdjust.allowedPct,
               min: data.__fareAdjust.minFare,
               max: data.__fareAdjust.maxFare
             } : undefined
           }
         },
       });

      // Do NOT auto-assign. Instead, fetch nearby drivers and notify requester + broadcast to drivers
      const nearbyDrivers = await this.getAvailableDrivers(
        recoveryRequest.pickupLocation,
        recoveryRequest.searchRadiusKm || 10,
        recoveryRequest.discoveryFilters || {}
      );

      // Emit available drivers list to requester
      this.emitToClient(ws, {
        event: "carRecovery:driversAvailable",
        bookingId: rid,
        data: {
          drivers: nearbyDrivers,
          count: nearbyDrivers.length,
          updatedAt: new Date(),
          dispatchMode:
            recoveryRequest.discoveryFilters?.preferredDispatch?.mode || null,
        },
      });

      // Notify each nearby driver about the new request (non-intrusive broadcast)
      for (const d of nearbyDrivers) {
        this.webSocketService.sendToUser(String(d.id), {
          event: "newRecoveryRequest",
          bookingId: rid,
          data: {
            bookingId: rid,
            pickupLocation: recoveryRequest.pickupLocation,
            estimatedFare:
              recoveryRequest.fareContext?.estimatedFare || 0,
            offeredFare: recoveryRequest.fareContext?.clientEstimatedFare || 0,
          },
        });
      }

      // Refreshment alert for long distance > 20km
      try {
        if (distanceKm > 20) {
          this.emitToClient(ws, {
            event: "refreshment.alert",
            bookingId: data?.bookingId,
            data: { reason: "distance", thresholdKm: 20 },
          });
        }
      } catch {}
    } catch (error) {
      logger.error("Error handling recovery request:", error);
      this.emitToClient(ws, {
        event: "error",
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: error.message || "Failed to process recovery request",
        },
      });
    }
  }

  /**
   * Handle driver assignment
   */
  async handleDriverAssignment(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      if (!id || !data || !data.driverId) {
        throw new Error(
          "Missing required fields: requestId (or bookingId) and driverId are required"
        );
      }

      const recoveryRequest = this.activeRecoveries.get(id);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      // Update recovery request with driver info
      recoveryRequest.driverId = data.driverId;
      recoveryRequest.status = "driver_assigned";
      recoveryRequest.assignedAt = new Date();
      recoveryRequest.statusHistory.push({
        status: "driver_assigned",
        timestamp: new Date(),
        driverId: data.driverId,
        message: "Driver assigned to recovery request",
      });

      // Store initial enroute distance from driver current location to pickup (for cancel stage computation)
      try {
        const driver = await User.findById(data.driverId).select(
          "currentLocation"
        );
        const dLat = driver?.currentLocation?.coordinates?.[1];
        const dLng = driver?.currentLocation?.coordinates?.[0];
        const pLat =
          recoveryRequest.pickupLocation?.coordinates?.lat ??
          recoveryRequest.pickupLocation?.coordinates?.[1];
        const pLng =
          recoveryRequest.pickupLocation?.coordinates?.lng ??
          recoveryRequest.pickupLocation?.coordinates?.[0];
        if (dLat != null && dLng != null && pLat != null && pLng != null) {
          const initialKm = this._calcDistanceKm(
            { lat: dLat, lng: dLng },
            { lat: pLat, lng: pLng }
          );
          recoveryRequest.initialEnrouteKm = initialKm;
        }
      } catch {}

      // Notify client
      this.emitToClient(ws, {
        event: "driver.assigned",
        bookingId: id,
        data: {
          driverId: data.driverId,
          status: "assigned",
          assignedAt: recoveryRequest.assignedAt,
          estimatedArrival: "10-15 minutes", // This would be calculated in a real implementation
        },
      });

      logger.info(`Driver ${data.driverId} assigned to recovery request ${id}`);
    } catch (error) {
      logger.error("Error in handleDriverAssignment:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: {
          code: "DRIVER_ASSIGNMENT_ERROR",
          message: error.message || "Failed to assign driver",
        },
      });
    }
  }

  /**
   * Handle driver accepting a recovery request
   */
  async handleAcceptRequest(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      if (!id || !data || !data.driverId) {
        throw new Error(
          "Missing required fields: requestId and driverId are required"
        );
      }

      const recoveryRequest = this.activeRecoveries.get(id);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      // Guard: booking can only be accepted once
      const existingBid = recoveryRequest.bookingId || data?.bookingId || id;
      const existingBooking = await Booking.findById(existingBid).select(
        "fareDetails user driver status"
      );
      if (
        existingBooking &&
        ["accepted", "in_progress", "completed", "cancelled"].includes(
          existingBooking.status
        )
      ) {
        throw new Error(
          `Booking already ${existingBooking.status}, cannot accept again`
        );
      }

      // Enforce: a driver can only handle one active job at a time
      const activeForDriver = await Booking.findOne({
        driver: data.driverId,
        status: { $in: ["accepted", "in_progress"] },
      }).select("_id status");
      if (activeForDriver) {
        throw new Error(
          "Driver already has an active job (accepted/in_progress). Finish it before accepting another."
        );
      }

      // Validate driver is assigned to this request
      if (
        recoveryRequest.driverId &&
        recoveryRequest.driverId !== data.driverId
      ) {
        throw new Error("Driver not authorized for this request");
      }

      // Enforce: negotiation must be accepted before allowing driver to accept
      const negotiationState = existingBooking?.fareDetails?.negotiation?.state;
      const hasFinalFare =
        typeof existingBooking?.fareDetails?.finalFare === "number" &&
        existingBooking.fareDetails.finalFare > 0;
      if (negotiationState !== "accepted" && !hasFinalFare) {
        throw new Error(
          "Price must be accepted before driver can accept the job"
        );
      }

      // Update recovery request status
      recoveryRequest.status = "accepted";
      recoveryRequest.acceptedAt = new Date();
      recoveryRequest.driverId = data.driverId;
      recoveryRequest.statusHistory.push({
        status: "accepted",
        timestamp: new Date(),
        driverId: data.driverId,
        message: "Driver accepted the recovery request",
      });

      // Ensure Booking exists now (persist on accept if not already created)
      let booking = existingBooking || null;
      if (!booking) {
        // Create booking now from in-memory request
        const finalFareFromNegotiation =
          Number(
            recoveryRequest?.fareContext?.negotiation?.finalFare ||
              recoveryRequest?.fareContext?.negotiation?.selectedFare ||
              recoveryRequest?.fareContext?.estimatedFare ||
              0
          ) || 0;
        const bookingDoc = new Booking({
          user: recoveryRequest.userId,
          serviceType: recoveryRequest.serviceType,
          serviceCategory: recoveryRequest.serviceCategory,
          pickupLocation: recoveryRequest.pickupLocation,
          dropoffLocation: recoveryRequest.dropoffLocation,
          distance: recoveryRequest.distance,
          distanceInMeters: recoveryRequest.distanceInMeters,
          fare: finalFareFromNegotiation || recoveryRequest.fareContext?.estimatedFare || 0,
          offeredFare: finalFareFromNegotiation || recoveryRequest.fareContext?.estimatedFare || 0,
          vehicleDetails: recoveryRequest.vehicleDetails || {},
          status: "pending",
          createdAt: new Date(),
          fareDetails: {
            estimatedDistance: recoveryRequest.fareContext?.estimatedDistance,
            estimatedFare: recoveryRequest.fareContext?.estimatedFare,
            currency: recoveryRequest.fareContext?.currency || "AED",
            negotiation: recoveryRequest.fareContext?.negotiation || undefined,
          },
        });
        booking = await bookingDoc.save();
        recoveryRequest.bookingId = booking._id.toString();
        // Map temporary requestId -> real bookingId for future resolutions (e.g., cancel by requestId)
        try {
          if (!this.requestIdToBookingId) this.requestIdToBookingId = new Map();
          this.requestIdToBookingId.set(id, recoveryRequest.bookingId);
          logger.info(`Mapped requestId ${id} -> bookingId ${recoveryRequest.bookingId}`);
        } catch {}
        // Inform both parties that booking is now persisted
        try {
          this.emitToClient(ws, { event: "booking.persisted", bookingId: recoveryRequest.bookingId, data: { bookingId: recoveryRequest.bookingId, requestId: id } });
          if (recoveryRequest.userId) {
            this.webSocketService.sendToUser(String(recoveryRequest.userId), { event: "booking.persisted", bookingId: recoveryRequest.bookingId, data: { bookingId: recoveryRequest.bookingId, requestId: id } });
          }
          if (recoveryRequest.driverId) {
            this.webSocketService.sendToUser(String(recoveryRequest.driverId), { event: "booking.persisted", bookingId: recoveryRequest.bookingId, data: { bookingId: recoveryRequest.bookingId, requestId: id } });
          }
        } catch {}
      }
      // Persist booking acceptance (single-accept rule)
      booking.driver = data.driverId;
      booking.status = "accepted";
      await booking.save();

      // Auto-favourite logic: if customer set favorite flag or pinkCaptainOnly is true, add driver to customer's favourites
      const shouldFavorite =
        data?.favorite === true ||
        recoveryRequest?.discoveryFilters?.pinkCaptainOnly === true;
      if (shouldFavorite && recoveryRequest.userId) {
        try {
          await User.findByIdAndUpdate(
            recoveryRequest.userId,
            { $addToSet: { favoriteDrivers: data.driverId } },
            { new: false }
          );
        } catch (favErr) {
          logger.warn(
            "Failed to add driver to favorites:",
            favErr?.message || favErr
          );
        }
      }

      // Notify client about acceptance
      this.emitToClient(ws, {
        event: "recovery.accepted",
        bookingId: id,
        data: {
          status: "accepted",
          acceptedAt: recoveryRequest.acceptedAt,
          driverId: data.driverId,
          // Inform customer if this driver currently has pending company amounts (do NOT expose amount)
          driverPendingAmounts: !!(await (async () => {
            try {
              const drv = await User.findById(data.driverId).select(
                "dues.outstanding statusFlags.blockedForDues"
              );
              return Number(drv?.dues?.outstanding || 0) > 0;
            } catch {
              return false;
            }
          })()),
        },
      });

      logger.info(`Recovery request ${id} accepted by driver ${data.driverId}`);
    } catch (error) {
      logger.error("Error in handleAcceptRequest:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: {
          code: ERROR_CODES.ACCEPT_REQUEST_ERROR,
          message: error.message || "Failed to accept recovery request",
        },
      });
    }
  }

  /**
   * Handle driver arrival
   */
  async handleDriverArrival(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const recoveryRequest = this.activeRecoveries.get(id);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      recoveryRequest.status = "driver_arrived";
      recoveryRequest.arrivedAt = new Date();
      recoveryRequest.hasArrived = true;
      recoveryRequest.statusHistory.push({
        status: "driver_arrived",
        timestamp: new Date(),
        message: "Driver has arrived at the location",
      });

      // Minimum arrival charge for Winching / Roadside assistance
      try {
        const svc = String(recoveryRequest?.serviceType || "").toLowerCase();
        if (svc.includes("winching") || svc.includes("roadside")) {
          recoveryRequest.arrivalMinFee = Number(
            process.env.ARRIVAL_MIN_FEE || 5
          );
        }
      } catch {}

      // Notify client
      this.emitToClient(ws, {
        event: "driver.arrived",
        bookingId: id,
        data: {
          status: "arrived",
          arrivedAt: recoveryRequest.arrivedAt,
        },
      });
    } catch (error) {
      logger.error("Error in handleDriverArrival:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: {
          code: "DRIVER_ARRIVAL_ERROR",
          message: error.message || "Failed to process driver arrival",
        },
      });
    }
  }

  /**
   * Handle waiting time updates
   */
  async handleWaitingTimeUpdate(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const recoveryRequest = this.activeRecoveries.get(id);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      // Update waiting time and charge
      const waitingTime = data.waitingTime || 0;
      const waitingCharge = this.calculateWaitingCharge(
        waitingTime,
        recoveryRequest
      );

      recoveryRequest.waitingTime = waitingTime;
      recoveryRequest.waitingCharge = waitingCharge;

      // Step 3: notify when 5 minutes remaining of free stay (round-trips only)
      try {
        if (recoveryRequest?.freeStay?.totalMinutes) {
          const remaining = Math.max(
            0,
            recoveryRequest.freeStay.totalMinutes - waitingTime
          );
          if (remaining <= 5 && !recoveryRequest.freeStay.lastNotified5) {
            recoveryRequest.freeStay.lastNotified5 = true;
            this.emitToClient(ws, {
              event: "freeStay.remaining",
              bookingId: id,
              data: { minutes: Math.ceil(remaining) },
            });
          }
          // Emit popup when free stay fully ends (once)
          if (remaining <= 0 && !recoveryRequest.freeStay.endedNotified) {
            recoveryRequest.freeStay.endedNotified = true;
            this.emitToClient(ws, {
              event: "freeStay.ended",
              bookingId: id,
              data: {
                title: "Free Stay Time Ended – Select Action",
                options: [
                  {
                    action: "continue_no_overtime",
                    label: "Continue – No Overtime Charges",
                  },
                  { action: "start_overtime", label: "Start Overtime Charges" },
                ],
              },
            });
          }
        }
      } catch {}

      // Notify client
      this.emitToClient(ws, {
        event: "waiting.time.updated",
        bookingId: id,
        data: {
          waitingTime,
          waitingCharge,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error("Error in handleWaitingTimeUpdate:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: {
          code: "WAITING_TIME_UPDATE_ERROR",
          message: error.message || "Failed to update waiting time",
        },
      });
    }
  }

  /**
   * Handle service start
   */
  async handleServiceStart(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const recoveryRequest = this.activeRecoveries.get(id);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      recoveryRequest.status = "in_progress";
      recoveryRequest.startedAt = new Date();
      recoveryRequest.serviceStartAt = recoveryRequest.startedAt;
      recoveryRequest.statusHistory.push({
        status: "in_progress",
        timestamp: new Date(),
        message: "Service has started",
      });

      // Calculate total charges so far
      const totalCharges = this.calculateTotalCharges(recoveryRequest);

      // Notify client
      this.emitToClient(ws, {
        event: "service.started",
        bookingId: id,
        data: {
          status: "in_progress",
          startedAt: recoveryRequest.startedAt,
          totalCharges,
        },
      });
    } catch (error) {
      logger.error("Error in handleServiceStart:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: {
          code: "SERVICE_START_ERROR",
          message: error.message || "Failed to start service",
        },
      });
    }
  }

  /**
   * Calculate total charges for the service
   */
  calculateTotalCharges(recoveryRequest) {
    // Base fare
    const serviceConfig = SERVICE_CONFIG[recoveryRequest.serviceType];
    let total = serviceConfig?.basePrice || 0;

    // Add waiting charges if any
    if (recoveryRequest.waitingCharge) {
      total += recoveryRequest.waitingCharge;
    }

    // Add minimum arrival fee if present
    if (recoveryRequest.arrivalMinFee) {
      total += Number(recoveryRequest.arrivalMinFee || 0);
    }

    // Add any additional charges here

    return total;
  }

  /**
   * Helper method to emit messages to a specific client
   */
  emitToClient(ws, message) {
    try {
      if (ws && ws.readyState === 1) {
        // 1 = OPEN
        ws.send(JSON.stringify(message));
      }
    } catch (error) {
      logger.error("Error emitting message to client:", error);
    }
  }

  /**
   * Handle driver location updates
   */
  async handleDriverLocationUpdate(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      if (!id || !data || !data.driverId || !data.location) {
        throw new Error(
          "Missing required fields: requestId, driverId, and location are required"
        );
      }

      const recoveryRequest = this.activeRecoveries.get(id);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      // Validate driver is assigned to this request
      if (recoveryRequest.driverId !== data.driverId) {
        throw new Error(
          "Driver not authorized to update location for this request"
        );
      }

      // Persist driver's current location in DB so nearby driver queries work
      const lat = data.location.latitude ?? data.location.lat;
      const lng = data.location.longitude ?? data.location.lng;
      if (typeof lat === "number" && typeof lng === "number") {
        await User.findByIdAndUpdate(
          data.driverId,
          {
            currentLocation: { type: "Point", coordinates: [lng, lat] },
            isActive: true,
            driverStatus: "online",
            lastActiveAt: new Date(),
          },
          { new: false }
        );
      }

      // Update driver location
      recoveryRequest.driverLocation = {
        coordinates: {
          lat: data.location.latitude,
          lng: data.location.longitude,
        },
        updatedAt: new Date(),
      };

      // Calculate ETA if destination is available
      if (recoveryRequest.pickupLocation) {
        // This is a simplified ETA calculation
        // In a real app, you would use a mapping service API
        recoveryRequest.eta = this.calculateETA(
          recoveryRequest.driverLocation.coordinates,
          recoveryRequest.pickupLocation.coordinates
        );
      }

      // Save to database if needed
      // await this.updateRecoveryRequestLocation(recoveryRequest);

      // Notify client
      this.emitToClient(ws, {
        event: "driver.location.updated",
        bookingId: id,
        data: {
          location: recoveryRequest.driverLocation,
          eta: recoveryRequest.eta,
          updatedAt: recoveryRequest.driverLocation.updatedAt,
        },
      });

      logger.debug(
        `Driver ${data.driverId} location updated for request ${id}`
      );
    } catch (error) {
      logger.error("Error in handleDriverLocationUpdate:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: {
          code: "LOCATION_UPDATE_ERROR",
          message: error.message || "Failed to update driver location",
        },
      });
    }
  }

  /**
   * Calculate ETA between two points (simplified)
   * In a real app, use a mapping service API for accurate ETAs
   */
  calculateETA(from, to) {
    // This is a simplified calculation
    // In a real app, you would use a mapping service API
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(to.lat - from.lat);
    const dLon = this.toRad(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(from.lat)) *
        Math.cos(this.toRad(to.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km

    // Assuming average speed of 30 km/h in city traffic
    const averageSpeed = 30; // km/h
    const etaMinutes = Math.ceil((distance / averageSpeed) * 60);

    return {
      minutes: etaMinutes,
      distance: parseFloat(distance.toFixed(2)),
      unit: "km",
    };
  }

  /**
   * Convert degrees to radians
   */
  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Handle driver arrival at pickup location
   */
  async handleDriverArrival(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;
    try {
      const recoveryRequest = this.activeRecoveries.get(id);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      // Update recovery request with arrival info
      recoveryRequest.driverArrivalTime = new Date();
      recoveryRequest.status = "driver_arrived";
      recoveryRequest.statusHistory.push({
        status: "driver_arrived",
        timestamp: new Date(),
        driverId: data?.driverId,
        location: data?.location,
        message: "Driver arrived at pickup location",
      });

      // Start waiting timer
      recoveryRequest.waitingTimer = {
        startTime: new Date(),
        freeMinutes: WAITING_CHARGES.freeMinutes,
        chargePerMinute: WAITING_CHARGES.perMinuteCharge,
        maxCharge: WAITING_CHARGES.maxCharge,
        totalCharges: 0,
      };

      // Notify client
      this.emitToClient(ws, {
        event: "driver.arrived",
        bookingId: id,
        data: {
          arrivalTime: recoveryRequest.driverArrivalTime.toISOString(),
          freeWaitTime: WAITING_CHARGES.freeMinutes,
          waitingCharges: {
            perMinute: WAITING_CHARGES.perMinuteCharge,
            maxCharge: WAITING_CHARGES.maxCharge,
          },
        },
      });
    } catch (error) {
      logger.error("Error handling driver arrival:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: {
          code: ERROR_CODES.INTERNAL_SERVER_ERROR,
          message: error.message || "Failed to process driver arrival",
        },
      });
    }
  }

  /**
   * Calculate waiting charges based on waiting time
   */
  calculateWaitingCharges(recoveryRequest) {
    if (!recoveryRequest.waitingTimer) {
      return {
        waitingTime: 0,
        freeMinutesUsed: 0,
        chargeableMinutes: 0,
        waitingCharge: 0,
        isFreeTimeAvailable: true,
      };
    }

    const now = new Date();
    const waitingTime =
      (now - recoveryRequest.waitingTimer.startTime) / (1000 * 60); // in minutes
    // Step 3: use round-trip free stay minutes if applicable
    const freeMinutes =
      recoveryRequest?.freeStay?.totalMinutes ??
      recoveryRequest.waitingTimer.freeMinutes ??
      0;

    // Calculate chargeable time
    let chargeableMinutes = Math.max(0, Math.ceil(waitingTime - freeMinutes));
    const isFreeTimeAvailable = waitingTime <= freeMinutes;

    // Calculate waiting charge
    let waitingCharge = Math.min(
      chargeableMinutes * recoveryRequest.waitingTimer.chargePerMinute,
      recoveryRequest.waitingTimer.maxCharge
    );

    return {
      waitingTime: Math.round(waitingTime * 10) / 10, // 1 decimal place
      freeMinutesUsed: Math.min(waitingTime, freeMinutes),
      chargeableMinutes,
      waitingCharge,
      isFreeTimeAvailable,
    };
  }

  /**
   * Handle cancellation of a recovery request
   */
  async handleCancelRequest(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      let recoveryRequest = this.activeRecoveries.get(id);
      // DB fallback: if in-memory request is missing (e.g., restart or different instance), reconstruct minimal state from Booking
      if (!recoveryRequest) {
        try {
          const lookupId = id;
          if (!this.requestIdToBookingId) this.requestIdToBookingId = new Map();
          const mapped = this.requestIdToBookingId.get(id);
          if (mapped) lookupId = mapped;
          const booking = await Booking.findById(lookupId)
            .select(
              "user driver pickupLocation dropoffLocation status fareDetails receipt createdAt"
            )
            .lean();
          if (!booking) throw new Error("Recovery request not found");
          recoveryRequest = {
            requestId: id,
            bookingId: String(booking._id),
            userId: booking.user,
            driverId: booking.driver || null,
            pickupLocation: booking.pickupLocation,
            dropoffLocation: booking.dropoffLocation,
            status: booking.status || "pending",
            hasArrived:
              booking.status === "driver_arrived" ||
              booking.status === "in_progress" ||
              booking.status === "completed",
            // Best-effort timestamps
            createdAt: booking.createdAt || new Date(),
            statusHistory: [],
          };
          this.activeRecoveries.set(id, recoveryRequest);
          // Persist the mapping for future resolutions
          try { this.requestIdToBookingId.set(id, String(booking._id)); } catch {}
        } catch (e) {
          throw new Error("Recovery request not found");
        }
      }

      // Determine who is attempting the cancellation
      const requesterId = (
        data.userId ||
        ws?.user?.id ||
        ws?.user?._id
      )?.toString?.();
      const isAdmin =
        ws?.user?.role === "admin" || ws?.user?.role === "superadmin";
      const isCreator =
        recoveryRequest.userId &&
        requesterId &&
        recoveryRequest.userId.toString() === requesterId;
      const isAssignedDriver =
        recoveryRequest.driverId &&
        requesterId &&
        recoveryRequest.driverId.toString() === requesterId;

      if (!isCreator && !isAssignedDriver && !isAdmin) {
        throw new Error("Not authorized to cancel this request");
      }

      // Stage detection for cancellation fees
      const pickup = recoveryRequest.pickupLocation;
      const driverLoc = recoveryRequest.driverLocation?.coordinates;
      const initialEnrouteKm = Number(recoveryRequest.initialEnrouteKm || 0);
      let progressRatio = 0;
      if (pickup && driverLoc && initialEnrouteKm > 0) {
        const curKm = this._calcDistanceKm(
          { lat: driverLoc.lat, lng: driverLoc.lng },
          {
            lat: pickup.coordinates?.lat ?? pickup.coordinates?.[1],
            lng: pickup.coordinates?.lng ?? pickup.coordinates?.[0],
          }
        );
        const traveled = Math.max(0, initialEnrouteKm - curKm);
        progressRatio = Math.max(0, Math.min(1, traveled / initialEnrouteKm));
      }
      let stage = "before25Percent";
      if (recoveryRequest.hasArrived || recoveryRequest.arrivedAt)
        stage = "afterArrival";
      else if (progressRatio >= 0.5)
        stage = "after50Percent"; // Changed from after50 to after50Percent
      else if (progressRatio >= 0.25) stage = "after25Percent"; // Changed from after25 to after25Percent

      // Who cancelled: 'customer' | 'driver' | 'admin'
      let cancelledBy = "customer";
      if (String(recoveryRequest.driverId) === String(requesterId))
        cancelledBy = "driver";
      if (isAdmin) cancelledBy = "admin";

      // Compute fee from admin config with fallback
      const feeConfig = await (async () => {
        try {
          const comp = await ComprehensivePricing.findOne({
            isActive: true,
          }).lean();
          if (comp?.cancellationCharges) return comp.cancellationCharges;
        } catch {}
        try {
          const cfg = await PricingConfig.findOne({
            serviceType: "car_recovery",
            isActive: true,
          }).lean();
          if (cfg?.carRecoveryConfig?.cancellationCharges)
            return cfg.carRecoveryConfig.cancellationCharges;
        } catch {}
        return null;
      })();

      // Determine fee
      const fallbackAED = {
        before25Percent: 2,
        after25Percent: 3,
        after50Percent: 5,
        afterArrival: 10,
      };
      const pickFrom = (obj, key, def) =>
        obj && obj[key] != null ? obj[key] : def;
      // feeConfig may have structure like { before25Percent: { amount: 2, type: 'AED'|'PERCENT' }, ... }
      const feeNode = feeConfig?.[stage];
      let fee = 0;
      let feeType = "AED";
      // Strictly no fee when progress < 25% and not arrived
      if (
        !recoveryRequest.hasArrived &&
        !recoveryRequest.arrivedAt &&
        progressRatio < 0.25
      ) {
        fee = 0;
      } else if (feeNode) {
        if (typeof feeNode === "number") {
          fee = feeNode;
          feeType = "AED";
        } else {
          fee = Number(feeNode.amount || 0);
          feeType = (feeNode.type || "AED").toUpperCase();
        }
      } else {
        fee = pickFrom(fallbackAED, stage, 0);
      }

      // If percent, base on estimated fare
      if (feeType === "PERCENT") {
        const baseAmount = Number(recoveryRequest?.estimatedFare) || 0;
        fee = Math.round((baseAmount * fee) / 100);
      }

      // Update in-memory state
      recoveryRequest.status = "cancelled";
      recoveryRequest.cancelledAt = new Date();
      recoveryRequest.statusHistory.push({
        status: "cancelled",
        timestamp: new Date(),
        by: cancelledBy,
        stage,
        fee,
        reason: data?.reason,
      });

      // Persist to Booking: paymentDetails and receipt
      try {
        const bid = id; // bookingId
        const booking = await Booking.findById(bid).select(
          "paymentDetails receipt fareDetails"
        );
        if (booking) {
          booking.paymentDetails = booking.paymentDetails || {};
          booking.paymentDetails.cancellation = {
            by: cancelledBy,
            stage,
            fee,
            at: new Date(),
          };
          booking.receipt = booking.receipt || {};
          booking.receipt.fareBreakdown = booking.receipt.fareBreakdown || {};
          booking.receipt.fareBreakdown.cancellationFee = fee;
          await booking.save();
        }
      } catch (persistErr) {
        logger.warn(
          "Failed to persist cancellation fee to booking:",
          persistErr?.message || persistErr
        );
      }

      // Notify both parties
      this.emitToClient(ws, {
        event: "recovery.cancelled",
        bookingId: id,
        data: {
          by: cancelledBy,
          stage,
          fee,
          cancelledAt: recoveryRequest.cancelledAt,
        },
      });
      if (recoveryRequest.driverId) {
        this.webSocketService.sendToUser(String(recoveryRequest.driverId), {
          event: "recovery.cancelled",
          bookingId: id,
          data: {
            by: cancelledBy,
            stage,
            fee,
            cancelledAt: recoveryRequest.cancelledAt,
          },
        });
      }

      // Remove from active recoveries
      this.activeRecoveries.delete(id);

      // Optional: warnings analytics preserved
      try {
        const THRESHOLD = 3;
        const RED = 5;
        const count = (recoveryRequest.statusHistory || []).filter(
          (s) => s.status === "cancelled"
        ).length;
        if (count >= RED) {
          this.emitToClient(ws, {
            event: "cancellation.redFlag",
            bookingId: id,
            data: { count, windowDays: 30 },
          });
        } else if (count >= THRESHOLD) {
          this.emitToClient(ws, {
            event: "cancellation.warning",
            bookingId: id,
            data: { count, windowDays: 30 },
          });
        }
      } catch {}

      logger.info(
        `Recovery request ${id} cancelled by ${cancelledBy} (stage=${stage}, fee=${fee})`
      );

      // Co-location overlap fraud check (simple heuristic): if driver and user locations overlapped within ~100m for ≥ 2 minutes before cancel
      try {
        const track = this.locationTracks.get(id);
        if (track && track.driver.length && track.user.length) {
          const now = Date.now();
          const windowMs = 5 * 60 * 1000; // last 5 minutes
          const near = (a,b)=> this._calcDistanceKm({lat:a.lat,lng:a.lng},{lat:b.lat,lng:b.lng}) <= 0.1; // ~100m
          let overlapMs = 0; let lastNearAt = null;
          const driverPts = track.driver.filter(p=> now - p.at <= windowMs);
          const userPts = track.user.filter(p=> now - p.at <= windowMs);
          for (const dp of driverPts) {
            const u = userPts.find(up => Math.abs(up.at - dp.at) <= 60000 && near(dp, up)); // within 60s and within 100m
            if (u) { if (!lastNearAt) lastNearAt = Math.min(dp.at, u.at); overlapMs = Math.max(overlapMs, Math.abs(Math.max(dp.at,u.at) - lastNearAt)); } else { lastNearAt = null; }
          }
          if (overlapMs >= 2 * 60 * 1000) { // ≥2 minutes
            try { await Booking.findByIdAndUpdate(id, { $set: { 'flags.coLocationOverlap': true } }); } catch {}
            this.emitToClient(ws, { event: 'fraud.colocation.flag', bookingId: id, data: { minutes: Math.round(overlapMs/60000) } });
            if (this.webSocketService?.broadcastToAdmins) {
              this.webSocketService.broadcastToAdmins({ event: 'admin.fraud.colocation', bookingId: id, data: { minutes: Math.round(overlapMs/60000) } });
            }
          }
        }
      } catch {}
    } catch (error) {
      logger.error("Error in handleCancelRequest:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: {
          code: "CANCEL_REQUEST_ERROR",
          message: error.message || "Failed to cancel recovery request",
        },
      });
    }
  }

  /**
   * Handle getting available drivers for car recovery
   */
  async handleGetDrivers(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      if (!id) {
        throw new Error("Missing required field: requestId");
      }

      const recoveryRequest = this.activeRecoveries.get(id);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      // Get available drivers from the webSocketService
      const radiusKm = Math.max(
        1,
        Math.min(
          50,
          Number(data?.searchRadius) || recoveryRequest.searchRadiusKm || 10
        )
      );
      const onlyAssignable =
        data?.onlyAssignable === undefined ? true : !!data?.onlyAssignable; // default to only online

      const availableDrivers = await this.getAvailableDrivers(
        recoveryRequest.pickupLocation,
        radiusKm,
        {
          ...(recoveryRequest.discoveryFilters || {}),
          onlyAssignable,
          multiStopEnabled: !!recoveryRequest?.multiStop?.enabled,
          favoriteUserId: recoveryRequest.userId,
        }
      );

      // Send available drivers to the client
      this.emitToClient(ws, {
        event: "carRecovery:driversAvailable",
        bookingId: id,
        data: {
          drivers: availableDrivers,
          count: availableDrivers.length,
          updatedAt: new Date(),
          dispatchMode:
            recoveryRequest.discoveryFilters?.preferredDispatch?.mode || null,
        },
      });

      logger.info(
        `Sent ${availableDrivers.length} available drivers for request ${id}`
      );
    } catch (error) {
      logger.error("Error in handleGetDrivers:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: {
          code: "GET_DRIVERS_ERROR",
          message: error.message || "Failed to get available drivers",
        },
      });
    }
  }

  /**
   * Handle fare estimation for a recovery request
   */
  async handleFareEstimate(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      if (!data || !data.pickupLocation || !data.dropoffLocation) {
        throw new Error(
          "Missing required fields: pickupLocation and dropoffLocation are required"
        );
      }

      const {
        pickupLocation,
        dropoffLocation,
        vehicleType = "car",
        options = {},
      } = data || {};

      // Calculate distance and estimated time
      const distance = this._calcDistanceKm(
        pickupLocation.coordinates,
        dropoffLocation.coordinates
      );

      // Time estimate (minutes) using avg speed to pass to calculator
      const averageSpeedKmh = 30;
      const durationMinutes = Math.ceil((distance / averageSpeedKmh) * 60);

      // Use unified fare calculator (handles base 6km + 7.5/km, surge, night, platform, VAT, city-rule)
      const fare = await FareCalculator.calculateRecoveryFare({
        vehicleType,
        serviceType: data.serviceType,
        distance,
        duration: durationMinutes,
        startTime: new Date(),
        hasHelper: options?.hasHelper || false,
        helperCount: options?.helperCount || 0,
        waitingTime: options?.waitingTime || 0,
      });

      // Round-trip discount enforcement and free stay minutes (round trips only)
      const roundTrip = !!options?.roundTrip;
      const roundTripDiscount = roundTrip
        ? Number(process.env.ROUND_TRIP_DISCOUNT_AED || 10)
        : 0;
      const freeStayMinutes = roundTrip
        ? Math.min(
            Number(process.env.FREE_STAY_CAP_MIN || 30),
            Math.floor(distance * 0.5)
          )
        : 0;

      // Final amount shown to customer (apply discount after VAT so user sees a simple saved AED X)
      const amountBeforeDiscount = fare.totalWithVat ?? fare.totalFare;
      const finalAmount = Math.max(
        0,
        (amountBeforeDiscount || 0) - roundTripDiscount
      );

      // Negotiation window (admin configurable via env); bounds based on finalAmount
      const negotiation = {
        enabled: true,
        minPercent: Number(process.env.NEGOTIATE_MIN_PERCENT || 0),
        maxPercent: Number(process.env.NEGOTIATE_MAX_PERCENT || 20),
      };

      const response = {
        estimatedFare: {
          amount: finalAmount,
          currency: "AED",
          currencySymbol: "AED",
          breakdown: {
            baseFare: fare.baseFare || 0,
            distanceFare: fare.distanceFare || 0,
            serviceCharge: fare.serviceCharge || 0,
            waitingCharges: fare.waitingCharges || 0,
            nightSurcharge: fare.nightSurcharge || 0,
            platformFee: fare.platformFee?.amount || 0,
            vat: fare.vat?.amount || 0,
            roundTripDiscount,
          },
          estimatedDuration: durationMinutes, // in minutes
          estimatedDistance: { value: distance, unit: "km" },
          negotiationWindow: {
            enabled: negotiation.enabled,
            min: Math.max(
              0,
              Math.round(finalAmount * (1 - negotiation.minPercent / 100))
            ),
            max: Math.round(finalAmount * (1 + negotiation.maxPercent / 100)),
          },
          surge: {
            level: process.env.SURGE_LEVEL || "none",
            multiplier:
              process.env.SURGE_LEVEL === "2.0x"
                ? 2.0
                : process.env.SURGE_LEVEL === "1.5x"
                ? 1.5
                : 1.0,
          },
          vat: {
            percent: fare.vat?.percent || Number(process.env.VAT_PERCENT || 0),
          },
          freeStayMinutes,
          cityRuleApplied: Boolean(process.env.CITY_RULE_ENABLED || false),
        },
        pricingDetails: {
          timeEstimate: durationMinutes,
          distanceRate: undefined, // handled inside FareCalculator
          vehicleType,
          serviceType: data.serviceType,
        },
        timestamp: new Date(),
      };

      // Send fare estimate to client
      this.emitToClient(ws, {
        event: "estimate.fare.response",
        bookingId: id || "estimate-" + Date.now(),
        data: response,
      });

      logger.info(
        `Fare estimate generated for ${vehicleType} (${distance.toFixed(2)} km)`
      );
    } catch (error) {
      logger.error("Error in handleFareEstimate:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: {
          code: "FARE_ESTIMATE_ERROR",
          message: error.message || "Failed to calculate fare estimate",
        },
      });
    }
  }

  /**
   * Complete service, finalize fare with VAT/Surge and push billing summary
   */
  async handleServiceComplete(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const recoveryRequest = this.activeRecoveries.get(id);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      // Compute final totals (reuse calculateTotalCharges + apply VAT/Surge)
      const baseTotal = this.calculateTotalCharges(recoveryRequest);
      const surgeMultiplier =
        process.env.SURGE_LEVEL === "2.0x"
          ? 2.0
          : process.env.SURGE_LEVEL === "1.5x"
          ? 1.5
          : 1.0;
      const vatPercent = Number(process.env.VAT_PERCENT || 0);

      const surged = Math.round(baseTotal * surgeMultiplier);
      const vatAmount = Math.round((surged * vatPercent) / 100);
      let totalWithVat = surged + vatAmount;

      // Apply round-trip discount if flagged in request
      if (
        recoveryRequest?.routeType === "two_way" ||
        recoveryRequest?.roundTrip === true
      ) {
        const discount = Number(process.env.ROUND_TRIP_DISCOUNT_AED || 10);
        totalWithVat = Math.max(0, totalWithVat - discount);
      }

      recoveryRequest.status = "completed";
      recoveryRequest.completedAt = new Date();
      recoveryRequest.finalFare = totalWithVat;
      recoveryRequest.statusHistory.push({
        status: "completed",
        timestamp: recoveryRequest.completedAt,
        message: "Service completed",
      });

      // Persist minimal completion to Booking; default bookingId to requestId if not provided
      const persistId = data?.bookingId || id;
      let companyCommission = 0;
      let commissionCollected = false;
      let paymentMethod = (data?.paymentMethod || "").toLowerCase();
      let driverIdForDues = null;
      let customerIdForNotify = null;
      if (persistId) {
        const booking = await Booking.findById(persistId).select(
          "fareDetails receipt driver user paymentDetails"
        );
        if (booking) {
          paymentMethod =
            paymentMethod ||
            String(
              booking?.paymentDetails?.method ||
                booking?.paymentDetails?.paymentMethod ||
                "cash"
            ).toLowerCase();
          driverIdForDues = booking.driver;
          customerIdForNotify = booking.user;
          // Build receipt breakdown using existing fareDetails when available
          const fd = booking.fareDetails || {};
          const breakdown = {
            baseFare: fd.baseFare,
            distanceFare: fd.distanceFare,
            nightCharge: fd.nightCharge,
            nightMultiplier: fd.nightMultiplier,
            surgeMultiplier: fd.surgeMultiplier,
            cityOverridePerKm: fd.cityOverridePerKm,
            platformFee: fd.platformFee,
            platformFeeSplit: fd.platformFeeSplit,
            roundTripDiscount: fd.roundTripDiscount,
            waitingCharges: recoveryRequest.waitingCharge || 0,
            cancellationFee:
              booking?.receipt?.fareBreakdown?.cancellationFee || 0,
            vatAmount,
          };
          companyCommission = Number(breakdown.platformFee || 0);
          if (!companyCommission) {
            const pct = Number(process.env.PLATFORM_PCT || 15);
            const beforeVat = Math.max(
              0,
              totalWithVat - vatAmount
            );
            companyCommission = Math.round((beforeVat * pct) / 100);
          }
          commissionCollected = paymentMethod === "card";

          booking.receipt = booking.receipt || {};
          booking.receipt.fareBreakdown = {
            ...booking.receipt.fareBreakdown,
            ...breakdown,
            total: totalWithVat,
          };
          booking.paymentDetails = booking.paymentDetails || {};
          booking.paymentDetails.companyCommission = companyCommission;
          booking.paymentDetails.commissionCollected = commissionCollected;
          booking.paymentDetails.paymentMethod = paymentMethod;
          booking.status = "completed";
          booking.completedAt = recoveryRequest.completedAt;
          booking.fareDetails = {
            ...(booking.fareDetails || {}),
            finalFare: totalWithVat,
          };
          await booking.save();
        } else {
          await Booking.findByIdAndUpdate(
            persistId,
            {
              status: "completed",
              completedAt: recoveryRequest.completedAt,
              "fareDetails.finalFare": totalWithVat,
            },
            { new: false }
          );
        }
      }

      // If payment was cash and there is a company commission, record driver dues and enforce blocking thresholds
      try {
        const DUE_COUNT_LIMIT = Number(process.env.DUE_COUNT_LIMIT || 5);
        const DUE_AMOUNT_LIMIT = Number(process.env.DUE_AMOUNT_LIMIT || 500);
        if (
          driverIdForDues &&
          paymentMethod === "cash" &&
          companyCommission > 0
        ) {
          const driver = await User.findById(driverIdForDues).select(
            "dues statusFlags"
          );
          const currentOutstanding = Number(driver?.dues?.outstanding || 0);
          const currentCount = Number(driver?.dues?.count || 0);
          const newOutstanding = currentOutstanding + companyCommission;
          const newCount = currentCount + 1;
          const block =
            newCount >= DUE_COUNT_LIMIT || newOutstanding >= DUE_AMOUNT_LIMIT;
          await User.findByIdAndUpdate(driverIdForDues, {
            $set: {
              "dues.outstanding": newOutstanding,
              "dues.count": newCount,
              "dues.lastUpdated": new Date(),
              "statusFlags.blockedForDues": block,
            },
          });
          // Notify driver about dues status
          this.webSocketService.sendToUser(String(driverIdForDues), {
            event: block ? "driver.blocked_due" : "driver.due.updated",
            bookingId: id,
            data: {
              outstanding: undefined, // do not expose amount in event payloads by default
              count: newCount,
              blocked: block,
            },
          });
          // Notify customer with a generic indicator (no amounts)
          if (customerIdForNotify) {
            this.webSocketService.sendToUser(String(customerIdForNotify), {
              event: "driver.pending_amounts",
              bookingId: id,
              data: { pending: true },
            });
          }
        } else if (driverIdForDues && paymentMethod === "card") {
          // Commission collected via card; let driver and customer know no pending amounts
          this.webSocketService.sendToUser(String(driverIdForDues), {
            event: "driver.due.updated",
            bookingId: id,
            data: { outstanding: undefined, count: undefined, blocked: false },
          });
          if (customerIdForNotify) {
            this.webSocketService.sendToUser(String(customerIdForNotify), {
              event: "driver.pending_amounts",
              bookingId: id,
              data: { pending: false },
            });
          }
        }
      } catch (duesErr) {
        logger.warn(
          "Dues/Blocking update failed:",
          duesErr?.message || duesErr
        );
      }

      const billing = {
        base: baseTotal,
        surge: { multiplier: surgeMultiplier, amount: surged - baseTotal },
        vat: { percent: vatPercent, amount: vatAmount },
        total: totalWithVat,
        currency: "AED",
      };

      this.emitToClient(ws, {
        event: "service.completed",
        bookingId: id,
        data: {
          status: "completed",
          completedAt: recoveryRequest.completedAt,
          billing,
          // Expose generic pending amounts indicator to customer UI
          driverPendingAmounts:
            paymentMethod === "cash" && companyCommission > 0,
        },
      });

      // User-level cash abuse enforcement
      try {
        const abuseThreshold = Number(process.env.USER_CASH_ABUSE_THRESHOLD || 5);
        if (paymentMethod === 'cash') {
          // Mark booking as requiring company settlement (unpaid yet)
          booking.paymentDetails = booking.paymentDetails || {};
          if (booking.paymentDetails.companySettlementPaid !== false) {
            booking.paymentDetails.companySettlementPaid = false;
          }
          // Increment user's unsettled cash ride counter and enforce card-only if threshold reached
          const updatedUser = await User.findByIdAndUpdate(customerIdForNotify, {
            $inc: { 'policyCounters.cashUnsettledRides': 1 }
          }, { new: true, upsert: false });
          const count = Number(updatedUser?.policyCounters?.cashUnsettledRides || 0);
          if (abuseThreshold > 0 && count >= abuseThreshold) {
            await User.findByIdAndUpdate(customerIdForNotify, {
              $set: {
                'paymentPolicy.cardOnly': true,
                'policyFlags.cardOnlyReason': 'cash_abuse_threshold',
                'policyFlags.cardOnlySince': new Date(),
              }
            });
            // Notify user
            this.webSocketService.sendToUser(String(customerIdForNotify), {
              event: 'policy.card_only.enforced',
              bookingId: bid,
              data: { reason: 'cash_abuse_threshold', threshold: abuseThreshold, count }
            });
            // Notify admins
            if (this.webSocketService?.broadcastToAdmins) {
              this.webSocketService.broadcastToAdmins({
                event: 'admin.policy.card_only.enforced',
                bookingId: bid,
                data: { userId: customerIdForNotify, threshold: abuseThreshold, count }
              });
            }
          }
        } else if (paymentMethod === 'card') {
          // Reset counter on successful card ride
          await User.findByIdAndUpdate(customerIdForNotify, {
            $set: { 'policyCounters.cashUnsettledRides': 0 }
          }, { new: false });
        }
      } catch (policyErr) {
        logger.warn('Cash abuse policy evaluation failed:', policyErr?.message || policyErr);
      }
    } catch (error) {
      logger.error("Error in handleServiceComplete:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "SERVICE_COMPLETE_ERROR", message: error.message },
      });
    }
  }

  /**
   * WS Chat: send message and notify the other party
   */
  async handleRecoveryMessageSend(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const {
        message: text,
        type = "text",
        location,
        language,
        voiceToText,
        attachments,
      } = data || {};
      if (!text && type === "text") throw new Error("message is required");
      if (
        (type === "image" || type === "video") &&
        (!text || !/^https?:\/\//i.test(text))
      ) {
        throw new Error("A valid URL is required for image/video messages");
      }
      if (type === "location") {
        const lat = location?.latitude ?? location?.lat;
        const lng = location?.longitude ?? location?.lng;
        if (typeof lat !== "number" || typeof lng !== "number") {
          throw new Error(
            "Valid location coordinates are required for location messages"
          );
        }
      }
      const bid = data?.bookingId || id; // default to requestId

      const booking = await Booking.findById(bid);
      if (!booking) throw new Error("Booking not found");

      const senderId = ws?.user?.id || ws?.user?._id;
      const senderType =
        booking.user?.toString() === String(senderId) ? "user" : "driver";
      const newMsg = {
        sender: senderId,
        senderType,
        message: text || "",
        timestamp: new Date(),
        messageType: ["image", "video", "location"].includes(type)
          ? type
          : "text",
        location:
          type === "location"
            ? {
                type: "Point",
                coordinates: [
                  location.longitude ?? location.lng,
                  location.latitude ?? location.lat,
                ],
              }
            : undefined,
        language: language || undefined,
        voiceToText: voiceToText || undefined,
        attachments: Array.isArray(attachments)
          ? attachments
              .filter((a) => a?.url)
              .map((a) => ({
                url: a.url,
                type: a.type || "file",
                mime: a.mime,
                sizeBytes: a.sizeBytes,
              }))
          : undefined,
      };

      if (!booking.messages) booking.messages = [];
      booking.messages.push(newMsg);
      await booking.save();

      const recipient = senderType === "user" ? booking.driver : booking.user;
      if (recipient) {
        this.webSocketService.sendToUser(String(recipient), {
          event: "new_message",
          bookingId: id,
          data: { bookingId: bid, message: newMsg },
        });
      }

      this.emitToClient(ws, {
        event: "recovery.message.sent",
        bookingId: id,
        data: { bookingId: bid, message: newMsg },
      });
    } catch (error) {
      logger.error("Error in handleRecoveryMessageSend:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "CHAT_SEND_ERROR", message: error.message },
      });
    }
  }

  /**
   * WS Chat: get messages
   */
  async handleRecoveryMessagesGet(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const bid = data?.bookingId || id;
      const booking = await Booking.findById(bid).select(
        "messages user driver"
      );
      if (!booking) throw new Error("Booking not found");
      this.emitToClient(ws, {
        event: "recovery.messages",
        bookingId: id,
        data: { bookingId: bid, messages: booking.messages || [] },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "CHAT_GET_ERROR", message: error.message },
      });
    }
  }

  async handleRecoveryMessageRead(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      // Mark last message as read (lightweight)
      const bid = data?.bookingId || id;
      const booking = await Booking.findById(bid).select("messages");
      if (booking && booking.messages?.length) {
        booking.messages[booking.messages.length - 1].readAt = new Date();
        await booking.save();
      }
      this.emitToClient(ws, {
        event: "recovery.message.read.ack",
        bookingId: id,
        data: { bookingId: bid },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "CHAT_READ_ERROR", message: error.message },
      });
    }
  }

  async handleRecoveryTyping(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    // Relay typing to the other party without persistence
    try {
      const bid = data?.bookingId || id;
      const booking = await Booking.findById(bid).select("user driver");
      if (!booking) throw new Error("Booking not found");
      const senderId = ws?.user?.id || ws?.user?._id;
      const recipient =
        String(booking.user) === String(senderId)
          ? booking.driver
          : booking.user;
      if (recipient) {
        this.webSocketService.sendToUser(String(recipient), {
          event: "recovery.typing",
          bookingId: id,
          data: { bookingId: bid, typing: true },
        });
      }
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "CHAT_TYPING_ERROR", message: error.message },
      });
    }
  }

  /** Discovery filters **/
  async handleDiscoveryFiltersSet(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const rec = this.activeRecoveries.get(id);
      if (!rec) throw new Error("Recovery request not found");
      // Enforce: Pink captain not eligible for Car Recovery (per product rule)
      if (
        (data?.pinkCaptainOnly || data?.preferences?.pinkCaptainOnly) &&
        (rec.serviceType?.toLowerCase?.() === "towing" ||
          rec.serviceType?.toLowerCase?.() === "winching" ||
          rec.serviceType?.toLowerCase?.() === "roadside")
      ) {
        throw new Error("Pink captain not eligible for car recovery");
      }

      rec.discoveryFilters = {
        pinkCaptainOnly: !!(
          data?.pinkCaptainOnly || data?.preferences?.pinkCaptainOnly
        ),
        safety: {
          familyWithGuardianMale: !!data?.preferences?.familyWithGuardianMale,
          noMaleCompanion: !!data?.preferences?.noMaleCompanion,
          maleWithoutFemale: !!data?.preferences?.maleWithoutFemale,
        },
        // New: dispatch preference - favourite | pinned | female_only
        preferredDispatch: {
          mode:
            data?.dispatchPreference ||
            data?.preferredDispatch?.mode ||
            data?.preferences?.dispatchMode ||
            rec.discoveryFilters?.preferredDispatch?.mode ||
            null,
          driverId:
            data?.pinnedDriverId ||
            data?.preferredDispatch?.driverId ||
            data?.preferences?.pinnedDriverId ||
            rec.discoveryFilters?.preferredDispatch?.driverId ||
            null,
        },
      };
      this.activeRecoveries.set(id, rec);
      this.emitToClient(ws, {
        event: "discovery.filters.updated",
        bookingId: id,
        data: rec.discoveryFilters,
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "FILTERS_SET_ERROR", message: error.message },
      });
    }
  }

  /** Favourites and direct dispatch **/
  async handleFavouritesAdd(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const userId = ws?.user?.id || ws?.user?._id;
      if (!data?.driverId) throw new Error("driverId is required");
      await User.findByIdAndUpdate(userId, {
        $addToSet: { favoriteDrivers: data.driverId },
      });
      this.emitToClient(ws, {
        event: "favourites.added",
        bookingId: id,
        data: { driverId: data.driverId },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "FAV_ADD_ERROR", message: error.message },
      });
    }
  }

  async handleFavouritesList(ws, message) {
    const { bookingId, requestId } = message || {};
    const id = bookingId || requestId;

    try {
      const user = await User.findById(ws?.user?.id || ws?.user?._id).populate(
        "favoriteDrivers",
        "firstName lastName phoneNumber currentLocation"
      );
      this.emitToClient(ws, {
        event: "favourites.list",
        bookingId: id,
        data: { drivers: user?.favoriteDrivers || [] },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "FAV_LIST_ERROR", message: error.message },
      });
    }
  }

  async handleFavouritesRemove(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const userId = ws?.user?.id || ws?.user?._id;
      if (!data?.driverId) throw new Error("driverId is required");
      await User.findByIdAndUpdate(userId, {
        $pull: { favoriteDrivers: data.driverId },
      });
      this.emitToClient(ws, {
        event: "favourites.removed",
        bookingId: id,
        data: { driverId: data.driverId },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "FAV_REMOVE_ERROR", message: error.message },
      });
    }
  }

  async handleBookingToFavourite(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const { driverId } = data || {};
      if (!driverId) throw new Error("driverId is required");
      // Notify target favourite driver
      this.webSocketService.sendToUser(String(driverId), {
        event: "newRecoveryRequest",
        bookingId: id,
        data: { bookingId: id, direct: true },
      });
      this.emitToClient(ws, {
        event: "booking.toFavourite.ack",
        bookingId: id,
        data: { driverId },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "BOOK_TO_FAV_ERROR", message: error.message },
      });
    }
  }

  /** Multi-stop rules (lightweight) **/
  async handleMultiStopSet(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const rec = this.activeRecoveries.get(id);
      if (!rec) throw new Error("Recovery request not found");
      rec.multiStop = {
        enabled: !!data?.enabled,
        stops: Array.isArray(data?.stops) ? data.stops : [],
      };
      this.activeRecoveries.set(id, rec);
      this.emitToClient(ws, {
        event: "multiStop.updated",
        bookingId: id,
        data: rec.multiStop,
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "MULTISTOP_SET_ERROR", message: error.message },
      });
    }
  }

  async handleMultiStopRules(ws, message) {
    const { bookingId, requestId } = message || {};
    const id = bookingId || requestId;

    // For now return a static rule that some drivers may disable multi-stop
    this.emitToClient(ws, {
      event: "multiStop.rules.response",
      bookingId: id,
      data: { allowed: true, driverOptOut: true },
    });
  }

  /** Overtime / waiting consent **/
  async handleWaitingConsent(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const rec = this.activeRecoveries.get(id);
      if (!rec) throw new Error("Recovery request not found");
      rec.waitingConsent = { action: data?.action, at: new Date() };
      this.activeRecoveries.set(id, rec);
      this.emitToClient(ws, {
        event: "service.waiting.consent.ack",
        bookingId: id,
        data: rec.waitingConsent,
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "WAITING_CONSENT_ERROR", message: error.message },
      });
    }
  }

  /**
   * Get available drivers near a pickup location (simple geospatial query)
   * @param {{ coordinates: { lat: number, lng: number } | { latitude: number, longitude: number } }} pickupLocation
   * @param {number} maxDistanceKm
   */
  async getAvailableDrivers(pickupLocation, maxDistanceKm = 100, filters = {}) {
    try {
      if (!pickupLocation) return [];

      // Normalize coordinates
      let lat =
        pickupLocation.lat ??
        pickupLocation.latitude ??
        pickupLocation.coordinates?.lat ??
        pickupLocation.coordinates?.latitude;
      let lng =
        pickupLocation.lng ??
        pickupLocation.longitude ??
        pickupLocation.coordinates?.lng ??
        pickupLocation.coordinates?.longitude;
      // Support GeoJSON Point { type: 'Point', coordinates: [lng, lat] }
      if (
        (typeof lat !== "number" || typeof lng !== "number") &&
        Array.isArray(pickupLocation.coordinates) &&
        pickupLocation.coordinates.length >= 2
      ) {
        lng = pickupLocation.coordinates[0];
        lat = pickupLocation.coordinates[1];
      }
      if (typeof lat !== "number" || typeof lng !== "number") return [];

      // Find available drivers near the pickup location
      // Uses User model with role 'driver', geospatial index on currentLocation
      const query = {
        role: "driver",
        kycLevel: { $gte: 2 },
        kycStatus: "approved",
        isActive: true,
        "statusFlags.blockedForDues": { $ne: true },
        // Enforce: Pink captains are NOT eligible for Car Recovery
        "driverSettings.ridePreferences.pinkCaptainMode": { $ne: true },
        driverStatus: filters.onlyAssignable
          ? "online"
          : { $in: ["online", "on_ride", "busy"] },
        currentLocation: {
          $near: {
            $geometry: { type: "Point", coordinates: [lng, lat] },
            $maxDistance: maxDistanceKm * 1000,
          },
        },
      };

      // Apply discovery filters
      if (filters.pinkCaptainOnly) {
        query.gender = "female";
        // If gender filter helps further restrict pink captains, keep it optional
        query["driverSettings.ridePreferences.pinkCaptainMode"] = true;
      }
      if (filters?.safety?.noMaleCompanion) {
        // Map to driver preference: acceptFemaleOnly
        query["driverSettings.ridePreferences.acceptFemaleOnly"] = true;
      }
      if (filters?.safety?.familyWithGuardianMale) {
        // Requires driver flag; if present, enforce
        query["driverSettings.ridePreferences.allowFamilyWithGuardian"] = true;
      }
      if (filters?.safety?.maleWithoutFemale) {
        // Requires driver flag; if present, enforce
        query["driverSettings.ridePreferences.allowMaleWithoutFemale"] = true;
      }
      if (filters?.multiStopEnabled === true) {
        // Exclude drivers who explicitly disabled multi-stop
        query["driverSettings.ridePreferences.allowMultiStop"] = { $ne: false };
      }

      // Apply preferred dispatch filters
      const mode = String(filters?.preferredDispatch?.mode || "").toLowerCase();
      const pinnedId = filters?.preferredDispatch?.driverId;
      if (mode === "female_only") {
        query.gender = "female";
      }
      if (mode === "pinned" && pinnedId) {
        query._id = String(pinnedId);
      } else if (mode === "favorite") {
        // Restrict to user's favourite drivers
        try {
          let favIds = filters?.favoriteDriverIds || [];
          if ((!favIds || favIds.length === 0) && filters?.favoriteUserId) {
            const user = await User.findById(filters.favoriteUserId).select(
              "favoriteDrivers"
            );
            favIds = (user?.favoriteDrivers || []).map((x) => String(x));
          }
          if (favIds?.length) {
            query._id = { $in: favIds };
          } else {
            // No favourites: return empty list
            return [];
          }
        } catch {}
      }

      const drivers = await User.find(query)
        .limit(10)
        .select(
          "_id firstName lastName phoneNumber currentLocation driverStatus dues.outstanding statusFlags.blockedForDues"
        );

      // Map to the shape expected by findAndAssignDriver
      return drivers.map((d) => {
        let distanceKmDriver = null;
        let etaMinutes = null;
        if (
          Array.isArray(d.currentLocation?.coordinates) &&
          d.currentLocation.coordinates.length >= 2
        ) {
          const dlat = d.currentLocation.coordinates[1];
          const dlng = d.currentLocation.coordinates[0];
          distanceKmDriver = this._calcDistanceKm(
            { lat, lng },
            { lat: dlat, lng: dlng }
          );
          const avgSpeed = 30; // km/h
          etaMinutes = Math.ceil((distanceKmDriver / avgSpeed) * 60);
        }
        return {
          id: d._id.toString(),
          name: `${d.firstName ?? ""}`.trim(),
          phone: d.phoneNumber,
          rating: 5,
          status: d.driverStatus,
          pendingAmounts: Number(d?.dues?.outstanding || 0) > 0,
          distanceKm: distanceKmDriver,
          etaMinutes,
          location: d.currentLocation
            ? {
                coordinates: {
                  lat: d.currentLocation.coordinates?.[1],
                  lng: d.currentLocation.coordinates?.[0],
                },
              }
            : null,
        };
      });
    } catch (e) {
      logger.error("Error querying available drivers:", e);
      return [];
    }
  }

  /** Presence: driver enroute */
  async handlePresenceEnroute(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const rec = this.activeRecoveries.get(id);
      if (!rec) throw new Error("Recovery request not found");
      rec.status = "enroute";
      rec.statusHistory.push({
        status: "enroute",
        timestamp: new Date(),
        driverId: data?.driverId,
      });
      this.activeRecoveries.set(id, rec);
      this.emitToClient(ws, {
        event: "presence.enroute",
        bookingId: id,
        data: { status: "enroute", timestamp: new Date() },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "PRESENCE_ENROUTE_ERROR", message: error.message },
      });
    }
  }

  async handlePresenceStatus(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const rec = this.activeRecoveries.get(id);
      if (!rec) throw new Error("Recovery request not found");
      const status = data?.status || "update";
      rec.statusHistory.push({
        status,
        timestamp: new Date(),
        note: data?.note,
        driverId: data?.driverId,
      });
      // Refreshment alert for long duration > 30 minutes since service start
      try {
        if (rec?.serviceStartAt && !rec.refreshmentTimeAlerted) {
          const mins =
            (Date.now() - new Date(rec.serviceStartAt).getTime()) / 60000;
          if (mins > 30) {
            rec.refreshmentTimeAlerted = true;
            this.emitToClient(ws, {
              event: "refreshment.alert",
              bookingId: id,
              data: { reason: "duration", thresholdMinutes: 30 },
            });
          }
          // Emit popup when free stay fully ends (once)
          if (mins > 30 && !rec.freeStay.endedNotified) {
            rec.freeStay.endedNotified = true;
            this.emitToClient(ws, {
              event: "freeStay.ended",
              bookingId: id,
              data: {
                title: "Free Stay Time Ended – Select Action",
                options: [
                  {
                    action: "continue_no_overtime",
                    label: "Continue – No Overtime Charges",
                  },
                  { action: "start_overtime", label: "Start Overtime Charges" },
                ],
              },
            });
          }
        }
      } catch {}
      this.activeRecoveries.set(id, rec);
      this.emitToClient(ws, {
        event: "presence.status",
        bookingId: id,
        data: { status, note: data?.note, timestamp: new Date() },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "PRESENCE_STATUS_ERROR", message: error.message },
      });
    }
  }

  async handleDriverCancel(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const rec = this.activeRecoveries.get(id);
      if (!rec) throw new Error("Recovery request not found");
      if (!data?.driverId || String(rec.driverId) !== String(data.driverId)) {
        throw new Error("Driver not authorized to cancel this request");
      }

      // Unassign driver and update status
      rec.status = "pending";
      rec.driverId = null;
      rec.statusHistory.push({
        status: "driver_cancelled",
        timestamp: new Date(),
        driverId: data.driverId,
        reason: data?.reason,
      });
      this.activeRecoveries.set(id, rec);

      // Re-broadcast to nearby qualified drivers
      const df = rec.discoveryFilters || {};
      df.favoriteUserId = rec.userId;
      const nearbyDrivers = await this.getAvailableDrivers(
        rec.pickupLocation,
        rec.searchRadiusKm || 25,
        df
      );

      // Notify new candidates
      for (const d of nearbyDrivers) {
        this.webSocketService.sendToUser(String(d.id), {
          event: "newRecoveryRequest",
          bookingId: id,
          data: { bookingId: id, pickupLocation: rec.pickupLocation },
        });
      }
      this.emitToClient(ws, {
        event: "driver.cancelled.rebroadcast",
        bookingId: id,
        data: { candidates: nearbyDrivers.length },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "DRIVER_CANCEL_ERROR", message: error.message },
      });
    }
  }

  /** Saved Locations */
  async handleSavedLocationAdd(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const userId = ws?.user?.id || ws?.user?._id;
      if (!userId) throw new Error("Unauthenticated");
      if (!data?.name || !data?.coordinates)
        throw new Error("name and coordinates are required");
      const lat = data.coordinates.lat ?? data.coordinates.latitude;
      const lng = data.coordinates.lng ?? data.coordinates.longitude;
      await User.findByIdAndUpdate(userId, {
        $addToSet: {
          savedLocations: {
            name: data.name,
            address: data.address || "",
            coordinates: { lat, lng },
          },
        },
      });
      this.emitToClient(ws, {
        event: "savedLocations.added",
        bookingId: id,
        data: { name: data.name },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "SAVED_LOC_ADD_ERROR", message: error.message },
      });
    }
  }
  async handleSavedLocationList(ws, message) {
    const { bookingId, requestId } = message || {};
    const id = bookingId || requestId;

    try {
      const user = await User.findById(ws?.user?.id || ws?.user?._id).select(
        "savedLocations"
      );
      this.emitToClient(ws, {
        event: "savedLocations.list",
        bookingId: id,
        data: { locations: user?.savedLocations || [] },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "SAVED_LOC_LIST_ERROR", message: error.message },
      });
    }
  }
  async handleSavedLocationRemove(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const userId = ws?.user?.id || ws?.user?._id;
      if (!data?.name) throw new Error("name is required");
      await User.findByIdAndUpdate(userId, {
        $pull: { savedLocations: { name: data.name } },
      });
      this.emitToClient(ws, {
        event: "savedLocations.removed",
        bookingId: id,
        data: { name: data.name },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "SAVED_LOC_REMOVE_ERROR", message: error.message },
      });
    }
  }

  /** Ratings, Tips, Billing */
  async handleTipAdd(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const amount = Number(data?.amount || 0);
      if (amount <= 0) throw new Error("Invalid tip amount");
      await Booking.findByIdAndUpdate(id, {
        $set: { "paymentDetails.tip": amount },
      });
      this.emitToClient(ws, {
        event: "tip.added",
        bookingId: id,
        data: { amount },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "TIP_ADD_ERROR", message: error.message },
      });
    }
  }
  async handleBillingGet(ws, message) {
    const { bookingId, requestId } = message || {};
    const id = bookingId || requestId;

    try {
      const booking = await Booking.findById(id).select(
        "receipt fareDetails paymentDetails completedAt"
      );
      if (!booking) throw new Error("Booking not found");
      this.emitToClient(ws, {
        event: "billing.details",
        bookingId: id,
        data: {
          receipt: booking.receipt || null,
          fareDetails: booking.fareDetails || {},
          paymentDetails: booking.paymentDetails || {},
          completedAt: booking.completedAt || null,
        },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "BILLING_GET_ERROR", message: error.message },
      });
    }
  }

  /** Chat file upload (base64 -> server URL) */
  async handleChatUpload(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const { filename, contentBase64, mime } = data || {};
      if (!filename || !contentBase64)
        throw new Error("filename and contentBase64 are required");
      // Basic validation for allowed mime types
      const allowed = ["image/", "video/", "audio/", "application/pdf"];
      if (mime && !allowed.some((p) => mime.startsWith(p))) {
        throw new Error("Unsupported file type");
      }
      // Decode and save under uploads/chat
      const fs = await import("fs");
      const path = await import("path");
      const dir = path.resolve(process.cwd(), "uploads", "chat");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const safeName = `${Date.now()}_${filename.replace(
        /[^a-zA-Z0-9_.-]/g,
        ""
      )}`;
      const filePath = path.join(dir, safeName);
      const buffer = Buffer.from(contentBase64, "base64");
      fs.writeFileSync(filePath, buffer);
      const fileUrl = `/uploads/chat/${safeName}`; // assuming static serving of uploads

      this.emitToClient(ws, {
        event: "chat.uploaded",
        bookingId: id,
        data: { url: fileUrl, mime },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "CHAT_UPLOAD_ERROR", message: error.message },
      });
    }
  }

  /**
   * WS handler for post-ride ratings (customer/driver) persisted on Booking with socket notifications;
   * and broadcast admin notification when repeat-pair fraud flag is raised.
   */
  async handleRatingSubmit(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      if (!id || !data) throw new Error("bookingId and data are required");
      const { role, stars, text } = data;
      const actorId = ws?.user?.id || ws?.user?._id;
      const booking = await Booking.findById(id).select("user driver ratings");
      if (!booking) throw new Error("Booking not found");

      const s = Math.max(1, Math.min(5, Number(stars || 0)));
      booking.ratings = booking.ratings || {};

      if (String(role).toLowerCase() === "customer") {
        // Only the customer linked to the booking can submit this
        if (String(actorId) !== String(booking.user))
          throw new Error("Unauthorized");
        booking.ratings.customer = {
          stars: s,
          text: text || "",
          at: new Date(),
        };
        await booking.save();

        // Notify driver
        if (booking.driver) {
          this.webSocketService.sendToUser(String(booking.driver), {
            event: "rating.received",
            bookingId: id,
            data: { from: "customer", stars: s },
          });
        }
      } else if (String(role).toLowerCase() === "driver") {
        // Only the driver linked to the booking can submit this
        if (String(actorId) !== String(booking.driver))
          throw new Error("Unauthorized");
        booking.ratings.driver = {
          stars: s,
          text: text || "",
          at: new Date(),
        };
        await booking.save();

        // Notify customer
        if (booking.user) {
          this.webSocketService.sendToUser(String(booking.user), {
            event: "rating.received",
            bookingId: id,
            data: { from: "driver", stars: s },
          });
        }
      } else {
        throw new Error('Invalid role; expected "customer" or "driver"');
      }

      // Acknowledge sender
      this.emitToClient(ws, {
        event: "rating.submitted",
        bookingId: id,
        data: { role: String(role).toLowerCase(), stars: s },
      });

      // Optional: notify admins on very low ratings
      try {
        if (s <= 2 && this.webSocketService?.broadcastToAdmins) {
          this.webSocketService.broadcastToAdmins({
            event: "admin.rating.low",
            bookingId: id,
            data: {
              role: String(role).toLowerCase(),
              stars: s,
              at: new Date(),
            },
          });
        }
      } catch (adminRateErr) {
        logger.warn(
          "Admin low-rating broadcast failed:",
          adminRateErr?.message || adminRateErr
        );
      }
    } catch (error) {
      logger.error("Error in handleRatingSubmit:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: { code: "RATING_SUBMIT_ERROR", message: error.message },
      });
    }
  }

  // Helper: Haversine distance in KM between two { lat, lng }
  _calcDistanceKm(from, to) {
    const fromLat = from?.lat ?? from?.latitude;
    const fromLng = from?.lng ?? from?.longitude;
    const toLat = to?.lat ?? to?.latitude;
    const toLng = to?.lng ?? to?.longitude;

    if ([fromLat, fromLng, toLat, toLng].some((v) => typeof v !== "number")) {
      return 0;
    }

    const R = 6371; // km
    const dLat = ((toLat - fromLat) * Math.PI) / 180;
    const dLon = ((toLng - fromLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((fromLat * Math.PI) / 180) *
        Math.cos((toLat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  }

  async handleDriverAvailability(ws, message) {
    const online = message?.data?.online === true;
    try {
      const driverId = ws?.user?.id || ws?.user?._id;
      if (!driverId) throw new Error('Unauthenticated');
      await User.findByIdAndUpdate(driverId, { $set: { isActive: online, driverStatus: online ? 'online' : 'offline', lastActiveAt: new Date() } });
      this.emitToClient(ws, { event: 'driver.availability.ack', data: { online } });
    } catch (e) {
      this.emitToClient(ws, { event: 'error', error: { code: 'DRIVER_AVAIL_ERROR', message: e.message } });
    }
  }

  async handleUserLocationUpdate(ws, message) {
    const { bookingId, requestId, data } = message || {};
    const id = bookingId || requestId;

    try {
      const lat = data?.location?.latitude ?? data?.location?.lat;
      const lng = data?.location?.longitude ?? data?.location?.lng;
      if (!id || typeof lat !== 'number' || typeof lng !== 'number') throw new Error('Invalid');
      this._recordTrack(id, 'user', lat, lng);
      this.emitToClient(ws, { event: 'user.location.updated.ack', bookingId: id });
    } catch (e) {
      this.emitToClient(ws, { event: 'error', bookingId: id, error: { code: 'USER_LOC_UPDATE_ERROR', message: e.message } });
    }
  }

  async handleFareOffer(ws, message) {
    const { bookingId, requestId, data } = message || {}; const id = bookingId || requestId;

    try {
      const booking = await Booking.findById(id).select('fareDetails user driver');
      const actorId = (ws?.user?.id || ws?.user?._id)?.toString();
      const amt = Number(data?.amount || 0);

      if (booking) {
        const isDriver = actorId && booking.driver && actorId === String(booking.driver);
        if (isDriver) { const lock = this.negotiationLocks.get(actorId); if (lock && lock !== id.toString()) throw new Error('Driver already negotiating another request'); this.negotiationLocks.set(actorId, id.toString()); }
        booking.fareDetails = booking.fareDetails || {}; const prev = booking.fareDetails.negotiation || {};
        booking.fareDetails.negotiation = { ...prev, enabled: true, state: 'proposed', selectedFare: amt, history: [ ...(prev.history || []), { by: isDriver ? 'driver' : 'customer', type: 'offer', amount: amt, at: new Date() } ] };
        await booking.save(); const recipient = isDriver ? booking.user : booking.driver; if (recipient) this.webSocketService.sendToUser(String(recipient), { event: 'fare.offer', bookingId: id, data: { amount: amt } });
        this.emitToClient(ws, { event: 'fare.offer.ack', bookingId: id, data: { ok: true } });
        return;
      }

      // In-memory negotiation on requestId
      const req = this.activeRecoveries.get(id);
      if (!req) throw new Error('Request not found');
      const isDriver = actorId && req.driverId && actorId === String(req.driverId);
      if (isDriver) { const lock = this.negotiationLocks.get(actorId); if (lock && lock !== id.toString()) throw new Error('Driver already negotiating another request'); this.negotiationLocks.set(actorId, id.toString()); }
      const prev = req.fareContext?.negotiation || {};
      req.fareContext = req.fareContext || {};
      req.fareContext.negotiation = { ...prev, enabled: true, state: 'proposed', selectedFare: amt, history: [ ...(prev.history || []), { by: isDriver ? 'driver' : 'customer', type: 'offer', amount: amt, at: new Date() } ] };
      const recipient = isDriver ? req.userId : req.driverId;
      if (recipient) this.webSocketService.sendToUser(String(recipient), { event: 'fare.offer', bookingId: id, data: { amount: amt } });
      this.emitToClient(ws, { event: 'fare.offer.ack', bookingId: id, data: { ok: true } });
    } catch (e) { this.emitToClient(ws, { event: 'error', bookingId: id, error: { code: 'FARE_OFFER_ERROR', message: e.message } }); }
  }

  async handleFareCounter(ws, message) {
    const { bookingId, requestId, data } = message || {}; const id = bookingId || requestId;

    try {
      const booking = await Booking.findById(id).select('fareDetails user driver');
      const actorId = (ws?.user?.id || ws?.user?._id)?.toString();
      const amt = Number(data?.amount || 0);

      if (booking) {
        const isDriver = actorId && booking.driver && actorId === String(booking.driver);
        if (isDriver) { const lock = this.negotiationLocks.get(actorId); if (lock && lock !== id.toString()) throw new Error('Driver already negotiating another request'); this.negotiationLocks.set(actorId, id.toString()); }
        booking.fareDetails = booking.fareDetails || {}; const prev = booking.fareDetails.negotiation || {};
        booking.fareDetails.negotiation = { ...prev, enabled: true, state: 'countered', selectedFare: amt, history: [ ...(prev.history || []), { by: isDriver ? 'driver' : 'customer', type: 'counter', amount: amt, at: new Date() } ] };
        await booking.save(); const recipient = isDriver ? booking.user : booking.driver; if (recipient) this.webSocketService.sendToUser(String(recipient), { event: 'fare.counter', bookingId: id, data: { amount: amt } });
        this.emitToClient(ws, { event: 'fare.counter.ack', bookingId: id, data: { ok: true } });
        return;
      }

      // In-memory negotiation on requestId
      const req = this.activeRecoveries.get(id);
      if (!req) throw new Error('Request not found');
      const isDriver = actorId && req.driverId && actorId === String(req.driverId);
      if (isDriver) { const lock = this.negotiationLocks.get(actorId); if (lock && lock !== id.toString()) throw new Error('Driver already negotiating another request'); this.negotiationLocks.set(actorId, id.toString()); }
      const prev = req.fareContext?.negotiation || {};
      req.fareContext = req.fareContext || {};
      req.fareContext.negotiation = { ...prev, enabled: true, state: 'countered', selectedFare: amt, history: [ ...(prev.history || []), { by: isDriver ? 'driver' : 'customer', type: 'counter', amount: amt, at: new Date() } ] };
      const recipient = isDriver ? req.userId : req.driverId;
      if (recipient) this.webSocketService.sendToUser(String(recipient), { event: 'fare.counter', bookingId: id, data: { amount: amt } });
      this.emitToClient(ws, { event: 'fare.counter.ack', bookingId: id, data: { ok: true } });
    } catch (e) { this.emitToClient(ws, { event: 'error', bookingId: id, error: { code: 'FARE_COUNTER_ERROR', message: e.message } }); }
  }

  async handleFareAccept(ws, message) {
    const id = message?.bookingId || message?.requestId;

    try {
      // If booking doesn't exist yet, create it now from in-memory request and negotiation context
      let booking = await Booking.findById(id).select('fareDetails user driver status');
      if (!booking) {
        const req = this.activeRecoveries.get(id);
        if (!req) throw new Error('Booking not found');
        const selFare = Number(req?.fareContext?.negotiation?.selectedFare || req?.fareContext?.estimatedFare || 0);
        const bookingDoc = new Booking({
          user: req.userId,
          serviceType: req.serviceType,
          serviceCategory: req.serviceCategory,
          pickupLocation: req.pickupLocation,
          dropoffLocation: req.dropoffLocation,
          distance: req.distance,
          distanceInMeters: req.distanceInMeters,
          fare: selFare,
          offeredFare: selFare,
          vehicleDetails: req.vehicleDetails || {},
          status: 'pending',
          createdAt: new Date(),
          fareDetails: {
            estimatedDistance: req.fareContext?.estimatedDistance,
            estimatedFare: req.fareContext?.estimatedFare,
            currency: req.fareContext?.currency || 'AED',
            negotiation: { ...(req.fareContext?.negotiation || {}), selectedFare: selFare }
          }
        });
        booking = await bookingDoc.save();
        // Map temporary requestId -> real bookingId
        req.bookingId = booking._id.toString();
        try {
          if (!this.requestIdToBookingId) this.requestIdToBookingId = new Map();
          this.requestIdToBookingId.set(id, req.bookingId);
        } catch {}
        this.emitToClient(ws, { event: 'booking.persisted', bookingId: req.bookingId, data: { bookingId: req.bookingId, requestId: id } });
      }
      booking.fareDetails = booking.fareDetails || {};
      const sel = Number(booking.fareDetails?.negotiation?.selectedFare || booking.fareDetails?.estimatedFare || 0);
      booking.fareDetails.negotiation = {
        ...(booking.fareDetails.negotiation || {}),
        enabled: true,
        state: 'accepted',
        finalFare: sel > 0 ? sel : booking.fareDetails.finalFare,
        history: [ ...(booking.fareDetails.negotiation?.history || []), { type: 'accept', at: new Date() } ],
      };
      await booking.save();
      // Release lock if held
      try { if (booking.driver) this.negotiationLocks.delete(String(booking.driver)); } catch {}
      // Notify both parties
      if (booking.user) this.webSocketService.sendToUser(String(booking.user), { event: 'fare.accepted', bookingId: id, data: { finalFare: booking.fareDetails.negotiation.finalFare } });
      if (booking.driver) this.webSocketService.sendToUser(String(booking.driver), { event: 'fare.accepted', bookingId: id, data: { finalFare: booking.fareDetails.negotiation.finalFare } });
      this.emitToClient(ws, { event: 'fare.accept.ack', bookingId: id, data: { ok: true } });
    } catch (e) { this.emitToClient(ws, { event: 'error', bookingId: id, error: { code: 'FARE_ACCEPT_ERROR', message: e.message } }); }
  }

  async handleFareReject(ws, message) {
    const id = message?.bookingId || message?.requestId;

    try {
      const booking = await Booking.findById(id).select('fareDetails user driver');
      if (booking) {
        const prev = booking.fareDetails?.negotiation || {};
        booking.fareDetails = booking.fareDetails || {};
        booking.fareDetails.negotiation = { ...prev, enabled: true, state: 'rejected', history: [ ...(prev.history || []), { type: 'reject', at: new Date() } ] };
        await booking.save(); try { if (booking.driver) this.negotiationLocks.delete(String(booking.driver)); } catch {}
        if (booking.user) this.webSocketService.sendToUser(String(booking.user), { event: 'fare.rejected', bookingId: id });
        if (booking.driver) this.webSocketService.sendToUser(String(booking.driver), { event: 'fare.rejected', bookingId: id });
        this.emitToClient(ws, { event: 'fare.reject.ack', bookingId: id });
        return;
      }

      // In-memory reject on requestId
      const req = this.activeRecoveries.get(id);
      if (!req) throw new Error('Request not found');
      const prev = req.fareContext?.negotiation || {};
      req.fareContext = req.fareContext || {};
      req.fareContext.negotiation = { ...prev, enabled: true, state: 'rejected', history: [ ...(prev.history || []), { type: 'reject', at: new Date() } ] };
      try { if (req.driverId) this.negotiationLocks.delete(String(req.driverId)); } catch {}
      if (req.userId) this.webSocketService.sendToUser(String(req.userId), { event: 'fare.rejected', bookingId: id });
      if (req.driverId) this.webSocketService.sendToUser(String(req.driverId), { event: 'fare.rejected', bookingId: id });
      this.emitToClient(ws, { event: 'fare.reject.ack', bookingId: id });
    } catch (e) { this.emitToClient(ws, { event: 'error', bookingId: id, error: { code: 'FARE_REJECT_ERROR', message: e.message } }); }
  }

  _recordTrack(id, role, lat, lng) {
    if (!this.locationTracks.has(id)) this.locationTracks.set(id, { driver: [], user: [] });
    const entry = this.locationTracks.get(id);
    entry[role].push({ lat, lng, at: Date.now() });
    // keep last 50 points per role
    if (entry[role].length > 50) entry[role] = entry[role].slice(-50);
    this.locationTracks.set(id, entry);
  }
}

export default RecoveryHandler;
