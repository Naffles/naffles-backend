#!/usr/bin/env node

/**
 * Comprehensive Health Check Script
 * Validates all system components and dependencies
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

class HealthChecker {
  constructor() {
    this.checks = [];
    this.results = [];
    this.timeout = 30000; // 30 seconds
  }

  /**
   * Add a health check
   */
  addCheck(name, checkFunction, options = {}) {
    this.checks.push({
      name,
      checkFunction,
      critical: options.critical || false,
      timeout: options.timeout || this.timeout,
      retries: options.retries || 0
    });
  }

  /**
   * Run all health checks
   */
  async runChecks() {
    colorLog('cyan', '🏥 Starting comprehensive health checks...');
    colorLog('cyan', '==========================================');
    
    this.results = [];
    let overallHealth = true;

    for (const check of this.checks) {
      const result = await this.runSingleCheck(check);
      this.results.push(result);
      
      if (!result.passed && check.critical) {
        overallHealth = false;
      }
    }

    this.printResults();
    return { overallHealth, results: this.results };
  }

  /**
   * Run a single health check with retries
   */
  async runSingleCheck(check) {
    let lastError = null;
    
    for (let attempt = 0; attempt <= check.retries; attempt++) {
      try {
        const startTime = Date.now();
        
        const result = await Promise.race([
          check.checkFunction(),
          this.createTimeout(check.timeout)
        ]);
        
        const duration = Date.now() - startTime;
        
        return {
          name: check.name,
          passed: true,
          duration,
          attempt: attempt + 1,
          result
        };
        
      } catch (error) {
        lastError = error;
        
        if (attempt < check.retries) {
          colorLog('yellow', `⚠️  ${check.name} failed (attempt ${attempt + 1}), retrying...`);
          await this.sleep(1000 * (attempt + 1)); // Exponential backoff
        }
      }
    }

    return {
      name: check.name,
      passed: false,
      error: lastError.message,
      attempt: check.retries + 1
    };
  }

  /**
   * Create timeout promise
   */
  createTimeout(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Print health check results
   */
  printResults() {
    console.log('\n');
    colorLog('cyan', '📊 Health Check Results');
    colorLog('cyan', '======================');
    
    let passed = 0;
    let failed = 0;
    let criticalFailed = 0;

    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      const attempts = result.attempt > 1 ? ` [${result.attempt} attempts]` : '';
      
      console.log(`${status} ${result.name}${duration}${attempts}`);
      
      if (result.error) {
        colorLog('red', `   Error: ${result.error}`);
      }
      
      if (result.passed) {
        passed++;
      } else {
        failed++;
        const check = this.checks.find(c => c.name === result.name);
        if (check && check.critical) {
          criticalFailed++;
        }
      }
    });

    console.log('\n');
    colorLog('cyan', '📈 Summary');
    colorLog('cyan', '==========');
    console.log(`Total checks: ${this.results.length}`);
    colorLog('green', `Passed: ${passed}`);
    if (failed > 0) {
      colorLog('red', `Failed: ${failed}`);
    }
    if (criticalFailed > 0) {
      colorLog('red', `Critical failures: ${criticalFailed}`);
    }

    const overallStatus = criticalFailed === 0 ? 'HEALTHY' : 'UNHEALTHY';
    const statusColor = criticalFailed === 0 ? 'green' : 'red';
    
    console.log('\n');
    colorLog(statusColor, `Overall Status: ${overallStatus}`);
  }

  /**
   * HTTP health check
   */
  async httpCheck(url, expectedStatus = 200) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const req = client.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === expectedStatus) {
            resolve({
              status: res.statusCode,
              data: data.length > 0 ? JSON.parse(data) : null
            });
          } else {
            reject(new Error(`Expected status ${expectedStatus}, got ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Database connection check
   */
  async databaseCheck() {
    try {
      const mongoose = require('mongoose');
      
      if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB not connected');
      }
      
      // Test query
      await mongoose.connection.db.admin().ping();
      
      return {
        status: 'connected',
        host: mongoose.connection.host,
        database: mongoose.connection.name
      };
    } catch (error) {
      throw new Error(`Database check failed: ${error.message}`);
    }
  }

  /**
   * Redis connection check
   */
  async redisCheck() {
    try {
      const { client: redisClient } = require('../config/redisClient');
      
      if (redisClient.status !== 'ready') {
        throw new Error('Redis not connected');
      }
      
      // Test ping
      const result = await redisClient.ping();
      if (result !== 'PONG') {
        throw new Error('Redis ping failed');
      }
      
      return {
        status: 'connected',
        host: redisClient.options.host,
        port: redisClient.options.port
      };
    } catch (error) {
      throw new Error(`Redis check failed: ${error.message}`);
    }
  }

  /**
   * Environment variables check
   */
  async environmentCheck() {
    const requiredVars = [
      'NODE_ENV',
      'MONGODB_URI',
      'REDIS_URL',
      'JWT_SECRET',
      'API_KEY'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }

    return {
      environment: process.env.NODE_ENV,
      variablesSet: requiredVars.length
    };
  }

  /**
   * Memory usage check
   */
  async memoryCheck() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const heapUsedPercentage = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    
    if (heapUsedPercentage > 90) {
      throw new Error(`High memory usage: ${heapUsedPercentage}%`);
    }

    return {
      heapUsed: heapUsedMB,
      heapTotal: heapTotalMB,
      heapUsedPercentage,
      rss: Math.round(memUsage.rss / 1024 / 1024)
    };
  }

  /**
   * Disk space check
   */
  async diskSpaceCheck() {
    try {
      const fs = require('fs');
      const stats = fs.statSync('.');
      
      // This is a simplified check - in production you'd want to check actual disk usage
      return {
        status: 'available',
        path: process.cwd()
      };
    } catch (error) {
      throw new Error(`Disk space check failed: ${error.message}`);
    }
  }

  /**
   * External services check
   */
  async externalServicesCheck() {
    const services = [];
    
    // Check if we can reach external APIs (with timeout)
    try {
      // This is a basic connectivity check
      await this.httpCheck('https://httpbin.org/status/200', 200);
      services.push({ name: 'internet', status: 'available' });
    } catch (error) {
      services.push({ name: 'internet', status: 'unavailable', error: error.message });
    }

    return { services };
  }

  /**
   * Security check
   */
  async securityCheck() {
    const issues = [];
    
    // Check if running as root (not recommended)
    if (process.getuid && process.getuid() === 0) {
      issues.push('Running as root user');
    }
    
    // Check if in production mode
    if (process.env.NODE_ENV === 'production') {
      // Check for secure configurations
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        issues.push('JWT secret is too short');
      }
    }

    if (issues.length > 0) {
      throw new Error(`Security issues: ${issues.join(', ')}`);
    }

    return {
      status: 'secure',
      environment: process.env.NODE_ENV
    };
  }

  /**
   * Monitoring services check
   */
  async monitoringCheck() {
    try {
      const monitoringManager = require('../services/monitoring');
      const status = monitoringManager.getStatus();
      
      if (!status.initialized) {
        throw new Error('Monitoring services not initialized');
      }

      return status;
    } catch (error) {
      throw new Error(`Monitoring check failed: ${error.message}`);
    }
  }
}

/**
 * Setup standard health checks
 */
function setupStandardChecks(checker, options = {}) {
  const {
    includeHttp = true,
    includeDatabase = true,
    includeRedis = true,
    includeExternal = false,
    baseUrl = 'http://localhost:4000'
  } = options;

  // Environment variables (critical)
  checker.addCheck('Environment Variables', () => checker.environmentCheck(), { critical: true });

  // Memory usage (critical)
  checker.addCheck('Memory Usage', () => checker.memoryCheck(), { critical: true });

  // Disk space
  checker.addCheck('Disk Space', () => checker.diskSpaceCheck());

  // Security check
  checker.addCheck('Security Configuration', () => checker.securityCheck());

  // Database connection (critical)
  if (includeDatabase) {
    checker.addCheck('Database Connection', () => checker.databaseCheck(), { critical: true, retries: 2 });
  }

  // Redis connection (critical)
  if (includeRedis) {
    checker.addCheck('Redis Connection', () => checker.redisCheck(), { critical: true, retries: 2 });
  }

  // HTTP endpoints
  if (includeHttp) {
    checker.addCheck('Basic Health Endpoint', () => checker.httpCheck(`${baseUrl}/health`), { critical: true });
    checker.addCheck('Detailed Health Endpoint', () => checker.httpCheck(`${baseUrl}/health/detailed`));
    checker.addCheck('Metrics Endpoint', () => checker.httpCheck(`${baseUrl}/health/metrics`));
  }

  // Monitoring services
  checker.addCheck('Monitoring Services', () => checker.monitoringCheck());

  // External services (optional)
  if (includeExternal) {
    checker.addCheck('External Services', () => checker.externalServicesCheck());
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node health-check.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --url <url>          Base URL for HTTP checks (default: http://localhost:4000)');
    console.log('  --no-http            Skip HTTP endpoint checks');
    console.log('  --no-database        Skip database checks');
    console.log('  --no-redis           Skip Redis checks');
    console.log('  --include-external   Include external service checks');
    console.log('  --timeout <ms>       Timeout for individual checks (default: 30000)');
    console.log('  --json               Output results in JSON format');
    console.log('  --help, -h           Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  node health-check.js');
    console.log('  node health-check.js --url https://api.naffles.com');
    console.log('  node health-check.js --no-database --json');
    console.log('');
    return;
  }

  const options = {
    baseUrl: args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:4000',
    includeHttp: !args.includes('--no-http'),
    includeDatabase: !args.includes('--no-database'),
    includeRedis: !args.includes('--no-redis'),
    includeExternal: args.includes('--include-external'),
    timeout: args.includes('--timeout') ? parseInt(args[args.indexOf('--timeout') + 1]) : 30000,
    json: args.includes('--json')
  };

  const checker = new HealthChecker();
  checker.timeout = options.timeout;
  
  setupStandardChecks(checker, options);
  
  try {
    const { overallHealth, results } = await checker.runChecks();
    
    if (options.json) {
      console.log(JSON.stringify({
        overallHealth,
        timestamp: new Date().toISOString(),
        results
      }, null, 2));
    }
    
    process.exit(overallHealth ? 0 : 1);
    
  } catch (error) {
    colorLog('red', `❌ Health check failed: ${error.message}`);
    
    if (options.json) {
      console.log(JSON.stringify({
        overallHealth: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));
    }
    
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = HealthChecker;