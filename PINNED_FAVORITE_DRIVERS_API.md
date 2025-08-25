# Pinned & Favorite Drivers API Documentation

## Overview

This document describes the APIs for managing pinned and favorite drivers in the AAAO ride-booking system. Users can pin specific drivers for priority booking and maintain a list of favorite drivers for quick access.

## Features

- **Pinned Drivers**: Priority drivers that receive booking requests first
- **Favorite Drivers**: Drivers saved for quick access and preference
- **Nearby Drivers**: Find available drivers in user's area
- **Driver Status**: Real-time driver availability and location tracking

## API Endpoints

### 1. Add Driver to Pinned List

**Endpoint:** `POST /api/user/pinned-drivers`

**Description:** Add a driver to the user's pinned drivers list for priority booking.

**Request Body:**
```json
{
  "driverId": "driver_user_id_here",
  "note": "Optional note about this driver"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Driver added to pinned list successfully",
  "pinnedDriver": {
    "driverId": "driver_user_id",
    "driverName": "John Doe",
    "driverEmail": "john@example.com",
    "pinnedAt": "2024-01-15T10:30:00Z",
    "note": "Optional note about this driver"
  },
  "token": "jwt_token_here"
}
```

**Error Responses:**
- `400` - Driver ID is required
- `404` - Driver not found
- `400` - Driver is already pinned

### 2. Remove Driver from Pinned List

**Endpoint:** `DELETE /api/user/pinned-drivers/:driverId`

**Description:** Remove a driver from the user's pinned drivers list.

**Response:**
```json
{
  "success": true,
  "message": "Driver removed from pinned list successfully",
  "removedDriver": {
    "driverId": "driver_user_id",
    "pinnedAt": "2024-01-15T10:30:00Z",
    "note": "Optional note about this driver"
  },
  "token": "jwt_token_here"
}
```

**Error Responses:**
- `400` - Driver ID is required
- `404` - Driver not found in pinned list

### 3. Get Pinned Drivers List

**Endpoint:** `GET /api/user/pinned-drivers`

**Description:** Retrieve the user's list of pinned drivers with their current status.

**Response:**
```json
{
  "success": true,
  "message": "Pinned drivers retrieved successfully",
  "pinnedDrivers": [
    {
      "driverId": "driver_user_id",
      "driverName": "John Doe",
      "driverEmail": "john@example.com",
      "driverPhone": "+1234567890",
      "driverGender": "male",
      "driverKycLevel": 2,
      "driverKycStatus": "approved",
      "isActive": true,
      "currentLocation": {
        "type": "Point",
        "coordinates": [77.2090, 28.6139],
        "address": "Current address"
      },
      "pinnedAt": "2024-01-15T10:30:00Z",
      "note": "Optional note about this driver"
    }
  ],
  "totalPinned": 1,
  "token": "jwt_token_here"
}
```

### 4. Add Driver to Favorites

**Endpoint:** `POST /api/user/favorite-drivers`

**Description:** Add a driver to the user's favorite drivers list.

**Request Body:**
```json
{
  "driverId": "driver_user_id_here",
  "note": "Optional note about this driver"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Driver added to favorites successfully",
  "favoriteDriver": {
    "driverId": "driver_user_id",
    "driverName": "John Doe",
    "driverEmail": "john@example.com",
    "favoritedAt": "2024-01-15T10:30:00Z",
    "note": "Optional note about this driver"
  },
  "token": "jwt_token_here"
}
```

**Error Responses:**
- `400` - Driver ID is required
- `404` - Driver not found
- `400` - Driver is already in favorites

### 5. Remove Driver from Favorites

**Endpoint:** `DELETE /api/user/favorite-drivers/:driverId`

**Description:** Remove a driver from the user's favorite drivers list.

**Response:**
```json
{
  "success": true,
  "message": "Driver removed from favorites successfully",
  "removedDriver": {
    "driverId": "driver_user_id",
    "favoritedAt": "2024-01-15T10:30:00Z",
    "note": "Optional note about this driver"
  },
  "token": "jwt_token_here"
}
```

**Error Responses:**
- `400` - Driver ID is required
- `404` - Driver not found in favorites list

### 6. Get Favorite Drivers List

**Endpoint:** `GET /api/user/favorite-drivers`

**Description:** Retrieve the user's list of favorite drivers with their current status.

**Response:**
```json
{
  "success": true,
  "message": "Favorite drivers retrieved successfully",
  "favoriteDrivers": [
    {
      "driverId": "driver_user_id",
      "driverName": "John Doe",
      "driverEmail": "john@example.com",
      "driverPhone": "+1234567890",
      "driverGender": "male",
      "driverKycLevel": 2,
      "driverKycStatus": "approved",
      "isActive": true,
      "currentLocation": {
        "type": "Point",
        "coordinates": [77.2090, 28.6139],
        "address": "Current address"
      },
      "favoritedAt": "2024-01-15T10:30:00Z",
      "note": "Optional note about this driver"
    }
  ],
  "totalFavorites": 1,
  "token": "jwt_token_here"
}
```

### 7. Get Nearby Drivers

**Endpoint:** `GET /api/user/nearby-drivers`

**Description:** Find available drivers near the user's location with filtering options.

**Query Parameters:**
- `lat` (required): User's latitude
- `lon` (required): User's longitude
- `radius` (optional): Search radius in kilometers (default: 5)
- `serviceType` (optional): Filter by service type (car cab, bike, etc.)
- `vehicleType` (optional): Filter by vehicle type (economy, premium, etc.)

**Example Request:**
```
GET /api/user/nearby-drivers?lat=28.6139&lon=77.2090&radius=10&serviceType=car cab
```

**Response:**
```json
{
  "success": true,
  "message": "Nearby drivers retrieved successfully",
  "nearbyDrivers": [
    {
      "driverId": "driver_user_id",
      "driverName": "John Doe",
      "driverEmail": "john@example.com",
      "driverPhone": "+1234567890",
      "driverGender": "male",
      "driverKycLevel": 2,
      "driverKycStatus": "approved",
      "isActive": true,
      "vehicleType": "economy",
      "currentLocation": {
        "type": "Point",
        "coordinates": [77.2090, 28.6139],
        "address": "Current address"
      },
      "distance": 2.5,
      "isPinned": true,
      "isFavorite": false
    }
  ],
  "totalDrivers": 1,
  "searchRadius": 10,
  "userLocation": {
    "lat": 28.6139,
    "lon": 77.2090
  },
  "token": "jwt_token_here"
}
```

## Booking with Pinned Drivers

### Using Pinned Driver in Booking

When creating a booking, users can specify a pinned driver preference:

**Booking Request:**
```json
{
  "pickupLocation": {
    "coordinates": [77.2090, 28.6139],
    "address": "Pickup address"
  },
  "dropoffLocation": {
    "coordinates": [77.2310, 28.6280],
    "address": "Dropoff address"
  },
  "serviceType": "car cab",
  "vehicleType": "economy",
  "driverPreference": "pinned",
  "pinnedDriverId": "driver_user_id_here",
  "offeredFare": 150.00,
  "distanceInMeters": 5000
}
```

**System Behavior:**
1. If `driverPreference` is set to `"pinned"`, the system will only send the booking request to the specified `pinnedDriverId`
2. If the pinned driver is not available or doesn't accept, the booking will remain pending
3. Users can then choose to send to other drivers or increase the fare

## Database Schema

### User Model Updates

The user model now includes pinned and favorite drivers:

```javascript
// Pinned drivers for priority booking
pinnedDrivers: [{
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  pinnedAt: {
    type: Date,
    default: Date.now
  },
  note: {
    type: String,
    default: ''
  }
}],

// Favorite drivers for quick access
favoriteDrivers: [{
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  favoritedAt: {
    type: Date,
    default: Date.now
  },
  note: {
    type: String,
    default: ''
  }
}]
```

## Driver Qualification Logic

### Updated findNearbyDrivers Function

The `findNearbyDrivers` function now handles pinned driver preferences:

```javascript
// Handle pinned driver preference
if (booking.driverPreference === 'pinned' && booking.pinnedDriverId) {
  const pinnedDriver = await User.findById(booking.pinnedDriverId);
  
  if (pinnedDriver && pinnedDriver.role === 'driver' && pinnedDriver.isActive) {
    return [pinnedDriver]; // Only send to pinned driver
  } else {
    return []; // No drivers if pinned driver unavailable
  }
}
```

## Use Cases

### 1. Priority Booking
- User pins their preferred driver
- When creating a booking, selects "pinned" preference
- Booking request goes only to the pinned driver
- If accepted, booking proceeds normally
- If rejected, user can choose other options

### 2. Favorite Drivers Management
- User adds drivers to favorites after good experiences
- Quick access to favorite drivers for future bookings
- View favorite drivers' current status and location
- Remove drivers from favorites if needed

### 3. Driver Discovery
- Find nearby available drivers
- Filter by service type and vehicle type
- See driver ratings and current status
- Add promising drivers to favorites

## Error Handling

All endpoints include comprehensive error handling:

- **Validation Errors**: Missing required fields, invalid data types
- **Authentication Errors**: Invalid or expired tokens
- **Authorization Errors**: Access to other users' data
- **Business Logic Errors**: Driver not found, already pinned/favorited
- **Database Errors**: Connection issues, query failures

## Security Considerations

- All endpoints require authentication
- Users can only manage their own pinned/favorite drivers
- Driver information is filtered to show only necessary details
- Location data is protected and only shared when needed

## Performance Considerations

- Database indexes on driver location for fast nearby searches
- Pagination for large driver lists
- Efficient queries with proper field selection
- Caching opportunities for frequently accessed data

## Integration Examples

### Frontend Integration (React)

```javascript
// Add driver to pinned list
const addPinnedDriver = async (driverId, note = '') => {
  const response = await fetch('/api/user/pinned-drivers', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ driverId, note })
  });
  return response.json();
};

// Get nearby drivers
const getNearbyDrivers = async (lat, lon, radius = 5) => {
  const response = await fetch(
    `/api/user/nearby-drivers?lat=${lat}&lon=${lon}&radius=${radius}`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  return response.json();
};
```

### Mobile Integration (React Native)

```javascript
// Remove driver from favorites
const removeFavoriteDriver = async (driverId) => {
  const response = await fetch(`/api/user/favorite-drivers/${driverId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};

// Get pinned drivers
const getPinnedDrivers = async () => {
  const response = await fetch('/api/user/pinned-drivers', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};
```

## Testing

### Test Scenarios

1. **Add/Remove Pinned Driver**
   - Add driver to pinned list
   - Verify driver appears in pinned list
   - Remove driver from pinned list
   - Verify driver removed from list

2. **Add/Remove Favorite Driver**
   - Add driver to favorites
   - Verify driver appears in favorites
   - Remove driver from favorites
   - Verify driver removed from list

3. **Pinned Driver Booking**
   - Create booking with pinned driver preference
   - Verify booking sent only to pinned driver
   - Test with unavailable pinned driver

4. **Nearby Drivers Search**
   - Search with different radius values
   - Filter by service type
   - Verify distance calculations
   - Check pinned/favorite status

### Test Data

```javascript
// Test driver data
const testDriver = {
  _id: 'test_driver_id',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  role: 'driver',
  kycLevel: 2,
  kycStatus: 'approved',
  isActive: true,
  currentLocation: {
    type: 'Point',
    coordinates: [77.2090, 28.6139]
  }
};

// Test user data
const testUser = {
  _id: 'test_user_id',
  pinnedDrivers: [],
  favoriteDrivers: []
};
```

## Future Enhancements

1. **Driver Rating Integration**: Show driver ratings in nearby drivers list
2. **Driver Preferences**: Allow drivers to set preferences for accepting bookings
3. **Batch Operations**: Add/remove multiple drivers at once
4. **Driver Recommendations**: Suggest drivers based on user history
5. **Real-time Updates**: Socket.IO integration for driver status updates
6. **Driver Scheduling**: Allow users to schedule rides with specific drivers
7. **Driver Communication**: Direct messaging between users and drivers
8. **Driver Analytics**: Track driver performance and reliability

---

This API provides a comprehensive solution for managing driver preferences and ensuring users can book rides with their preferred drivers efficiently. 