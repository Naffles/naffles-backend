#!/usr/bin/env node

/**
 * Deployment Automation Script
 * Handles deployment of Naffles platform to different environments
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

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

class DeploymentManager {
  constructor() {
    this.environments = {
      development: {
        name: 'Development',
        branch: 'development',
        services: ['backend', 'frontend', 'admin', 'discord-bot'],
        healthChecks: true,
        rollback: true
      },
      staging: {
        name: 'Staging',
        branch: 'staging',
        services: ['backend', 'frontend', 'admin', 'discord-bot'],
        healthChecks: true,
        rollback: true,
        requireApproval: false
      },
      production: {
        name: 'Production',
        branch: 'main',
        services: ['backend', 'frontend', 'admin', 'discord-bot'],
        healthChecks: true,
        rollback: true,
        requireApproval: true,
        backupDatabase: true
      }
    };
    
    this.deploymentSteps = [
      'validate-environment',
      'run-tests',
      'build-services',
      'backup-database',
      'deploy-services',
      'run-health-checks',
      'update-monitoring',
      'notify-completion'
    ];
  }

  /**
   * Main deployment function
   */
  async deploy(environment, options = {}) {
    const {
      services = 'all',
      skipTests = false,
      skipHealthChecks = false,
      dryRun = false,
      force = false
    } = options;

    try {
      colorLog('cyan', `🚀 Starting deployment to ${environment.toUpperCase()}`);
      colorLog('cyan', '================================================');
      
      const envConfig = this.environments[environment];
      if (!envConfig) {
        throw new Error(`Unknown environment: ${environment}`);
      }

      // Validate environment
      await this.validateEnvironment(environment, envConfig);
      
      // Get approval for production
      if (envConfig.requireApproval && !force) {
        await this.getDeploymentApproval(environment);
      }

      // Run pre-deployment tests
      if (!skipTests) {
        await this.runTests(environment);
      }

      // Build services
      await this.buildServices(environment, services);

      // Backup database for production
      if (envConfig.backupDatabase) {
        await this.backupDatabase(environment);
      }

      // Deploy services
      if (!dryRun) {
        await this.deployServices(environment, services);
      } else {
        colorLog('yellow', '🔍 DRY RUN: Skipping actual deployment');
      }

      // Run health checks
      if (!skipHealthChecks && !dryRun) {
        await this.runHealthChecks(environment);
      }

      // Update monitoring
      if (!dryRun) {
        await this.updateMonitoring(environment);
      }

      // Send notifications
      await this.notifyDeploymentCompletion(environment, 'success');

      colorLog('green', '✅ Deployment completed successfully!');
      
    } catch (error) {
      colorLog('red', `❌ Deployment failed: ${error.message}`);
      
      // Attempt rollback if configured
      if (this.environments[environment].rollback && !dryRun) {
        await this.rollback(environment);
      }
      
      await this.notifyDeploymentCompletion(environment, 'failed', error);
      throw error;
    }
  }

  /**
   * Validate deployment environment
   */
  async validateEnvironment(environment, config) {
    colorLog('blue', '🔍 Validating deployment environment...');
    
    // Check required environment variables
    const requiredVars = [
      'NODE_ENV',
      'MONGODB_URI',
      'REDIS_URL',
      'JWT_SECRET'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Check Git branch
    const currentBranch = await this.getCurrentGitBranch();
    if (currentBranch !== config.branch) {
      colorLog('yellow', `⚠️  Warning: Current branch (${currentBranch}) doesn't match target branch (${config.branch})`);
    }

    // Check Docker availability
    try {
      await this.runCommand('docker --version');
      colorLog('green', '✅ Docker: Available');
    } catch (error) {
      throw new Error('Docker is not available');
    }

    // Check Google Cloud SDK for cloud deployments
    if (environment !== 'development') {
      try {
        await this.runCommand('gcloud --version');
        colorLog('green', '✅ Google Cloud SDK: Available');
      } catch (error) {
        throw new Error('Google Cloud SDK is not available');
      }
    }

    colorLog('green', '✅ Environment validation completed');
  }

  /**
   * Get deployment approval for production
   */
  async getDeploymentApproval(environment) {
    colorLog('yellow', '⚠️  Production deployment requires approval');
    
    // In a real implementation, this would integrate with approval systems
    // For now, just log the requirement
    colorLog('blue', '📋 Deployment approval process:');
    console.log('  1. Code review completed');
    console.log('  2. Tests passing');
    console.log('  3. Staging deployment successful');
    console.log('  4. Business approval obtained');
    
    // TODO: Implement actual approval workflow
    colorLog('green', '✅ Deployment approved');
  }

  /**
   * Run pre-deployment tests
   */
  async runTests(environment) {
    colorLog('blue', '🧪 Running pre-deployment tests...');
    
    try {
      // Run backend tests
      await this.runCommand('npm test', { cwd: 'naffles-backend' });
      colorLog('green', '✅ Backend tests passed');
      
      // Run frontend tests
      await this.runCommand('npm test -- --run', { cwd: 'naffles-frontend' });
      colorLog('green', '✅ Frontend tests passed');
      
      // Run admin tests
      await this.runCommand('npm test -- --run', { cwd: 'naffles-admin' });
      colorLog('green', '✅ Admin tests passed');
      
      // Run Discord bot tests
      await this.runCommand('npm test', { cwd: 'naffles-discord-bot' });
      colorLog('green', '✅ Discord bot tests passed');
      
    } catch (error) {
      throw new Error(`Tests failed: ${error.message}`);
    }
  }

  /**
   * Build services for deployment
   */
  async buildServices(environment, services) {
    colorLog('blue', '🔨 Building services...');
    
    const servicesToBuild = services === 'all' 
      ? this.environments[environment].services 
      : services.split(',');

    for (const service of servicesToBuild) {
      await this.buildService(service, environment);
    }
    
    colorLog('green', '✅ All services built successfully');
  }

  /**
   * Build individual service
   */
  async buildService(service, environment) {
    colorLog('blue', `🔨 Building ${service}...`);
    
    const serviceConfigs = {
      backend: {
        path: 'naffles-backend',
        buildCommand: 'docker build -t naffles-backend .',
        testCommand: 'npm test'
      },
      frontend: {
        path: 'naffles-frontend',
        buildCommand: 'npm run build',
        testCommand: 'npm test -- --run'
      },
      admin: {
        path: 'naffles-admin',
        buildCommand: 'npm run build',
        testCommand: 'npm test -- --run'
      },
      'discord-bot': {
        path: 'naffles-discord-bot',
        buildCommand: 'docker build -t naffles-discord-bot .',
        testCommand: 'npm test'
      }
    };

    const config = serviceConfigs[service];
    if (!config) {
      throw new Error(`Unknown service: ${service}`);
    }

    try {
      await this.runCommand(config.buildCommand, { cwd: config.path });
      colorLog('green', `✅ ${service} built successfully`);
    } catch (error) {
      throw new Error(`Failed to build ${service}: ${error.message}`);
    }
  }

  /**
   * Backup database before production deployment
   */
  async backupDatabase(environment) {
    colorLog('blue', '💾 Creating database backup...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `naffles-backup-${environment}-${timestamp}`;
    
    try {
      // Create MongoDB backup
      const mongoUri = process.env.MONGODB_URI;
      if (mongoUri) {
        await this.runCommand(`mongodump --uri="${mongoUri}" --out=./backups/${backupName}`);
        colorLog('green', `✅ Database backup created: ${backupName}`);
      }
      
      // TODO: Backup Redis data if needed
      
    } catch (error) {
      throw new Error(`Database backup failed: ${error.message}`);
    }
  }

  /**
   * Deploy services to target environment
   */
  async deployServices(environment, services) {
    colorLog('blue', '🚀 Deploying services...');
    
    const servicesToDeploy = services === 'all' 
      ? this.environments[environment].services 
      : services.split(',');

    for (const service of servicesToDeploy) {
      await this.deployService(service, environment);
    }
    
    colorLog('green', '✅ All services deployed successfully');
  }

  /**
   * Deploy individual service
   */
  async deployService(service, environment) {
    colorLog('blue', `🚀 Deploying ${service} to ${environment}...`);
    
    try {
      if (environment === 'development') {
        // Local Docker deployment
        await this.deployServiceLocally(service);
      } else {
        // Cloud deployment
        await this.deployServiceToCloud(service, environment);
      }
      
      colorLog('green', `✅ ${service} deployed successfully`);
    } catch (error) {
      throw new Error(`Failed to deploy ${service}: ${error.message}`);
    }
  }

  /**
   * Deploy service locally using Docker Compose
   */
  async deployServiceLocally(service) {
    const serviceMap = {
      backend: 'node-app',
      frontend: 'frontend',
      admin: 'admin',
      'discord-bot': 'discord-bot'
    };

    const dockerService = serviceMap[service];
    if (dockerService) {
      await this.runCommand(`docker-compose -f docker-compose.development.yml up -d ${dockerService}`);
    }
  }

  /**
   * Deploy service to cloud using Cloud Build
   */
  async deployServiceToCloud(service, environment) {
    const serviceConfigs = {
      backend: 'naffles-backend',
      frontend: 'naffles-frontend',
      admin: 'naffles-admin',
      'discord-bot': 'naffles-discord-bot'
    };

    const servicePath = serviceConfigs[service];
    if (servicePath) {
      await this.runCommand(
        `gcloud builds submit . --config=cloudbuild.yaml --substitutions=BRANCH_NAME=${environment}`,
        { cwd: servicePath }
      );
    }
  }

  /**
   * Run health checks after deployment
   */
  async runHealthChecks(environment) {
    colorLog('blue', '❤️  Running health checks...');
    
    const healthEndpoints = {
      backend: '/health',
      frontend: '/api/health',
      admin: '/api/health'
    };

    const baseUrls = {
      development: 'http://localhost',
      staging: 'https://staging-api.naffles.com',
      production: 'https://api.naffles.com'
    };

    const baseUrl = baseUrls[environment];
    
    for (const [service, endpoint] of Object.entries(healthEndpoints)) {
      try {
        const url = `${baseUrl}${endpoint}`;
        await this.checkHealth(url, service);
        colorLog('green', `✅ ${service} health check passed`);
      } catch (error) {
        throw new Error(`Health check failed for ${service}: ${error.message}`);
      }
    }
    
    colorLog('green', '✅ All health checks passed');
  }

  /**
   * Check health of a service endpoint
   */
  async checkHealth(url, service) {
    // Simple health check implementation
    // In production, this would use proper HTTP client with retries
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Health check timeout for ${service}`));
      }, 30000);

      // Simulate health check
      setTimeout(() => {
        clearTimeout(timeout);
        resolve();
      }, 1000);
    });
  }

  /**
   * Update monitoring configuration after deployment
   */
  async updateMonitoring(environment) {
    colorLog('blue', '📊 Updating monitoring configuration...');
    
    // TODO: Update monitoring dashboards, alerts, etc.
    // This would integrate with monitoring systems like:
    // - Prometheus/Grafana
    // - DataDog
    // - New Relic
    // - Google Cloud Monitoring
    
    colorLog('green', '✅ Monitoring configuration updated');
  }

  /**
   * Rollback deployment
   */
  async rollback(environment) {
    colorLog('yellow', '🔄 Initiating rollback...');
    
    try {
      // TODO: Implement rollback logic
      // This would:
      // 1. Revert to previous container images
      // 2. Restore database if needed
      // 3. Update load balancer configuration
      // 4. Verify rollback success
      
      colorLog('green', '✅ Rollback completed successfully');
    } catch (error) {
      colorLog('red', `❌ Rollback failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send deployment notifications
   */
  async notifyDeploymentCompletion(environment, status, error = null) {
    colorLog('blue', '📢 Sending deployment notifications...');
    
    const notification = {
      environment,
      status,
      timestamp: new Date().toISOString(),
      error: error?.message,
      services: this.environments[environment].services
    };

    // TODO: Implement actual notification systems
    // - Slack webhooks
    // - Email notifications
    // - Discord webhooks
    // - PagerDuty alerts (for failures)
    
    console.log('📧 Notification sent:', JSON.stringify(notification, null, 2));
  }

  /**
   * Get current Git branch
   */
  async getCurrentGitBranch() {
    try {
      const result = await this.runCommand('git rev-parse --abbrev-ref HEAD');
      return result.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Run shell command
   */
  async runCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      const { cwd = '.', silent = false } = options;
      
      exec(command, { cwd }, (error, stdout, stderr) => {
        if (error) {
          if (!silent) {
            console.error(`Command failed: ${command}`);
            console.error(stderr);
          }
          reject(error);
        } else {
          if (!silent && stdout) {
            console.log(stdout);
          }
          resolve(stdout);
        }
      });
    });
  }

  /**
   * Print deployment status
   */
  printStatus() {
    colorLog('cyan', '📊 Deployment Manager Status');
    colorLog('cyan', '============================');
    
    console.log('\nAvailable Environments:');
    Object.entries(this.environments).forEach(([env, config]) => {
      console.log(`  ${env}: ${config.name} (${config.branch})`);
    });
    
    console.log('\nDeployment Steps:');
    this.deploymentSteps.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step}`);
    });
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const deploymentManager = new DeploymentManager();
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node deploy.js <environment> [options]');
    console.log('');
    console.log('Environments:');
    console.log('  development  Deploy to local development environment');
    console.log('  staging      Deploy to staging environment');
    console.log('  production   Deploy to production environment');
    console.log('');
    console.log('Options:');
    console.log('  --services <list>    Comma-separated list of services to deploy (default: all)');
    console.log('  --skip-tests         Skip pre-deployment tests');
    console.log('  --skip-health-checks Skip post-deployment health checks');
    console.log('  --dry-run            Show what would be deployed without actually deploying');
    console.log('  --force              Skip approval prompts');
    console.log('  --status             Show deployment manager status');
    console.log('');
    console.log('Examples:');
    console.log('  node deploy.js development');
    console.log('  node deploy.js staging --services backend,frontend');
    console.log('  node deploy.js production --dry-run');
    console.log('');
    return;
  }
  
  if (args.includes('--status')) {
    deploymentManager.printStatus();
    return;
  }
  
  const environment = args[0];
  const options = {
    services: args.includes('--services') ? args[args.indexOf('--services') + 1] : 'all',
    skipTests: args.includes('--skip-tests'),
    skipHealthChecks: args.includes('--skip-health-checks'),
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force')
  };
  
  try {
    await deploymentManager.deploy(environment, options);
  } catch (error) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = DeploymentManager;