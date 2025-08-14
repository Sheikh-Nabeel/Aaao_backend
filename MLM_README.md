# MLM System Documentation

## Overview
The MLM (Multi-Level Marketing) system is designed to distribute 15% of each ride fare across various pools and levels. The system automatically calculates distributions based on configured percentages and tracks all transactions.

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