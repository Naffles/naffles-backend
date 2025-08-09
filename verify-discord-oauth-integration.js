/**
 * Discord OAuth Integration Verification Script
 * Verifies the Discord account linking and OAuth functionality
 */

const mongoose = require('mongoose');
const User = require('./models/user/user');
const DiscordAccount = require('./models/user/discordAccount');
const discordOAuthService = require('./services/discordOAuthService');
const discordIntegrationService = require('./services/discordIntegrationService');

// Test configuration
const TEST_CONFIG = {
  testUser: {
    username: 'oauth_test_user',
    email: 'oauth_test@example.com',
    walletAddress: '0x1234567890123456789012345678901234567890'
  },
  mockDiscordUser: {
    id: '123456789012345678',
    username: 'TestDiscordUser',
    discriminator: '1234',
    avatar: 'test_avatar_hash',
    email: 'discord_test@example.com',
    verified: true
  },
  mockTokenData: {
    access_token: 'mock_access_token_12345',
    refresh_token: 'mock_refresh_token_12345',
    expires_in: 3600,
    scope: 'identify email guilds.members.read'
  }
};

class DiscordOAuthVerification {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  /**
   * Log test result
   */
  logTest(testName, passed, message = '', details = null) {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${testName}`);
    
    if (message) {
      console.log(`   ${message}`);
    }
    
    if (details) {
      console.log(`   Details:`, details);
    }

    this.results.tests.push({
      name: testName,
      passed,
      message,
      details
    });

    if (passed) {
      this.results.passed++;
    } else {
      this.results.failed++;
    }
  }

  /**
   * Test OAuth configuration validation
   */
  async testOAuthConfiguration() {
    console.log('\n🔧 Testing OAuth Configuration...');
    
    try {
      const config = discordOAuthService.validateConfiguration();
      
      this.logTest(
        'OAuth Configuration Validation',
        config.hasOwnProperty('isValid'),
        `Configuration object contains required properties`
      );

      this.logTest(
        'OAuth Scopes Configuration',
        Array.isArray(config.scopes) && config.scopes.length > 0,
        `Scopes: ${config.scopes?.join(', ') || 'None'}`
      );

      this.logTest(
        'OAuth Redirect URI Configuration',
        typeof config.redirectUri === 'string',
        `Redirect URI: ${config.redirectUri || 'Not configured'}`
      );

    } catch (error) {
      this.logTest(
        'OAuth Configuration Validation',
        false,
        `Error: ${error.message}`,
        error
      );
    }
  }

  /**
   * Test state parameter security
   */
  async testStateParameterSecurity() {
    console.log('\n🔐 Testing State Parameter Security...');
    
    try {
      const userId = new mongoose.Types.ObjectId().toString();
      const ipAddress = '127.0.0.1';

      // Test state generation
      const state = discordOAuthService.generateSecureState(userId, ipAddress);
      
      this.logTest(
        'State Parameter Generation',
        typeof state === 'string' && state.length > 0,
        `Generated state parameter of length ${state.length}`
      );

      // Test state verification
      const verification = discordOAuthService.verifyState(state, ipAddress);
      
      this.logTest(
        'State Parameter Verification',
        verification.isValid === true && verification.userId === userId,
        `State verified successfully for user ${userId}`
      );

      // Test invalid state rejection
      try {
        discordOAuthService.verifyState('invalid_state', ipAddress);
        this.logTest(
          'Invalid State Rejection',
          false,
          'Should have thrown error for invalid state'
        );
      } catch (error) {
        this.logTest(
          'Invalid State Rejection',
          true,
          `Correctly rejected invalid state: ${error.message}`
        );
      }

    } catch (error) {
      this.logTest(
        'State Parameter Security',
        false,
        `Error: ${error.message}`,
        error
      );
    }
  }

  /**
   * Test fraud detection system
   */
  async testFraudDetection() {
    console.log('\n🛡️ Testing Fraud Detection...');
    
    try {
      const userId = new mongoose.Types.ObjectId().toString();
      const ipAddress = '192.168.1.100';

      // Test attempt tracking
      discordOAuthService.trackLinkingAttempt(userId, ipAddress, 'test_action');
      
      const stats = discordOAuthService.getSecurityStats();
      
      this.logTest(
        'Attempt Tracking',
        stats.totalAttempts > 0,
        `Tracked ${stats.totalAttempts} total attempts`
      );

      // Test suspicious activity detection
      const initialSuspicious = discordOAuthService.isSuspiciousActivity(userId, ipAddress);
      
      // Generate multiple attempts to trigger suspicious activity
      for (let i = 0; i < 15; i++) {
        discordOAuthService.trackLinkingAttempt(userId, ipAddress, 'test_flood');
      }
      
      const nowSuspicious = discordOAuthService.isSuspiciousActivity(userId, ipAddress);
      
      this.logTest(
        'Suspicious Activity Detection',
        !initialSuspicious && nowSuspicious,
        `Initially not suspicious: ${!initialSuspicious}, Now suspicious: ${nowSuspicious}`
      );

      // Test attempt clearing
      discordOAuthService.clearUserAttempts(userId);
      const afterClear = discordOAuthService.isSuspiciousActivity(userId, ipAddress);
      
      this.logTest(
        'Attempt Clearing',
        !afterClear,
        `Suspicious activity cleared: ${!afterClear}`
      );

    } catch (error) {
      this.logTest(
        'Fraud Detection',
        false,
        `Error: ${error.message}`,
        error
      );
    }
  }

  /**
   * Test Discord account model operations
   */
  async testDiscordAccountModel() {
    console.log('\n💾 Testing Discord Account Model...');
    
    try {
      // Create test user
      const testUser = await User.create(TEST_CONFIG.testUser);
      
      this.logTest(
        'Test User Creation',
        testUser._id !== undefined,
        `Created user with ID: ${testUser._id}`
      );

      // Test account linking
      const discordAccount = await DiscordAccount.createOrUpdateLink(
        testUser._id,
        TEST_CONFIG.mockDiscordUser,
        TEST_CONFIG.mockTokenData
      );

      this.logTest(
        'Discord Account Linking',
        discordAccount._id !== undefined,
        `Created Discord account link with ID: ${discordAccount._id}`
      );

      // Test finding by user ID
      const foundByUser = await DiscordAccount.findByUserId(testUser._id);
      
      this.logTest(
        'Find Account by User ID',
        foundByUser && foundByUser.discordUserId === TEST_CONFIG.mockDiscordUser.id,
        `Found account for user ${testUser._id}`
      );

      // Test finding by Discord ID
      const foundByDiscord = await DiscordAccount.findByDiscordId(TEST_CONFIG.mockDiscordUser.id);
      
      this.logTest(
        'Find Account by Discord ID',
        foundByDiscord && foundByDiscord.userId.toString() === testUser._id.toString(),
        `Found account for Discord user ${TEST_CONFIG.mockDiscordUser.id}`
      );

      // Test token refresh detection
      const needsRefresh = discordAccount.needsTokenRefresh();
      
      this.logTest(
        'Token Refresh Detection',
        typeof needsRefresh === 'boolean',
        `Token needs refresh: ${needsRefresh}`
      );

      // Test account deactivation
      discordAccount.isActive = false;
      await discordAccount.save();
      
      const inactiveAccount = await DiscordAccount.findByUserId(testUser._id);
      
      this.logTest(
        'Account Deactivation',
        inactiveAccount === null,
        'Inactive account not found by findByUserId (as expected)'
      );

      // Cleanup
      await User.findByIdAndDelete(testUser._id);
      await DiscordAccount.deleteMany({ userId: testUser._id });

    } catch (error) {
      this.logTest(
        'Discord Account Model',
        false,
        `Error: ${error.message}`,
        error
      );
    }
  }

  /**
   * Test OAuth service methods
   */
  async testOAuthServiceMethods() {
    console.log('\n⚙️ Testing OAuth Service Methods...');
    
    try {
      // Create test user
      const testUser = await User.create({
        ...TEST_CONFIG.testUser,
        username: 'oauth_service_test'
      });

      // Test linking status for unlinked user
      const unlinkedStatus = await discordOAuthService.getLinkingStatus(testUser._id.toString());
      
      this.logTest(
        'Unlinked User Status',
        unlinkedStatus.isLinked === false && unlinkedStatus.canLink === true,
        `Status: linked=${unlinkedStatus.isLinked}, canLink=${unlinkedStatus.canLink}`
      );

      // Create Discord account link
      await DiscordAccount.createOrUpdateLink(
        testUser._id,
        TEST_CONFIG.mockDiscordUser,
        TEST_CONFIG.mockTokenData
      );

      // Test linking status for linked user
      const linkedStatus = await discordOAuthService.getLinkingStatus(testUser._id.toString());
      
      this.logTest(
        'Linked User Status',
        linkedStatus.isLinked === true && linkedStatus.isActive === true,
        `Status: linked=${linkedStatus.isLinked}, active=${linkedStatus.isActive}`
      );

      // Test account unlinking
      const unlinkResult = await discordOAuthService.unlinkDiscordAccount(
        testUser._id.toString(),
        'test_verification'
      );
      
      this.logTest(
        'Account Unlinking',
        unlinkResult.success === true,
        `Unlink result: ${unlinkResult.message}`
      );

      // Verify account is unlinked
      const afterUnlinkStatus = await discordOAuthService.getLinkingStatus(testUser._id.toString());
      
      this.logTest(
        'Post-Unlink Status',
        afterUnlinkStatus.isLinked === false,
        `Status after unlink: linked=${afterUnlinkStatus.isLinked}`
      );

      // Cleanup
      await User.findByIdAndDelete(testUser._id);
      await DiscordAccount.deleteMany({ userId: testUser._id });

    } catch (error) {
      this.logTest(
        'OAuth Service Methods',
        false,
        `Error: ${error.message}`,
        error
      );
    }
  }

  /**
   * Test authorization URL generation
   */
  async testAuthorizationURLGeneration() {
    console.log('\n🔗 Testing Authorization URL Generation...');
    
    try {
      const userId = new mongoose.Types.ObjectId().toString();
      const ipAddress = '127.0.0.1';

      const authData = discordOAuthService.generateAuthorizationURL(userId, ipAddress);
      
      this.logTest(
        'Authorization URL Generation',
        authData.authUrl && authData.state && authData.expiresAt,
        `Generated URL with state and expiration`
      );

      this.logTest(
        'Authorization URL Format',
        authData.authUrl.includes('discord.com/oauth2/authorize'),
        `URL: ${authData.authUrl.substring(0, 50)}...`
      );

      this.logTest(
        'Authorization URL Parameters',
        authData.authUrl.includes('client_id=') && 
        authData.authUrl.includes('redirect_uri=') &&
        authData.authUrl.includes('response_type=code'),
        'URL contains required OAuth parameters'
      );

    } catch (error) {
      this.logTest(
        'Authorization URL Generation',
        false,
        `Error: ${error.message}`,
        error
      );
    }
  }

  /**
   * Test security statistics
   */
  async testSecurityStatistics() {
    console.log('\n📊 Testing Security Statistics...');
    
    try {
      const stats = discordOAuthService.getSecurityStats();
      
      const requiredProperties = [
        'totalAttempts',
        'recentAttempts', 
        'suspiciousIPs',
        'attemptsByAction',
        'windowSize',
        'maxAttemptsPerIP',
        'maxAttemptsPerUser'
      ];

      const hasAllProperties = requiredProperties.every(prop => stats.hasOwnProperty(prop));
      
      this.logTest(
        'Security Statistics Structure',
        hasAllProperties,
        `Statistics object contains all required properties`
      );

      this.logTest(
        'Security Statistics Values',
        typeof stats.totalAttempts === 'number' &&
        typeof stats.recentAttempts === 'number' &&
        typeof stats.suspiciousIPs === 'number',
        `Total: ${stats.totalAttempts}, Recent: ${stats.recentAttempts}, Suspicious IPs: ${stats.suspiciousIPs}`
      );

    } catch (error) {
      this.logTest(
        'Security Statistics',
        false,
        `Error: ${error.message}`,
        error
      );
    }
  }

  /**
   * Test Discord integration service compatibility
   */
  async testDiscordIntegrationCompatibility() {
    console.log('\n🔄 Testing Discord Integration Service Compatibility...');
    
    try {
      // Test configuration validation
      const integrationConfig = discordIntegrationService.validateConfiguration();
      
      this.logTest(
        'Integration Service Configuration',
        integrationConfig.hasOwnProperty('isValid'),
        `Integration service configuration available`
      );

      // Test cache statistics
      const cacheStats = discordIntegrationService.getCacheStats();
      
      this.logTest(
        'Integration Service Cache',
        cacheStats.hasOwnProperty('roleCacheSize') && cacheStats.hasOwnProperty('userCacheSize'),
        `Role cache: ${cacheStats.roleCacheSize}, User cache: ${cacheStats.userCacheSize}`
      );

    } catch (error) {
      this.logTest(
        'Discord Integration Compatibility',
        false,
        `Error: ${error.message}`,
        error
      );
    }
  }

  /**
   * Run all verification tests
   */
  async runAllTests() {
    console.log('🚀 Starting Discord OAuth Integration Verification...\n');

    try {
      // Connect to database
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles_test');
        console.log('📦 Connected to MongoDB\n');
      }

      // Run all tests
      await this.testOAuthConfiguration();
      await this.testStateParameterSecurity();
      await this.testFraudDetection();
      await this.testDiscordAccountModel();
      await this.testOAuthServiceMethods();
      await this.testAuthorizationURLGeneration();
      await this.testSecurityStatistics();
      await this.testDiscordIntegrationCompatibility();

      // Print summary
      console.log('\n📋 Verification Summary:');
      console.log(`✅ Passed: ${this.results.passed}`);
      console.log(`❌ Failed: ${this.results.failed}`);
      console.log(`📊 Total: ${this.results.tests.length}`);

      if (this.results.failed > 0) {
        console.log('\n❌ Failed Tests:');
        this.results.tests
          .filter(test => !test.passed)
          .forEach(test => {
            console.log(`   - ${test.name}: ${test.message}`);
          });
      }

      const success = this.results.failed === 0;
      console.log(`\n${success ? '🎉' : '💥'} Discord OAuth Integration ${success ? 'PASSED' : 'FAILED'}`);

      return success;

    } catch (error) {
      console.error('💥 Verification failed with error:', error);
      return false;
    }
  }
}

// Run verification if called directly
if (require.main === module) {
  const verification = new DiscordOAuthVerification();
  
  verification.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Verification script error:', error);
      process.exit(1);
    });
}

module.exports = DiscordOAuthVerification;