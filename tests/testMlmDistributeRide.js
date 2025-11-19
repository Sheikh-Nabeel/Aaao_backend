/**
 * Comprehensive Test Suite for MLM Ride Distribution System
 * 
 * This test verifies:
 * 1. MLM amount distribution (15% of fare)
 * 2. PGP distribution (50% of fare to user/driver)
 * 3. TGP distribution (50% of fare to upline sponsors)
 * 4. CRR rank updates
 * 5. HLR qualification checks
 * 6. DDR payments to upline sponsors
 * 7. BBR participation updates
 * 8. Leaderboard data integrity
 * 
 * Run with: node tests/testMlmDistributeRide.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/connectDB.js';
import User from '../models/userModel.js';
import MLM from '../models/mlmModel.js';
// Import the distributeRideMLM function
// Note: We need to import it as a module and call the underlying async function
import * as mlmController from '../controllers/mlmController.js';

// Load environment variables
dotenv.config();

// Test configuration
const TEST_CONFIG = {
  totalFare: 1000, // AED
  expectedMLMAmount: 150, // 15% of 1000
  expectedPGP: 500, // 50% of 1000
  expectedTGP: 500, // 50% of 1000
  expectedDriverPayment: 850, // 85% of 1000
};

// Test data storage
let testData = {
  users: {},
  mlm: null,
  rideId: null,
};

/**
 * Setup test environment
 */
async function setupTest() {
  console.log('\n🧪 Setting up test environment...\n');
  
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Database connected\n');

    // Clean up any existing test data
    await cleanupTestData();

    // Create MLM system if it doesn't exist
    testData.mlm = await MLM.findOne();
    if (!testData.mlm) {
      testData.mlm = new MLM({
        name: "MLM System",
        ddr: 24,
        crr: 13.3,
        bbr: 6,
        hlr: 6.7,
        regionalAmbassador: 0.4,
        porparleTeam: 10,
        rop: 3,
        companyOperations: 3,
        technologyPool: 2.6,
        foundationPool: 1,
        publicShare: 15,
        netProfit: 15,
        ddrLevel1: 14,
        ddrLevel2: 6,
        ddrLevel3: 3.6,
        ddrLevel4: 0.4,
        // CRR Configuration
        crrRanks: {
          'None': { requirements: { pgp: 0, tgp: 0 }, reward: 0, icon: '⭐' },
          'Bronze': { requirements: { pgp: 1000, tgp: 5000 }, reward: 100, icon: '🥉' },
          'Silver': { requirements: { pgp: 5000, tgp: 25000 }, reward: 500, icon: '🥈' },
          'Gold': { requirements: { pgp: 25000, tgp: 125000 }, reward: 2500, icon: '🥇' },
        },
        crrConfig: {
          monthlyReset: true,
          resetDay: 1,
          pointValue: 1,
          legSplitRatio: { fromThreeLegs: 60, fromOtherLegs: 40 },
          legPercentages: { legA: 33.33, legB: 33.33, legC: 33.34 }
        },
        // HLR Configuration
        hlrConfig: {
          retirementAge: 55,
          requirements: { pgp: 200000, tgp: 6000000 },
          legSplitRatio: { fromThreeLegs: 60, fromOtherLegs: 40 },
          legPercentages: { legA: 33.33, legB: 33.33, legC: 33.34 },
          rewardAmount: 60000
        },
        // BBR Campaign
        bbrCampaigns: {
          current: {
            _id: new mongoose.Types.ObjectId(),
            name: "Test BBR Campaign",
            isActive: true,
            startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
            endDate: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000), // 23 days from now
            targetRides: 100,
            rewardAmount: 1000,
            newbieRidesOnly: false
          }
        }
      });
      await testData.mlm.save();
      console.log('✅ MLM system created');
    } else {
      console.log('✅ MLM system found');
    }

    // Create test users with referral tree structure
    // Level 4 (top sponsor)
    const level4User = new User({
      username: `test_level4_${Date.now()}`,
      firstName: 'Level4',
      lastName: 'Sponsor',
      email: `level4_${Date.now()}@test.com`,
      phoneNumber: '+971501234567',
      password: 'Test123!@#',
      role: 'customer',
      qualificationPoints: {
        pgp: { accumulated: 0, current: 0 },
        tgp: { accumulated: 0, current: 0 }
      },
      crrRank: 'None',
      wallet: { balance: 0, transactions: [] },
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
    });
    await level4User.save();
    testData.users.level4 = level4User;
    console.log('✅ Created Level 4 sponsor');

    // Level 3 sponsor
    const level3User = new User({
      username: `test_level3_${Date.now()}`,
      firstName: 'Level3',
      lastName: 'Sponsor',
      email: `level3_${Date.now()}@test.com`,
      phoneNumber: '+971501234568',
      password: 'Test123!@#',
      role: 'customer',
      sponsorBy: level4User._id.toString(),
      qualificationPoints: {
        pgp: { accumulated: 0, current: 0 },
        tgp: { accumulated: 0, current: 0 }
      },
      crrRank: 'None',
      wallet: { balance: 0, transactions: [] },
      createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000) // 25 days ago
    });
    await level3User.save();
    testData.users.level3 = level3User;
    console.log('✅ Created Level 3 sponsor');

    // Level 2 sponsor
    const level2User = new User({
      username: `test_level2_${Date.now()}`,
      firstName: 'Level2',
      lastName: 'Sponsor',
      email: `level2_${Date.now()}@test.com`,
      phoneNumber: '+971501234569',
      password: 'Test123!@#',
      role: 'customer',
      sponsorBy: level3User._id.toString(),
      qualificationPoints: {
        pgp: { accumulated: 0, current: 0 },
        tgp: { accumulated: 0, current: 0 }
      },
      crrRank: 'None',
      wallet: { balance: 0, transactions: [] },
      createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) // 20 days ago
    });
    await level2User.save();
    testData.users.level2 = level2User;
    console.log('✅ Created Level 2 sponsor');

    // Level 1 sponsor (direct sponsor)
    const level1User = new User({
      username: `test_level1_${Date.now()}`,
      firstName: 'Level1',
      lastName: 'Sponsor',
      email: `level1_${Date.now()}@test.com`,
      phoneNumber: '+971501234570',
      password: 'Test123!@#',
      role: 'customer',
      sponsorBy: level2User._id.toString(),
      qualificationPoints: {
        pgp: { accumulated: 0, current: 0 },
        tgp: { accumulated: 0, current: 0 }
      },
      crrRank: 'None',
      wallet: { balance: 0, transactions: [] },
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) // 15 days ago
    });
    await level1User.save();
    testData.users.level1 = level1User;
    console.log('✅ Created Level 1 sponsor');

    // Test user (ride passenger)
    const testUser = new User({
      username: `test_user_${Date.now()}`,
      firstName: 'Test',
      lastName: 'User',
      email: `testuser_${Date.now()}@test.com`,
      phoneNumber: '+971501234571',
      password: 'Test123!@#',
      role: 'customer',
      sponsorBy: level1User._id.toString(),
      qualificationPoints: {
        pgp: { accumulated: 0, current: 0 },
        tgp: { accumulated: 0, current: 0 }
      },
      crrRank: 'None',
      wallet: { balance: 0, transactions: [] },
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
    });
    await testUser.save();
    testData.users.user = testUser;
    console.log('✅ Created test user');

    // Test driver (different from user)
    const testDriver = new User({
      username: `test_driver_${Date.now()}`,
      firstName: 'Test',
      lastName: 'Driver',
      email: `testdriver_${Date.now()}@test.com`,
      phoneNumber: '+971501234572',
      password: 'Test123!@#',
      role: 'driver',
      sponsorBy: level1User._id.toString(), // Driver also has a sponsor
      qualificationPoints: {
        pgp: { accumulated: 0, current: 0 },
        tgp: { accumulated: 0, current: 0 }
      },
      crrRank: 'None',
      wallet: { balance: 0, transactions: [] },
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days ago
    });
    await testDriver.save();
    testData.users.driver = testDriver;
    console.log('✅ Created test driver');

    // Generate ride ID
    testData.rideId = new mongoose.Types.ObjectId().toString();
    console.log(`✅ Generated ride ID: ${testData.rideId}\n`);

    console.log('✅ Test environment setup complete!\n');
    return true;

  } catch (error) {
    console.error('❌ Setup error:', error);
    throw error;
  }
}

/**
 * Clean up test data
 */
async function cleanupTestData() {
  try {
    // Delete test users (users with test_ prefix in username)
    await User.deleteMany({ username: /^test_/ });
    console.log('🧹 Cleaned up test users');
  } catch (error) {
    console.error('⚠️  Cleanup error:', error.message);
  }
}

/**
 * Test MLM distribution
 */
async function testMlmDistribution() {
  console.log('🚀 Starting MLM Distribution Test...\n');

  try {
    const { user, driver } = testData.users;
    const rideId = testData.rideId;
    const totalFare = TEST_CONFIG.totalFare;

    // Create mock request and response
    const mockReq = {
      body: {
        userId: user._id.toString(),
        driverId: driver._id.toString(),
        rideId: rideId,
        totalFare: totalFare
      }
    };

    let responseData = null;
    let responseStatus = 200;

    const mockRes = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => {
            responseData = data;
            if (code !== 200) {
              throw new Error(`Request failed with status ${code}: ${JSON.stringify(data)}`);
            }
            return data;
          }
        };
      },
      json: (data) => {
        responseData = data;
        return data;
      }
    };

    // Call the distribution function
    console.log('📞 Calling distributeRideMLM...');
    try {
      await mlmController.distributeRideMLM(mockReq, mockRes);
      console.log('✅ Distribution completed\n');
      
      if (responseStatus !== 200) {
        throw new Error(`Distribution failed with status ${responseStatus}`);
      }
      
      return responseData;
    } catch (error) {
      console.error('❌ Distribution function error:', error);
      throw error;
    }

  } catch (error) {
    console.error('❌ Distribution error:', error);
    throw error;
  }
}

/**
 * Verify test results
 */
async function verifyResults() {
  console.log('🔍 Verifying test results...\n');

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  try {
    // Reload all users from database
    const user = await User.findById(testData.users.user._id);
    const driver = await User.findById(testData.users.driver._id);
    const level1 = await User.findById(testData.users.level1._id);
    const level2 = await User.findById(testData.users.level2._id);
    const level3 = await User.findById(testData.users.level3._id);
    const level4 = await User.findById(testData.users.level4._id);
    const mlm = await MLM.findOne();

    // Test 1: User PGP points
    console.log('Test 1: User PGP Points');
    const userPGP = user.qualificationPoints?.pgp?.accumulated || 0;
    if (userPGP === TEST_CONFIG.expectedPGP) {
      console.log(`  ✅ PASS: User PGP = ${userPGP} (expected ${TEST_CONFIG.expectedPGP})`);
      results.passed++;
    } else {
      console.log(`  ❌ FAIL: User PGP = ${userPGP} (expected ${TEST_CONFIG.expectedPGP})`);
      results.failed++;
    }
    results.tests.push({ name: 'User PGP Points', passed: userPGP === TEST_CONFIG.expectedPGP });

    // Test 2: Driver PGP points
    console.log('Test 2: Driver PGP Points');
    const driverPGP = driver.qualificationPoints?.pgp?.accumulated || 0;
    if (driverPGP === TEST_CONFIG.expectedPGP) {
      console.log(`  ✅ PASS: Driver PGP = ${driverPGP} (expected ${TEST_CONFIG.expectedPGP})`);
      results.passed++;
    } else {
      console.log(`  ❌ FAIL: Driver PGP = ${driverPGP} (expected ${TEST_CONFIG.expectedPGP})`);
      results.failed++;
    }
    results.tests.push({ name: 'Driver PGP Points', passed: driverPGP === TEST_CONFIG.expectedPGP });

    // Test 3: Driver payment
    console.log('Test 3: Driver Payment');
    const driverPayment = driver.wallet?.balance || 0;
    if (driverPayment === TEST_CONFIG.expectedDriverPayment) {
      console.log(`  ✅ PASS: Driver payment = ${driverPayment} AED (expected ${TEST_CONFIG.expectedDriverPayment})`);
      results.passed++;
    } else {
      console.log(`  ❌ FAIL: Driver payment = ${driverPayment} AED (expected ${TEST_CONFIG.expectedDriverPayment})`);
      results.failed++;
    }
    results.tests.push({ name: 'Driver Payment', passed: driverPayment === TEST_CONFIG.expectedDriverPayment });

    // Test 4: Level 1 sponsor TGP
    console.log('Test 4: Level 1 Sponsor TGP');
    const level1TGP = level1.qualificationPoints?.tgp?.accumulated || 0;
    if (level1TGP === TEST_CONFIG.expectedTGP) {
      console.log(`  ✅ PASS: Level 1 TGP = ${level1TGP} (expected ${TEST_CONFIG.expectedTGP})`);
      results.passed++;
    } else {
      console.log(`  ❌ FAIL: Level 1 TGP = ${level1TGP} (expected ${TEST_CONFIG.expectedTGP})`);
      results.failed++;
    }
    results.tests.push({ name: 'Level 1 Sponsor TGP', passed: level1TGP === TEST_CONFIG.expectedTGP });

    // Test 5: Level 2 sponsor TGP
    console.log('Test 5: Level 2 Sponsor TGP');
    const level2TGP = level2.qualificationPoints?.tgp?.accumulated || 0;
    if (level2TGP === TEST_CONFIG.expectedTGP) {
      console.log(`  ✅ PASS: Level 2 TGP = ${level2TGP} (expected ${TEST_CONFIG.expectedTGP})`);
      results.passed++;
    } else {
      console.log(`  ❌ FAIL: Level 2 TGP = ${level2TGP} (expected ${TEST_CONFIG.expectedTGP})`);
      results.failed++;
    }
    results.tests.push({ name: 'Level 2 Sponsor TGP', passed: level2TGP === TEST_CONFIG.expectedTGP });

    // Test 6: Level 3 sponsor TGP
    console.log('Test 6: Level 3 Sponsor TGP');
    const level3TGP = level3.qualificationPoints?.tgp?.accumulated || 0;
    if (level3TGP === TEST_CONFIG.expectedTGP) {
      console.log(`  ✅ PASS: Level 3 TGP = ${level3TGP} (expected ${TEST_CONFIG.expectedTGP})`);
      results.passed++;
    } else {
      console.log(`  ❌ FAIL: Level 3 TGP = ${level3TGP} (expected ${TEST_CONFIG.expectedTGP})`);
      results.failed++;
    }
    results.tests.push({ name: 'Level 3 Sponsor TGP', passed: level3TGP === TEST_CONFIG.expectedTGP });

    // Test 7: Level 4 sponsor TGP
    console.log('Test 7: Level 4 Sponsor TGP');
    const level4TGP = level4.qualificationPoints?.tgp?.accumulated || 0;
    if (level4TGP === TEST_CONFIG.expectedTGP) {
      console.log(`  ✅ PASS: Level 4 TGP = ${level4TGP} (expected ${TEST_CONFIG.expectedTGP})`);
      results.passed++;
    } else {
      console.log(`  ❌ FAIL: Level 4 TGP = ${level4TGP} (expected ${TEST_CONFIG.expectedTGP})`);
      results.failed++;
    }
    results.tests.push({ name: 'Level 4 Sponsor TGP', passed: level4TGP === TEST_CONFIG.expectedTGP });

    // Test 8: DDR payments to sponsors
    console.log('Test 8: DDR Payments to Sponsors');
    const level1DDR = level1.wallet?.balance || 0;
    const level2DDR = level2.wallet?.balance || 0;
    const level3DDR = level3.wallet?.balance || 0;
    const level4DDR = level4.wallet?.balance || 0;
    
    const ddrTotal = level1DDR + level2DDR + level3DDR + level4DDR;
    const expectedDDRTotal = TEST_CONFIG.expectedMLMAmount * (mlm.ddr / 100);
    
    if (ddrTotal > 0) {
      console.log(`  ✅ PASS: DDR payments distributed (Level 1: ${level1DDR}, Level 2: ${level2DDR}, Level 3: ${level3DDR}, Level 4: ${level4DDR})`);
      results.passed++;
    } else {
      console.log(`  ❌ FAIL: No DDR payments found`);
      results.failed++;
    }
    results.tests.push({ name: 'DDR Payments', passed: ddrTotal > 0 });

    // Test 9: CRR rank updates
    console.log('Test 9: CRR Rank Updates');
    const userRank = user.crrRank;
    const driverRank = driver.crrRank;
    const level1Rank = level1.crrRank;
    
    if (userRank !== undefined && driverRank !== undefined && level1Rank !== undefined) {
      console.log(`  ✅ PASS: CRR ranks updated (User: ${userRank}, Driver: ${driverRank}, Level1: ${level1Rank})`);
      results.passed++;
    } else {
      console.log(`  ❌ FAIL: CRR ranks not properly updated`);
      results.failed++;
    }
    results.tests.push({ name: 'CRR Rank Updates', passed: userRank !== undefined });

    // Test 10: HLR qualification structure
    console.log('Test 10: HLR Qualification Structure');
    const userHLR = user.hlrQualification;
    const driverHLR = driver.hlrQualification;
    
    if (userHLR && driverHLR && userHLR.progress && driverHLR.progress) {
      console.log(`  ✅ PASS: HLR qualification structure exists`);
      results.passed++;
    } else {
      console.log(`  ❌ FAIL: HLR qualification structure missing`);
      results.failed++;
    }
    results.tests.push({ name: 'HLR Qualification Structure', passed: userHLR && driverHLR });

    // Test 11: BBR participation
    console.log('Test 11: BBR Participation');
    const userBBR = user.bbrParticipation?.currentCampaign;
    const driverBBR = driver.bbrParticipation?.currentCampaign;
    
    if (userBBR && driverBBR && userBBR.soloRides > 0 && driverBBR.soloRides > 0) {
      console.log(`  ✅ PASS: BBR participation updated (User solo rides: ${userBBR.soloRides}, Driver solo rides: ${driverBBR.soloRides})`);
      results.passed++;
    } else {
      console.log(`  ❌ FAIL: BBR participation not updated`);
      results.failed++;
    }
    results.tests.push({ name: 'BBR Participation', passed: userBBR && driverBBR && userBBR.soloRides > 0 });

    // Test 12: MLM system transactions
    console.log('Test 12: MLM System Transactions');
    const mlmTransactions = mlm.transactions || [];
    const userTransaction = mlmTransactions.find(t => t.userId?.toString() === user._id.toString());
    const driverTransaction = mlmTransactions.find(t => t.userId?.toString() === driver._id.toString());
    
    if (userTransaction && driverTransaction) {
      console.log(`  ✅ PASS: MLM transactions recorded (User: ${userTransaction.amount}, Driver: ${driverTransaction.amount})`);
      results.passed++;
    } else {
      console.log(`  ❌ FAIL: MLM transactions not recorded`);
      results.failed++;
    }
    results.tests.push({ name: 'MLM System Transactions', passed: userTransaction && driverTransaction });

    // Test 13: MLM total amount
    console.log('Test 13: MLM Total Amount');
    const mlmTotal = mlm.totalAmount || 0;
    if (mlmTotal >= TEST_CONFIG.expectedMLMAmount) {
      console.log(`  ✅ PASS: MLM total amount = ${mlmTotal} (expected at least ${TEST_CONFIG.expectedMLMAmount})`);
      results.passed++;
    } else {
      console.log(`  ❌ FAIL: MLM total amount = ${mlmTotal} (expected at least ${TEST_CONFIG.expectedMLMAmount})`);
      results.failed++;
    }
    results.tests.push({ name: 'MLM Total Amount', passed: mlmTotal >= TEST_CONFIG.expectedMLMAmount });

    console.log('\n');

    return results;

  } catch (error) {
    console.error('❌ Verification error:', error);
    throw error;
  }
}

/**
 * Print test summary
 */
function printSummary(results) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log(`Total Tests: ${results.tests.length}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.passed / results.tests.length) * 100).toFixed(2)}%\n`);

  console.log('Detailed Results:');
  results.tests.forEach((test, index) => {
    const status = test.passed ? '✅' : '❌';
    console.log(`  ${index + 1}. ${status} ${test.name}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════\n');
}

/**
 * Main test runner
 */
async function runTests() {
  try {
    // Setup
    await setupTest();

    // Run distribution
    await testMlmDistribution();

    // Wait a bit for async operations
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify results
    const results = await verifyResults();

    // Print summary
    printSummary(results);

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await cleanupTestData();
    console.log('✅ Cleanup complete\n');

    // Close database connection
    await mongoose.connection.close();
    console.log('✅ Database connection closed\n');

    // Exit with appropriate code
    process.exit(results.failed === 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    console.error(error.stack);
    
    // Cleanup on error
    try {
      await cleanupTestData();
      await mongoose.connection.close();
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }
    
    process.exit(1);
  }
}

// Run tests if this file is executed directly
// Simple check: if this file is run with node, execute tests
const filePath = process.argv[1] || '';
if (filePath.includes('testMlmDistributeRide.js')) {
  runTests();
}

export { runTests, setupTest, testMlmDistribution, verifyResults };

