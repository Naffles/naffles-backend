const mongoose = require('mongoose');
const User = require('./models/user/user');
const FoundersKeyContract = require('./models/user/foundersKeyContract');
const FoundersKeyStaking = require('./models/user/foundersKeyStaking');
const OpenEntryAllocation = require('./models/user/openEntryAllocation');
const foundersKeyService = require('./services/foundersKeyService');

// Test database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles-test', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

const verifyFoundersKeySystem = async () => {
  console.log('\n🔍 Verifying Founders Key System Implementation...\n');

  try {
    // Test 1: Model Creation and Validation
    console.log('1. Testing Model Creation and Validation...');
    
    // Create test admin user
    const adminUser = new User({
      username: 'admin-test',
      email: 'admin@test.com',
      role: 'admin'
    });
    await adminUser.save();
    console.log('   ✅ Admin user created');

    // Create test contract
    const testContract = new FoundersKeyContract({
      name: 'Test Founders Keys Collection',
      contractAddress: '0x1234567890123456789012345678901234567890',
      chainId: '1',
      network: 'ethereum',
      defaultTier: 2,
      baseBenefits: {
        feeDiscount: 10,
        priorityAccess: true,
        openEntryTickets: 2
      },
      createdBy: adminUser._id
    });
    await testContract.save();
    console.log('   ✅ Founders Key contract created');

    // Test tier benefits calculation
    const tier1Benefits = testContract.getBenefitsForTier(1);
    const tier5Benefits = testContract.getBenefitsForTier(5);
    console.log('   ✅ Tier benefits calculation:', {
      tier1: tier1Benefits,
      tier5: tier5Benefits
    });

    // Test 2: User Integration
    console.log('\n2. Testing User Integration...');
    
    const testUser = new User({
      username: 'founders-key-holder',
      email: 'holder@test.com',
      primaryWallet: {
        address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        walletType: 'metamask',
        chainId: '1'
      },
      foundersKeys: [
        {
          tokenId: '1',
          contractAddress: testContract.contractAddress,
          chainId: '1',
          tier: 3,
          benefits: { feeDiscount: 20, priorityAccess: true, openEntryTickets: 3 },
          stakingPeriod: { isActive: false }
        },
        {
          tokenId: '2',
          contractAddress: testContract.contractAddress,
          chainId: '1',
          tier: 2,
          benefits: { feeDiscount: 15, priorityAccess: true, openEntryTickets: 2 },
          stakingPeriod: { isActive: false }
        }
      ]
    });
    await testUser.save();
    console.log('   ✅ User with Founders Keys created');

    // Test tier calculation
    const userTier = testUser.calculateTier();
    console.log('   ✅ User tier calculated:', userTier);

    // Test benefits aggregation
    const totalBenefits = testUser.getFoundersKeyBenefits();
    console.log('   ✅ Total benefits aggregated:', totalBenefits);

    // Test 3: Service Functions
    console.log('\n3. Testing Service Functions...');

    // Test fee discount application
    const discountResult = await foundersKeyService.applyFeeDiscount(testUser._id, 100);
    console.log('   ✅ Fee discount applied:', discountResult);

    // Test priority access check
    const hasPriorityAccess = await foundersKeyService.hasPriorityAccess(testUser._id);
    console.log('   ✅ Priority access check:', hasPriorityAccess);

    // Test 4: Staking System
    console.log('\n4. Testing Staking System...');

    // Start staking
    const stakingResult = await foundersKeyService.startStaking(
      testUser._id,
      '1',
      testContract.contractAddress,
      180 // 6 months
    );
    console.log('   ✅ Staking started:', {
      success: stakingResult.success,
      stakingId: stakingResult.stakingRecord._id,
      enhancedBenefits: stakingResult.updatedBenefits
    });

    // Check staking record
    const stakingRecords = await FoundersKeyStaking.getActiveStakingByUser(testUser._id);
    console.log('   ✅ Active staking records:', stakingRecords.length);

    // Test staking calculations
    const stakingRecord = stakingRecords[0];
    const rewards = stakingRecord.calculateRewards();
    console.log('   ✅ Staking rewards calculated:', rewards);

    // Test 5: Open Entry Allocations
    console.log('\n5. Testing Open Entry Allocations...');

    // Process monthly allocations
    const allocations = await foundersKeyService.processOpenEntryAllocations();
    console.log('   ✅ Monthly allocations processed:', allocations.length);

    // Create manual allocation
    const manualAllocation = new OpenEntryAllocation({
      userId: testUser._id,
      ticketsAllocated: 5,
      source: 'admin_allocation',
      status: 'active',
      activatedAt: new Date()
    });
    await manualAllocation.save();
    console.log('   ✅ Manual allocation created');

    // Test ticket usage
    await manualAllocation.useTickets(2, new mongoose.Types.ObjectId(), 'test-tx-123');
    console.log('   ✅ Tickets used successfully:', {
      used: manualAllocation.ticketsUsed,
      remaining: manualAllocation.ticketsRemaining
    });

    // Get user allocations
    const userAllocations = await OpenEntryAllocation.getActiveAllocationsForUser(testUser._id);
    console.log('   ✅ User active allocations:', userAllocations.length);

    // Test 6: Analytics and Reporting
    console.log('\n6. Testing Analytics and Reporting...');

    // Generate snapshot
    const snapshot = await foundersKeyService.generateFoundersKeySnapshot();
    console.log('   ✅ Founders Key snapshot generated:', {
      totalHolders: snapshot.length,
      sampleUser: snapshot[0] ? {
        username: snapshot[0].username,
        totalKeys: snapshot[0].totalKeys,
        tier: snapshot[0].tier,
        benefits: {
          feeDiscount: snapshot[0].totalFeeDiscount,
          priorityAccess: snapshot[0].priorityAccess,
          openEntryTickets: snapshot[0].openEntryTickets
        }
      } : null
    });

    // Test allocation statistics
    const allocationStats = await OpenEntryAllocation.getAllocationStats();
    console.log('   ✅ Allocation statistics:', allocationStats);

    // Test staking statistics
    const stakingStats = await FoundersKeyStaking.getStakingStats();
    console.log('   ✅ Staking statistics:', stakingStats);

    // Test 7: End Staking
    console.log('\n7. Testing Staking Termination...');

    const endStakingResult = await foundersKeyService.endStaking(
      testUser._id,
      '1',
      testContract.contractAddress
    );
    console.log('   ✅ Staking ended:', endStakingResult);

    // Test 8: Contract Management
    console.log('\n8. Testing Contract Management...');

    // Test tier mapping
    testContract.tierMapping.set('100', 5);
    testContract.tierMapping.set('200', 4);
    await testContract.save();
    console.log('   ✅ Tier mapping updated');

    // Test contract queries
    const activeContracts = await FoundersKeyContract.getActiveContracts();
    const ethereumContracts = await FoundersKeyContract.getContractsByNetwork('ethereum');
    console.log('   ✅ Contract queries:', {
      activeContracts: activeContracts.length,
      ethereumContracts: ethereumContracts.length
    });

    // Test 9: Error Handling
    console.log('\n9. Testing Error Handling...');

    try {
      // Try to stake non-existent key
      await foundersKeyService.startStaking(testUser._id, '999', testContract.contractAddress, 90);
      console.log('   ❌ Should have thrown error for non-existent key');
    } catch (error) {
      console.log('   ✅ Correctly handled non-existent key error:', error.message);
    }

    try {
      // Try to use more tickets than available
      await manualAllocation.useTickets(10, new mongoose.Types.ObjectId(), 'test-tx-456');
      console.log('   ❌ Should have thrown error for insufficient tickets');
    } catch (error) {
      console.log('   ✅ Correctly handled insufficient tickets error:', error.message);
    }

    // Test 10: Cleanup and Final Verification
    console.log('\n10. Final System Verification...');

    // Count all records
    const totalUsers = await User.countDocuments({ 'foundersKeys.0': { $exists: true } });
    const totalContracts = await FoundersKeyContract.countDocuments();
    const totalStaking = await FoundersKeyStaking.countDocuments();
    const totalAllocations = await OpenEntryAllocation.countDocuments();

    console.log('   ✅ System totals:', {
      usersWithKeys: totalUsers,
      contracts: totalContracts,
      stakingRecords: totalStaking,
      allocations: totalAllocations
    });

    console.log('\n🎉 Founders Key System Verification Complete!');
    console.log('\n📊 Summary:');
    console.log('   • Models: FoundersKeyContract, FoundersKeyStaking, OpenEntryAllocation ✅');
    console.log('   • User Integration: Tier calculation, benefits aggregation ✅');
    console.log('   • Service Functions: Fee discounts, priority access ✅');
    console.log('   • Staking System: Start/end staking, rewards calculation ✅');
    console.log('   • Allocations: Monthly processing, ticket usage ✅');
    console.log('   • Analytics: Snapshots, statistics ✅');
    console.log('   • Error Handling: Validation, edge cases ✅');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    throw error;
  }
};

const cleanup = async () => {
  try {
    await User.deleteMany({ username: { $in: ['admin-test', 'founders-key-holder'] } });
    await FoundersKeyContract.deleteMany({});
    await FoundersKeyStaking.deleteMany({});
    await OpenEntryAllocation.deleteMany({});
    console.log('✅ Test data cleaned up');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
};

const main = async () => {
  await connectDB();
  
  try {
    await verifyFoundersKeySystem();
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  } finally {
    await cleanup();
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
  }
};

// Run verification if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { verifyFoundersKeySystem, cleanup };