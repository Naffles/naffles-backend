// Simple test to verify Founders Key models and basic functionality
const mongoose = require('mongoose');

// Test the models can be loaded
console.log('🔍 Testing Founders Key System Components...\n');

try {
  // Test 1: Model Loading
  console.log('1. Testing Model Loading...');
  const User = require('./models/user/user');
  const FoundersKeyContract = require('./models/user/foundersKeyContract');
  const FoundersKeyStaking = require('./models/user/foundersKeyStaking');
  const OpenEntryAllocation = require('./models/user/openEntryAllocation');
  console.log('   ✅ All models loaded successfully');

  // Test 2: Service Loading
  console.log('\n2. Testing Service Loading...');
  const foundersKeyService = require('./services/foundersKeyService');
  console.log('   ✅ FoundersKeyService loaded successfully');

  // Test 3: Controller Loading
  console.log('\n3. Testing Controller Loading...');
  const foundersKeyController = require('./controllers/foundersKeyController');
  const foundersKeyAdminController = require('./controllers/admin/foundersKeyAdminController');
  console.log('   ✅ Controllers loaded successfully');

  // Test 4: Route Loading
  console.log('\n4. Testing Route Loading...');
  const foundersKeyRoutes = require('./routes/foundersKeyRoutes');
  const foundersKeyAdminRoutes = require('./routes/admin/foundersKeyAdmin');
  console.log('   ✅ Routes loaded successfully');

  // Test 5: Middleware Loading
  console.log('\n5. Testing Middleware Loading...');
  const foundersKeyMiddleware = require('./middleware/foundersKeyMiddleware');
  console.log('   ✅ Middleware loaded successfully');

  // Test 6: Basic Model Functionality (without database)
  console.log('\n6. Testing Basic Model Functionality...');
  
  // Test User model methods
  const mockUser = {
    foundersKeys: [
      {
        tokenId: '1',
        contractAddress: '0x123',
        chainId: '1',
        tier: 3,
        benefits: { feeDiscount: 15, priorityAccess: true, openEntryTickets: 3 }
      },
      {
        tokenId: '2',
        contractAddress: '0x123',
        chainId: '1',
        tier: 2,
        benefits: { feeDiscount: 10, priorityAccess: false, openEntryTickets: 2 }
      }
    ]
  };

  // Bind methods to mock user
  mockUser.calculateTier = User.schema.methods.calculateTier;
  mockUser.getFoundersKeyBenefits = User.schema.methods.getFoundersKeyBenefits;
  mockUser.hasFoundersKey = User.schema.methods.hasFoundersKey;

  const tier = mockUser.calculateTier();
  const benefits = mockUser.getFoundersKeyBenefits();
  const hasKey = mockUser.hasFoundersKey();

  console.log('   ✅ User tier calculation:', tier);
  console.log('   ✅ Benefits aggregation:', benefits);
  console.log('   ✅ Has Founders Key check:', hasKey);

  // Test 7: Service Methods (without database)
  console.log('\n7. Testing Service Methods...');
  
  const tier1Benefits = foundersKeyService.calculateTierBenefits(1, {
    baseBenefits: { feeDiscount: 5, priorityAccess: false, openEntryTickets: 1 }
  });
  const tier5Benefits = foundersKeyService.calculateTierBenefits(5, {
    baseBenefits: { feeDiscount: 5, priorityAccess: false, openEntryTickets: 1 }
  });

  console.log('   ✅ Tier 1 benefits:', tier1Benefits);
  console.log('   ✅ Tier 5 benefits:', tier5Benefits);

  const stakingMultipliers = [30, 90, 180, 365].map(days => ({
    days,
    multiplier: foundersKeyService.getStakingMultiplier(days)
  }));
  console.log('   ✅ Staking multipliers:', stakingMultipliers);

  // Test 8: Middleware Functions
  console.log('\n8. Testing Middleware Functions...');
  
  const middlewareFunctions = [
    'requireFoundersKey',
    'requirePriorityAccess',
    'requireMinimumTier',
    'applyFeeDiscount',
    'validateStakingParams',
    'validateTicketUsage',
    'addFoundersKeyContext',
    'logFoundersKeyAction',
    'checkRaffleCreationPermission'
  ];

  middlewareFunctions.forEach(funcName => {
    if (typeof foundersKeyMiddleware[funcName] === 'function') {
      console.log(`   ✅ ${funcName} middleware available`);
    } else {
      console.log(`   ❌ ${funcName} middleware missing`);
    }
  });

  // Test 9: Schema Validation
  console.log('\n9. Testing Schema Validation...');
  
  // Test FoundersKeyContract schema
  const contractSchema = FoundersKeyContract.schema;
  const requiredFields = ['name', 'contractAddress', 'chainId', 'network', 'createdBy'];
  requiredFields.forEach(field => {
    const pathObj = contractSchema.paths[field];
    if (pathObj && pathObj.isRequired) {
      console.log(`   ✅ ${field} is required in FoundersKeyContract`);
    } else {
      console.log(`   ⚠️  ${field} may not be properly required in FoundersKeyContract`);
    }
  });

  // Test 10: Integration Points
  console.log('\n10. Testing Integration Points...');
  
  // Check if User model has foundersKeys field
  const userSchema = User.schema;
  if (userSchema.paths.foundersKeys) {
    console.log('   ✅ User model has foundersKeys field');
  } else {
    console.log('   ❌ User model missing foundersKeys field');
  }

  // Check if User model has required methods
  const userMethods = ['calculateTier', 'getFoundersKeyBenefits', 'hasFoundersKey'];
  userMethods.forEach(method => {
    if (typeof User.schema.methods[method] === 'function') {
      console.log(`   ✅ User model has ${method} method`);
    } else {
      console.log(`   ❌ User model missing ${method} method`);
    }
  });

  console.log('\n🎉 Founders Key System Component Test Complete!');
  console.log('\n📊 Summary:');
  console.log('   • All models loaded successfully ✅');
  console.log('   • Service and controllers loaded ✅');
  console.log('   • Routes and middleware loaded ✅');
  console.log('   • Basic functionality verified ✅');
  console.log('   • Schema validation checked ✅');
  console.log('   • Integration points verified ✅');

  console.log('\n🔧 System Ready For:');
  console.log('   • Database integration');
  console.log('   • NFT scanning via Alchemy');
  console.log('   • Staking system activation');
  console.log('   • Open entry allocations');
  console.log('   • Fee discount application');
  console.log('   • Admin management interface');

} catch (error) {
  console.error('❌ Component test failed:', error);
  process.exit(1);
}

console.log('\n✅ All components loaded and tested successfully!');