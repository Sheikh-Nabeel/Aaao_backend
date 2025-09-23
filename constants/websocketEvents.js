/**
 * WebSocket Event Types
 * These constants define all the WebSocket event types used in the application.
 * They are organized by category for better maintainability.
 */

// Booking statuses
const BOOKING_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DRIVER_ASSIGNED: 'driver_assigned',
  DRIVER_EN_ROUTE: 'driver_en_route',
  DRIVER_ARRIVED: 'driver_arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  REJECTED: 'rejected',
};

// Driver statuses
const DRIVER_STATUS = {
  OFFLINE: 'offline',
  ONLINE: 'online',
  BUSY: 'busy',
  ON_BREAK: 'on_break',
};

// Service Types
const SERVICE_TYPES = {
  TOWING: 'towing',
  WINCHING: 'winching',
  ROADSIDE_ASSISTANCE: 'roadside_assistance',
  SPECIALIZED_RECOVERY: 'specialized_recovery',
};

// Vehicle Types
const VEHICLE_TYPES = {
  CAR: 'car',
  SUV: 'suv',
  TRUCK: 'truck',
  BUS: 'bus',
  MOTORCYCLE: 'motorcycle',
};

// Stop Types
const STOP_TYPES = {
  PICKUP: 'pickup',
  DROPOFF: 'dropoff',
  VIA: 'via',
};

// Driver Types
const DRIVER_TYPES = {
  REGULAR: 'regular',
  PINK: 'pink',
  PREMIUM: 'premium',
};

// Service Preferences
const SERVICE_PREFERENCES = {
  PINK_CAPTAIN: 'pink_captain',
  MALE_DRIVER: 'male_driver',
  FEMALE_DRIVER: 'female_driver',
  FAMILY_FRIENDLY: 'family_friendly',
  ENGLISH_SPEAKING: 'english_speaking',
};

// Car Recovery Events
const CAR_RECOVERY_EVENTS = {
  // Driver events
  DRIVER_ARRIVAL: 'driver.arrival',
  SERVICE_START: 'service.start',
  
  // Waiting time events
  WAITING_TIME_UPDATE: 'waiting.time.update',
  WAITING_WARNING: 'waiting.warning',
  
  // Service events
  SERVICE_STARTED: 'service.started',
  SERVICE_COMPLETED: 'service.completed',
  
  // Cancellation events
  CANCELLATION_REQUESTED: 'cancellation.requested',
  CANCELLATION_ACCEPTED: 'cancellation.accepted',
  CANCELLATION_REJECTED: 'cancellation.rejected',
  
  // Status updates
  STATUS_UPDATED: 'status.updated',
  
  // Payment events
  PAYMENT_AUTHORIZED: 'payment.authorized',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed'
};

// WebSocket event types
const WS_EVENTS = {
  // Connection events
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  RECONNECT: 'reconnect',
  
  // Authentication events
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  UNAUTHORIZED: 'unauthorized',
  
  // Booking events
  BOOKING_CREATED: 'booking.created',
  BOOKING_UPDATED: 'booking.updated',
  BOOKING_CANCELLED: 'booking.cancelled',
  
  // Driver events
  DRIVER_LOCATION_UPDATE: 'driver.location.update',
  DRIVER_AVAILABLE: 'driver.available',
  DRIVER_UNAVAILABLE: 'driver.unavailable',
  
  // Car Recovery events
  ...CAR_RECOVERY_EVENTS,
  
  // Error events
  ERROR: 'error',
  ERROR_INVALID_REQUEST: 'error_invalid_request',
  ERROR_DRIVER_UNAVAILABLE: 'error_driver_unavailable',
  ERROR_PAYMENT_FAILED: 'error_payment_failed',
  ERROR_SERVICE_UNAVAILABLE: 'error_service_unavailable',
};

// Message types for chat
const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  LOCATION: 'location',
  SYSTEM: 'system',
  STATUS_UPDATE: 'status_update',
};

// Notification types
const NOTIFICATION_TYPES = {
  BOOKING_REQUEST: 'booking_request',
  BOOKING_ACCEPTED: 'booking_accepted',
  BOOKING_REJECTED: 'booking_rejected',
  BOOKING_CANCELLED: 'booking_cancelled',
  DRIVER_ASSIGNED: 'driver_assigned',
  DRIVER_LOCATION: 'driver_location',
  PAYMENT_RECEIVED: 'payment_received',
  RATING_RECEIVED: 'rating_received',
  PROMOTION: 'promotion',
  SYSTEM: 'system',
};

// Error codes
const ERROR_CODES = {
  // General errors (1000-1099)
  INTERNAL_SERVER_ERROR: 1000,
  VALIDATION_ERROR: 1001,
  UNAUTHORIZED: 1002,
  FORBIDDEN: 1003,
  NOT_FOUND: 1004,
  TIMEOUT: 1005,
  RATE_LIMIT_EXCEEDED: 1006,
  SERVICE_UNAVAILABLE: 1007,
  INVALID_REQUEST: 1008,
  CONFLICT: 1009,

  // Authentication errors (1100-1199)
  INVALID_TOKEN: 1100,
  TOKEN_EXPIRED: 1101,
  INVALID_CREDENTIALS: 1102,
  ACCOUNT_LOCKED: 1103,
  SESSION_EXPIRED: 1104,

  // Booking errors (1200-1299)
  BOOKING_NOT_FOUND: 1200,
  BOOKING_ALREADY_ACCEPTED: 1201,
  BOOKING_ALREADY_COMPLETED: 1202,
  BOOKING_ALREADY_CANCELLED: 1203,
  INVALID_BOOKING_STATUS: 1204,
  DRIVER_NOT_ASSIGNED: 1205,
  INVALID_PAYMENT_METHOD: 1206,
  PAYMENT_REQUIRED: 1207,
  INSUFFICIENT_FUNDS: 1208,
  PAYMENT_FAILED: 1209,
  REFUND_FAILED: 1210,

  // Driver errors (1300-1399)
  DRIVER_NOT_FOUND: 1300,
  DRIVER_OFFLINE: 1301,
  DRIVER_BUSY: 1302,
  DRIVER_UNAVAILABLE: 1303,
  INVALID_DRIVER_STATUS: 1304,
  DRIVER_LOCATION_REQUIRED: 1305,
  DRIVER_ALREADY_ASSIGNED: 1306,
  DRIVER_NOT_AVAILABLE: 1307,

  // Vehicle errors (1400-1499)
  VEHICLE_NOT_FOUND: 1400,
  VEHICLE_NOT_AVAILABLE: 1401,
  INVALID_VEHICLE_TYPE: 1402,
  VEHICLE_MAINTENANCE_REQUIRED: 1403,

  // Customer errors (1500-1599)
  CUSTOMER_NOT_FOUND: 1500,
  CUSTOMER_BLOCKED: 1501,
  INSUFFICIENT_RATING: 1502,
  TOO_MANY_REQUESTS: 1503,

  // Location errors (1600-1699)
  INVALID_LOCATION: 1600,
  LOCATION_NOT_FOUND: 1601,
  LOCATION_SERVICE_UNAVAILABLE: 1602,
  ROUTE_NOT_FOUND: 1603,
  OUT_OF_SERVICE_AREA: 1604,

  // Payment errors (1700-1799)
  PAYMENT_METHOD_NOT_FOUND: 1700,
  PAYMENT_DECLINED: 1701,
  PAYMENT_PROCESSING_ERROR: 1702,
  REFUND_PROCESSING_ERROR: 1703,
  PAYMENT_VERIFICATION_FAILED: 1704,

  // New error codes
  INVALID_SERVICE_TYPE: 1800,
  NO_AVAILABLE_DRIVERS: 1801,
  PINK_CAPTAIN_UNAVAILABLE: 1802,
  INVALID_STOP_SEQUENCE: 1803,
  MAX_STOPS_EXCEEDED: 1804,
};

// Payment methods
const PAYMENT_METHODS = {
  CASH: 'cash',
  CREDIT_CARD: 'credit_card',
  DEBIT_CARD: 'debit_card',
  APPLE_PAY: 'apple_pay',
  GOOGLE_PAY: 'google_pay',
  SADAD: 'sadad',
  MADA: 'mada',
  WALLET: 'wallet',
};

// Payment statuses
const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

// Area types for pricing
const AREA_TYPES = {
  URBAN: 'urban',
  HIGHWAY: 'highway',
  OFFROAD: 'offroad',
};

// Surge pricing levels
const SURGE_LEVELS = {
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

// Export all constants
export {
  // Main exports
  WS_EVENTS,
  CAR_RECOVERY_EVENTS,
  
  // Statuses and types
  BOOKING_STATUS,
  DRIVER_STATUS,
  SERVICE_TYPES,
  VEHICLE_TYPES,
  MESSAGE_TYPES,
  NOTIFICATION_TYPES,
  PAYMENT_STATUS,
  PAYMENT_METHODS,
  
  // Other
  ERROR_CODES,
  STOP_TYPES,
  DRIVER_TYPES,
  SERVICE_PREFERENCES,
  AREA_TYPES,
  SURGE_LEVELS
};

// Default export for backward compatibility
export default WS_EVENTS;
