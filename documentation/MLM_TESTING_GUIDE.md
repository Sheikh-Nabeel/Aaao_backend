# MLM System Testing Guide

This guide provides all the endpoints and request data needed to test the complete MLM system including TGP/PGP distribution.

## Prerequisites

1. Start the server: `npm start`
2. Ensure MongoDB is running
3. Create test users with referral hierarchy

## 1. Setup Test Users

### Create Users with Referral Chain

```bash
# Create Sponsor (Level 1)
POST http://localhost:5000/api/users/register
Content-Type: application/json

{
  "username": "sponsor1",
  "email": "sponsor1@test.com",
  "password": "password123",
  "phone": "+1234567890",
  "role": "user"
}

# Create Team Member (Level 2)
POST http://localhost:5000/api/users/register
Content-Type: application/json

{
  "username": "teammember1",
  "email": "teammember1@test.com",
  "password": "password123",
  "phone": "+1234567891",
  "role": "user",
  "sponsorBy": "SPONSOR1_USER_ID_HERE"
}

# Create Team Member (Level 3)
POST http://localhost:5000/api/users/register
Content-Type: application/json

{
  "username": "teammember2",
  "email": "teammember2@test.com",
  "password": "password123",
  "phone": "+1234567892",
  "role": "user",
  "sponsorBy": "TEAMMEMBER1_USER_ID_HERE"
}

# Create Driver
POST http://localhost:5000/api/users/register
Content-Type: application/json

{
  "username": "driver1",
  "email": "driver1@test.com",
  "password": "password123",
  "phone": "+1234567893",
  "role": "driver",
  "sponsorBy": "SPONSOR1_USER_ID_HERE"
}
```

## 2. Initialize MLM System

### Create MLM System
```bash
POST http://localhost:5000/api/mlm/create
Content-Type: application/json
Authorization: Bearer ADMIN_TOKEN

{
  "name": "Test MLM System"
}
```

### Get MLM System Configuration
```bash
GET http://localhost:5000/api/mlm
Authorization: Bearer ADMIN_TOKEN
```

## 3. Test Ride Completion & MLM Distribution

### Personal Ride (User = Driver) - PGP Distribution
```bash
POST http://localhost:5000/api/mlm/distribute-ride
Content-Type: application/json
Authorization: Bearer USER_TOKEN

{
  "userId": "TEAMMEMBER2_USER_ID",
  "driverId": "TEAMMEMBER2_USER_ID",
  "rideId": "ride_001",
  "totalFare": 2000,
  "rideType": "personal"
}
```

### Team Ride (User ≠ Driver) - TGP Distribution
```bash
POST http://localhost:5000/api/mlm/distribute-ride
Content-Type: application/json
Authorization: Bearer USER_TOKEN

{
  "userId": "TEAMMEMBER2_USER_ID",
  "driverId": "DRIVER1_USER_ID",
  "rideId": "ride_002",
  "totalFare": 3000,
  "rideType": "team"
}
```

### Large Ride for Testing
```bash
POST http://localhost:5000/api/mlm/distribute-ride
Content-Type: application/json
Authorization: Bearer USER_TOKEN

{
  "userId": "TEAMMEMBER1_USER_ID",
  "driverId": "DRIVER1_USER_ID",
  "rideId": "ride_003",
  "totalFare": 10000,
  "rideType": "team"
}
```

## 4. Check User Qualification Points

### Get User's TGP/PGP Stats
```bash
GET http://localhost:5000/api/users/qualification-stats/USER_ID
Authorization: Bearer USER_TOKEN
```

### Get User's Qualification Transactions
```bash
GET http://localhost:5000/api/users/qualification-transactions/USER_ID?limit=20
Authorization: Bearer USER_TOKEN
```

## 5. Check MLM Earnings

### Get User's MLM Earnings
```bash
GET http://localhost:5000/api/mlm/user-earnings/USER_ID
Authorization: Bearer USER_TOKEN
```

### Get MLM System Statistics (Admin)
```bash
GET http://localhost:5000/api/mlm/stats
Authorization: Bearer ADMIN_TOKEN
```

## 6. Admin MLM Management

### Update MLM Percentages
```bash
PUT http://localhost:5000/api/mlm/update
Content-Type: application/json
Authorization: Bearer ADMIN_TOKEN

{
  "ddr": 25,
  "crr": 12,
  "bbr": 7,
  "hlr": 8,
  "regionalAmbassador": 0.5,
  "porparleTeam": 9,
  "rop": 4,
  "companyOperations": 3.5,
  "technologyPool": 3,
  "foundationPool": 1.5,
  "publicShare": 14,
  "netProfit": 12.5
}
```

### Reset MLM Data
```bash
POST http://localhost:5000/api/mlm/reset
Authorization: Bearer ADMIN_TOKEN
```

### Delete MLM System
```bash
DELETE http://localhost:5000/api/mlm/delete
Authorization: Bearer ADMIN_TOKEN
```

## 7. Test Scenarios

### Scenario 1: Personal Ride Chain
1. TeamMember2 takes personal ride (PGP)
2. Check TeamMember2's PGP points
3. Check upline TGP distribution (TeamMember1, Sponsor1)

### Scenario 2: Team Ride Chain
1. TeamMember2 books ride with Driver1 (TGP)
2. Check TeamMember2's TGP points
3. Check Driver1's PGP points
4. Check upline TGP distribution for both trees

### Scenario 3: Mixed Rides
1. Multiple personal and team rides
2. Verify PGP vs TGP accumulation
3. Check MLM pool distributions

## 8. Expected Results

### For $20 Ride (2000 cents):
- **MLM Amount**: $3.00 (15%)
- **DDR (24%)**: $0.72
  - Level 1: $0.42 (14%)
  - Level 2: $0.18 (6%)
  - Level 3: $0.108 (3.6%)
  - Level 4: $0.012 (0.4%)
- **CRR (13.3%)**: $0.399
- **BBR (6%)**: $0.18
- **HLR (6.7%)**: $0.201
- **Regional Ambassador (0.4%)**: $0.012
- **Other pools**: Remaining percentages

### Qualification Points:
- **Personal Ride**: User gets PGP = ride fare
- **Team Ride**: User gets TGP = ride fare, Driver gets PGP = ride fare
- **Upline Distribution**: Each sponsor gets TGP = ride fare

## 9. Verification Queries

### Check User's Complete Profile
```bash
GET http://localhost:5000/api/users/profile/USER_ID
Authorization: Bearer USER_TOKEN
```

### Check MLM Transaction History
```bash
GET http://localhost:5000/api/mlm/transactions?limit=50
Authorization: Bearer ADMIN_TOKEN
```

## 10. Error Testing

### Invalid Ride Data
```bash
POST http://localhost:5000/api/mlm/distribute-ride
Content-Type: application/json

{
  "userId": "invalid_id",
  "rideId": "test",
  "totalFare": -100
}
```

### Unauthorized Access
```bash
GET http://localhost:5000/api/mlm/stats
# Without Authorization header
```

## Notes

1. Replace `USER_ID`, `ADMIN_TOKEN`, etc. with actual values
2. Ensure proper authentication tokens
3. Check server logs for detailed transaction information
4. Use MongoDB Compass to verify database changes
5. Test with different fare amounts to verify percentage calculations

## Sample Test Flow

1. Create 4 users in referral chain
2. Initialize MLM system
3. Execute 3-5 rides with different scenarios
4. Verify qualification points distribution
5. Check MLM monetary distribution
6. Validate upline TGP flow
7. Test admin statistics endpoints

This comprehensive testing will validate the entire MLM system including TGP/PGP logic and traditional MLM distribution.