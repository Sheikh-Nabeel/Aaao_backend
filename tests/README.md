# MLM Distribution System Test Suite

This test suite comprehensively tests the MLM ride distribution system to ensure all components work correctly.

## What It Tests

The test suite verifies:

1. **PGP Distribution** - User and driver receive 50% of fare as Personal Growth Points
2. **TGP Distribution** - Upline sponsors (4 levels) receive 50% of fare as Team Growth Points
3. **MLM Amount Distribution** - 15% of fare is added to MLM system pools
4. **Driver Payment** - Driver receives 85% of fare
5. **DDR Payments** - Upline sponsors receive Direct Driver Rewards based on MLM configuration
6. **CRR Rank Updates** - All users' Challenger Rank Rewards ranks are updated after points are added
7. **HLR Qualification** - HonorPay Loyalty Rewards qualification is checked for all users
8. **BBR Participation** - Best Booking Rewards participation is updated for all users
9. **MLM System Transactions** - Transactions are properly recorded in MLM system
10. **Data Persistence** - All data is correctly saved to the database

## Prerequisites

- MongoDB database connection configured in `.env` file
- Node.js installed
- All dependencies installed (`npm install`)

## Running the Test

### Option 1: Using npm script
```bash
npm run test:mlm
```

### Option 2: Direct execution
```bash
node tests/testMlmDistributeRide.js
```

## Test Structure

The test creates a complete referral tree:
- **Level 4 Sponsor** (top of tree)
- **Level 3 Sponsor**
- **Level 2 Sponsor**
- **Level 1 Sponsor** (direct sponsor)
- **Test User** (ride passenger)
- **Test Driver** (ride driver)

## Test Configuration

Default test configuration:
- **Total Fare**: 1000 AED
- **Expected MLM Amount**: 150 AED (15%)
- **Expected PGP**: 500 AED (50%)
- **Expected TGP**: 500 AED (50%)
- **Expected Driver Payment**: 850 AED (85%)

You can modify these values in the `TEST_CONFIG` object in the test file.

## Test Output

The test will output:
- ✅ Setup progress
- ✅ Distribution execution
- ✅ Verification results for each test
- 📊 Final summary with pass/fail counts

## Cleanup

The test automatically:
- Creates test users with `test_` prefix in username
- Cleans up all test users after completion
- Closes database connections

## Expected Results

All 13 tests should pass:
1. User PGP Points
2. Driver PGP Points
3. Driver Payment
4. Level 1 Sponsor TGP
5. Level 2 Sponsor TGP
6. Level 3 Sponsor TGP
7. Level 4 Sponsor TGP
8. DDR Payments
9. CRR Rank Updates
10. HLR Qualification Structure
11. BBR Participation
12. MLM System Transactions
13. MLM Total Amount

## Troubleshooting

### Database Connection Error
- Ensure MongoDB is running
- Check `.env` file has correct `MONGO_URL`
- Verify database credentials

### Test Users Already Exist
- The test automatically cleans up users with `test_` prefix
- If cleanup fails, manually delete test users from database

### Import Errors
- Ensure all dependencies are installed: `npm install`
- Check that all model files exist in `models/` directory
- Verify controller exports are correct

## Notes

- The test uses a real database connection - ensure you're using a test database
- Test data is automatically cleaned up after execution
- The test creates a complete MLM system if one doesn't exist
- All test users are created with unique timestamps to avoid conflicts

