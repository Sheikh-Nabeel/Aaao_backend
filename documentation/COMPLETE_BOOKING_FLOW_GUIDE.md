# 🚗 Complete Booking Flow Guide - All Service Types

## 🎯 **Quick Test Request Data (Floor Charges Working)**

### **✅ Correct Shifting & Movers Request (Floor Charges Enabled):**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Apartment 123, Building A, Dubai"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Villa 456, Palm Jumeirah, Dubai"
  },
  "serviceType": "shifting & movers",
  "vehicleType": "small van",
  "distanceInMeters": 15000,
  "furnitureDetails": {
    "sofa": 2,
    "bed": 1,
    "dining_table": 3,
    "tv": 2,
    "wardrobe": 2,
    "fridge": 1,
    "washing_machine": 1,
    "ac": 1,
    "other": 5
  },
  "serviceDetails": {
    "shiftingMovers": {
      "selectedServices": {
        "loadingUnloading": true,
        "packing": false,
        "fixing": true,
        "helpers": true,
        "wheelchairHelper": false
      },
      "pickupFloorDetails": {
        "floor": 5,
        "hasLift": true,
        "accessType": "lift"
      },
      "dropoffFloorDetails": {
        "floor": 0,
        "hasLift": false,
        "accessType": "ground"
      },
      "extras": [
        { "name": "Packing Material", "count": 5 },
        { "name": "Extra Helper", "count": 1 },
        { "name": "Furniture Assembly", "count": 1 }
      ]
    }
  }
}
```

**🔧 Test Different Floor Scenarios:**
- **Ground Floor:** Change `"floor": 0` (no floor charges)
- **2nd Floor Stairs:** Change to `"floor": 2, "accessType": "stairs"` (+154 AED)
- **5th Floor Lift:** Change to `"floor": 5, "accessType": "lift"` (+75 AED)
- **10th Floor Stairs:** Change to `"floor": 10, "accessType": "stairs"` (+1386 AED)

**🚛 Test Different Vehicle Types:**
- **Mini Pickup:** Change `"vehicleType": "mini pickup"` (40 AED base + 12 AED/km)
- **Small Van:** Change `"vehicleType": "small van"` (50 AED base + 15 AED/km)
- **Medium Truck:** Change `"vehicleType": "medium truck"` (80 AED base + 18 AED/km)
- **Large Truck:** Change `"vehicleType": "large truck"` (150 AED base + 25 AED/km)
- **Container Truck:** Change `"vehicleType": "container truck"` (200 AED base + 30 AED/km)

**✅ Supported Furniture Items:**
- `sofa`, `bed`, `dining_table`, `tv`, `wardrobe`
- `fridge`, `washing_machine`, `ac`, `other`

### **✅ Correct Car Recovery Request (Tested Successfully):**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Sheikh Zayed Road, Dubai"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Dubai Auto Service Center"
  },
  "serviceType": "car recovery",
  "serviceCategory": "towing services",
  "vehicleType": "flatbed towing",
  "routeType": "one_way",
  "distanceInMeters": 8000,
  "passengerCount": 0,
  "serviceDetails": {
    "carRecovery": {
      "issueDescription": "Engine won't start, battery seems dead",
      "urgencyLevel": "high",
      "vehicleMake": "Toyota",
      "vehicleModel": "Camry"
    }
  }
}
```

**🔧 Test Different Car Recovery Services (ALL Dynamic Pricing):**

**Towing Services (Dynamic Pricing):**
- **Flatbed Towing:** `"vehicleType": "flatbed towing", "serviceCategory": "towing services"` (Base: 50 AED + 7.5/km + 25 AED convenience fee)
- **Wheel Lift Towing:** `"vehicleType": "wheel lift towing", "serviceCategory": "towing services"` (Base: 50 AED + 7.5/km + 25 AED convenience fee)

**Winching Services (Dynamic Pricing):**
- **On-Road Winching:** `"vehicleType": "on-road winching", "serviceCategory": "winching services"` (Base: 50 AED + 7.5/km + 50 AED convenience fee)
- **Off-Road Winching:** `"vehicleType": "off-road winching", "serviceCategory": "winching services"` (Base: 50 AED + 7.5/km + 50 AED convenience fee)

**Roadside Assistance (Dynamic Pricing):**
- **Battery Jump Start:** `"vehicleType": "battery jump start", "serviceCategory": "roadside assistance"` (Base: 50 AED + 7.5/km + 100 AED convenience fee)
- **Fuel Delivery:** `"vehicleType": "fuel delivery", "serviceCategory": "roadside assistance"` (Base: 50 AED + 7.5/km + 100 AED convenience fee)

**Specialized/Heavy Recovery (Dynamic Pricing):**
- **Luxury & Exotic Car Recovery:** `"vehicleType": "luxury & exotic car recovery", "serviceCategory": "specialized/heavy recovery"` (Base: 50 AED + 7.5/km + 75 AED convenience fee)
- **Heavy-Duty Vehicle Recovery:** `"vehicleType": "heavy-duty vehicle recovery", "serviceCategory": "specialized/heavy recovery"` (Base: 50 AED + 7.5/km + 75 AED convenience fee)

**Example Dynamic Pricing Requests:**

**1. Towing Services (Dynamic Pricing):**
```json
{
  "pickupLocation": { "coordinates": [55.2708, 25.2048], "address": "Dubai Mall" },
  "dropoffLocation": { "coordinates": [55.2744, 25.1972], "address": "Burj Khalifa" },
  "serviceType": "car recovery",
  "serviceCategory": "towing services",
  "vehicleType": "flatbed towing",
  "routeType": "one_way",
  "distanceInMeters": 8000,
  "startTime": "2024-01-15T14:30:00Z",
  "waitingMinutes": 0,
  "demandRatio": 1,
  "cityCode": "dubai",
  "serviceDetails": {
    "carRecovery": {
      "issueDescription": "Engine won't start",
      "urgencyLevel": "high",
      "vehicleMake": "Toyota",
      "vehicleModel": "Camry"
    }
  }
}
```

**2. Winching Services (Dynamic Pricing):**
```json
{
  "pickupLocation": { "coordinates": [55.2708, 25.2048], "address": "Dubai Mall" },
  "dropoffLocation": { "coordinates": [55.2744, 25.1972], "address": "Burj Khalifa" },
  "serviceType": "car recovery",
  "serviceCategory": "winching services",
  "vehicleType": "on-road winching",
  "routeType": "one_way",
  "distanceInMeters": 12000,
  "startTime": "2024-01-15T14:30:00Z",
  "waitingMinutes": 0,
  "demandRatio": 1,
  "cityCode": "dubai",
  "serviceDetails": {
    "carRecovery": {
      "issueDescription": "Car stuck in sand",
      "urgencyLevel": "high",
      "vehicleMake": "Toyota",
      "vehicleModel": "Land Cruiser"
    }
  }
}
```

**🔧 Test Dynamic Pricing Scenarios:**

**1. Winching Services (Dynamic Pricing - Changes with Distance, Helpers, etc.):**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Dubai Mall"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Burj Khalifa"
  },
  "serviceType": "car recovery",
  "serviceCategory": "winching services",
  "vehicleType": "on-road winching",
  "routeType": "one_way",
  "distanceInMeters": 12000,
  "waitingMinutes": 10,
  "demandRatio": 2.5,
  "startTime": "2024-01-15T23:30:00Z",
  "serviceDetails": {
    "carRecovery": {
      "issueDescription": "Car stuck in sand",
      "urgencyLevel": "high",
      "vehicleMake": "Toyota",
      "vehicleModel": "Land Cruiser"
    }
  }
}
```

**2. Roadside Assistance (Dynamic Pricing - Changes with Distance, Helpers, etc.):**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Dubai Mall"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Burj Khalifa"
  },
  "serviceType": "car recovery",
  "serviceCategory": "roadside assistance",
  "vehicleType": "battery jump start",
  "routeType": "one_way",
  "distanceInMeters": 8000,
  "waitingMinutes": 15,
  "demandRatio": 3.0,
  "startTime": "2024-01-15T23:30:00Z",
  "serviceDetails": {
    "carRecovery": {
      "issueDescription": "Battery dead",
      "urgencyLevel": "high",
      "vehicleMake": "Toyota",
      "vehicleModel": "Camry"
    }
  }
}
```

**🧪 Test Different Scenarios (ALL Services Dynamic):**

**Test 1: Towing Services - Change Distance (8km vs 12km)**
- **8km:** Should give ~94.5 AED
- **12km:** Should give ~152 AED

**Test 2: Towing Services - Add Waiting Time**
- **No waiting:** `"waitingMinutes": 0`
- **With waiting:** `"waitingMinutes": 15` (adds AED 20 max)

**Test 3: Towing Services - Night Charges**
- **Daytime:** `"startTime": "2024-01-15T14:30:00Z"`
- **Nighttime:** `"startTime": "2024-01-15T23:30:00Z"` (adds AED 10)

**Test 4: Towing Services - Surge Pricing**
- **Normal:** `"demandRatio": 1`
- **High demand:** `"demandRatio": 2.5` (1.5x multiplier)
- **Very high demand:** `"demandRatio": 3.0` (2.0x multiplier)

**Test 5: Different Service Categories**
- **Towing Services:** `"serviceCategory": "towing services"` (25 AED convenience fee)
- **Winching Services:** `"serviceCategory": "winching services"` (50 AED convenience fee)
- **Roadside Assistance:** `"serviceCategory": "roadside assistance"` (100 AED convenience fee)
- **Specialized/Heavy Recovery:** `"serviceCategory": "specialized/heavy recovery"` (75 AED convenience fee)

**✅ ALL Services Now Use Dynamic Pricing:**
All car recovery services now change with distance, waiting time, surge, night charges, etc.

---

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Authentication & Socket Connection](#authentication--socket-connection)
3. [Service Types & Request Data](#service-types--request-data)
4. [Complete Booking Flow](#complete-booking-flow)
5. [Real-Time Communication](#real-time-communication)
6. [API Reference](#api-reference)
7. [Integration Examples](#integration-examples)

---

## 🏗️ System Overview

This booking system supports **4 main service types** with both **REST APIs** for database operations and **Socket.IO** for real-time communication. **All vehicle types and categories match the vehicle registration system for consistency:**

### Service Types:
- 🚕 **Car Cab** (Economy, Premium, XL, Family, Luxury)
- 🏍️ **Bike** (Economy, Premium, VIP)
- 🚛 **Shifting & Movers** (Furniture moving, packing, loading)
- 🔧 **Car Recovery** (Towing, winching, jump start, fuel delivery)

### Architecture:
- **REST APIs**: Database operations, initial requests, data persistence
- **Socket.IO**: Real-time communication, instant notifications, live updates
- **Hybrid Approach**: Best of both worlds for optimal performance

---

## 🔐 Authentication & Socket Connection

### 1. User Authentication
```javascript
// Login to get JWT token
POST /api/user/login
{
  "email": "user@example.com",
  "password": "password123"
}

// Response
{
  "token": "jwt_token_here",
  "user": { /* user data */ }
}
```

### 2. Socket.IO Connection
```javascript
// Connect to Socket.IO with authentication
const socket = io('http://localhost:3001', {
  auth: {
    token: 'jwt_token_here' // From login response
  }
});

// Join user room for real-time notifications
socket.emit('join_user_room', userId);

// Join driver room (for drivers)
socket.emit('join_driver_room', driverId);
```

---

## 🎯 Service Types & Request Data

### 1. 🚕 Car Cab Service

#### **Complete Request Body:**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Dubai Mall, Dubai, UAE"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Burj Khalifa, Dubai, UAE"
  },
  "serviceType": "car cab",
  "serviceCategory": "transport",
  "vehicleType": "economy",
  "routeType": "one_way",
  "distanceInMeters": 2500,
  "passengerCount": 2,
  "wheelchairAccessible": false,
  "driverPreference": "nearby",
  "pinnedDriverId": null,
  "pinkCaptainOptions": {
    "femalePassengersOnly": false,
    "familyRides": false,
    "safeZoneRides": false,
    "familyWithGuardianMale": false,
    "maleWithoutFemale": false,
    "noMaleCompanion": false
  },
  "paymentMethod": "cash",
  "scheduledTime": null,
  "driverFilters": {
    "vehicleModel": null,
    "specificDriverId": null,
    "searchRadius": 10
  },
  "serviceOptions": {
    "airConditioning": true,
    "music": false,
    "wifi": false,
    "childSeat": false,
    "petFriendly": false,
    "wheelchairAccessible": false,
    "premiumFeatures": {
      "leatherSeats": false,
      "climateControl": false,
      "entertainmentSystem": false
    }
  },
  "extras": [
    { "name": "Child Seat", "count": 1, "price": 15 },
    { "name": "Pet Carrier", "count": 1, "price": 10 }
  ]
}
```

#### **Minimal Request Body:**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Dubai Mall, Dubai, UAE"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Burj Khalifa, Dubai, UAE"
  },
  "serviceType": "car cab",
  "vehicleType": "economy",
  "distanceInMeters": 2500,
  "passengerCount": 2,
  "paymentMethod": "cash"
}
```

#### **Vehicle Types Available:**
- `economy` - Standard sedan
- `premium` - Luxury sedan
- `xl` - Large vehicle (6-7 passengers)
- `family` - Family vehicle with child seats
- `luxury` - High-end luxury vehicle

### 2. 🏍️ Bike Service

#### **Complete Request Body:**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Dubai Mall, Dubai, UAE"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Burj Khalifa, Dubai, UAE"
  },
  "serviceType": "bike",
  "serviceCategory": "transport",
  "vehicleType": "economy",
  "routeType": "one_way",
  "distanceInMeters": 1500,
  "passengerCount": 1,
  "driverPreference": "nearby",
  "pinnedDriverId": null,
  "pinkCaptainOptions": {
    "femalePassengersOnly": false,
    "familyRides": false,
    "safeZoneRides": false,
    "familyWithGuardianMale": false,
    "maleWithoutFemale": false,
    "noMaleCompanion": false
  },
  "paymentMethod": "cash",
  "scheduledTime": null,
  "driverFilters": {
    "vehicleModel": null,
    "specificDriverId": null,
    "searchRadius": 10
  },
  "serviceOptions": {
    "helmet": true,
    "rainCover": false,
    "extraHelmet": false,
    "baggageCarrier": false,
    "safetyGear": {
      "reflectiveVest": false,
      "kneePads": false,
      "elbowPads": false
    }
  },
  "extras": [
    { "name": "Extra Helmet", "count": 1, "price": 5 },
    { "name": "Baggage Carrier", "count": 1, "price": 8 }
  ]
}
```

#### **Minimal Request Body:**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Dubai Mall, Dubai, UAE"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Burj Khalifa, Dubai, UAE"
  },
  "serviceType": "bike",
  "vehicleType": "economy",
  "distanceInMeters": 1500,
  "passengerCount": 1,
  "paymentMethod": "cash"
}
```

#### **Bike Types Available:**
- `economy` - Standard motorcycle
- `premium` - Premium motorcycle with experienced rider
- `vip` - High-end motorcycle for exclusive experience

### 3. 🚛 Shifting & Movers Service

#### **Complete Request Body:**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Apartment 123, Building A, Dubai"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Villa 456, Palm Jumeirah, Dubai"
  },
  "serviceType": "shifting & movers",
  "serviceCategory": "logistics",
  "vehicleType": "small van",
  "routeType": "one_way",
  "distanceInMeters": 15000,
  "passengerCount": 0,
  "furnitureDetails": {
    "sofa": 2,
    "bed": 1,
    "dining_table": 3,
    "tv": 2,
    "wardrobe": 2,
    "fridge": 1,
    "washing_machine": 1,
    "ac": 1,
    "other": 5
  },
  "serviceDetails": {
    "shiftingMovers": {
      "selectedServices": {
        "loadingUnloading": true,
        "packing": false,
        "fixing": true,
        "helpers": true,
        "wheelchairHelper": false
      },
      "pickupFloorDetails": {
        "floor": 5,
        "hasLift": true,
        "accessType": "lift"
      },
      "dropoffFloorDetails": {
        "floor": 0,
        "hasLift": false,
        "accessType": "ground"
      },
      "extras": [
        { "name": "Packing Material", "count": 5 },
        { "name": "Extra Helper", "count": 1 },
        { "name": "Furniture Assembly", "count": 1 }
      ]
    }
  },
  "itemDetails": [
    { "name": "Sofa", "count": 2, "weight": 50, "dimensions": "2x1x0.8m" },
    { "name": "Bed Frame", "count": 1, "weight": 30, "dimensions": "1.8x1.5x0.3m" }
  ],
  "driverPreference": "nearby",
  "pinnedDriverId": null,
  "pinkCaptainOptions": {
    "femalePassengersOnly": false,
    "familyRides": false,
    "safeZoneRides": false,
    "familyWithGuardianMale": false,
    "maleWithoutFemale": false,
    "noMaleCompanion": false
  },
  "paymentMethod": "card",
  "scheduledTime": null,
  "driverFilters": {
    "vehicleModel": null,
    "specificDriverId": null,
    "searchRadius": 15
  },
  "serviceOptions": {
    "insurance": true,
    "packingMaterial": true,
    "assembly": false,
    "disassembly": false,
    "cleaning": false,
    "protectiveCovering": true,
    "specializedHandling": {
      "fragileItems": false,
      "antiques": false,
      "pianos": false,
      "artwork": false
    }
  },
  "extras": [
    { "name": "Packing Material", "count": 5, "price": 50 },
    { "name": "Extra Helper", "count": 1, "price": 100 },
    { "name": "Furniture Assembly", "count": 1, "price": 75 }
  ]
}
```

#### **Minimal Request Body:**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Apartment 123, Building A, Dubai"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Villa 456, Palm Jumeirah, Dubai"
  },
  "serviceType": "shifting & movers",
  "vehicleType": "small van",
  "distanceInMeters": 15000,
  "furnitureDetails": {
    "sofa": 1
  },
  "serviceDetails": {
    "shiftingMovers": {
      "selectedServices": {
        "loadingUnloading": true
      }
    }
  }
}
```

#### **Service Categories & Vehicle Types:**

**Small Mover:**
- `mini pickup` - Small pickup truck (40 AED base + 12 AED/km)
- `suzuki carry` - Suzuki carry van (45 AED base + 13 AED/km)
- `small van` - Small moving van (50 AED base + 15 AED/km)

**Medium Mover:**
- `medium truck` - Medium-sized truck (80 AED base + 18 AED/km)
- `mazda` - Mazda truck (85 AED base + 19 AED/km)
- `covered van` - Covered moving van (100 AED base + 20 AED/km)

**Heavy Mover:**
- `large truck` - Large moving truck (150 AED base + 25 AED/km)
- `6-wheeler` - 6-wheel truck (180 AED base + 28 AED/km)
- `container truck` - Container truck (200 AED base + 30 AED/km)

#### **Furniture Items Available:**
- `sofa`, `bed`, `dining_table`, `wardrobe`
- `fridge`, `washing_machine`, `tv`, `ac`
- `other` (custom items)

### 4. 🔧 Car Recovery Service

> **✅ Tested Successfully:** 
> - **Dynamic Pricing:** ALL car recovery services now use dynamic pricing that changes with distance, waiting time, surge, night charges, etc.
> - **Towing Services:** 8km = 94.5 AED, 12km with waiting/surge/night = 202.13 AED
> - **Winching Services:** 8km = 152.25 AED, 12km with waiting/surge/night = 228+ AED
> - **Roadside Assistance:** 8km = 183+ AED, 12km with waiting/surge/night = 283+ AED
> - **Specialized/Heavy Recovery:** 8km = 147 AED, varies with distance and conditions

**Available Service Categories:**
- `towing services` - Flatbed towing, Wheel lift towing (Dynamic pricing: 94.5+ AED)
- `winching services` - On-road winching, Off-road winching (Dynamic pricing: 152+ AED)
- `roadside assistance` - Battery jump start, Fuel delivery (Dynamic pricing: 183+ AED)
- `specialized/heavy recovery` - Luxury & exotic car recovery, Accident & collision recovery, Heavy-duty vehicle recovery, Basement pull-out (Dynamic pricing: 147+ AED)

**📋 Dynamic Pricing Structure (ALL Car Recovery Services):**

1. **Base Fare:** AED 50 for first 6 km
2. **Per KM Rate:** AED 7.5 per km after 6 km
3. **Minimum Fare:** AED 50 (even for trips < 6 km)
4. **Platform Fee:** 15% (7.5% driver, 7.5% customer)
5. **Night Charges:** AED 10 (22:00-06:00)
6. **Surge Pricing:** 1.5x (demand 2x) or 2.0x (demand 3x)
7. **City-wise Pricing:** AED 5/km for trips >10 km in specific cities
8. **Waiting Charges:** Free 5 min, then AED 2/min (max AED 20)
9. **Convenience Fee:** 
   - AED 25 (towing services)
   - AED 50 (winching services) 
   - AED 100 (roadside assistance)
   - AED 75 (specialized/heavy recovery)
10. **VAT:** 5% on total fare
11. **Refreshment Alert:** For rides >20 km or >30 minutes
12. **Free Stay:** 0.5 min/km for round trips (max 30 min)

#### **Complete Request Body:**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Sheikh Zayed Road, Dubai"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Dubai Auto Service Center"
  },
  "serviceType": "car recovery",
  "serviceCategory": "towing services",
  "vehicleType": "flatbed towing",
  "routeType": "one_way",
  "distanceInMeters": 8000,
  "passengerCount": 0,
  "serviceDetails": {
    "carRecovery": {
      "issueDescription": "Engine won't start, battery seems dead",
      "urgencyLevel": "high",
      "needHelper": false,
      "wheelchairHelper": false,
      "vehicleMake": "Toyota",
      "vehicleModel": "Camry",
      "vehicleYear": "2020",
      "licensePlate": "ABC-1234",
      "vehicleColor": "White",
      "vehicleType": "Sedan",
      "isLuxury": false,
      "isHeavyDuty": false,
      "hasTrailer": false,
      "trailerDetails": null,
      "chassisNumber": "ABC123456789",
      "registrationExpiryDate": "2025-12-31",
      "companyName": "Toyota Motors",
      "vehicleOwnerName": "John Doe"
    }
  },
  "itemDetails": [],
  "driverPreference": "nearby",
  "pinnedDriverId": null,
  "pinkCaptainOptions": {
    "femalePassengersOnly": false,
    "familyRides": false,
    "safeZoneRides": false,
    "familyWithGuardianMale": false,
    "maleWithoutFemale": false,
    "noMaleCompanion": false
  },
  "paymentMethod": "cash",
  "scheduledTime": null,
  "driverFilters": {
    "vehicleModel": null,
    "specificDriverId": null,
    "searchRadius": 20
  },
  "serviceOptions": {
    "emergencyService": true,
    "insurance": true,
    "roadsideAssistance": true,
    "fuelDelivery": false,
    "batteryJumpStart": false,
    "tireChange": false,
    "lockoutService": false,
    "winchingService": false,
    "specializedRecovery": {
      "luxuryVehicles": false,
      "heavyDutyVehicles": false,
      "motorcycles": false,
      "boats": false
    }
  },
  "extras": [
    { "name": "Fuel Delivery", "count": 1, "price": 25 },
    { "name": "Battery Jump Start", "count": 1, "price": 30 },
    { "name": "Tire Change", "count": 1, "price": 40 }
  ]
}
```

#### **Minimal Request Body:**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Sheikh Zayed Road, Dubai"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Dubai Auto Service Center"
  },
  "serviceType": "car recovery",
  "serviceCategory": "towing services",
  "vehicleType": "flatbed towing",
  "distanceInMeters": 8000,
  "serviceDetails": {
    "carRecovery": {
      "issueDescription": "Engine won't start",
      "urgencyLevel": "high",
      "vehicleMake": "Toyota",
      "vehicleModel": "Camry"
    }
  }
}
```

#### **Service Categories & Vehicle Types:**

**Towing Services (Standard Pricing):**
- `flatbed towing` - Flatbed tow truck (safest for all vehicles)
- `wheel lift towing` - Wheel lift tow truck (quick & efficient)

**Winching Services (Comprehensive Pricing):**
- `on-road winching` - On-road winching service (roadside recovery)
- `off-road winching` - Off-road winching service (sand/mud recovery)

**Roadside Assistance (Comprehensive Pricing):**
- `battery jump start` - Battery jump start service
- `fuel delivery` - Fuel delivery service

**Specialized/Heavy Recovery (Standard Pricing):**
- `luxury & exotic car recovery` - Luxury car recovery
- `accident & collision recovery` - Accident recovery
- `heavy-duty vehicle recovery` - Heavy vehicle recovery
- `basement pull-out` - Basement parking recovery

#### **📊 Comprehensive Pricing Breakdown Example:**

**Scenario:** 12 km winching service (on-road winching)
```json
{
  "distance": 12,
  "serviceCategory": "winching services",
  "vehicleType": "on-road winching",
  "startTime": "2024-01-15T14:30:00Z",
  "waitingMinutes": 0,
  "demandRatio": 1,
  "cityCode": "dubai"
}
```

**Pricing Breakdown:**
1. **Base Fare:** AED 50 (first 6 km)
2. **Distance Fare:** (12 - 6) × AED 7.5 = AED 45
3. **Subtotal:** AED 50 + AED 45 = AED 95
4. **Convenience Fee:** AED 50 (winching services)
5. **Night Charges:** AED 0 (daytime service)
6. **Surge Charges:** AED 0 (normal demand)
7. **City Charges:** AED 0 (within city limits)
8. **Waiting Charges:** AED 0 (no waiting)
9. **Subtotal Before VAT:** AED 95 + AED 50 = AED 145
10. **VAT (5%):** AED 145 × 0.05 = AED 7.25
11. **Platform Fee (15%):** AED 95 × 0.15 = AED 14.25
12. **Total Fare:** AED 145 + AED 7.25 = **AED 152.25**

**Driver Earnings:** AED 95 - AED 14.25 = **AED 80.75**
**Platform Share:** AED 14.25 (7.5% customer + 7.5% driver)

#### **Urgency Levels:**
- `low` - Non-urgent service
- `medium` - Moderate urgency
- `high` - High urgency
- `emergency` - Emergency service

#### **🔄 Refreshment Alert System:**
- **Trigger:** Rides >20 km OR >30 minutes
- **Driver Options:**
  - **Continue** - No overtime charges
  - **Start Overtime Charges** - Begin charging customer
- **Overtime Charges:** AED 1 per 5 minutes (max 30 minutes)
- **Failsafe:** No automatic charging without driver consent

#### **❌ Cancellation Logic:**
- **Before driver arrival:** AED 2 (if rider crossed 25% of driver's distance)
- **Driver covered ≥50%:** AED 5
- **After driver arrived:** AED 10

#### **🌙 Night Charges:**
- **Time:** 22:00–06:00
- **Charge:** AED 10 OR 1.25x multiplier (admin configurable)

#### **📈 Surge Pricing:**
- **1.5x:** When demand = 2x available cars
- **2.0x:** When demand = 3x available cars
- **Admin Control:** No Surge / 1.5x / 2.0x options

---

## 🔄 Complete Booking Flow - Two-Sided Implementation

### 👥 **User Side (Requesting Service)**
### 🚗 **Driver Side (Listening for Requests)**

---

### Step 1: Initial Setup & Connection

#### 👥 **User Side Setup**
```javascript
// 1. User Authentication
const userToken = await loginUser(email, password);

// 2. Connect to Socket.IO
const userSocket = io('http://localhost:3001', {
  auth: { token: userToken }
});

// 3. Join user room
userSocket.emit('join_user_room', userId);

// 4. Setup user event listeners
userSocket.on('booking_accepted', (data) => {
  console.log('Driver accepted booking:', data);
  showDriverInfo(data.driver);
});

userSocket.on('booking_rejected', (data) => {
  console.log('Driver rejected booking:', data);
  showRejectionMessage(data.reason);
});

userSocket.on('fare_modification_request', (data) => {
  console.log('Driver wants to modify fare:', data);
  showFareModificationDialog(data);
});

userSocket.on('ride_started', (data) => {
  console.log('Ride started:', data);
  showRideStarted();
});

userSocket.on('driver_location_update', (data) => {
  console.log('Driver location updated:', data);
  updateDriverLocationOnMap(data.driverLocation);
});

userSocket.on('message_received', (data) => {
  console.log('Message from driver:', data);
  showMessage(data.message);
});

userSocket.on('ride_completed', (data) => {
  console.log('Ride completed:', data);
  showRideCompleted(data.receipt);
});

// 5. Handle disconnection
userSocket.on('disconnect', () => {
  console.log('User disconnected');
  showReconnectionDialog();
});

userSocket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  handleConnectionError();
});
```

#### 🚗 **Driver Side Setup**
```javascript
// 1. Driver Authentication
const driverToken = await loginDriver(email, password);

// 2. Connect to Socket.IO
const driverSocket = io('http://localhost:3001', {
  auth: { token: driverToken }
});

// 3. Join driver room
driverSocket.emit('join_driver_room', driverId);

// 4. Go online and set status
driverSocket.emit('driver_status_update', {
  isActive: true,
  currentLocation: {
    coordinates: [55.2708, 25.2048],
    address: "Current location"
  }
});

// 5. Setup driver event listeners
driverSocket.on('new_booking_request', (data) => {
  console.log('New booking request received:', data);
  showBookingRequest(data);
});

driverSocket.on('booking_accepted_confirmation', (data) => {
  console.log('Booking accepted successfully:', data);
  showAcceptedBooking(data);
});

driverSocket.on('fare_modification_response', (data) => {
  console.log('User responded to fare modification:', data);
  showFareResponse(data);
});

driverSocket.on('ride_started', (data) => {
  console.log('Ride started:', data);
  showRideStarted(data);
});

driverSocket.on('user_location_update', (data) => {
  console.log('User location updated:', data);
  updateUserLocationOnMap(data.userLocation);
});

driverSocket.on('ride_message', (data) => {
  console.log('Message from user:', data);
  showMessage(data.message);
});

driverSocket.on('ride_completed', (data) => {
  console.log('Ride completed:', data);
  showRideCompleted(data.receipt);
});

driverSocket.on('booking_cancelled', (data) => {
  console.log('Booking cancelled by user:', data);
  showBookingCancelled(data);
});

// 6. Handle disconnection
driverSocket.on('disconnect', () => {
  console.log('Driver disconnected');
  // Automatically go offline when disconnected
  updateDriverStatus(false);
  showReconnectionDialog();
});

driverSocket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  handleConnectionError();
});

// 7. Setup auto-reconnection
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

driverSocket.on('disconnect', () => {
  if (reconnectAttempts < maxReconnectAttempts) {
    setTimeout(() => {
      reconnectAttempts++;
      driverSocket.connect();
    }, 1000 * reconnectAttempts); // Exponential backoff
  }
});

driverSocket.on('connect', () => {
  reconnectAttempts = 0;
  // Re-join room and restore status
  driverSocket.emit('join_driver_room', driverId);
  driverSocket.emit('driver_status_update', {
    isActive: true,
    currentLocation: getCurrentLocation()
  });
});
```

### Step 2: Fare Estimation (REST API)
```javascript
// Get fare estimation before booking
POST /api/fare/estimate
{
  "pickupLocation": { /* location data */ },
  "dropoffLocation": { /* location data */ },
  "serviceType": "car cab",
  "vehicleType": "economy",
  "distanceInMeters": 2500,
  "routeType": "one_way",
  "serviceDetails": { /* service specific details */ }
}

// Response
{
  "estimatedFare": 45.50,
  "fareBreakdown": {
    "baseFare": 10,
    "distanceFare": 35.50,
    "serviceCharges": 0
  },
  "estimatedDuration": 15, // minutes
  "currency": "AED"
}
```

### Step 2: User Adjusts Fare (Optional)
```javascript
// User can increase/decrease fare within admin limits
POST /api/bookings/raise-fare/:bookingId
{
  "newFare": 50.00,
  "reason": "Need urgent pickup"
}

// Or decrease fare
POST /api/bookings/lower-fare/:bookingId
{
  "newFare": 40.00,
  "reason": "Flexible timing"
}
```

### Step 3: Create Booking (REST API + Socket.IO)

#### 👥 **User Side - Create Booking**
```javascript
// 1. Create booking via REST API
const createBookingResponse = await fetch('/api/bookings/create-booking', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${userToken}`
  },
  body: JSON.stringify({
    pickupLocation: {
      coordinates: [55.2708, 25.2048],
      address: "Dubai Mall, Dubai, UAE"
    },
    dropoffLocation: {
      coordinates: [55.2744, 25.1972],
      address: "Burj Khalifa, Dubai, UAE"
    },
    serviceType: "car cab",
    serviceCategory: "transport",
    vehicleType: "economy",
    routeType: "one_way",
    distanceInMeters: 2500,
    passengerCount: 2,
    driverPreference: "nearby",
    pinkCaptainOptions: {
      femalePassengersOnly: false,
      familyRides: false,
      safeZoneRides: false,
      familyWithGuardianMale: false,
      maleWithoutFemale: false,
      noMaleCompanion: false
    },
    paymentMethod: "cash",
    scheduledTime: null,
    driverFilters: {
      vehicleModel: null,
      specificDriverId: null,
      searchRadius: 10
    },
    serviceOptions: {
      airConditioning: true,
      music: false,
      wifi: false
    },
    extras: []
  })
});

const bookingResult = await createBookingResponse.json();
console.log('Booking created:', bookingResult);

// 2. User receives confirmation that booking is being processed
userSocket.on('booking_request_created', (data) => {
  console.log('Booking request created:', data);
  showSearchingForDrivers(data.driversFound);
});
```

#### 🚗 **Driver Side - Receives Booking Request**
```javascript
// Driver automatically receives booking request via Socket.IO
driverSocket.on('new_booking_request', (data) => {
  console.log('New booking request received:', data);
  
  // Show booking request UI
  showBookingRequest({
    requestId: data.requestId,
    user: data.user,
    from: data.from,
    to: data.to,
    fare: data.fare,
    distance: data.distance,
    serviceType: data.serviceType,
    vehicleType: data.vehicleType,
    driverDistance: data.driverDistance,
    estimatedDuration: data.estimatedDuration
  });
  
  // Start countdown timer for response
  startResponseTimer(data.requestId, 30); // 30 seconds to respond
});

// Driver can accept the booking
function acceptBooking(requestId) {
  driverSocket.emit('accept_booking_request', {
    requestId: requestId
  });
  
  // Show loading state
  showAcceptingBooking();
}

// Driver can reject the booking
function rejectBooking(requestId, reason) {
  driverSocket.emit('reject_booking_request', {
    requestId: requestId,
    reason: reason || 'No reason provided'
  });
  
  // Hide booking request
  hideBookingRequest();
}
```

### Step 4: Driver Response & User Notification

#### 🚗 **Driver Side - Accept/Reject Booking**
```javascript
// Driver accepts booking
function acceptBooking(requestId) {
  driverSocket.emit('accept_booking_request', {
    requestId: requestId
  });
  
  // Show accepting state
  showAcceptingBooking();
  
  // Wait for confirmation
  driverSocket.once('booking_accepted_confirmation', (data) => {
    console.log('Booking accepted successfully:', data);
    showAcceptedBooking(data);
    
    // Start navigation to pickup location
    startNavigationToPickup(data.user);
  });
}

// Driver rejects booking
function rejectBooking(requestId, reason) {
  driverSocket.emit('reject_booking_request', {
    requestId: requestId,
    reason: reason || 'No reason provided'
  });
  
  // Wait for confirmation
  driverSocket.once('booking_rejected_confirmation', (data) => {
    console.log('Booking rejected successfully:', data);
    hideBookingRequest();
    
    // Continue listening for new requests
    continueListeningForRequests();
  });
}

// Handle auto-accept settings
function setupAutoAccept() {
  driverSocket.emit('update_auto_accept_settings', {
    enabled: true,
    maxDistance: 5, // km
    minFare: 20, // minimum fare to auto-accept
    serviceTypes: ['car cab', 'bike']
  });
}
```

#### 👥 **User Side - Receives Driver Response**
```javascript
// User receives acceptance notification
userSocket.on('booking_accepted', (data) => {
  console.log('Booking accepted by driver:', data);
  
  // Show driver information
  showDriverInfo({
    id: data.driver.id,
    name: data.driver.name,
    phone: data.driver.phone,
    email: data.driver.email,
    vehicle: data.driver.vehicle,
    rating: data.driver.rating,
    eta: data.eta
  });
  
  // Start tracking driver location
  startDriverTracking(data.bookingId);
  
  // Show contact options
  showContactOptions(data.driver);
});

// User receives rejection notification
userSocket.on('booking_rejected', (data) => {
  console.log('Booking rejected:', data);
  
  // Show rejection message
  showRejectionMessage(data.reason);
  
  // Continue searching for other drivers
  continueSearchingForDrivers();
});

// Handle multiple rejections
let rejectionCount = 0;
const maxRejections = 5;

userSocket.on('booking_rejected', (data) => {
  rejectionCount++;
  
  if (rejectionCount >= maxRejections) {
    showNoDriversAvailable();
    // Option to increase fare and resend
    showIncreaseFareOption();
  } else {
    showRejectionMessage(`Driver rejected. Still searching... (${rejectionCount}/${maxRejections})`);
  }
});
```

### Step 6: Fare Negotiation (Optional - Socket.IO)
```javascript
// Driver can modify fare
socket.emit('modify_booking_fare', {
  requestId: 'booking_123',
  newFare: 55.00,
  reason: 'Traffic conditions'
});

// User receives fare modification request
socket.on('fare_modification_request', (data) => {
  console.log('Driver wants to modify fare:', data);
});

// User responds to fare modification
socket.emit('respond_to_fare_modification', {
  bookingId: 'booking_123',
  response: 'accept', // or 'reject'
  reason: 'Fair price for current conditions'
});
```

### Step 7: Start Ride (REST API + Socket.IO)
```javascript
// Driver starts the ride
POST /api/bookings/:bookingId/start
{
  "startLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Current location"
  }
}

// Or via Socket.IO
socket.emit('start_ride', {
  bookingId: 'booking_123'
});

// Both user and driver receive real-time notifications
socket.on('ride_started', (data) => {
  console.log('Ride has started:', data);
});
```

### Step 8: Real-Time Communication (Socket.IO)
```javascript
// Send messages during ride
socket.emit('send_message', {
  bookingId: 'booking_123',
  message: 'I\'m 5 minutes away',
  messageType: 'text'
});

// Send location
socket.emit('send_message', {
  bookingId: 'booking_123',
  message: 'My current location',
  messageType: 'location',
  location: {
    coordinates: [55.2708, 25.2048]
  }
});

// Receive messages
socket.on('message_received', (data) => {
  console.log('New message:', data);
});

// Location updates
socket.emit('driver_location_update', {
  coordinates: [55.2708, 25.2048],
  heading: 90,
  speed: 25
});

socket.on('driver_location_update', (data) => {
  console.log('Driver location updated:', data);
});
```

### Step 9: Complete Ride (REST API + Socket.IO)
```javascript
// Driver completes the ride
POST /api/bookings/:bookingId/complete
{
  "finalLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Destination reached"
  },
  "actualDistance": 2.8,
  "actualDuration": 18
}

// Or via Socket.IO
socket.emit('complete_ride', {
  bookingId: 'booking_123',
  finalLocation: { /* location data */ },
  actualDistance: 2.8,
  actualDuration: 18
});

// Both parties receive completion notification
socket.on('ride_completed', (data) => {
  console.log('Ride completed:', data);
});
```

### Step 10: Rating & Receipt (REST API)
```javascript
// Submit rating
POST /api/bookings/:bookingId/rating
{
  "targetUserId": "driver_id_here",
  "rating": 5,
  "review": "Excellent service, very professional driver"
}

// Get receipt
GET /api/bookings/:bookingId/receipt

// Response
{
  "receipt": {
    "receiptNumber": "RCPT-2024-001",
    "bookingDetails": { /* booking info */ },
    "rideDetails": { /* ride info */ },
    "fareDetails": { /* fare breakdown */ },
    "userDetails": { /* user info */ },
    "driverDetails": { /* driver info */ }
  }
}
```

### Step 11: Special Case - No Drivers Accept (Socket.IO)

#### 👥 **User Side - Increase Fare & Resend**
```javascript
// If no drivers accept, user can increase fare and resend
userSocket.emit('increase_fare_and_resend', {
  bookingId: 'booking_123',
  newFare: 65.00,
  reason: 'No drivers responding, increasing fare'
});

// User receives confirmation of fare increase and resend
userSocket.on('fare_increased_and_resent', (data) => {
  console.log('Fare increased and request resent:', data);
  showFareIncreasedMessage(data);
  
  // Reset rejection count
  rejectionCount = 0;
  
  // Continue waiting for driver response
  showSearchingForDrivers(data.driversFound);
});
```

#### 🚗 **Driver Side - Receives Updated Request**
```javascript
// Driver receives updated booking request with increased fare
driverSocket.on('new_booking_request', (data) => {
  if (data.fareIncreased) {
    console.log('Updated booking request with increased fare:', data);
    showUpdatedBookingRequest({
      ...data,
      originalFare: data.originalFare,
      increasedFare: data.fare,
      resendAttempt: data.resendAttempt
    });
  }
});
```

### Step 12: Disconnection Handling & Reconnection

#### 🔌 **Connection Management**
```javascript
// Both User and Driver Side
class ConnectionManager {
  constructor(socket, userId, userType) {
    this.socket = socket;
    this.userId = userId;
    this.userType = userType; // 'user' or 'driver'
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.isReconnecting = false;
    
    this.setupConnectionHandlers();
  }
  
  setupConnectionHandlers() {
    // Handle disconnection
    this.socket.on('disconnect', (reason) => {
      console.log(`${this.userType} disconnected:`, reason);
      this.handleDisconnection(reason);
    });
    
    // Handle connection errors
    this.socket.on('connect_error', (error) => {
      console.error(`${this.userType} connection error:`, error);
      this.handleConnectionError(error);
    });
    
    // Handle successful reconnection
    this.socket.on('connect', () => {
      console.log(`${this.userType} reconnected successfully`);
      this.handleReconnection();
    });
  }
  
  handleDisconnection(reason) {
    // Show disconnection message
    this.showDisconnectionMessage(reason);
    
    // Attempt reconnection if not manual disconnect
    if (reason !== 'io client disconnect' && !this.isReconnecting) {
      this.attemptReconnection();
    }
  }
  
  handleConnectionError(error) {
    // Show connection error
    this.showConnectionError(error);
    
    // Attempt reconnection
    if (!this.isReconnecting) {
      this.attemptReconnection();
    }
  }
  
  attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.showMaxReconnectAttemptsReached();
      return;
    }
    
    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    // Exponential backoff
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    setTimeout(() => {
      console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      this.socket.connect();
    }, delay);
  }
  
  handleReconnection() {
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    
    // Re-authenticate and restore state
    this.restoreConnectionState();
  }
  
  restoreConnectionState() {
    // Re-join appropriate room
    if (this.userType === 'user') {
      this.socket.emit('join_user_room', this.userId);
    } else {
      this.socket.emit('join_driver_room', this.userId);
      // Restore driver status
      this.socket.emit('driver_status_update', {
        isActive: true,
        currentLocation: this.getCurrentLocation()
      });
    }
    
    // Show reconnection success
    this.showReconnectionSuccess();
  }
  
  showDisconnectionMessage(reason) {
    // Show appropriate disconnection message
    if (this.userType === 'user') {
      showUserDisconnectionMessage(reason);
    } else {
      showDriverDisconnectionMessage(reason);
    }
  }
  
  showConnectionError(error) {
    // Show connection error message
    showConnectionErrorMessage(error);
  }
  
  showReconnectionSuccess() {
    // Show reconnection success message
    showReconnectionSuccessMessage();
  }
  
  showMaxReconnectAttemptsReached() {
    // Show max reconnection attempts reached
    showMaxReconnectAttemptsMessage();
  }
  
  getCurrentLocation() {
    // Get current location from GPS or stored location
    return {
      coordinates: [55.2708, 25.2048],
      address: "Current location"
    };
  }
}

// Usage for User
const userConnectionManager = new ConnectionManager(userSocket, userId, 'user');

// Usage for Driver
const driverConnectionManager = new ConnectionManager(driverSocket, driverId, 'driver');
```

#### 🚨 **Emergency Disconnection Handling**
```javascript
// Handle emergency scenarios
class EmergencyHandler {
  constructor(socket, userType) {
    this.socket = socket;
    this.userType = userType;
    this.activeBooking = null;
    
    this.setupEmergencyHandlers();
  }
  
  setupEmergencyHandlers() {
    // Handle app going to background
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.handleAppBackground();
      } else {
        this.handleAppForeground();
      }
    });
    
    // Handle network changes
    window.addEventListener('online', () => {
      this.handleNetworkOnline();
    });
    
    window.addEventListener('offline', () => {
      this.handleNetworkOffline();
    });
    
    // Handle page unload
    window.addEventListener('beforeunload', () => {
      this.handlePageUnload();
    });
  }
  
  handleAppBackground() {
    if (this.userType === 'driver' && this.activeBooking) {
      // Driver should stay connected for active bookings
      console.log('Driver app in background - maintaining connection for active booking');
    } else {
      // User can disconnect if no active booking
      console.log('User app in background');
    }
  }
  
  handleAppForeground() {
    console.log('App returned to foreground');
    // Restore connection if needed
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }
  
  handleNetworkOnline() {
    console.log('Network online');
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }
  
  handleNetworkOffline() {
    console.log('Network offline');
    // Show offline message
    showOfflineMessage();
  }
  
  handlePageUnload() {
    // Clean up before page unload
    if (this.userType === 'driver') {
      // Driver goes offline
      this.socket.emit('driver_status_update', {
        isActive: false
      });
    }
  }
  
  setActiveBooking(booking) {
    this.activeBooking = booking;
  }
}

// Usage
const userEmergencyHandler = new EmergencyHandler(userSocket, 'user');
const driverEmergencyHandler = new EmergencyHandler(driverSocket, 'driver');
```

---

## 📋 **Complete Request Bodies Reference**

### **🚕 Car Cab Service Request**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Dubai Mall, Dubai, UAE"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Burj Khalifa, Dubai, UAE"
  },
  "serviceType": "car cab",
  "serviceCategory": "transport",
  "vehicleType": "economy",
  "routeType": "one_way",
  "distanceInMeters": 2500,
  "passengerCount": 2,
  "wheelchairAccessible": false,
  "driverPreference": "nearby",
  "pinnedDriverId": null,
  "pinkCaptainOptions": {
    "femalePassengersOnly": false,
    "familyRides": false,
    "safeZoneRides": false,
    "familyWithGuardianMale": false,
    "maleWithoutFemale": false,
    "noMaleCompanion": false
  },
  "paymentMethod": "cash",
  "scheduledTime": null,
  "driverFilters": {
    "vehicleModel": null,
    "specificDriverId": null,
    "searchRadius": 10
  },
  "serviceOptions": {
    "airConditioning": true,
    "music": false,
    "wifi": false,
    "childSeat": false,
    "petFriendly": false,
    "wheelchairAccessible": false,
    "premiumFeatures": {
      "leatherSeats": false,
      "climateControl": false,
      "entertainmentSystem": false
    }
  },
  "extras": [
    { "name": "Child Seat", "count": 1, "price": 15 },
    { "name": "Pet Carrier", "count": 1, "price": 10 }
  ]
}
```

### **🏍️ Bike Service Request**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Dubai Mall, Dubai, UAE"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Burj Khalifa, Dubai, UAE"
  },
  "serviceType": "bike",
  "serviceCategory": "transport",
  "vehicleType": "economy",
  "routeType": "one_way",
  "distanceInMeters": 1500,
  "passengerCount": 1,
  "driverPreference": "nearby",
  "pinnedDriverId": null,
  "pinkCaptainOptions": {
    "femalePassengersOnly": false,
    "familyRides": false,
    "safeZoneRides": false,
    "familyWithGuardianMale": false,
    "maleWithoutFemale": false,
    "noMaleCompanion": false
  },
  "paymentMethod": "cash",
  "scheduledTime": null,
  "driverFilters": {
    "vehicleModel": null,
    "specificDriverId": null,
    "searchRadius": 10
  },
  "serviceOptions": {
    "helmet": true,
    "rainCover": false,
    "extraHelmet": false,
    "baggageCarrier": false,
    "safetyGear": {
      "reflectiveVest": false,
      "kneePads": false,
      "elbowPads": false
    }
  },
  "extras": [
    { "name": "Extra Helmet", "count": 1, "price": 5 },
    { "name": "Baggage Carrier", "count": 1, "price": 8 }
  ]
}
```

### **🚛 Shifting & Movers Service Request**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Apartment 123, Building A, Dubai"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Villa 456, Palm Jumeirah, Dubai"
  },
  "serviceType": "shifting & movers",
  "serviceCategory": "logistics",
  "vehicleType": "small van",
  "routeType": "one_way",
  "distanceInMeters": 15000,
  "passengerCount": 0,
  "furnitureDetails": {
    "sofa": 2,
    "bed": 1,
    "dining_table": 3,
    "tv": 2,
    "wardrobe": 2,
    "fridge": 1,
    "washing_machine": 1,
    "ac": 1,
    "other": 5
  },
  "serviceDetails": {
    "shiftingMovers": {
      "selectedServices": {
        "loadingUnloading": true,
        "packing": false,
        "fixing": true,
        "helpers": true,
        "wheelchairHelper": false
      },
      "pickupFloorDetails": {
        "floor": 5,
        "hasLift": true,
        "accessType": "lift"
      },
      "dropoffFloorDetails": {
        "floor": 0,
        "hasLift": false,
        "accessType": "ground"
      },
      "extras": [
        { "name": "Packing Material", "count": 5 },
        { "name": "Extra Helper", "count": 1 },
        { "name": "Furniture Assembly", "count": 1 }
      ]
    }
  },
  "itemDetails": [
    { "name": "Sofa", "count": 2, "weight": 50, "dimensions": "2x1x0.8m" },
    { "name": "Bed Frame", "count": 1, "weight": 30, "dimensions": "1.8x1.5x0.3m" }
  ],
  "driverPreference": "nearby",
  "pinnedDriverId": null,
  "pinkCaptainOptions": {
    "femalePassengersOnly": false,
    "familyRides": false,
    "safeZoneRides": false,
    "familyWithGuardianMale": false,
    "maleWithoutFemale": false,
    "noMaleCompanion": false
  },
  "paymentMethod": "card",
  "scheduledTime": null,
  "driverFilters": {
    "vehicleModel": null,
    "specificDriverId": null,
    "searchRadius": 15
  },
  "serviceOptions": {
    "insurance": true,
    "packingMaterial": true,
    "assembly": false,
    "disassembly": false,
    "cleaning": false,
    "protectiveCovering": true,
    "specializedHandling": {
      "fragileItems": false,
      "antiques": false,
      "pianos": false,
      "artwork": false
    }
  },
  "extras": [
    { "name": "Packing Material", "count": 5, "price": 50 },
    { "name": "Extra Helper", "count": 1, "price": 100 },
    { "name": "Furniture Assembly", "count": 1, "price": 75 }
  ]
}
```

### **🔧 Car Recovery Service Request**
```json
{
  "pickupLocation": {
    "coordinates": [55.2708, 25.2048],
    "address": "Sheikh Zayed Road, Dubai"
  },
  "dropoffLocation": {
    "coordinates": [55.2744, 25.1972],
    "address": "Dubai Auto Service Center"
  },
  "serviceType": "car recovery",
  "serviceCategory": "emergency",
  "vehicleType": "flatbed towing",
  "routeType": "one_way",
  "distanceInMeters": 8000,
  "passengerCount": 0,
  "serviceDetails": {
    "carRecovery": {
      "issueDescription": "Engine won't start, battery seems dead",
      "urgencyLevel": "high",
      "needHelper": false,
      "wheelchairHelper": false,
      "vehicleMake": "Toyota",
      "vehicleModel": "Camry",
      "vehicleYear": "2020",
      "licensePlate": "ABC-1234",
      "vehicleColor": "White",
      "vehicleType": "Sedan",
      "isLuxury": false,
      "isHeavyDuty": false,
      "hasTrailer": false,
      "trailerDetails": null,
      "chassisNumber": "ABC123456789",
      "registrationExpiryDate": "2025-12-31",
      "companyName": "Toyota Motors",
      "vehicleOwnerName": "John Doe"
    }
  },
  "itemDetails": [],
  "driverPreference": "nearby",
  "pinnedDriverId": null,
  "pinkCaptainOptions": {
    "femalePassengersOnly": false,
    "familyRides": false,
    "safeZoneRides": false,
    "familyWithGuardianMale": false,
    "maleWithoutFemale": false,
    "noMaleCompanion": false
  },
  "paymentMethod": "cash",
  "scheduledTime": null,
  "driverFilters": {
    "vehicleModel": null,
    "specificDriverId": null,
    "searchRadius": 20
  },
  "serviceOptions": {
    "emergencyService": true,
    "insurance": true,
    "roadsideAssistance": true,
    "fuelDelivery": false,
    "batteryJumpStart": false,
    "tireChange": false,
    "lockoutService": false,
    "winchingService": false,
    "specializedRecovery": {
      "luxuryVehicles": false,
      "heavyDutyVehicles": false,
      "motorcycles": false,
      "boats": false
    }
  },
  "extras": [
    { "name": "Fuel Delivery", "count": 1, "price": 25 },
    { "name": "Battery Jump Start", "count": 1, "price": 30 },
    { "name": "Tire Change", "count": 1, "price": 40 }
  ]
}
```

---

## 📡 Real-Time Communication

### Driver Status Updates
```javascript
// Driver goes online/offline
socket.emit('driver_status_update', {
  isActive: true,
  currentLocation: {
    coordinates: [55.2708, 25.2048],
    address: "Current location"
  }
});

// Update auto-accept settings
socket.emit('update_auto_accept_settings', {
  enabled: true,
  maxDistance: 5,
  minFare: 20,
  serviceTypes: ['car cab', 'bike']
});

// Update ride preferences
socket.emit('update_ride_preferences', {
  acceptBike: true,
  acceptCar: true,
  pinkCaptainMode: true,
  acceptFemaleOnly: true,
  maxRideDistance: 50
});
```

### Location Updates
```javascript
// Driver location updates
socket.emit('driver_location_update', {
  coordinates: [55.2708, 25.2048],
  address: "Dubai Mall",
  heading: 90,
  speed: 25
});

// User location updates
socket.emit('user_location_update', {
  coordinates: [55.2708, 25.2048],
  address: "Current location",
  bookingId: "booking_123"
});
```

---



## 📋 **Complete Field Reference**

### **🔧 Service-Specific Fields**

#### **Shifting & Movers Fields:**
- `selectedServices.loadingUnloading` - Loading/unloading assistance
- `selectedServices.packing` - Packing service
- `selectedServices.fixing` - Furniture assembly/disassembly
- `selectedServices.helpers` - Additional helpers
- `selectedServices.wheelchairHelper` - Wheelchair accessibility
- `pickupFloorDetails.floor` - Pickup floor number
- `pickupFloorDetails.hasLift` - Lift availability at pickup
- `pickupFloorDetails.accessType` - Access type (ground/stairs/lift)
- `dropoffFloorDetails.floor` - Dropoff floor number
- `dropoffFloorDetails.hasLift` - Lift availability at dropoff
- `dropoffFloorDetails.accessType` - Access type (ground/stairs/lift)
- `extras` - Additional services array

#### **Car Recovery Fields:**
- `issueDescription` - Description of the problem
- `urgencyLevel` - Service urgency (low/medium/high/emergency)
- `needHelper` - Additional helper required
- `wheelchairHelper` - Wheelchair accessibility
- `vehicleMake` - Vehicle manufacturer
- `vehicleModel` - Vehicle model
- `vehicleYear` - Vehicle year
- `licensePlate` - License plate number
- `vehicleColor` - Vehicle color
- `vehicleType` - Vehicle type (Sedan/SUV/etc.)
- `isLuxury` - Luxury vehicle flag
- `isHeavyDuty` - Heavy duty vehicle flag
- `hasTrailer` - Trailer attachment flag
- `trailerDetails` - Trailer information
- `chassisNumber` - Vehicle chassis number
- `registrationExpiryDate` - Registration expiry date
- `companyName` - Company name (if applicable)
- `vehicleOwnerName` - Vehicle owner name

#### **Appointment Fields:**
- `appointmentType` - Type of appointment
- `scheduledDate` - Scheduled date
- `scheduledTime` - Scheduled time
- `estimatedDuration` - Estimated service duration
- `serviceCenter` - Service center details
- `serviceRequirements` - Required services
- `vehicleInformation` - Vehicle details
- `specialInstructions` - Special instructions
- `confirmationSettings` - Confirmation settings

### **🚗 Vehicle Information Fields:**
- `vehicleMake` - Vehicle manufacturer
- `vehicleModel` - Vehicle model
- `vehicleYear` - Vehicle year
- `licensePlate` - License plate number
- `vehicleColor` - Vehicle color
- `vehicleType` - Vehicle type
- `chassisNumber` - Chassis number
- `registrationExpiryDate` - Registration expiry
- `companyName` - Company name
- `vehicleOwnerName` - Owner name

### **🔧 Helper Services:**
- `loadingUnloadingHelper` - Loading/unloading assistance
- `packingHelper` - Packing assistance
- `fixingHelper` - Assembly/disassembly assistance
- `wheelchairHelper` - Wheelchair accessibility
- `needHelper` - Additional helper required

### **📅 Appointment Services:**
- `workshop` - Auto repair and maintenance
- `tyre_shop` - Tire services
- `key_unlocker` - Key unlocking
- `other` - Other specialized services



## 📚 API Reference

### REST APIs

#### Booking Management
- `POST /api/bookings/create-booking` - Create new booking
- `GET /api/bookings/:bookingId` - Get booking details
- `POST /api/bookings/:bookingId/start` - Start ride
- `POST /api/bookings/:bookingId/complete` - Complete ride
- `POST /api/bookings/cancel-booking` - Cancel booking

#### Fare Management
- `POST /api/fare/estimate` - Get fare estimation
- `POST /api/bookings/raise-fare/:bookingId` - Increase fare
- `POST /api/bookings/lower-fare/:bookingId` - Decrease fare
- `POST /api/bookings/:bookingId/modify-fare` - Driver modify fare
- `POST /api/bookings/respond-fare-offer/:bookingId` - Respond to fare offer

#### Driver Operations
- `POST /api/bookings/accept-booking/:bookingId` - Accept booking
- `POST /api/bookings/:bookingId/reject` - Reject booking
- `POST /api/bookings/driver/location` - Update driver location
- `POST /api/bookings/driver/status` - Update driver status
- `POST /api/bookings/driver/auto-accept-settings` - Update auto-accept settings
- `POST /api/bookings/driver/ride-preferences` - Update ride preferences

#### Communication
- `POST /api/bookings/:bookingId/send-message` - Send message
- `GET /api/bookings/:bookingId/messages` - Get ride messages

#### Post-Ride
- `POST /api/bookings/:bookingId/rating` - Submit rating
- `GET /api/bookings/:bookingId/receipt` - Get ride receipt

### Socket.IO Events

#### User Events
- `join_user_room` - Join user room
- `create_booking` - Create booking via socket
- `respond_to_fare_modification` - Respond to fare modification
- `cancel_booking_request` - Cancel booking
- `increase_fare_and_resend` - Increase fare and resend
- `send_message` - Send message to driver
- `user_location_update` - Update user location

#### Driver Events
- `join_driver_room` - Join driver room
- `accept_booking_request` - Accept booking request
- `reject_booking_request` - Reject booking request
- `modify_booking_fare` - Modify booking fare
- `start_ride` - Start ride
- `complete_ride` - Complete ride
- `send_ride_message` - Send message to user
- `driver_location_update` - Update driver location
- `driver_status_update` - Update driver status
- `update_auto_accept_settings` - Update auto-accept settings
- `update_ride_preferences` - Update ride preferences

#### Real-Time Notifications
- `new_booking_request` - New booking request (driver)
- `booking_accepted` - Booking accepted (user)
- `booking_rejected` - Booking rejected (user)
- `fare_modification_request` - Fare modification request (user)
- `fare_modification_response` - Fare modification response (driver)
- `ride_started` - Ride started (both)
- `ride_completed` - Ride completed (both)
- `message_received` - Message received (driver)
- `ride_message` - Message received (user)
- `driver_location_update` - Driver location update (user)
- `user_location_update` - User location update (driver)

---

## 💻 Integration Examples

### Frontend Integration (JavaScript)
```javascript
class BookingSystem {
  constructor() {
    this.socket = null;
    this.userId = null;
    this.currentBooking = null;
  }

  // Initialize connection
  async initialize(token, userId) {
    this.userId = userId;
    
    // Connect to Socket.IO
    this.socket = io('http://localhost:3001', {
      auth: { token }
    });

    // Join user room
    this.socket.emit('join_user_room', userId);

    // Setup event listeners
    this.setupEventListeners();
  }

  // Setup Socket.IO event listeners
  setupEventListeners() {
    this.socket.on('booking_accepted', (data) => {
      console.log('Booking accepted:', data);
      this.showDriverInfo(data.driver);
    });

    this.socket.on('ride_started', (data) => {
      console.log('Ride started:', data);
      this.showRideStarted();
    });

    this.socket.on('driver_location_update', (data) => {
      console.log('Driver location:', data);
      this.updateDriverLocation(data.driverLocation);
    });

    this.socket.on('message_received', (data) => {
      console.log('New message:', data);
      this.showMessage(data.message);
    });
  }

  // Create booking
  async createBooking(bookingData) {
    try {
      // First get fare estimation
      const fareResponse = await fetch('/api/fare/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });
      const fareData = await fareResponse.json();

      // Create booking
      const bookingResponse = await fetch('/api/bookings/create-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bookingData,
          offeredFare: fareData.estimatedFare
        })
      });
      const bookingResult = await bookingResponse.json();

      this.currentBooking = bookingResult;
      return bookingResult;
    } catch (error) {
      console.error('Error creating booking:', error);
      throw error;
    }
  }

  // Send message
  sendMessage(message, messageType = 'text') {
    if (!this.currentBooking) return;

    this.socket.emit('send_message', {
      bookingId: this.currentBooking.bookingId,
      message,
      messageType
    });
  }

  // Update location
  updateLocation(coordinates, address) {
    this.socket.emit('user_location_update', {
      coordinates,
      address,
      bookingId: this.currentBooking?.bookingId
    });
  }
}

// Usage
const bookingSystem = new BookingSystem();
await bookingSystem.initialize(token, userId);

// Create a car cab booking
const booking = await bookingSystem.createBooking({
  pickupLocation: {
    coordinates: [55.2708, 25.2048],
    address: "Dubai Mall"
  },
  dropoffLocation: {
    coordinates: [55.2744, 25.1972],
    address: "Burj Khalifa"
  },
  serviceType: "car cab",
  vehicleType: "economy",
  distanceInMeters: 2500,
  paymentMethod: "cash"
});
```

### Driver App Integration
```javascript
class DriverApp {
  constructor() {
    this.socket = null;
    this.driverId = null;
    this.isActive = false;
  }

  // Initialize driver connection
  async initialize(token, driverId) {
    this.driverId = driverId;
    
    // Connect to Socket.IO
    this.socket = io('http://localhost:3001', {
      auth: { token }
    });

    // Join driver room
    this.socket.emit('join_driver_room', driverId);

    // Setup event listeners
    this.setupEventListeners();
  }

  // Setup event listeners
  setupEventListeners() {
    this.socket.on('new_booking_request', (data) => {
      console.log('New booking request:', data);
      this.showBookingRequest(data);
    });

    this.socket.on('booking_accepted_confirmation', (data) => {
      console.log('Booking accepted:', data);
      this.showAcceptedBooking(data);
    });

    this.socket.on('ride_started', (data) => {
      console.log('Ride started:', data);
      this.showRideStarted(data);
    });
  }

  // Go online/offline
  updateStatus(isActive, location) {
    this.isActive = isActive;
    
    this.socket.emit('driver_status_update', {
      isActive,
      currentLocation: location
    });
  }

  // Accept booking
  acceptBooking(requestId) {
    this.socket.emit('accept_booking_request', {
      requestId
    });
  }

  // Reject booking
  rejectBooking(requestId, reason) {
    this.socket.emit('reject_booking_request', {
      requestId,
      reason
    });
  }

  // Start ride
  startRide(bookingId) {
    this.socket.emit('start_ride', {
      bookingId
    });
  }

  // Complete ride
  completeRide(bookingId, finalLocation) {
    this.socket.emit('complete_ride', {
      bookingId,
      finalLocation,
      actualDistance: 2.8,
      actualDuration: 18
    });
  }

  // Update location
  updateLocation(coordinates, address, heading, speed) {
    this.socket.emit('driver_location_update', {
      coordinates,
      address,
      heading,
      speed
    });
  }

  // Send message to user
  sendMessage(bookingId, message) {
    this.socket.emit('send_ride_message', {
      bookingId,
      message,
      messageType: 'text'
    });
  }
}

// Usage
const driverApp = new DriverApp();
await driverApp.initialize(token, driverId);

// Go online
driverApp.updateStatus(true, {
  coordinates: [55.2708, 25.2048],
  address: "Dubai Mall"
});

// Listen for booking requests
// Accept when received
driverApp.acceptBooking('booking_123');
```

---

## 🔧 Error Handling & Best Practices

### Error Handling
```javascript
// Handle Socket.IO connection errors
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  // Implement reconnection logic
});

// Handle API errors
try {
  const response = await fetch('/api/bookings/create-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingData)
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message);
  }
  
  const result = await response.json();
} catch (error) {
  console.error('API Error:', error);
  // Handle error appropriately
}
```

### Best Practices
1. **Always validate input data** before sending to APIs
2. **Handle network errors** and implement retry logic
3. **Use proper error codes** and messages
4. **Implement reconnection logic** for Socket.IO
5. **Cache user data** to reduce API calls
6. **Use proper authentication** for all requests
7. **Handle edge cases** like no drivers available
8. **Implement proper loading states** for better UX

---

## 📱 Mobile App Integration

### React Native Example
```javascript
import io from 'socket.io-client';

class MobileBookingApp {
  constructor() {
    this.socket = null;
    this.apiBase = 'http://localhost:3001/api';
  }

  async connectSocket(token) {
    this.socket = io('http://localhost:3001', {
      auth: { token },
      transports: ['websocket']
    });

    return new Promise((resolve, reject) => {
      this.socket.on('connect', () => resolve());
      this.socket.on('connect_error', reject);
    });
  }

  async createBooking(bookingData) {
    const response = await fetch(`${this.apiBase}/bookings/create-booking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(bookingData)
    });

    return response.json();
  }
}
```

---

This comprehensive guide covers the complete booking flow for all service types with both REST APIs and Socket.IO integration. The system is designed to handle real-time communication while maintaining data persistence through REST APIs. 