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
import Vehicle from "../models/vehicleModel.js";

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
    this.webSocketService.on("recovery.cancel", this.handleCancel.bind(this));

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

    // Dynamic Message
    this.webSocketService.on("recovery.on_the_way", (ws, msg) =>
      this.handleDriverOnTheWay(ws, msg)
    );

    // Alias for legacy/new clients
    this.webSocketService.on("driver:on_the_way", (ws, msg) =>
      this.handleDriverOnTheWay(ws, msg)
    );
  }

  /**
   * Handle recovery request from client
   */
  async handleRecoveryRequest(ws, message) {
    // Helpers
    const toNum = (v) => {
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };
    const normalizeCoords = (c) => {
      if (Array.isArray(c) && c.length >= 2) {
        const lng = toNum(c[0]);
        const lat = toNum(c[1]);
        if (lng != null && lat != null) return [lng, lat];
      }
      if (c && typeof c === "object") {
        const lng = toNum(c.lng ?? c.longitude);
        const lat = toNum(c.lat ?? c.latitude);
        if (lng != null && lat != null) return [lng, lat];
      }
      return null;
    };
    const normKey = (s) =>
      String(s || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
    const normKeyLoose = (t) =>
      String(t || "")
        .toLowerCase()
        .trim()
        .replace(/[_-]+/g, " ");
    const buildCustomerProfile = (u) => {
      if (!u) return null;
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      return {
        id: String(u._id || u.id || ""),
        name: name || u.username || "User",
        email: u.email || null,
        phone: u.phoneNumber || u.phone || null,
        image: u.selfieImage || u.avatarUrl || null,
      };
    };

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
    const userId = String(
      ws?.user?._id || ws?.user?.id || data?.userId || ""
    ).trim();

    try {
      // Validate
      if (!data || !data.pickupLocation || !data.dropoffLocation) {
        throw new Error(
          "Missing required fields: pickupLocation and dropoffLocation are required"
        );
      }

      // Coordinates
      const pickArr = normalizeCoords(data.pickupLocation?.coordinates);
      const dropArr = normalizeCoords(data.dropoffLocation?.coordinates);
      if (!pickArr || !dropArr) {
        throw new Error(
          "pickupLocation.coordinates and dropoffLocation.coordinates must be [lng,lat] or {lng,lat}"
        );
      }
      const pickupZone = data?.pickupLocation?.zone || "general";
      const dropoffZone = data?.dropoffLocation?.zone || "general";

      // Service typing
      const serviceType = "car recovery";

      // Derive category/subcategory/vehicleType
      const deriveCategory = (t, sub) => {
        const v = normKeyLoose(t);
        const s = normKeyLoose(sub);
        if (v.includes("towing")) return "towing services";
        if (
          s.includes("tow") ||
          s.includes("flatbed") ||
          s.includes("wheel lift")
        )
          return "towing services";
        if (v.includes("winch")) return "winching services";
        if (s.includes("winch")) return "winching services";
        if (
          v.includes("roadside") ||
          v.includes("battery") ||
          v.includes("fuel") ||
          v.includes("jump")
        )
          return "roadside assistance";
        if (
          s.includes("roadside") ||
          s.includes("battery") ||
          s.includes("fuel") ||
          s.includes("jump")
        )
          return "roadside assistance";
        return "specialized/heavy recovery";
      };
      const deriveSubcategoryVehicleType = (sub) => {
        const s = normKeyLoose(sub);
        if (s.includes("flatbed")) return "flatbed towing";
        if (s.includes("wheel lift")) return "wheel lift towing";
        if (s.includes("on road winch") || s.includes("on road winching"))
          return "on-road winching";
        if (s.includes("off road winch") || s.includes("off road winching"))
          return "off-road winching";
        if (s.includes("battery")) return "battery jump start";
        if (s.includes("fuel")) return "fuel delivery";
        return null;
      };
      const isValidVehicleType = (s) => {
        const v = String(s || "")
          .toLowerCase()
          .trim();
        return [
          "flatbed towing",
          "wheel lift towing",
          "on-road winching",
          "off-road winching",
          "battery jump start",
          "fuel delivery",
          "luxury & exotic car recovery",
          "accident & collision recovery",
          "heavy-duty vehicle recovery",
          "basement pull-out",
        ].includes(v);
      };

      const serviceCategory = deriveCategory(
        data?.serviceType || data?.subService,
        data?.subService
      );
      const subServiceNormalized = normKeyLoose(data?.subService || "");
      const rawVehicleType =
        data?.vehicleType ||
        data?.vehicleDetails?.type ||
        data?.vehicleDetails?.vehicleType ||
        null;
      const derivedFromSub = deriveSubcategoryVehicleType(data?.subService);
      const vehicleTypeDerived = isValidVehicleType(rawVehicleType)
        ? rawVehicleType
        : derivedFromSub && isValidVehicleType(derivedFromSub)
        ? derivedFromSub
        : null;

      // Distance
      let distanceKm =
        this._calcDistanceKm(
          { lat: pickArr[1], lng: pickArr[0] },
          { lat: dropArr[1], lng: dropArr[0] }
        ) || 0;
      if (distanceKm === 0) {
        const provided = toNum(
          data?.distanceKm ??
            data?.distance ??
            data?.estimatedDistance ??
            data?.estimated?.distance
        );
        if (provided && provided > 0) {
          distanceKm = provided;
        } else if (
          Array.isArray(data?.waypoints) &&
          data.waypoints.length > 1
        ) {
          let acc = 0;
          for (let i = 1; i < data.waypoints.length; i++) {
            const a = normalizeCoords(data.waypoints[i - 1]?.coordinates);
            const b = normalizeCoords(data.waypoints[i]?.coordinates);
            if (a && b)
              acc += this._calcDistanceKm(
                { lat: a[1], lng: a[0] },
                { lat: b[1], lng: b[0] }
              );
          }
          if (acc > 0) distanceKm = acc;
        }
      }
      const distanceKmInt = Math.round(distanceKm);
      const distanceInMeters = Math.round(distanceKm * 1000);

      // Compute comprehensive fare (fills components)
      let comp;
      try {
        comp = await calculateComprehensiveFare({
          serviceType: "car recovery",
          vehicleType:
            data?.vehicleType ||
            data?.vehicleDetails?.type ||
            data?.vehicleDetails?.vehicleType ||
            null,
          distance: Number(distanceKm || 0),
          routeType: data?.routeType || "one_way",
          estimatedDuration: Number(data?.estimatedDuration || 0),
          waitingMinutes: Number(data?.options?.waitingTime || 0),
          demandRatio: Number(data?.demandRatio || 1),
          tripProgress: 0,
          isCancelled: false,
          cancellationReason: null,
          // Optional flags if your calc supports them:
          isNightTime: data?.options?.isNightTime ?? undefined,
          roundTrip: data?.options?.roundTrip ?? undefined,
          helper: data?.options?.helper ?? undefined,
          subService: subServiceNormalized || undefined,
        });
      } catch (e) {
        comp = {
          totalFare: 0,
          currency: "AED",
          baseFare: 0,
          distanceFare: 0,
          platformFee: 0,
          nightCharges: 0,
          surgeCharges: 0,
          waitingCharges: 0,
          cancellationCharges: 0,
          vatAmount: 0,
          subtotal: 0,
          breakdown: {},
          alerts: [],
        };
      }
      if (
        comp &&
        comp.breakdown &&
        (comp.breakdown.total == null || isNaN(comp.breakdown.total))
      ) {
        comp.breakdown.total = Number(comp?.totalFare ?? comp?.total ?? 0);
      }

      // Respect client-sent estimate if provided (authoritative for request)
      const clientEstimated =
        toNum(data?.estimatedFare) ?? toNum(data?.estimated?.amount);
      const computedEstimated = Number(comp?.totalFare ?? comp?.total ?? 0);
      const currencyFromConfig = comp?.currency || "AED";

      const estimatedFare =
        clientEstimated && clientEstimated > 0
          ? clientEstimated
          : computedEstimated;

      // Adjustment settings and min/max (from config, but aligned with REST)
      let cfg = null;
      try {
        cfg = await ComprehensivePricing.findOne({ isActive: true }).lean();
      } catch {}
      const allowedPercentage =
        Number(
          cfg?.serviceTypes?.carRecovery?.adjustmentSettings
            ?.allowedPercentage ??
            cfg?.adjustmentSettings?.allowedPercentage ??
            3
        ) || 3;

      // Compute min/max scenarios via calculator (more accurate than +/- % here)
      let minFare = estimatedFare;
      try {
        const minComp = await calculateComprehensiveFare({
          serviceType: "car recovery",
          vehicleType:
            data?.vehicleType ||
            data?.vehicleDetails?.type ||
            data?.vehicleDetails?.vehicleType ||
            null,
          distance: Number(distanceKm || 0),
          routeType: data?.routeType || "one_way",
          estimatedDuration: Number(data?.estimatedDuration || 0),
          waitingMinutes: 0,
          demandRatio: 1,
          tripProgress: 0,
          isCancelled: false,
          cancellationReason: null,
          isNightTime: false,
          subService: subServiceNormalized || undefined,
        });
        minFare = Number(minComp?.totalFare ?? minFare);
      } catch {}
      let maxFare = estimatedFare;
      try {
        const surgeLevels =
          cfg?.serviceTypes?.carRecovery?.surgePricing?.levels ??
          cfg?.surgePricing?.levels ??
          [];
        const maxDemandRatio = surgeLevels.length
          ? Math.max(
              ...surgeLevels
                .map((l) => Number(l?.demandRatio || 1))
                .filter((n) => Number.isFinite(n) && n >= 1)
            )
          : Number(data?.demandRatio || 1);
        const nightEnabled =
          (cfg?.serviceTypes?.carRecovery?.nightCharges?.enabled ??
            cfg?.nightCharges?.enabled) === true;

        const maxComp = await calculateComprehensiveFare({
          serviceType: "car recovery",
          vehicleType:
            data?.vehicleType ||
            data?.vehicleDetails?.type ||
            data?.vehicleDetails?.vehicleType ||
            null,
          distance: Number(distanceKm || 0),
          routeType: data?.routeType || "one_way",
          estimatedDuration: Number(data?.estimatedDuration || 0),
          waitingMinutes: Number(data?.options?.waitingTime || 0),
          demandRatio: maxDemandRatio,
          tripProgress: 0,
          isCancelled: false,
          cancellationReason: null,
          isNightTime: nightEnabled ? true : false,
          subService: subServiceNormalized || undefined,
        });
        maxFare = Number(maxComp?.totalFare ?? maxFare);
      } catch {}
      if (maxFare < minFare) maxFare = minFare;

      // Dynamic adjustment summary
      const surgePercent = Number(comp?.dynamicAdjustment?.surgePercent ?? 0);
      const dynamicAdjustment = {
        surgePercent,
        type:
          surgePercent > 0
            ? "increase"
            : surgePercent < 0
            ? "decrease"
            : "none",
      };

      // Trip details (REST-aligned)
      const tripDetails = {
        distance: `${Number(distanceKm || 0).toFixed(2)} km`,
        serviceType: "car recovery",
        serviceCategory: serviceCategory?.includes("towing")
          ? "towing"
          : serviceCategory,
        routeType: data?.routeType || "one_way",
        paymentMethod: data?.paymentMethod || "cash",
      };

      // Fare breakdown (keep calculator components; force total to authoritative estimatedFare)
      const fareBreakdown = {
        baseFare: Number(comp?.baseFare || 0),
        distanceFare: Number(comp?.distanceFare || 0),
        platformFee: Number(comp?.platformFee || 0),
        nightCharges: Number(comp?.nightCharges || 0),
        surgeCharges: Number(comp?.surgeCharges || 0),
        waitingCharges: Number(comp?.waitingCharges || 0),
        vatAmount: Number(comp?.vatAmount || 0),
        subtotal: Number(comp?.subtotal || 0),
        totalFare: Number(estimatedFare || 0),
        breakdown: {
          ...(typeof comp?.breakdown === "object" ? comp.breakdown : {}),
          total: Number(estimatedFare || 0),
        },
      };

      // Final fare fields for DB
      const offeredFare = estimatedFare;
      const fare = estimatedFare;
      const now = new Date();

      // Build DB doc
      const insertDoc = {
        status: "pending",
        user: userId || null,
        driver: null,
        serviceType,
        vehicleType: vehicleTypeDerived,
        serviceCategory,
        createdAt: now,
        updatedAt: now,
        pickupLocation: {
          address: data?.pickupLocation?.address || null,
          zone: pickupZone,
          coordinates: pickArr,
        },
        dropoffLocation: {
          address: data?.dropoffLocation?.address || null,
          zone: dropoffZone,
          coordinates: dropArr,
        },
        waypoints: Array.isArray(data?.waypoints) ? data.waypoints : [],
        distance: distanceKmInt,
        distanceInMeters,
        fare,
        offeredFare,
        fareDetails: {
          currency: currencyFromConfig,
          routeType: data?.routeType || "one_way",
          estimatedDistance: Number(distanceKm || 0),
          estimatedDuration: Number(data?.estimatedDuration || 0),
          waitingMinutes: Number(data?.options?.waitingTime || 0),
          demandRatio: Number(data?.demandRatio || 1),
          tripProgress: 0,
          estimatedFare: Number(estimatedFare || 0),
          estimatedRange: { min: minFare, max: maxFare },
          baseFare: fareBreakdown.baseFare,
          distanceFare: fareBreakdown.distanceFare,
          platformFee: fareBreakdown.platformFee,
          nightCharges: fareBreakdown.nightCharges,
          surgeCharges: fareBreakdown.surgeCharges,
          waitingCharges: fareBreakdown.waitingCharges,
          cancellationCharges: Number(comp?.cancellationCharges || 0),
          vatAmount: fareBreakdown.vatAmount,
          subtotal: fareBreakdown.subtotal,
          breakdown: fareBreakdown.breakdown,
          alerts: Array.isArray(comp?.alerts) ? comp.alerts : [],
          negotiation: { state: "open", proposed: null, history: [] },
          adjustmentSettings: {
            allowedPercentage,
            minFare,
            maxFare,
            canAdjustFare: true,
          },
        },
      };

      // Optional targeted driver
      const preferredDriverId = String(
        data?.preferredDispatch?.driverId || data?.driverId || ""
      ).trim();
      if (preferredDriverId)
        insertDoc.pendingAssignment = { driverId: preferredDriverId, at: now };

      // Persist
      const booking = await Booking.create(insertDoc);
      const bookingId = String(booking._id);

      // Customer profile
      let customerProfile = null;
      try {
        if (userId) {
          const cust = await User.findById(userId)
            .select(
              "firstName lastName email phoneNumber selfieImage username avatarUrl"
            )
            .lean();
          customerProfile = buildCustomerProfile(cust);
        }
      } catch {}

      // Cache
      const rec = {
        status: "pending",
        createdAt: now,
        bookingId,
        userId,
        pickupLocation: insertDoc.pickupLocation,
        dropoffLocation: insertDoc.dropoffLocation,
        estimatedFare: Number(estimatedFare || 0),
        currency: currencyFromConfig,
        freeStay: {},
        statusHistory: [{ status: "pending", timestamp: now }],
      };
      this.activeRecoveries.set(bookingId, rec);

      // ACK to requester (REST-aligned sections included)
      this.emitToClient(ws, {
        event: "request.created",
        bookingId,
        data: {
          status: "pending",
          bookingId,
          serviceType,
          serviceCategory,
          subService: subServiceNormalized || data?.subService || null,
          vehicleType: vehicleTypeDerived,
          pickupLocation: insertDoc.pickupLocation,
          dropoffLocation: insertDoc.dropoffLocation,
          distance: distanceKmInt,
          distanceInMeters,
          fare: { estimated: { customer: Number(estimatedFare || 0) } },
          fareDetails: {
            currency: currencyFromConfig,
            estimatedDistance: Number(distanceKm || 0),
            estimatedFare: Number(estimatedFare || 0),
            baseFare: insertDoc.fareDetails.baseFare,
            distanceFare: insertDoc.fareDetails.distanceFare,
            platformFee: insertDoc.fareDetails.platformFee,
            nightCharges: insertDoc.fareDetails.nightCharges,
            surgeCharges: insertDoc.fareDetails.surgeCharges,
            waitingCharges: insertDoc.fareDetails.waitingCharges,
            cancellationCharges: insertDoc.fareDetails.cancellationCharges,
            vatAmount: insertDoc.fareDetails.vatAmount,
            subtotal: insertDoc.fareDetails.subtotal,
            breakdown: insertDoc.fareDetails.breakdown, // includes total forced to estimatedFare
            alerts: insertDoc.fareDetails.alerts,
            negotiation: insertDoc.fareDetails.negotiation,
          },
          adjustmentSettings: {
            allowedPercentage,
            minFare,
            maxFare,
            canAdjustFare: true,
          },
          dynamicAdjustment,
          tripDetails: {
            ...tripDetails,
          },
          fareBreakdown, // includes totalFare forced to estimatedFare
          createdAt: now,
        },
      });

      // Discover drivers (unchanged)
      const searchRadiusKm = Math.max(
        1,
        Math.min(50, Number(data?.searchRadiusKm ?? data?.searchRadius ?? 15))
      );
      let discoveryFilters = {
        pinkCaptainOnly: !!data?.preferences?.pinkCaptainOnly,
        safety: {
          familyWithGuardianMale: !!data?.preferences?.familyWithGuardianMale,
          noMaleCompanion: !!data?.preferences?.noMaleCompanion,
          maleWithoutFemale: !!data?.preferences?.maleWithoutFemale,
        },
        preferredDispatch: {
          mode: data?.preferredDispatch?.mode || null,
          driverId: data?.preferredDispatch?.driverId || null,
        },
      };
      const pickupGeoForDiscovery = {
        type: "Point",
        coordinates: [pickArr[0], pickArr[1]],
        address: insertDoc.pickupLocation.address || "Unknown",
        zone: pickupZone,
      };
      let nearbyDrivers = await this.getAvailableDrivers(
        pickupGeoForDiscovery,
        searchRadiusKm,
        discoveryFilters
      );
      if (!nearbyDrivers || nearbyDrivers.length === 0) {
        const widerRadius = Math.min(50, Math.ceil(searchRadiusKm * 1.5));
        nearbyDrivers = await this.getAvailableDrivers(
          pickupGeoForDiscovery,
          widerRadius,
          discoveryFilters
        );
        if (!nearbyDrivers || nearbyDrivers.length === 0) {
          const filters2 = { ...discoveryFilters, ignoreGeo: true };
          nearbyDrivers = await this.getAvailableDrivers(
            pickupGeoForDiscovery,
            widerRadius,
            filters2
          );
        }
      }

      // Emit available drivers list to requester (kept)
      this.emitToClient(ws, {
        event: "carRecovery:driversAvailable",
        bookingId,
        data: {
          drivers: nearbyDrivers || [],
          count: nearbyDrivers?.length || 0,
          updatedAt: new Date(),
          dispatchMode: discoveryFilters?.preferredDispatch?.mode || null,
        },
      });

      // Broadcast to service rooms
      try {
        const baseRoom = `svc:${normKey("car recovery")}`;
        const categoryRoom = `svc:${normKey("car recovery")}:${normKey(
          serviceCategory
        )}`;
        const subKey = subServiceNormalized
          ? normKey(subServiceNormalized)
          : null;
        const subCategoryRoom = subKey
          ? `svc:${normKey("car recovery")}:${normKey(
              serviceCategory
            )}:${subKey}`
          : null;

        const newEventPayload = {
          event: "recovery.requested",
          bookingId,
          data: {
            serviceType,
            serviceCategory,
            pickupLocation: insertDoc.pickupLocation,
            dropoffLocation: insertDoc.dropoffLocation,
            distance: Number(distanceKm || 0),
            estimatedFare: Number(estimatedFare || 0),
            minFare,
            maxFare,
            currency: currencyFromConfig,
            vehicleType: vehicleTypeDerived,
            customer: customerProfile,
            at: now,
          },
        };
        const legacyEventPayload = {
          event: "newRecoveryRequest",
          bookingId,
          data: {
            bookingId,
            serviceType,
            serviceCategory,
            pickupLocation: insertDoc.pickupLocation,
            dropoffLocation: insertDoc.dropoffLocation,
            distance: Number(distanceKm || 0),
            estimatedFare: Number(estimatedFare || 0),
            minFare,
            maxFare,
            currency: currencyFromConfig,
            customer: customerProfile,
            at: now.toISOString(),
          },
        };

        if (this.webSocketService?.sendToRoom) {
          this.webSocketService.sendToRoom(baseRoom, newEventPayload);
          this.webSocketService.sendToRoom(baseRoom, legacyEventPayload);
          this.webSocketService.sendToRoom(categoryRoom, newEventPayload);
          this.webSocketService.sendToRoom(categoryRoom, legacyEventPayload);
          if (subCategoryRoom) {
            this.webSocketService.sendToRoom(subCategoryRoom, newEventPayload);
            this.webSocketService.sendToRoom(
              subCategoryRoom,
              legacyEventPayload
            );
          }
        }
      } catch {}
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

      // NEW: Notify customer that the driver is en route
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
      // Keep in-memory state if you rely on it elsewhere
      const recoveryRequest = this.activeRecoveries.get(id);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      // Update waiting time and charge (using configured rules)
      const waitingTime = Number(data?.waitingTime || 0);
      const waitingCharge = await this.calculateWaitingCharge(
        waitingTime,
        recoveryRequest
      );

      recoveryRequest.waitingTime = waitingTime;
      recoveryRequest.waitingCharge = waitingCharge;

      // Persist into DB: adjust booking.fare by replacing old waitingCharges
      const booking = await Booking.findById(id).select(
        "fare fareDetails status"
      );
      if (!booking) throw new Error("Booking not found");

      const fd = booking.fareDetails || {};
      const prevWaiting = Number(fd?.waitingCharges || 0);
      const currentFare = Number(booking.fare || 0);
      const newFare = currentFare - prevWaiting + Number(waitingCharge || 0);

      await Booking.findByIdAndUpdate(
        id,
        {
          $set: {
            fare: Number(newFare || 0),
            "fareDetails.waitingMinutes": waitingTime,
            "fareDetails.waitingCharges": Number(waitingCharge || 0),
            updatedAt: new Date(),
          },
        },
        { new: false }
      );

      // Notify client
      this.emitToClient(ws, {
        event: "waiting.time.updated",
        bookingId: id,
        data: {
          waitingTime,
          waitingCharge,
          fare: Number(newFare || 0),
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

      // If already started (idempotent)
      if (booking.status === "in_progress") {
        this.emitToClient(ws, {
          event: "recovery.started",
          bookingId,
          data: {
            status: "in_progress",
            alreadyStarted: true,
            driverId: String(booking.driver || ""),
            pickupLocation: booking.pickupLocation,
            dropoffLocation: booking.dropoffLocation,
            // If caller is driver, include customer for convenience
            ...(isDriver
              ? {
                  customer: await (async () => {
                    try {
                      const cust = await User.findById(String(booking.user))
                        .select(
                          "firstName lastName email phoneNumber selfieImage username avatarUrl"
                        )
                        .lean();
                      if (!cust) return null;
                      const name = `${cust.firstName ?? ""} ${
                        cust.lastName ?? ""
                      }`.trim();
                      return {
                        id: String(cust._id || ""),
                        name: name || cust.username || "User",
                        email: cust.email || null,
                        phone: cust.phoneNumber || cust.phone || null,
                        image: cust.selfieImage || cust.avatarUrl || null,
                      };
                    } catch {
                      return null;
                    }
                  })(),
                }
              : {}),
          },
        });
        return;
      }

      // If only accepted and not yet started (edge case), proceed
      if (booking.status !== "accepted") {
        throw new Error(
          `Service can be started only from accepted status (current: ${booking.status})`
        );
      }

      // Authorization (assigned driver or customer)
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
        // Relaxed state check: allow online/busy/on_ride
        const drv = await User.findById(authDriverId).select(
          "role isActive driverStatus"
        );
        if (!drv || drv.role !== "driver" || !drv.isActive) {
          throw new Error(
            "Driver is not in a valid state to start the service"
          );
        }
        if (!["online", "on_ride", "busy"].includes(drv.driverStatus)) {
          throw new Error("Driver must be available to start the service");
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

      // Map booking -> driver in Redis
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

      // Build customer profile (for driver notification and consistency)
      let customerProfile = null;
      try {
        const cust = await User.findById(String(booking.user))
          .select(
            "firstName lastName email phoneNumber selfieImage username avatarUrl"
          )
          .lean();
        if (cust) {
          const name = `${cust.firstName ?? ""} ${cust.lastName ?? ""}`.trim();
          customerProfile = {
            id: String(cust._id || ""),
            name: name || cust.username || "User",
            email: cust.email || null,
            phone: cust.phoneNumber || cust.phone || null,
            image: cust.selfieImage || cust.avatarUrl || null,
          };
        }
      } catch {}

      // Notify both sides that service started
      // ACK to caller (always include customer for consistency)
      this.emitToClient(ws, {
        event: "recovery.started",
        bookingId,
        data: {
          status: "in_progress",
          startedAt: now,
          driverId,
          pickupLocation: booking.pickupLocation,
          dropoffLocation: booking.dropoffLocation,
          customer: customerProfile,
        },
      });

      try {
        // Notify customer (include customer info for consistency)
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
              customer: customerProfile,
            },
          });
        }

        // Notify driver (includes customer info)
        this.webSocketService.sendToUser(String(driverId), {
          event: "recovery.started",
          bookingId,
          data: {
            status: "in_progress",
            startedAt: now,
            driverId,
            pickupLocation: booking.pickupLocation,
            dropoffLocation: booking.dropoffLocation,
            customer: customerProfile,
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
  async handleCancel(ws, message) {
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
    const bookingId = String(data?.bookingId || "").trim();
    const reason = String(data?.reason || "cancelled").trim();

    if (!bookingId) {
      this.emitToClient(ws, {
        event: "error",
        bookingId: null,
        error: { code: "CANCEL_ERROR", message: "bookingId is required" },
      });
      return;
    }

    // Idempotency: prevent concurrent/duplicate cancellation executions
    let lockAcquired = false;
    const lockKey = `booking:cancel:lock:${bookingId}`;
    try {
      // Acquire a 15s lock; if exists, drop duplicate calls
      lockAcquired = await redis.set(lockKey, "1", { NX: true, EX: 15 });
      if (!lockAcquired) {
        // Someone else is processing this cancel right now or just did
        this.emitToClient(ws, {
          event: "cancel.ack",
          bookingId,
          data: {
            status: "cancel_in_progress",
            reason,
          },
        });
        return;
      }
    } catch {
      // If locking fails, proceed (best-effort). Status check below still prevents duplicates.
    }

    try {
      // Authorization: only booking owner or assigned/pending driver
      const viewerId = String(ws?.user?._id || ws?.user?.id || "").trim();
      const booking = await Booking.findById(bookingId)
        .select(
          "user driver status pendingAssignment pickupLocation dropoffLocation fare fareDetails.currency fareDetails.finalFare fareDetails.breakdown cancellationReason cancelledAt"
        )
        .lean();
      if (!booking) throw new Error("Booking not found");

      const isParticipant =
        (booking.user && String(booking.user) === viewerId) ||
        (booking.driver && String(booking.driver) === viewerId) ||
        (booking?.pendingAssignment?.driverId &&
          String(booking.pendingAssignment.driverId) === viewerId);
      if (!isParticipant)
        throw new Error("Not authorized to cancel this booking");

      // If already cancelled/completed, send single notifications and ack (avoid reprocessing)
      if (["cancelled", "completed"].includes(booking.status)) {
        const alreadyData = {
          status: booking.status,
          alreadyCancelled: booking.status === "cancelled",
          reason:
            booking.status === "cancelled"
              ? booking.cancellationReason || reason
              : undefined,
          finalFare: Number(
            (typeof booking?.fareDetails?.finalFare === "object"
              ? booking?.fareDetails?.finalFare?.amount
              : booking?.fareDetails?.finalFare) ??
              booking?.fare ??
              0
          ),
          currency: booking?.fareDetails?.currency || "AED",
          breakdown: booking?.fareDetails?.breakdown || {},
          cancelledAt:
            booking.status === "cancelled"
              ? booking?.cancelledAt || new Date()
              : undefined,
        };

        // If status is 'cancelled', ensure both sides receive recovery.cancelled once
        if (booking.status === "cancelled") {
          const cancelPayload = {
            event: "recovery.cancelled",
            bookingId,
            data: {
              status: "cancelled",
              cancelledAt: alreadyData.cancelledAt,
              reason: alreadyData.reason || "cancelled",
              finalFare: alreadyData.finalFare,
              currency: alreadyData.currency,
              breakdown: alreadyData.breakdown,
            },
          };

          // Notify customer
          if (booking?.user)
            this.webSocketService.sendToUser(
              String(booking.user),
              cancelPayload
            );

          // Notify driver (assigned or pending assignment)
          const driverTargets = [];
          if (booking?.driver) driverTargets.push(String(booking.driver));
          else if (booking?.pendingAssignment?.driverId)
            driverTargets.push(String(booking.pendingAssignment.driverId));
          Array.from(new Set(driverTargets))
            .filter(Boolean)
            .forEach((drvId) =>
              this.webSocketService.sendToUser(drvId, cancelPayload)
            );

          // Optional broadcast to booking room
          if (this.webSocketService?.sendToRoom) {
            this.webSocketService.sendToRoom(
              `booking:${bookingId}`,
              cancelPayload
            );
          }
        }

        // Ack to requester (single)
        this.emitToClient(ws, {
          event: "cancel.ack",
          bookingId,
          data: alreadyData,
        });

        // Optional: also mark request unavailable in service room (only if cancelled)
        try {
          if (
            booking.status === "cancelled" &&
            this.webSocketService?.sendToRoom
          ) {
            const norm = (s) =>
              String(s || "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, "_");
            const st = norm("car recovery");
            const roomName = `svc:${st}`;
            this.webSocketService.sendToRoom(roomName, {
              event: "recovery.unavailable",
              bookingId,
              data: { reason: "cancelled" },
            });
          }
        } catch {}

        return;
      }

      // Recompute to include cancellation charges and persist fare details
      const now = new Date();
      const recomputed = await this._recomputeAndPersistFare(bookingId, {
        isCancelled: true,
        cancellationReason: reason,
      });
      const totalFareLatest =
        recomputed && recomputed.totalFare != null
          ? recomputed.totalFare
          : null;

      // Fallback to stored fare if recompute didn't return
      let fallbackFare = null;
      if (totalFareLatest == null) {
        const b = await Booking.findById(bookingId).select("fare").lean();
        fallbackFare = Number(b?.fare || 0);
      }

      // Atomic update with status + fare
      await Booking.findByIdAndUpdate(
        bookingId,
        {
          $set: {
            status: "cancelled",
            fare: totalFareLatest != null ? totalFareLatest : fallbackFare,
            cancelledAt: now,
            cancellationReason: reason,
            updatedAt: now,
          },
        },
        { new: false }
      );

      // Update in-memory cache
      const rec = this.activeRecoveries.get(bookingId) || {};
      rec.status = "cancelled";
      rec.cancelledAt = now;
      rec.statusHistory = rec.statusHistory || [];
      rec.statusHistory.push({
        status: "cancelled",
        timestamp: now,
        message: reason,
      });
      this.activeRecoveries.set(bookingId, rec);

      // Reload minimal for outbound payload and recipients
      const after = await Booking.findById(bookingId)
        .select(
          "user driver pendingAssignment fare fareDetails.currency fareDetails.finalFare fareDetails.breakdown"
        )
        .lean();

      const cancelPayload = {
        event: "recovery.cancelled",
        bookingId,
        data: {
          status: "cancelled",
          cancelledAt: now,
          reason,
          finalFare: Number(
            (typeof after?.fareDetails?.finalFare === "object"
              ? after?.fareDetails?.finalFare?.amount
              : after?.fareDetails?.finalFare) ??
              after?.fare ??
              0
          ),
          currency: after?.fareDetails?.currency || "AED",
          breakdown: after?.fareDetails?.breakdown || {},
        },
      };

      // Notify customer
      if (after?.user)
        this.webSocketService.sendToUser(String(after.user), cancelPayload);

      // Notify driver (assigned, started, or pending assignment)
      const driverTargets = [];
      if (after?.driver) driverTargets.push(String(after.driver));
      else if (after?.pendingAssignment?.driverId)
        driverTargets.push(String(after.pendingAssignment.driverId));
      Array.from(new Set(driverTargets))
        .filter(Boolean)
        .forEach((drvId) =>
          this.webSocketService.sendToUser(drvId, cancelPayload)
        );

      // Optional broadcast to booking room (kept)
      if (this.webSocketService?.sendToRoom) {
        this.webSocketService.sendToRoom(`booking:${bookingId}`, cancelPayload);
      }

      // Ack to requester
      this.emitToClient(ws, {
        event: "cancel.ack",
        bookingId,
        data: cancelPayload.data,
      });

      // Optional: also mark request unavailable in service room (unchanged)
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
            data: { reason: "cancelled" },
          });
        }
      } catch {}
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId,
        error: { code: "CANCEL_ERROR", message: error.message },
      });
    } finally {
      // Release idempotency lock
      try {
        if (lockAcquired) await redis.del(lockKey);
      } catch {}
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
   * Complete service, finalize fare  and push billing + booking details
   */
  async handleServiceComplete(ws, message) {
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

    // Small local helpers
    const toNum = (v) => {
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      if (v && typeof v === "object") {
        const n = Number(v.amount ?? v.total ?? 0);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };
    const buildCurrency = (fd) =>
      fd?.finalFare?.currency ||
      fd?.estimatedFare?.currency ||
      fd?.currency ||
      "AED";

    const coalesceBreakdown = (fd) => {
      const b = fd?.breakdown || {};
      const out = {
        baseFare: Number((b.baseFare ?? fd?.baseFare) || 0),
        distanceFare: Number((b.distanceFare ?? fd?.distanceFare) || 0),
        subtotal: Number((b.subtotal ?? fd?.subtotal) || 0),
        nightCharges: Number((b.nightCharges ?? fd?.nightCharges) || 0),
        surgeCharges: Number((b.surgeCharges ?? fd?.surgeCharges) || 0),
        waitingCharges: Number((b.waitingCharges ?? fd?.waitingCharges) || 0),
        cancellationCharges: Number(
          (b.cancellationCharges ?? fd?.cancellationCharges) || 0
        ),
        platformFee: Number((b.platformFee ?? fd?.platformFee) || 0),
        vatAmount: Number((b.vatAmount ?? fd?.vatAmount) || 0),
      };
      if (fd?.breakdown) {
        for (const [k, v] of Object.entries(fd.breakdown)) {
          if (!(k in out) && k !== "total") out[k] = v;
        }
      }
      return out;
    };
    const needsRebuild = (bk, breakdown) => {
      if (!bk) return false;
      const keys = [
        "baseFare",
        "distanceFare",
        "subtotal",
        "nightCharges",
        "surgeCharges",
        "waitingCharges",
        "cancellationCharges",
        "platformFee",
        "vatAmount",
      ];
      const sum = keys.reduce((acc, k) => acc + Number(breakdown[k] || 0), 0);
      return sum === 0;
    };
    const rebuildFromCalculator = async (bk) => {
      const fd = bk?.fareDetails || {};
      const toNumLocal = (v) => {
        if (typeof v === "number") return Number.isFinite(v) ? v : null;
        if (typeof v === "string" && v.trim() !== "") {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        }
        if (v && typeof v === "object") {
          const n = Number(v.amount ?? v.total ?? 0);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };

      const distance =
        toNumLocal(fd?.estimatedDistance) ?? toNumLocal(bk?.distance) ?? 0;
      const routeType = fd?.routeType || "one_way";
      const estimatedDuration = toNumLocal(fd?.estimatedDuration) ?? 0;
      const waitingMinutes = toNumLocal(fd?.waitingMinutes) ?? 0;
      const demandRatio = toNumLocal(fd?.demandRatio) ?? 1;
      const vehicleType = bk?.vehicleType || null;

      try {
        const comp = await calculateComprehensiveFare({
          serviceType: "car recovery",
          vehicleType,
          distance: Number(distance || 0),
          routeType,
          estimatedDuration: Number(estimatedDuration || 0),
          waitingMinutes: Number(waitingMinutes || 0),
          demandRatio: Number(demandRatio || 1),
          tripProgress: 1,
          isCancelled: false,
          cancellationReason: null,
        });

        const breakdown = {
          baseFare: Number(comp?.baseFare || 0),
          distanceFare: Number(comp?.distanceFare || 0),
          subtotal: Number(comp?.subtotal || 0),
          nightCharges: Number(comp?.nightCharges || 0),
          surgeCharges: Number(comp?.surgeCharges || 0),
          waitingCharges: Number(comp?.waitingCharges || 0),
          cancellationCharges: Number(comp?.cancellationCharges || 0),
          platformFee: Number(comp?.platformFee || 0),
          vatAmount: Number(comp?.vatAmount || 0),
          ...(comp?.breakdown && typeof comp.breakdown === "object"
            ? Object.fromEntries(
                Object.entries(comp.breakdown).filter(
                  ([k]) =>
                    ![
                      "baseFare",
                      "distanceFare",
                      "subtotal",
                      "nightCharges",
                      "surgeCharges",
                      "waitingCharges",
                      "cancellationCharges",
                      "platformFee",
                      "vatAmount",
                      "total",
                    ].includes(k)
                )
              )
            : {}),
        };
        const currency = comp?.currency || fd?.currency || "AED";
        return { breakdown, currency };
      } catch {
        return { breakdown: null, currency: fd?.currency || "AED" };
      }
    };

    try {
      if (!bookingId) throw new Error("bookingId is required");

      // Load booking
      const booking = await Booking.findById(bookingId).select(
        "status user driver vehicleType pickupLocation dropoffLocation acceptedAt startedAt fareDetails fare distance"
      );
      if (!booking) throw new Error("Booking not found");

      // Authorization
      const role = String(ws?.user?.role || "").toLowerCase();
      const isDriver = role === "driver";
      const isCustomer =
        role === "user" || role === "customer" || role === "client";
      let driverId = String(booking.driver || "") || null;
      if (!driverId)
        throw new Error("No assigned driver found on this booking");
      if (isDriver) {
        const authDriverId = String(ws?.user?.id || ws?.user?._id || "").trim();
        if (!authDriverId || authDriverId !== driverId) {
          throw new Error(
            "Not authorized: only the assigned driver can complete the service"
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
          "Unknown actor; only assigned driver or customer can complete the service"
        );
      }

      // Authoritative total strictly from DB: booking.fare (accepted fare)
      const fd = booking?.fareDetails || {};
      const currency = buildCurrency(fd);
      const now = new Date();
      const finalAmount = Number(booking?.fare || 0);

      // Persist completion (keep fare as-is; do not re-derive from calculator here)
      await Booking.findByIdAndUpdate(
        bookingId,
        {
          $set: {
            status: "completed",
            fare: Number(finalAmount || 0),
            completedAt: now,
            updatedAt: now,
          },
        },
        { new: false }
      );

      // Reload for outbound payloads
      const finalDoc = await Booking.findById(bookingId).select(
        "status user driver vehicleType pickupLocation dropoffLocation acceptedAt startedAt completedAt fareDetails fare distance"
      );
      const fd2 = finalDoc?.fareDetails || {};

      // Rebuild breakdown if needed (for display), but DO NOT use it to compute total
      let breakdown2 = coalesceBreakdown(fd2);
      if (needsRebuild(finalDoc, breakdown2)) {
        const rebuilt = await rebuildFromCalculator(finalDoc);
        if (rebuilt.breakdown) breakdown2 = rebuilt.breakdown;
      }

      // Totals strictly from DB top-level fare
      const totalAmount2 = Number(finalDoc?.fare || 0);

      const billing = {
        status: String(finalDoc?.status || "completed"),
        acceptedAt: finalDoc?.acceptedAt || null,
        startedAt: finalDoc?.startedAt || null,
        completedAt: finalDoc?.completedAt || null,
        total: {
          amount: Number(totalAmount2 || 0),
          currency: buildCurrency(fd2),
        },
        pickup: finalDoc?.pickupLocation
          ? {
              address: finalDoc.pickupLocation.address || null,
              zone: finalDoc.pickupLocation.zone || null,
              coordinates: finalDoc.pickupLocation.coordinates || null,
            }
          : null,
        dropoff: finalDoc?.dropoffLocation
          ? {
              address: finalDoc.dropoffLocation.address || null,
              zone: finalDoc.dropoffLocation.zone || null,
              coordinates: finalDoc.dropoffLocation.coordinates || null,
            }
          : null,
        finalFare: {
          amount: Number(totalAmount2 || 0),
          currency: buildCurrency(fd2),
        },
        estimatedFare:
          typeof fd2?.estimatedFare === "object" && fd2?.estimatedFare !== null
            ? fd2.estimatedFare
            : fd2?.estimatedFare != null
            ? {
                amount: Number(fd2.estimatedFare || 0),
                currency: buildCurrency(fd2),
              }
            : null,
        breakdown: breakdown2,
        vat:
          breakdown2.vatAmount > 0
            ? { amount: breakdown2.vatAmount, currency: buildCurrency(fd2) }
            : null,
        surge:
          breakdown2.surgeCharges > 0
            ? { amount: breakdown2.surgeCharges, currency: buildCurrency(fd2) }
            : null,
        platformFees:
          breakdown2.platformFee > 0
            ? { amount: breakdown2.platformFee, currency: buildCurrency(fd2) }
            : null,
        waitingCharges:
          breakdown2.waitingCharges > 0
            ? {
                amount: breakdown2.waitingCharges,
                currency: buildCurrency(fd2),
              }
            : null,
        extras: fd2?.extras ?? null,
      };

      const details = {
        status: String(finalDoc?.status || "completed"),
        acceptedAt: finalDoc?.acceptedAt || null,
        startedAt: finalDoc?.startedAt || null,
        completedAt: finalDoc?.completedAt || null,
        pickup: billing.pickup,
        dropoff: billing.dropoff,
        finalFare: billing.finalFare,
        estimatedFare: billing.estimatedFare,
        total: billing.total,
        breakdown: billing.breakdown,
        vat: fd2?.vat || null,
        surge: fd2?.surge || null,
        platformFees: billing.platformFees,
        waitingCharges: billing.waitingCharges,
        extras: fd2?.extras || null,
      };

      // Ack to caller
      this.emitToClient(ws, {
        event: "service.complete.ack",
        bookingId,
        data: { status: "completed", completedAt: now },
      });

      // Completed summary to both (use DB-only totals based on top-level fare)
      try {
        const toCustomer = String(finalDoc.user || "");
        const after = await Booking.findById(bookingId)
          .select("fare fareDetails.currency")
          .lean();

        const ccy = after?.fareDetails?.currency || "AED";
        const completedAmount = Number(after?.fare || 0);

        const completedPayload = {
          event: "recovery.completed",
          bookingId,
          data: {
            status: "completed",
            total: { amount: Number(completedAmount || 0), currency: ccy },
            details,
          },
        };

        // Send to customer and driver
        const toDriver = String(finalDoc.driver || "");
        this.webSocketService.sendToUsers(
          [toCustomer, toDriver],
          completedPayload
        );
      } catch {}
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        bookingId,
        error: {
          code: "SERVICE_COMPLETE_ERROR",
          message: error.message || "Failed to complete service",
        },
      });
    }
  }

  /**
   * Internal: Build billing payload from persisted booking document
   * Includes total fare, pickup/drop details, and available breakdowns
   */
  _buildBillingPayload(bk) {
    const fd = bk?.fareDetails || {};
    const currency =
      fd?.finalFare?.currency ||
      fd?.estimatedFare?.currency ||
      fd?.currency ||
      "AED";

    const toNum = (v) => {
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      if (v && typeof v === "object") {
        const n = Number(v.amount ?? v.total ?? 0);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };
    const pickFirstPositive = (...c) => {
      for (const x of c) {
        const n = toNum(x);
        if (n && n > 0) return n;
      }
      return null;
    };

    const totalAmount =
      pickFirstPositive(
        fd?.finalFare,
        fd?.breakdown?.total, // if you store a breakdown total
        fd?.estimatedFare,
        bk?.fare
      ) || 0;

    // Map comprehensive fields
    const vat = toNum(fd?.vatAmount ?? fd?.vat?.amount);
    const surge = toNum(fd?.surgeCharges ?? fd?.surge?.amount);
    const platformFees =
      fd?.platformFee != null
        ? { amount: Number(fd.platformFee || 0), currency }
        : null;
    const waitingCharges =
      fd?.waitingCharges != null
        ? { amount: Number(fd.waitingCharges || 0), currency }
        : null;

    const pickup = bk?.pickupLocation || null;
    const dropoff = bk?.dropoffLocation || null;

    return {
      status: String(bk?.status || "completed"),
      acceptedAt: bk?.acceptedAt || null,
      startedAt: bk?.startedAt || null,
      completedAt: bk?.completedAt || null,
      total: { amount: totalAmount, currency },
      pickup: pickup
        ? {
            address: pickup?.address || null,
            zone: pickup?.zone || null,
            coordinates: pickup?.coordinates || null,
          }
        : null,
      dropoff: dropoff
        ? {
            address: dropoff?.address || null,
            zone: dropoff?.zone || null,
            coordinates: dropoff?.coordinates || null,
          }
        : null,
      finalFare:
        typeof fd?.finalFare === "object" && fd?.finalFare !== null
          ? fd.finalFare
          : fd?.finalFare != null
          ? { amount: Number(fd.finalFare || 0), currency }
          : null,
      estimatedFare:
        typeof fd?.estimatedFare === "object" && fd?.estimatedFare !== null
          ? fd.estimatedFare
          : fd?.estimatedFare != null
          ? { amount: Number(fd.estimatedFare || 0), currency }
          : null,
      breakdown: fd?.breakdown || {
        baseFare: Number(fd?.baseFare || 0),
        distanceFare: Number(fd?.distanceFare || 0),
        subtotal: Number(fd?.subtotal || 0),
        nightCharges: Number(fd?.nightCharges || 0),
        surgeCharges: Number(fd?.surgeCharges || 0),
        waitingCharges: Number(fd?.waitingCharges || 0),
        cancellationCharges: Number(fd?.cancellationCharges || 0),
        platformFee: Number(fd?.platformFee || 0),
        vatAmount: Number(fd?.vatAmount || 0),
      },
      vat: vat != null ? { amount: vat, currency } : null,
      surge: surge != null ? { amount: surge, currency } : null,
      platformFees,
      waitingCharges,
      extras: fd?.extras ?? null,
    };
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

    const toNum = (v) => {
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      if (v && typeof v === "object") {
        const n = Number(v.amount ?? v.total ?? 0);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };
    const unwrapAmount = (v) =>
      typeof v === "number"
        ? v
        : typeof v === "object" && v !== null
        ? Number(v.amount || v.total || 0)
        : Number(v || 0);

    const buildCurrency = (fd) =>
      fd?.finalFare?.currency ||
      fd?.estimatedFare?.currency ||
      fd?.currency ||
      "AED";

    const coalesceBreakdown = (fd) => {
      const b = fd?.breakdown || {};
      const out = {
        baseFare: Number((b.baseFare ?? fd?.baseFare) || 0),
        distanceFare: Number((b.distanceFare ?? fd?.distanceFare) || 0),
        subtotal: Number((b.subtotal ?? fd?.subtotal) || 0),
        nightCharges: Number((b.nightCharges ?? fd?.nightCharges) || 0),
        surgeCharges: Number((b.surgeCharges ?? fd?.surgeCharges) || 0),
        waitingCharges: Number((b.waitingCharges ?? fd?.waitingCharges) || 0),
        cancellationCharges: Number(
          (b.cancellationCharges ?? fd?.cancellationCharges) || 0
        ),
        platformFee: Number((b.platformFee ?? fd?.platformFee) || 0),
        vatAmount: Number((b.vatAmount ?? fd?.vatAmount) || 0),
      };
      if (fd?.breakdown) {
        for (const [k, v] of Object.entries(fd.breakdown)) {
          if (!(k in out) && k !== "total") out[k] = v;
        }
      }
      return out;
    };

    const needsRebuild = (breakdown) => {
      const keys = [
        "baseFare",
        "distanceFare",
        "subtotal",
        "nightCharges",
        "surgeCharges",
        "waitingCharges",
        "cancellationCharges",
        "platformFee",
        "vatAmount",
      ];
      const sum = keys.reduce((acc, k) => acc + Number(breakdown[k] || 0), 0);
      return sum === 0;
    };

    const rebuildFromCalculator = async (bk) => {
      const fd = bk?.fareDetails || {};
      const distance = toNum(fd?.estimatedDistance) ?? toNum(bk?.distance) ?? 0;
      const routeType = fd?.routeType || "one_way";
      const estimatedDuration = toNum(fd?.estimatedDuration) ?? 0;
      const waitingMinutes = toNum(fd?.waitingMinutes) ?? 0;
      const demandRatio = toNum(fd?.demandRatio) ?? 1;
      const vehicleType = bk?.vehicleType || null;

      try {
        const comp = await calculateComprehensiveFare({
          serviceType: "car recovery",
          vehicleType,
          distance: Number(distance || 0),
          routeType,
          estimatedDuration: Number(estimatedDuration || 0),
          waitingMinutes: Number(waitingMinutes || 0),
          demandRatio: Number(demandRatio || 1),
          tripProgress: 1,
          isCancelled: false,
          cancellationReason: null,
        });

        const breakdown = {
          baseFare: Number(comp?.baseFare || 0),
          distanceFare: Number(comp?.distanceFare || 0),
          subtotal: Number(comp?.subtotal || 0),
          nightCharges: Number(comp?.nightCharges || 0),
          surgeCharges: Number(comp?.surgeCharges || 0),
          waitingCharges: Number(comp?.waitingCharges || 0),
          cancellationCharges: Number(comp?.cancellationCharges || 0),
          platformFee: Number(comp?.platformFee || 0),
          vatAmount: Number(comp?.vatAmount || 0),
          ...(comp?.breakdown && typeof comp.breakdown === "object"
            ? Object.fromEntries(
                Object.entries(comp.breakdown).filter(
                  ([k]) =>
                    ![
                      "baseFare",
                      "distanceFare",
                      "subtotal",
                      "nightCharges",
                      "surgeCharges",
                      "waitingCharges",
                      "cancellationCharges",
                      "platformFee",
                      "vatAmount",
                      "total",
                    ].includes(k)
                )
              )
            : {}),
        };
        const currency = comp?.currency || bk?.fareDetails?.currency || "AED";
        return { breakdown, currency };
      } catch {
        return {
          breakdown: null,
          currency: bk?.fareDetails?.currency || "AED",
        };
      }
    };

    try {
      const booking = await Booking.findById(id).select(
        "receipt fareDetails paymentDetails completedAt pickupLocation dropoffLocation status acceptedAt startedAt fare distance vehicleType"
      );
      if (!booking) throw new Error("Booking not found");

      const fd = booking.fareDetails || {};
      let breakdown = coalesceBreakdown(fd);

      if (needsRebuild(breakdown)) {
        const rebuilt = await rebuildFromCalculator(booking);
        if (rebuilt.breakdown) {
          breakdown = rebuilt.breakdown;
        }
      }

      const currency = buildCurrency(fd);

      // Total strictly from DB top-level fare (accepted fare / current fare)
      const totalAmount = Number(booking?.fare || 0) ?? 0;

      const billing = {
        status: String(booking?.status || "completed"),
        acceptedAt: booking?.acceptedAt || null,
        startedAt: booking?.startedAt || null,
        completedAt: booking?.completedAt || null,
        total: { amount: Number(totalAmount || 0), currency },
        pickup: booking?.pickupLocation
          ? {
              address: booking.pickupLocation.address || null,
              zone: booking.pickupLocation.zone || null,
              coordinates: booking.pickupLocation.coordinates || null,
            }
          : null,
        dropoff: booking?.dropoffLocation
          ? {
              address: booking.dropoffLocation.address || null,
              zone: booking.dropoffLocation.zone || null,
              coordinates: booking.dropoffLocation.coordinates || null,
            }
          : null,
        finalFare: { amount: Number(totalAmount || 0), currency },
        estimatedFare:
          typeof fd?.estimatedFare === "object" && fd?.estimatedFare !== null
            ? fd.estimatedFare
            : fd?.estimatedFare != null
            ? { amount: Number(fd.estimatedFare || 0), currency }
            : null,
        breakdown,
        vat:
          breakdown.vatAmount > 0
            ? { amount: breakdown.vatAmount, currency }
            : null,
        surge:
          breakdown.surgeCharges > 0
            ? { amount: breakdown.surgeCharges, currency }
            : null,
        platformFees:
          breakdown.platformFee > 0
            ? { amount: breakdown.platformFee, currency }
            : null,
        waitingCharges:
          breakdown.waitingCharges > 0
            ? { amount: breakdown.waitingCharges, currency }
            : null,
        extras: fd?.extras ?? null,
      };

      this.emitToClient(ws, {
        event: "billing.details",
        bookingId: id,
        data: billing,
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
      const roleStr = String(role || "").toLowerCase();
      const actorId = ws?.user?.id || ws?.user?._id;

      // Load booking with fields needed for validation and updates
      const booking = await Booking.findById(id)
        .select("user driver status rating")
        .populate("user", "firstName lastName phoneNumber")
        .lean(false); // need a document to mutate/save
      if (!booking) throw new Error("Booking not found");

      // Normalize and validate stars
      const s = Math.max(1, Math.min(5, Number(stars || 0)));
      if (!Number.isFinite(s) || s < 1 || s > 5) {
        throw new Error("stars must be an integer between 1 and 5");
      }

      // Enforce: only after completion
      if (String(booking.status) !== "completed") {
        throw new Error("You can rate only after the service is completed");
      }

      // Ensure rating container exists with correct shape
      booking.rating = booking.rating || {};
      booking.rating.userRating = booking.rating.userRating || {};
      booking.rating.driverRating = booking.rating.driverRating || {};

      if (roleStr === "customer") {
        // Only the customer linked to the booking can submit this
        if (String(actorId) !== String(booking.user))
          throw new Error("Unauthorized");

        // Prevent duplicate customer rating
        if (booking.rating?.userRating?.stars) {
          throw new Error("You have already rated this booking");
        }

        // 1) Save on booking (customer rates driver)
        booking.rating.userRating = {
          stars: s,
          comment: typeof text === "string" ? text.slice(0, 500) : undefined,
          ratedAt: new Date(),
        };
        await booking.save();

        // 2) Aggregate into driver's profile
        if (booking.driver) {
          const driver = await User.findById(booking.driver)
            .select("driverRating firstName lastName phoneNumber")
            .lean(false);
          if (driver) {
            if (!driver.driverRating) {
              driver.driverRating = { average: 0, count: 0, reviews: [] };
            }

            const prevAvg = Number(driver.driverRating.average || 0);
            const prevCnt = Number(driver.driverRating.count || 0);
            const newCnt = prevCnt + 1;
            const newAvg = (prevAvg * prevCnt + s) / newCnt;

            driver.driverRating.average = Number(newAvg.toFixed(2));
            driver.driverRating.count = newCnt;

            const customerName =
              (booking.user?.firstName || "") +
              (booking.user?.lastName ? ` ${booking.user.lastName}` : "");

            driver.driverRating.reviews = driver.driverRating.reviews || [];
            driver.driverRating.reviews.push({
              booking: booking._id,
              customer: booking.user?._id || booking.user,
              stars: s,
              comment:
                typeof text === "string" ? text.slice(0, 500) : undefined,
              customerInfo: {
                name: customerName.trim() || undefined,
                phoneNumber: booking.user?.phoneNumber || undefined,
              },
              createdAt: new Date(),
            });

            await driver.save();

            // Notify driver
            if (this.webSocketService?.sendToUser) {
              this.webSocketService.sendToUser(String(booking.driver), {
                event: "rating.received",
                bookingId: id,
                data: { from: "customer", stars: s },
              });
            }
          }
        }
      } else if (roleStr === "driver") {
        // Only the driver linked to the booking can submit this
        if (String(actorId) !== String(booking.driver))
          throw new Error("Unauthorized");

        // Prevent duplicate driver rating
        if (booking.rating?.driverRating?.stars) {
          throw new Error("You have already rated this booking");
        }

        // Save on booking (driver rates customer)
        booking.rating.driverRating = {
          stars: s,
          comment: typeof text === "string" ? text.slice(0, 500) : undefined,
          ratedAt: new Date(),
        };
        await booking.save();

        // Notify customer
        if (booking.user && this.webSocketService?.sendToUser) {
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
        data: { role: roleStr, stars: s },
      });

      // Optional: notify admins on very low ratings
      try {
        if (s <= 2 && this.webSocketService?.broadcastToAdmins) {
          this.webSocketService.broadcastToAdmins({
            event: "admin.rating.low",
            bookingId: id,
            data: { role: roleStr, stars: s, at: new Date() },
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
   * Negotiation: accept current fare (driver or customer) -> lock final fare and proceed (your current flow)
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
        "status user driver pendingAssignment fareDetails pickupLocation dropoffLocation acceptedAt startedAt"
      );
      if (!booking) throw new Error("Booking not found");
      if (["cancelled", "completed"].includes(booking.status)) {
        throw new Error(`Cannot accept fare on a ${booking.status} booking`);
      }

      // Resolve/ensure driverId
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

      // Validate driver (allow online/busy/on_ride)
      const driver = await User.findById(driverId).select(
        "firstName lastName email phoneNumber selfieImage role kycStatus kycLevel isActive driverStatus"
      );
      if (!driver || driver.role !== "driver")
        throw new Error("Invalid driver");
      if (
        !(driver.kycStatus === "approved" && Number(driver.kycLevel || 0) >= 2)
      ) {
        throw new Error("Driver KYC not approved");
      }
      if (
        !(
          driver.isActive === true &&
          ["online", "on_ride", "busy"].includes(driver.driverStatus)
        )
      ) {
        throw new Error("Driver is not in a valid state to accept");
      }

      // Determine accepted amount from payload/negotiation/estimate
      const proposed = booking?.fareDetails?.negotiation?.proposed || {};
      const acceptedAmount =
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

      // Persist: assign driver, set accepted fare as current fare, transition to in_progress
      await Booking.findByIdAndUpdate(
        bookingId,
        {
          $set: {
            status: "in_progress",
            driver: driverId, // ensure driver is assigned
            acceptedAt: now,
            startedAt: now,

            // Persist accepted fare in DB
            fare: Number(acceptedAmount || 0),
            "fareDetails.acceptedFare": {
              amount: acceptedAmount,
              currency,
              by: isDriver ? "driver" : "customer",
              at: now,
            },

            // Update negotiation state
            "fareDetails.negotiation.state": "accepted",
            "fareDetails.negotiation.endedAt": now,
          },
          $push: {
            "fareDetails.negotiation.history": {
              action: "accept",
              by: isDriver ? "driver" : "customer",
              amount: acceptedAmount,
              currency,
              at: now,
            },
          },
          // Do not keep any stale final fare here; final will be set at billing/completion
          $unset: { pendingAssignment: "", "fareDetails.finalFare": "" },
        },
        { new: false }
      );

      // Update cache
      let rec = this.activeRecoveries.get(bookingId) || {};
      rec.status = "in_progress";
      rec.acceptedAt = now;
      rec.startedAt = now;
      rec.driverId = driverId;
      rec.statusHistory = rec.statusHistory || [];
      rec.statusHistory.push(
        {
          status: "accepted",
          timestamp: now,
          driverId,
          message: "Fare accepted and booking assigned to driver",
        },
        {
          status: "in_progress",
          timestamp: now,
          driverId,
          message: "Service started after fare acceptance",
        }
      );
      delete rec.pendingAssignment;
      this.activeRecoveries.set(bookingId, rec);

      // Build driver profile + vehicle details
      const driverProfile = {
        id: String(driverId),
        name: `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim(),
        email: driver.email || null,
        phone: driver.phoneNumber || null,
        image: driver.selfieImage || null,
      };

      let vehicleDetails = null;
      try {
        const vehicle = await Vehicle.findOne({
          userId: driverId,
          isActive: true,
          status: "approved",
          serviceType: "car recovery",
        })
          .select(
            "vehicleRegistrationCard roadAuthorityCertificate insuranceCertificate vehicleImages vehicleOwnerName companyName vehiclePlateNumber vehicleMakeModel chassisNumber vehicleColor registrationExpiryDate serviceType serviceCategory vehicleType wheelchair packingHelper loadingUnloadingHelper fixingHelper"
          )
          .lean();
        if (vehicle) {
          vehicleDetails = {
            id: String(vehicle._id || ""),
            vehicleRegistrationCard: vehicle.vehicleRegistrationCard || null,
            roadAuthorityCertificate: vehicle.roadAuthorityCertificate || null,
            insuranceCertificate: vehicle.insuranceCertificate || null,
            vehicleImages: Array.isArray(vehicle.vehicleImages)
              ? vehicle.vehicleImages
              : [],
            vehicleOwnerName: vehicle.vehicleOwnerName || null,
            companyName: vehicle.companyName || null,
            vehiclePlateNumber: vehicle.vehiclePlateNumber || null,
            vehicleMakeModel: vehicle.vehicleMakeModel || null,
            chassisNumber: vehicle.chassisNumber || null,
            vehicleColor: vehicle.vehicleColor || null,
            registrationExpiryDate: vehicle.registrationExpiryDate || null,
            serviceType: vehicle.serviceType || null,
            serviceCategory: vehicle.serviceCategory || null,
            vehicleType: vehicle.vehicleType || null,
            wheelchair: !!vehicle.wheelchair,
            packingHelper: !!vehicle.packingHelper,
            loadingUnloadingHelper: !!vehicle.loadingUnloadingHelper,
            fixingHelper: !!vehicle.fixingHelper,
          };
        }
      } catch {}

      // Build customer profile (so recovery.started includes customer info)
      let customerProfile = null;
      try {
        if (booking?.user) {
          const cust = await User.findById(String(booking.user))
            .select(
              "firstName lastName email phoneNumber selfieImage username avatarUrl"
            )
            .lean();
          if (cust) {
            const name = `${cust.firstName ?? ""} ${
              cust.lastName ?? ""
            }`.trim();
            customerProfile = {
              id: String(cust._id || ""),
              name: name || cust.username || "User",
              email: cust.email || null,
              phone: cust.phoneNumber || cust.phone || null,
              image: cust.selfieImage || cust.avatarUrl || null,
            };
          }
        }
      } catch {}

      // Ack to caller
      this.emitToClient(ws, {
        event: "fare.accept.ack",
        bookingId,
        data: {
          status: "in_progress",
          acceptedAt: now,
          startedAt: now,
          driverId,
          acceptedFare: { amount: acceptedAmount, currency },
        },
      });

      // 1) driver.assigned (both) — include acceptedFare
      try {
        const toCustomer = String(booking.user || "");
        if (toCustomer) {
          this.webSocketService.sendToUser(toCustomer, {
            event: "driver.assigned",
            bookingId,
            data: {
              driver: driverProfile,
              vehicleDetails,
              acceptedAt: now,
              startedAt: now,
              acceptedFare: { amount: acceptedAmount, currency },
            },
          });
        }
        this.webSocketService.sendToUser(String(driverId), {
          event: "driver.assigned",
          bookingId,
          data: {
            driver: driverProfile,
            vehicleDetails,
            acceptedAt: now,
            startedAt: now,
            acceptedFare: { amount: acceptedAmount, currency },
          },
        });
      } catch {}

      // 2) recovery.accepted (both)
      try {
        const toCustomer = String(booking.user || "");
        const acceptedPayload = {
          event: "recovery.accepted",
          bookingId,
          data: {
            status: "accepted",
            driverId,
            acceptedAt: now,
            acceptedFare: { amount: acceptedAmount, currency },
          },
        };
        if (toCustomer)
          this.webSocketService.sendToUser(toCustomer, acceptedPayload);
        this.webSocketService.sendToUser(String(driverId), acceptedPayload);
      } catch {}

      // 3) recovery.started (both) — include customer info + acceptedFare
      try {
        const startedPayload = {
          event: "recovery.started",
          bookingId,
          data: {
            status: "in_progress",
            startedAt: now,
            driverId,
            pickupLocation: booking.pickupLocation,
            dropoffLocation: booking.dropoffLocation,
            driverProfile,
            vehicleDetails,
            customer: customerProfile,
            acceptedFare: { amount: acceptedAmount, currency },
          },
        };
        const toCustomer = String(booking.user || "");
        if (toCustomer)
          this.webSocketService.sendToUser(toCustomer, startedPayload);
        this.webSocketService.sendToUser(String(driverId), startedPayload);
      } catch {}

      // Optional broadcast to hide from other drivers (kept)
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
    // Helpers
    const toNum = (v) => {
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };
    const buildInfo = (u) => {
      if (!u) return null;
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      return {
        id: String(u._id || u.id || ""),
        name: name || u.username || "User",
        email: u.email || null,
        phone: u.phoneNumber || u.phone || null,
        image: u.selfieImage || u.avatarUrl || null,
      };
    };
    const buildProfile = (u) => {
      if (!u) return null;
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      return {
        id: String(u._id || u.id || ""),
        name: name || u.username || "User",
        email: u.email || null,
        phone: u.phoneNumber || u.phone || null,
        image: u.selfieImage || u.avatarUrl || null,
      };
    };

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
    const action = String(data?.action || "").toLowerCase();
    const currency = data?.currency || "AED";

    try {
      if (!bookingId) throw new Error("bookingId is required");

      // Load booking
      const booking = await Booking.findById(bookingId).select(
        "status user driver fareDetails pickupLocation dropoffLocation"
      );
      if (!booking) throw new Error("Booking not found");

      // Actor detection
      const role = String(ws?.user?.role || "").toLowerCase();
      let by =
        data?.by &&
        ["driver", "customer"].includes(String(data.by).toLowerCase())
          ? String(data.by).toLowerCase()
          : null;
      const isDriver = role === "driver";
      const isCustomer = ["user", "customer", "client"].includes(role);
      if (isDriver) by = "driver";
      if (isCustomer) by = "customer";
      if (!by) {
        if (
          ws?.user?._id &&
          booking?.user &&
          String(booking.user) === String(ws.user._id)
        )
          by = "customer";
        else if (
          ws?.user?._id &&
          booking?.driver &&
          String(booking.driver) === String(ws.user._id)
        )
          by = "driver";
        else by = "customer";
      }

      // Resolve driverId context
      let driverId = null;
      if (by === "driver") {
        driverId = String(ws?.user?.id || ws?.user?._id || "").trim() || null;
      } else {
        driverId =
          String(data?.driverId || "").trim() ||
          (booking?.driver ? String(booking.driver) : "") ||
          "";
        driverId = driverId || null;
      }

      const now = new Date();

      // Build actor/counterparty info
      let offeredBy = null;
      let counterparty = null;
      try {
        if (by === "driver") {
          const drv = await User.findById(ws?.user?.id || ws?.user?._id)
            .select(
              "firstName lastName email phoneNumber selfieImage username avatarUrl"
            )
            .lean();
          offeredBy = buildInfo(drv);
          if (booking?.user) {
            const cust = await User.findById(booking.user)
              .select(
                "firstName lastName email phoneNumber selfieImage username avatarUrl"
              )
              .lean();
            counterparty = buildProfile(cust);
          }
        } else {
          if (booking?.user) {
            const cust = await User.findById(booking.user)
              .select(
                "firstName lastName email phoneNumber selfieImage username avatarUrl"
              )
              .lean();
            offeredBy = buildInfo(cust);
          }
          const targetDriverId = driverId || booking?.driver || null;
          if (targetDriverId) {
            const drv = await User.findById(String(targetDriverId))
              .select(
                "firstName lastName email phoneNumber selfieImage username avatarUrl"
              )
              .lean();
            counterparty = buildProfile(drv);
          }
        }
      } catch {}

      // If user is rejecting the offer
      if (action === "reject") {
        // Terminal states still allow rejecting with a soft ACK, no throws
        const update = {
          $set: {
            "fareDetails.negotiation.state": "rejected",
            "fareDetails.negotiation.lastAction": {
              by,
              action: "reject",
              at: now,
            },
          },
          $push: {
            "fareDetails.negotiation.history": {
              action: "reject",
              by,
              at: now,
            },
          },
        };
        try {
          await Booking.findByIdAndUpdate(bookingId, update, { new: false });
        } catch {
          // Even if update fails (e.g., terminal booking), proceed with ACK notifications
        }

        // ACK to caller
        this.emitToClient(ws, {
          event: "fare.offer.reject.ack",
          bookingId,
          data: {
            status: booking.status,
            negotiationState: "rejected",
            by,
            at: now,
            offeredBy,
            counterparty,
          },
        });

        // Notify counterpart of rejection
        try {
          const toCustomer = String(booking.user || "");
          const toDriver = String(driverId || booking.driver || "");
          const payload = {
            event: "fare.offer.rejected",
            bookingId,
            data: {
              by,
              at: now,
              pickupLocation: booking.pickupLocation,
              dropoffLocation: booking.dropoffLocation,
              offeredBy,
              counterparty,
            },
          };
          if (by === "driver" && toCustomer)
            this.webSocketService.sendToUser(toCustomer, payload);
          if (by === "customer" && toDriver)
            this.webSocketService.sendToUser(toDriver, payload);
        } catch {}
        return;
      }

      // Regular offer path
      const amount =
        toNum(data?.amount) ??
        toNum(data?.offer) ??
        toNum(data?.proposed?.amount);

      // Tolerant flow: if booking already accepted/in_progress, don't throw on first attempt.
      if (["accepted", "in_progress"].includes(String(booking.status))) {
        // Soft-ACK with negotiation closed
        this.emitToClient(ws, {
          event: "fare.offer.ack",
          bookingId,
          data: {
            status: booking.status,
            proposed: amount ? { amount, currency, by, at: now } : null,
            negotiationState: "closed",
            message: "Negotiation is closed for this booking",
            offeredBy,
            counterparty,
          },
        });
        // Do not notify counterpart in closed state to avoid confusion
        return;
      }

      // Validate amount only for open bookings
      if (!amount || amount <= 0) throw new Error("Valid amount is required");

      // Persist negotiation state + proposed
      const update = {
        $set: {
          "fareDetails.negotiation.state":
            booking?.fareDetails?.negotiation?.state || "open",
          "fareDetails.negotiation.proposed": { amount, currency, by, at: now },
        },
        $push: {
          "fareDetails.negotiation.history": {
            action: "offer",
            by,
            amount,
            currency,
            at: now,
          },
        },
      };
      await Booking.findByIdAndUpdate(bookingId, update, { new: false });

      // Fetch admin allowedPercentage for min/max computation
      let cfg = null;
      try {
        cfg = await ComprehensivePricing.findOne({ isActive: true })
          .select(
            "serviceTypes.carRecovery.adjustmentSettings adjustmentSettings"
          )
          .lean();
      } catch {}
      const allowedPercentage =
        Number(
          cfg?.serviceTypes?.carRecovery?.adjustmentSettings
            ?.allowedPercentage ??
            cfg?.adjustmentSettings?.allowedPercentage ??
            3
        ) || 3;

      // Compute min/max around offered amount
      const minFare = Math.max(
        0,
        Math.round(amount * (1 - allowedPercentage / 100) * 100) / 100
      );
      const maxFare = Math.max(
        0,
        Math.round(amount * (1 + allowedPercentage / 100) * 100) / 100
      );

      // ACK to caller (include min/max band)
      this.emitToClient(ws, {
        event: "fare.offer.ack",
        bookingId,
        data: {
          status: booking.status,
          proposed: { amount, currency, by, at: now },
          negotiationState: booking?.fareDetails?.negotiation?.state || "open",
          offeredBy,
          counterparty,
          minFare,
          maxFare,
          allowedPercentage,
        },
      });

      // Notify counterpart (include min/max band)
      try {
        const toCustomer = String(booking.user || "");
        const toDriver = String(driverId || booking.driver || "");
        const payload = {
          event: "fare.offered",
          bookingId,
          data: {
            amount,
            currency,
            by,
            at: now,
            pickupLocation: booking.pickupLocation,
            dropoffLocation: booking.dropoffLocation,
            offeredBy,
            minFare,
            maxFare,
            allowedPercentage,
          },
        };
        if (by === "driver" && toCustomer)
          this.webSocketService.sendToUser(toCustomer, payload);
        if (by === "customer" && toDriver)
          this.webSocketService.sendToUser(toDriver, payload);
      } catch {}
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

  /**
   * Driver says "I'm coming" with a dynamic, frontend-controlled message
   */
  async handleDriverOnTheWay(ws, message) {
    // Small helpers to stay consistent with the file
    const toStr = (v) => (v == null ? "" : String(v));
    const buildDriverProfile = (u) => {
      if (!u) return null;
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      return {
        id: String(u._id || u.id || ""),
        name: name || u.username || "Driver",
        email: u.email || null,
        phone: u.phoneNumber || null,
        image: u.selfieImage || u.avatarUrl || null,
      };
    };

    // Normalize incoming message
    let msg = message || {};
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        msg = { raw: message };
      }
    }
    const data = msg?.data || msg || {};
    const bookingId = toStr(data?.bookingId || "").trim();
    const role = String(ws?.user?.role || "").toLowerCase();
    const driverId = String(ws?.user?._id || ws?.user?.id || "").trim();

    try {
      // Validate role and input
      if (role !== "driver")
        throw new Error("Only drivers can send this event");
      if (!driverId) throw new Error("Driver identity required");
      if (!bookingId) throw new Error("bookingId is required");

      // Load booking
      const booking = await Booking.findById(bookingId).select(
        "status user driver pickupLocation dropoffLocation fareDetails"
      );
      if (!booking) throw new Error("Booking not found");

      // Basic authorization: must be assigned driver (if booking has driver)
      if (booking?.driver && String(booking.driver) !== driverId) {
        throw new Error("Driver is not assigned to this booking");
      }

      // Resolve the message (frontend-controlled text)
      const text = toStr(data?.message || "I'm coming").slice(0, 1000);
      const now = new Date();

      // Optional: build driver profile for the customer’s view
      let driverProfile = null;
      try {
        const d = await User.findById(driverId).select(
          "firstName lastName email phoneNumber selfieImage username avatarUrl"
        );
        driverProfile = buildDriverProfile(d);
      } catch {}

      // Persist a lightweight status entry
      try {
        await Booking.findByIdAndUpdate(
          bookingId,
          {
            $set: {
              "fareDetails.negotiation.updatedAt": now,
              driverOnTheWayAt: now,
            },
            $push: {
              statusHistory: {
                status: "on_the_way",
                timestamp: now,
                message: text,
              },
            },
          },
          { new: false }
        );
      } catch {}

      // ACK to driver
      this.emitToClient(ws, {
        event: "recovery.on_the_way.ack",
        bookingId,
        data: {
          at: now,
          message: text,
        },
      });

      // Notify customer with the dynamic message
      try {
        if (booking?.user) {
          this.webSocketService.sendToUser(String(booking.user), {
            event: "recovery.on_the_way",
            bookingId,
            data: {
              at: now,
              message: text,
              driver: driverProfile,
              pickupLocation: booking.pickupLocation || null,
              dropoffLocation: booking.dropoffLocation || null,
            },
          });
        }
      } catch {}
    } catch (error) {
      logger.error("Error in handleDriverOnTheWay:", error);
      this.emitToClient(ws, {
        event: "error",
        bookingId: bookingId || null,
        error: { code: "DRIVER_ON_THE_WAY_ERROR", message: error.message },
      });
    }
  }

  // Helper: distance in KM between two points
  _calcDistanceKm(from, to) {
    const norm = (p) => {
      if (!p) return null;

      // Array form: [lng, lat]
      if (Array.isArray(p) && p.length >= 2) {
        const lng = Number(p[0]);
        const lat = Number(p[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return { lat, lng };
        }
        return null;
      }

      // Object form: { lat, lng } or { latitude, longitude }
      const lat = Number(p.lat ?? p.latitude);
      const lng = Number(p.lng ?? p.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
      return null;
    };

    const A = norm(from);
    const B = norm(to);
    if (!A || !B) return 0;

    const R = 6371; // km
    const dLat = ((B.lat - A.lat) * Math.PI) / 180;
    const dLon = ((B.lng - A.lng) * Math.PI) / 180;
    const lat1 = (A.lat * Math.PI) / 180;
    const lat2 = (B.lat * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    // Higher precision to avoid near-zero truncation; meters rounding is done by callers
    return Number((R * c).toFixed(6));
  }

  // Recompute fare from Comprehensive Pricing and persist onto Booking
  async _recomputeAndPersistFare(bookingId, overrides = {}) {
    try {
      // Load booking with participants (for targeted emits)
      const booking = await Booking.findById(bookingId)
        .select(
          "user driver serviceType serviceCategory vehicleType distance distanceInMeters routeType status cancellationReason fareDetails"
        )
        .lean();
      if (!booking) return null;

      const fd = booking.fareDetails || {};
      // Support more overrides to mirror comprehensive inputs
      // If 'distance' or 'routeType' are provided, they override stored ones
      const distanceKm =
        overrides.distance != null
          ? Number(overrides.distance)
          : Number(booking.distance ?? fd.estimatedDistance ?? 0);
      const routeType = overrides.routeType || booking.routeType || "one_way";

      const payload = {
        serviceType: "car recovery",
        vehicleType: booking.vehicleType || null,
        distance: distanceKm,
        routeType,
        estimatedDuration: Number(
          overrides.estimatedDuration ?? fd.estimatedDuration ?? 0
        ),
        waitingMinutes: Number(
          overrides.waitingMinutes ?? fd.waitingMinutes ?? 0
        ),
        demandRatio: Number(overrides.demandRatio ?? fd.demandRatio ?? 1),
        tripProgress: Number(overrides.tripProgress ?? fd.tripProgress ?? 0),
        isCancelled: Boolean(
          overrides.isCancelled ?? booking.status === "cancelled"
        ),
        cancellationReason:
          overrides.cancellationReason ?? booking.cancellationReason ?? null,
      };

      const comp = await calculateComprehensiveFare(payload);
      const totalFare = Number(comp?.totalFare || comp?.total || 0);

      const isCompleted =
        payload.tripProgress >= 1 || booking.status === "completed";

      // Prepare updated fareDetails while preserving negotiation object
      const updatedFareDetails = {
        ...fd,
        currency: comp?.currency ?? fd?.currency ?? "AED",

        // persist inputs for future recomputations
        estimatedDistance: distanceKm,
        estimatedDuration: payload.estimatedDuration,
        waitingMinutes: payload.waitingMinutes,
        demandRatio: payload.demandRatio,
        tripProgress: payload.tripProgress,
        routeType,

        // mapped outputs
        baseFare: Number(comp?.baseFare || 0),
        distanceFare: Number(comp?.distanceFare || 0),
        platformFee: Number(comp?.platformFee || 0),
        nightCharges: Number(comp?.nightCharges || 0),
        surgeCharges: Number(comp?.surgeCharges || 0),
        waitingCharges: Number(comp?.waitingCharges || 0),
        cancellationCharges: Number(comp?.cancellationCharges || 0),
        vatAmount: Number(comp?.vatAmount || 0),
        subtotal: Number(comp?.subtotal || 0),
        breakdown: comp?.breakdown || fd?.breakdown || {},
        alerts: comp?.alerts || fd?.alerts || [],

        // keep negotiation intact
        negotiation: fd?.negotiation || {
          state: "open",
          proposed: null,
          history: [],
        },

        // keep estimatedFare (number) aligned
        estimatedFare: totalFare,
        // object mirrors for consumers that expect {amount,currency}
        estimatedFareObj: {
          amount: totalFare,
          currency: comp?.currency ?? fd?.currency ?? "AED",
        },
        // set finalFare object only when completed
        ...(isCompleted
          ? {
              finalFare: {
                amount: totalFare,
                currency: comp?.currency ?? fd?.currency ?? "AED",
              },
            }
          : {}),
      };

      // Only write if something changed (cheap diff on key totals)
      const priorFare = Number(booking?.fare ?? 0);
      const hasFareChanged = priorFare !== totalFare;
      const hasDetailsChanged = true; // we update inputs and breakdown; treat as changed

      if (hasFareChanged || hasDetailsChanged) {
        await Booking.findByIdAndUpdate(
          bookingId,
          {
            $set: {
              // persist top-level fare for quick reads
              fare: totalFare,
              // persist rich details
              fareDetails: updatedFareDetails,
              // optional: keep payment total aligned
              "paymentDetails.totalAmount": totalFare,
              // keep routeType if overridden (optional, but useful)
              ...(overrides.routeType ? { routeType } : {}),
              updatedAt: new Date(),
            },
          },
          { new: false }
        );
      }

      // Optional suppression of events
      if (!overrides.silent) {
        const updatePayload = {
          event: "fare.updated",
          bookingId,
          data: {
            totalFare,
            currency: updatedFareDetails.currency,
            breakdown: updatedFareDetails.breakdown,
            alerts: updatedFareDetails.alerts,
            at: new Date().toISOString(),
            ...(updatedFareDetails.finalFare != null
              ? { finalFare: updatedFareDetails.finalFare }
              : {}),
          },
        };
        try {
          if (booking.user)
            this.webSocketService.sendToUser(
              String(booking.user),
              updatePayload
            );
          if (booking.driver)
            this.webSocketService.sendToUser(
              String(booking.driver),
              updatePayload
            );
          if (this.webSocketService?.sendToRoom) {
            this.webSocketService.sendToRoom(
              `booking:${bookingId}`,
              updatePayload
            );
          }
        } catch {}
      }

      return { totalFare, fareDetails: updatedFareDetails };
    } catch (e) {
      logger.warn("Fare recompute failed:", e?.message || e);
      return null;
    }
  }
}

export default RecoveryHandler;
