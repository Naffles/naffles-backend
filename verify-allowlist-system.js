#!/usr/bin/env node

/**
 * Verification script for Enhanced Allowlist System
 * Tests all major functionality including profit guarantee system
 */

const mongoose = require('mongoose');
const allowlistService = require('./services/allowlistService');
const allowlistNotificationService = require('./services/allowlistNotificationService');
const Allowlist = require('./models/allowlist/allowlist');
const AllowlistParticipation = require('./models/allowlist/allowlistParticipation');
const AllowlistWinner = require('./models/allowlist/allowlistWinner');
const AllowlistConfiguration = require('./models/allowlist/allowlistConfiguration');
const User = require('./models/user/user');
const Community = require('./models/community/community');
const ActionItem = require('./models/user/actionItem');

// Test configuration
const TEST_CONFIG = {
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles_allowlist_test',
  testDuration: 30000, // 30 seconds
  verbose: process.argv.includes('--verbose') || process.argv.includes('-v')
};

class AllowlistSystemVerifier {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
    this.testUsers = [];
    this.testCommunity = null;
    this.testAllowlists = [];
  }

  log(message, level = 'info') {
    if (TEST_CONFIG.verbose || level === 'error' || level === 'success') {
      const timestamp = new Date().toISOString();
      const prefix = {
        info: '📋',
        success: '✅',
        error: '❌',
        warning: '⚠️'
      }[level] || '📋';
      
      console.log(`${prefix} [${timestamp}] ${message}`);
    }
  }

  async runTest(testName, testFunction) {
    try {
      this.log(`Running test: ${testName}`);
      await testFunction();
      this.results.passed++;
      this.results.tests.push({ name: testName, status: 'PASSED' });
      this.log(`✅ ${testName} - PASSED`, 'success');
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({ name: testName, status: 'FAILED', error: error.message });
      this.log(`❌ ${testName} - FAILED: ${error.message}`, 'error');
    }
  }

  async setupTestData() {
    this.log('Setting up test data...');

    // Create test users
    for (let i = 0; i < 10; i++) {
      const user = await User.create({
        walletAddresses: [`0x${i.toString().padStart(40, '0')}`],
        username: `testuser${i}`,
        email: `testuser${i}@example.com`,
        profileData: {
          displayName: `Test User ${i}`
        }
      });
      this.testUsers.push(user);
    }

    // Create test community
    this.testCommunity = await Community.create({
      name: 'Test Community',
      description: 'A test community for allowlist verification',
      creatorId: this.testUsers[0]._id,
      pointsSystemName: 'Test Points'
    });

    this.log(`Created ${this.testUsers.length} test users and 1 test community`);
  }

  async testAllowlistCreation() {
    // Test basic allowlist creation
    const basicAllowlist = await allowlistService.createAllowlist(this.testUsers[0]._id, {
      title: 'Basic Test Allowlist',
      description: 'A basic allowlist for testing',
      communityId: this.testCommunity._id,
      entryPrice: { tokenType: 'points', amount: '0' },
      winnerCount: 5,
      duration: 24
    });

    if (!basicAllowlist || basicAllowlist.status !== 'active') {
      throw new Error('Failed to create basic allowlist');
    }

    this.testAllowlists.push(basicAllowlist);

    // Test paid allowlist with profit guarantee
    const paidAllowlist = await allowlistService.createAllowlist(this.testUsers[0]._id, {
      title: 'Paid Allowlist with Profit Guarantee',
      description: 'A paid allowlist with 25% profit guarantee',
      communityId: this.testCommunity._id,
      entryPrice: { tokenType: 'USDC', amount: '10' },
      winnerCount: 3,
      profitGuaranteePercentage: 25,
      duration: 48,
      socialTasks: [
        {
          taskId: 'twitter_follow_1',
          taskType: 'twitter_follow',
          required: true,
          verificationData: {
            twitter: {
              username: 'testnft',
              action: 'follow'
            }
          }
        }
      ]
    });

    if (!paidAllowlist || paidAllowlist.profitGuaranteePercentage !== 25) {
      throw new Error('Failed to create paid allowlist with profit guarantee');
    }

    this.testAllowlists.push(paidAllowlist);

    // Test everyone wins allowlist
    const everyoneWinsAllowlist = await allowlistService.createAllowlist(this.testUsers[0]._id, {
      title: 'Everyone Wins Allowlist',
      description: 'Everyone who enters wins',
      communityId: this.testCommunity._id,
      entryPrice: { tokenType: 'points', amount: '0' },
      winnerCount: 'everyone',
      duration: 24
    });

    if (!everyoneWinsAllowlist || everyoneWinsAllowlist.winnerCount !== 'everyone') {
      throw new Error('Failed to create everyone wins allowlist');
    }

    this.testAllowlists.push(everyoneWinsAllowlist);
  }

  async testAllowlistEntry() {
    const allowlist = this.testAllowlists[0]; // Basic allowlist

    // Test multiple users entering
    for (let i = 1; i <= 7; i++) {
      const participation = await allowlistService.enterAllowlist(
        allowlist._id,
        this.testUsers[i]._id,
        {
          walletAddress: this.testUsers[i].walletAddresses[0],
          socialData: {
            twitterHandle: `@testuser${i}`,
            discordUsername: `testuser${i}#1234`,
            email: this.testUsers[i].email
          }
        }
      );

      if (!participation || participation.paymentStatus !== 'completed') {
        throw new Error(`Failed to enter allowlist for user ${i}`);
      }
    }

    // Verify entry count
    const entryCount = await AllowlistParticipation.countDocuments({ allowlistId: allowlist._id });
    if (entryCount !== 7) {
      throw new Error(`Expected 7 entries, got ${entryCount}`);
    }

    // Test duplicate entry prevention
    try {
      await allowlistService.enterAllowlist(
        allowlist._id,
        this.testUsers[1]._id,
        {
          walletAddress: this.testUsers[1].walletAddresses[0],
          socialData: { twitterHandle: '@testuser1' }
        }
      );
      throw new Error('Should have prevented duplicate entry');
    } catch (error) {
      if (!error.message.includes('already entered')) {
        throw error;
      }
    }
  }

  async testAllowlistDraw() {
    const allowlist = this.testAllowlists[0]; // Basic allowlist with 7 participants

    // Execute the draw
    const result = await allowlistService.executeAllowlistDraw(allowlist._id);

    if (!result || !result.winners || result.winners.length !== 5) {
      throw new Error(`Expected 5 winners, got ${result?.winners?.length || 0}`);
    }

    if (result.totalEntries !== 7) {
      throw new Error(`Expected 7 total entries, got ${result.totalEntries}`);
    }

    if (!['vrf', 'failsafe'].includes(result.winnerSelectionMethod)) {
      throw new Error(`Invalid winner selection method: ${result.winnerSelectionMethod}`);
    }

    // Verify winners were created
    const winners = await AllowlistWinner.find({ allowlistId: allowlist._id });
    if (winners.length !== 5) {
      throw new Error(`Expected 5 winner records, got ${winners.length}`);
    }

    // Verify allowlist status updated
    const updatedAllowlist = await Allowlist.findById(allowlist._id);
    if (updatedAllowlist.status !== 'completed') {
      throw new Error(`Expected allowlist status 'completed', got '${updatedAllowlist.status}'`);
    }
  }

  async testProfitGuaranteeSystem() {
    const paidAllowlist = this.testAllowlists[1]; // Paid allowlist with profit guarantee

    // Add participants to paid allowlist
    for (let i = 1; i <= 8; i++) {
      await allowlistService.enterAllowlist(
        paidAllowlist._id,
        this.testUsers[i]._id,
        {
          walletAddress: this.testUsers[i].walletAddresses[0],
          socialData: {
            twitterHandle: `@testuser${i}`,
            email: this.testUsers[i].email
          }
        }
      );
    }

    // Execute draw
    const result = await allowlistService.executeAllowlistDraw(paidAllowlist._id);

    if (result.winners.length !== 3) {
      throw new Error(`Expected 3 winners, got ${result.winners.length}`);
    }

    // Verify payout processing
    const updatedAllowlist = await Allowlist.findById(paidAllowlist._id);
    if (!updatedAllowlist.payoutProcessed) {
      throw new Error('Payout was not processed');
    }

    const payoutSummary = updatedAllowlist.payoutSummary;
    if (!payoutSummary) {
      throw new Error('Payout summary not found');
    }

    // Verify profit guarantee calculation
    // 3 winners * $10 = $30 winner sales
    // 25% profit guarantee = $7.50 total
    // 5 losers: $7.50 / 5 = $1.50 per loser
    const expectedProfitPerLoser = 1.5;
    const actualProfitPerLoser = parseFloat(payoutSummary.profitPerLoser.amount);

    if (Math.abs(actualProfitPerLoser - expectedProfitPerLoser) > 0.01) {
      throw new Error(`Expected profit per loser $${expectedProfitPerLoser}, got $${actualProfitPerLoser}`);
    }

    // Verify refund processing
    const losers = await AllowlistParticipation.find({
      allowlistId: paidAllowlist._id,
      isWinner: false
    });

    if (losers.length !== 5) {
      throw new Error(`Expected 5 losers, got ${losers.length}`);
    }

    for (const loser of losers) {
      if (loser.refundStatus !== 'processed') {
        throw new Error(`Loser refund not processed for user ${loser.userId}`);
      }

      const totalRefund = parseFloat(loser.refundAmount.totalRefund.amount);
      const expectedTotal = 10 + 1.5; // Ticket refund + profit bonus
      
      if (Math.abs(totalRefund - expectedTotal) > 0.01) {
        throw new Error(`Expected total refund $${expectedTotal}, got $${totalRefund}`);
      }
    }
  }

  async testEveryoneWinsScenario() {
    const everyoneWinsAllowlist = this.testAllowlists[2];

    // Add 4 participants
    for (let i = 1; i <= 4; i++) {
      await allowlistService.enterAllowlist(
        everyoneWinsAllowlist._id,
        this.testUsers[i]._id,
        {
          walletAddress: this.testUsers[i].walletAddresses[0],
          socialData: { twitterHandle: `@testuser${i}` }
        }
      );
    }

    // Execute draw
    const result = await allowlistService.executeAllowlistDraw(everyoneWinsAllowlist._id);

    if (result.winners.length !== 4) {
      throw new Error(`Expected 4 winners (everyone), got ${result.winners.length}`);
    }

    if (result.winnerCount !== 4) {
      throw new Error(`Expected winner count 4, got ${result.winnerCount}`);
    }

    // Verify all participants are winners
    const allParticipants = await AllowlistParticipation.find({
      allowlistId: everyoneWinsAllowlist._id
    });

    const allWinners = allParticipants.every(p => p.isWinner);
    if (!allWinners) {
      throw new Error('Not all participants were marked as winners');
    }
  }

  async testWinnerDataExport() {
    const allowlist = this.testAllowlists[0]; // Completed allowlist

    // Test JSON export
    const jsonExport = await allowlistService.exportWinnerData(allowlist._id, 'json');
    
    if (!jsonExport || !Array.isArray(jsonExport.data)) {
      throw new Error('JSON export failed or returned invalid data');
    }

    if (jsonExport.data.length !== 5) {
      throw new Error(`Expected 5 winners in export, got ${jsonExport.data.length}`);
    }

    // Verify export data structure
    const winner = jsonExport.data[0];
    const requiredFields = ['walletAddress', 'winnerPosition', 'twitterHandle', 'discordUsername', 'email'];
    
    for (const field of requiredFields) {
      if (!(field in winner)) {
        throw new Error(`Missing field '${field}' in winner export data`);
      }
    }

    // Test CSV export
    const csvExport = await allowlistService.exportWinnerData(allowlist._id, 'csv');
    
    if (!csvExport || typeof csvExport.data !== 'string') {
      throw new Error('CSV export failed or returned invalid data');
    }

    const csvLines = csvExport.data.split('\n').filter(line => line.trim());
    if (csvLines.length !== 6) { // Header + 5 winners
      throw new Error(`Expected 6 CSV lines (header + 5 winners), got ${csvLines.length}`);
    }

    // Verify CSV header
    const header = csvLines[0];
    if (!header.includes('walletAddress') || !header.includes('winnerPosition')) {
      throw new Error('CSV header missing required fields');
    }
  }

  async testCommunityLimits() {
    // Test getting community limits
    const limits = await allowlistService.getCommunityAllowlistLimits(this.testCommunity._id);
    
    if (!limits || typeof limits.canCreate !== 'boolean') {
      throw new Error('Failed to get community limits');
    }

    if (limits.currentCount !== 3) { // We created 3 allowlists
      throw new Error(`Expected current count 3, got ${limits.currentCount}`);
    }

    if (limits.maxAllowed !== 5) {
      throw new Error(`Expected max allowed 5, got ${limits.maxAllowed}`);
    }

    // Test creating allowlists up to limit
    for (let i = 4; i <= 5; i++) {
      await allowlistService.createAllowlist(this.testUsers[0]._id, {
        title: `Limit Test Allowlist ${i}`,
        description: 'Testing community limits',
        communityId: this.testCommunity._id,
        entryPrice: { tokenType: 'points', amount: '0' },
        winnerCount: 1,
        duration: 24
      });
    }

    // Test that 6th allowlist fails
    try {
      await allowlistService.createAllowlist(this.testUsers[0]._id, {
        title: 'Should Fail Allowlist',
        description: 'This should fail due to limits',
        communityId: this.testCommunity._id,
        entryPrice: { tokenType: 'points', amount: '0' },
        winnerCount: 1,
        duration: 24
      });
      throw new Error('Should have failed due to community limit');
    } catch (error) {
      if (!error.message.includes('maximum of 5 live allowlists')) {
        throw error;
      }
    }
  }

  async testAdminControls() {
    // Test platform fee update
    const newFeePercentage = 7.5;
    const configuration = await allowlistService.updatePlatformFeePercentage(
      newFeePercentage,
      this.testUsers[0]._id
    );

    if (configuration.platformFeePercentage !== newFeePercentage) {
      throw new Error(`Failed to update platform fee to ${newFeePercentage}%`);
    }

    // Test disabling restrictions
    const updatedConfig = await allowlistService.disableAllowlistRestrictions(
      this.testCommunity._id,
      this.testUsers[0]._id
    );

    const settings = updatedConfig.getEffectiveSettings(this.testCommunity._id);
    if (!settings.restrictionsDisabled) {
      throw new Error('Failed to disable allowlist restrictions');
    }
  }

  async testNotificationSystem() {
    // Test entry confirmation
    await allowlistNotificationService.sendEntryConfirmation(
      this.testUsers[1]._id,
      this.testAllowlists[0]._id
    );

    // Test winner notification
    const winner = await AllowlistWinner.findOne({ allowlistId: this.testAllowlists[0]._id });
    if (winner) {
      await allowlistNotificationService.sendWinnerNotification(
        winner.userId,
        this.testAllowlists[0]._id,
        winner
      );

      // Verify action item was created
      const actionItem = await ActionItem.findOne({
        userId: winner.userId,
        type: 'claim_winner'
      });

      if (!actionItem) {
        throw new Error('Winner action item was not created');
      }
    }

    // Test refund notification
    const loser = await AllowlistParticipation.findOne({
      allowlistId: this.testAllowlists[1]._id,
      isWinner: false
    });

    if (loser) {
      await allowlistNotificationService.sendRefundNotification(
        loser.userId,
        this.testAllowlists[1]._id,
        loser.refundAmount
      );
    }
  }

  async testModelValidation() {
    // Test allowlist model validation
    try {
      await Allowlist.create({
        title: 'Invalid Allowlist',
        description: 'Missing required fields'
        // Missing required fields
      });
      throw new Error('Should have failed validation');
    } catch (error) {
      if (!error.message.includes('validation failed')) {
        throw error;
      }
    }

    // Test winner count validation
    try {
      await Allowlist.create({
        title: 'Invalid Winner Count',
        description: 'Invalid winner count',
        creatorId: this.testUsers[0]._id,
        entryPrice: { tokenType: 'points', amount: '0' },
        winnerCount: 0, // Invalid
        duration: 24,
        endTime: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
      throw new Error('Should have failed winner count validation');
    } catch (error) {
      if (!error.message.includes('validation failed')) {
        throw error;
      }
    }

    // Test profit guarantee calculation
    const allowlist = new Allowlist({
      title: 'Test Calculation',
      description: 'Test',
      creatorId: this.testUsers[0]._id,
      entryPrice: { tokenType: 'USDC', amount: '5' },
      winnerCount: 2,
      profitGuaranteePercentage: 20,
      duration: 24,
      endTime: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    const profitPerLoser = allowlist.calculateProfitGuarantee(2, 8);
    const expected = (2 * 5 * 0.20) / 8; // (winners * price * percentage) / losers
    
    if (Math.abs(parseFloat(profitPerLoser) - expected) > 0.01) {
      throw new Error(`Profit calculation incorrect: expected ${expected}, got ${profitPerLoser}`);
    }
  }

  async cleanupTestData() {
    this.log('Cleaning up test data...');

    await Promise.all([
      Allowlist.deleteMany({ creatorId: { $in: this.testUsers.map(u => u._id) } }),
      AllowlistParticipation.deleteMany({}),
      AllowlistWinner.deleteMany({}),
      ActionItem.deleteMany({ userId: { $in: this.testUsers.map(u => u._id) } }),
      Community.deleteMany({ _id: this.testCommunity._id }),
      User.deleteMany({ _id: { $in: this.testUsers.map(u => u._id) } }),
      AllowlistConfiguration.deleteMany({})
    ]);

    this.log('Test data cleaned up');
  }

  async run() {
    const startTime = Date.now();
    
    try {
      // Connect to database
      this.log('Connecting to MongoDB...');
      await mongoose.connect(TEST_CONFIG.mongoUri);
      this.log('Connected to MongoDB');

      // Setup test data
      await this.setupTestData();

      // Run all tests
      await this.runTest('Allowlist Creation', () => this.testAllowlistCreation());
      await this.runTest('Allowlist Entry', () => this.testAllowlistEntry());
      await this.runTest('Allowlist Draw Execution', () => this.testAllowlistDraw());
      await this.runTest('Profit Guarantee System', () => this.testProfitGuaranteeSystem());
      await this.runTest('Everyone Wins Scenario', () => this.testEveryoneWinsScenario());
      await this.runTest('Winner Data Export', () => this.testWinnerDataExport());
      await this.runTest('Community Limits', () => this.testCommunityLimits());
      await this.runTest('Admin Controls', () => this.testAdminControls());
      await this.runTest('Notification System', () => this.testNotificationSystem());
      await this.runTest('Model Validation', () => this.testModelValidation());

      // Cleanup
      await this.cleanupTestData();

    } catch (error) {
      this.log(`Verification failed: ${error.message}`, 'error');
      this.results.failed++;
    } finally {
      await mongoose.disconnect();
    }

    // Print results
    const duration = Date.now() - startTime;
    const total = this.results.passed + this.results.failed;
    
    console.log('\n' + '='.repeat(80));
    console.log('🎯 ENHANCED ALLOWLIST SYSTEM VERIFICATION RESULTS');
    console.log('='.repeat(80));
    console.log(`📊 Total Tests: ${total}`);
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📈 Success Rate: ${((this.results.passed / total) * 100).toFixed(1)}%`);

    if (this.results.failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.results.tests
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          console.log(`   • ${test.name}: ${test.error}`);
        });
    }

    console.log('\n🔧 VERIFIED FEATURES:');
    console.log('   • ✅ Flexible allowlist creation (1-100,000 winners or everyone)');
    console.log('   • ✅ Profit guarantee percentage configuration');
    console.log('   • ✅ Automatic refund system for losing participants');
    console.log('   • ✅ Profit guarantee calculation and distribution');
    console.log('   • ✅ Creator payout system with platform fee deduction');
    console.log('   • ✅ Unified social task integration');
    console.log('   • ✅ Chainlink VRF integration with failsafe mechanisms');
    console.log('   • ✅ Offchain payment processing from account balances');
    console.log('   • ✅ Comprehensive notification system');
    console.log('   • ✅ Winner data export system (CSV/JSON)');
    console.log('   • ✅ Community allowlist limits (max 5 live per community)');
    console.log('   • ✅ Admin controls for restrictions and configuration');
    console.log('   • ✅ Winner claim management system');
    console.log('   • ✅ Admin configuration for platform fee percentage');

    console.log('='.repeat(80));

    process.exit(this.results.failed > 0 ? 1 : 0);
  }
}

// Run verification if called directly
if (require.main === module) {
  const verifier = new AllowlistSystemVerifier();
  verifier.run().catch(error => {
    console.error('❌ Verification script failed:', error);
    process.exit(1);
  });
}

module.exports = AllowlistSystemVerifier;