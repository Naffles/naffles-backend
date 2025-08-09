const { ethers } = require('ethers');
const { Connection, PublicKey } = require('@solana/web3.js');
const TreasuryWallet = require('../../models/transactions/treasuryWallet');
const TransactionHistory = require('../../models/transactions/transactionHistory');
const Deposit = require('../../models/transactions/deposit');
const WalletBalance = require('../../models/user/walletBalance');
const User = require('../../models/user/user');

/**
 * Service for handling cryptocurrency deposits
 */
class DepositService {
  constructor() {
    this.providers = new Map();
    this.connections = new Map();
    this.initializeProviders();
  }

  /**
   * Initialize blockchain providers
   */
  initializeProviders() {
    const chains = {
      'ethereum': {
        rpc: process.env.ETHEREUM_RPC_URL || `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        chainId: '1'
      },
      'polygon': {
        rpc: process.env.POLYGON_RPC_URL || `https://polygon-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        chainId: '137'
      },
      'base': {
        rpc: process.env.BASE_RPC_URL || `https://base-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        chainId: '8453'
      },
      'solana': {
        rpc: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        chainId: 'solana-mainnet'
      }
    };

    for (const [chainName, config] of Object.entries(chains)) {
      try {
        if (chainName === 'solana') {
          const connection = new Connection(config.rpc, 'confirmed');
          this.connections.set(config.chainId, connection);
        } else {
          const provider = new ethers.JsonRpcProvider(config.rpc);
          this.providers.set(config.chainId, provider);
        }
      } catch (error) {
        console.error(`Failed to initialize provider for ${chainName}:`, error);
      }
    }
  }

  /**
   * Get treasury address for a specific chain
   */
  async getTreasuryAddress(chainId) {
    try {
      const treasuryWallet = await TreasuryWallet.findByChain(chainId);
      if (!treasuryWallet) {
        throw new Error(`No treasury wallet configured for chain ${chainId}`);
      }
      return treasuryWallet.address;
    } catch (error) {
      console.error(`Error getting treasury address for ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Monitor incoming transactions for a specific address
   */
  async monitorIncomingTransactions(chainId, address) {
    try {
      if (chainId === 'solana-mainnet') {
        return await this.monitorSolanaTransactions(address);
      } else {
        return await this.monitorEVMTransactions(chainId, address);
      }
    } catch (error) {
      console.error(`Error monitoring transactions for ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Monitor EVM-based chain transactions
   */
  async monitorEVMTransactions(chainId, address) {
    const provider = this.providers.get(chainId);
    if (!provider) {
      throw new Error(`No provider available for chain ${chainId}`);
    }

    try {
      // Get latest block number
      const latestBlock = await provider.getBlockNumber();
      
      // Look for transactions in recent blocks (last 10 blocks)
      const fromBlock = Math.max(0, latestBlock - 10);
      
      // Monitor native token transfers
      const filter = {
        address: null,
        fromBlock,
        toBlock: 'latest',
        topics: null
      };

      // Get transaction history for the address
      const history = await provider.getHistory(address, fromBlock);
      
      for (const tx of history) {
        await this.processEVMTransaction(chainId, tx);
      }

      return { success: true, processedTransactions: history.length };
    } catch (error) {
      console.error(`Error monitoring EVM transactions for ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Monitor Solana transactions
   */
  async monitorSolanaTransactions(address) {
    const connection = this.connections.get('solana-mainnet');
    if (!connection) {
      throw new Error('No Solana connection available');
    }

    try {
      const publicKey = new PublicKey(address);
      
      // Get recent transaction signatures
      const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 50 });
      
      for (const signatureInfo of signatures) {
        await this.processSolanaTransaction(signatureInfo);
      }

      return { success: true, processedTransactions: signatures.length };
    } catch (error) {
      console.error('Error monitoring Solana transactions:', error);
      throw error;
    }
  }

  /**
   * Process EVM transaction
   */
  async processEVMTransaction(chainId, tx) {
    try {
      // Check if transaction already exists
      const existingTx = await TransactionHistory.findByTxHash(tx.hash);
      if (existingTx) {
        return existingTx;
      }

      const provider = this.providers.get(chainId);
      const receipt = await provider.getTransactionReceipt(tx.hash);
      
      // Determine if this is a deposit to treasury
      const treasuryAddress = await this.getTreasuryAddress(chainId);
      const isDeposit = tx.to && tx.to.toLowerCase() === treasuryAddress.toLowerCase();
      
      if (!isDeposit) {
        return null; // Not a treasury deposit
      }

      // Create transaction history record
      const transactionHistory = new TransactionHistory({
        txHash: tx.hash,
        chainId,
        blockNumber: tx.blockNumber,
        blockHash: tx.blockHash,
        transactionIndex: tx.transactionIndex,
        type: 'deposit',
        direction: 'incoming',
        fromAddress: tx.from,
        toAddress: tx.to,
        tokenSymbol: this.getNativeTokenSymbol(chainId),
        tokenContract: 'native',
        tokenDecimals: 18,
        amount: ethers.formatEther(tx.value),
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: tx.gasPrice.toString(),
        gasFee: (receipt.gasUsed * tx.gasPrice).toString(),
        status: receipt.status === 1 ? 'confirmed' : 'failed',
        confirmations: await provider.getBlockNumber() - tx.blockNumber,
        requiredConfirmations: this.getRequiredConfirmations(chainId),
        processedAt: new Date()
      });

      await transactionHistory.save();

      // If confirmed, process the deposit
      if (transactionHistory.status === 'confirmed') {
        await this.processConfirmedDeposit(transactionHistory);
      }

      return transactionHistory;
    } catch (error) {
      console.error('Error processing EVM transaction:', error);
      throw error;
    }
  }

  /**
   * Process Solana transaction
   */
  async processSolanaTransaction(signatureInfo) {
    try {
      // Check if transaction already exists
      const existingTx = await TransactionHistory.findByTxHash(signatureInfo.signature);
      if (existingTx) {
        return existingTx;
      }

      const connection = this.connections.get('solana-mainnet');
      const tx = await connection.getTransaction(signatureInfo.signature, {
        commitment: 'confirmed'
      });

      if (!tx) {
        return null;
      }

      // Analyze transaction for treasury deposits
      const treasuryAddress = await this.getTreasuryAddress('solana-mainnet');
      const treasuryPubkey = new PublicKey(treasuryAddress);
      
      // Check if this transaction involves the treasury
      const isTreasuryTransaction = tx.transaction.message.accountKeys.some(
        key => key.equals(treasuryPubkey)
      );

      if (!isTreasuryTransaction) {
        return null;
      }

      // Parse transaction details
      const preBalance = tx.meta.preBalances[0] || 0;
      const postBalance = tx.meta.postBalances[0] || 0;
      const amount = Math.abs(postBalance - preBalance) / 1e9; // Convert lamports to SOL

      if (amount === 0) {
        return null; // No value transfer
      }

      // Create transaction history record
      const transactionHistory = new TransactionHistory({
        txHash: signatureInfo.signature,
        chainId: 'solana-mainnet',
        blockNumber: signatureInfo.slot,
        type: 'deposit',
        direction: 'incoming',
        fromAddress: tx.transaction.message.accountKeys[0].toString(),
        toAddress: treasuryAddress,
        tokenSymbol: 'SOL',
        tokenContract: 'native',
        tokenDecimals: 9,
        amount: amount.toString(),
        status: signatureInfo.err ? 'failed' : 'confirmed',
        confirmations: 1,
        requiredConfirmations: 1,
        processedAt: new Date()
      });

      await transactionHistory.save();

      // If confirmed, process the deposit
      if (transactionHistory.status === 'confirmed') {
        await this.processConfirmedDeposit(transactionHistory);
      }

      return transactionHistory;
    } catch (error) {
      console.error('Error processing Solana transaction:', error);
      throw error;
    }
  }

  /**
   * Process confirmed deposit
   */
  async processConfirmedDeposit(transactionHistory) {
    try {
      // Find user by wallet address
      const user = await User.findOne({
        'primaryWallet.address': { 
          $regex: new RegExp(`^${transactionHistory.fromAddress}$`, 'i') 
        }
      });

      if (!user) {
        console.log(`No user found for address ${transactionHistory.fromAddress}`);
        return;
      }

      // Update transaction history with user ID
      transactionHistory.userId = user._id;
      await transactionHistory.save();

      // Create deposit record
      const deposit = new Deposit({
        userRef: user._id,
        fromAddress: transactionHistory.fromAddress,
        amount: transactionHistory.amount,
        transactionHash: transactionHistory.txHash,
        coinType: transactionHistory.tokenSymbol,
        network: transactionHistory.chainId,
        blockNumber: transactionHistory.blockNumber
      });

      await deposit.save();

      // Update user balance
      await this.updateUserBalance(
        user._id,
        transactionHistory.tokenSymbol,
        transactionHistory.amount,
        'add'
      );

      console.log(`Processed deposit: ${transactionHistory.amount} ${transactionHistory.tokenSymbol} for user ${user.username}`);
      
      return { deposit, transactionHistory };
    } catch (error) {
      console.error('Error processing confirmed deposit:', error);
      throw error;
    }
  }

  /**
   * Update user balance
   */
  async updateUserBalance(userId, tokenSymbol, amount, operation = 'add') {
    try {
      let walletBalance = await WalletBalance.findOne({ userRef: userId });
      
      if (!walletBalance) {
        walletBalance = new WalletBalance({
          userRef: userId,
          balances: new Map(),
          fundingBalances: new Map(),
          itemShopBalances: new Map()
        });
      }

      const currentBalance = parseFloat(walletBalance.balances.get(tokenSymbol) || '0');
      const changeAmount = parseFloat(amount);
      
      let newBalance;
      if (operation === 'add') {
        newBalance = currentBalance + changeAmount;
      } else if (operation === 'subtract') {
        newBalance = Math.max(0, currentBalance - changeAmount);
      } else {
        throw new Error(`Invalid operation: ${operation}`);
      }

      walletBalance.balances.set(tokenSymbol, newBalance.toString());
      await walletBalance.save();

      return walletBalance;
    } catch (error) {
      console.error('Error updating user balance:', error);
      throw error;
    }
  }

  /**
   * Get native token symbol for chain
   */
  getNativeTokenSymbol(chainId) {
    const symbols = {
      '1': 'ETH',
      '137': 'MATIC',
      '8453': 'ETH',
      'solana-mainnet': 'SOL'
    };
    return symbols[chainId] || 'UNKNOWN';
  }

  /**
   * Get required confirmations for chain
   */
  getRequiredConfirmations(chainId) {
    const confirmations = {
      '1': 12,      // Ethereum
      '137': 20,    // Polygon
      '8453': 10,   // Base
      'solana-mainnet': 1  // Solana
    };
    return confirmations[chainId] || 1;
  }

  /**
   * Get user deposit history
   */
  async getUserDepositHistory(userId, options = {}) {
    try {
      const query = { userId, type: 'deposit' };
      
      if (options.chainId) query.chainId = options.chainId;
      if (options.status) query.status = options.status;
      
      const transactions = await TransactionHistory.find(query)
        .sort({ createdAt: -1 })
        .limit(options.limit || 50)
        .skip(options.skip || 0);

      return transactions;
    } catch (error) {
      console.error('Error getting user deposit history:', error);
      throw error;
    }
  }

  /**
   * Get deposit statistics
   */
  async getDepositStats(timeframe = '24h') {
    try {
      return await TransactionHistory.getTransactionStats(timeframe);
    } catch (error) {
      console.error('Error getting deposit stats:', error);
      throw error;
    }
  }

  /**
   * Validate deposit address
   */
  validateDepositAddress(address, chainId) {
    try {
      if (chainId === 'solana-mainnet') {
        // Solana address validation
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
      } else {
        // Ethereum-based address validation
        return /^0x[a-fA-F0-9]{40}$/.test(address);
      }
    } catch {
      return false;
    }
  }

  /**
   * Create pending deposit
   */
  async createPendingDeposit({ userId, amount, token, network, transactionHash, fromAddress }) {
    try {
      // Check if deposit already exists
      const existingDeposit = await Deposit.findOne({ transactionHash });
      if (existingDeposit) {
        throw new Error('Deposit with this transaction hash already exists');
      }

      const deposit = new Deposit({
        userRef: userId,
        fromAddress,
        amount,
        transactionHash,
        coinType: token,
        network,
        status: 'pending'
      });

      await deposit.save();
      return deposit;
    } catch (error) {
      console.error('Error creating pending deposit:', error);
      throw error;
    }
  }

  /**
   * Get user pending deposits
   */
  async getUserPendingDeposits(userId) {
    try {
      const deposits = await Deposit.find({
        userRef: userId,
        status: 'pending'
      }).sort({ createdAt: -1 });

      return deposits;
    } catch (error) {
      console.error('Error getting user pending deposits:', error);
      throw error;
    }
  }

  /**
   * Get user balance summary
   */
  async getUserBalanceSummary(userId) {
    try {
      const walletBalance = await WalletBalance.findOne({ userRef: userId });
      
      if (!walletBalance) {
        return {
          totalUsdValue: 0,
          balances: {},
          lastUpdated: new Date()
        };
      }

      // Convert Map to object for response
      const balances = {};
      for (const [token, amount] of walletBalance.balances.entries()) {
        balances[token] = amount;
      }

      // TODO: Calculate USD values using exchange rates
      const totalUsdValue = 0;

      return {
        totalUsdValue,
        balances,
        lastUpdated: walletBalance.updatedAt
      };
    } catch (error) {
      console.error('Error getting user balance summary:', error);
      throw error;
    }
  }

  /**
   * Get treasury balances
   */
  async getTreasuryBalances() {
    try {
      const treasuryWallets = await TreasuryWallet.find({});
      const balances = [];

      for (const wallet of treasuryWallets) {
        try {
          let balance = '0';
          
          if (wallet.chainId === 'solana-mainnet') {
            const connection = this.connections.get('solana-mainnet');
            if (connection) {
              const publicKey = new PublicKey(wallet.address);
              const balanceInfo = await connection.getBalance(publicKey);
              balance = (balanceInfo / 1e9).toString(); // Convert lamports to SOL
            }
          } else {
            const provider = this.providers.get(wallet.chainId);
            if (provider) {
              const balanceWei = await provider.getBalance(wallet.address);
              balance = ethers.formatEther(balanceWei);
            }
          }

          balances.push({
            chainId: wallet.chainId,
            address: wallet.address,
            balance,
            symbol: this.getNativeTokenSymbol(wallet.chainId)
          });
        } catch (error) {
          console.error(`Error getting balance for ${wallet.chainId}:`, error);
          balances.push({
            chainId: wallet.chainId,
            address: wallet.address,
            balance: '0',
            symbol: this.getNativeTokenSymbol(wallet.chainId),
            error: error.message
          });
        }
      }

      return balances;
    } catch (error) {
      console.error('Error getting treasury balances:', error);
      throw error;
    }
  }

  /**
   * Get treasury health status
   */
  async getTreasuryHealth() {
    try {
      const balances = await this.getTreasuryBalances();
      const recentTransactions = await TransactionHistory.find({})
        .sort({ createdAt: -1 })
        .limit(100);

      const health = {
        status: 'healthy',
        balances,
        recentActivity: {
          deposits: recentTransactions.filter(tx => tx.type === 'deposit').length,
          withdrawals: recentTransactions.filter(tx => tx.type === 'withdrawal').length,
          failed: recentTransactions.filter(tx => tx.status === 'failed').length
        },
        lastChecked: new Date()
      };

      // Check for any concerning patterns
      const failureRate = health.recentActivity.failed / recentTransactions.length;
      if (failureRate > 0.1) {
        health.status = 'warning';
        health.warnings = ['High failure rate detected'];
      }

      return health;
    } catch (error) {
      console.error('Error getting treasury health:', error);
      throw error;
    }
  }

  /**
   * Get transaction statistics
   */
  async getTransactionStats() {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [dailyStats, weeklyStats, totalStats] = await Promise.all([
        TransactionHistory.aggregate([
          { $match: { createdAt: { $gte: oneDayAgo } } },
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
              totalAmount: { $sum: { $toDouble: '$amount' } }
            }
          }
        ]),
        TransactionHistory.aggregate([
          { $match: { createdAt: { $gte: oneWeekAgo } } },
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
              totalAmount: { $sum: { $toDouble: '$amount' } }
            }
          }
        ]),
        TransactionHistory.aggregate([
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
              totalAmount: { $sum: { $toDouble: '$amount' } }
            }
          }
        ])
      ]);

      return {
        daily: dailyStats,
        weekly: weeklyStats,
        total: totalStats,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('Error getting transaction stats:', error);
      throw error;
    }
  }

  /**
   * Get monitoring status
   */
  async getMonitoringStatus() {
    try {
      return {
        isRunning: true, // TODO: Implement actual monitoring status
        lastCheck: new Date(),
        chainsMonitored: Array.from(this.providers.keys()).concat(Array.from(this.connections.keys())),
        errors: []
      };
    } catch (error) {
      console.error('Error getting monitoring status:', error);
      throw error;
    }
  }

  /**
   * Start monitoring
   */
  async startMonitoring() {
    try {
      // TODO: Implement monitoring start logic
      console.log('Monitoring started');
      return { success: true };
    } catch (error) {
      console.error('Error starting monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring() {
    try {
      // TODO: Implement monitoring stop logic
      console.log('Monitoring stopped');
      return { success: true };
    } catch (error) {
      console.error('Error stopping monitoring:', error);
      throw error;
    }
  }

  /**
   * Get exchange rates
   */
  async getExchangeRates() {
    try {
      // TODO: Implement actual exchange rate fetching
      return {
        ETH: { usd: 2000 },
        MATIC: { usd: 0.8 },
        SOL: { usd: 100 },
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('Error getting exchange rates:', error);
      throw error;
    }
  }

  /**
   * Get supported chains
   */
  async getSupportedChains() {
    try {
      return [
        {
          chainId: '1',
          name: 'Ethereum',
          symbol: 'ETH',
          rpcUrl: process.env.ETHEREUM_RPC_URL,
          explorerUrl: 'https://etherscan.io'
        },
        {
          chainId: '137',
          name: 'Polygon',
          symbol: 'MATIC',
          rpcUrl: process.env.POLYGON_RPC_URL,
          explorerUrl: 'https://polygonscan.com'
        },
        {
          chainId: '8453',
          name: 'Base',
          symbol: 'ETH',
          rpcUrl: process.env.BASE_RPC_URL,
          explorerUrl: 'https://basescan.org'
        },
        {
          chainId: 'solana-mainnet',
          name: 'Solana',
          symbol: 'SOL',
          rpcUrl: process.env.SOLANA_RPC_URL,
          explorerUrl: 'https://explorer.solana.com'
        }
      ];
    } catch (error) {
      console.error('Error getting supported chains:', error);
      throw error;
    }
  }
}

module.exports = new DepositService();