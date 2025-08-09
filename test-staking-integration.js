#!/usr/bin/env node

/**
 * Comprehensive Staking Integration Test Runner
 * 
 * This script runs all staking-related tests including:
 * - Integration tests
 * - Performance tests  
 * - Security tests
 * - Multi-collection tests
 * - CSV upload/management tests
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_CONFIG = {
  timeout: 300000, // 5 minutes per test suite
  verbose: true,
  coverage: false,
  bail: false, // Continue running tests even if some fail
  parallel: false // Run tests sequentially for better resource management
};

// Test suites to run
const TEST_SUITES = [
  {
    name: 'Staking System Integration',
    file: 'tests/stakingIntegration.test.js',
    description: 'Tests integration with user management, points system, and achievements',
    category: 'integration'
  },
  {
    name: 'Staking Performance',
    file: 'tests/stakingPerformance.test.js',
    description: 'Tests performance at scale with large datasets and concurrent operations',
    category: 'performance'
  },
  {
    name: 'Staking Security',
    file: 'tests/stakingSecurity.test.js',
    description: 'Tests security measures, input validation, and access controls',
    category: 'security'
  },
  {
    name: 'Core Staking System',
    file: 'tests/stakingSystem.test.js',
    description: 'Tests core staking functionality and blockchain integration',
    category: 'core'
  },
  {
    name: 'Staking Admin Configuration',
    file: 'tests/stakingAdminConfiguration.test.js',
    description: 'Tests admin configuration and contract management',
    category: 'admin'
  },
  {
    name: 'Staking Reward Distribution',
    file: 'tests/stakingRewardDistribution.test.js',
    description: 'Tests reward distribution system and calculations',
    category: 'rewards'
  },
  {
    name: 'Staking Analytics',
    file: 'tests/stakingAnalytics.test.js',
    description: 'Tests analytics and reporting functionality',
    category: 'analytics'
  }
];

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

class StakingTestRunner {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      suites: []
    };
    this.startTime = Date.now();
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

  async checkPrerequisites() {
    this.logSection('Checking Prerequisites');

    // Check if MongoDB is available
    try {
      const mongoose = require('mongoose');
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles-test';
      await mongoose.connect(mongoUri);
      await mongoose.disconnect();
      this.log('✓ MongoDB connection successful', 'green');
    } catch (error) {
      this.log('✗ MongoDB connection failed', 'red');
      this.log(`  Error: ${error.message}`, 'red');
      return false;
    }

    // Check if required test files exist
    const missingFiles = [];
    for (const suite of TEST_SUITES) {
      const filePath = path.join(__dirname, suite.file);
      if (!fs.existsSync(filePath)) {
        missingFiles.push(suite.file);
      }
    }

    if (missingFiles.length > 0) {
      this.log('✗ Missing test files:', 'red');
      missingFiles.forEach(file => this.log(`  - ${file}`, 'red'));
      return false;
    }

    this.log('✓ All test files found', 'green');

    // Check if required services are available
    try {
      const testEnv = require('./tests/testEnvironment');
      this.log('✓ Test environment available', 'green');
    } catch (error) {
      this.log('✗ Test environment not available', 'red');
      this.log('  Run: node setup-testing-environment.js', 'yellow');
      return false;
    }

    return true;
  }

  async runTestSuite(suite) {
    return new Promise((resolve) => {
      this.log(`\nRunning: ${suite.name}`, 'bright');
      this.log(`Description: ${suite.description}`, 'cyan');
      this.log(`Category: ${suite.category}`, 'magenta');

      const startTime = Date.now();
      const args = [
        '--testPathPattern', suite.file,
        '--testTimeout', TEST_CONFIG.timeout.toString(),
        '--verbose', TEST_CONFIG.verbose.toString(),
        '--detectOpenHandles',
        '--forceExit'
      ];

      if (TEST_CONFIG.coverage) {
        args.push('--coverage');
      }

      if (TEST_CONFIG.bail) {
        args.push('--bail');
      }

      const jest = spawn('npx', ['jest', ...args], {
        stdio: 'pipe',
        cwd: __dirname
      });

      let output = '';
      let errorOutput = '';

      jest.stdout.on('data', (data) => {
        output += data.toString();
        if (TEST_CONFIG.verbose) {
          process.stdout.write(data);
        }
      });

      jest.stderr.on('data', (data) => {
        errorOutput += data.toString();
        if (TEST_CONFIG.verbose) {
          process.stderr.write(data);
        }
      });

      jest.on('close', (code) => {
        const duration = Date.now() - startTime;
        const result = {
          name: suite.name,
          category: suite.category,
          file: suite.file,
          passed: code === 0,
          duration,
          output,
          errorOutput
        };

        if (code === 0) {
          this.log(`✓ ${suite.name} - PASSED (${duration}ms)`, 'green');
          this.results.passed++;
        } else {
          this.log(`✗ ${suite.name} - FAILED (${duration}ms)`, 'red');
          this.results.failed++;
          
          if (!TEST_CONFIG.verbose) {
            this.log('Error output:', 'red');
            this.log(errorOutput, 'red');
          }
        }

        this.results.suites.push(result);
        this.results.total++;
        resolve(result);
      });

      jest.on('error', (error) => {
        this.log(`✗ ${suite.name} - ERROR: ${error.message}`, 'red');
        this.results.failed++;
        this.results.total++;
        
        const result = {
          name: suite.name,
          category: suite.category,
          file: suite.file,
          passed: false,
          duration: Date.now() - startTime,
          error: error.message
        };
        
        this.results.suites.push(result);
        resolve(result);
      });
    });
  }

  async runAllTests(categories = []) {
    this.logHeader('Staking System Integration Test Suite');

    // Check prerequisites
    const prerequisitesOk = await this.checkPrerequisites();
    if (!prerequisitesOk) {
      this.log('\nPrerequisites check failed. Aborting test run.', 'red');
      process.exit(1);
    }

    // Filter test suites by category if specified
    let suitesToRun = TEST_SUITES;
    if (categories.length > 0) {
      suitesToRun = TEST_SUITES.filter(suite => categories.includes(suite.category));
      this.log(`\nRunning tests for categories: ${categories.join(', ')}`, 'yellow');
    }

    this.log(`\nRunning ${suitesToRun.length} test suites...`, 'bright');

    // Run tests
    if (TEST_CONFIG.parallel) {
      // Run tests in parallel
      const promises = suitesToRun.map(suite => this.runTestSuite(suite));
      await Promise.all(promises);
    } else {
      // Run tests sequentially
      for (const suite of suitesToRun) {
        await this.runTestSuite(suite);
      }
    }

    // Generate summary report
    this.generateSummaryReport();
  }

  generateSummaryReport() {
    const totalDuration = Date.now() - this.startTime;
    
    this.logHeader('Test Results Summary');

    // Overall statistics
    this.log(`Total Suites: ${this.results.total}`, 'bright');
    this.log(`Passed: ${this.results.passed}`, 'green');
    this.log(`Failed: ${this.results.failed}`, 'red');
    this.log(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`, 'cyan');
    this.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`, 'cyan');

    // Results by category
    const categories = {};
    this.results.suites.forEach(suite => {
      if (!categories[suite.category]) {
        categories[suite.category] = { passed: 0, failed: 0, total: 0 };
      }
      categories[suite.category].total++;
      if (suite.passed) {
        categories[suite.category].passed++;
      } else {
        categories[suite.category].failed++;
      }
    });

    this.logSection('Results by Category');
    Object.entries(categories).forEach(([category, stats]) => {
      const successRate = ((stats.passed / stats.total) * 100).toFixed(1);
      const color = stats.failed === 0 ? 'green' : 'yellow';
      this.log(`${category}: ${stats.passed}/${stats.total} (${successRate}%)`, color);
    });

    // Detailed results
    this.logSection('Detailed Results');
    this.results.suites.forEach(suite => {
      const status = suite.passed ? '✓' : '✗';
      const color = suite.passed ? 'green' : 'red';
      const duration = `${(suite.duration / 1000).toFixed(2)}s`;
      this.log(`${status} ${suite.name} (${duration})`, color);
      
      if (!suite.passed && suite.error) {
        this.log(`  Error: ${suite.error}`, 'red');
      }
    });

    // Performance insights
    this.logSection('Performance Insights');
    const sortedByDuration = [...this.results.suites].sort((a, b) => b.duration - a.duration);
    this.log('Slowest test suites:', 'yellow');
    sortedByDuration.slice(0, 3).forEach((suite, index) => {
      const duration = `${(suite.duration / 1000).toFixed(2)}s`;
      this.log(`  ${index + 1}. ${suite.name} (${duration})`, 'yellow');
    });

    // Recommendations
    this.logSection('Recommendations');
    if (this.results.failed > 0) {
      this.log('• Review failed tests and fix issues before deployment', 'yellow');
      this.log('• Check error logs for specific failure details', 'yellow');
    }
    
    const avgDuration = totalDuration / this.results.total;
    if (avgDuration > 30000) { // 30 seconds average
      this.log('• Consider optimizing slow tests for better CI/CD performance', 'yellow');
    }
    
    if (this.results.passed === this.results.total) {
      this.log('• All tests passed! Staking integration is ready for deployment', 'green');
    }

    // Exit with appropriate code
    process.exit(this.results.failed > 0 ? 1 : 0);
  }

  async generateCoverageReport() {
    this.logSection('Generating Coverage Report');
    
    return new Promise((resolve) => {
      const jest = spawn('npx', ['jest', '--coverage', '--coverageReporters=text', '--coverageReporters=html'], {
        stdio: 'inherit',
        cwd: __dirname
      });

      jest.on('close', (code) => {
        if (code === 0) {
          this.log('✓ Coverage report generated', 'green');
          this.log('  HTML report: coverage/lcov-report/index.html', 'cyan');
        } else {
          this.log('✗ Coverage report generation failed', 'red');
        }
        resolve();
      });
    });
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const runner = new StakingTestRunner();

  // Parse command line arguments
  const options = {
    categories: [],
    coverage: false,
    verbose: true,
    bail: false,
    parallel: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--category':
      case '-c':
        if (args[i + 1]) {
          options.categories.push(args[i + 1]);
          i++;
        }
        break;
      case '--coverage':
        options.coverage = true;
        TEST_CONFIG.coverage = true;
        break;
      case '--quiet':
      case '-q':
        options.verbose = false;
        TEST_CONFIG.verbose = false;
        break;
      case '--bail':
        options.bail = true;
        TEST_CONFIG.bail = true;
        break;
      case '--parallel':
        options.parallel = true;
        TEST_CONFIG.parallel = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Staking Integration Test Runner

Usage: node test-staking-integration.js [options]

Options:
  -c, --category <category>  Run tests for specific category (integration, performance, security, core, admin, rewards, analytics)
  --coverage                 Generate coverage report
  -q, --quiet               Reduce output verbosity
  --bail                    Stop on first test failure
  --parallel                Run tests in parallel
  -h, --help                Show this help message

Examples:
  node test-staking-integration.js                    # Run all tests
  node test-staking-integration.js -c integration     # Run only integration tests
  node test-staking-integration.js -c security -c performance  # Run security and performance tests
  node test-staking-integration.js --coverage         # Run all tests with coverage
  node test-staking-integration.js --parallel         # Run tests in parallel
        `);
        process.exit(0);
        break;
    }
  }

  // Set environment for testing
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles-test';

  try {
    await runner.runAllTests(options.categories);
    
    if (options.coverage) {
      await runner.generateCoverageReport();
    }
  } catch (error) {
    console.error('Test runner error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = StakingTestRunner;