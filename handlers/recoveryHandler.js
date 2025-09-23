import {
  WS_EVENTS,
  VEHICLE_TYPES,
  ERROR_CODES,
  SERVICE_TYPES,
} from "../constants/websocketEvents.js";
import logger from "../utils/logger.js";
import PricingConfig from "../models/pricingModel.js";
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
  }

  /**
   * Handle recovery request from client
   */
  async handleRecoveryRequest(ws, message) {
    const { requestId, data } = message;

    try {
      // Validate request data
      if (!data || !data.pickupLocation || !data.serviceType) {
        throw new Error(
          "Missing required fields: pickupLocation and serviceType are required"
        );
      }

      // Create a Booking immediately and use its _id as the single ID for both WS and REST
      const creatorId =
        ws?.user?.id ||
        ws?.user?._id?.toString?.() ||
        data.customerId ||
        data.userId ||
        null;

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
        Math.min(
          50,
          Number(data?.searchRadius) ||
            (bookingDoc?.driverFilters?.searchRadius ?? 10)
        )
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

      // Simple fare to satisfy required fields (aligns with base 6km, 7.5/km)
      const baseFare = 50;
      const perKmRate = 7.5;
      const extraKm = Math.max(0, distanceKm - 6);
      const estimatedFare = Math.max(
        baseFare,
        baseFare + Math.ceil(extraKm * perKmRate)
      );

      const bookingDoc = new Booking({
        user: creatorId,
        serviceType: bookingServiceType,
        serviceCategory: bookingServiceCategory,
        pickupLocation: pickupGeo,
        dropoffLocation: dropoffGeo,
        distance: distanceKm,
        distanceInMeters,
        fare: estimatedFare,
        offeredFare: estimatedFare,
        vehicleDetails: data.vehicleDetails || {},
        status: "pending",
        createdAt: new Date(),
        fareDetails: {
          estimatedDistance: distanceKm,
          estimatedFare: estimatedFare,
          currency: "AED",
        },
      });
      await bookingDoc.save();
      const rid = bookingDoc._id.toString();

      // Create new recovery request
      const recoveryRequest = {
        requestId: rid,
        status: "pending",
        createdAt: new Date(),
        ...data,
        // Ensure we persist who created this request for authorization
        userId: creatorId,
        // Initialize additional fields
        driverId: bookingDoc.driver || null,
        driverLocation: null,
        statusHistory: [
          {
            status: "pending",
            timestamp: new Date(),
            message: "Recovery request created",
          },
        ],
        bookingId: rid,
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
        },
      };

      // Store the recovery request
      this.activeRecoveries.set(rid, recoveryRequest);

      // Notify client of successful request creation
      this.emitToClient(ws, {
        event: "recovery.request_created",
        requestId: rid,
        data: {
          requestId: rid,
          status: "pending",
          estimatedTime: "Calculating...",
          message: "Looking for available drivers",
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
        requestId: rid,
        data: {
          drivers: nearbyDrivers,
          count: nearbyDrivers.length,
          updatedAt: new Date(),
        },
      });

      // Notify each nearby driver about the new request (non-intrusive broadcast)
      for (const d of nearbyDrivers) {
        this.webSocketService.sendToUser(String(d.id), {
          event: "newRecoveryRequest",
          requestId: rid,
          data: {
            requestId: rid,
            pickupLocation: recoveryRequest.pickupLocation,
            estimatedFare:
              bookingDoc.fareDetails?.estimatedFare || bookingDoc.fare || 0,
          },
        });
      }
    } catch (error) {
      logger.error("Error handling recovery request:", error);
      this.emitToClient(ws, {
        event: "error",
        requestId,
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
    const { requestId, data } = message;

    try {
      if (!requestId || !data || !data.driverId || !data.bookingId) {
        throw new Error(
          "Missing required fields: requestId, driverId, and bookingId are required"
        );
      }

      const recoveryRequest = this.activeRecoveries.get(requestId);
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

      // Notify client
      this.emitToClient(ws, {
        event: "driver.assigned",
        requestId,
        data: {
          driverId: data.driverId,
          status: "assigned",
          assignedAt: recoveryRequest.assignedAt,
          estimatedArrival: "10-15 minutes", // This would be calculated in a real implementation
        },
      });

      logger.info(
        `Driver ${data.driverId} assigned to recovery request ${requestId}`
      );
    } catch (error) {
      logger.error("Error in handleDriverAssignment:", error);
      this.emitToClient(ws, {
        event: "error",
        requestId,
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
    const { requestId, data } = message;

    try {
      if (!requestId || !data || !data.driverId) {
        throw new Error(
          "Missing required fields: requestId and driverId are required"
        );
      }

      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      // Guard: booking can only be accepted once
      const bid = data?.bookingId || requestId;
      const booking = await Booking.findById(bid).select(
        "fareDetails user driver status"
      );
      if (!booking) {
        throw new Error("Booking not found");
      }
      if (["accepted", "in_progress", "completed", "cancelled"].includes(booking.status)) {
        throw new Error(`Booking already ${booking.status}, cannot accept again`);
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
      const negotiationState = booking.fareDetails?.negotiation?.state;
      const hasFinalFare =
        typeof booking.fareDetails?.finalFare === "number" &&
        booking.fareDetails.finalFare > 0;
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
        requestId,
        data: {
          status: "accepted",
          acceptedAt: recoveryRequest.acceptedAt,
          driverId: data.driverId,
        },
      });

      logger.info(
        `Recovery request ${requestId} accepted by driver ${data.driverId}`
      );
    } catch (error) {
      logger.error("Error in handleAcceptRequest:", error);
      this.emitToClient(ws, {
        event: "error",
        requestId,
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
    const { requestId, data } = message;

    try {
      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      recoveryRequest.status = "driver_arrived";
      recoveryRequest.arrivedAt = new Date();
      recoveryRequest.statusHistory.push({
        status: "driver_arrived",
        timestamp: new Date(),
        message: "Driver has arrived at the location",
      });

      // Notify client
      this.emitToClient(ws, {
        event: "driver.arrived",
        requestId,
        data: {
          status: "arrived",
          arrivedAt: recoveryRequest.arrivedAt,
        },
      });
    } catch (error) {
      logger.error("Error in handleDriverArrival:", error);
      this.emitToClient(ws, {
        event: "error",
        requestId,
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
    const { requestId, data } = message;

    try {
      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      const waitingTime = data.waitingTime || 0;
      const waitingCharge = this.calculateWaitingCharge(waitingTime);

      recoveryRequest.waitingTime = waitingTime;
      recoveryRequest.waitingCharge = waitingCharge;

      // Notify client
      this.emitToClient(ws, {
        event: "waiting.time.updated",
        requestId,
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
        requestId,
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
    const { requestId, data } = message;

    try {
      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
      }

      recoveryRequest.status = "in_progress";
      recoveryRequest.startedAt = new Date();
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
        requestId,
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
        requestId,
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
    const { requestId, data } = message;

    try {
      if (!requestId || !data || !data.driverId || !data.location) {
        throw new Error(
          "Missing required fields: requestId, driverId, and location are required"
        );
      }

      const recoveryRequest = this.activeRecoveries.get(requestId);
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
        requestId,
        data: {
          location: recoveryRequest.driverLocation,
          eta: recoveryRequest.eta,
          updatedAt: recoveryRequest.driverLocation.updatedAt,
        },
      });

      logger.debug(
        `Driver ${data.driverId} location updated for request ${requestId}`
      );
    } catch (error) {
      logger.error("Error in handleDriverLocationUpdate:", error);
      this.emitToClient(ws, {
        event: "error",
        requestId,
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
    const { requestId, data } = message || {};
    try {
      const recoveryRequest = this.activeRecoveries.get(requestId);
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
        requestId,
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
        requestId,
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
    const freeMinutes = recoveryRequest.waitingTimer.freeMinutes || 0;

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
    const { requestId, data } = message;

    try {
      if (!requestId || !data) {
        throw new Error("Missing required field: requestId");
      }

      const recoveryRequest = this.activeRecoveries.get(requestId);
      if (!recoveryRequest) {
        throw new Error("Recovery request not found");
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

      // Update recovery request status
      recoveryRequest.status = "cancelled";
      recoveryRequest.cancelledAt = new Date();
      recoveryRequest.cancellationReason = data.reason || "No reason provided";

      recoveryRequest.statusHistory.push({
        status: "cancelled",
        timestamp: new Date(),
        userId: requesterId || null,
        reason: recoveryRequest.cancellationReason,
        message: `Request cancelled by ${
          isAdmin ? "admin" : isAssignedDriver ? "driver" : "user"
        }`,
      });

      // If there's an assigned driver, notify them
      if (recoveryRequest.driverId) {
        this.webSocketService.sendToUser(recoveryRequest.driverId, {
          event: "recovery.cancelled",
          requestId,
          data: {
            status: "cancelled",
            cancelledAt: recoveryRequest.cancelledAt,
            reason: recoveryRequest.cancellationReason,
            cancelledBy: isAssignedDriver
              ? "driver"
              : isAdmin
              ? "admin"
              : "user",
          },
        });
      }

      // Save to database if needed
      // await this.updateRecoveryRequest(recoveryRequest);

      // Remove from active recoveries
      this.activeRecoveries.delete(requestId);

      // Notify client
      this.emitToClient(ws, {
        event: "recovery.cancelled",
        requestId,
        data: {
          status: "cancelled",
          cancelledAt: recoveryRequest.cancelledAt,
          reason: recoveryRequest.cancellationReason,
        },
      });

      // Cancellation warnings / red flag (simple threshold in last 30 days)
      try {
        const threshold = Number(process.env.CANCEL_WARNING_THRESHOLD || 2);
        const redThreshold = Number(process.env.CANCEL_RED_FLAG_THRESHOLD || 4);
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const userId = recoveryRequest.userId;
        if (userId) {
          const count = await Booking.countDocuments({
            user: userId,
            status: "cancelled",
            cancelledAt: { $gte: since },
          });
          if (count >= redThreshold) {
            this.emitToClient(ws, {
              event: "cancellation.redFlag",
              requestId,
              data: { count, windowDays: 30 },
            });
          } else if (count >= threshold) {
            this.emitToClient(ws, {
              event: "cancellation.warning",
              requestId,
              data: { count, windowDays: 30 },
            });
          }
        }
      } catch (warnErr) {
        logger.warn(
          "Cancellation warning check failed:",
          warnErr?.message || warnErr
        );
      }

      logger.info(
        `Recovery request ${requestId} cancelled by user ${data.userId}`
      );
    } catch (error) {
      logger.error("Error in handleCancelRequest:", error);
      this.emitToClient(ws, {
        event: "error",
        requestId,
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
    const { requestId, data } = message;

    try {
      if (!requestId) {
        throw new Error("Missing required field: requestId");
      }

      const recoveryRequest = this.activeRecoveries.get(requestId);
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
        }
      );

      // Send available drivers to the client
      this.emitToClient(ws, {
        event: "carRecovery:driversAvailable",
        requestId,
        data: {
          drivers: availableDrivers,
          count: availableDrivers.length,
          updatedAt: new Date(),
        },
      });

      logger.info(
        `Sent ${availableDrivers.length} available drivers for request ${requestId}`
      );
    } catch (error) {
      logger.error("Error in handleGetDrivers:", error);
      this.emitToClient(ws, {
        event: "error",
        requestId,
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
    const { requestId, data } = message;

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
      } = data;

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
        requestId: requestId || "estimate-" + Date.now(),
        data: response,
      });

      logger.info(
        `Fare estimate generated for ${vehicleType} (${distance.toFixed(2)} km)`
      );
    } catch (error) {
      logger.error("Error in handleFareEstimate:", error);
      this.emitToClient(ws, {
        event: "error",
        requestId,
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
    const { requestId, data } = message || {};
    try {
      const recoveryRequest = this.activeRecoveries.get(requestId);
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
      const persistId = data?.bookingId || requestId;
      if (persistId) {
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

      const billing = {
        base: baseTotal,
        surge: { multiplier: surgeMultiplier, amount: surged - baseTotal },
        vat: { percent: vatPercent, amount: vatAmount },
        total: totalWithVat,
        currency: "AED",
      };

      this.emitToClient(ws, {
        event: "service.completed",
        requestId,
        data: {
          status: "completed",
          completedAt: recoveryRequest.completedAt,
          billing,
        },
      });
    } catch (error) {
      logger.error("Error in handleServiceComplete:", error);
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "SERVICE_COMPLETE_ERROR", message: error.message },
      });
    }
  }

  /**
   * WS Chat: send message and notify the other party
   */
  async handleRecoveryMessageSend(ws, message) {
    const { requestId, data } = message || {};
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
      const bid = data?.bookingId || requestId; // default to requestId

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
          requestId,
          data: { bookingId: bid, message: newMsg },
        });
      }

      this.emitToClient(ws, {
        event: "recovery.message.sent",
        requestId,
        data: { bookingId: bid, message: newMsg },
      });
    } catch (error) {
      logger.error("Error in handleRecoveryMessageSend:", error);
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "CHAT_SEND_ERROR", message: error.message },
      });
    }
  }

  /**
   * WS Chat: get messages
   */
  async handleRecoveryMessagesGet(ws, message) {
    const { requestId, data } = message || {};
    try {
      const bid = data?.bookingId || requestId;
      const booking = await Booking.findById(bid).select(
        "messages user driver"
      );
      if (!booking) throw new Error("Booking not found");
      this.emitToClient(ws, {
        event: "recovery.messages",
        requestId,
        data: { bookingId: bid, messages: booking.messages || [] },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "CHAT_GET_ERROR", message: error.message },
      });
    }
  }

  async handleRecoveryMessageRead(ws, message) {
    const { requestId, data } = message || {};
    try {
      // Mark last message as read (lightweight)
      const bid = data?.bookingId || requestId;
      const booking = await Booking.findById(bid).select("messages");
      if (booking && booking.messages?.length) {
        booking.messages[booking.messages.length - 1].readAt = new Date();
        await booking.save();
      }
      this.emitToClient(ws, {
        event: "recovery.message.read.ack",
        requestId,
        data: { bookingId: bid },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "CHAT_READ_ERROR", message: error.message },
      });
    }
  }

  async handleRecoveryTyping(ws, message) {
    const { requestId, data } = message || {};
    // Relay typing to the other party without persistence
    try {
      const bid = data?.bookingId || requestId;
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
          requestId,
          data: { bookingId: bid, typing: true },
        });
      }
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "CHAT_TYPING_ERROR", message: error.message },
      });
    }
  }

  /** Discovery filters **/
  async handleDiscoveryFiltersSet(ws, message) {
    const { requestId, data } = message || {};
    try {
      const rec = this.activeRecoveries.get(requestId);
      if (!rec) throw new Error("Recovery request not found");
      // Enforce: Pink captain not eligible for car recovery (per product rule)
      if (
        (data?.pinkCaptainOnly || data?.preferences?.pinkCaptainOnly) &&
        (rec.serviceType?.toLowerCase?.() === "towing" ||
          rec.serviceType?.toLowerCase?.().includes("recovery") ||
          rec.bookingId)
      ) {
        // Our booking-backed flow marks serviceType as 'car recovery' in DB
        const booking = await Booking.findById(rec.bookingId).select(
          "serviceType"
        );
        const isCarRecovery = booking?.serviceType === "car recovery";
        if (isCarRecovery) {
          throw new Error(
            "Pink captains are only available for Bike and Cab services"
          );
        }
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
      };
      this.activeRecoveries.set(requestId, rec);
      this.emitToClient(ws, {
        event: "discovery.filters.updated",
        requestId,
        data: rec.discoveryFilters,
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "FILTERS_SET_ERROR", message: error.message },
      });
    }
  }

  /** Favourites and direct dispatch **/
  async handleFavouritesAdd(ws, message) {
    const { requestId, data } = message || {};
    try {
      const userId = ws?.user?.id || ws?.user?._id;
      if (!data?.driverId) throw new Error("driverId is required");
      await User.findByIdAndUpdate(userId, {
        $addToSet: { favoriteDrivers: data.driverId },
      });
      this.emitToClient(ws, {
        event: "favourites.added",
        requestId,
        data: { driverId: data.driverId },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "FAV_ADD_ERROR", message: error.message },
      });
    }
  }

  async handleFavouritesList(ws, message) {
    const { requestId } = message || {};
    try {
      const user = await User.findById(ws?.user?.id || ws?.user?._id).populate(
        "favoriteDrivers",
        "firstName lastName phoneNumber currentLocation"
      );
      this.emitToClient(ws, {
        event: "favourites.list",
        requestId,
        data: { drivers: user?.favoriteDrivers || [] },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "FAV_LIST_ERROR", message: error.message },
      });
    }
  }

  async handleFavouritesRemove(ws, message) {
    const { requestId, data } = message || {};
    try {
      const userId = ws?.user?.id || ws?.user?._id;
      if (!data?.driverId) throw new Error("driverId is required");
      await User.findByIdAndUpdate(userId, {
        $pull: { favoriteDrivers: data.driverId },
      });
      this.emitToClient(ws, {
        event: "favourites.removed",
        requestId,
        data: { driverId: data.driverId },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "FAV_REMOVE_ERROR", message: error.message },
      });
    }
  }

  async handleBookingToFavourite(ws, message) {
    const { requestId, data } = message || {};
    try {
      const { driverId } = data || {};
      if (!driverId) throw new Error("driverId is required");
      // Notify target favourite driver
      this.webSocketService.sendToUser(String(driverId), {
        event: "newRecoveryRequest",
        requestId,
        data: { requestId, direct: true },
      });
      this.emitToClient(ws, {
        event: "booking.toFavourite.ack",
        requestId,
        data: { driverId },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "BOOK_TO_FAV_ERROR", message: error.message },
      });
    }
  }

  /** Multi-stop rules (lightweight) **/
  async handleMultiStopSet(ws, message) {
    const { requestId, data } = message || {};
    try {
      const rec = this.activeRecoveries.get(requestId);
      if (!rec) throw new Error("Recovery request not found");
      rec.multiStop = {
        enabled: !!data?.enabled,
        stops: Array.isArray(data?.stops) ? data.stops : [],
      };
      this.activeRecoveries.set(requestId, rec);
      this.emitToClient(ws, {
        event: "multiStop.updated",
        requestId,
        data: rec.multiStop,
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "MULTISTOP_SET_ERROR", message: error.message },
      });
    }
  }

  async handleMultiStopRules(ws, message) {
    const { requestId } = message || {};
    // For now return a static rule that some drivers may disable multi-stop
    this.emitToClient(ws, {
      event: "multiStop.rules.response",
      requestId,
      data: { allowed: true, driverOptOut: true },
    });
  }

  /** Overtime / waiting consent **/
  async handleWaitingConsent(ws, message) {
    const { requestId, data } = message || {};
    try {
      const rec = this.activeRecoveries.get(requestId);
      if (!rec) throw new Error("Recovery request not found");
      rec.waitingConsent = { action: data?.action, at: new Date() };
      this.activeRecoveries.set(requestId, rec);
      this.emitToClient(ws, {
        event: "service.waiting.consent.ack",
        requestId,
        data: rec.waitingConsent,
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
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
        (typeof lat !== 'number' || typeof lng !== 'number') &&
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
        query["driverSettings.ridePreferences.pinkCaptainMode"] = true;
        // If gender filter helps further restrict pink captains, keep it optional
        query["gender"] = "Female";
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

      const drivers = await User.find(query)
        .limit(10)
        .select(
          "_id firstName lastName phoneNumber currentLocation driverStatus"
        );

      // Map to the shape expected by findAndAssignDriver
      return drivers.map((d) => ({
        id: d._id.toString(),
        name: `${d.firstName ?? ""}`.trim(),
        phone: d.phoneNumber,
        rating: 5,
        status: d.driverStatus,
        location: d.currentLocation
          ? {
              coordinates: {
                lat: d.currentLocation.coordinates?.[1],
                lng: d.currentLocation.coordinates?.[0],
              },
            }
          : null,
      }));
    } catch (e) {
      logger.error("Error querying available drivers:", e);
      return [];
    }
  }

  // ==== Helper methods for fare estimation (distance + pricing) ====
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

  _getRecoveryPricing({
    serviceType = "towing",
    vehicleType = "car",
    distance = 0,
  }) {
    const typeKey =
      serviceType && typeof serviceType === "string" ? serviceType : "towing";
    const baseCfg = SERVICE_CONFIG?.[typeKey] || {
      basePrice: 50,
      perKmPrice: 7.5,
      minDistance: 6,
      minPrice: 50,
    };

    const baseFare = baseCfg.minPrice ?? baseCfg.basePrice ?? 50;
    const distanceRate = baseCfg.perKmPrice ?? 7.5;
    const averageSpeedKmh = 30; // approximate
    const timeEstimate = Math.ceil((distance / averageSpeedKmh) * 60); // minutes
    const timeRate = 0; // no per-minute cost in fallback

    return { baseFare, distanceRate, timeEstimate, timeRate };
  }

  /** Presence: driver enroute */
  async handlePresenceEnroute(ws, message) {
    const { requestId, data } = message || {};
    try {
      const rec = this.activeRecoveries.get(requestId);
      if (!rec) throw new Error("Recovery request not found");
      rec.status = "enroute";
      rec.statusHistory.push({
        status: "enroute",
        timestamp: new Date(),
        driverId: data?.driverId,
      });
      this.activeRecoveries.set(requestId, rec);
      this.emitToClient(ws, {
        event: "presence.enroute",
        requestId,
        data: { status: "enroute", timestamp: new Date() },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "PRESENCE_ENROUTE_ERROR", message: error.message },
      });
    }
  }

  async handlePresenceStatus(ws, message) {
    const { requestId, data } = message || {};
    try {
      const rec = this.activeRecoveries.get(requestId);
      if (!rec) throw new Error("Recovery request not found");
      const status = data?.status || "update";
      rec.statusHistory.push({
        status,
        timestamp: new Date(),
        note: data?.note,
        driverId: data?.driverId,
      });
      this.activeRecoveries.set(requestId, rec);
      this.emitToClient(ws, {
        event: "presence.status",
        requestId,
        data: { status, note: data?.note, timestamp: new Date() },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "PRESENCE_STATUS_ERROR", message: error.message },
      });
    }
  }

  async handleDriverCancel(ws, message) {
    const { requestId, data } = message || {};
    try {
      const rec = this.activeRecoveries.get(requestId);
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
      this.activeRecoveries.set(requestId, rec);

      // Re-broadcast to nearby qualified drivers
      const nearbyDrivers = await this.getAvailableDrivers(
        rec.pickupLocation,
        rec.searchRadiusKm || 10,
        {
          ...(rec.discoveryFilters || {}),
          multiStopEnabled: !!rec?.multiStop?.enabled,
        }
      );
      for (const d of nearbyDrivers) {
        this.webSocketService.sendToUser(String(d.id), {
          event: "newRecoveryRequest",
          requestId,
          data: { requestId, pickupLocation: rec.pickupLocation },
        });
      }
      this.emitToClient(ws, {
        event: "driver.autoTransfer.initiated",
        requestId,
        data: { candidates: nearbyDrivers.length },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "DRIVER_CANCEL_ERROR", message: error.message },
      });
    }
  }

  // Removed: fraud.check via WebSocket (migrated to REST)

  /** Saved Locations */
  async handleSavedLocationAdd(ws, message) {
    const { requestId, data } = message || {};
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
        requestId,
        data: { name: data.name },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "SAVED_LOC_ADD_ERROR", message: error.message },
      });
    }
  }
  async handleSavedLocationList(ws, message) {
    const { requestId } = message || {};
    try {
      const user = await User.findById(ws?.user?.id || ws?.user?._id).select(
        "savedLocations"
      );
      this.emitToClient(ws, {
        event: "savedLocations.list",
        requestId,
        data: { locations: user?.savedLocations || [] },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "SAVED_LOC_LIST_ERROR", message: error.message },
      });
    }
  }
  async handleSavedLocationRemove(ws, message) {
    const { requestId, data } = message || {};
    try {
      const userId = ws?.user?.id || ws?.user?._id;
      if (!data?.name) throw new Error("name is required");
      await User.findByIdAndUpdate(userId, {
        $pull: { savedLocations: { name: data.name } },
      });
      this.emitToClient(ws, {
        event: "savedLocations.removed",
        requestId,
        data: { name: data.name },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "SAVED_LOC_REMOVE_ERROR", message: error.message },
      });
    }
  }

  /** Ratings, Tips, Billing */
  async handleTipAdd(ws, message) {
    const { requestId, data } = message || {};
    try {
      const amount = Number(data?.amount || 0);
      if (amount <= 0) throw new Error("Invalid tip amount");
      await Booking.findByIdAndUpdate(requestId, {
        $set: { "paymentDetails.tip": amount },
      });
      this.emitToClient(ws, {
        event: "tip.added",
        requestId,
        data: { amount },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "TIP_ADD_ERROR", message: error.message },
      });
    }
  }
  async handleBillingGet(ws, message) {
    const { requestId } = message || {};
    try {
      const booking = await Booking.findById(requestId).select(
        "receipt fareDetails paymentDetails completedAt"
      );
      if (!booking) throw new Error("Booking not found");
      this.emitToClient(ws, {
        event: "billing.details",
        requestId,
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
        requestId,
        error: { code: "BILLING_GET_ERROR", message: error.message },
      });
    }
  }

  /** Chat file upload (base64 -> server URL) */
  async handleChatUpload(ws, message) {
    const { requestId, data } = message || {};
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
        requestId,
        data: { url: fileUrl, mime },
      });
    } catch (error) {
      this.emitToClient(ws, {
        event: "error",
        requestId,
        error: { code: "CHAT_UPLOAD_ERROR", message: error.message },
      });
    }
  }
}

export default RecoveryHandler;
