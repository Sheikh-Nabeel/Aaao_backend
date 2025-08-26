# MLM System API Endpoints & Test Data

This document provides all the API endpoints and request data needed to test the complete MLM system with TGP/PGP distribution.

## Base URL
```
http://localhost:5000
```

## Authentication
Most endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## 1. User Management Endpoints

### 1.1 Register User
**POST** `/api/users/register`

**Request Body:**
```json
{
  "username": "sponsor1",
  "email": "sponsor1@test.com",
  "password": "password123",
  "phone": "+1234567890",
  "role": "user",
  "sponsorBy": "<sponsor_user_id>" // Optional for referral chain
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "_id": "user_id",
    "username": "sponsor1",
    "email": "sponsor1@test.com",
    "role": "user",
    "sponsorBy": "sponsor_id"
  },
  "token": "jwt_token_here"
}
```

### 1.2 Get User Qualification Stats
**GET** `/api/users/qualification-stats/:userId`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "stats": {
    "monthlyPGP": 5000,
    "monthlyTGP": 15000,
    "accumulatedPGP": 25000,
    "accumulatedTGP": 75000,
    "totalPoints": 100000
  }
}
```

### 1.3 Get User Qualification Transactions
**GET** `/api/users/qualification-transactions/:userId?limit=10`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "type": "pgp",
      "points": 2000,
      "rideType": "personal",
      "rideId": "ride_001",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

## 2. MLM System Management

### 2.1 Create MLM System
**POST** `/api/mlm/create`

**Headers:** `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "name": "Main MLM System"
}
```

**Response:**
```json
{
  "success": true,
  "mlm": {
    "_id": "mlm_system_id",
    "name": "Main MLM System",
    "ddr": 24,
    "crr": 13.3,
    "bbr": 6,
    "hlr": 6.7,
    "totalMLMAmount": 0
  }
}
```

### 2.2 Get MLM System Configuration
**GET** `/api/mlm`

**Headers:** `Authorization: Bearer <admin_token>`

**Response:**
```json
{
  "success": true,
  "mlm": {
    "_id": "mlm_system_id",
    "name": "Main MLM System",
    "ddr": 24,
    "crr": 13.3,
    "bbr": 6,
    "hlr": 6.7,
    "regionalAmbassador": 0.4,
    "porparleTeam": 10,
    "rop": 3,
    "companyOperations": 3,
    "technologyPool": 2.6,
    "foundationPool": 1,
    "publicShare": 15,
    "netProfit": 15,
    "totalMLMAmount": 45000,
    "currentBalances": {
      "ddr": 10800,
      "crr": 5985,
      "bbr": 2700
    }
  }
}
```

### 2.3 Update MLM Percentages
**PUT** `/api/mlm/update`

**Headers:** `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "ddr": 25,
  "crr": 13,
  "bbr": 6,
  "hlr": 7
}
```

### 2.4 Reset MLM System
**DELETE** `/api/mlm/reset`

**Headers:** `Authorization: Bearer <admin_token>`

---

## 3. Ride Completion & MLM Distribution

### 3.1 Distribute Ride MLM (Main Endpoint)
**POST** `/api/mlm/distribute-ride`

**Headers:** `Authorization: Bearer <user_token>`

**Request Body for Personal Ride (PGP):**
```json
{
  "userId": "user_id",
  "driverId": "same_user_id", // Same as userId for personal ride
  "rideId": "ride_001",
  "totalFare": 2000, // $20.00 in cents
  "rideType": "personal"
}
```

**Request Body for Team Ride (TGP):**
```json
{
  "userId": "user_id",
  "driverId": "different_driver_id", // Different from userId
  "rideId": "ride_002",
  "totalFare": 3000, // $30.00 in cents
  "rideType": "team"
}
```

**Response:**
```json
{
  "success": true,
  "message": "MLM distribution completed successfully",
  "mlmAmount": 300, // 15% of totalFare
  "qualificationPoints": 3000,
  "distribution": {
    "ddr": 72, // 24% of mlmAmount
    "crr": 39.9, // 13.3% of mlmAmount
    "bbr": 18, // 6% of mlmAmount
    "hlr": 20.1, // 6.7% of mlmAmount
    "regionalAmbassador": 1.2,
    "porparleTeam": 30,
    "rop": 9,
    "companyOperations": 9,
    "technologyPool": 7.8,
    "foundationPool": 3,
    "publicShare": 45,
    "netProfit": 45
  },
  "tgpDistribution": {
    "level1": { "userId": "sponsor_id", "amount": 420 },
    "level2": { "userId": "sponsor2_id", "amount": 315 },
    "level3": { "userId": "sponsor3_id", "amount": 210 },
    "level4": { "userId": "sponsor4_id", "amount": 105 }
  }
}
```

---

## 4. MLM Statistics & Earnings

### 4.1 Get MLM System Statistics
**GET** `/api/mlm/stats`

**Headers:** `Authorization: Bearer <admin_token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalMLMAmount": 45000,
    "totalTransactions": 15,
    "sectionTotals": {
      "ddr": 10800,
      "crr": 5985,
      "bbr": 2700,
      "hlr": 3015,
      "regionalAmbassador": 180,
      "porparleTeam": 4500,
      "rop": 1350,
      "companyOperations": 1350,
      "technologyPool": 1170,
      "foundationPool": 450,
      "publicShare": 6750,
      "netProfit": 6750
    },
    "ddrLevelTotals": {
      "level1": 1512,
      "level2": 1134,
      "level3": 756,
      "level4": 378
    },
    "qualificationStats": {
      "crrEligible": 5,
      "bbrEligible": 3,
      "hlrEligible": 2,
      "regionalAmbassadorEligible": 1
    }
  }
}
```

### 4.2 Get User MLM Earnings
**GET** `/api/mlm/user-earnings/:userId`

**Headers:** `Authorization: Bearer <user_token>`

**Response:**
```json
{
  "success": true,
  "earnings": {
    "total": 2500,
    "userTree": 1500,
    "driverTree": 1000,
    "transactions": [
      {
        "rideId": "ride_001",
        "amount": 420,
        "level": 1,
        "tree": "user",
        "date": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

### 4.3 Get User DDR Tree View
**GET** `/api/mlm/user-ddr-tree/:userId`

**Headers:** `Authorization: Bearer <user_token>`

**Response:**
```json
{
  "success": true,
  "ddrTree": {
    "userTree": {
      "level1": { "earnings": 840, "members": 2 },
      "level2": { "earnings": 630, "members": 3 },
      "level3": { "earnings": 420, "members": 1 },
      "level4": { "earnings": 210, "members": 1 }
    },
    "driverTree": {
      "level1": { "earnings": 420, "members": 1 },
      "level2": { "earnings": 315, "members": 2 },
      "level3": { "earnings": 0, "members": 0 },
      "level4": { "earnings": 0, "members": 0 }
    }
  }
}
```

---

## 5. Test Scenarios

### Scenario 1: Complete MLM Test Setup

#### Step 1: Create Test Users
```bash
# 1. Create Admin
POST /api/users/register
{
  "username": "admin_test",
  "email": "admin@test.com",
  "password": "admin123",
  "phone": "+1234567890",
  "role": "admin"
}

# 2. Create Sponsor (Level 0)
POST /api/users/register
{
  "username": "sponsor1",
  "email": "sponsor1@test.com",
  "password": "password123",
  "phone": "+1234567891",
  "role": "user"
}

# 3. Create Team Member 1 (Level 1)
POST /api/users/register
{
  "username": "teammember1",
  "email": "teammember1@test.com",
  "password": "password123",
  "phone": "+1234567892",
  "role": "user",
  "sponsorBy": "<sponsor1_id>"
}

# 4. Create Team Member 2 (Level 2)
POST /api/users/register
{
  "username": "teammember2",
  "email": "teammember2@test.com",
  "password": "password123",
  "phone": "+1234567893",
  "role": "user",
  "sponsorBy": "<teammember1_id>"
}

# 5. Create Driver
POST /api/users/register
{
  "username": "driver1",
  "email": "driver1@test.com",
  "password": "password123",
  "phone": "+1234567894",
  "role": "driver",
  "sponsorBy": "<sponsor1_id>"
}
```

#### Step 2: Initialize MLM System
```bash
POST /api/mlm/create
Authorization: Bearer <admin_token>
{
  "name": "Test MLM System"
}
```

#### Step 3: Test Ride Scenarios

**Personal Ride (PGP Test):**
```bash
POST /api/mlm/distribute-ride
Authorization: Bearer <teammember2_token>
{
  "userId": "<teammember2_id>",
  "driverId": "<teammember2_id>", // Same user
  "rideId": "personal_ride_001",
  "totalFare": 2000, // $20
  "rideType": "personal"
}
```

**Team Ride (TGP Test):**
```bash
POST /api/mlm/distribute-ride
Authorization: Bearer <teammember2_token>
{
  "userId": "<teammember2_id>",
  "driverId": "<driver1_id>", // Different user
  "rideId": "team_ride_001",
  "totalFare": 3000, // $30
  "rideType": "team"
}
```

**Large Team Ride (Qualification Test):**
```bash
POST /api/mlm/distribute-ride
Authorization: Bearer <teammember1_token>
{
  "userId": "<teammember1_id>",
  "driverId": "<driver1_id>",
  "rideId": "large_ride_001",
  "totalFare": 10000, // $100
  "rideType": "team"
}
```

#### Step 4: Check Results

**Check Qualification Points:**
```bash
GET /api/users/qualification-stats/<teammember2_id>
Authorization: Bearer <teammember2_token>
```

**Check MLM Earnings:**
```bash
GET /api/mlm/user-earnings/<sponsor1_id>
Authorization: Bearer <sponsor1_token>
```

**Check System Statistics:**
```bash
GET /api/mlm/stats
Authorization: Bearer <admin_token>
```

---

## 6. Expected Results

### For $20 Personal Ride:
- **MLM Amount:** $3.00 (15% of $20)
- **PGP Points:** 2000 (assigned to teammember2)
- **TGP Distribution:** 2000 points distributed to upline (teammember1: 1400, sponsor1: 1050, etc.)
- **DDR Distribution:** $0.72 (24% of $3.00) distributed across 4 levels

### For $30 Team Ride:
- **MLM Amount:** $4.50 (15% of $30)
- **TGP Points:** 3000 (assigned to teammember2 and distributed to upline)
- **PGP Points:** 3000 (assigned to driver1)
- **DDR Distribution:** $1.08 (24% of $4.50) distributed across both user and driver trees

### Qualification Levels:
- **CRR:** 10,000+ total points
- **BBR:** 25,000+ total points
- **HLR:** 50,000+ total points
- **Regional Ambassador:** 100,000+ total points

---

## 7. Error Testing

### Invalid Requests:
```bash
# Missing required fields
POST /api/mlm/distribute-ride
{
  "userId": "<user_id>"
  // Missing driverId, rideId, totalFare
}

# Invalid user ID
POST /api/mlm/distribute-ride
{
  "userId": "invalid_id",
  "driverId": "<driver_id>",
  "rideId": "test_ride",
  "totalFare": 2000
}

# Unauthorized access
GET /api/mlm/stats
# Without admin token
```

---

## 8. Quick Test Script

Run the provided test script:
```bash
node test-mlm-simple.js
```

This will automatically:
1. Create all test users
2. Initialize MLM system
3. Run ride scenarios
4. Check qualification points
5. Verify MLM earnings
6. Display comprehensive results

---

## Notes

1. **All monetary values are in cents** (e.g., 2000 = $20.00)
2. **Tokens expire** - you may need to re-authenticate
3. **Admin role required** for MLM management endpoints
4. **User authentication required** for personal data endpoints
5. **TGP vs PGP:** TGP earned from team rides, PGP from personal rides
6. **Qualification points** determine eligibility for CRR, BBR, HLR, Regional Ambassador rewards