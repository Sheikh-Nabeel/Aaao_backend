# MLM System Documentation

## Overview
The MLM (Multi-Level Marketing) system is designed to distribute 15% of each ride fare across various pools and levels. The system supports two distribution methods:

1. **Traditional MLM System**: Distributes 15% across predefined pools and categories
2. **Dual-Tree MLM System**: Splits 15% into 7.5% for user referral tree and 7.5% for driver referral tree

## Dual-Tree MLM System (New Implementation)

### Distribution Logic (Upward Distribution)
When a ride is completed, 15% of the total fare is distributed **upward** to sponsors as follows:
- **7.5%** goes to the **User Referral Tree** (passenger's upline sponsors)
- **7.5%** goes to the **Driver Referral Tree** (driver's upline sponsors)

### Level-based Earnings Distribution (Upward to Sponsors)
Each tree (user and driver) distributes the 7.5% **upward** across 4 sponsor levels:
- **Level 1 (Direct Sponsor)**: 14% of the 7.5% = 1.05% of total fare
- **Level 2 (Level 2 Sponsor)**: 6% of the 7.5% = 0.45% of total fare
- **Level 3 (Level 3 Sponsor)**: 3.6% of the 7.5% = 0.27% of total fare
- **Level 4 (Level 4 Sponsor)**: 1% of the 7.5% = 0.075% of total fare

### How It Works
1. When a ride is completed, the system identifies both the user (passenger) and driver
2. For each person, it traverses their referral tree **upward** to find their sponsors up to 4 levels
3. Earnings are distributed to the **sponsors** at each level (you receive from your downline's activities)
4. Each user accumulates earnings from both trees when their downline members take rides
5. All transactions are logged with ride ID, level, tree type, and timestamp

### User MLM Balance Structure
Each user has an `mlmBalance` object containing:
```javascript
{
  total: Number,           // Total earnings from both trees
  userTree: Number,        // Earnings from user referral tree
  driverTree: Number,      // Earnings from driver referral tree
  transactions: [          // Array of all MLM transactions
    {
      amount: Number,
      rideId: String,
      level: Number,       // 1-4
      treeType: String,    // 'user' or 'driver'
      timestamp: Date,
      type: String         // 'earning' or 'withdrawal'
    }
  ]
}
```

### API Endpoints for Dual-Tree MLM
- `POST /api/mlm/distribute-dual-tree` - Distribute earnings after ride completion
- `GET /api/mlm/user-earnings/:userId` - Get user's MLM earnings summary
- `GET /api/mlm/earnings-stats` - Get admin statistics for dual-tree earnings

---

## Traditional MLM System

## Percentage Distribution

### Main Distribution (100% of the 15% ride fare)
- **DDR (Direct Referral Distribution)**: 24%
- **CRR (Customer Referral Reward)**: 13.3%
- **BBR (Business Builder Reward)**: 6%
- **HLR (High Level Reward)**: 6.7%
- **Regional Ambassador**: 0.4%
- **Porparle Team Pool**: 10%
- **ROP (Regional Operations Pool)**: 3%
- **Company Operations & Management**: 3%
- **Technology Pool**: 2.6%
- **Foundation Pool**: 1%
- **Public Share**: 15%
- **Net Profit**: 15%

### DDR Sub-distribution (24%)
- **Level 1**: 14%
- **Level 2**: 6%
- **Level 3**: 3.6%
- **Level 4**: 1%

### Porparle Team Sub-distribution (10%)
- **GC (General Council)**: 4%
- **LA (Legal Advisor)**: 3%
- **CEO**: 25%
- **COO**: 20%
- **CMO**: 13%
- **CFO**: 12%
- **CTO**: 10%
- **CHRO**: 15%
- **Top Team Performance**: 3%

### Top Team Performance Sub-distribution (3%)
- **Winner**: 2%
- **Fighter**: 1%

### Company Operations Sub-distribution (3%)
- **Operation Expense**: 1%
- **Organization Event**: 2%

### Public Share Sub-distribution (15%)
- **Chairman Founder**: 3%
- **Shareholder 1**: 3%
- **Shareholder 2**: 3%
- **Shareholder 3**: 3%

## API Endpoints

### 1. Create MLM System
```
POST /api/mlm/create
```
Creates the initial MLM system with default percentages.

### 2. Get MLM System
```
GET /api/mlm
```
Retrieves the current MLM system configuration and balances.

### 3. Update MLM System
```
PUT /api/mlm/update
```
Updates MLM system percentages (admin only).

### 4. Add Money to MLM
```
POST /api/mlm/add-money
```
Adds money to the MLM system after ride completion.

**Request Body:**
```json
{
  "userId": "user_id_here",
  "amount": 15.00,
  "rideId": "ride_123"
}
```

### 5. Get User MLM Info
```
GET /api/mlm/user/:userId
```
Retrieves MLM information for a specific user.

### 6. Get MLM Statistics
```
GET /api/mlm/stats
```
Retrieves MLM system statistics (admin only).

## Usage Examples

### Adding Money After Ride Completion
```javascript
import { addMoneyToMLM } from './utils/mlmHelper.js';

// After ride completion
const result = await addMoneyToMLM(userId, rideAmount * 0.15, rideId);
if (result.success) {
  console.log('Money added to MLM:', result.distribution);
}
```

### Dual-Tree MLM Distribution Example
```javascript
// Example: Distribute MLM earnings after ride completion
const totalFare = 2000; // $20.00 in cents
const mlmAmount = totalFare * 0.15; // Calculate 15% for MLM

const result = await distributeDualTreeMLMEarnings({
  userId: "user123",
  driverId: "driver456", 
  mlmAmount: mlmAmount, // Pass 15% amount directly (300 cents = $3.00)
  rideId: "ride789"
});
```

### Getting MLM Distribution
```javascript
import { getMLMDistribution } from './utils/mlmHelper.js';

const distribution = await getMLMDistribution(100);
console.log('Distribution for $100:', distribution);
```

## Database Schema

The MLM system stores:
- Configuration percentages
- Transaction history
- Current pool balances
- User transaction tracking
- System status and timestamps

## Validation

The system automatically validates that:
- Main distribution percentages add up to 100%
- All sub-distributions are properly calculated
- Transaction amounts are positive numbers

## Integration

To integrate with the ride completion system:
1. Call `addMoneyToMLM(userId, amount, rideId)` after successful ride completion
2. The amount should be 15% of the ride fare
3. The system will automatically distribute the amount according to configured percentages

## Admin Functions

Admins can:
- Modify percentage distributions
- View system statistics
- Monitor pool balances
- Track all transactions
- Reset the system if needed

## Security Notes

- Admin-only endpoints should be protected with proper middleware
- User data access should be restricted to own information
- All transactions are logged for audit purposes