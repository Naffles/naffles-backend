#!/usr/bin/env node

/**
 * Staking Integration Verification Script
 * 
 * This script verifies that all staking integration components are properly
 * connected and functioning correctly. It performs comprehensive checks
 * across all integration points.
 */

const mongoose = require('mongoose');
const StakingContract = require('./models/staking/stakingContract');
const StakingPosition = require('./models/staking/stakingPosition');
const User = require('./models/user/user');
const PointsBalance = require('./models/points/pointsBalance');
const PointsTransaction = require('./models/points/pointsTransaction');
const Achievement = require('./models/points/achievement');
const UserAchievement = require('./models/points/userAchievement');

const stakingService = require('./services/stakingService');
const stakingIntegrationService = require('./services/stakingIntegrationService');
const stakingRewardDistributionService = require('./services/stakingRewardDistributionService');
const pointsService = require('./services/pointsService');
const achievementService = require('./services/achievementService');
const { initializeStakingAchievements } = require('./scripts/initializeStakingAchievements');

require('dotenv').config();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class StakingIntegrationVerifier {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      checks: []
    };
    this.testData = {};
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  logHeader(message) {
    const border = '='.repeat(80);
    this.log(border, 'cyan');
    this.log(`  ${message}`, 'cyan');
    this.log(border, 'cyan');
  }

  logSection(message) {
    this.log(`\n${'-'.repeat(60)}`, 'blue');
    this.log(`  ${message}`, 'blue');
    this.log(`${'-'.repeat(60)}`, 'blue');
  }

  async check(name, testFunction, critical = false) {
    this.results.total++;
    
    try {
      const startTime = Date.now();
      const result = await testFunction();
      const duration = Date.now() - startTime;
      
      if (result === true || (typeof result === 'object' && result.success !== false)) {
        this.log(`✓ ${name} (${duration}ms)`, 'green');
        this.results.passed++;
        this.results.checks.push({ name, status: 'passed', duration, critical });
        return true;
      } else {
        const message = typeof result === 'object' ? result.message : 'Check failed';
        this.log(`✗ ${name} - ${message} (${duration}ms)`, critical ? 'red' : 'yellow');
        if (critical) {
          this.results.failed++;
        } else {
          this.results.warnings++;
        }
        this.results.checks.push({ name, status: critical ? 'failed' : 'warning', duration, message, critical });
        return false;
      }
    } catch (error) {
      this.log(`✗ ${name} - ERROR: ${error.message}`, 'red');
      this.results.failed++;
      this.results.checks.push({ name, status: 'error', error: error.message, critical });
      return false;
    }
  }

  async setupTestData() {
    this.logSection('Setting Up Test Data');

    // Create test admin user
    this.testData.admin = new User({
      username: 'verificationadmin',
      email: 'verificationadmin@example.com',
      walletAddresses: ['0x0000000000000000000000000000000000000000'],
      role: 'admin',
      isEmailVerified: true
    });
    await this.testData.admin.save();

    // Create test user
    this.testData.user = new User({
      username: 'verificationuser',
      email: 'verificationuser@example.com',
      walletAddresses: ['0x1111111111111111111111111111111111111111'],
      role: 'user',
      isEmailVerified: true
    });
    await this.testData.user.save();

    // Initialize user points
    await pointsService.initializeUserPoints(this.testData.user._id);

    // Create test contract
    this.testData.contract = await stakingService.createStakingContract({
      contractAddress: '0x2222222222222222222222222222222222222222',
      blockchain: 'ethereum',
      contractName: 'Verification Test Collection',
      description: 'Test collection for verification'
    }, this.testData.admin._id);

    await stakingService.validateStakingContract(
      this.testData.contract._id,
      this.testData.admin._id,
      'Validated for verification testing'
    );

    this.log('✓ Test data setup complete', 'green');
  }

  async cleanupTestData() {
    this.logSection('Cleaning Up Test Data');

    try {
      await User.deleteMany({ 
        email: { $in: ['verificationadmin@example.com', 'verificationuser@example.com'] } 
      });
      await StakingContract.deleteMany({ contractName: 'Verification Test Collection' });
      await StakingPosition.deleteMany({ nftTokenId: { $regex: /^verification-/ } });
      await PointsBalance.deleteMany({ userId: this.testData.user?._id });
      await PointsTransaction.deleteMany({ userId: this.testData.user?._id });
      await UserAchievement.deleteMany({ userId: this.testData.user?._id });

      this.log('✓ Test data cleanup complete', 'green');
    } catch (error) {
      this.log(`⚠ Cleanup warning: ${error.message}`, 'yellow');
    }
  }

  async verifyDatabaseConnection() {
    this.logSection('Database Connection Verification');

    await this.check('MongoDB Connection', async () => {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles';
      await mongoose.connect(mongoUri);
      return true;
    }, true);

    await this.check('Database Collections', async () => {
      const collections = await mongoose.connection.db.listCollections().toArray();
      const requiredCollections = [
        'users', 'stakingcontracts', 'stakingpositions', 
        'pointsbalances', 'pointstransactions', 'achievements'
      ];
      
      const existingCollections = collections.map(c => c.name.toLowerCase());
      const missingCollections = requiredCollections.filter(c => !existingCollections.includes(c));
      
      if (missingCollections.length > 0) {
        return { success: false, message: `Missing collections: ${missingCollections.join(', ')}` };
      }
      return true;
    }, true);
  }

  async verifyModels() {
    this.logSection('Model Verification');

    await this.check('StakingContract Model', async () => {
      const contract = new StakingContract({
        contractAddress: '0x3333333333333333333333333333333333333333',
        blockchain: 'ethereum',
        contractName: 'Model Test Contract',
        createdBy: this.testData.admin._id
      });
      
      const errors = contract.validateSync();
      if (errors) {
        return { success: false, message: errors.message };
      }
      
      // Test methods
      const rewardStructure = contract.getRewardStructure(12);
      if (!rewardStructure || !rewardStructure.openEntryTicketsPerMonth) {
        return { success: false, message: 'Reward structure method failed' };
      }
      
      return true;
    });

    await this.check('StakingPosition Model', async () => {
      const position = new StakingPosition({
        userId: this.testData.user._id,
        stakingContractId: this.testData.contract._id,
        nftTokenId: 'model-test',
        nftContractAddress: this.testData.contract.contractAddress,
        blockchain: 'ethereum',
        stakingDuration: 12,
        walletAddress: this.testData.user.walletAddresses[0],
        lockingHash: 'model-test-hash'
      });
      
      const errors = position.validateSync();
      if (errors) {
        return { success: false, message: errors.message };
      }
      
      // Test methods
      const isEligible = position.isEligibleForRewards();
      const progress = position.stakingProgress;
      
      if (typeof isEligible !== 'boolean' || typeof progress !== 'number') {
        return { success: false, message: 'Model methods failed' };
      }
      
      return true;
    });

    await this.check('User Model Integration', async () => {
      const user = await User.findById(this.testData.user._id);
      if (!user) {
        return { success: false, message: 'User not found' };
      }
      
      // Test profile data structure
      if (!user.profileData) {
        user.profileData = {};
      }
      
      user.profileData.staking = {
        totalPositions: 0,
        stakingTier: 'bronze'
      };
      
      await user.save();
      return true;
    });
  }

  async verifyServices() {
    this.logSection('Service Integration Verification');

    await this.check('Staking Service', async () => {
      const analytics = await stakingService.getStakingAnalytics(30);
      if (!analytics || !analytics.contracts || !analytics.positions) {
        return { success: false, message: 'Analytics structure invalid' };
      }
      return true;
    });

    await this.check('Staking Integration Service', async () => {
      const stakingData = await stakingIntegrationService.getUserStakingData(this.testData.user._id);
      
      const requiredFields = ['positions', 'summary', 'achievements', 'rewards', 'integrationData'];
      for (const field of requiredFields) {
        if (!stakingData.hasOwnProperty(field)) {
          return { success: false, message: `Missing field: ${field}` };
        }
      }
      
      if (!stakingData.integrationData.stakingTier || !stakingData.integrationData.stakingScore) {
        return { success: false, message: 'Integration data incomplete' };
      }
      
      return true;
    });

    await this.check('Points Service Integration', async () => {
      const pointsInfo = await pointsService.getUserPointsInfo(this.testData.user._id);
      
      if (!pointsInfo || typeof pointsInfo.balance !== 'number') {
        return { success: false, message: 'Points info structure invalid' };
      }
      
      return true;
    });

    await this.check('Achievement Service Integration', async () => {
      const achievements = await achievementService.getAllAchievements();
      
      if (!Array.isArray(achievements)) {
        return { success: false, message: 'Achievements not returned as array' };
      }
      
      // Check for staking achievements
      const stakingAchievements = achievements.filter(a => a.category === 'staking');
      if (stakingAchievements.length === 0) {
        return { success: false, message: 'No staking achievements found' };
      }
      
      return true;
    });

    await this.check('Reward Distribution Service', async () => {
      const pendingRewards = await stakingRewardDistributionService.calculateUserPendingRewards(this.testData.user._id);
      
      if (!pendingRewards || typeof pendingRewards.totalPendingRewards !== 'number') {
        return { success: false, message: 'Pending rewards structure invalid' };
      }
      
      return true;
    });
  }

  async verifyIntegrationFlow() {
    this.logSection('Integration Flow Verification');

    await this.check('User Staking Integration', async () => {
      const result = await stakingIntegrationService.integrateUserStaking(this.testData.user._id);
      
      if (!result || !result.summary || !result.integrationData) {
        return { success: false, message: 'Integration result structure invalid' };
      }
      
      return true;
    });

    await this.check('Points Award Integration', async () => {
      const initialBalance = await PointsBalance.findOne({ userId: this.testData.user._id });
      const initialPoints = initialBalance ? initialBalance.balance : 0;
      
      const result = await stakingIntegrationService.awardStakingPoints(
        this.testData.user._id,
        stakingIntegrationService.stakingActivityTypes.STAKE_NFT,
        { stakingDuration: 12 }
      );
      
      if (!result || !result.pointsAwarded || result.pointsAwarded <= 0) {
        return { success: false, message: 'Points not awarded correctly' };
      }
      
      const finalBalance = await PointsBalance.findOne({ userId: this.testData.user._id });
      if (!finalBalance || finalBalance.balance <= initialPoints) {
        return { success: false, message: 'Balance not updated correctly' };
      }
      
      return true;
    });

    await this.check('Achievement Integration', async () => {
      const result = await stakingIntegrationService.checkStakingAchievements(
        this.testData.user._id,
        { testAchievement: true }
      );
      
      if (typeof result !== 'boolean') {
        return { success: false, message: 'Achievement check failed' };
      }
      
      return true;
    });

    await this.check('Reward Processing Integration', async () => {
      const rewardData = {
        openEntryTickets: 10,
        bonusMultiplier: 1.2,
        positionId: new mongoose.Types.ObjectId()
      };
      
      const result = await stakingIntegrationService.processStakingRewardDistribution(
        this.testData.user._id,
        rewardData
      );
      
      if (!result || !result.pointsAwarded || !result.ticketsAdded) {
        return { success: false, message: 'Reward processing failed' };
      }
      
      return true;
    });
  }

  async verifyStakingWorkflow() {
    this.logSection('Complete Staking Workflow Verification');

    let testPosition;

    await this.check('Create Staking Position', async () => {
      testPosition = new StakingPosition({
        userId: this.testData.user._id,
        stakingContractId: this.testData.contract._id,
        nftTokenId: 'verification-workflow',
        nftContractAddress: this.testData.contract.contractAddress,
        blockchain: 'ethereum',
        stakingDuration: 12,
        walletAddress: this.testData.user.walletAddresses[0],
        lockingHash: 'verification-workflow-hash'
      });
      
      await testPosition.save();
      
      if (!testPosition._id) {
        return { success: false, message: 'Position not saved' };
      }
      
      return true;
    });

    await this.check('Award Staking Points', async () => {
      const result = await stakingIntegrationService.awardStakingPoints(
        this.testData.user._id,
        stakingIntegrationService.stakingActivityTypes.STAKE_NFT,
        { 
          stakingDuration: 12,
          positionId: testPosition._id.toString()
        }
      );
      
      if (!result || result.pointsAwarded <= 0) {
        return { success: false, message: 'Points not awarded for staking' };
      }
      
      return true;
    });

    await this.check('Process Reward Distribution', async () => {
      testPosition.addRewardDistribution(15, 1.25);
      await testPosition.save();
      
      const result = await stakingIntegrationService.processStakingRewardDistribution(
        this.testData.user._id,
        {
          openEntryTickets: 15,
          bonusMultiplier: 1.25,
          positionId: testPosition._id
        }
      );
      
      if (!result || !result.pointsAwarded) {
        return { success: false, message: 'Reward distribution failed' };
      }
      
      return true;
    });

    await this.check('Update User Profile', async () => {
      const stakingData = await stakingIntegrationService.getUserStakingData(this.testData.user._id);
      const updatedUser = await stakingIntegrationService.updateUserProfileWithStaking(
        this.testData.user._id,
        stakingData
      );
      
      if (!updatedUser.profileData || !updatedUser.profileData.staking) {
        return { success: false, message: 'Profile not updated with staking data' };
      }
      
      return true;
    });

    await this.check('Generate Leaderboard', async () => {
      const leaderboard = await stakingIntegrationService.getStakingLeaderboard('total_staked', 10);
      
      if (!Array.isArray(leaderboard)) {
        return { success: false, message: 'Leaderboard not generated correctly' };
      }
      
      return true;
    });
  }

  async verifyPerformance() {
    this.logSection('Performance Verification');

    await this.check('Query Performance', async () => {
      const startTime = Date.now();
      
      // Perform multiple queries
      await Promise.all([
        stakingIntegrationService.getUserStakingData(this.testData.user._id),
        stakingService.getStakingAnalytics(30),
        stakingIntegrationService.getStakingLeaderboard('total_staked', 50)
      ]);
      
      const duration = Date.now() - startTime;
      
      if (duration > 5000) { // 5 seconds
        return { success: false, message: `Queries too slow: ${duration}ms` };
      }
      
      return true;
    });

    await this.check('Concurrent Operations', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(
          stakingIntegrationService.awardStakingPoints(
            this.testData.user._id,
            stakingIntegrationService.stakingActivityTypes.REWARD_DISTRIBUTION,
            { concurrent: i }
          )
        );
      }
      
      const results = await Promise.all(promises);
      
      const successfulResults = results.filter(r => r && r.pointsAwarded > 0);
      if (successfulResults.length !== 10) {
        return { success: false, message: `Only ${successfulResults.length}/10 concurrent operations succeeded` };
      }
      
      return true;
    });
  }

  async verifySecurity() {
    this.logSection('Security Verification');

    await this.check('Input Validation', async () => {
      // Test invalid inputs
      try {
        await stakingIntegrationService.getUserStakingData('invalid-user-id');
        return { success: false, message: 'Invalid input not rejected' };
      } catch (error) {
        // Expected to throw error
        return true;
      }
    });

    await this.check('Access Control', async () => {
      // Test cross-user access
      const otherUser = new User({
        username: 'otheruserverification',
        email: 'otheruser@example.com',
        walletAddresses: ['0x4444444444444444444444444444444444444444'],
        role: 'user'
      });
      await otherUser.save();
      
      const userData = await stakingIntegrationService.getUserStakingData(otherUser._id);
      
      // Should return empty data for user with no positions
      if (userData.positions.length > 0) {
        await User.findByIdAndDelete(otherUser._id);
        return { success: false, message: 'Cross-user data leakage detected' };
      }
      
      await User.findByIdAndDelete(otherUser._id);
      return true;
    });

    await this.check('Data Integrity', async () => {
      const position = await StakingPosition.findOne({ nftTokenId: 'verification-workflow' });
      
      if (!position) {
        return { success: false, message: 'Test position not found' };
      }
      
      // Verify referential integrity
      const populatedPosition = await StakingPosition.findById(position._id)
        .populate('userId')
        .populate('stakingContractId');
      
      if (!populatedPosition.userId || !populatedPosition.stakingContractId) {
        return { success: false, message: 'Referential integrity broken' };
      }
      
      return true;
    });
  }

  async verifyHealthCheck() {
    this.logSection('Health Check Verification');

    await this.check('Integration Health Check', async () => {
      const healthCheck = await stakingIntegrationService.performIntegrationHealthCheck();
      
      if (!healthCheck || !healthCheck.services || !healthCheck.overall) {
        return { success: false, message: 'Health check structure invalid' };
      }
      
      const requiredServices = ['staking', 'points', 'achievements'];
      for (const service of requiredServices) {
        if (!healthCheck.services[service]) {
          return { success: false, message: `Missing health check for ${service}` };
        }
      }
      
      return true;
    });
  }

  generateReport() {
    this.logHeader('Verification Results Summary');

    const totalDuration = this.results.checks.reduce((sum, check) => sum + (check.duration || 0), 0);
    
    this.log(`Total Checks: ${this.results.total}`, 'bright');
    this.log(`Passed: ${this.results.passed}`, 'green');
    this.log(`Failed: ${this.results.failed}`, 'red');
    this.log(`Warnings: ${this.results.warnings}`, 'yellow');
    this.log(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`, 'cyan');
    this.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`, 'cyan');

    // Critical failures
    const criticalFailures = this.results.checks.filter(c => c.critical && c.status !== 'passed');
    if (criticalFailures.length > 0) {
      this.logSection('Critical Issues');
      criticalFailures.forEach(check => {
        this.log(`✗ ${check.name}: ${check.message || check.error}`, 'red');
      });
    }

    // Warnings
    const warnings = this.results.checks.filter(c => c.status === 'warning');
    if (warnings.length > 0) {
      this.logSection('Warnings');
      warnings.forEach(check => {
        this.log(`⚠ ${check.name}: ${check.message || 'Check passed with warnings'}`, 'yellow');
      });
    }

    // Performance insights
    const slowChecks = this.results.checks.filter(c => c.duration > 1000).sort((a, b) => b.duration - a.duration);
    if (slowChecks.length > 0) {
      this.logSection('Performance Insights');
      this.log('Slow checks (>1s):', 'yellow');
      slowChecks.slice(0, 5).forEach(check => {
        this.log(`  ${check.name}: ${(check.duration / 1000).toFixed(2)}s`, 'yellow');
      });
    }

    // Final verdict
    this.logSection('Final Verdict');
    if (this.results.failed === 0) {
      this.log('🎉 All critical checks passed! Staking integration is ready for production.', 'green');
    } else if (criticalFailures.length === 0) {
      this.log('✅ All critical checks passed. Some non-critical issues found.', 'yellow');
    } else {
      this.log('❌ Critical issues found. Integration needs attention before production.', 'red');
    }

    return this.results.failed === 0;
  }

  async run() {
    this.logHeader('Staking Integration Verification');

    try {
      // Database connection
      await this.verifyDatabaseConnection();
      
      // Initialize staking achievements
      await initializeStakingAchievements();
      
      // Setup test data
      await this.setupTestData();
      
      // Run verification checks
      await this.verifyModels();
      await this.verifyServices();
      await this.verifyIntegrationFlow();
      await this.verifyStakingWorkflow();
      await this.verifyPerformance();
      await this.verifySecurity();
      await this.verifyHealthCheck();
      
      // Generate report
      const success = this.generateReport();
      
      // Cleanup
      await this.cleanupTestData();
      
      return success;
      
    } catch (error) {
      this.log(`\nFatal error during verification: ${error.message}`, 'red');
      console.error(error);
      return false;
    } finally {
      await mongoose.disconnect();
    }
  }
}

// Run verification if called directly
if (require.main === module) {
  const verifier = new StakingIntegrationVerifier();
  
  verifier.run()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification failed:', error);
      process.exit(1);
    });
}

module.exports = StakingIntegrationVerifier;