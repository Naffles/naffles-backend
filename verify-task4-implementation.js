const fs = require('fs');
const path = require('path');

/**
 * Comprehensive verification script for Task 4: Core Raffle System
 */
class Task4Verifier {
  constructor() {
    this.results = {
      models: {},
      services: {},
      controllers: {},
      routes: {},
      features: {},
      integrations: {},
      overall: 'pending'
    };
  }

  /**
   * Run all verification checks
   */
  async verify() {
    console.log('🔍 Verifying Task 4: Implement core raffle system with NFT and token support\n');

    this.checkModels();
    this.checkServices();
    this.checkControllers();
    this.checkRoutes();
    this.checkFeatures();
    this.checkIntegrations();

    this.generateReport();
  }

  /**
   * Check if file exists and has content
   */
  fileHasContent(filePath) {
    if (!fs.existsSync(path.join(__dirname, filePath))) return false;
    const content = fs.readFileSync(path.join(__dirname, filePath), 'utf8');
    return content.trim().length > 0;
  }

  /**
   * Check if file contains specific content
   */
  fileContains(filePath, searchText) {
    if (!this.fileHasContent(filePath)) return false;
    try {
      const content = fs.readFileSync(path.join(__dirname, filePath), 'utf8');
      return content.includes(searchText);
    } catch {
      return false;
    }
  }

  /**
   * Check raffle models implementation
   */
  checkModels() {
    console.log('📊 Checking Raffle Models...');
    
    const models = [
      { 
        name: 'Raffle Model', 
        path: 'models/raffle/raffle.js', 
        required: true,
        checks: ['raffleTypeEnum', 'lotteryTypeEnum', 'vrf', 'escrowStatus']
      },
      { 
        name: 'RafflePrize Model', 
        path: 'models/raffle/rafflePrize.js', 
        required: true,
        checks: ['tokenPrize', 'nftPrize', 'validationStatus']
      },
      { 
        name: 'RaffleTicket Model', 
        path: 'models/raffle/raffleTicket.js', 
        required: true,
        checks: ['purchasedBy', 'ticketNumber', 'isOpenEntry']
      },
      { 
        name: 'RaffleWinner Model', 
        path: 'models/raffle/raffleWinner.js', 
        required: true,
        checks: ['winningTicket', 'isClaimed']
      }
    ];

    for (const model of models) {
      const exists = this.fileHasContent(model.path);
      let hasRequiredFields = true;
      
      if (exists && model.checks) {
        hasRequiredFields = model.checks.every(check => 
          this.fileContains(model.path, check)
        );
      }

      this.results.models[model.name] = {
        exists,
        hasRequiredFields,
        required: model.required,
        status: (exists && hasRequiredFields) ? '✅' : '❌'
      };
      console.log(`  ${this.results.models[model.name].status} ${model.name}`);
    }
  }

  /**
   * Check raffle services implementation
   */
  checkServices() {
    console.log('\n🔧 Checking Raffle Services...');
    
    const services = [
      { 
        name: 'RaffleService', 
        path: 'services/raffleService.js', 
        required: true,
        checks: ['createNewRaffle', 'drawRaffleWinner', 'fulfillRaffleDraw', 'validateFields']
      }
    ];

    for (const service of services) {
      const exists = this.fileHasContent(service.path);
      let hasRequiredMethods = true;
      
      if (exists && service.checks) {
        hasRequiredMethods = service.checks.every(check => 
          this.fileContains(service.path, check)
        );
      }

      this.results.services[service.name] = {
        exists,
        hasRequiredMethods,
        required: service.required,
        status: (exists && hasRequiredMethods) ? '✅' : '❌'
      };
      console.log(`  ${this.results.services[service.name].status} ${service.name}`);
    }
  }

  /**
   * Check raffle controllers implementation
   */
  checkControllers() {
    console.log('\n🎮 Checking Raffle Controllers...');
    
    const controllers = [
      { 
        name: 'RaffleController', 
        path: 'controllers/raffleContoller.js', 
        required: true,
        checks: ['createNewRaffle', 'getRaffles', 'buyRaffleTickets', 'drawRaffleWinner', 'claimRafflePrize']
      }
    ];

    for (const controller of controllers) {
      const exists = this.fileHasContent(controller.path);
      let hasRequiredMethods = true;
      
      if (exists && controller.checks) {
        hasRequiredMethods = controller.checks.every(check => 
          this.fileContains(controller.path, check)
        );
      }

      this.results.controllers[controller.name] = {
        exists,
        hasRequiredMethods,
        required: controller.required,
        status: (exists && hasRequiredMethods) ? '✅' : '❌'
      };
      console.log(`  ${this.results.controllers[controller.name].status} ${controller.name}`);
    }
  }

  /**
   * Check raffle routes implementation
   */
  checkRoutes() {
    console.log('\n🛣️ Checking Raffle Routes...');
    
    const routes = [
      { 
        name: 'RaffleRoutes', 
        path: 'routes/raffleRoutes.js', 
        required: true,
        checks: ['router.route', 'ticket-purchase', 'draw', 'claim', 'cancel-and-refund']
      }
    ];

    for (const route of routes) {
      const exists = this.fileHasContent(route.path);
      let hasRequiredRoutes = true;
      
      if (exists && route.checks) {
        hasRequiredRoutes = route.checks.every(check => 
          this.fileContains(route.path, check)
        );
      }

      this.results.routes[route.name] = {
        exists,
        hasRequiredRoutes,
        required: route.required,
        status: (exists && hasRequiredRoutes) ? '✅' : '❌'
      };
      console.log(`  ${this.results.routes[route.name].status} ${route.name}`);
    }
  }

  /**
   * Check raffle features implementation
   */
  checkFeatures() {
    console.log('\n🎯 Checking Raffle Features...');
    
    const features = [
      {
        name: 'Standard Raffles',
        check: () => this.fileContains('models/raffle/raffle.js', 'RAFFLE_TYPE') &&
                     this.fileContains('services/raffleService.js', 'createNewRaffle')
      },
      {
        name: 'Unlimited Raffles',
        check: () => this.fileContains('services/raffleService.js', 'UNLIMITED') &&
                     this.fileContains('services/raffleService.js', 'RAFFLE_TYPE_UNLIMITED')
      },
      {
        name: 'Allowlist Raffles',
        check: () => this.fileContains('models/raffle/raffle.js', 'allowlistConfig') &&
                     this.fileContains('services/raffleService.js', 'createAllowlistRaffle')
      },
      {
        name: 'Asset Validation',
        check: () => this.fileContains('models/raffle/raffle.js', 'assetValidated') &&
                     this.fileContains('models/raffle/rafflePrize.js', 'validationStatus')
      },
      {
        name: 'Escrow System',
        check: () => this.fileContains('models/raffle/raffle.js', 'escrowStatus') &&
                     this.fileContains('models/raffle/raffle.js', 'escrowTransactionHash')
      },
      {
        name: 'Ticket Purchasing',
        check: () => this.fileContains('controllers/raffleContoller.js', 'buyRaffleTickets') &&
                     this.fileContains('services/raffleService.js', 'checkUserBalances')
      },
      {
        name: 'Winner Selection',
        check: () => this.fileContains('services/raffleService.js', 'drawRaffleWinner') &&
                     this.fileContains('services/raffleService.js', 'fulfillRaffleDraw')
      },
      {
        name: 'Prize Distribution',
        check: () => this.fileContains('services/raffleService.js', 'distributePrizeAndEarnings') &&
                     this.fileContains('controllers/raffleContoller.js', 'claimRafflePrize')
      },
      {
        name: 'Cancellation & Refunds',
        check: () => this.fileContains('controllers/raffleContoller.js', 'cancelAndRefundRaffle') &&
                     this.fileContains('services/raffleService.js', 'verifyCancelPermissions')
      }
    ];

    for (const feature of features) {
      const implemented = feature.check();
      this.results.features[feature.name] = {
        implemented,
        status: implemented ? '✅' : '❌'
      };
      console.log(`  ${this.results.features[feature.name].status} ${feature.name}`);
    }
  }

  /**
   * Check integrations
   */
  checkIntegrations() {
    console.log('\n🔗 Checking Integrations...');
    
    const integrations = [
      {
        name: 'VRF Integration (Partial)',
        check: () => this.fileContains('models/raffle/raffle.js', 'vrf') &&
                     this.fileContains('services/raffleService.js', 'requestForRandomNumberVrfQueue')
      },
      {
        name: 'Fund Management Integration',
        check: () => this.fileContains('services/raffleService.js', 'WalletBalance') &&
                     this.fileContains('services/raffleService.js', 'checkUserBalances')
      },
      {
        name: 'User Authentication',
        check: () => this.fileContains('routes/raffleRoutes.js', 'authenticate') &&
                     this.fileContains('controllers/raffleContoller.js', 'req.user')
      },
      {
        name: 'Admin Controls',
        check: () => this.fileContains('routes/raffleRoutes.js', 'requireRole') &&
                     this.fileContains('services/raffleService.js', 'AdminSettings')
      }
    ];

    for (const integration of integrations) {
      const implemented = integration.check();
      this.results.integrations[integration.name] = {
        implemented,
        status: implemented ? '✅' : '❌'
      };
      console.log(`  ${this.results.integrations[integration.name].status} ${integration.name}`);
    }
  }

  /**
   * Generate verification report
   */
  generateReport() {
    console.log('\n📋 TASK 4 VERIFICATION REPORT');
    console.log('='.repeat(50));

    const categories = ['models', 'services', 'controllers', 'routes', 'features', 'integrations'];
    let totalItems = 0;
    let completedItems = 0;

    for (const category of categories) {
      const items = this.results[category];
      const categoryTotal = Object.keys(items).length;
      let categoryCompleted = 0;

      if (category === 'models' || category === 'services' || category === 'controllers' || category === 'routes') {
        categoryCompleted = Object.values(items).filter(item => 
          item.exists && (item.hasRequiredFields !== false) && (item.hasRequiredMethods !== false) && (item.hasRequiredRoutes !== false)
        ).length;
      } else {
        categoryCompleted = Object.values(items).filter(item => item.implemented).length;
      }
      
      totalItems += categoryTotal;
      completedItems += categoryCompleted;

      console.log(`\n${category.toUpperCase()}: ${categoryCompleted}/${categoryTotal}`);
      
      for (const [name, result] of Object.entries(items)) {
        console.log(`  ${result.status} ${name}`);
      }
    }

    const completionPercentage = Math.round((completedItems / totalItems) * 100);
    
    console.log('\n' + '='.repeat(50));
    console.log(`OVERALL COMPLETION: ${completedItems}/${totalItems} (${completionPercentage}%)`);

    if (completionPercentage >= 90) {
      this.results.overall = 'complete';
      console.log('🎉 Task 4 is COMPLETE!');
    } else if (completionPercentage >= 70) {
      this.results.overall = 'mostly-complete';
      console.log('⚠️ Task 4 is MOSTLY COMPLETE - some optimizations needed');
    } else {
      this.results.overall = 'incomplete';
      console.log('❌ Task 4 is INCOMPLETE - significant work needed');
    }

    // Task requirements check
    console.log('\n📋 TASK REQUIREMENTS CHECK');
    console.log('-'.repeat(30));

    const requirements = [
      'Create Raffle model supporting standard, unlimited, and allowlist types',
      'Build raffle creation endpoints with asset validation and escrow',
      'Implement ticket purchasing system with payment processing',
      'Create raffle execution logic with Chainlink VRF integration',
      'Add winner selection and prize distribution functionality',
      'Implement raffle cancellation and refund mechanisms'
    ];

    const implementedRequirements = [
      this.results.models['Raffle Model']?.exists && this.results.features['Standard Raffles']?.implemented,
      this.results.features['Asset Validation']?.implemented && this.results.features['Escrow System']?.implemented,
      this.results.features['Ticket Purchasing']?.implemented,
      this.results.integrations['VRF Integration (Partial)']?.implemented,
      this.results.features['Winner Selection']?.implemented && this.results.features['Prize Distribution']?.implemented,
      this.results.features['Cancellation & Refunds']?.implemented
    ];

    for (let i = 0; i < requirements.length; i++) {
      const status = implementedRequirements[i] ? '✅' : '❌';
      console.log(`${status} ${requirements[i]}`);
    }

    // Identify missing or incomplete components
    this.identifyImprovements();
  }

  /**
   * Identify improvements and optimizations needed
   */
  identifyImprovements() {
    console.log('\n🔧 IMPROVEMENTS & OPTIMIZATIONS NEEDED');
    console.log('-'.repeat(40));

    const improvements = [];

    // Check for missing components
    Object.entries(this.results.models).forEach(([name, result]) => {
      if (!result.exists) improvements.push(`Missing: ${name}`);
      if (result.exists && !result.hasRequiredFields) improvements.push(`Incomplete: ${name} missing required fields`);
    });

    Object.entries(this.results.services).forEach(([name, result]) => {
      if (!result.exists) improvements.push(`Missing: ${name}`);
      if (result.exists && !result.hasRequiredMethods) improvements.push(`Incomplete: ${name} missing required methods`);
    });

    Object.entries(this.results.features).forEach(([name, result]) => {
      if (!result.implemented) improvements.push(`Feature not implemented: ${name}`);
    });

    Object.entries(this.results.integrations).forEach(([name, result]) => {
      if (!result.implemented) improvements.push(`Integration missing: ${name}`);
    });

    // Specific optimizations
    if (!this.fileContains('services/raffleService.js', 'async/await')) {
      improvements.push('Optimization: Convert callbacks to async/await for better error handling');
    }

    if (!this.fileContains('models/raffle/raffle.js', 'index: true')) {
      improvements.push('Optimization: Add database indexes for better query performance');
    }

    if (!this.fileContains('services/raffleService.js', 'transaction')) {
      improvements.push('Optimization: Ensure database transactions for data consistency');
    }

    if (improvements.length === 0) {
      console.log('✅ No major improvements needed - Task 4 is well implemented!');
    } else {
      improvements.forEach(improvement => console.log(`  - ${improvement}`));
    }
  }
}

// Run verification
const verifier = new Task4Verifier();
verifier.verify().catch(console.error);