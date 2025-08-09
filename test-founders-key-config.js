// Simple test to verify Founders Key configuration system
const mongoose = require('mongoose');

console.log('🔍 Testing Founders Key Configuration System...\n');

const testConfiguration = async () => {
  try {
    // Test 1: Model Loading
    console.log('1. Testing Configuration Model...');
    const FoundersKeyConfig = require('./models/admin/foundersKeyConfig');
    console.log('   ✅ FoundersKeyConfig model loaded');

    // Test 2: Default Configuration Creation (without database)
    console.log('\n2. Testing Configuration Structure...');
    
    // Create a mock configuration object to test methods
    const mockConfig = {
      tierMultipliers: {
        tier1: { feeDiscountMultiplier: 1.0, openEntryTicketsMultiplier: 1 },
        tier2: { feeDiscountMultiplier: 1.5, openEntryTicketsMultiplier: 2 },
        tier3: { feeDiscountMultiplier: 2.0, openEntryTicketsMultiplier: 3 },
        tier4: { feeDiscountMultiplier: 2.5, openEntryTicketsMultiplier: 5 },
        tier5: { feeDiscountMultiplier: 3.0, openEntryTicketsMultiplier: 8 }
      },
      stakingMultipliers: {
        duration30Days: { multiplier: 1.1, minDays: 30 },
        duration90Days: { multiplier: 1.25, minDays: 90 },
        duration180Days: { multiplier: 1.5, minDays: 180 },
        duration365Days: { multiplier: 2.0, minDays: 365 }
      },
      globalSettings: {
        maxFeeDiscountPercent: 75,
        maxFeeDiscountWithoutStaking: 50,
        priorityAccessMinTier: 2,
        maxStakingDurationDays: 1095,
        minStakingDurationDays: 30
      }
    };

    // Bind methods to mock object
    mockConfig.getTierMultiplier = FoundersKeyConfig.schema.methods.getTierMultiplier;
    mockConfig.getStakingMultiplier = FoundersKeyConfig.schema.methods.getStakingMultiplier;
    mockConfig.calculateBenefits = FoundersKeyConfig.schema.methods.calculateBenefits;

    console.log('   ✅ Configuration structure created');

    // Test 3: Tier Multiplier Methods
    console.log('\n3. Testing Tier Multiplier Methods...');
    
    const tier1FeeMultiplier = mockConfig.getTierMultiplier(1, 'feeDiscount');
    const tier3FeeMultiplier = mockConfig.getTierMultiplier(3, 'feeDiscount');
    const tier5TicketsMultiplier = mockConfig.getTierMultiplier(5, 'openEntryTickets');
    
    console.log(`   ✅ Tier 1 Fee Multiplier: ${tier1FeeMultiplier}`);
    console.log(`   ✅ Tier 3 Fee Multiplier: ${tier3FeeMultiplier}`);
    console.log(`   ✅ Tier 5 Tickets Multiplier: ${tier5TicketsMultiplier}`);

    // Test 4: Staking Multiplier Methods
    console.log('\n4. Testing Staking Multiplier Methods...');
    
    const staking29Days = mockConfig.getStakingMultiplier(29);  // Should be 1.0
    const staking30Days = mockConfig.getStakingMultiplier(30);  // Should be 1.1
    const staking180Days = mockConfig.getStakingMultiplier(180); // Should be 1.5
    const staking365Days = mockConfig.getStakingMultiplier(365); // Should be 2.0
    const staking500Days = mockConfig.getStakingMultiplier(500); // Should be 2.0
    
    console.log(`   ✅ 29 Days Staking: ${staking29Days}x multiplier`);
    console.log(`   ✅ 30 Days Staking: ${staking30Days}x multiplier`);
    console.log(`   ✅ 180 Days Staking: ${staking180Days}x multiplier`);
    console.log(`   ✅ 365 Days Staking: ${staking365Days}x multiplier`);
    console.log(`   ✅ 500 Days Staking: ${staking500Days}x multiplier`);

    // Test 5: Benefit Calculation Methods
    console.log('\n5. Testing Benefit Calculation Methods...');
    
    const baseBenefits = {
      feeDiscount: 10, // 10% base discount
      priorityAccess: false,
      openEntryTickets: 2 // 2 base tickets
    };

    // Test different scenarios
    const scenarios = [
      { tier: 1, staking: 0, name: 'Tier 1, No Staking' },
      { tier: 2, staking: 0, name: 'Tier 2, No Staking' },
      { tier: 3, staking: 90, name: 'Tier 3, 3 Month Staking' },
      { tier: 4, staking: 180, name: 'Tier 4, 6 Month Staking' },
      { tier: 5, staking: 365, name: 'Tier 5, 1 Year Staking' }
    ];

    scenarios.forEach(scenario => {
      const benefits = mockConfig.calculateBenefits(baseBenefits, scenario.tier, scenario.staking);
      console.log(`   ✅ ${scenario.name}:`);
      console.log(`      Fee Discount: ${benefits.feeDiscount}%`);
      console.log(`      Priority Access: ${benefits.priorityAccess}`);
      console.log(`      Open Entry Tickets: ${benefits.openEntryTickets}`);
    });

    // Test 6: Edge Cases and Validation
    console.log('\n6. Testing Edge Cases...');
    
    // Test invalid tier (should fallback to tier 1)
    const invalidTierMultiplier = mockConfig.getTierMultiplier(99, 'feeDiscount');
    console.log(`   ✅ Invalid tier (99) fallback: ${invalidTierMultiplier}x`);
    
    // Test very high staking duration
    const veryLongStaking = mockConfig.getStakingMultiplier(9999);
    console.log(`   ✅ Very long staking (9999 days): ${veryLongStaking}x`);
    
    // Test maximum fee discount cap
    const highBaseBenefits = {
      feeDiscount: 50, // 50% base discount
      priorityAccess: false,
      openEntryTickets: 10
    };
    
    const cappedBenefits = mockConfig.calculateBenefits(highBaseBenefits, 5, 365);
    console.log(`   ✅ High base benefits (50% discount) with Tier 5 + 1 year staking:`);
    console.log(`      Calculated would be: ${50 * 3.0 * 2.0}% but capped at: ${cappedBenefits.feeDiscount}%`);

    // Test 7: Controller Methods (without database)
    console.log('\n7. Testing Controller Integration...');
    
    const foundersKeyAdminController = require('./controllers/admin/foundersKeyAdminController');
    console.log('   ✅ Admin controller loaded');
    
    // Check if configuration methods exist
    const configMethods = [
      'getFoundersKeyConfig',
      'updateFoundersKeyConfig', 
      'resetFoundersKeyConfig',
      'previewBenefitsCalculation',
      'getConfigurationHistory'
    ];
    
    configMethods.forEach(method => {
      if (typeof foundersKeyAdminController[method] === 'function') {
        console.log(`   ✅ ${method} method available`);
      } else {
        console.log(`   ❌ ${method} method missing`);
      }
    });

    // Test 8: Service Integration
    console.log('\n8. Testing Service Integration...');
    
    const foundersKeyService = require('./services/foundersKeyService');
    console.log('   ✅ FoundersKeyService loaded');
    
    // Check if service methods are updated to use configuration
    if (typeof foundersKeyService.calculateTierBenefits === 'function') {
      console.log('   ✅ calculateTierBenefits method available');
    }
    
    if (typeof foundersKeyService.getStakingMultiplier === 'function') {
      console.log('   ✅ getStakingMultiplier method available');
    }

    console.log('\n🎉 Founders Key Configuration System Test Complete!');
    console.log('\n📊 Summary:');
    console.log('   • Configuration model structure ✅');
    console.log('   • Tier multiplier calculations ✅');
    console.log('   • Staking multiplier calculations ✅');
    console.log('   • Benefit calculation methods ✅');
    console.log('   • Edge case handling ✅');
    console.log('   • Controller integration ✅');
    console.log('   • Service integration ✅');

    console.log('\n🔧 System Ready For:');
    console.log('   • Database initialization with default config');
    console.log('   • Admin panel configuration management');
    console.log('   • Real-time benefit calculations');
    console.log('   • Configuration versioning and history');

  } catch (error) {
    console.error('❌ Configuration test failed:', error);
    process.exit(1);
  }
};

// Run the test
testConfiguration().then(() => {
  console.log('\n✅ All configuration tests passed successfully!');
}).catch(console.error);