const mongoose = require('mongoose');
const TreasuryWallet = require('./models/transactions/treasuryWallet');
const TransactionHistory = require('./models/transactions/transactionHistory');
const Deposit = require('./models/transactions/deposit');
const Withdraw = require('./models/transactions/withdraw');
const WalletBalance = require('./models/user/walletBalance');
const User = require('./models/user/user');

// Test configuration
const TEST_CONFIG = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles-test',
  TEST_USER_ID: null,
  TEST_TREASURY_WALLETS: [
    {
      chainId: '1',
      address: '0x742d35Cc6634C0532925a3b8D4C9db96DfbB8b2e',
      chainName: 'Ethereum',
      isActive: true
    },
    {
      chainId: 'solana-mainnet',
      address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      chainName: 'Solana',
      isActive: true
    }
  ]
};

async function connectDatabase() {
  try {
    await mongoose.connect(TEST_CONFIG.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
}

async function createTestUser() {
  try {
    const testUser = new User({
      username: 'test-fund-user',
      email: 'test@example.com',
      primaryWallet: {
        address: '0x123456789abcdef123456789abcdef123456789a',
        type: 'metamask'
      }
    });

    await testUser.save();
    TEST_CONFIG.TEST_USER_ID = testUser._id;
    console.log('✅ Created test user:', testUser.username);
    return testUser;
  } catch (error) {
    if (error.code === 11000) {
      // User already exists
      const existingUser = await User.findOne({ username: 'test-fund-user' });
      TEST_CONFIG.TEST_USER_ID = existingUser._id;
      console.log('✅ Using existing test user:', existingUser.username);
      return existingUser;
    }
    throw error;
  }
}

async function setupTreasuryWallets() {
  try {
    for (const walletConfig of TEST_CONFIG.TEST_TREASURY_WALLETS) {
      const existingWallet = await TreasuryWallet.findOne({ chainId: walletConfig.chainId });
      
      if (!existingWallet) {
        const wallet = new TreasuryWallet(walletConfig);
        await wallet.save();
        console.log(`✅ Created treasury wallet for ${walletConfig.chainName}`);
      } else {
        console.log(`✅ Treasury wallet already exists for ${walletConfig.chainName}`);
      }
    }
  } catch (error) {
    console.error('❌ Error setting up treasury wallets:', error);
    throw error;
  }
}

async function testDepositService() {
  try {
    console.log('\n🧪 Testing Deposit Service...');
    
    const DepositService = require('./services/fundManagement/depositService');
    
    // Test getting treasury address
    const treasuryAddress = await DepositService.getTreasuryAddress('1');
    console.log('✅ Treasury address for Ethereum:', treasuryAddress);
    
    // Test creating pending deposit
    const pendingDeposit = await DepositService.createPendingDeposit({
      userId: TEST_CONFIG.TEST_USER_ID,
      amount: '1.0',
      token: 'ETH',
      network: '1',
      transactionHash: '0x' + Math.random().toString(16).substr(2, 64),
      fromAddress: '0x123456789abcdef123456789abcdef123456789a'
    });
    
    console.log('✅ Created pending deposit:', pendingDeposit._id);
    
    // Test getting user pending deposits
    const userPendingDeposits = await DepositService.getUserPendingDeposits(TEST_CONFIG.TEST_USER_ID);
    console.log('✅ User pending deposits count:', userPendingDeposits.length);
    
    // Test getting supported chains
    const supportedChains = await DepositService.getSupportedChains();
    console.log('✅ Supported chains count:', supportedChains.length);
    
  } catch (error) {
    console.error('❌ Deposit service test failed:', error);
    throw error;
  }
}

async function testWithdrawalService() {
  try {
    console.log('\n🧪 Testing Withdrawal Service...');
    
    const WithdrawalService = require('./services/fundManagement/withdrawalService');
    
    // First, create a wallet balance for the user
    const walletBalance = new WalletBalance({
      userRef: TEST_CONFIG.TEST_USER_ID,
      balances: new Map([['ETH', '10.0']]),
      fundingBalances: new Map([['ETH', '0.0']]),
      itemShopBalances: new Map([['ETH', '0.0']])
    });
    
    await walletBalance.save();
    console.log('✅ Created wallet balance for test user');
    
    // Test creating withdrawal request
    const withdrawalRequest = await WithdrawalService.createWithdrawalRequest({
      userId: TEST_CONFIG.TEST_USER_ID,
      amount: '1.0',
      token: 'ETH',
      network: '1',
      destinationAddress: '0x742d35Cc6634C0532925a3b8D4C9db96DfbB8b2e'
    });
    
    console.log('✅ Created withdrawal request:', withdrawalRequest.withdrawal._id);
    
    // Test getting pending withdrawals
    const pendingWithdrawals = await WithdrawalService.getPendingWithdrawals();
    console.log('✅ Pending withdrawals count:', pendingWithdrawals.withdrawals.length);
    
    // Test approving withdrawal
    const approvedWithdrawal = await WithdrawalService.approveWithdrawal(
      withdrawalRequest.withdrawal._id,
      TEST_CONFIG.TEST_USER_ID
    );
    
    console.log('✅ Approved withdrawal:', approvedWithdrawal.status);
    
  } catch (error) {
    console.error('❌ Withdrawal service test failed:', error);
    throw error;
  }
}

async function testTreasuryWalletModel() {
  try {
    console.log('\n🧪 Testing Treasury Wallet Model...');
    
    // Test finding active wallets
    const activeWallets = await TreasuryWallet.findActiveWallets();
    console.log('✅ Active treasury wallets count:', activeWallets.length);
    
    // Test finding by chain
    const ethereumWallet = await TreasuryWallet.findByChain('1');
    console.log('✅ Ethereum treasury wallet:', ethereumWallet ? ethereumWallet.address : 'Not found');
    
    // Test health summary
    const healthSummary = await TreasuryWallet.getHealthSummary();
    console.log('✅ Treasury health summary:', healthSummary);
    
  } catch (error) {
    console.error('❌ Treasury wallet model test failed:', error);
    throw error;
  }
}

async function testTransactionHistoryModel() {
  try {
    console.log('\n🧪 Testing Transaction History Model...');
    
    // Create a test transaction
    const testTransaction = new TransactionHistory({
      txHash: '0x' + Math.random().toString(16).substr(2, 64),
      chainId: '1',
      blockNumber: 12345678,
      type: 'deposit',
      direction: 'incoming',
      fromAddress: '0x123456789abcdef123456789abcdef123456789a',
      toAddress: '0x742d35Cc6634C0532925a3b8D4C9db96DfbB8b2e',
      tokenSymbol: 'ETH',
      tokenContract: 'native',
      tokenDecimals: 18,
      amount: '1.0',
      status: 'confirmed',
      userId: TEST_CONFIG.TEST_USER_ID
    });
    
    await testTransaction.save();
    console.log('✅ Created test transaction:', testTransaction.txHash);
    
    // Test finding by user
    const userTransactions = await TransactionHistory.findByUser(TEST_CONFIG.TEST_USER_ID);
    console.log('✅ User transactions count:', userTransactions.length);
    
    // Test getting transaction stats
    const stats = await TransactionHistory.getTransactionStats('24h');
    console.log('✅ Transaction stats:', stats.length, 'entries');
    
  } catch (error) {
    console.error('❌ Transaction history model test failed:', error);
    throw error;
  }
}

async function cleanup() {
  try {
    console.log('\n🧹 Cleaning up test data...');
    
    // Remove test data
    await User.deleteOne({ username: 'test-fund-user' });
    await WalletBalance.deleteMany({ userRef: TEST_CONFIG.TEST_USER_ID });
    await Deposit.deleteMany({ userRef: TEST_CONFIG.TEST_USER_ID });
    await Withdraw.deleteMany({ userRef: TEST_CONFIG.TEST_USER_ID });
    await TransactionHistory.deleteMany({ userId: TEST_CONFIG.TEST_USER_ID });
    
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

async function runTests() {
  try {
    console.log('🚀 Starting Fund Management System Tests\n');
    
    await connectDatabase();
    await createTestUser();
    await setupTreasuryWallets();
    
    await testTreasuryWalletModel();
    await testTransactionHistoryModel();
    await testDepositService();
    await testWithdrawalService();
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  } finally {
    await cleanup();
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  TEST_CONFIG
};