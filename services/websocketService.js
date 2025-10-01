import { WebSocketServer } from "ws";
import { verifyToken } from "../utils/jwt.js";
import { WS_EVENTS, ERROR_CODES } from "../constants/websocketEvents.js";
import logger from "../utils/logger.js";
import RecoveryHandler from "../handlers/recoveryHandler.js";
import User from "../models/userModel.js"; // Import User model

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // Map<userId, Set<WebSocket>>
    this.handlers = new Map(); // Map<eventType, Array<handler>>
    this.rooms = new Map(); // Map<roomName, Set<WebSocket>>

    // Bind core APIs BEFORE constructing handlers so they can call .on()
    this.initialize = this.initialize.bind(this);
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);
    this.emit = this.emit.bind(this);
    this.joinRoom = this.joinRoom.bind(this);
    this.leaveRoom = this.leaveRoom.bind(this);
    this.sendToRoom = this.sendToRoom.bind(this);
    this.sendToRoomUsers = this.sendToRoomUsers.bind(this);
    this._serviceRoomName = this._serviceRoomName.bind(this);
    this.joinServiceRooms = this.joinServiceRooms.bind(this);

    // Now construct RecoveryHandler (it will register handlers using .on())
    this.recoveryHandler = new RecoveryHandler(this);

    // Initialize event handlers
    this.initializeEventHandlers();
  }

  /**
   * Initialize event handlers
   */
  initializeEventHandlers() {
    // Register recovery handler events
    this.recoveryHandler.initializeEventHandlers();

    // Register car recovery specific events
    this.on("carRecovery:getDrivers", async (ws, message) => {
      await this.recoveryHandler.handleGetDrivers(ws, message);
    });

    // Register driver arrival event
    this.on("driver.arrival", async (ws, message) => {
      await this.recoveryHandler.handleDriverArrival(ws, message);
    });

    // Register waiting time updates
    this.on("waiting.time.update", async (ws, message) => {
      await this.recoveryHandler.handleWaitingTimeUpdate(ws, message);
    });

    // Register service start event
    this.on("service.start", async (ws, message) => {
      await this.recoveryHandler.handleServiceStart(ws, message);
    });

    // Prevent 'Unhandled event: authenticated' if clients echo server's AUTHENTICATED message
    this.on("authenticated", async () => {
      /* no-op to avoid unhandled warnings */
    });

    // Unified role/service join API (client can call after auth)
    this.on("auth.join", async (ws, { data }) => {
      try {
        // Validate role from DB to prevent spoofing
        const user = await User.findById(ws.userId).select("role").lean();
        if (!user)
          return this.sendError(ws, { code: 404, message: "User not found" });
        const role = user.role || "customer";
        // Leave previous role room if needed
        const prevRole = ws.user?.role || "customer";
        if (prevRole !== role) this.leaveRoom(ws, `role:${prevRole}`);
        // Join role room and user room
        this.joinRoom(ws, `role:${role}`);
        this.joinRoom(ws, `user:${ws.userId}`);
        ws.user.role = role;

        // Optionally join service/subservice rooms
        // Expected data.services: [{ serviceType: 'car recovery'|'car cab'|'bike'|..., subService: 'towing'|'winching'|... }]
        if (Array.isArray(data?.services)) {
          this.joinServiceRooms(ws, data.services);
        }

        // Optional: persist initial location if provided
        const loc = data?.location || data?.coordinates;
        const lat = loc?.lat ?? loc?.latitude;
        const lng = loc?.lng ?? loc?.longitude;
        if (typeof lat === "number" && typeof lng === "number") {
          const update = {
            currentLocation: { type: "Point", coordinates: [lng, lat] },
            lastActiveAt: new Date(),
          };
          if (role === "driver") {
            update.isActive = true;
            update.driverStatus = "online";
          }
          try {
            await User.findByIdAndUpdate(
              ws.userId,
              { $set: update },
              { new: false }
            );
          } catch (e) {
            logger.warn("auth.join location persist failed:", e?.message);
          }
        }

        this.send(ws, {
          event: "auth.joined",
          data: { role, rooms: Array.from(ws.rooms || []) },
        });
      } catch (e) {
        logger.error("auth.join error:", e);
        this.sendError(ws, { code: 500, message: "Failed to join rooms" });
      }
    });

    // Generic user location setter (no booking required)
    this.on("location.set", async (ws, { data }) => {
      try {
        const loc = data?.location || data?.coordinates;
        const lat = loc?.lat ?? loc?.latitude;
        const lng = loc?.lng ?? loc?.longitude;
        if (typeof lat !== "number" || typeof lng !== "number") {
          return this.sendError(ws, {
            code: 400,
            message: "location {lat,lng} is required",
          });
        }
        const update = {
          currentLocation: { type: "Point", coordinates: [lng, lat] },
          lastActiveAt: new Date(),
        };
        // If driver, optionally mark active online
        const dbUser = await User.findById(ws.userId).select("role").lean();
        if ((dbUser?.role || "customer") === "driver") {
          update.isActive = true;
          update.driverStatus = "online";
        }
        await User.findByIdAndUpdate(
          ws.userId,
          { $set: update },
          { new: false }
        );
        this.send(ws, { event: "location.updated", data: { lat, lng } });
      } catch (e) {
        logger.error("location.set error:", e);
        this.sendError(ws, { code: 500, message: "Failed to set location" });
      }
    });

    // Explicit role/service join API (client can call after auth)
    this.on("room.join", async (ws, { data }) => {
      try {
        const room = data?.room;
        if (!room || typeof room !== "string") {
          return this.sendError(ws, { code: 400, message: "room is required" });
        }

        // Allow only: role:admin|role:customer|role:driver (must match DB role), or user:<selfId>
        const isRoleRoom = room.startsWith("role:");
        const isUserRoom = room.startsWith("user:");

        let dbRole = ws.user?.role || null;
        if (!dbRole) {
          const user = await User.findById(ws.userId).select("role").lean();
          if (!user)
            return this.sendError(ws, { code: 404, message: "User not found" });
          dbRole = user.role || "customer";
        }

        if (isRoleRoom) {
          const allowed = new Set([
            "role:admin",
            "role:customer",
            "role:driver",
          ]);
          if (!allowed.has(room)) {
            return this.sendError(ws, {
              code: 403,
              message:
                "Invalid role room. Allowed: role:admin|role:customer|role:driver",
            });
          }
          const expected = `role:${dbRole}`;
          if (room !== expected) {
            return this.sendError(ws, {
              code: 403,
              message: `Role mismatch: cannot join ${room}`,
            });
          }
          this.leaveRoom(ws, `role:admin`);
          this.leaveRoom(ws, `role:customer`);
          this.leaveRoom(ws, `role:driver`);
          this.joinRoom(ws, room);
        } else if (isUserRoom) {
          const parts = room.split(":");
          const targetId = parts[1] || "";
          if (!targetId || String(targetId) !== String(ws.userId)) {
            return this.sendError(ws, {
              code: 403,
              message: "Cannot join another user's room",
            });
          }
          this.joinRoom(ws, room);
        } else {
          return this.sendError(ws, {
            code: 400,
            message:
              "Invalid room. Only role:admin|role:customer|role:driver or user:<selfId> allowed",
          });
        }

        const idPayload =
          dbRole === "driver"
            ? { driverId: String(ws.userId) }
            : { userId: String(ws.userId) };
        logger.info(`room.join -> user ${ws.userId} joined room: ${room}`);
        this.send(ws, {
          event: "room.joined",
          data: { room, role: dbRole, ...idPayload },
        });
      } catch (e) {
        logger.error("room.join error:", e);
        this.sendError(ws, { code: 500, message: "Failed to join room" });
      }
    });
    this.on("room.leave", async (ws, { data }) => {
      try {
        const room = data?.room;
        if (!room || typeof room !== "string") {
          return this.sendError(ws, { code: 400, message: "room is required" });
        }
        // Only allow leaving rooms the socket is actually in, and only the validated set
        const isRoleRoom = room.startsWith("role:");
        const isUserRoom = room.startsWith("user:");
        let dbRole = ws.user?.role || null;
        if (!dbRole) {
          const user = await User.findById(ws.userId).select("role").lean();
          if (!user)
            return this.sendError(ws, { code: 404, message: "User not found" });
          dbRole = user.role || "customer";
        }
        if (isRoleRoom) {
          const allowed = new Set([
            "role:admin",
            "role:customer",
            "role:driver",
          ]);
          if (!allowed.has(room)) {
            return this.sendError(ws, {
              code: 403,
              message: "Invalid role room",
            });
          }
          // Can leave only your current role room
          const expected = `role:${dbRole}`;
          if (room !== expected) {
            return this.sendError(ws, {
              code: 403,
              message: `Cannot leave ${room} (not your active role room)`,
            });
          }
        } else if (isUserRoom) {
          const parts = room.split(":");
          const targetId = parts[1] || "";
          if (!targetId || String(targetId) !== String(ws.userId)) {
            return this.sendError(ws, {
              code: 403,
              message: "Cannot leave another user's room",
            });
          }
        } else {
          return this.sendError(ws, {
            code: 400,
            message:
              "Invalid room. Only role:admin|role:customer|role:driver or user:<selfId> allowed",
          });
        }
        if (!ws.rooms?.has(room)) {
          return this.sendError(ws, {
            code: 404,
            message: "You are not a member of this room",
          });
        }
        this.leaveRoom(ws, room);
        const idPayload =
          dbRole === "driver"
            ? { driverId: String(ws.userId) }
            : { userId: String(ws.userId) };
        logger.info(`room.leave -> user ${ws.userId} left room: ${room}`);
        this.send(ws, {
          event: "room.left",
          data: { room, role: dbRole, ...idPayload },
        });
      } catch (e) {
        logger.error("room.leave error:", e);
        this.sendError(ws, { code: 500, message: "Failed to leave room" });
      }
    });

    // Explicit customer-only room join
    this.on("auth.join.customer", async (ws) => {
      try {
        const prevRole = ws.user?.role || "customer";
        const oldRoom = `role:${prevRole}`;
        const newRoom = "role:customer";
        if (prevRole !== "customer") {
          this.leaveRoom(ws, oldRoom);
        }
        this.joinRoom(ws, newRoom);
        this.joinRoom(ws, `user:${ws.userId}`);
        ws.user.role = "customer";
        logger.info(
          `auth.join.customer -> user ${ws.userId} joined ${newRoom}`
        );
        this.send(ws, {
          event: "auth.joined",
          data: { role: "customer", rooms: Array.from(ws.rooms || []) },
        });
      } catch (e) {
        logger.error("auth.join.customer error:", e);
        this.sendError(ws, {
          code: 500,
          message: "Failed to join customer room",
        });
      }
    });

    // Explicit driver-only room join (validates DB role)
    this.on("auth.join.driver", async (ws) => {
      try {
        const user = await User.findById(ws.userId).select("role").lean();
        if (!user)
          return this.sendError(ws, { code: 404, message: "User not found" });
        if ((user.role || "customer") !== "driver") {
          return this.sendError(ws, {
            code: 403,
            message: "User is not a driver (KYC/role not approved)",
          });
        }
        const prevRole = ws.user?.role || "customer";
        const oldRoom = `role:${prevRole}`;
        const newRoom = "role:driver";
        if (prevRole !== "driver") {
          this.leaveRoom(ws, oldRoom);
        }
        this.joinRoom(ws, newRoom);
        this.joinRoom(ws, `user:${ws.userId}`);
        ws.user.role = "driver";
        logger.info(`auth.join.driver -> user ${ws.userId} joined ${newRoom}`);
        this.send(ws, {
          event: "auth.joined",
          data: { role: "driver", rooms: Array.from(ws.rooms || []) },
        });
      } catch (e) {
        logger.error("auth.join.driver error:", e);
        this.sendError(ws, {
          code: 500,
          message: "Failed to join driver room",
        });
      }
    });
  }

  // Register an event handler
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  // Remove an event handler
  off(event, handler) {
    if (this.handlers.has(event)) {
      this.handlers.get(event).delete(handler);
      if (this.handlers.get(event).size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  // Emit an event to all registered handlers
  async emit(event, ws, data, callback) {
    const handlers = this.handlers.get(event) || new Set();
    if (handlers.size === 0 && !String(event).startsWith("system:")) {
      logger.warn(`No handlers registered for event: ${event}`);
      if (callback) {
        callback({
          error: {
            code: ERROR_CODES.INVALID_REQUEST,
            message: `Unhandled event: ${event}`,
          },
        });
      }
      return;
    }
    await Promise.all(
      Array.from(handlers).map((h) => {
        try {
          return Promise.resolve(h(ws, data, callback));
        } catch (e) {
          logger.error(`Error in ${event} handler:`, e);
          return Promise.reject(e);
        }
      })
    );
  }

  // Send JSON to a socket
  send(ws, message) {
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(message));
      } catch (e) {
        logger.error("Error sending WebSocket message:", e);
      }
    }
  }

  // Send standardized error
  sendError(ws, { code, message, details }) {
    this.send(ws, {
      event: "error",
      error: { code, message, ...(details && { details }) },
      timestamp: new Date().toISOString(),
    });
  }

  // Broadcast to all clients (optionally filtered)
  broadcast(message, filter) {
    if (!this.wss) return;
    this.wss.clients.forEach((client) => {
      if ((!filter || filter(client)) && client.readyState === 1) {
        this.send(client, message);
      }
    });
  }

  // Target helpers
  sendToUser(userId, message) {
    const userSockets = this.clients.get(String(userId));
    if (userSockets) {
      userSockets.forEach((ws) => {
        if (ws.readyState === 1) this.send(ws, message);
      });
    }
  }
  sendToUsers(userIds, message) {
    (userIds || []).forEach((id) => this.sendToUser(id, message));
  }
  sendToRole(role, message) {
    if (!this.wss) return;
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1 && client.user?.role === role)
        this.send(client, message);
    });
  }
  getConnectedUsers() {
    return Array.from(this.clients.keys());
  }
  isUserConnected(userId) {
    return (
      this.clients.has(String(userId)) &&
      this.clients.get(String(userId)).size > 0
    );
  }

  // Rooms
  joinRoom(ws, roomName) {
    if (!this.rooms.has(roomName)) this.rooms.set(roomName, new Set());
    const room = this.rooms.get(roomName);
    room.add(ws);
    ws.rooms?.add(roomName);
  }
  leaveRoom(ws, roomName) {
    const room = this.rooms.get(roomName);
    if (!room) return;
    room.delete(ws);
    ws.rooms?.delete(roomName);
    if (room.size === 0) this.rooms.delete(roomName);
  }
  sendToRoom(roomName, message) {
    const room = this.rooms.get(roomName);
    if (!room) return;
    room.forEach((client) => {
      if (client.readyState === 1) this.send(client, message);
    });
  }
  sendToRoomUsers(roomName, userIds = [], message) {
    const room = this.rooms.get(roomName);
    if (!room || !Array.isArray(userIds) || userIds.length === 0) return;
    const allowed = new Set(userIds.map(String));
    room.forEach((client) => {
      if (client.readyState === 1 && allowed.has(String(client.userId))) {
        this.send(client, message);
      }
    });
  }
  _joinDefaultRooms(ws) {
    const rooms = [];
    const userRoom = `user:${ws.userId}`;
    // Re-validate role from DB to avoid defaulting to customer mistakenly
    rooms.push(userRoom);
    this.joinRoom(ws, userRoom);
    return rooms;
  }

  // Build normalized room name for a service/subservice
  _serviceRoomName(serviceType, subService) {
    const norm = (s) =>
      String(s || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
    const st = norm(serviceType);
    const sub = norm(subService);
    if (!st) return null;
    return sub ? `svc:${st}:${sub}` : `svc:${st}`;
  }

  // Join service/subservice rooms for a socket
  joinServiceRooms(ws, services = []) {
    for (const s of services) {
      const rn = this._serviceRoomName(s?.serviceType, s?.subService);
      if (rn) this.joinRoom(ws, rn);
    }
  }

  // Initialize server and handle auth/upgrade
  initialize(server, { path = "/ws", jwtSecret, pingInterval = 30000 } = {}) {
    if (!jwtSecret)
      throw new Error("JWT secret is required for WebSocket authentication");
    this.jwtSecret = jwtSecret;
    this.wss = new WebSocketServer({ noServer: true });

    // HTTP upgrade -> WS
    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname !== path) {
        socket.destroy();
        return;
      }
      const token =
        url.searchParams.get("token") ||
        (request.headers.authorization?.startsWith("Bearer ")
          ? request.headers.authorization.split(" ")[1]
          : null);
      if (!token)
        return this.handleUpgradeError(
          socket,
          4001,
          "No authentication token provided"
        );
      const { valid, decoded, error } = verifyToken(token, this.jwtSecret);
      if (!valid || !decoded)
        return this.handleUpgradeError(
          socket,
          4003,
          error || "Invalid or expired token"
        );
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit("connection", ws, request, decoded);
      });
    });

    // New connection
    this.wss.on("connection", (ws, req, user) => {
      if (!user || !user.id) {
        logger.error("Invalid user object in WebSocket connection:", user);
        ws.close(4001, "Invalid user authentication");
        return;
      }
      const userId = String(user.id);
      if (!this.clients.has(userId)) this.clients.set(userId, new Set());
      this.clients.get(userId).add(ws);
      ws.user = user;
      ws.userId = userId;
      ws.isAlive = true;
      ws.connectedAt = new Date();
      ws.rooms = new Set();
      const role = ws.user?.role || "customer";
      const roleLabel = role === "driver" ? "Driver" : "Customer";
      logger.info(`${roleLabel} connected: ${userId}`);

      const pingIntervalId = setInterval(() => {
        if (ws.isAlive === false) {
          logger.warn(`Terminating inactive WebSocket connection: ${userId}`);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      }, pingInterval);

      ws.on("message", async (message) => {
        try {
          // Normalize to string and trim
          let raw =
            typeof message === "string" ? message : message?.toString?.() || "";
          raw = raw.trim();
          // Empty or non-JSON -> error
          if (!raw || (!raw.startsWith("{") && !raw.startsWith("["))) {
            return this.sendError(ws, {
              code: ERROR_CODES.INVALID_REQUEST,
              message: "Invalid or empty message payload",
              details: { hint: "Send a JSON object with { event, data }" },
            });
          }

          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            return this.sendError(ws, {
              code: ERROR_CODES.INVALID_REQUEST,
              message: e?.message || "Invalid JSON payload",
            });
          }

          const { event, data } = parsed || {};
          if (!event || typeof event !== "string") {
            return this.sendError(ws, {
              code: ERROR_CODES.INVALID_REQUEST,
              message: "Missing or invalid 'event' field",
            });
          }

          logger.info(`WS event received: ${event}`);
          const handlers = this.handlers.get(event) || new Set();
          if (
            handlers.size === 0 &&
            event !== "recovery.request" &&
            event !== "driver.assignment" &&
            event !== "accept_request"
          ) {
            logger.warn(`No handlers registered for event: ${event}`);
            return this.sendError(ws, {
              code: ERROR_CODES.UNHANDLED_EVENT,
              message: `Unhandled event: ${event}`,
            });
          }

          // Dispatch to handlers (pass only data)
          for (const handler of Array.from(handlers)) {
            try {
              await handler(ws, { data });
            } catch (err) {
              logger.error(`WS handler error for ${event}: ${err?.message}`);
              this.sendError(ws, {
                code: err?.code || ERROR_CODES.INVALID_REQUEST,
                message: err?.message || "Handler error",
              });
            }
          }
        } catch (err) {
          // Final safety net
          logger.error(`WS message fatal error: ${err?.message}`);
          this.sendError(ws, {
            code: ERROR_CODES.INVALID_REQUEST,
            message: err?.message || "Invalid message",
          });
        }
      });

      ws.on("close", () => {
        clearInterval(pingIntervalId);
        const set = this.clients.get(userId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) this.clients.delete(userId);
        }
        if (ws.rooms && ws.rooms.size > 0) {
          for (const room of Array.from(ws.rooms)) this.leaveRoom(ws, room);
        }
        logger.info(`WebSocket client disconnected: ${userId}`);
      });

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      this.send(ws, {
        event: WS_EVENTS.AUTHENTICATED,
        data:
          (ws.user?.role || "customer") === "driver"
            ? { driverId: userId }
            : { userId },
      });
      // After AUTH, resolve and join proper role room from DB, not just token
      (async () => {
        try {
          const dbUser = await User.findById(userId)
            .select("role services vehicleDetails driverSettings")
            .lean();
          const dbRole = dbUser?.role || "customer";
          this.joinRoom(ws, `role:${dbRole}`);
          ws.user.role = dbRole;
          // Optionally auto-join service rooms for drivers based on their capabilities
          if (dbRole === "driver") {
            // If you store explicit services list on user, map them; else join broad rooms
            const services = [];
            // Example: join car recovery broad room by default
            // You can enrich this with actual driver service registry
            services.push({ serviceType: "car recovery" });
            this.joinServiceRooms(ws, services);
          }
          logger.info(`Joined rooms: ${Array.from(ws.rooms || []).join(", ")}`);
          // Emit authenticated with dynamic role from DB and appropriate id field
          this.send(ws, {
            event: WS_EVENTS.AUTHENTICATED,
            data:
              dbRole === "driver"
                ? { driverId: userId, role: "driver" }
                : { userId, role: "customer" },
          });
        } catch (e) {
          logger.warn("Room join failed:", e?.message);
        }
      })();
    });

    this.wss.on("error", (error) => {
      logger.error("WebSocket server error:", error);
    });
    logger.info(`WebSocket server initialized on path: ${path}`);
  }

  handleUpgradeError(socket, code, message) {
    try {
      socket.write(
        `HTTP/1.1 ${code} ${message}\r\n` +
          "Connection: close\r\n" +
          "Content-Type: application/json\r\n" +
          "\r\n" +
          JSON.stringify({ success: false, error: { code, message } })
      );
    } catch {}
    try {
      socket.destroy();
    } catch {}
  }

  close() {
    return new Promise((resolve, reject) => {
      if (!this.wss) return resolve();
      this.wss.clients.forEach((client) => {
        try {
          client.close(1001, "Server is shutting down");
        } catch {}
      });
      this.wss.close((error) => {
        if (error) {
          logger.error("Error closing WebSocket server:", error);
          return reject(error);
        }
        logger.info("WebSocket server closed");
        this.wss = null;
        this.clients.clear();
        this.handlers.clear();
        this.rooms.clear();
        resolve();
      });
    });
  }
}

// Create and export a singleton instance
export const webSocketService = new WebSocketService();
export default webSocketService;
