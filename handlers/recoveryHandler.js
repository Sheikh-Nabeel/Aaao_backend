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
import { createHash } from "crypto";
import redis from "../services/redisClient.js";

import { calculateComprehensiveFare } from "../utils/comprehensiveFareCalculator.js";

// Dynamic pricing helpers (waiting/cancellation) from ComprehensivePricing
async function _getActiveComprehensiveConfig() {
  return await ComprehensivePricing.findOne({ isActive: true }).lean();
}

function _resolveCRWaitingCharges(comp) {
  const cr = comp?.serviceTypes?.carRecovery?.waitingCharges;
  const top = comp?.waitingCharges;
  return {
    freeMinutes: Number(cr?.freeMinutes ?? top?.freeMinutes ?? 5),
    perMinuteRate: Number(cr?.perMinuteRate ?? top?.perMinuteRate ?? 2),
    maximumCharge: Number(cr?.maximumCharge ?? top?.maximumCharge ?? 20),
  };
}

function _resolveCRCancellationCharges(comp) {
  const cr = comp?.serviceTypes?.carRecovery?.cancellationCharges;
  const top = comp?.cancellationCharges;
  return {
    before25Percent: Number(
      cr?.before25Percent ??
        top?.before25Percent ??
        cr?.beforeArrival ??
        top?.beforeArrival ??
        2
    ),
    after25Percent: Number(cr?.after25Percent ?? top?.after25Percent ?? 0),
    after50Percent: Number(cr?.after50Percent ?? top?.after50Percent ?? 5),
    afterArrival: Number(cr?.afterArrival ?? top?.afterArrival ?? 10),
  };
}

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
      "driver.reject",
      this.handleRejectRequest.bind(this)
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
    this.webSocketService.on(
      "recovery.waiting.startOvertime",
      this.handleWaitingStartOvertime.bind(this)
    );
    this.webSocketService.on(
      "recovery.waiting.continue",
      this.handleWaitingContinue.bind(this)
    );

    this.webSocketService.on(
      "driver.location.get",
      this.handleGetDriverLocationRealtime.bind(this)
    );

    this.webSocketService.on(
      "driver.location.request",
      this.handleGetDriverLocationRealtime.bind(this)
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
    if (typeof this.handleDriverAvailability === "function") {
      this.webSocketService.on(
        "driver.availability",
        this.handleDriverAvailability.bind(this)
      );
    }
    if (typeof this.handleUserLocationUpdate === "function") {
      this.webSocketService.on(
        "user.location.update",
        this.handleUserLocationUpdate.bind(this)
      );
    }

    // Negotiation WS
    if (typeof this.handleFareOffer === "function") {
      this.webSocketService.on("fare.offer", this.handleFareOffer.bind(this));
    }
    if (typeof this.handleFareCounter === "function") {
      this.webSocketService.on(
        "fare.counter",
        this.handleFareCounter.bind(this)
      );
    }
    if (typeof this.handleFareAccept === "function") {
      this.webSocketService.on("fare.accept", this.handleFareAccept.bind(this));
    }
    if (typeof this.handleFareReject === "function") {
      this.webSocketService.on("fare.reject", this.handleFareReject.bind(this));
    }

    if (typeof this.handleBookingDetails === "function") {
      this.webSocketService.on(
        "booking.details",
        this.handleBookingDetails.bind(this)
      );
    }
  }

  /**
   * Handle recovery request from client
   */
  async handleRecoveryRequest(ws, message) {
    const { data } = message || {};

    try {
      // Basic required fields
      if (!data || !data.pickupLocation || !data.serviceType) {
        throw new Error(
          "Missing required fields: pickupLocation and serviceType are required"
        );
      }

      const norm = (s) =>
        String(s || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_");

      // Identify creator
      const creatorId =
        ws?.user?.id ||
        ws?.user?._id?.toString?.() ||
        data.customerId ||
        data.userId ||
        null;

      // Extract coordinates from payload
      const pLat =
        data.pickupLocation?.coordinates?.lat ??
        data.pickupLocation?.coordinates?.latitude;
      const pLng =
        data.pickupLocation?.coordinates?.lng ??
        data.pickupLocation?.coordinates?.longitude;

      const dLat =
        (data.destinationLocation || data.dropoffLocation)?.coordinates?.lat ??
        (data.destinationLocation || data.dropoffLocation)?.coordinates
          ?.latitude;
      const dLng =
        (data.destinationLocation || data.dropoffLocation)?.coordinates?.lng ??
        (data.destinationLocation || data.dropoffLocation)?.coordinates
          ?.longitude;

      // Validate numeric coordinates
      if (typeof pLat !== "number" || typeof pLng !== "number") {
        throw new Error("pickupLocation.coordinates {lat,lng} must be numbers");
      }
      if (dLat != null || dLng != null) {
        if (typeof dLat !== "number" || typeof dLng !== "number") {
          throw new Error(
            "dropoffLocation.coordinates {lat,lng} must be numbers"
          );
        }
      }

      // Build GeoJSON locations
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

      // Distance
      const distanceKm =
        this._calcDistanceKm(
          { lat: pickupGeo.coordinates[1], lng: pickupGeo.coordinates[0] },
          { lat: dropoffGeo.coordinates[1], lng: dropoffGeo.coordinates[0] }
        ) || 0;
      const distanceInMeters = Math.round(distanceKm * 1000);

      // Search radius (default bumped to 15km, clamp 1..50)
      const selectedRadiusKm = Math.max(
        1,
        Math.min(50, Number(data?.searchRadiusKm ?? data?.searchRadius ?? 15))
      );

      // Map to booking enums (categorization only)
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

      const bookingServiceType = "car recovery";
      const bookingServiceCategory = mapCategory(data.serviceType);

      // Infer a recovery vehicle type for pricing (optional)
      const mapRecoveryVehicleType = (subService, serviceType) => {
        const v = String(subService || serviceType || "")
          .toLowerCase()
          .trim();
        if (v.includes("flatbed")) return "flatbed";
        if (v.includes("wheel") || v.includes("wheel_lift")) return "wheelLift";
        if (v.includes("jump")) return "jumpstart";
        if (v.includes("fuel")) return "fuelDelivery";
        if (v.includes("tire")) return "tirePunctureRepair";
        if (v.includes("battery")) return "batteryReplacement";
        if (v.includes("key") || v.includes("unlock")) return "keyUnlocker";
        return null;
      };
      const recoveryVehicleType = mapRecoveryVehicleType(
        data?.subService,
        data?.serviceType
      );

      // Estimate fare using comprehensive pricing
      let computedFareBreakdown;
      try {
        computedFareBreakdown = await calculateComprehensiveFare({
          serviceType: bookingServiceType, // "car recovery"
          vehicleType: recoveryVehicleType,
          distance: distanceKm, // km
          routeType: "one_way",
          estimatedDuration: Number(data?.estimatedDuration || 0),
          waitingMinutes: Number(data?.options?.waitingTime || 0),
        });
      } catch {
        computedFareBreakdown = {
          totalFare: 0,
          currency: "AED",
          breakdown: [],
        };
      }
      const estimatedFare = Number(computedFareBreakdown?.totalFare || 0);
      const currencyFromConfig = computedFareBreakdown?.currency || "AED";

      // Idempotency
      const clientKey =
        data?.idempotencyKey ||
        data?.clientRequestId ||
        data?.requestKey ||
        null;
      const idempotencyKey =
        clientKey ||
        createHash("sha256")
          .update(
            [
              String(creatorId || "anonymous"),
              Number(pLat) || 0,
              Number(pLng) || 0,
              Number(dLat ?? pLat) || 0,
              Number(dLng ?? pLng) || 0,
              String(data.serviceType || "")
                .trim()
                .toLowerCase(),
              String(data?.subService || "")
                .trim()
                .toLowerCase(),
            ].join("|")
          )
          .digest("hex")
          .slice(0, 48);

      // Atomic insert
      const insertDoc = {
        idempotencyKey,
        user: creatorId,
        serviceType: bookingServiceType,
        serviceCategory: bookingServiceCategory,
        pickupLocation: pickupGeo,
        dropoffLocation: dropoffGeo,
        distance: distanceKm,
        distanceInMeters,
        fare: Number(estimatedFare) || 0,
        offeredFare:
          Number(
            typeof data?.estimatedFare === "number"
              ? data.estimatedFare
              : typeof data?.estimated?.amount === "number"
              ? data.estimated.amount
              : estimatedFare
          ) || 0,
        vehicleDetails: data.vehicleDetails || {},
        status: "pending",
        createdAt: new Date(),
        fareDetails: {
          estimatedDistance: distanceKm,
          estimatedFare: estimatedFare,
          currency: currencyFromConfig,
          breakdown: computedFareBreakdown?.breakdown || [],
        },
      };

      let upserted;
      try {
        upserted = await Booking.findOneAndUpdate(
          { idempotencyKey },
          { $setOnInsert: insertDoc },
          { upsert: true, new: true, projection: "_id" }
        );
      } catch (e) {
        if (String(e?.code) === "11000") {
          upserted = await Booking.findOne({ idempotencyKey }).select("_id");
        } else {
          throw e;
        }
      }
      const bid = String(upserted._id);

      // Cache minimal request in memory
      const recoveryRequest = {
        requestId: bid,
        status: "pending",
        createdAt: new Date(),
        ...data,
        userId: creatorId,
        driverId: null,
        driverLocation: null,
        statusHistory: [
          {
            status: "pending",
            timestamp: new Date(),
            message: "Recovery request created",
          },
        ],
        bookingId: bid,
        searchRadiusKm: selectedRadiusKm,
        discoveryFilters: {
          pinkCaptainOnly: !!(
            data?.pinkCaptainOnly || data?.preferences?.pinkCaptainOnly
          ),
          safety: {
            familyWithGuardianMale: !!data?.preferences?.familyWithGuardianMale,
            noMaleCompanion: !!data?.preferences?.noMaleCompanion,
            maleWithoutFemale: !!data?.preferences?.maleWithoutFemale,
          },
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
        fareContext: {
          estimatedDistance: distanceKm,
          estimatedFare: estimatedFare,
          currency: "AED",
          clientEstimatedFare:
            typeof data?.estimatedFare === "number"
              ? data.estimatedFare
              : typeof data?.estimated?.amount === "number"
              ? data.estimated.amount
              : estimatedFare,
        },
        pickupLocation: pickupGeo,
        dropoffLocation: dropoffGeo,
        distance: distanceKm,
        distanceInMeters,
        serviceType: bookingServiceType,
        serviceCategory: bookingServiceCategory,
        vehicleDetails: data.vehicleDetails || {},
      };
      this.activeRecoveries.set(bid, recoveryRequest);

      // Allowed fare adjustment for requester
      const adjustment = await (async () => {
        try {
          const pc = await PricingConfig.findOne({
            serviceType: "car_recovery",
            isActive: true,
          }).lean();
          const cfg = pc?.fareAdjustmentSettings || {
            allowedAdjustmentPercentage: 3,
          };
          const pct = Number(cfg.allowedAdjustmentPercentage || 3);
          const base =
            (typeof data?.estimatedFare === "number"
              ? data.estimatedFare
              : typeof data?.estimated?.amount === "number"
              ? data.estimated.amount
              : estimatedFare) || 0;
          const minFare = Math.round(base * (1 - pct / 100) * 100) / 100;
          const maxFare = Math.round(base * (1 + pct / 100) * 100) / 100;
          return { allowedPct: pct, min: minFare, max: maxFare };
        } catch {
          const pct = 3;
          const base =
            (typeof data?.estimatedFare === "number"
              ? data.estimatedFare
              : typeof data?.estimated?.amount === "number"
              ? data.estimated.amount
              : estimatedFare) || 0;
          const minFare = Math.round(base * (1 - pct / 100) * 100) / 100;
          const maxFare = Math.round(base * (1 + pct / 100) * 100) / 100;
          return { allowedPct: pct, min: minFare, max: maxFare };
        }
      })();

      // Notify requester request created
      this.emitToClient(ws, {
        event: "recovery.request_created",
        bookingId: bid,
        data: {
          status: "pending",
          estimatedTime: "Calculating...",
          message: "Looking for available drivers",
          fare: {
            estimated: {
              admin: undefined,
              customer:
                typeof data?.estimatedFare === "number"
                  ? data.estimatedFare
                  : typeof data?.estimated?.amount === "number"
                  ? data.estimated.amount
                  : estimatedFare,
            },
            finalFare: null,
            adjustment,
          },
        },
      });

      // Nearby drivers (first pass)
      const nearbyDrivers1 = await this.getAvailableDrivers(
        recoveryRequest.pickupLocation,
        recoveryRequest.searchRadiusKm || 15,
        recoveryRequest.discoveryFilters || {}
      );

      // Second-chance discovery if first pass returns none
      let finalDrivers = nearbyDrivers1;
      if (!finalDrivers || finalDrivers.length === 0) {
        // 1) Try larger radius
        const widerRadius = Math.min(
          50,
          Math.ceil((recoveryRequest.searchRadiusKm || 15) * 1.5)
        );
        const attempt2 = await this.getAvailableDrivers(
          recoveryRequest.pickupLocation,
          widerRadius,
          recoveryRequest.discoveryFilters || {}
        );
        finalDrivers = attempt2;

        // 2) Try ignoreGeo to compute via DB/Redis without $near
        if (!finalDrivers || finalDrivers.length === 0) {
          const filters2 = {
            ...(recoveryRequest.discoveryFilters || {}),
            ignoreGeo: true,
          };
          const attempt3 = await this.getAvailableDrivers(
            recoveryRequest.pickupLocation,
            widerRadius,
            filters2
          );
          finalDrivers = attempt3;
        }
      }

      // Emit available drivers to requester
      this.emitToClient(ws, {
        event: "carRecovery:driversAvailable",
        bookingId: bid,
        data: {
          drivers: finalDrivers,
          count: finalDrivers.length,
          updatedAt: new Date(),
          dispatchMode:
            recoveryRequest.discoveryFilters?.preferredDispatch?.mode || null,
        },
      });

      // NEW: Notify each discovered driver about the new recovery request
      try {
        const targets = (finalDrivers || [])
          .map((d) => String(d.id || d._id || "").trim())
          .filter(Boolean);

        for (const driverId of targets) {
          this.webSocketService.sendToUser(driverId, {
            event: "newRecoveryRequest",
            bookingId: bid,
            data: {
              bookingId: bid,
              serviceType: bookingServiceType,
              serviceCategory: bookingServiceCategory,
              pickupLocation: pickupGeo,
              dropoffLocation: dropoffGeo,
              distanceKm,
              estimatedFare,
              at: new Date().toISOString(),
            },
          });
        }
      } catch (e) {
        logger.warn("Broadcast to drivers failed:", e?.message || e);
      }
    } catch (error) {
      logger.error("Error in handleRecoveryRequest:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: null,
        error: { code: "RECOVERY_REQUEST_ERROR", message: error.message },
      });
    }
  }

  /**
   * Handle driver assignment
   */
  async handleDriverAssignment(ws, message) {
    // Normalize payload
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const bookingId = String(data?.bookingId || msg?.bookingId || "").trim();
    const driverId = String(data?.driverId || "").trim();

    try {
      if (!bookingId || !driverId) {
        throw new Error(
          "Missing required fields: bookingId and driverId are required"
        );
      }

      // Disallow assignment to cancelled/completed
      const target = await Booking.findById(bookingId).select(
        "status user pickupLocation dropoffLocation serviceType serviceCategory distance distanceInMeters fareDetails"
      );
      if (!target) throw new Error("Recovery request not found");
      if (["cancelled", "completed"].includes(target.status)) {
        throw new Error(`Cannot assign driver to a ${target.status} booking`);
      }

      // Driver validations
      const driver = await User.findById(driverId).select(
        "role kycStatus kycLevel isActive driverStatus"
      );
      if (!driver || driver.role !== "driver")
        throw new Error("Invalid driver");
      if (
        !(driver.kycStatus === "approved" && Number(driver.kycLevel || 0) >= 2)
      ) {
        throw new Error("Driver KYC not approved");
      }
      if (!(driver.isActive === true && driver.driverStatus === "online")) {
        throw new Error("Driver is not online/available");
      }

      // Set pending assignment on this booking (DB is source of truth)
      await Booking.findByIdAndUpdate(
        bookingId,
        {
          $set: {
            pendingAssignment: {
              driverId,
              proposedAt: new Date(),
              status: "pending_acceptance",
            },
            "fareDetails.negotiation.state": "open",
            "fareDetails.negotiation.updatedAt": new Date(),
          },
        },
        { new: false }
      );

      // Optional cache
      let rec = this.activeRecoveries.get(bookingId) || {
        bookingId,
        userId: target.user,
        pickupLocation: target.pickupLocation,
        dropoffLocation: target.dropoffLocation,
        serviceType: target.serviceType || "car recovery",
        serviceCategory: target.serviceCategory || null,
        distance: target.distance || 0,
        distanceInMeters: target.distanceInMeters || 0,
        status: target.status || "pending",
        statusHistory: [],
      };
      rec.pendingAssignment = { driverId, proposedAt: new Date() };
      this.activeRecoveries.set(bookingId, rec);

      // Notify customer + driver
      this.emitToClient(ws, {
        event: "driver.assignment.requested",
        bookingId,
        data: {
          driverId,
          status: "pending_acceptance",
          proposedAt: rec.pendingAssignment.proposedAt,
          requiresAcceptance: true,
          negotiationRequired: true,
        },
      });
      try {
        this.webSocketService.sendToUser(driverId, {
          event: "driver.assignment.request",
          bookingId,
          data: {
            status: "pending_acceptance",
            requiresAcceptance: true,
            negotiationRequired: true,
          },
        });
      } catch {}
    } catch (error) {
      logger.error("Error in handleDriverAssignment:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId,
        error: {
          code: "DRIVER_ASSIGNMENT_ERROR",
          message: error.message || "Failed to request driver assignment",
        },
      });
    }
  }

  /**
   * Handle driver accepting a recovery request
   */
  async handleAcceptRequest(ws, message) {
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const bookingId = String(data?.bookingId || msg?.bookingId || "").trim();
    const driverId = String(data?.driverId || "").trim();

    try {
      if (!bookingId || !driverId) {
        throw new Error(
          "Missing required fields: bookingId and driverId are required"
        );
      }

      const booking = await Booking.findById(bookingId).select(
        "fareDetails user driver status"
      );
      if (!booking) throw new Error("Recovery request not found");
      if (
        ["accepted", "in_progress", "completed", "cancelled"].includes(
          booking.status
        )
      ) {
        throw new Error(`Booking already ${booking.status}, cannot accept`);
      }

      // Driver identity & state
      const driver = await User.findById(driverId).select(
        "role kycStatus kycLevel isActive driverStatus"
      );
      if (!driver || driver.role !== "driver")
        throw new Error("Invalid driver");
      if (
        !(driver.kycStatus === "approved" && Number(driver.kycLevel || 0) >= 2)
      ) {
        throw new Error("Driver KYC not approved");
      }
      if (!(driver.isActive === true && driver.driverStatus === "online")) {
        throw new Error("Driver is not online");
      }

      // Require negotiation accepted OR final fare present
      const negotiationState = booking?.fareDetails?.negotiation?.state;
      const hasFinalFare =
        typeof booking?.fareDetails?.finalFare?.amount === "number" &&
        booking.fareDetails.finalFare.amount > 0;
      if (negotiationState !== "accepted" && !hasFinalFare) {
        throw new Error(
          "Price must be accepted before driver can accept the job"
        );
      }

      // Persist accept
      await Booking.findByIdAndUpdate(
        bookingId,
        {
          $set: {
            status: "accepted",
            driver: driverId,
            acceptedAt: new Date(),
          },
          $unset: { pendingAssignment: "" },
        },
        { new: false }
      );

      // Cache
      let rec = this.activeRecoveries.get(bookingId) || {};
      rec.status = "accepted";
      rec.acceptedAt = new Date();
      rec.driverId = driverId;
      rec.statusHistory = rec.statusHistory || [];
      rec.statusHistory.push({
        status: "accepted",
        timestamp: new Date(),
        driverId,
        message: "Driver accepted the recovery request",
      });
      delete rec.pendingAssignment;
      this.activeRecoveries.set(bookingId, rec);

      // Notify
      this.emitToClient(ws, {
        event: "recovery.accepted",
        bookingId,
        data: {
          status: "accepted",
          acceptedAt: rec.acceptedAt,
          driverId,
        },
      });

      // NEW: Notify customer that the driver is en route ("I'm coming")
      try {
        if (booking?.user) {
          this.webSocketService.sendToUser(String(booking.user), {
            event: "driver.enroute",
            bookingId,
            data: {
              message: "I'm coming",
              at: new Date(),
              driverId,
            },
          });
        }
      } catch {}
    } catch (error) {
      logger.error("Error in handleAcceptRequest:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId,
        error: {
          code: "ACCEPT_REQUEST_ERROR",
          message: error.message || "Failed to accept recovery request",
        },
      });
    }
  }

  /**
   * Handle driver rejecting a pending assignment (pre-acceptance)
   */
  async handleRejectRequest(ws, message) {
    // Normalize
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const bookingId = String(data?.bookingId || msg?.bookingId || "").trim();
    const driverId = String(data?.driverId || "").trim();

    try {
      if (!bookingId || !driverId) {
        throw new Error(
          "Missing required fields: bookingId and driverId are required"
        );
      }

      const booking = await Booking.findById(bookingId).select(
        "status pendingAssignment user"
      );
      if (!booking) throw new Error("Recovery request not found");
      if (["accepted", "in_progress"].includes(booking.status)) {
        throw new Error("Cannot reject after acceptance has occurred");
      }
      if (
        !booking.pendingAssignment ||
        String(booking.pendingAssignment.driverId) !== String(driverId)
      ) {
        throw new Error("No pending assignment for this driver to reject");
      }

      await Booking.findByIdAndUpdate(
        bookingId,
        {
          $unset: { pendingAssignment: "" },
          $set: {
            "fareDetails.negotiation.state": "stopped",
            "fareDetails.negotiation.endedAt": new Date(),
          },
        },
        { new: false }
      );

      // Cache
      let rec = this.activeRecoveries.get(bookingId) || {};
      delete rec.pendingAssignment;
      rec.statusHistory = rec.statusHistory || [];
      rec.statusHistory.push({
        status: "driver_assignment_rejected",
        timestamp: new Date(),
        driverId,
        message: "Driver rejected the assignment request",
      });
      this.activeRecoveries.set(bookingId, rec);

      // Notify both
      this.emitToClient(ws, {
        event: "driver.assignment.rejected",
        bookingId,
        data: {
          driverId,
          status: "rejected",
          rejectedAt: new Date(),
        },
      });
      try {
        if (booking.user) {
          this.webSocketService.sendToUser(String(booking.user), {
            event: "driver.assignment.rejected",
            bookingId,
            data: { driverId, status: "rejected", rejectedAt: new Date() },
          });
        }
      } catch {}
    } catch (error) {
      logger.error("Error in handleRejectRequest:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: bookingId || null,
        error: {
          code: "REJECT_REQUEST_ERROR",
          message: error.message || "Failed to reject driver assignment",
        },
      });
    }
  }

  /**
   * Handle driver arrival
   */
  async handleDriverArrival(ws, message) {
    // Normalize message (string or object)
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};

    // Resolve bookingId from multiple shapes
    const normalizeId = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };

    const id =
      [
        msg.bookingId,
        data.bookingId,
        payload.bookingId,
        body.bookingId,
        msg.id,
        data.id,
        payload.id,
        body.id,
      ]
        .map(normalizeId)
        .find((v) => typeof v === "string" && v.length > 0) || null;

    try {
      if (!id) throw new Error("bookingId is required");
      const driverId = normalizeId(
        data?.driverId || payload?.driverId || body?.driverId
      );
      if (!driverId) throw new Error("driverId is required");

      // Driver location (optional)
      const loc = data?.location || data?.coordinates || {};
      const lat = loc.latitude ?? loc.lat;
      const lng = loc.longitude ?? loc.lng;

      // Load booking and validate driver
      const booking = await Booking.findById(id).select(
        "driver status fareDetails"
      );
      if (!booking) throw new Error("Recovery request not found");
      if (booking.driver && String(booking.driver) !== String(driverId)) {
        throw new Error("Driver not assigned to this booking");
      }

      // Persist arrival state to DB
      const arrivalAt = new Date();
      const update = {
        $set: {
          status: "driver_arrived",
          driverArrivalTime: arrivalAt,
          waiting: { startedAt: arrivalAt },
        },
        $push: {
          statusHistory: {
            status: "driver_arrived",
            timestamp: arrivalAt,
            driverId,
            location:
              typeof lat === "number" && typeof lng === "number"
                ? { lat, lng }
                : undefined,
            message: "Driver arrived at pickup location",
          },
        },
      };
      await Booking.findByIdAndUpdate(id, update, { new: false });

      // Load admin-configured waiting charges BEFORE constructing payload
      let waitCfg;
      try {
        const comp = await _getActiveComprehensiveConfig();
        waitCfg = _resolveCRWaitingCharges(comp);
      } catch {}

      // Emit success event
      this.emitToClient(ws, {
        event: "driver.arrived",
        bookingId: id,
        data: {
          arrivalTime: arrivalAt.toISOString(),
          freeWaitTime: waitCfg?.freeMinutes ?? 5,
          waitingCharges: {
            perMinute: waitCfg?.perMinuteRate ?? 2,
            maxCharge: waitCfg?.maximumCharge ?? 20,
          },
          driverId,
          location:
            typeof lat === "number" && typeof lng === "number"
              ? { lat, lng }
              : null,
        },
      });
    } catch (error) {
      logger.error("Error handling driver arrival:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id || null,
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
    const { bookingId, data } = message || {};
    const id = bookingId;

    try {
      const recoveryRequest = this.activeRecoveries.get(id);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      // Update waiting time and charge
      const waitingTime = data.waitingTime || 0;
      const waitingCharge = await this.calculateWaitingCharge(
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
    // Normalize
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const bookingId = String(data?.bookingId || msg?.bookingId || "").trim();

    try {
      if (!bookingId) throw new Error("bookingId is required");

      const role = String(ws?.user?.role || "").toLowerCase();
      const isDriver = role === "driver";
      const isCustomer =
        role === "user" || role === "customer" || role === "client";

      // Load booking
      const booking = await Booking.findById(bookingId).select(
        "status user driver pickupLocation dropoffLocation"
      );
      if (!booking) throw new Error("Booking not found");
      if (["cancelled", "completed"].includes(booking.status)) {
        throw new Error(`Cannot start service on a ${booking.status} booking`);
      }
      if (booking.status === "in_progress") {
        // Idempotent ack
        this.emitToClient(ws, {
          event: "recovery.started",
          bookingId,
          data: {
            status: "in_progress",
            alreadyStarted: true,
            driverId: String(booking.driver || ""),
          },
        });
        return;
      }
      if (booking.status !== "accepted") {
        throw new Error(
          `Service can be started only from accepted status (current: ${booking.status})`
        );
      }

      // Authorization
      let driverId = String(booking.driver || "") || null;
      if (!driverId)
        throw new Error("No assigned driver found on this booking");

      if (isDriver) {
        const authDriverId = String(ws?.user?.id || ws?.user?._id || "").trim();
        if (!authDriverId || authDriverId !== driverId) {
          throw new Error(
            "Not authorized: only the assigned driver can start the service"
          );
        }
        // Optional: sanity check driver status
        const drv = await User.findById(authDriverId).select(
          "role isActive driverStatus"
        );
        if (
          !drv ||
          drv.role !== "driver" ||
          !drv.isActive ||
          drv.driverStatus !== "online"
        ) {
          throw new Error(
            "Driver is not in a valid state to start the service"
          );
        }
      } else if (isCustomer) {
        const providedDriverId = data?.driverId ? String(data.driverId) : null;
        if (providedDriverId && providedDriverId !== driverId) {
          throw new Error(
            "Provided driverId does not match the assigned driver"
          );
        }
      } else {
        throw new Error(
          "Unknown actor; only assigned driver or customer can start the service"
        );
      }

      // Persist transition to in_progress
      const now = new Date();
      await Booking.findByIdAndUpdate(
        bookingId,
        {
          $set: {
            status: "in_progress",
            startedAt: now,
          },
        },
        { new: false }
      );

      // Map booking -> driver in Redis (both variants per your request)
      try {
        await redis.set(`booking:driver:${bookingId}`, String(driverId));
      } catch {}
      try {
        await redis.set(`booking:driver:${bookingId}`, String(driverId));
      } catch {}

      // Update cache
      let rec = this.activeRecoveries.get(bookingId) || {};
      rec.status = "in_progress";
      rec.startedAt = now;
      rec.driverId = driverId;
      rec.statusHistory = rec.statusHistory || [];
      rec.statusHistory.push({
        status: "in_progress",
        timestamp: now,
        driverId,
        message: "Service started",
      });
      this.activeRecoveries.set(bookingId, rec);

      // Notify both sides that service started
      this.emitToClient(ws, {
        event: "recovery.started",
        bookingId,
        data: {
          status: "in_progress",
          startedAt: now,
          driverId,
          pickupLocation: booking.pickupLocation,
          dropoffLocation: booking.dropoffLocation,
        },
      });
      try {
        const toCustomer = String(booking.user || "");
        if (toCustomer) {
          this.webSocketService.sendToUser(toCustomer, {
            event: "recovery.started",
            bookingId,
            data: {
              status: "in_progress",
              startedAt: now,
              driverId,
              pickupLocation: booking.pickupLocation,
              dropoffLocation: booking.dropoffLocation,
            },
          });
        }
        this.webSocketService.sendToUser(String(driverId), {
          event: "recovery.started",
          bookingId,
          data: {
            status: "in_progress",
            startedAt: now,
            driverId,
            pickupLocation: booking.pickupLocation,
            dropoffLocation: booking.dropoffLocation,
          },
        });
      } catch {}

      // Optional: broadcast to room to hide from other drivers
      try {
        const norm = (s) =>
          String(s || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_");
        const st = norm("car recovery");
        const roomName = `svc:${st}`;
        if (this.webSocketService?.sendToRoom) {
          this.webSocketService.sendToRoom(roomName, {
            event: "recovery.unavailable",
            bookingId,
            data: { reason: "in_progress" },
          });
        }
      } catch {}
    } catch (error) {
      logger.error("Error in handleServiceStart:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: bookingId || null,
        error: { code: "SERVICE_START_ERROR", message: error.message },
      });
    }
  }

  /**
   * Calculate total charges for the service
   */
  calculateTotalCharges(recoveryRequest) {
    // Base fare
    let total = Number(computedFareBreakdown?.totalFare || 0);
    // If you truly have manual extras, add them explicitly:
    if (recoveryRequest?.extras?.manualAdjustment) {
      total += Number(recoveryRequest.extras.manualAdjustment || 0);
    }

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
    // Normalize
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const bookingId = String(data?.bookingId || msg?.bookingId || "").trim();
    const driverId = String(data?.driverId || "").trim();
    const loc = data?.location || data?.coordinates || {};
    const lat = loc?.lat ?? loc?.latitude;
    const lng = loc?.lng ?? loc?.longitude;

    try {
      if (!bookingId || !driverId)
        throw new Error("bookingId and driverId are required");
      if (typeof lat !== "number" || typeof lng !== "number") {
        throw new Error("location {lat,lng} is required");
      }

      // Driver sanity
      const drv = await User.findById(driverId).select(
        "role kycStatus kycLevel isActive driverStatus"
      );
      if (!drv || drv.role !== "driver") throw new Error("Invalid driver");
      if (!(drv.kycStatus === "approved" && Number(drv.kycLevel || 0) >= 2)) {
        throw new Error("Driver KYC not approved");
      }
      if (!(drv.isActive === true && drv.driverStatus === "online")) {
        throw new Error("Driver is not online");
      }

      // Booking sanity
      const booking = await Booking.findById(bookingId).select(
        "user driver status"
      );
      if (!booking) throw new Error("Booking not found");
      if (!booking.driver || String(booking.driver) !== String(driverId)) {
        throw new Error("Driver not assigned to this booking");
      }

      const now = new Date();

      // 1) Broadcast to both parties for live map movement
      try {
        const targets = [];
        if (booking?.user) targets.push(String(booking.user));
        if (booking?.driver) targets.push(String(booking.driver));

        if (targets.length) {
          if (this.webSocketService?.sendToUsers) {
            this.webSocketService.sendToUsers(targets, {
              event: "driver.location",
              bookingId,
              data: { lat, lng, at: now },
            });
          } else if (this.webSocketService?.sendToUser) {
            for (const tid of targets) {
              this.webSocketService.sendToUser(tid, {
                event: "driver.location",
                bookingId,
                data: { lat, lng, at: now },
              });
            }
          }
        }
      } catch {}

      // 2) Write latest to Redis (frontend controls timing; no TTL required)
      try {
        const payload = JSON.stringify({
          lat,
          lng,
          at: now.toISOString(),
          bookingId,
        });
        await redis.set(`driver:loc:${driverId}`, payload);
        await redis.set(`booking:driver:${bookingId}`, String(driverId));
      } catch {}

      // 3) Best-effort DB snapshot (optional)
      try {
        await User.findByIdAndUpdate(
          driverId,
          {
            $set: {
              currentLocation: { type: "Point", coordinates: [lng, lat] },
              lastActiveAt: now,
            },
          },
          { new: false }
        );
      } catch {}

      // 4) Optional ACK back to sender
      this.emitToClient(ws, {
        event: "driver.location.updated",
        bookingId,
        data: { lat, lng, at: now },
      });
    } catch (error) {
      logger.error("Error in handleDriverLocationUpdate:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: bookingId || null,
        error: {
          code: "DRIVER_LOCATION_ERROR",
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
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const normalizeId = (v) => (v ? String(v).trim() : null);
    const bookingId = normalizeId(data?.bookingId || msg?.bookingId);
    const driverId = normalizeId(data?.driverId);

    try {
      if (!bookingId || !driverId)
        throw new Error("bookingId and driverId are required");
      const loc = data?.location || data?.coordinates || {};
      const lat = loc?.lat ?? loc?.latitude;
      const lng = loc?.lng ?? loc?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") {
        throw new Error("Valid driver location is required for arrival");
      }

      const booking = await Booking.findById(bookingId).select("driver status");
      if (!booking) throw new Error("Booking not found");
      if (!booking.driver || String(booking.driver) !== String(driverId)) {
        throw new Error("Driver not assigned to this booking");
      }

      // Persist arrival status as per your existing logic...
      // Example: mark a flag, push history, notify customer
      await Booking.findByIdAndUpdate(
        bookingId,
        {
          $set: { "arrival.at": new Date(), "arrival.location": { lat, lng } },
        },
        { new: false }
      );

      this.emitToClient(ws, {
        event: "driver.arrival.ack",
        bookingId,
        data: { at: new Date(), lat, lng },
      });
      // Notify customer
      try {
        this.webSocketService.sendToUser(String(booking.user), {
          event: "driver.arrived",
          bookingId,
          data: { at: new Date(), lat, lng },
        });
      } catch {}
    } catch (error) {
      logger.error("Error in handleDriverArrival:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: bookingId || null,
        error: {
          code: "DRIVER_ARRIVAL_ERROR",
          message: error.message || "Failed to record driver arrival",
        },
      });
    }
  }

  /**
   * Calculate waiting charges based on waiting time
   */
  async calculateWaitingCharge(waitingTime, recoveryRequest) {
    try {
      const comp = await _getActiveComprehensiveConfig();
      const w = _resolveCRWaitingCharges(comp);

      const rate = Number(w.perMinuteRate || 0);
      const cap = Number(w.maximumCharge || 0);

      // Base free minutes
      let free = Number(w.freeMinutes || 0);

      // Round-trip extra free stay (0.5 min per km, admin-capped; default 30)
      const isRoundTrip =
        String(recoveryRequest?.routeType || "").toLowerCase() === "two_way" ||
        String(recoveryRequest?.routeType || "").toLowerCase() === "round_trip";
      if (isRoundTrip) {
        const capExtra = Number(
          comp?.roundTrip?.freeStayMinutes?.maximumMinutes ??
            comp?.roundTripFreeStay?.maxMinutes ??
            30
        );
        const distanceKm = Number(recoveryRequest?.distance || 0);
        free += Math.min(capExtra, 0.5 * distanceKm);
        recoveryRequest.freeStay = recoveryRequest.freeStay || {
          totalMinutes: free,
        };
        recoveryRequest.freeStay.totalMinutes = free;
      }

      // Business rule: charge only if overtime explicitly active
      const overtimeActive = !!(recoveryRequest?.overtime?.active === true);
      if (!overtimeActive) return 0;

      const billable = Math.max(0, Math.ceil(Number(waitingTime || 0) - free));
      const charge = Math.min(cap, billable * rate);
      return charge;
    } catch {
      // Fallback if config missing
      const free = 5;
      const rate = 2;
      const cap = 20;
      const overtimeActive = !!(recoveryRequest?.overtime?.active === true);
      if (!overtimeActive) return 0;

      const isRoundTrip =
        String(recoveryRequest?.routeType || "").toLowerCase() === "two_way" ||
        String(recoveryRequest?.routeType || "").toLowerCase() === "round_trip";
      let freeMinutes = free;
      if (isRoundTrip) {
        const distanceKm = Number(recoveryRequest?.distance || 0);
        freeMinutes += Math.min(30, 0.5 * distanceKm);
        recoveryRequest.freeStay = recoveryRequest.freeStay || {
          totalMinutes: freeMinutes,
        };
        recoveryRequest.freeStay.totalMinutes = freeMinutes;
      }

      const billable = Math.max(
        0,
        Math.ceil(Number(waitingTime || 0) - freeMinutes)
      );
      return Math.min(cap, billable * rate);
    }
  }

  /**
   * Handle cancellation of a recovery request (DB-first, no in-memory dependency)
   */
  async handleCancelRequest(ws, message) {
    // Normalize message (supports stringified JSON or object)
    let msg = message;
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};

    // Normalize candidate id values (strings, numbers, {$oid}, {_id})
    const normalizeId = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };

    // Robustly resolve bookingId from common shapes
    const id =
      [
        msg.bookingId,
        data.bookingId,
        payload.bookingId,
        body.bookingId,
        msg.id,
        data.id,
        payload.id,
        body.id,
        msg.requestId,
        data.requestId,
        payload.requestId,
        body.requestId,
      ]
        .map(normalizeId)
        .find((v) => typeof v === "string" && v.length > 0) || null;

    if (!id) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: null,
        error: {
          code: "CANCEL_REQUEST_ERROR",
          message: "bookingId is required to cancel recovery",
        },
      });
      return;
    }

    try {
      // Load booking from DB only
      const booking = await Booking.findById(id).select(
        "user driver status paymentDetails receipt"
      );
      if (!booking) throw new Error("Recovery request not found");

      // Authorization: creator, assigned driver, or admin
      const requesterId = (
        data?.driverId ||
        data?.userId ||
        ws?.user?.id ||
        ws?.user?._id
      )?.toString?.();
      const isAdmin =
        ws?.user?.role === "admin" || ws?.user?.role === "superadmin";
      const isCreator =
        requesterId &&
        booking.user &&
        String(booking.user) === String(requesterId);
      const isAssignedDriver =
        requesterId &&
        booking.driver &&
        String(booking.driver) === String(requesterId);
      if (!isCreator && !isAssignedDriver && !isAdmin)
        throw new Error("Not authorized to cancel this request");

      // Stage + dynamic fee via admin config
      const stage = ["in_progress", "driver_arrived"].includes(booking.status)
        ? "afterArrival"
        : "before25Percent";

      let fee = 0;
      try {
        const comp = await _getActiveComprehensiveConfig();
        const cancelCfg = _resolveCRCancellationCharges(comp);
        if (stage === "afterArrival") fee = cancelCfg.afterArrival;
        else if (stage === "after50Percent") fee = cancelCfg.after50Percent;
        else if (stage === "after25Percent") fee = cancelCfg.after25Percent;
        else fee = cancelCfg.before25Percent;
      } catch {}
      const cancelledBy = isAdmin
        ? "admin"
        : isAssignedDriver
        ? "driver"
        : "customer";

      // Persist cancellation to DB (set status to cancelled)
      booking.status = "cancelled";
      booking.paymentDetails = booking.paymentDetails || {};
      booking.paymentDetails.cancellation = {
        by: cancelledBy,
        stage,
        fee,
        at: new Date(),
        reason: data?.reason,
      };
      booking.receipt = booking.receipt || {};
      booking.receipt.fareBreakdown = booking.receipt.fareBreakdown || {};
      booking.receipt.fareBreakdown.cancellationFee = fee;
      await booking.save();

      // Also unset any pendingAssignment (avoid stale state)
      try {
        await Booking.findByIdAndUpdate(
          id,
          { $unset: { pendingAssignment: "" } },
          { new: false }
        );
      } catch {}

      // Release negotiation locks for assigned or pending drivers
      try {
        if (booking.driver)
          this.negotiationLocks.delete(String(booking.driver));
      } catch {}
      try {
        // If the caller sent an explicit driverId or we kept pendingAssignment in memory, clear it defensively
        const maybePending = data?.driverId;
        if (maybePending) this.negotiationLocks.delete(String(maybePending));
      } catch {}

      // Optional: purge in-memory cache
      try {
        this.activeRecoveries.delete(String(id));
      } catch {}

      // Emit success back to requester and optionally to driver
      const payloadOut = {
        by: cancelledBy,
        stage,
        fee,
        cancelledAt: new Date(),
      };
      this.emitToClient(ws, {
        event: "recovery.cancelled",
        bookingId: id,
        data: payloadOut,
      });
      if (booking.driver) {
        try {
          this.webSocketService.sendToUser(String(booking.driver), {
            event: "recovery.cancelled",
            bookingId: id,
            data: payloadOut,
          });
        } catch {}
      }

      logger.info(
        `Booking ${id} cancelled by ${cancelledBy} (stage=${stage}, fee=${fee})`
      );
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
   * Handle fare estimation for a recovery request
   */
  async handleFareEstimate(ws, message) {
    const { bookingId, data } = message || {};
    const id = bookingId;

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

      // Negotiation window (admin configurable via env); bounds based on finalAmount
      const negotiation = {
        enabled: true,
        minPercent: Number(process.env.NEGOTIATE_MIN_PERCENT || 0),
        maxPercent: Number(process.env.NEGOTIATE_MAX_PERCENT || 20),
      };

      const response = {
        estimatedFare: {
          amount: fare.finalAmount,
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
              Math.round(fare.finalAmount * (1 - negotiation.minPercent / 100))
            ),
            max: Math.round(
              fare.finalAmount * (1 + negotiation.maxPercent / 100)
            ),
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
    // Normalize message (supports stringified JSON or object)
    let msg = message;
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};

    // Normalize candidate id values
    const normalizeId = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };
    const id =
      [
        msg.bookingId,
        data.bookingId,
        payload.bookingId,
        body.bookingId,
        msg.id,
        data.id,
        payload.id,
        body.id,
        msg.requestId,
        data.requestId,
        payload.requestId,
        body.requestId,
      ]
        .map(normalizeId)
        .find((v) => typeof v === "string" && v.length > 0) || null;

    if (!id) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: null,
        error: {
          code: "SERVICE_COMPLETE_ERROR",
          message: "bookingId is required to complete service",
        },
      });
      return;
    }

    try {
      // Persist booking status -> completed in DB
      const completedAt = new Date();
      const booking = await Booking.findByIdAndUpdate(
        id,
        { $set: { status: "completed", serviceCompletedAt: completedAt } },
        { new: true, projection: "fare receipt fareDetails user driver" }
      );
      if (!booking) {
        throw new Error("Recovery request not found");
      }

      // Optionally compute/attach final receipt summary if needed later
      // (Kept minimal per your request)

      // Emit success
      this.emitToClient(ws, {
        event: "service.completed",
        bookingId: id,
        data: { status: "completed", completedAt },
      });

      logger.info(`Service completed for booking ${id}`);

      // Lightweight debug of shape and resolved id
      try {
        logger.debug(
          `handleServiceComplete: typeof message=${typeof message}, keys(top)=${Object.keys(
            msg || {}
          )}, id=${id}`
        );
      } catch {}
    } catch (error) {
      logger.error("Error in handleServiceComplete:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: id,
        error: {
          code: "SERVICE_COMPLETE_ERROR",
          message: error.message || "Failed to complete service",
        },
      });
    }
  }

  /**
   * Handle getting available drivers for car recovery
   */
  async handleGetDrivers(ws, message) {
    // Normalize message and robustly resolve bookingId
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};
    const payloadData = payload?.data || {};

    const normalizeId = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };

    const id =
      [
        msg?.bookingId,
        data?.bookingId,
        payload?.bookingId,
        body?.bookingId,
        payloadData?.bookingId,
        msg?.id,
        data?.id,
        payload?.id,
        body?.id,
        payloadData?.id,
        msg?.requestId,
        data?.requestId,
        payload?.requestId,
        body?.requestId,
        payloadData?.requestId,
      ]
        .map(normalizeId)
        .find((v) => typeof v === "string" && v.length > 0) || null;

    if (!id) throw new Error("Missing required field: bookingId");

    // Load or reconstruct in-memory request context
    let recoveryRequest = this.activeRecoveries.get(id);
    if (!recoveryRequest) {
      const booking = await Booking.findById(id)
        .select("pickupLocation user")
        .lean();
      if (!booking || !booking.pickupLocation) {
        throw new Error("Recovery request not found");
      }
      recoveryRequest = {
        bookingId: id,
        userId: booking.user,
        pickupLocation: booking.pickupLocation,
        discoveryFilters: {},
        searchRadiusKm: Number(data?.searchRadius) || 10,
      };
    }

    // Base discovery
    const radiusKm = Math.max(
      1,
      Math.min(
        50,
        Number(data?.searchRadius) || recoveryRequest.searchRadiusKm || 10
      )
    );
    const onlyAssignable =
      data?.onlyAssignable === undefined ? true : !!data?.onlyAssignable;

    const availableDrivers = await this.getAvailableDrivers(
      recoveryRequest.pickupLocation,
      radiusKm,
      {
        ...(recoveryRequest.discoveryFilters || {}),
        onlyAssignable,
        multiStopEnabled: !!recoveryRequest?.multiStop?.enabled,
        favoriteUserId: recoveryRequest.userId,
        ignoreGeo: data?.searchRadius === undefined,
      }
    );

    // Optional: filter by service + subService room
    // Build room name as used elsewhere: svc:<serviceType>[:<subService>]
    const norm = (s) =>
      String(s || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");

    const rawServiceType = data?.serviceType || data?.service || null;
    const rawSubService = data?.subService || data?.subservice || null;
    let filteredDrivers = availableDrivers;

    if (rawServiceType || rawSubService) {
      const st = norm(rawServiceType || "car recovery");
      const sub = norm(rawSubService || "");
      const roomName = sub ? `svc:${st}:${sub}` : `svc:${st}`;

      // Intersect with drivers actually in that service room
      try {
        const room = this.webSocketService.rooms?.get(roomName);
        if (room && room.size > 0) {
          const roomUserIds = new Set(
            Array.from(room).map((ws) => String(ws.userId))
          );
          filteredDrivers = availableDrivers.filter((d) =>
            roomUserIds.has(String(d.id))
          );
        } else {
          // If the room is empty, result should be empty for this filter case
          filteredDrivers = [];
        }
      } catch {
        // If rooms map not available, skip room filtering
      }
    }

    // Respond
    this.emitToClient(ws, {
      event: "carRecovery:driversAvailable",
      bookingId: id,
      data: {
        drivers: filteredDrivers,
        count: filteredDrivers.length,
        updatedAt: new Date(),
        dispatchMode:
          recoveryRequest.discoveryFilters?.preferredDispatch?.mode || null,
        filters: {
          radiusKm,
          onlyAssignable,
          serviceType: rawServiceType || null,
          subService: rawSubService || null,
        },
      },
    });

    logger.info(
      `Sent ${filteredDrivers.length} available drivers for request ${id}`
    );
  }

  /**
   * Handle fare estimation for a recovery request
   */
  async handleFareEstimate(ws, message) {
    const { bookingId, data } = message || {};
    const id = bookingId;

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

      // Negotiation window (admin configurable via env); bounds based on finalAmount
      const negotiation = {
        enabled: true,
        minPercent: Number(process.env.NEGOTIATE_MIN_PERCENT || 0),
        maxPercent: Number(process.env.NEGOTIATE_MAX_PERCENT || 20),
      };

      const response = {
        estimatedFare: {
          amount: fare.finalAmount,
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
              Math.round(fare.finalAmount * (1 - negotiation.minPercent / 100))
            ),
            max: Math.round(
              fare.finalAmount * (1 + negotiation.maxPercent / 100)
            ),
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
        error: { code: "FARE_ESTIMATE_ERROR", message: error.message },
      });
    }
  }

  /**
   * WS Chat: send message and notify the other party
   */
  async handleRecoveryMessageSend(ws, message) {
    const { bookingId, data } = message || {};
    const id = bookingId;

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

      const booking = await Booking.findById(bid).select(
        "messages user driver"
      );
      if (!booking) throw new Error("Booking not found");

      const senderId = ws?.user?.id || ws?.user?._id;
      let senderType = "driver";
      if (booking.user && String(booking.user) === String(senderId))
        senderType = "user";
      if (booking.driver && String(booking.driver) === String(senderId))
        senderType = "driver";
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
    // Normalize message and robustly resolve bookingId
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};
    const norm = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };
    const id =
      [
        msg?.bookingId,
        data?.bookingId,
        payload?.bookingId,
        body?.bookingId,
        msg?.id,
        data?.id,
        payload?.id,
        body?.id,
        msg?.requestId,
        data?.requestId,
        payload?.requestId,
        body?.requestId,
      ]
        .map(norm)
        .find((v) => typeof v === "string" && v.length > 0) || null;

    try {
      if (!id) throw new Error("bookingId is required");
      const booking = await Booking.findById(id).select("messages user driver");
      if (!booking) throw new Error("Booking not found");
      this.emitToClient(ws, {
        event: "recovery.messages",
        bookingId: id,
        data: { bookingId: id, messages: booking.messages || [] },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id || null,
        error: { code: "CHAT_GET_ERROR", message: error.message },
      });
    }
  }

  async handleRecoveryMessageRead(ws, message) {
    // Normalize message and robustly resolve bookingId
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};
    const norm = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };
    const id =
      [
        msg?.bookingId,
        data?.bookingId,
        payload?.bookingId,
        body?.bookingId,
        msg?.id,
        data?.id,
        payload?.id,
        body?.id,
        msg?.requestId,
        data?.requestId,
        payload?.requestId,
        body?.requestId,
      ]
        .map(norm)
        .find((v) => typeof v === "string" && v.length > 0) || null;

    try {
      if (!id) throw new Error("bookingId is required");
      const booking = await Booking.findById(id).select("messages");
      if (booking && booking.messages?.length) {
        booking.messages[booking.messages.length - 1].readAt = new Date();
        await booking.save();
      }
      this.emitToClient(ws, {
        event: "recovery.message.read.ack",
        bookingId: id,
        data: { bookingId: id },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id || null,
        error: { code: "CHAT_READ_ERROR", message: error.message },
      });
    }
  }

  /** Discovery filters **/
  async handleDiscoveryFiltersSet(ws, message) {
    const { bookingId, data } = message || {};
    const id = bookingId;

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
    // Normalize
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};
    const driverId =
      (data?.driverId ?? payload?.driverId ?? body?.driverId) || null;
    const userId = (ws?.user?.id || ws?.user?._id)?.toString;

    try {
      if (!userId) throw new Error("Unauthenticated");
      if (!driverId) throw new Error("driverId is required");

      await User.findByIdAndUpdate(userId, {
        $addToSet: { favoriteDrivers: driverId },
      });

      this.emitToClient(ws, {
        event: "favourites.added",
        bookingId: null,
        data: { driverId: String(driverId) },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: null,
        error: { code: "FAV_ADD_ERROR", message: error.message },
      });
    }
  }

  async handleFavouritesList(ws, message) {
    try {
      const userId = (ws?.user?.id || ws?.user?._id)?.toString;
      if (!userId) throw new Error("Unauthenticated");
      const user = await User.findById(userId)
        .populate(
          "favoriteDrivers",
          "firstName lastName phoneNumber currentLocation currentService vehicleDetails"
        )
        .lean();

      this.emitToClient(ws, {
        event: "favourites.list",
        bookingId: null,
        data: { drivers: user?.favoriteDrivers || [] },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: null,
        error: { code: "FAV_LIST_ERROR", message: error.message },
      });
    }
  }

  async handleFavouritesRemove(ws, message) {
    // Normalize
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};
    const driverId =
      (data?.driverId ?? payload?.driverId ?? body?.driverId) || null;
    const userId = (ws?.user?.id || ws?.user?._id)?.toString;

    try {
      if (!userId) throw new Error("Unauthenticated");
      if (!driverId) throw new Error("driverId is required");
      await User.findByIdAndUpdate(userId, {
        $pull: { favoriteDrivers: driverId },
      });
      this.emitToClient(ws, {
        event: "favourites.removed",
        bookingId: null,
        data: { driverId: String(driverId) },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: null,
        error: { code: "FAV_REMOVE_ERROR", message: error.message },
      });
    }
  }

  async handleBookingToFavourite(ws, message) {
    // Normalize + resolve bookingId and driverId
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};
    const norm = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };
    const id =
      [
        msg?.bookingId,
        data?.bookingId,
        payload?.bookingId,
        body?.bookingId,
        msg?.id,
        data?.id,
        payload?.id,
        body?.id,
        msg?.requestId,
        data?.requestId,
        payload?.requestId,
        body?.requestId,
      ]
        .map(norm)
        .find((v) => typeof v === "string" && v.length > 0) || null;
    const driverId =
      (data?.driverId ?? payload?.driverId ?? body?.driverId) || null;

    try {
      if (!id) throw new Error("bookingId is required");
      if (!driverId) throw new Error("driverId is required");

      // Directly notify only the specified favourite driver
      this.webSocketService.sendToUser(String(driverId), {
        event: "newRecoveryRequest",
        bookingId: id,
        data: { bookingId: id, direct: true },
      });

      this.emitToClient(ws, {
        event: "booking.toFavourite.ack",
        bookingId: id,
        data: { driverId: String(driverId) },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id || null,
        error: { code: "BOOK_TO_FAV_ERROR", message: error.message },
      });
    }
  }

  /**
   * multiple stops: add waypoints only after service has started
   * Event: multi_stop.set
   * Payload: { bookingId, driverId? | userId?, stops: [{ lat, lng } | { latitude, longitude }] }
   */
  async handleMultiStopSet(ws, message) {
    // Normalize input
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};

    const normalizeId = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };

    const bookingId =
      [
        msg.bookingId,
        data.bookingId,
        payload.bookingId,
        body.bookingId,
        msg.id,
        data.id,
        payload.id,
        body.id,
        msg.requestId,
        data.requestId,
        payload.requestId,
        body.requestId,
      ]
        .map(normalizeId)
        .find((v) => typeof v === "string" && v.length > 0) || null;

    try {
      if (!bookingId) throw new Error("bookingId is required");

      // Prefer userId, so a customer can include driverId for routing without being misclassified
      const driverId = normalizeId(
        data?.driverId || payload?.driverId || body?.driverId
      );
      const userId = normalizeId(
        data?.userId || payload?.userId || body?.userId
      );
      const by = userId ? "customer" : "driver";
      if (by === "driver" && !driverId) throw new Error("driverId is required");
      if (by === "customer" && !userId) throw new Error("userId is required");

      // Validate stops
      const stops = data?.stops || payload?.stops || body?.stops;
      if (!Array.isArray(stops) || stops.length === 0) {
        throw new Error("stops (non-empty array) is required");
      }

      // Helpers
      const toNumber = (v) => {
        if (typeof v === "number") return v;
        if (typeof v === "string") {
          const n = parseFloat(v);
          return Number.isFinite(n) ? n : NaN;
        }
        return NaN;
      };
      const withinBounds = (lat, lng) =>
        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
      const round6 = (n) => Math.round(n * 1e6) / 1e6;

      const parseStop = (s) => {
        // Accept:
        // { lat,lng } or { latitude,longitude }
        // { coordinates: { lat,lng } | { latitude,longitude } }
        // { coordinates: [lng,lat] } or [lat,lng]
        let lat, lng;
        const coords = s?.coordinates;

        if (Array.isArray(coords) && coords.length >= 2) {
          // Try [lng,lat] first (GeoJSON)
          let candLat = toNumber(coords[1]);
          let candLng = toNumber(coords[0]);
          // If invalid or out of bounds, fallback to [lat,lng]
          if (
            !Number.isFinite(candLat) ||
            !Number.isFinite(candLng) ||
            !withinBounds(candLat, candLng)
          ) {
            candLat = toNumber(coords[0]);
            candLng = toNumber(coords[1]);
          }
          lat = candLat;
          lng = candLng;
        } else if (coords && typeof coords === "object") {
          lat = toNumber(coords.lat ?? coords.latitude);
          lng = toNumber(coords.lng ?? coords.longitude);
        } else {
          lat = toNumber(s?.lat ?? s?.latitude);
          lng = toNumber(s?.lng ?? s?.longitude);
        }

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error(
            "Each stop must include numeric lat/lng (number or numeric string)"
          );
        }
        if (!withinBounds(lat, lng)) {
          throw new Error(
            "lat must be between -90 and 90, lng between -180 and 180"
          );
        }
        return { lat: round6(lat), lng: round6(lng), addedAt: new Date() };
      };

      const newStops = stops.map(parseStop);

      // Load booking
      const booking = await Booking.findById(bookingId).select(
        "status user driver waypoints"
      );
      if (!booking) throw new Error("Booking not found");

      // Enforce: only after service has started
      if (booking.status !== "in_progress") {
        throw new Error(
          "Multiple stops can be added only after service has started"
        );
      }

      // Authorization
      if (by === "customer") {
        if (!booking.user || String(booking.user) !== String(userId)) {
          throw new Error(
            "Not authorized: only the booking owner can add stops"
          );
        }
      } else {
        if (!booking.driver || String(booking.driver) !== String(driverId)) {
          throw new Error(
            "Not authorized: only the assigned driver can add stops"
          );
        }
        // Optional driver sanity (consistent with other handlers)
        const drv = await User.findById(driverId).select(
          "role kycStatus kycLevel isActive driverStatus"
        );
        if (!drv || drv.role !== "driver") throw new Error("Invalid driver");
        if (!(drv.kycStatus === "approved" && Number(drv.kycLevel || 0) >= 2)) {
          throw new Error("Driver KYC not approved");
        }
        if (!(drv.isActive === true && drv.driverStatus === "online")) {
          throw new Error("Driver is not online");
        }
      }

      // Persist waypoints (append)
      const updatedWaypoints = Array.isArray(booking.waypoints)
        ? booking.waypoints.concat(newStops)
        : newStops;
      await Booking.findByIdAndUpdate(
        bookingId,
        { $set: { waypoints: updatedWaypoints } },
        { new: false }
      );

      // Ack to sender
      this.emitToClient(ws, {
        event: "multi_stop.updated",
        bookingId,
        data: {
          by,
          driverId: driverId || null,
          userId: userId || null,
          stops: newStops,
        },
      });

      // Notify counterparty
      try {
        const counterparty = by === "driver" ? booking.user : booking.driver;
        if (counterparty) {
          this.webSocketService.sendToUser(String(counterparty), {
            event: "multi_stop.updated",
            bookingId,
            data: {
              by,
              driverId: driverId || null,
              userId: userId || null,
              stops: newStops,
            },
          });
        }
      } catch {}
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: bookingId || null,
        error: {
          code: "MULTI_STOP_ERROR",
          message: error.message || "Failed to update multiple stops",
        },
      });
    }
  }

  async handleMultiStopRules(ws, message) {
    // Normalize message and resolve bookingId (optional)
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};
    const norm = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };
    const id =
      [
        msg?.bookingId,
        data?.bookingId,
        payload?.bookingId,
        body?.bookingId,
        msg?.id,
        data?.id,
        payload?.id,
        body?.id,
      ]
        .map(norm)
        .find((v) => typeof v === "string" && v.length > 0) || null;

    // Static response for now; can be moved to admin-config later
    this.emitToClient(ws, {
      event: "multiStop.rules.response",
      bookingId: id,
      data: { allowed: true, driverOptOut: true, maxStops: 3 },
    });
  }

  /** Overtime / waiting consent **/
  async handleWaitingConsent(ws, message) {
    // Normalize
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};
    const norm = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };
    const id =
      [
        msg?.bookingId,
        data?.bookingId,
        payload?.bookingId,
        body?.bookingId,
        msg?.id,
        data?.id,
        payload?.id,
        body?.id,
      ]
        .map(norm)
        .find((v) => typeof v === "string" && v.length > 0) || null;
    const action =
      (data?.action ?? payload?.action ?? body?.action) ||
      "continue_no_overtime";

    try {
      if (!id) throw new Error("bookingId is required");
      const at = new Date();

      // Update in-memory
      const rec = this.activeRecoveries.get(id) || {};
      rec.waitingConsent = { action, at };
      this.activeRecoveries.set(id, rec);

      // Persist to DB under booking.waiting.consent
      await Booking.findByIdAndUpdate(
        id,
        {
          $set: {
            waiting: { ...(rec.waiting || {}), consent: { action, at } },
          },
        },
        { new: false }
      );

      this.emitToClient(ws, {
        event: "service.waiting.consent.ack",
        bookingId: id,
        data: { action, at },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id || null,
        error: { code: "WAITING_CONSENT_ERROR", message: error.message },
      });
    }
  }

  async handleWaitingStartOvertime(ws, message) {
    // Normalize
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};
    const norm = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };
    const id =
      [
        msg?.bookingId,
        data?.bookingId,
        payload?.bookingId,
        body?.bookingId,
        msg?.id,
        data?.id,
        payload?.id,
        body?.id,
      ]
        .map(norm)
        .find((v) => typeof v === "string" && v.length > 0) || null;

    try {
      if (!id) throw new Error("bookingId is required");
      const startedAt = new Date();

      // In-memory
      const rec = this.activeRecoveries.get(id) || {};
      rec.overtime = { ...(rec.overtime || {}), active: true, startedAt };
      this.activeRecoveries.set(id, rec);

      // Persist to DB: booking.waiting.overtime
      await Booking.findByIdAndUpdate(
        id,
        {
          $set: {
            waiting: {
              ...(rec.waiting || {}),
              overtime: { active: true, startedAt },
            },
          },
        },
        { new: false }
      );

      this.emitToClient(ws, {
        event: "recovery.waiting.overtime.started",
        bookingId: id,
        data: { active: true, startedAt },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id || null,
        error: { code: "OVERTIME_START_ERROR", message: error.message },
      });
    }
  }

  async handleWaitingContinue(ws, message) {
    // Normalize
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};
    const norm = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };
    const id =
      [
        msg?.bookingId,
        data?.bookingId,
        payload?.bookingId,
        body?.bookingId,
        msg?.id,
        data?.id,
        payload?.id,
        body?.id,
      ]
        .map(norm)
        .find((v) => typeof v === "string" && v.length > 0) || null;

    try {
      if (!id) throw new Error("bookingId is required");
      const stoppedAt = new Date();

      // In-memory
      const rec = this.activeRecoveries.get(id) || {};
      rec.overtime = { ...(rec.overtime || {}), active: false, stoppedAt };
      this.activeRecoveries.set(id, rec);

      // Persist to DB: booking.waiting.overtime
      await Booking.findByIdAndUpdate(
        id,
        {
          $set: {
            waiting: {
              ...(rec.waiting || {}),
              overtime: { active: false, stoppedAt },
            },
          },
        },
        { new: false }
      );

      this.emitToClient(ws, {
        event: "recovery.waiting.overtime.continued",
        bookingId: id,
        data: { active: false, stoppedAt },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id || null,
        error: { code: "OVERTIME_CONTINUE_ERROR", message: error.message },
      });
    }
  }

  /** Presence: driver enroute */
  async handlePresenceEnroute(ws, message) {
    const { bookingId, data } = message || {};
    const id = bookingId;

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
    const { bookingId, data } = message || {};
    const id = bookingId;

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
    // Normalize message
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};
    const norm = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };
    const id =
      [
        msg?.bookingId,
        data?.bookingId,
        payload?.bookingId,
        body?.bookingId,
        msg?.id,
        data?.id,
        payload?.id,
        body?.id,
        msg?.requestId,
        data?.requestId,
        payload?.requestId,
        body?.requestId,
      ]
        .map(norm)
        .find((v) => typeof v === "string" && v.length > 0) || null;
    const driverId = norm(
      data?.driverId ??
        payload?.driverId ??
        body?.driverId ??
        ws?.user?.id ??
        ws?.user?._id
    );

    try {
      if (!id) throw new Error("bookingId is required");
      if (!driverId) throw new Error("Driver unauthenticated");

      // Load booking from DB
      const booking = await Booking.findById(id).select(
        "user driver status pickupLocation serviceType"
      );
      if (!booking) throw new Error("Recovery request not found");
      if (!booking.driver || String(booking.driver) !== driverId) {
        throw new Error("Driver not assigned to this booking");
      }
      if (["in_progress", "completed", "cancelled"].includes(booking.status)) {
        throw new Error(`Cannot cancel at status ${booking.status}`);
      }

      // Persist unassignment and status back to pending
      await Booking.findByIdAndUpdate(
        id,
        { $set: { driver: null, status: "pending" } },
        { new: false }
      );

      // Update in-memory cache if present
      const rec = this.activeRecoveries.get(id) || {};
      rec.driverId = null;
      rec.status = "pending";
      rec.statusHistory = rec.statusHistory || [];
      rec.statusHistory.push({
        status: "driver_cancelled",
        timestamp: new Date(),
        driverId,
        reason: data?.reason || payload?.reason || body?.reason,
      });
      this.activeRecoveries.set(id, rec);

      // Notify customer
      if (booking.user) {
        this.webSocketService.sendToUser(String(booking.user), {
          event: "driver.cancelled",
          bookingId: id,
          data: {
            driverId,
            reason: data?.reason || payload?.reason || body?.reason,
          },
        });
      }

      // Re-broadcast request to eligible drivers: intersect nearby + service room
      const pickup = rec.pickupLocation || booking.pickupLocation;
      const radiusKm = Math.max(
        1,
        Math.min(50, Number(rec.searchRadiusKm || 10))
      );
      const filters = rec.discoveryFilters || {};
      const nearbyDrivers = await this.getAvailableDrivers(
        pickup,
        radiusKm,
        filters
      );
      const driverIds = nearbyDrivers.map((d) => String(d.id));
      if (driverIds.length > 0) {
        const st = String(booking.serviceType || "car recovery")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_");
        const sub = String(rec?.subService || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_");
        const roomName = sub ? `svc:${st}:${sub}` : `svc:${st}`;
        this.webSocketService.sendToRoomUsers(roomName, driverIds, {
          event: "newRecoveryRequest",
          bookingId: id,
          data: { bookingId: id, pickupLocation: pickup },
        });
      }

      // Ack driver
      this.emitToClient(ws, {
        event: "driver.cancel.ack",
        bookingId: id,
        data: { ok: true },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: id || null,
        error: { code: "DRIVER_CANCEL_ERROR", message: error.message },
      });
    }
  }

  /** Saved Locations */
  async handleSavedLocationAdd(ws, message) {
    const { bookingId, data } = message || {};
    const id = bookingId;

    try {
      const userId = ws?.user?.id || ws?.user?._id;
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
    const { bookingId } = message || {};
    const id = bookingId;

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
    const { bookingId, data } = message || {};
    const id = bookingId;

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
    const { bookingId, data } = message || {};
    const id = bookingId;

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
    const { bookingId } = message || {};
    const id = bookingId;

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
    const { bookingId, data } = message || {};
    const id = bookingId;

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
    const { bookingId, data } = message || {};
    const id = bookingId;

    try {
      if (!id || !data) throw new Error("bookingId and data are required");
      const { role, stars, text } = data;
      const actorId = ws?.user?.id || ws?.user?._id;
      const booking = await Booking.findById(id).select("messages");
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

  /**
   * Negotiation: accept current fare (driver or customer) -> lock final fare
   * Expected message: { bookingId, data: { amount: number, by: 'driver'|'customer' } }
   */
  async handleFareAccept(ws, message) {
    // Normalize
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const bookingId = String(data?.bookingId || msg?.bookingId || "").trim();
    const role = String(ws?.user?.role || "").toLowerCase();
    const isDriver = role === "driver";
    const isCustomer =
      role === "user" || role === "customer" || role === "client";
    const currency = data?.currency || "AED";

    try {
      if (!bookingId) throw new Error("bookingId is required");

      const booking = await Booking.findById(bookingId).select(
        "status user driver pendingAssignment fareDetails pickupLocation dropoffLocation"
      );
      if (!booking) throw new Error("Booking not found");
      if (["cancelled", "completed"].includes(booking.status)) {
        throw new Error(`Cannot accept fare on a ${booking.status} booking`);
      }
      if (["accepted", "in_progress"].includes(booking.status)) {
        // Idempotent ack
        this.emitToClient(ws, {
          event: "fare.accept.ack",
          bookingId,
          data: {
            status: booking.status,
            driverId: String(booking.driver || ""),
          },
        });
        return;
      }

      // Resolve driverId
      let driverId = null;
      if (isDriver) {
        driverId = String(ws?.user?.id || ws?.user?._id || "").trim();
        if (!driverId) throw new Error("driver identity required");
      } else if (isCustomer) {
        driverId = String(data?.driverId || "").trim();
        if (!driverId) {
          driverId = booking?.driver
            ? String(booking.driver)
            : booking?.pendingAssignment?.driverId
            ? String(booking.pendingAssignment.driverId)
            : "";
        }
        if (!driverId)
          throw new Error("driverId is required for customer acceptance");
      } else {
        driverId = String(data?.driverId || "").trim();
        if (!driverId) throw new Error("driverId is required");
      }

      // Validate driver
      const driver = await User.findById(driverId).select(
        "role kycStatus kycLevel isActive driverStatus"
      );
      if (!driver || driver.role !== "driver")
        throw new Error("Invalid driver");
      if (
        !(driver.kycStatus === "approved" && Number(driver.kycLevel || 0) >= 2)
      ) {
        throw new Error("Driver KYC not approved");
      }
      if (!(driver.isActive === true && driver.driverStatus === "online")) {
        throw new Error("Driver is not online");
      }

      // Determine final amount
      const proposed = booking?.fareDetails?.negotiation?.proposed || {};
      const lastAmount =
        typeof data?.amount === "number" &&
        Number.isFinite(data.amount) &&
        data.amount > 0
          ? data.amount
          : typeof proposed?.amount === "number" &&
            Number.isFinite(proposed.amount) &&
            proposed.amount > 0
          ? proposed.amount
          : typeof booking?.fareDetails?.estimatedFare === "number"
          ? booking.fareDetails.estimatedFare
          : Number(booking?.fareDetails?.estimatedFare?.amount || 0) || 0;

      const now = new Date();

      // Persist acceptance and assignment
      await Booking.findByIdAndUpdate(
        bookingId,
        {
          $set: {
            status: "accepted",
            driver: driverId,
            acceptedAt: now,
            "fareDetails.finalFare": {
              amount: lastAmount,
              currency,
              by: isDriver ? "driver" : "customer",
              at: now,
            },
            "fareDetails.negotiation.state": "accepted",
            "fareDetails.negotiation.endedAt": now,
            "fareDetails.negotiation.history": [
              ...(booking?.fareDetails?.negotiation?.history || []),
              {
                action: "accept",
                by: isDriver ? "driver" : "customer",
                amount: lastAmount,
                currency,
                at: now,
              },
            ],
          },
          $unset: { pendingAssignment: "" },
        },
        { new: false }
      );

      // Map booking -> driver in Redis (both variants per your request)
      try {
        await redis.set(`booking:driver:${bookingId}`, String(driverId));
      } catch {}
      try {
        await redis.set(`booking:driver:${bookingId}`, String(driverId));
      } catch {}

      // Update cache
      let rec = this.activeRecoveries.get(bookingId) || {};
      rec.status = "accepted";
      rec.acceptedAt = now;
      rec.driverId = driverId;
      rec.statusHistory = rec.statusHistory || [];
      rec.statusHistory.push({
        status: "accepted",
        timestamp: now,
        driverId,
        message: "Fare accepted and booking assigned to driver",
      });
      delete rec.pendingAssignment;
      this.activeRecoveries.set(bookingId, rec);

      // Ack to caller
      this.emitToClient(ws, {
        event: "fare.accept.ack",
        bookingId,
        data: {
          status: "accepted",
          acceptedAt: now,
          driverId,
          finalFare: { amount: lastAmount, currency },
        },
      });

      // Notify both parties
      try {
        const toCustomer = String(booking.user || "");
        if (toCustomer) {
          this.webSocketService.sendToUser(toCustomer, {
            event: "recovery.accepted",
            bookingId,
            data: {
              status: "accepted",
              acceptedAt: now,
              driverId,
              finalFare: { amount: lastAmount, currency },
            },
          });
        }
        this.webSocketService.sendToUser(String(driverId), {
          event: "recovery.accepted",
          bookingId,
          data: {
            status: "accepted",
            acceptedAt: now,
            driverId,
            finalFare: { amount: lastAmount, currency },
          },
        });
      } catch {}

      // Optional broadcast to hide from others
      try {
        const norm = (s) =>
          String(s || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_");
        const st = norm("car recovery");
        const roomName = `svc:${st}`;
        if (this.webSocketService?.sendToRoom) {
          this.webSocketService.sendToRoom(roomName, {
            event: "recovery.unavailable",
            bookingId,
            data: { reason: "accepted" },
          });
        }
      } catch {}
    } catch (error) {
      logger.error("Error in handleFareAccept:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: bookingId || null,
        error: { code: "FARE_ACCEPT_ERROR", message: error.message },
      });
    }
  }

  /**
   * Get available drivers near a pickup location (simple geospatial query)
   * @param {{ coordinates: { lat: number, lng: number } | { latitude: number, longitude: number } }} pickupLocation
   * @param {number} maxDistanceKm
   * @param {object} filters discovery/dispatch filters
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
      // GeoJSON support
      if (
        (typeof lat !== "number" || typeof lng !== "number") &&
        Array.isArray(pickupLocation.coordinates) &&
        pickupLocation.coordinates.length >= 2
      ) {
        lng = pickupLocation.coordinates[0];
        lat = pickupLocation.coordinates[1];
      }
      if (typeof lat !== "number" || typeof lng !== "number") return [];

      const ignoreGeo = !!filters?.ignoreGeo;

      const baseQuery = {
        role: "driver",
        kycLevel: { $gte: 2 },
        kycStatus: "approved",
        isActive: true,
        "statusFlags.blockedForDues": { $ne: true },
        // NOTE: do NOT hard-exclude pinkCaptainMode; only apply when explicitly requested
        driverStatus: filters.onlyAssignable
          ? "online"
          : { $in: ["online", "on_ride", "busy"] },
      };

      const applyDiscoveryFilters = (q) => {
        if (filters.pinkCaptainOnly) {
          q.gender = "female";
          q["driverSettings.ridePreferences.pinkCaptainMode"] = true;
        }
        if (filters?.safety?.noMaleCompanion) {
          q["driverSettings.ridePreferences.acceptFemaleOnly"] = true;
        }
        if (filters?.safety?.familyWithGuardianMale) {
          q["driverSettings.ridePreferences.allowFamilyWithGuardian"] = true;
        }
        if (filters?.safety?.maleWithoutFemale) {
          q["driverSettings.ridePreferences.allowMaleWithoutFemale"] = true;
        }
        if (filters?.multiStopEnabled === true) {
          q["driverSettings.ridePreferences.allowMultiStop"] = { $ne: false };
        }

        const mode = String(
          filters?.preferredDispatch?.mode || ""
        ).toLowerCase();
        const pinnedId = filters?.preferredDispatch?.driverId;
        if (mode === "female_only") q.gender = "female";
        if (mode === "pinned" && pinnedId) q._id = String(pinnedId);
        return q;
      };

      // Primary path: $near
      if (!ignoreGeo) {
        const geoQuery = applyDiscoveryFilters({
          ...baseQuery,
          currentLocation: {
            $near: {
              $geometry: { type: "Point", coordinates: [lng, lat] },
              $maxDistance: maxDistanceKm * 1000,
            },
          },
        });

        let drivers = await User.find(geoQuery)
          .limit(10)
          .select(
            "_id firstName lastName phoneNumber currentLocation driverStatus dues.outstanding statusFlags.blockedForDues"
          );

        if (!drivers || drivers.length === 0) {
          // Fallback: non-geo query + Redis location for proximity
          const broadQuery = applyDiscoveryFilters({ ...baseQuery });
          const broadDrivers = await User.find(broadQuery)
            .limit(50)
            .select(
              "_id firstName lastName phoneNumber currentLocation driverStatus dues.outstanding statusFlags.blockedForDues"
            );

          const results = [];
          for (const d of broadDrivers) {
            let dlat = null;
            let dlng = null;

            if (
              Array.isArray(d.currentLocation?.coordinates) &&
              d.currentLocation.coordinates.length >= 2
            ) {
              dlat = d.currentLocation.coordinates[1];
              dlng = d.currentLocation.coordinates[0];
            } else {
              try {
                const raw = await redis.get(`driver:loc:${d._id}`);
                if (raw) {
                  const p = JSON.parse(raw);
                  if (typeof p.lat === "number" && typeof p.lng === "number") {
                    dlat = p.lat;
                    dlng = p.lng;
                  }
                }
              } catch {}
            }

            if (typeof dlat === "number" && typeof dlng === "number") {
              const distanceKmDriver = this._calcDistanceKm(
                { lat, lng },
                { lat: dlat, lng: dlng }
              );
              if (distanceKmDriver <= maxDistanceKm) {
                const etaMinutes = Math.ceil((distanceKmDriver / 30) * 60);
                results.push({
                  id: d._id.toString(),
                  name: `${d.firstName ?? ""}`.trim(),
                  phone: d.phoneNumber,
                  rating: 5,
                  status: d.driverStatus,
                  pendingAmounts: Number(d?.dues?.outstanding || 0) > 0,
                  distanceKm: distanceKmDriver,
                  etaMinutes,
                  location: { coordinates: { lat: dlat, lng: dlng } },
                });
              }
            }
          }

          results.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
          return results.slice(0, 10);
        }

        // Enrich $near results, using Redis if DB coordinate missing
        const mapped = [];
        for (const d of drivers) {
          let dlat = null;
          let dlng = null;
          if (
            Array.isArray(d.currentLocation?.coordinates) &&
            d.currentLocation.coordinates.length >= 2
          ) {
            dlat = d.currentLocation.coordinates[1];
            dlng = d.currentLocation.coordinates[0];
          } else {
            try {
              const raw = await redis.get(`driver:loc:${d._id}`);
              if (raw) {
                const p = JSON.parse(raw);
                if (typeof p.lat === "number" && typeof p.lng === "number") {
                  dlat = p.lat;
                  dlng = p.lng;
                }
              }
            } catch {}
          }

          let distanceKmDriver = null;
          let etaMinutes = null;
          if (typeof dlat === "number" && typeof dlng === "number") {
            distanceKmDriver = this._calcDistanceKm(
              { lat, lng },
              { lat: dlat, lng: dlng }
            );
            const avgSpeed = 30; // km/h
            etaMinutes = Math.ceil((distanceKmDriver / avgSpeed) * 60);
          }

          mapped.push({
            id: d._id.toString(),
            name: `${d.firstName ?? ""}`.trim(),
            phone: d.phoneNumber,
            rating: 5,
            status: d.driverStatus,
            pendingAmounts: Number(d?.dues?.outstanding || 0) > 0,
            distanceKm: distanceKmDriver,
            etaMinutes,
            location:
              typeof dlat === "number" && typeof dlng === "number"
                ? { coordinates: { lat: dlat, lng: dlng } }
                : d.currentLocation
                ? {
                    coordinates: {
                      lat: d.currentLocation.coordinates?.[1],
                      lng: d.currentLocation.coordinates?.[0],
                    },
                  }
                : null,
          });
        }

        return mapped;
      }

      // ignoreGeo: non-geo query + compute proximity if possible
      const nonGeoQuery = applyDiscoveryFilters({ ...baseQuery });
      const nonGeoDrivers = await User.find(nonGeoQuery)
        .limit(50)
        .select(
          "_id firstName lastName phoneNumber currentLocation driverStatus dues.outstanding statusFlags.blockedForDues"
        );

      const results = [];
      for (const d of nonGeoDrivers) {
        let dlat = null;
        let dlng = null;

        if (
          Array.isArray(d.currentLocation?.coordinates) &&
          d.currentLocation.coordinates.length >= 2
        ) {
          dlat = d.currentLocation.coordinates[1];
          dlng = d.currentLocation.coordinates[0];
        } else {
          try {
            const raw = await redis.get(`driver:loc:${d._id}`);
            if (raw) {
              const p = JSON.parse(raw);
              if (typeof p.lat === "number" && typeof p.lng === "number") {
                dlat = p.lat;
                dlng = p.lng;
              }
            }
          } catch {}
        }

        let distanceKmDriver = null;
        let etaMinutes = null;
        if (typeof dlat === "number" && typeof dlng === "number") {
          distanceKmDriver = this._calcDistanceKm(
            { lat, lng },
            { lat: dlat, lng: dlng }
          );
          etaMinutes = Math.ceil((distanceKmDriver / 30) * 60);
        }

        if (
          distanceKmDriver === null ||
          distanceKmDriver <= Number(maxDistanceKm || 100)
        ) {
          results.push({
            id: d._id.toString(),
            name: `${d.firstName ?? ""}`.trim(),
            phone: d.phoneNumber,
            rating: 5,
            status: d.driverStatus,
            pendingAmounts: Number(d?.dues?.outstanding || 0) > 0,
            distanceKm: distanceKmDriver,
            etaMinutes,
            location:
              typeof dlat === "number" && typeof dlng === "number"
                ? { coordinates: { lat: dlat, lng: dlng } }
                : d.currentLocation
                ? {
                    coordinates: {
                      lat: d.currentLocation.coordinates?.[1],
                      lng: d.currentLocation.coordinates?.[0],
                    },
                  }
                : null,
          });
        }
      }

      results.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
      return results.slice(0, 10);
    } catch (e) {
      logger.error("Error querying available drivers:", e);
      return [];
    }
  }

  /**
   * Helper: compute allowed min/max fare window from PricingConfig or fallback 3%
   */
  async _getAllowedFareWindow(baseEstimate) {
    let allowedPct = 3;
    try {
      const pc = await PricingConfig.findOne({
        serviceType: "car_recovery",
        isActive: true,
      }).lean();
      allowedPct = Number(
        pc?.fareAdjustmentSettings?.allowedAdjustmentPercentage ?? 3
      );
    } catch {}
    const base = Number(baseEstimate || 0);
    const minFare = Math.max(
      0,
      Math.round(base * (1 - allowedPct / 100) * 100) / 100
    );
    const maxFare = Math.round(base * (1 + allowedPct / 100) * 100) / 100;
    return { allowedPct, minFare, maxFare };
  }

  /**
   * Fare offer from customer or driver.
   * Customer payload: { bookingId, driverId, amount, currency? }
   * Driver payload:   { bookingId, amount, currency? }  // driverId inferred from ws token
   */
  async handleFareOffer(ws, message) {
    // Normalize
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const bookingId = String(data?.bookingId || "").trim();
    const currency = data?.currency || "AED";
    const role = String(ws?.user?.role || "").toLowerCase();
    const isDriver = role === "driver";
    const isCustomer =
      role === "user" || role === "customer" || role === "client";

    const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

    try {
      if (!bookingId) throw new Error("bookingId is required");
      const amount = Number(data?.amount);
      if (!isFiniteNumber(amount) || amount <= 0) {
        throw new Error("positive numeric amount is required");
      }

      // Load booking
      const booking = await Booking.findById(bookingId).select(
        "status user driver fareDetails pickupLocation dropoffLocation vehicleDetails"
      );
      if (!booking) throw new Error("Booking not found");

      // Only allow offers while booking is open for negotiation
      const allowedForOffer = new Set([
        "pending",
        "requested",
        "searching",
        "assigned",
      ]);
      if (!allowedForOffer.has(String(booking.status))) {
        throw new Error(`Cannot offer fare on a ${booking.status} booking`);
      }

      // Determine window anchor
      const anchor =
        Number(booking?.fareDetails?.finalFare?.amount) ||
        Number(booking?.fareDetails?.estimatedFare?.amount) ||
        (typeof booking?.fareDetails?.estimatedFare === "number"
          ? Number(booking?.fareDetails?.estimatedFare)
          : 0) ||
        amount;

      const window =
        typeof this._getAllowedFareWindow === "function"
          ? await this._getAllowedFareWindow(anchor)
          : (() => {
              const pct = 3;
              const min = Math.max(
                0,
                Math.round(anchor * (1 - pct / 100) * 100) / 100
              );
              const max = Math.round(anchor * (1 + pct / 100) * 100) / 100;
              return { allowedPct: pct, minFare: min, maxFare: max };
            })();

      if (!(amount >= window.minFare && amount <= window.maxFare)) {
        throw new Error(
          `Offered amount must be between ${window.minFare} and ${window.maxFare} ${currency}`
        );
      }

      const now = new Date();

      // Minimal display info helper (name + profile pic)
      const buildInfo = (u) => {
        if (!u) return null;
        const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
        return {
          id: String(u._id || ""),
          name: name || u.username || "User",
          image: u.profilePicture || u.avatarUrl || null, // allow alternate field
        };
      };

      // Route info (distance/time)
      const pickup = booking?.pickupLocation;
      const dropoff = booking?.dropoffLocation;
      let route = { distanceKm: null, timeMinutes: null };
      try {
        const pLat = pickup?.coordinates?.[1];
        const pLng = pickup?.coordinates?.[0];
        const dLat = dropoff?.coordinates?.[1];
        const dLng = dropoff?.coordinates?.[0];
        const haveCoords = [pLat, pLng, dLat, dLng].every(
          (v) => typeof v === "number"
        );
        if (haveCoords) {
          const distanceKm = this._calcDistanceKm(
            { lat: pLat, lng: pLng },
            { lat: dLat, lng: dLng }
          );
          route.distanceKm = distanceKm;
          try {
            const eta = this.calculateETA(
              { lat: pLat, lng: pLng },
              { lat: dLat, lng: dLng }
            );
            route.timeMinutes = eta?.minutes ?? null;
          } catch {
            // keep timeMinutes null if calculateETA unavailable
          }
        }
      } catch {
        // leave route defaults
      }

      // Vehicle display name
      const vd = booking?.vehicleDetails || {};
      const vehicleName =
        vd?.name ||
        vd?.model ||
        vd?.make ||
        vd?.type ||
        vd?.vehicleType ||
        null;

      // CUSTOMER -> DRIVER offer
      if (isCustomer) {
        const driverId = String(data?.driverId || "").trim();
        if (!driverId)
          throw new Error("driverId is required for customer offer");

        let offeredBy = null;
        try {
          const cust = booking?.user
            ? await User.findById(booking.user)
                .select("firstName lastName profilePicture username avatarUrl")
                .lean()
            : null;
          offeredBy = buildInfo(cust);
        } catch {}

        // Persist negotiation state
        await Booking.findByIdAndUpdate(
          bookingId,
          {
            $set: {
              "fareDetails.negotiation.state": "proposed",
              "fareDetails.negotiation.updatedAt": now,
              "fareDetails.negotiation.proposed": {
                by: "customer",
                amount,
                currency,
                at: now,
                bounds: {
                  min: window.minFare,
                  max: window.maxFare,
                  allowedPct: window.allowedPct,
                },
              },
            },
            $push: {
              "fareDetails.negotiation.history": {
                action: "offer",
                by: "customer",
                amount,
                currency,
                at: now,
                bounds: {
                  min: window.minFare,
                  max: window.maxFare,
                  allowedPct: window.allowedPct,
                },
              },
            },
          },
          { new: false }
        );

        // Notify driver: include customer's name + profile picture
        this.webSocketService.sendToUser(String(driverId), {
          event: "fare.offer",
          bookingId,
          data: {
            amount,
            currency,
            by: "customer",
            offeredBy, // { id, name, image }
            vehicleName,
            route, // { distanceKm, timeMinutes }
            pickupLocation: booking.pickupLocation,
            dropoffLocation: booking.dropoffLocation,
            minFare: window.minFare,
            maxFare: window.maxFare,
          },
        });

        // Ack to customer (mirror)
        this.emitToClient(ws, {
          event: "fare.offer.ack",
          bookingId,
          data: {
            amount,
            currency,
            by: "customer",
            offeredBy,
            vehicleName,
            route,
            minFare: window.minFare,
            maxFare: window.maxFare,
          },
        });
        return;
      }

      // DRIVER -> CUSTOMER offer
      if (isDriver) {
        const driverId = String(ws?.user?.id || ws?.user?._id || "").trim();
        if (!driverId) throw new Error("driver identity required");

        let offeredBy = null;
        try {
          const drv = await User.findById(driverId)
            .select("firstName lastName profilePicture username avatarUrl")
            .lean();
          offeredBy = buildInfo(drv);
        } catch {}

        // Persist driver proposal
        await Booking.findByIdAndUpdate(
          bookingId,
          {
            $set: {
              "fareDetails.negotiation.state": "proposed",
              "fareDetails.negotiation.updatedAt": now,
              "fareDetails.negotiation.proposed": {
                by: "driver",
                amount,
                currency,
                at: now,
                driverId,
                bounds: {
                  min: window.minFare,
                  max: window.maxFare,
                  allowedPct: window.allowedPct,
                },
              },
            },
            $push: {
              "fareDetails.negotiation.history": {
                action: "offer",
                by: "driver",
                amount,
                currency,
                at: now,
                driverId,
                bounds: {
                  min: window.minFare,
                  max: window.maxFare,
                  allowedPct: window.allowedPct,
                },
              },
            },
          },
          { new: false }
        );

        // Notify customer: include driver's name + profile picture
        if (booking.user) {
          this.webSocketService.sendToUser(String(booking.user), {
            event: "fare.offer",
            bookingId,
            data: {
              amount,
              currency,
              by: "driver",
              driverId,
              offeredBy, // { id, name, image }
              vehicleName,
              route,
              pickupLocation: booking.pickupLocation,
              dropoffLocation: booking.dropoffLocation,
              minFare: window.minFare,
              maxFare: window.maxFare,
            },
          });
        }

        // Ack to driver (mirror)
        this.emitToClient(ws, {
          event: "fare.offer.ack",
          bookingId,
          data: {
            amount,
            currency,
            by: "driver",
            offeredBy,
            vehicleName,
            route,
            minFare: window.minFare,
            maxFare: window.maxFare,
          },
        });
        return;
      }

      throw new Error("Only drivers or customers can send fare offers");
    } catch (error) {
      logger.error("Error in handleFareOffer:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId,
        error: { code: "FARE_OFFER_ERROR", message: error.message },
      });
    }
  }

  /**
   * Unified fare reject: either driver or customer can end negotiation here.
   * Expects: message.data = { bookingId, driverId?, reason? }
   */
  async handleFareReject(ws, message) {
    // Normalize
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const bookingId = String(data?.bookingId || msg?.bookingId || "").trim();

    try {
      if (!bookingId) throw new Error("bookingId is required");

      // Determine actor
      const role = String(ws?.user?.role || "").toLowerCase();
      const isDriver = role === "driver";
      const isCustomer =
        role === "user" || role === "customer" || role === "client";

      const booking = await Booking.findById(bookingId).select(
        "user driver status pendingAssignment fareDetails"
      );
      if (!booking) throw new Error("Booking not found");
      if (["cancelled", "completed"].includes(booking.status)) {
        throw new Error(`Cannot reject fare on a ${booking.status} booking`);
      }

      // Resolve driverId depending on actor
      let driverId = data?.driverId ? String(data.driverId) : null;
      if (isDriver) {
        driverId = String(ws?.user?.id || ws?.user?._id || driverId || "");
        if (!driverId) throw new Error("driverId is required for driver");
      } else if (isCustomer) {
        if (!driverId) {
          driverId = booking?.driver
            ? String(booking.driver)
            : booking?.pendingAssignment?.driverId
            ? String(booking.pendingAssignment.driverId)
            : null;
        }
      }

      // End negotiation for either party
      const now = new Date();
      const by = isDriver ? "driver" : "customer";

      await Booking.findByIdAndUpdate(
        bookingId,
        {
          $unset: { pendingAssignment: "" },
          $set: {
            "fareDetails.negotiation.state": "stopped",
            "fareDetails.negotiation.endedAt": now,
            "fareDetails.negotiation.history": [
              ...(booking?.fareDetails?.negotiation?.history || []),
              {
                action: "reject",
                by,
                reason: data?.reason,
                at: now,
              },
            ],
          },
        },
        { new: false }
      );

      // Ack to caller
      this.emitToClient(ws, {
        event: "fare.reject.ack",
        bookingId,
        data: { by, reason: data?.reason || "rejected", at: now },
      });

      // Notify counterparty
      try {
        if (isDriver) {
          if (booking.user) {
            this.webSocketService.sendToUser(String(booking.user), {
              event: "negotiation.rejected",
              bookingId,
              data: { by, reason: data?.reason || "rejected", at: now },
            });
          }
        } else if (isCustomer && driverId) {
          this.webSocketService.sendToUser(String(driverId), {
            event: "negotiation.rejected",
            bookingId,
            data: { by, reason: data?.reason || "rejected", at: now },
          });
        }
      } catch {}
    } catch (error) {
      logger.error("Error in handleFareReject:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: bookingId || null,
        error: { code: "FARE_REJECT_ERROR", message: error.message },
      });
    }
  }

  /**
   * Fare accept (by customer or driver) FINALIZES negotiation:
   * Payload:
   *  - Customer: { bookingId, driverId, amount?, currency? }
   *  - Driver:   { bookingId, amount?, currency? }
   */
  async handleFareAccept(ws, message) {
    // Normalize
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const bookingId = String(data?.bookingId || "").trim();
    const role = String(ws?.user?.role || "").toLowerCase();
    const isDriver = role === "driver";
    const isCustomer =
      role === "user" || role === "customer" || role === "client";
    const currency = data?.currency || "AED";

    try {
      if (!bookingId) throw new Error("bookingId is required");

      const booking = await Booking.findById(bookingId).select(
        "status user driver pendingAssignment fareDetails pickupLocation dropoffLocation"
      );
      if (!booking) throw new Error("Booking not found");
      if (["cancelled", "completed"].includes(booking.status)) {
        throw new Error(`Cannot accept fare on a ${booking.status} booking`);
      }
      if (["accepted", "in_progress"].includes(booking.status)) {
        // Idempotent ack
        this.emitToClient(ws, {
          event: "fare.accept.ack",
          bookingId,
          data: {
            status: booking.status,
            driverId: String(booking.driver || ""),
          },
        });
        return;
      }

      // Resolve driverId
      let driverId = null;
      if (isDriver) {
        driverId = String(ws?.user?.id || ws?.user?._id || "").trim();
        if (!driverId) throw new Error("driver identity required");
      } else if (isCustomer) {
        driverId = String(data?.driverId || "").trim();
        if (!driverId) {
          driverId = booking?.driver
            ? String(booking.driver)
            : booking?.pendingAssignment?.driverId
            ? String(booking.pendingAssignment.driverId)
            : "";
        }
        if (!driverId)
          throw new Error("driverId is required for customer acceptance");
      } else {
        driverId = String(data?.driverId || "").trim();
        if (!driverId) throw new Error("driverId is required");
      }

      // Determine final amount
      const proposed = booking?.fareDetails?.negotiation?.proposed || {};
      const lastAmount =
        typeof data?.amount === "number" &&
        Number.isFinite(data.amount) &&
        data.amount > 0
          ? data.amount
          : typeof proposed?.amount === "number" &&
            Number.isFinite(proposed.amount) &&
            proposed.amount > 0
          ? proposed.amount
          : typeof booking?.fareDetails?.estimatedFare === "number"
          ? booking.fareDetails.estimatedFare
          : Number(booking?.fareDetails?.estimatedFare?.amount || 0) || 0;

      const now = new Date();

      // Persist acceptance and assignment
      await Booking.findByIdAndUpdate(
        bookingId,
        {
          $set: {
            status: "accepted",
            driver: driverId,
            acceptedAt: now,
            "fareDetails.finalFare": {
              amount: lastAmount,
              currency,
              by: isDriver ? "driver" : "customer",
              at: now,
            },
            "fareDetails.negotiation.state": "accepted",
            "fareDetails.negotiation.endedAt": now,
            "fareDetails.negotiation.history": [
              ...(booking?.fareDetails?.negotiation?.history || []),
              {
                action: "accept",
                by: isDriver ? "driver" : "customer",
                amount: lastAmount,
                currency,
                at: now,
              },
            ],
          },
          $unset: { pendingAssignment: "" },
        },
        { new: false }
      );

      // Map booking -> driver in Redis (as requested)
      try {
        await redis.set(`booking:driver:${bookingId}`, String(driverId));
      } catch {}
      try {
        await redis.set(`booking:driver:${bookingId}`, String(driverId));
      } catch {}

      // Update cache
      let rec = this.activeRecoveries.get(bookingId) || {};
      rec.status = "accepted";
      rec.acceptedAt = now;
      rec.driverId = driverId;
      rec.statusHistory = rec.statusHistory || [];
      rec.statusHistory.push({
        status: "accepted",
        timestamp: now,
        driverId,
        message: "Fare accepted and booking assigned to driver",
      });
      delete rec.pendingAssignment;
      this.activeRecoveries.set(bookingId, rec);

      // Ack to caller
      this.emitToClient(ws, {
        event: "fare.accept.ack",
        bookingId,
        data: {
          status: "accepted",
          acceptedAt: now,
          driverId,
          finalFare: { amount: lastAmount, currency },
        },
      });

      // Notify both sides
      try {
        const toCustomer = String(booking.user || "");
        if (toCustomer) {
          this.webSocketService.sendToUser(toCustomer, {
            event: "recovery.accepted",
            bookingId,
            data: {
              status: "accepted",
              acceptedAt: now,
              driverId,
              finalFare: { amount: lastAmount, currency },
            },
          });
        }
        this.webSocketService.sendToUser(String(driverId), {
          event: "recovery.accepted",
          bookingId,
          data: {
            status: "accepted",
            acceptedAt: now,
            driverId,
            finalFare: { amount: lastAmount, currency },
          },
        });
      } catch {}
    } catch (error) {
      logger.error("Error in handleFareAccept:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: bookingId || null,
        error: { code: "FARE_ACCEPT_ERROR", message: error.message },
      });
    }
  }

  /**
   * Negotiation: fare counter (driver/customer)
   * Payload: { bookingId, data: { amount: number } }
   */
  async handleFareCounter(ws, message) {
    // Normalize input
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};

    const normalizeId = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };

    const bookingId =
      [
        msg.bookingId,
        data.bookingId,
        payload.bookingId,
        body.bookingId,
        msg.id,
        data.id,
        payload.id,
        body.id,
        msg.requestId,
        data.requestId,
        payload.requestId,
        body.requestId,
      ]
        .map(normalizeId)
        .find((v) => typeof v === "string" && v.length > 0) || null;

    try {
      if (!bookingId) throw new Error("bookingId is required");
      const amount = Number(
        data?.amount ??
          data?.value ??
          data?.fare ??
          payload?.amount ??
          body?.amount
      );
      if (!isFinite(amount) || amount <= 0)
        throw new Error("Valid amount is required");

      const driverId = normalizeId(
        data?.driverId || payload?.driverId || body?.driverId
      );
      const userId = normalizeId(
        data?.userId || payload?.userId || body?.userId
      );
      // Prefer userId to allow customer to include driverId for routing
      const by = userId ? "customer" : "driver";
      if (by === "driver" && !driverId)
        throw new Error("driverId is required for driver counter");
      if (by === "customer" && !userId)
        throw new Error("userId is required for customer counter");

      // Load booking
      const booking = await Booking.findById(bookingId).select(
        "fareDetails user driver status"
      );
      if (!booking) throw new Error("Booking not found");
      if (["cancelled", "completed"].includes(booking.status)) {
        throw new Error(`Cannot counter on a ${booking.status} booking`);
      }

      // Authorization/validation
      if (by === "customer") {
        if (!booking.user || String(booking.user) !== String(userId)) {
          throw new Error("Not authorized: only the booking owner can counter");
        }
      } else {
        const drv = await User.findById(driverId).select(
          "role kycStatus kycLevel isActive driverStatus"
        );
        if (!drv || drv.role !== "driver") throw new Error("Invalid driver");
        if (!(drv.kycStatus === "approved" && Number(drv.kycLevel || 0) >= 2)) {
          throw new Error("Driver KYC not approved");
        }
        if (!(drv.isActive === true && drv.driverStatus === "online")) {
          throw new Error("Driver is not online");
        }
        const lockKey = String(driverId);
        const lockedFor = this.negotiationLocks.get(lockKey);
        if (lockedFor && lockedFor !== String(bookingId)) {
          throw new Error("Driver is negotiating another request");
        }
        this.negotiationLocks.set(lockKey, String(bookingId));
      }

      // Bounds (same as offer)
      const base =
        Number(booking?.fareDetails?.estimatedFare || booking?.fare || 0) || 0;
      let allowedPct = 3;
      try {
        const pc = await PricingConfig.findOne({
          serviceType: "car_recovery",
          isActive: true,
        }).lean();
        allowedPct = Number(
          pc?.fareAdjustmentSettings?.allowedAdjustmentPercentage ?? 3
        );
      } catch {}
      const minAllowed = base
        ? Math.round(base * (1 - allowedPct / 100) * 100) / 100
        : 0;
      const maxAllowed = base
        ? Math.round(base * (1 + allowedPct / 100) * 100) / 100
        : Infinity;
      if (base > 0 && (amount < minAllowed || amount > maxAllowed)) {
        throw new Error(
          `Offer must be within ±${allowedPct}% of base AED ${base.toFixed(
            2
          )} (min ${minAllowed}, max ${maxAllowed})`
        );
      }

      // Persist negotiation
      const now = new Date();
      const negotiation = booking.fareDetails?.negotiation || {};
      negotiation.state = negotiation.state || "ongoing";
      negotiation.history = Array.isArray(negotiation.history)
        ? negotiation.history
        : [];
      negotiation.history.push({
        type: "counter",
        by,
        amount,
        at: now,
        driverId: driverId || null,
        userId: userId || null,
      });
      negotiation.lastOffer = {
        by,
        amount,
        at: now,
        driverId: driverId || null,
        userId: userId || null,
      };

      await Booking.findByIdAndUpdate(
        bookingId,
        { $set: { "fareDetails.negotiation": negotiation } },
        { new: false }
      );

      // ACK to sender
      this.emitToClient(ws, {
        event: "fare.offer.ack",
        bookingId,
        data: {
          by,
          driverId: driverId || null,
          userId: userId || null,
          amount,
          at: now,
          bounds: { min: minAllowed, max: maxAllowed, allowedPct },
        },
      });

      // Notify counterparty (same routing as offer)
      try {
        if (by === "driver") {
          if (booking.user) {
            this.webSocketService.sendToUser(String(booking.user), {
              event: "fare.offer",
              bookingId,
              data: {
                by,
                driverId: driverId || null,
                userId: userId || null,
                amount,
                at: now,
                bounds: { min: minAllowed, max: maxAllowed, allowedPct },
              },
            });
          }
        } else {
          let targetDriverId = null;
          if (booking.driver) {
            targetDriverId = String(booking.driver);
          } else {
            targetDriverId =
              driverId || negotiation.lastOffer?.driverId || null;
          }
          if (!targetDriverId) {
            throw new Error(
              "No target driver to notify: include driverId or ensure a previous driver offer exists"
            );
          }
          this.webSocketService.sendToUser(String(targetDriverId), {
            event: "fare.offer",
            bookingId,
            data: {
              by,
              driverId: targetDriverId,
              userId: userId || null,
              amount,
              at: now,
              bounds: { min: minAllowed, max: maxAllowed, allowedPct },
            },
          });
        }
      } catch {}
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: bookingId || null,
        error: { code: "FARE_COUNTER_ERROR", message: error.message },
      });
    }
  }

  /**
   * booking.details – return complete booking details after completion
   * Payload: { bookingId, driverId?, userId? }
   * Auth: driverId (assigned driver), userId (booking owner), or admin (from token)
   */
  async handleBookingDetails(ws, message) {
    // Normalize input
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const payload = msg?.payload || {};
    const body = msg?.body || {};

    const normalizeId = (v) => {
      try {
        if (!v) return null;
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.$oid) return String(v.$oid).trim();
          if (v._id) return String(v._id).trim();
          if (typeof v.toString === "function")
            return String(v.toString()).trim();
        }
      } catch {}
      return null;
    };

    const bookingId =
      [
        msg.bookingId,
        data.bookingId,
        payload.bookingId,
        body.bookingId,
        msg.id,
        data.id,
        payload.id,
        body.id,
        msg.requestId,
        data.requestId,
        payload.requestId,
        body.requestId,
      ]
        .map(normalizeId)
        .find((v) => typeof v === "string" && v.length > 0) || null;

    const driverId = (
      data?.driverId ||
      payload?.driverId ||
      body?.driverId
    )?.toString?.();
    const userId = (
      data?.userId ||
      payload?.userId ||
      body?.userId
    )?.toString?.();
    const isAdmin =
      ws?.user && (ws.user.role === "admin" || ws.user.role === "superadmin");

    try {
      if (!bookingId) throw new Error("bookingId is required");

      // Load booking (DB-first)
      const booking = await Booking.findById(bookingId)
        .select(
          "status user driver serviceType serviceCategory createdAt updatedAt pickupLocation dropoffLocation waypoints distance distanceInMeters fareDetails receipt paymentDetails timeline"
        )
        .lean();
      if (!booking) throw new Error("Booking not found");

      // Only allow after completion
      if (booking.status !== "completed") {
        throw new Error("Details are available after service completion only");
      }

      // Authorization: owner, assigned driver, or admin
      if (!isAdmin) {
        const requesterDriver =
          driverId &&
          booking.driver &&
          String(booking.driver) === String(driverId);
        const requesterUser =
          userId && booking.user && String(booking.user) === String(userId);
        if (!requesterDriver && !requesterUser) {
          throw new Error("Not authorized to view this booking details");
        }
      }

      // Minimal user/driver profile
      let userInfo = null,
        driverInfo = null;
      try {
        if (booking.user) {
          const u = await User.findById(booking.user)
            .select("name fullName email mobile phone")
            .lean();
          if (u)
            userInfo = {
              id: String(booking.user),
              name: u.name || u.fullName || null,
              email: u.email || null,
              phone: u.mobile || u.phone || null,
            };
        }
      } catch {}
      try {
        if (booking.driver) {
          const d = await User.findById(booking.driver)
            .select("name fullName email mobile phone rating")
            .lean();
          if (d)
            driverInfo = {
              id: String(booking.driver),
              name: d.name || d.fullName || null,
              email: d.email || null,
              phone: d.mobile || d.phone || null,
              rating: d.rating ?? null,
            };
        }
      } catch {}

      // Compose response
      const details = {
        bookingId: String(bookingId),
        status: booking.status,
        serviceType: booking.serviceType || null,
        serviceCategory: booking.serviceCategory || null,
        createdAt: booking.createdAt || null,
        updatedAt: booking.updatedAt || null,
        pickupLocation: booking.pickupLocation || null,
        dropoffLocation: booking.dropoffLocation || null,
        waypoints: Array.isArray(booking.waypoints) ? booking.waypoints : [],
        distance: booking.distance ?? null,
        distanceInMeters: booking.distanceInMeters ?? null,
        user: userInfo,
        driver: driverInfo,
        fareDetails: {
          estimatedFare: booking?.fareDetails?.estimatedFare ?? null,
          finalFare: booking?.fareDetails?.finalFare ?? null,
          negotiation: booking?.fareDetails?.negotiation ?? null,
        },
        receipt: booking?.receipt ?? null,
        paymentDetails: booking?.paymentDetails ?? null,
        timeline: booking?.timeline ?? null,
      };

      // Respond
      this.emitToClient(ws, {
        event: "booking.details",
        bookingId,
        data: details,
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: bookingId || null,
        error: {
          code: "BOOKING_DETAILS_ERROR",
          message: error.message || "Failed to fetch booking details",
        },
      });
    }
  }

  /**
   * Get assigned driver's current location (real-time via Redis).
   * Payload: { bookingId } or { driverId }
   * Auth: assigned driver or booking owner (basic check)
   */
  async handleGetDriverLocationRealtime(ws, message) {
    // Normalize
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || {};
    const bookingId = String(data?.bookingId || msg?.bookingId || "").trim();
    let driverId = String(data?.driverId || "").trim();

    // Local holder for booking + vehicle details
    let booking = null;
    let vehicleDetails = null;

    try {
      if (!driverId && !bookingId)
        throw new Error("bookingId or driverId is required");

      // Resolve driverId via Redis mapping first if bookingId present
      if (!driverId && bookingId) {
        try {
          const mapped = await redis.get(`booking:driver:${bookingId}`);
          if (mapped) driverId = mapped;
        } catch {}
      }

      // Fallback to DB mapping; also fetch vehicle details once
      if (bookingId) {
        booking = await Booking.findById(bookingId)
          .select("user driver vehicleDetails")
          .lean();
        vehicleDetails = booking?.vehicleDetails || null;
      }
      if (!driverId && bookingId) {
        if (!booking?.driver) {
          // No driver assigned: still send vehicle info if available
          this.emitToClient(ws, {
            event: "driver.location",
            bookingId,
            data: {
              available: false,
              source: "redis",
              reason: "no_driver_assigned",
              vehicle: vehicleDetails || null,
            },
          });
          return;
        }
        driverId = String(booking.driver);
      }

      // Auth: driver, owner, or admin/support
      let ownerId = null;
      if (bookingId) {
        ownerId = booking?.user ? String(booking.user) : null;
      }
      const callerId = String(ws?.user?.id || ws?.user?._id || "");
      const role = String(ws?.user?.role || "").toLowerCase();
      const isDriver = role === "driver" && callerId === String(driverId);
      const isOwner =
        (role === "user" || role === "customer" || role === "client") &&
        ownerId === callerId;
      const isAdmin =
        role === "admin" || role === "superadmin" || role === "support";
      if (!isDriver && !isOwner && !isAdmin)
        throw new Error("Not authorized to view driver location");

      // Helper: redis read
      const fetchRedisLocation = async () => {
        try {
          const r = await redis.get(`driver:loc:${driverId}`);
          if (!r) return null;
          const p = JSON.parse(r);
          return p && typeof p.lat === "number" && typeof p.lng === "number"
            ? p
            : null;
        } catch {
          return null;
        }
      };

      // Freshness window
      const isFresh = (iso) => {
        const t = iso ? new Date(iso).getTime() : 0;
        return t > 0 && Date.now() - t < 15 * 1000;
      };

      // Initial read
      let parsed = await fetchRedisLocation();

      // Ask driver for live update and retry a few times if stale/missing
      if (!parsed || !isFresh(parsed.at)) {
        try {
          this.webSocketService.sendToUser(String(driverId), {
            event: "driver.location.request",
            bookingId: bookingId || null,
            data: { reason: "realtime_request" },
          });
        } catch {}
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        for (let i = 0; i < 8; i++) {
          // slightly extended retries
          await sleep(300);
          parsed = await fetchRedisLocation();
          if (parsed && isFresh(parsed.at)) break;
        }
      }

      // DB fallback if still stale/missing
      if (!parsed || !isFresh(parsed.at)) {
        try {
          const u = await User.findById(driverId)
            .select("currentLocation lastActiveAt")
            .lean();
          const coords = Array.isArray(u?.currentLocation?.coordinates)
            ? u.currentLocation.coordinates
            : null;
          if (coords && coords.length >= 2) {
            this.emitToClient(ws, {
              event: "driver.location",
              bookingId: bookingId || null,
              data: {
                available: true,
                source: "db",
                location: { lat: coords[1], lng: coords[0] },
                at: u?.lastActiveAt
                  ? new Date(u.lastActiveAt).toISOString()
                  : undefined,
                driverId,
                vehicle: vehicleDetails || null,
                stale: true,
              },
            });
            return;
          }
        } catch {}
        // Nothing available; still include vehicle info for UI
        this.emitToClient(ws, {
          event: "driver.location",
          bookingId: bookingId || null,
          data: {
            available: false,
            source: "redis",
            reason: "stale_or_missing",
            vehicle: vehicleDetails || null,
          },
        });
        return;
      }

      // Fresh redis; include vehicle details
      this.emitToClient(ws, {
        event: "driver.location",
        bookingId: bookingId || parsed.bookingId || null,
        data: {
          available: true,
          source: "redis",
          location: { lat: parsed.lat, lng: parsed.lng },
          at: parsed.at,
          driverId,
          vehicle: vehicleDetails || null,
        },
      });

      // Persist snapshot to DB best-effort
      try {
        const when = parsed.at ? new Date(parsed.at) : new Date();
        await User.findByIdAndUpdate(
          driverId,
          {
            $set: {
              currentLocation: {
                type: "Point",
                coordinates: [parsed.lng, parsed.lat],
              },
              lastActiveAt: when,
            },
          },
          { new: false }
        );
        this.emitToClient(ws, {
          event: "driver.location.set",
          bookingId: bookingId || parsed.bookingId || null,
          data: { stored: true, at: when.toISOString(), driverId },
        });
      } catch {}
    } catch (error) {
      logger.error("Error in handleGetDriverLocationRealtime:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: bookingId || null,
        error: { code: "GET_DRIVER_LOCATION_RT_ERROR", message: error.message },
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
}

export default RecoveryHandler;
