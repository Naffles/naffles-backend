/**
 * Simple Discord OAuth Integration Test
 * Tests Discord OAuth functionality without complex dependencies
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

// Mock environment variables for testing
process.env.JWT_SECRET = 'test-secret-key';
process.env.DISCORD_CLIENT_ID = 'test-client-id';
process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';
process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/discord/callback';

// Import services after setting env vars
const discordOAuthService = require('./services/discordOAuthService');

class SimpleDiscordOAuthTest {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  logTest(testName, passed, message = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${testName}`);
    
    if (message) {
      console.log(`   ${message}`);
    }

    this.results.tests.push({
      name: testName,
      passed,
      message
    });

    if (passed) {
      this.results.passed++;
    } else {
      this.results.failed++;
    }
  }

  testOAuthConfiguration() {
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
        `Error: ${error.message}`
      );
    }
  }

  testStateParameterSecurity() {
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
        `Error: ${error.message}`
      );
    }
  }

  testFraudDetection() {
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
      
      // Check if attempts were cleared by looking at stats
      const statsAfterClear = discordOAuthService.getSecurityStats();
      const userAttemptsCleared = statsAfterClear.totalAttempts < stats.totalAttempts;
      
      this.logTest(
        'Attempt Clearing',
        userAttemptsCleared,
        `User attempts cleared: ${userAttemptsCleared} (${statsAfterClear.totalAttempts} remaining)`
      );

    } catch (error) {
      this.logTest(
        'Fraud Detection',
        false,
        `Error: ${error.message}`
      );
    }
  }

  testAuthorizationURLGeneration() {
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
        `Error: ${error.message}`
      );
    }
  }

  testSecurityStatistics() {
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
        `Error: ${error.message}`
      );
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Simple Discord OAuth Integration Test...\n');

    try {
      // Run all tests
      this.testOAuthConfiguration();
      this.testStateParameterSecurity();
      this.testFraudDetection();
      this.testAuthorizationURLGeneration();
      this.testSecurityStatistics();

      // Print summary
      console.log('\n📋 Test Summary:');
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
      console.error('💥 Test failed with error:', error);
      return false;
    }
  }
}

// Run test if called directly
if (require.main === module) {
  const test = new SimpleDiscordOAuthTest();
  
  test.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test script error:', error);
      process.exit(1);
    });
}

module.exports = SimpleDiscordOAuthTest;