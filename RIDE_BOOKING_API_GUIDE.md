# Ride Booking API Guide

This guide covers the essential APIs for implementing ride booking functionality in your application.

## Authentication

### Login/Register
```http
POST /api/users/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+1234567890",
  "role": "user" // or "driver"
}
```

```http
POST /api/users/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "_id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "tgp": 0,
    "pgp": 0
  }
}
```

## Ride Booking Flow

### 1. Get Fare Estimation
```http
POST /api/fare-estimation/estimate
Authorization: Bearer jwt_token
Content-Type: application/json

{
  "pickupLocation": {
    "coordinates": [77.2090, 28.6139],
    "address": "Connaught Place, New Delhi"
  },
  "dropoffLocation": {
    "coordinates": [77.3910, 28.5355],
    "address": "Noida Sector 62"
  },
  "serviceType": "car cab", // "car cab", "bike", "car recovery", "shifting & movers"
  "serviceCategory": "standard", // For car recovery: "standard", "premium", "luxury"
  "vehicleType": "economy", // Car cab: "economy", "premium", "luxury" | Bike: "standard", "electric" | Recovery: "tow_truck", "flatbed"
  "routeType": "one_way", // "one_way" or "round_trip"
  "distanceInMeters": 12500,
  "estimatedDuration": 25, // minutes
  "trafficCondition": "moderate", // "light", "moderate", "heavy"
  "isNightTime": false, // true for night surcharge (10 PM - 6 AM)
  "demandRatio": 1.2, // surge pricing multiplier
  "waitingMinutes": 0, // expected waiting time
  "scheduledTime": null, // ISO string for future bookings
  
  // Service-specific fields
  "serviceDetails": {
    // For shifting & movers
    "floors": 2, // number of floors
    "hasElevator": true,
    "packingRequired": false,
    "assemblyRequired": true,
    
    // For car recovery
    "vehicleCondition": "running", // "running", "not_running", "accident"
    "recoveryType": "breakdown", // "breakdown", "accident", "fuel_delivery", "battery_jump"
    "urgencyLevel": "standard" // "standard", "urgent", "emergency"
  },
  
  // Item details for shifting & movers
  "itemDetails": [
    {
      "category": "furniture",
      "items": {
        "sofas": 1,
        "beds": 2,
        "wardrobes": 1,
        "diningTable": 1,
        "chairs": 6
      }
    },
    {
      "category": "appliances",
      "items": {
        "refrigerator": 1,
        "washingMachine": 1,
        "microwave": 1
      }
    }
  ],
  
  // Service options
  "serviceOptions": {
    "packingMaterial": true,
    "disassemblyService": true,
    "storageService": false,
    "insuranceCoverage": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "estimatedFare": 245.50,
  "currency": "AED",
  "fareBreakdown": {
    "baseFare": 50,
    "distanceFare": 125,
    "timeFare": 25,
    "trafficSurcharge": 15, // moderate traffic
    "nightSurcharge": 0, // not applicable
    "surgePricing": 30.50, // 1.2x multiplier
    "serviceCharges": 0,
    "taxes": 0
  },
  "adjustmentSettings": {
    "allowedPercentage": 20,
    "minFare": 196.40,
    "maxFare": 294.60,
    "canAdjustFare": true
  },
  "tripDetails": {
    "distance": "12.50 km",
    "estimatedDuration": "25 mins",
    "serviceType": "car cab",
    "serviceCategory": "standard",
    "vehicleType": "economy",
    "routeType": "one_way",
    "trafficCondition": "moderate",
    "isNightTime": false,
    "demandRatio": 1.2
  },
  "pricingFactors": {
    "peakHours": false,
    "weatherConditions": "clear",
    "specialEvents": false,
    "driverAvailability": "good"
  }
}
```

### 2. Create Booking
```http
POST /api/bookings/create
Authorization: Bearer jwt_token
Content-Type: application/json

{
  "pickupLocation": {
    "coordinates": [77.2090, 28.6139],
    "address": "Connaught Place, New Delhi"
  },
  "dropoffLocation": {
    "coordinates": [77.3910, 28.5355],
    "address": "Noida Sector 62"
  },
  "serviceType": "car cab", // "car cab", "bike", "car recovery", "shifting & movers"
  "serviceCategory": "standard",
  "vehicleType": "economy",
  "routeType": "one_way",
  "driverPreference": "nearby", // "nearby", "pinned", "pink_captain"
  "pinnedDriverId": null, // required if driverPreference is "pinned"
  "offeredFare": 245.50,
  "distanceInMeters": 12500,
  "estimatedDuration": 25,
  "trafficCondition": "moderate",
  "isNightTime": false,
  "demandRatio": 1.2,
  "waitingMinutes": 0,
  "scheduledTime": null, // ISO string for future bookings
  "passengerCount": 1,
  "wheelchairAccessible": false,
  "paymentMethod": "cash", // "cash", "card", "wallet", "upi"
  
  // Pink Captain options
  "pinkCaptainOptions": {
    "femalePassengersOnly": false,
    "familyRides": false,
    "safeZoneRides": false
  },
  
  // Driver filters
  "driverFilters": {
    "minRating": 4.0,
    "preferredLanguages": ["english", "hindi"],
    "vehicleAge": 5, // max years
    "experienceYears": 2 // min years
  },
  
  // Service-specific details
  "serviceDetails": {
    // For shifting & movers
    "floors": 2,
    "hasElevator": true,
    "packingRequired": false,
    "assemblyRequired": true,
    
    // For car recovery
    "vehicleCondition": "running",
    "recoveryType": "breakdown",
    "urgencyLevel": "standard",
    "vehicleModel": "Toyota Camry",
    "vehicleYear": 2020
  },
  
  // Item details for shifting & movers
  "itemDetails": [
    {
      "category": "furniture",
      "items": {
        "sofas": 1,
        "beds": 2,
        "wardrobes": 1,
        "diningTable": 1,
        "chairs": 6
      }
    }
  ],
  
  // Service options
  "serviceOptions": {
    "packingMaterial": true,
    "disassemblyService": true,
    "storageService": false,
    "insuranceCoverage": true
  },
  
  // Additional options
  "extras": [
    "child_seat",
    "pet_friendly",
    "music_preference"
  ],
  
  // Appointment details for scheduled rides
  "appointmentDetails": {
    "isAppointment": false,
    "appointmentTime": null,
    "recurringType": null, // "daily", "weekly", "monthly"
    "endDate": null
  }
}
```

**Response:**
```json
{
  "success": true,
  "booking": {
    "_id": "booking_id",
    "status": "pending",
    "user": "user_id",
    "pickupLocation": {...},
    "dropoffLocation": {...},
    "offeredFare": 245.50,
    "serviceType": "car cab",
    "serviceCategory": "standard",
    "vehicleType": "economy",
    "routeType": "one_way",
    "distanceInMeters": 12500,
    "estimatedDuration": 25,
    "trafficCondition": "moderate",
    "isNightTime": false,
    "demandRatio": 1.2,
    "driverPreference": "nearby",
    "paymentMethod": "cash",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  },
  "estimatedDriverArrival": "5-8 minutes",
  "nearbyDriversCount": 12
}
```

## Socket.io Events for Real-time Booking

### Connection & Authentication
```javascript
const socket = io('http://localhost:3001', {
  auth: {
    token: 'jwt_token_here'
  }
});

// Listen for authentication success
socket.on('authenticated', (data) => {
  console.log('Authenticated:', data.user);
});
```

### Booking Events

#### 1. Start Booking Process
```javascript
// After creating booking via REST API, emit this event
socket.emit('start_booking', {
  bookingId: 'booking_id_from_api',
  userLocation: {
    latitude: 28.6139,
    longitude: 77.2090
  }
});
```

#### 2. Listen for Driver Responses
```javascript
// Driver found and accepted
socket.on('driver_accepted', (data) => {
  console.log('Driver accepted:', data);
  /*
  {
    bookingId: 'booking_id',
    driver: {
      _id: 'driver_id',
      name: 'Driver Name',
      phone: '+1234567890',
      vehicleNumber: 'DL01AB1234',
      rating: 4.5,
      location: { latitude: 28.6100, longitude: 77.2050 }
    },
    estimatedArrival: 5 // minutes
  }
  */
});

// No drivers available
socket.on('no_drivers_available', (data) => {
  console.log('No drivers found:', data.bookingId);
});
```

#### 3. Ride Status Updates
```javascript
// Driver is arriving
socket.on('driver_arriving', (data) => {
  console.log('Driver arriving:', data);
});

// Driver has arrived
socket.on('driver_arrived', (data) => {
  console.log('Driver arrived:', data.bookingId);
});

// Ride started
socket.on('ride_started', (data) => {
  console.log('Ride started:', data);
  /*
  {
    bookingId: 'booking_id',
    startTime: '2024-01-15T10:30:00Z',
    actualFare: 200
  }
  */
});

// Ride completed
socket.on('ride_completed', (data) => {
  console.log('Ride completed:', data);
  /*
  {
    bookingId: 'booking_id',
    endTime: '2024-01-15T11:00:00Z',
    finalFare: 220,
    distance: 12.8,
    duration: 30,
    pgpEarned: 50 // if fare >= ₹100
  }
  */
});
```

#### 4. Location Tracking
```javascript
// Update user location during booking search
socket.emit('update_location', {
  coordinates: [77.2090, 28.6139]
});

// Receive driver location updates
socket.on('driver_location_update', (data) => {
  console.log('Driver location:', data);
  /*
  {
    driverId: 'driver_id',
    location: { coordinates: [77.2070, 28.6120] },
    timestamp: '2024-01-15T10:25:00Z'
  }
  */
});
```

#### 5. Cancellation
```javascript
// Cancel booking
socket.emit('cancel_booking', {
  bookingId: 'booking_id',
  reason: 'Changed plans'
});

// Listen for cancellation confirmation
socket.on('booking_cancelled', (data) => {
  console.log('Booking cancelled:', data);
  /*
  {
    bookingId: 'booking_id',
    cancellationCharge: 0, // or amount if applicable
    refundAmount: 200
  }
  */
});

// Driver cancelled
socket.on('driver_cancelled', (data) => {
  console.log('Driver cancelled:', data.bookingId);
  // System will automatically search for new driver
});
```

## Error Handling

```javascript
// Listen for booking errors
socket.on('booking_error', (error) => {
  console.error('Booking error:', error);
  /*
  {
    bookingId: 'booking_id',
    error: 'No drivers available in your area',
    code: 'NO_DRIVERS'
  }
  */
});

// General socket errors
socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

## Complete Booking Flow Example

```javascript
class RideBookingService {
  constructor(token) {
    this.token = token;
    this.socket = io('http://localhost:3001', {
      auth: { token }
    });
    this.setupSocketListeners();
  }

  async bookRide(pickupLocation, dropLocation, serviceType) {
    try {
      // 1. Get fare estimation with comprehensive fields
      const fareResponse = await fetch('/api/fare-estimation/estimate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pickupLocation,
          dropoffLocation: dropLocation,
          serviceType,
          serviceCategory: "standard",
          vehicleType: "premium",
          routeType: "one_way",
          distanceInMeters: 12500,
          estimatedDuration: 25,
          trafficCondition: "heavy",
          isNightTime: true,
          demandRatio: 1.5,
          waitingMinutes: 2
        })
      });
      
      const fareData = await fareResponse.json();
      console.log('Estimated fare:', fareData.estimatedFare);
      console.log('Fare breakdown:', fareData.fareBreakdown);
      
      // 2. Create booking with enhanced fields
      const bookingResponse = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pickupLocation,
          dropoffLocation: dropLocation,
          serviceType,
          serviceCategory: "standard",
          vehicleType: "premium",
          routeType: "one_way",
          driverPreference: "pink_captain",
          offeredFare: fareData.estimatedFare,
          distanceInMeters: 12500,
          estimatedDuration: 25,
          trafficCondition: "heavy",
          isNightTime: true,
          demandRatio: 1.5,
          passengerCount: 2,
          wheelchairAccessible: false,
          paymentMethod: "card",
          pinkCaptainOptions: {
            femalePassengersOnly: true,
            familyRides: false,
            safeZoneRides: true
          },
          driverFilters: {
            minRating: 4.5,
            preferredLanguages: ["english"],
            vehicleAge: 3,
            experienceYears: 3
          },
          extras: ["child_seat", "music_preference"]
        })
      });
      
      const bookingData = await bookingResponse.json();
      console.log('Booking created:', bookingData.booking._id);
      console.log('Estimated driver arrival:', bookingData.estimatedDriverArrival);
      
      // 3. Start real-time booking process
      this.socket.emit('start_booking', {
        bookingId: bookingData.booking._id,
        userLocation: pickupLocation
      });
      
      return bookingData.booking;
    } catch (error) {
      console.error('Booking failed:', error);
      throw error;
    }
  }

  setupSocketListeners() {
    this.socket.on('driver_accepted', (data) => {
      this.onDriverAccepted(data);
    });
    
    this.socket.on('ride_started', (data) => {
      this.onRideStarted(data);
    });
    
    this.socket.on('ride_completed', (data) => {
      this.onRideCompleted(data);
    });
    
    this.socket.on('booking_error', (error) => {
      this.onBookingError(error);
    });
  }

  onDriverAccepted(data) {
    // Update UI with driver details
    console.log('Driver found:', data.driver);
  }

  onRideStarted(data) {
    // Update UI to show ride in progress
    console.log('Ride started');
  }

  onRideCompleted(data) {
    // Show ride summary and rating option
    console.log('Ride completed. PGP earned:', data.pgpEarned);
  }

  onBookingError(error) {
    // Handle booking errors
    console.error('Booking error:', error);
  }

  cancelBooking(bookingId, reason) {
    this.socket.emit('cancel_booking', {
      bookingId,
      reason
    });
  }
}

// Usage
const bookingService = new RideBookingService('jwt_token');

// Book a ride
bookingService.bookRide(
  { coordinates: [77.2090, 28.6139], address: "Pickup Location" },
  { coordinates: [77.3910, 28.5355], address: "Drop Location" },
  "car cab"
);
```

## Service-Specific Examples

### Car Cab Service
```json
{
  "serviceType": "car cab",
  "vehicleType": "premium", // "economy", "premium", "luxury"
  "trafficCondition": "heavy",
  "isNightTime": true,
  "demandRatio": 1.5,
  "passengerCount": 3,
  "wheelchairAccessible": false,
  "extras": ["child_seat", "music_preference"]
}
```

### Bike Service
```json
{
  "serviceType": "bike",
  "vehicleType": "electric", // "standard", "electric"
  "trafficCondition": "light",
  "isNightTime": false,
  "demandRatio": 1.0,
  "passengerCount": 1,
  "extras": ["helmet_provided", "rain_protection"]
}
```

### Car Recovery Service
```json
{
  "serviceType": "car recovery",
  "serviceCategory": "premium",
  "vehicleType": "flatbed", // "tow_truck", "flatbed"
  "serviceDetails": {
    "vehicleCondition": "not_running",
    "recoveryType": "accident",
    "urgencyLevel": "emergency",
    "vehicleModel": "BMW X5",
    "vehicleYear": 2022
  },
  "isNightTime": true,
  "demandRatio": 2.0
}
```

### Shifting & Movers Service
```json
{
  "serviceType": "shifting & movers",
  "vehicleType": "large_truck",
  "serviceDetails": {
    "floors": 3,
    "hasElevator": false,
    "packingRequired": true,
    "assemblyRequired": true
  },
  "itemDetails": [
    {
      "category": "furniture",
      "items": {
        "sofas": 2,
        "beds": 3,
        "wardrobes": 2,
        "diningTable": 1,
        "chairs": 8
      }
    },
    {
      "category": "appliances",
      "items": {
        "refrigerator": 1,
        "washingMachine": 1,
        "dishwasher": 1
      }
    }
  ],
  "serviceOptions": {
    "packingMaterial": true,
    "disassemblyService": true,
    "storageService": true,
    "insuranceCoverage": true
  }
}
```

## Key Features

- **TGP/PGP System**: Integrated gaming points system
- **5km Radius Limits**: Smart driver search with city-wide Pink Captain access
- **Pink Captain**: Female driver options with safety features
- **Socket-Connected Drivers**: Real-time driver availability
- **Dynamic Pricing**: Traffic, night, and surge pricing with detailed breakdown
- **Comprehensive Service Types**: Car cab, bike, car recovery, shifting & movers with specific fields
- **Advanced Filtering**: Driver preferences, vehicle specifications, and service options

## Testing

The server is running at `http://localhost:3001` with all enhanced features implemented and tested.