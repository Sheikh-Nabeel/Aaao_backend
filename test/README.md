# Live Location Tracking Test Guide

This guide explains how to test the live location tracking functionality implemented in the Aaao backend system.

## Overview

The live location tracking system allows:
- **Users** to share their location and receive qualified driver information
- **Drivers** to share their location and receive booking requests
- **Real-time communication** between users and drivers during rides

## Test Files

### 1. `location-tracking-test.html`
A comprehensive web interface for testing Socket.IO connections and location updates for both users and drivers.

## Prerequisites

1. **Server Running**: Ensure the Aaao backend server is running on `http://localhost:3003`
2. **Valid Tokens**: You need valid JWT tokens for both user and driver accounts
3. **Database Setup**: Ensure MongoDB is running with proper user and driver data

## Getting Test Tokens

### For Users:
```bash
# Login as a user to get token
curl -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

### For Drivers:
```bash
# Login as a driver to get token
curl -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "driver@example.com",
    "password": "password123"
  }'
```

## Testing Steps

### Step 1: Open Test Interface
1. Open `location-tracking-test.html` in your web browser
2. You'll see two panels: User Testing (blue) and Driver Testing (green)

### Step 2: Connect User
1. Enter a valid user JWT token in the "User Token" field
2. Enter the corresponding user ID
3. Click "Connect as User"
4. Verify the status shows "Connected" and you see "Joined room" in the log

### Step 3: Connect Driver
1. Enter a valid driver JWT token in the "Driver Token" field
2. Enter the corresponding driver ID
3. Click "Connect as Driver"
4. Verify the status shows "Connected" and you see "Joined room" in the log

### Step 4: Test Driver Status Update
1. In the driver panel, set coordinates (or click "Randomize Location")
2. Set driver status to "Active"
3. Click "Update Driver Status"
4. Check the log for confirmation

### Step 5: Test Location Updates

#### User Location Update:
1. Set user coordinates in the user panel
2. Click "Update User Location"
3. Check the log for confirmation

#### Driver Location Update:
1. Set driver coordinates, heading, and speed
2. Click "Update Driver Location"
3. Check the log for confirmation
4. If there are active bookings, users should receive location updates

### Step 6: Test Qualified Drivers Request
1. In the user panel, set pickup location coordinates
2. Click "Request Qualified Drivers"
3. Check the "Qualified Drivers" section for results
4. Verify drivers within range are returned with their locations

## Socket.IO Events Reference

### User Events

#### Outgoing (User → Server):
- `join_user_room(userId)` - Join user's personal room
- `user_location_update(data)` - Update user location
- `request_qualified_drivers(data)` - Request nearby qualified drivers

#### Incoming (Server → User):
- `room_joined(data)` - Confirmation of room join
- `location_updated(data)` - Location update confirmation
- `qualified_drivers_response(data)` - List of qualified drivers
- `driver_location_update(data)` - Driver location updates during ride

### Driver Events

#### Outgoing (Driver → Server):
- `join_driver_room(driverId)` - Join driver's personal room
- `driver_status_update(data)` - Update driver status and location
- `driver_location_update(data)` - Update driver location with heading/speed

#### Incoming (Server → Driver):
- `room_joined(data)` - Confirmation of room join
- `status_updated(data)` - Status update confirmation
- `location_updated(data)` - Location update confirmation
- `new_booking_request(data)` - New booking requests
- `user_location_update(data)` - User location updates during ride

## Data Structures

### Location Update (User)
```javascript
{
  coordinates: [longitude, latitude],
  address: "Human readable address",
  bookingId: "optional_booking_id" // for active rides
}
```

### Location Update (Driver)
```javascript
{
  coordinates: [longitude, latitude],
  address: "Human readable address",
  heading: 45, // degrees (0-360)
  speed: 30    // km/h
}
```

### Driver Status Update
```javascript
{
  isActive: true,
  currentLocation: {
    coordinates: [longitude, latitude],
    address: "Current address"
  }
}
```

### Qualified Drivers Request
```javascript
{
  pickupLocation: {
    coordinates: [longitude, latitude],
    address: "Pickup address"
  },
  serviceType: "car cab", // or "bike", "delivery"
  vehicleType: "car",     // or "bike", "any"
  driverPreference: "any" // or "pinned", "pink_captain"
}
```

## Expected Behavior

### Successful Connection:
- Status indicator turns green
- "Connected" message appears
- Room join confirmation in logs

### Location Updates:
- Confirmation messages in logs
- Real-time broadcasting to relevant parties
- Database updates (check MongoDB)

### Qualified Drivers:
- List of nearby drivers with their locations
- Distance calculations
- Filtering based on service type and preferences

## Troubleshooting

### Connection Issues:
1. **"Authentication failed"**: Check if JWT token is valid and not expired
2. **"Cannot join room"**: Verify user/driver ID matches the token
3. **"Connection refused"**: Ensure server is running on correct port

### Location Issues:
1. **"Invalid coordinates"**: Check latitude/longitude format
2. **"No qualified drivers"**: Ensure drivers are active and within range
3. **"Location not updating"**: Check database connection and user permissions

### Database Verification:
```javascript
// Check user location in MongoDB
db.users.findOne({_id: ObjectId("USER_ID")}, {currentLocation: 1})

// Check active drivers
db.users.find({role: "driver", isActive: true}, {currentLocation: 1, firstName: 1})
```

## Performance Testing

### Load Testing:
1. Open multiple browser tabs with the test interface
2. Connect multiple users and drivers simultaneously
3. Send frequent location updates
4. Monitor server logs for performance

### Real-time Testing:
1. Connect user and driver
2. Create a booking between them
3. Update locations frequently
4. Verify real-time updates are received

## Security Notes

- Always use HTTPS in production
- JWT tokens should have appropriate expiration times
- Validate all location data on the server side
- Implement rate limiting for location updates
- Never expose sensitive user data in location broadcasts

## Integration with Frontend

This test interface demonstrates the Socket.IO events that your frontend application should implement:

1. **Authentication**: Pass JWT token in Socket.IO auth
2. **Room Management**: Join appropriate rooms based on user role
3. **Location Updates**: Send regular location updates
4. **Event Handling**: Listen for relevant events and update UI
5. **Error Handling**: Handle connection errors and authentication failures

## Next Steps

1. **Mobile Integration**: Implement these events in your mobile app
2. **Map Integration**: Add real-time location display on maps
3. **Geofencing**: Implement location-based triggers
4. **Analytics**: Track location update frequency and accuracy
5. **Optimization**: Implement location update throttling and batching