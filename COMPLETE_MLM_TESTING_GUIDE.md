# Complete MLM System Testing Guide

This comprehensive guide provides all endpoints and testing data to test the full MLM system after ride completion, including wallet integration, admin dashboard access, and user-specific TGP/PGP views.

## Base URL
```
http://localhost:3001
```

## Authentication
Most endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## 1. Complete Test Setup

### Step 1: Create Test Users

#### 1.1 Create Admin User
```bash
POST /api/users/signup
Content-Type: application/json

{
  "firstName": "Admin",
  "lastName": "User",
  "email": "admin@test.com",
  "password": "admin123",
  "phoneNumber": "+1234567890",
  "role": "admin"
}
```

#### 1.2 Create Sponsor (Level 0)
```bash
POST /api/users/signup
Content-Type: application/json

{
  "firstName": "Sponsor",
  "lastName": "One",
  "email": "sponsor1@test.com",
  "password": "password123",
  "phoneNumber": "+1234567891",
  "role": "user"
}
```

#### 1.3 Create Team Member 1 (Level 1)
```bash
POST /api/users/signup
Content-Type: application/json

{
  "firstName": "Team",
  "lastName": "Member1",
  "email": "teammember1@test.com",
  "password": "password123",
  "phoneNumber": "+1234567892",
  "role": "user",
  "sponsorBy": "<sponsor1_user_id>"
}
```

#### 1.4 Create Team Member 2 (Level 2)
```bash
POST /api/users/signup
Content-Type: application/json

{
  "firstName": "Team",
  "lastName": "Member2",
  "email": "teammember2@test.com",
  "password": "password123",
  "phoneNumber": "+1234567893",
  "role": "user",
  "sponsorBy": "<teammember1_user_id>"
}
```

#### 1.5 Create Driver
```bash
POST /api/users/signup
Content-Type: application/json

{
  "firstName": "Driver",
  "lastName": "One",
  "email": "driver1@test.com",
  "password": "password123",
  "phoneNumber": "+1234567894",
  "role": "driver",
  "sponsorBy": "<sponsor1_user_id>"
}
```

### Step 2: Login and Get Tokens

#### Login Admin
```bash
POST /api/users/login
Content-Type: application/json

{
  "email": "admin@test.com",
  "password": "admin123"
}
```

#### Login Users (repeat for each user)
```bash
POST /api/users/login
Content-Type: application/json

{
  "email": "teammember2@test.com",
  "password": "password123"
}
```

### Step 3: Initialize MLM System

```bash
POST /api/mlm/create
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "name": "Test MLM System"
}
```

---

## 2. Ride Completion & MLM Distribution Testing

### 2.1 Personal Ride (PGP Distribution)
**User acts as both passenger and driver**

```bash
POST /api/mlm/distribute-ride
Content-Type: application/json
Authorization: Bearer <teammember2_token>

{
  "userId": "<teammember2_user_id>",
  "driverId": "<teammember2_user_id>",
  "rideId": "personal_ride_001",
  "totalFare": 2000,
  "rideType": "personal"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "MLM distribution and TGP/PGP allocation completed successfully",
  "data": {
    "mlmAmount": 300,
    "distribution": {
      "ddr": 72,
      "crr": 39.9,
      "bbr": 18,
      "hlr": 20.1,
      "regionalAmbassador": 1.2,
      "porparleTeam": 30,
      "rop": 9,
      "companyOperations": 9,
      "technologyPool": 7.8,
      "foundationPool": 3,
      "publicShare": 45,
      "netProfit": 45
    },
    "qualificationPointsDistribution": {
      "userPoints": 2000,
      "driverPoints": 2000,
      "userType": "pgp",
      "driverType": "pgp",
      "isPersonalRide": true
    }
  }
}
```

### 2.2 Team Ride (TGP Distribution)
**User as passenger, different driver**

```bash
POST /api/mlm/distribute-ride
Content-Type: application/json
Authorization: Bearer <teammember2_token>

{
  "userId": "<teammember2_user_id>",
  "driverId": "<driver1_user_id>",
  "rideId": "team_ride_001",
  "totalFare": 3000,
  "rideType": "team"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "MLM distribution and TGP/PGP allocation completed successfully",
  "data": {
    "mlmAmount": 450,
    "distribution": {
      "ddr": 108,
      "crr": 59.85,
      "bbr": 27,
      "hlr": 30.15
    },
    "qualificationPointsDistribution": {
      "userPoints": 3000,
      "driverPoints": 3000,
      "userType": "tgp",
      "driverType": "pgp",
      "isPersonalRide": false,
      "teamDistributions": [
        {
          "userId": "<teammember1_user_id>",
          "points": 3000,
          "type": "tgp",
          "level": 1
        },
        {
          "userId": "<sponsor1_user_id>",
          "points": 3000,
          "type": "tgp",
          "level": 2
        }
      ]
    }
  }
}
```

### 2.3 Large Ride for Qualification Testing

```bash
POST /api/mlm/distribute-ride
Content-Type: application/json
Authorization: Bearer <teammember1_token>

{
  "userId": "<teammember1_user_id>",
  "driverId": "<driver1_user_id>",
  "rideId": "large_ride_001",
  "totalFare": 10000,
  "rideType": "team"
}
```

---

## 3. User TGP/PGP Qualification Checking

### 3.1 Get User Qualification Stats

```bash
GET /api/users/qualification-stats/<teammember2_user_id>
Authorization: Bearer <teammember2_token>
```

**Expected Response:**
```json
{
  "success": true,
  "stats": {
    "monthlyPGP": 2000,
    "monthlyTGP": 3000,
    "accumulatedPGP": 2000,
    "accumulatedTGP": 3000,
    "totalPoints": 5000,
    "monthlyTotal": 5000,
    "lastResetDate": {
      "pgp": "2024-01-15T10:30:00Z",
      "tgp": "2024-01-15T10:30:00Z"
    }
  }
}
```

### 3.2 Get User Qualification Transactions

```bash
GET /api/users/qualification-transactions/<teammember2_user_id>?limit=20
Authorization: Bearer <teammember2_token>
```

**Expected Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "points": 3000,
      "rideId": "team_ride_001",
      "type": "tgp",
      "rideType": "team",
      "rideFare": 3000,
      "timestamp": "2024-01-15T11:00:00Z",
      "month": 1,
      "year": 2024
    },
    {
      "points": 2000,
      "rideId": "personal_ride_001",
      "type": "pgp",
      "rideType": "personal",
      "rideFare": 2000,
      "timestamp": "2024-01-15T10:30:00Z",
      "month": 1,
      "year": 2024
    }
  ],
  "total": 2
}
```

---

## 4. Admin MLM Dashboard (Full System View)

### 4.1 Get Complete MLM Dashboard

```bash
GET /api/mlm/admin-dashboard
Authorization: Bearer <admin_token>
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "totalMLMAmount": 750,
    "sectionTotals": {
      "ddr": 180,
      "crr": 99.75,
      "bbr": 45,
      "hlr": 50.25,
      "regionalAmbassador": 2.4,
      "porparleTeam": 75,
      "rop": 22.5,
      "companyOperations": 22.5,
      "technologyPool": 19.5,
      "foundationPool": 7.5,
      "publicShare": 112.5,
      "netProfit": 112.5
    },
    "ddrLevelTotals": {
      "level1": 105,
      "level2": 45,
      "level3": 27,
      "level4": 3
    },
    "totalTransactions": 3,
    "recentTransactions": [
      {
        "userId": "<teammember1_user_id>",
        "amount": 1500,
        "rideId": "large_ride_001",
        "timestamp": "2024-01-15T11:30:00Z"
      }
    ],
    "percentageConfiguration": {
      "ddr": 24,
      "crr": 13.3,
      "bbr": 6,
      "hlr": 6.7
    }
  }
}
```

### 4.2 Get MLM System Configuration

```bash
GET /api/mlm
Authorization: Bearer <admin_token>
```

### 4.3 Get MLM Statistics

```bash
GET /api/mlm/stats
Authorization: Bearer <admin_token>
```

---

## 5. User DDR Tree View (User-Specific Earnings)

### 5.1 Get User's DDR Tree Earnings

```bash
GET /api/mlm/user-tree/<teammember2_user_id>
Authorization: Bearer <teammember2_token>
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "userId": "<teammember2_user_id>",
    "userQualifications": {
      "ddr": true,
      "crr": false,
      "bbr": false,
      "hlr": false,
      "regionalAmbassador": false
    },
    "visibleRewards": ["ddr"],
    "hiddenRewards": ["crr", "bbr", "hlr", "regionalAmbassador"],
    "earnings": {
      "ddr": {
        "level1": 42,
        "level2": 18,
        "level3": 10.8,
        "level4": 1.2,
        "total": 72
      },
      "qualificationRewards": {
        "total": 0,
        "note": "Only qualified rewards are shown"
      },
      "otherEarnings": {
        "porparleTeam": 30,
        "rop": 9,
        "companyOperations": 9,
        "technologyPool": 7.8,
        "foundationPool": 3,
        "publicShare": 45,
        "netProfit": 45
      },
      "totalEarnings": 220.8
    },
    "totalTransactions": 2
  }
}
```

---

## 6. Wallet Integration Testing

### 6.1 Check User Wallet Balance

```bash
GET /api/wallet
Authorization: Bearer <teammember2_token>
```

**Expected Response:**
```json
{
  "success": true,
  "wallet": {
    "balance": 0
  }
}
```

### 6.2 Admin Add Money to User Wallet

```bash
POST /api/wallet/add
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "userId": "<teammember2_user_id>",
  "amount": 5000,
  "description": "MLM earnings transfer"
}
```

### 6.3 Admin Deduct Money from User Wallet

```bash
POST /api/wallet/deduct
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "userId": "<teammember2_user_id>",
  "amount": 1000,
  "description": "Withdrawal request"
}
```

---

## 7. Complete Test Scenarios

### Scenario 1: Personal Ride Flow
1. User completes personal ride (acts as both passenger and driver)
2. System distributes 15% of fare to MLM pools
3. User receives PGP points equal to ride fare
4. Upline sponsors receive TGP points
5. Check user qualification stats
6. Verify MLM pool balances

### Scenario 2: Team Ride Flow
1. User books ride with different driver
2. System distributes 15% of fare to MLM pools
3. User receives TGP points, driver receives PGP points
4. Upline sponsors receive TGP points
5. Check qualification stats for all participants
6. Verify DDR distribution across levels

### Scenario 3: Admin Dashboard Verification
1. Admin views complete MLM dashboard
2. Verify total amounts across all sections
3. Check DDR level distributions
4. Review recent transactions
5. Validate percentage configurations

### Scenario 4: User-Specific View
1. User views their DDR tree earnings
2. Only qualified rewards are visible
3. TGP/PGP stats show personal and team points
4. Transaction history shows ride-based earnings

---

## 8. Expected Results Summary

### For $20 Personal Ride (2000 cents):
- **MLM Amount**: $3.00 (15% of $20)
- **User PGP**: 2000 points
- **Upline TGP**: 2000 points each (distributed to sponsors)
- **DDR Distribution**: $0.72 across 4 levels
- **Other Pools**: Remaining $2.28 distributed per percentages

### For $30 Team Ride (3000 cents):
- **MLM Amount**: $4.50 (15% of $30)
- **User TGP**: 3000 points
- **Driver PGP**: 3000 points
- **Upline TGP**: 3000 points each (distributed to sponsors)
- **DDR Distribution**: $1.08 across 4 levels

### Qualification Thresholds (To be defined):
- **CRR**: TBD total points
- **BBR**: TBD total points
- **HLR**: TBD total points
- **Regional Ambassador**: TBD total points

---

## 9. Error Testing

### Invalid Ride Data
```bash
POST /api/mlm/distribute-ride
Content-Type: application/json

{
  "userId": "invalid_id",
  "rideId": "test",
  "totalFare": -100
}
```

### Unauthorized Access
```bash
GET /api/mlm/admin-dashboard
# Without Authorization header
```

### Insufficient Wallet Balance
```bash
POST /api/wallet/deduct
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "userId": "<user_id>",
  "amount": 999999,
  "description": "Large withdrawal"
}
```

---

## 10. Quick Test Script

Save this as `test-complete-mlm.js` and run with `node test-complete-mlm.js`:

```javascript
const axios = require('axios');
const baseURL = 'http://localhost:3001';

async function testCompleteMLMSystem() {
  try {
    console.log('🚀 Starting Complete MLM System Test...');
    
    // 1. Create test users
    console.log('\n1. Creating test users...');
    // Add user creation logic here
    
    // 2. Initialize MLM system
    console.log('\n2. Initializing MLM system...');
    // Add MLM initialization logic here
    
    // 3. Test ride scenarios
    console.log('\n3. Testing ride scenarios...');
    // Add ride testing logic here
    
    // 4. Check qualification points
    console.log('\n4. Checking qualification points...');
    // Add qualification checking logic here
    
    // 5. Verify admin dashboard
    console.log('\n5. Verifying admin dashboard...');
    // Add admin dashboard verification logic here
    
    // 6. Test user-specific views
    console.log('\n6. Testing user-specific views...');
    // Add user view testing logic here
    
    console.log('\n✅ Complete MLM System Test Completed Successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCompleteMLMSystem();
```

---

## 11. Notes

1. **All monetary values are in cents** (e.g., 2000 = $20.00)
2. **Replace placeholder IDs** with actual user IDs from registration responses
3. **Admin role required** for MLM management and wallet operations
4. **User authentication required** for personal data access
5. **TGP vs PGP Logic**:
   - **PGP**: Personal rides (user = driver) and driver earnings
   - **TGP**: Team rides (user ≠ driver) and upline sponsor earnings
6. **Qualification Points**: Determine eligibility for CRR, BBR, HLR, Regional Ambassador
7. **DDR Distribution**: Available to all users across 4 referral levels
8. **Wallet Integration**: Admin can add/deduct funds, users can check balance

This comprehensive testing guide covers the complete MLM system including ride completion, qualification tracking, admin dashboard, user-specific views, and wallet integration.