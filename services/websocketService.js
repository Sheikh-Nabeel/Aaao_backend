import { WebSocketServer } from 'ws';
import { verifyToken } from '../utils/jwt.js';
import { WS_EVENTS, ERROR_CODES } from '../constants/websocketEvents.js';
import logger from '../utils/logger.js';
import RecoveryHandler from '../handlers/recoveryHandler.js';

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // Map<userId, Set<WebSocket>>
    this.handlers = new Map(); // Map<eventType, Array<handler>>
    this.recoveryHandler = new RecoveryHandler(this);
    this.rooms = new Map(); // Map<roomName, Set<WebSocket>>
    
    // Initialize event handlers
    this.initializeEventHandlers();
    
    this.initialize = this.initialize.bind(this);
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);
    this.emit = this.emit.bind(this);
    this.joinRoom = this.joinRoom.bind(this);
    this.leaveRoom = this.leaveRoom.bind(this);
    this.sendToRoom = this.sendToRoom.bind(this);
  }

  /**
   * Initialize event handlers
   */
  initializeEventHandlers() {
    // Register recovery handler events
    this.recoveryHandler.initializeEventHandlers();
    
    // Register car recovery specific events
    this.on('carRecovery:getDrivers', async (ws, message) => {
      await this.recoveryHandler.handleGetDrivers(ws, message);
    });

    // Register driver arrival event
    this.on('driver.arrival', async (ws, message) => {
      await this.recoveryHandler.handleDriverArrival(ws, message);
    });

    // Register waiting time updates
    this.on('waiting.time.update', async (ws, message) => {
      await this.recoveryHandler.handleWaitingTimeUpdate(ws, message);
    });

    // Register service start event
    this.on('service.start', async (ws, message) => {
      await this.recoveryHandler.handleServiceStart(ws, message);
    });

    // Prevent 'Unhandled event: authenticated' if clients echo server's AUTHENTICATED message
    this.on('authenticated', async () => { /* no-op to avoid unhandled warnings */ });

    // Role-based (re)join rooms API (client can call after auth)
    this.on('auth.join', async (ws) => {
      try {
        const rooms = this._joinDefaultRooms(ws);
        logger.info(`auth.join -> user ${ws.userId} joined rooms: ${rooms.join(', ')}`);
        this.send(ws, { event: 'auth.joined', data: { rooms } });
      } catch (e) {
        logger.error('auth.join error:', e);
        this.sendError(ws, { code: 400, message: e.message || 'Failed to join rooms' });
      }
    });

    // Explicit room join/leave APIs (optional)
    this.on('room.join', async (ws, { data }) => {
      const room = data?.room;
      if (!room) return this.sendError(ws, { code: 400, message: 'room is required' });
      this.joinRoom(ws, room);
      logger.info(`room.join -> user ${ws.userId} joined room: ${room}`);
      this.send(ws, { event: 'room.joined', data: { room } });
    });
    this.on('room.leave', async (ws, { data }) => {
      const room = data?.room;
      if (!room) return this.sendError(ws, { code: 400, message: 'room is required' });
      this.leaveRoom(ws, room);
      logger.info(`room.leave -> user ${ws.userId} left room: ${room}`);
      this.send(ws, { event: 'room.left', data: { room } });
    });
  }

  /**
   * Initialize WebSocket server
   * @param {http.Server} server - HTTP server instance
   * @param {Object} options - Configuration options
   * @param {string} options.path - WebSocket endpoint path
   * @param {string} options.jwtSecret - JWT secret for authentication
   * @param {number} options.pingInterval - Ping interval in milliseconds (default: 30000)
   */
  initialize(server, { path = '/ws', jwtSecret, pingInterval = 30000 } = {}) {
    if (!jwtSecret) {
      throw new Error('JWT secret is required for WebSocket authentication');
    }

    this.jwtSecret = jwtSecret;
    this.wss = new WebSocketServer({ noServer: true });

    // Handle HTTP upgrade requests
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      
      // Only handle WebSocket connections on the specified path
      if (url.pathname !== path) {
        socket.destroy();
        return;
      }

      // Extract token from query parameters or headers
      const token = url.searchParams.get('token') || 
                  (request.headers.authorization?.startsWith('Bearer ') 
                    ? request.headers.authorization.split(' ')[1] 
                    : null);

      if (!token) {
        this.handleUpgradeError(socket, 4001, 'No authentication token provided');
        return;
      }

      // Verify JWT token
      const { valid, decoded, error } = verifyToken(token, this.jwtSecret);
      
      if (!valid || !decoded) {
        this.handleUpgradeError(socket, 4003, error || 'Invalid or expired token');
        return;
      }

      // Handle the WebSocket upgrade
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        // Pass the decoded payload as the user object
        this.wss.emit('connection', ws, request, decoded);
      });
    });

    // Handle new WebSocket connections
    this.wss.on('connection', (ws, req, user) => {
      // Ensure user object exists and has an id
      if (!user || !user.id) {
        console.error('Invalid user object in WebSocket connection:', user);
        ws.close(4001, 'Invalid user authentication');
        return;
      }
      
      const userId = user.id.toString();
      
      console.log(`New WebSocket connection from user ${userId}`);
      
      // Add client to the clients map
      if (!this.clients.has(userId)) {
        this.clients.set(userId, new Set());
      }
      this.clients.get(userId).add(ws);

      // Add user info to the WebSocket connection
      ws.user = user;
      ws.userId = userId;  // Store userId for easier access
      ws.isAlive = true;
      ws.connectedAt = new Date();
      ws.rooms = new Set(); // track rooms for this socket

      // Minimal role-based log on connect
      const role = ws.user?.role || 'customer';
      const roleLabel = role === 'driver' ? 'Driver' : 'Customer';
      logger.info(`${roleLabel} connected: ${userId}`);

      // Set up ping-pong for connection health
      const pingIntervalId = setInterval(() => {
        if (ws.isAlive === false) {
          logger.warn(`Terminating inactive WebSocket connection: ${userId}`);
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      }, pingInterval);

      // Handle incoming messages (no verbose payload logging)
      ws.on('message', async (message) => {
        let requestId = null;
        
        try {
          const parsedMessage = JSON.parse(message);
          const { event, data } = parsedMessage;
          requestId = parsedMessage.requestId;
          
          // Minimal event log without payload
          if (event) logger.info(`WS event received: ${event}`);

          // Handle recovery request
          if (event === 'recovery.request') {
            if (!data) {
              throw new Error('Request data is required');
            }
            
            // Add default values if not provided
            const recoveryRequest = {
              requestId,
              data: {
                ...data,
                preferences: data.preferences || [],
                startTime: data.startTime || new Date(),
                hasHelper: data.hasHelper || false,
                helperCount: data.helperCount || 0,
                helperRate: data.helperRate
              }
            };
            
            await this.recoveryHandler.handleRecoveryRequest(ws, recoveryRequest);
            return;
          }

          // Handle driver assignment
          if (event === 'driver.assignment') {
            if (!data) {
              throw new Error('Assignment data is required');
            }
            
            await this.recoveryHandler.handleDriverAssignment(ws, {
              requestId,
              data: {
                ...data,
                assignedAt: new Date()
              }
            });
            return;
          }

          // Handle accept request
          if (event === 'accept_request') {
            if (!data) {
              throw new Error('Accept request data is required');
            }
            
            const acceptRequest = {
              requestId,
              data: {
                ...data,
                timestamp: new Date()
              }
            };
            
            await this.recoveryHandler.handleAcceptRequest(ws, acceptRequest);
            return;
          }

          // Handle other events...
          const handlers = this.handlers.get(event) || [];
          if (handlers.length === 0) {
            // Minimal warn without payload dumps
            logger.warn(`No handlers registered for event: ${event}`);
            this.sendError(ws, { requestId, code: ERROR_CODES.UNHANDLED_EVENT, message: `Unhandled event: ${event}` });
            return;
          }

          // Call all registered handlers for this event
          for (const handler of handlers) {
            try {
              await handler(ws, { requestId, data });
            } catch (error) {
              // Minimal error log without payload
              logger.error(`WS message error: ${error.message}`);
              this.sendError(ws, { requestId, code: error.code || ERROR_CODES.INVALID_REQUEST, message: error.message || 'Invalid message format' });
            }
          }
        } catch (error) {
          // Minimal error log without payload
          logger.error(`WS message error: ${error.message}`);
          this.sendError(ws, { requestId, code: error.code || ERROR_CODES.INVALID_REQUEST, message: error.message || 'Invalid message format' });
        }
      });

      // Handle client disconnection
      ws.on('close', () => {
        clearInterval(pingIntervalId);
        
        // Remove client from the clients map
        if (this.clients.has(userId)) {
          const userSockets = this.clients.get(userId);
          userSockets.delete(ws);
          
          // Remove user entry if no more connections
          if (userSockets.size === 0) {
            this.clients.delete(userId);
          }
        }

        // Leave all rooms this socket was part of
        if (ws.rooms && ws.rooms.size > 0) {
          for (const room of Array.from(ws.rooms)) {
            this.leaveRoom(ws, room);
          }
        }

        logger.info(`WebSocket client disconnected: ${userId}`);
      });

      // Handle ping-pong
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Send welcome message
      this.send(ws, {
        event: WS_EVENTS.AUTHENTICATED,
        data: {
          userId,
          role: ws.user?.role || 'customer',
          timestamp: new Date().toISOString(),
        },
      });

      // Auto-join default rooms and log only role-based join
      const joined = this._joinDefaultRooms(ws);
      const roleRoom = joined.find(r => r.startsWith('role:'));
      logger.info(`${roleLabel} joined room`);
    });

    // Handle server errors
    this.wss.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });

    logger.info(`WebSocket server initialized on path: ${path}`);
  }

  /**
   * Handle WebSocket upgrade errors
   * @private
   */
  handleUpgradeError(socket, code, message) {
    logger.warn(`WebSocket upgrade failed: ${message} (${code})`);
    socket.write(
      `HTTP/1.1 ${code} ${message}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: application/json\r\n' +
      '\r\n' +
      JSON.stringify({
        success: false,
        error: {
          code,
          message,
        },
      })
    );
    socket.destroy();
  }

  /**
   * Register an event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(handler);
    
    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Remove an event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function to remove
   */
  off(event, handler) {
    if (this.handlers.has(event)) {
      this.handlers.get(event).delete(handler);
      
      // Clean up empty handler sets
      if (this.handlers.get(event).size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  /**
   * Emit an event to all registered handlers
   * @param {string} event - Event name
   * @param {WebSocket} ws - WebSocket connection
   * @param {*} data - Event data
   * @param {Function} [callback] - Callback function
   * @returns {Promise<void>}
   */
  async emit(event, ws, data, callback) {
    const handlers = this.handlers.get(event) || new Set();
    
    // If no handlers and it's not a system event, emit an error
    if (handlers.size === 0 && !event.startsWith('system:')) {
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

    // Call all handlers in parallel
    await Promise.all(
      Array.from(handlers).map(handler => {
        try {
          return Promise.resolve(handler(ws, data, callback));
        } catch (error) {
          logger.error(`Error in ${event} handler:`, error);
          return Promise.reject(error);
        }
      })
    );
  }

  /**
   * Send a message to a WebSocket client
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message to send
   */
  send(ws, message) {
    if (ws.readyState === 1) { // 1 = OPEN
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error('Error sending WebSocket message:', error);
      }
    }
  }

  /**
   * Send an error message to a WebSocket client
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} options - Error options
   * @param {string} options.requestId - Request ID for correlation
   * @param {number} options.code - Error code
   * @param {string} options.message - Error message
   * @param {string} [options.details] - Additional error details
   */
  sendError(ws, { requestId, code, message, details }) {
    const errorResponse = {
      event: 'error',
      requestId,
      error: {
        code,
        message,
        ...(details && { details })
      },
      timestamp: new Date().toISOString()
    };
    
    this.send(ws, errorResponse);
  }

  /**
   * Broadcast a message to all connected clients
   * @param {Object} message - Message to broadcast
   * @param {Function} [filter] - Optional filter function (ws => boolean)
   */
  broadcast(message, filter) {
    this.wss.clients.forEach((client) => {
      if ((!filter || filter(client)) && client.readyState === 1) {
        this.send(client, message);
      }
    });
  }

  /**
   * Send a message to a specific user (all their connections)
   * @param {string} userId - User ID
   * @param {Object} message - Message to send
   */
  sendToUser(userId, message) {
    const userSockets = this.clients.get(userId);
    if (userSockets) {
      userSockets.forEach((ws) => {
        if (ws.readyState === 1) { // 1 = OPEN
          this.send(ws, message);
        }
      });
    }
  }

  /**
   * Send a message to multiple users
   * @param {string[]} userIds - Array of user IDs
   * @param {Object} message - Message to send
   */
  sendToUsers(userIds, message) {
    userIds.forEach(userId => this.sendToUser(userId, message));
  }

  /**
   * Send a message to all users with a specific role
   * @param {string} role - User role
   * @param {Object} message - Message to send
   */
  sendToRole(role, message) {
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1 && client.user?.role === role) {
        this.send(client, message);
      }
    });
  }

  /**
   * Get all connected user IDs
   * @returns {string[]} Array of user IDs
   */
  getConnectedUsers() {
    return Array.from(this.clients.keys());
  }

  /**
   * Check if a user is connected
   * @param {string} userId - User ID to check
   * @returns {boolean} True if the user is connected
   */
  isUserConnected(userId) {
    return this.clients.has(userId) && this.clients.get(userId).size > 0;
  }

  /**
   * Close the WebSocket server
   * @returns {Promise<void>}
   */
  close() {
    return new Promise((resolve, reject) => {
      if (!this.wss) {
        return resolve();
      }

      // Close all client connections
      this.wss.clients.forEach((client) => {
        client.close(1001, 'Server is shutting down');
      });

      // Close the server
      this.wss.close((error) => {
        if (error) {
          logger.error('Error closing WebSocket server:', error);
          return reject(error);
        }
        logger.info('WebSocket server closed');
        this.wss = null;
        this.clients.clear();
        this.handlers.clear();
        this.rooms.clear();
        resolve();
      });
    });
  }

  // Create or join a room
  joinRoom(ws, roomName) {
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }
    const room = this.rooms.get(roomName);
    room.add(ws);
    ws.rooms?.add(roomName);
  }

  // Leave a room
  leaveRoom(ws, roomName) {
    const room = this.rooms.get(roomName);
    if (!room) return;
    room.delete(ws);
    ws.rooms?.delete(roomName);
    if (room.size === 0) this.rooms.delete(roomName);
  }

  // Send to a specific room
  sendToRoom(roomName, message) {
    const room = this.rooms.get(roomName);
    if (!room) return;
    room.forEach((client) => {
      if (client.readyState === 1) {
        this.send(client, message);
      }
    });
  }

  // Internal: join default role/user rooms and return list
  _joinDefaultRooms(ws) {
    const rooms = [];
    const userRoom = `user:${ws.userId}`;
    const roleRoom = `role:${ws.user?.role || 'unknown'}`;
    this.joinRoom(ws, userRoom);
    this.joinRoom(ws, roleRoom);
    rooms.push(userRoom, roleRoom);
    return rooms;
  }
}

// Create and export a singleton instance
export const webSocketService = new WebSocketService();
export default webSocketService;
