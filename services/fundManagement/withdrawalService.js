const { ethers } = require('ethers');
const { Connection, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const TreasuryWallet = require('../../models/transactions/treasuryWallet');
const TransactionHistory = require('../../models/transactions/transactionHistory');
const Withdraw = require('../../models/transactions/withdraw');
const WalletBalance = require('../../models/user/walletBalance');
const User = require('../../models/user/user');

/**
 * Service for handling cryptocurrency withdrawals
 */
class WithdrawalService {
  constructor() {
    this.providers = new Map();
    this.connections = new Map();
    this.treasuryWallets = new Map();
    this.initializeProviders();
  }

  /**
   * Initialize blockchain providers and treasury wallets
   */
  async initializeProviders() {
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

    // Initialize treasury wallets
    await this.loadTreasuryWallets();
  }

  /**
   * Load treasury wallets from database
   */
  async loadTreasuryWallets() {
    try {
      const treasuryWallets = await TreasuryWallet.findActiveWallets();
      
      for (const wallet of treasuryWallets) {
        // In production, private keys would be encrypted and require MFA to decrypt
        const privateKey = process.env[`TREASURY_${wallet.chainId.toUpperCase()}_PRIVATE_KEY`];
        
        if (privateKey) {
          if (wallet.chainId === 'solana-mainnet') {
            // Solana keypair
            const { Keypair } = require('@solana/web3.js');
            const keypair = Keypair.fromSecretKey(Buffer.from(privateKey, 'hex'));
            this.treasuryWallets.set(wallet.chainId, keypair);
          } else {
            // EVM wallet
            const provider = this.providers.get(wallet.chainId);
            if (provider) {
              const wallet_instance = new ethers.Wallet(privateKey, provider);
              this.treasuryWallets.set(wallet.chainId, wallet_instance);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading treasury wallets:', error);
    }
  }

  /**
   * Create withdrawal request
   */
  async createWithdrawalRequest(userId, chainId, tokenSymbol, tokenContract, amount, destinationAddress) {
    try {
      // Validate user balance
      const hasBalance = await this.validateUserBalance(userId, tokenSymbol, amount);
      if (!hasBalance) {
        throw new Error('Insufficient balance');
      }

      // Validate destination address
      if (!this.validateAddress(destinationAddress, chainId)) {
        throw new Error('Invalid destination address');
      }

      // Create withdrawal record
      const withdrawal = new Withdraw({
        userRef: userId,
        toAddress: destinationAddress,
        amount: amount,
        coinType: tokenSymbol,
        network: chainId,
        status: 'pending'
      });

      await withdrawal.save();

      // Lock user funds
      await this.lockUserFunds(userId, tokenSymbol, amount);

      // Create transaction history record
      const transactionHistory = new TransactionHistory({
        txHash: `pending-${withdrawal._id}`,
        chainId,
        type: 'withdrawal',
        direction: 'outgoing',
        fromAddress: await this.getTreasuryAddress(chainId),
        toAddress: destinationAddress,
        tokenSymbol,
        tokenContract,
        tokenDecimals: this.getTokenDecimals(tokenSymbol, chainId),
        amount,
        status: 'pending',
        userId,
        withdrawalId: withdrawal._id,
        metadata: new Map([
          ['withdrawalRequestId', withdrawal._id.toString()],
          ['requiresApproval', 'true']
        ])
      });

      await transactionHistory.save();

      return {
        withdrawal,
        transactionHistory
      };
    } catch (error) {
      console.error('Error creating withdrawal request:', error);
      throw error;
    }
  }

  /**
   * Approve withdrawal request (admin action)
   */
  async approveWithdrawal(withdrawalId, adminId, adminNotes = '') {
    try {
      const withdrawal = await Withdraw.findById(withdrawalId);
      if (!withdrawal) {
        throw new Error('Withdrawal request not found');
      }

      if (withdrawal.status !== 'pending') {
        throw new Error('Withdrawal request is not pending');
      }

      // Update withdrawal status
      withdrawal.status = 'approved';
      withdrawal.adminNotes = adminNotes;
      withdrawal.approvedBy = adminId;
      withdrawal.approvedAt = new Date();
      await withdrawal.save();

      // Update transaction history
      const transactionHistory = await TransactionHistory.findOne({
        withdrawalId: withdrawal._id
      });

      if (transactionHistory) {
        transactionHistory.status = 'approved';
        transactionHistory.processedBy = adminId;
        transactionHistory.metadata.set('approvedAt', new Date().toISOString());
        transactionHistory.metadata.set('adminNotes', adminNotes);
        await transactionHistory.save();
      }

      return withdrawal;
    } catch (error) {
      console.error('Error approving withdrawal:', error);
      throw error;
    }
  }

  /**
   * Reject withdrawal request (admin action)
   */
  async rejectWithdrawal(withdrawalId, adminId, adminNotes) {
    try {
      const withdrawal = await Withdraw.findById(withdrawalId);
      if (!withdrawal) {
        throw new Error('Withdrawal request not found');
      }

      if (withdrawal.status !== 'pending') {
        throw new Error('Withdrawal request is not pending');
      }

      // Update withdrawal status
      withdrawal.status = 'rejected';
      withdrawal.adminNotes = adminNotes;
      withdrawal.rejectedBy = adminId;
      withdrawal.rejectedAt = new Date();
      await withdrawal.save();

      // Unlock user funds
      await this.unlockUserFunds(withdrawal.userRef, withdrawal.coinType, withdrawal.amount);

      // Update transaction history
      const transactionHistory = await TransactionHistory.findOne({
        withdrawalId: withdrawal._id
      });

      if (transactionHistory) {
        transactionHistory.status = 'failed';
        transactionHistory.processedBy = adminId;
        transactionHistory.metadata.set('rejectedAt', new Date().toISOString());
        transactionHistory.metadata.set('adminNotes', adminNotes);
        await transactionHistory.save();
      }

      return withdrawal;
    } catch (error) {
      console.error('Error rejecting withdrawal:', error);
      throw error;
    }
  }

  /**
   * Process approved withdrawal (execute blockchain transaction)
   */
  async processWithdrawal(withdrawalId) {
    try {
      const withdrawal = await Withdraw.findById(withdrawalId);
      if (!withdrawal) {
        throw new Error('Withdrawal request not found');
      }

      if (withdrawal.status !== 'approved') {
        throw new Error('Withdrawal request is not approved');
      }

      // Update status to processing
      withdrawal.status = 'processing';
      await withdrawal.save();

      let txHash;
      try {
        // Execute blockchain transaction
        if (withdrawal.network === 'solana-mainnet') {
          txHash = await this.executeSolanaWithdrawal(withdrawal);
        } else {
          txHash = await this.executeEVMWithdrawal(withdrawal);
        }

        // Update withdrawal with transaction hash
        withdrawal.transactionHash = txHash;
        withdrawal.status = 'completed';
        withdrawal.processedAt = new Date();
        await withdrawal.save();

        // Update transaction history
        const transactionHistory = await TransactionHistory.findOne({
          withdrawalId: withdrawal._id
        });

        if (transactionHistory) {
          transactionHistory.txHash = txHash;
          transactionHistory.status = 'confirmed';
          transactionHistory.processedAt = new Date();
          transactionHistory.metadata.set('processedAt', new Date().toISOString());
          await transactionHistory.save();
        }

        return {
          success: true,
          txHash,
          withdrawal
        };
      } catch (txError) {
        // Transaction failed
        withdrawal.status = 'failed';
        withdrawal.adminNotes = `Transaction failed: ${txError.message}`;
        await withdrawal.save();

        // Unlock user funds
        await this.unlockUserFunds(withdrawal.userRef, withdrawal.coinType, withdrawal.amount);

        throw txError;
      }
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      throw error;
    }
  }

  /**
   * Execute EVM withdrawal
   */
  async executeEVMWithdrawal(withdrawal) {
    try {
      const treasuryWallet = this.treasuryWallets.get(withdrawal.network);
      if (!treasuryWallet) {
        throw new Error(`No treasury wallet available for ${withdrawal.network}`);
      }

      let tx;
      if (withdrawal.coinType === this.getNativeTokenSymbol(withdrawal.network)) {
        // Native token transfer
        tx = await treasuryWallet.sendTransaction({
          to: withdrawal.toAddress,
          value: ethers.parseEther(withdrawal.amount)
        });
      } else {
        // ERC20 token transfer
        const tokenContract = new ethers.Contract(
          this.getTokenContract(withdrawal.coinType, withdrawal.network),
          ['function transfer(address to, uint256 amount) returns (bool)'],
          treasuryWallet
        );

        const decimals = this.getTokenDecimals(withdrawal.coinType, withdrawal.network);
        const amount = ethers.parseUnits(withdrawal.amount, decimals);
        tx = await tokenContract.transfer(withdrawal.toAddress, amount);
      }

      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      if (receipt.status !== 1) {
        throw new Error('Transaction failed on blockchain');
      }

      return tx.hash;
    } catch (error) {
      console.error('Error executing EVM withdrawal:', error);
      throw error;
    }
  }

  /**
   * Execute Solana withdrawal
   */
  async executeSolanaWithdrawal(withdrawal) {
    try {
      const connection = this.connections.get('solana-mainnet');
      const treasuryKeypair = this.treasuryWallets.get('solana-mainnet');
      
      if (!connection || !treasuryKeypair) {
        throw new Error('Solana connection or treasury keypair not available');
      }

      const destinationPubkey = new PublicKey(withdrawal.toAddress);
      const lamports = parseFloat(withdrawal.amount) * 1e9; // Convert SOL to lamports

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: treasuryKeypair.publicKey,
          toPubkey: destinationPubkey,
          lamports
        })
      );

      // Send and confirm transaction
      const signature = await connection.sendTransaction(transaction, [treasuryKeypair]);
      await connection.confirmTransaction(signature, 'confirmed');

      return signature;
    } catch (error) {
      console.error('Error executing Solana withdrawal:', error);
      throw error;
    }
  }

  /**
   * Validate user balance
   */
  async validateUserBalance(userId, tokenSymbol, amount) {
    try {
      const walletBalance = await WalletBalance.findOne({ userRef: userId });
      if (!walletBalance) {
        return false;
      }

      const currentBalance = parseFloat(walletBalance.balances.get(tokenSymbol) || '0');
      const requestedAmount = parseFloat(amount);

      return currentBalance >= requestedAmount;
    } catch (error) {
      console.error('Error validating user balance:', error);
      return false;
    }
  }

  /**
   * Lock user funds during withdrawal process
   */
  async lockUserFunds(userId, tokenSymbol, amount) {
    try {
      const walletBalance = await WalletBalance.findOne({ userRef: userId });
      if (!walletBalance) {
        throw new Error('User balance not found');
      }

      const currentBalance = parseFloat(walletBalance.balances.get(tokenSymbol) || '0');
      const lockAmount = parseFloat(amount);

      if (currentBalance < lockAmount) {
        throw new Error('Insufficient balance to lock');
      }

      // Move funds from available balance to funding balance (locked)
      const newAvailableBalance = currentBalance - lockAmount;
      const currentFundingBalance = parseFloat(walletBalance.fundingBalances.get(tokenSymbol) || '0');
      const newFundingBalance = currentFundingBalance + lockAmount;

      walletBalance.balances.set(tokenSymbol, newAvailableBalance.toString());
      walletBalance.fundingBalances.set(tokenSymbol, newFundingBalance.toString());

      await walletBalance.save();
      return walletBalance;
    } catch (error) {
      console.error('Error locking user funds:', error);
      throw error;
    }
  }

  /**
   * Unlock user funds (if withdrawal is rejected or failed)
   */
  async unlockUserFunds(userId, tokenSymbol, amount) {
    try {
      const walletBalance = await WalletBalance.findOne({ userRef: userId });
      if (!walletBalance) {
        throw new Error('User balance not found');
      }

      const currentAvailableBalance = parseFloat(walletBalance.balances.get(tokenSymbol) || '0');
      const currentFundingBalance = parseFloat(walletBalance.fundingBalances.get(tokenSymbol) || '0');
      const unlockAmount = parseFloat(amount);

      if (currentFundingBalance < unlockAmount) {
        throw new Error('Insufficient locked balance to unlock');
      }

      // Move funds back from funding balance to available balance
      const newAvailableBalance = currentAvailableBalance + unlockAmount;
      const newFundingBalance = currentFundingBalance - unlockAmount;

      walletBalance.balances.set(tokenSymbol, newAvailableBalance.toString());
      walletBalance.fundingBalances.set(tokenSymbol, newFundingBalance.toString());

      await walletBalance.save();
      return walletBalance;
    } catch (error) {
      console.error('Error unlocking user funds:', error);
      throw error;
    }
  }

  /**
   * Get pending withdrawal requests
   */
  async getPendingWithdrawals() {
    try {
      return await Withdraw.find({ status: 'pending' })
        .populate('userRef', 'username email')
        .sort({ createdAt: -1 });
    } catch (error) {
      console.error('Error getting pending withdrawals:', error);
      throw error;
    }
  }

  /**
   * Get user withdrawal history
   */
  async getUserWithdrawals(userId) {
    try {
      return await Withdraw.find({ userRef: userId })
        .sort({ createdAt: -1 });
    } catch (error) {
      console.error('Error getting user withdrawals:', error);
      throw error;
    }
  }

  /**
   * Validate address format
   */
  validateAddress(address, chainId) {
    try {
      if (chainId === 'solana-mainnet') {
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
      } else {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
      }
    } catch {
      return false;
    }
  }

  /**
   * Get treasury address for chain
   */
  async getTreasuryAddress(chainId) {
    try {
      const treasuryWallet = await TreasuryWallet.findByChain(chainId);
      return treasuryWallet ? treasuryWallet.address : null;
    } catch (error) {
      console.error(`Error getting treasury address for ${chainId}:`, error);
      return null;
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
   * Get token decimals
   */
  getTokenDecimals(tokenSymbol, chainId) {
    // This would typically come from a token configuration
    const decimals = {
      'ETH': 18,
      'MATIC': 18,
      'SOL': 9,
      'USDC': 6,
      'USDT': 6
    };
    return decimals[tokenSymbol] || 18;
  }

  /**
   * Get token contract address
   */
  getTokenContract(tokenSymbol, chainId) {
    // This would typically come from a token configuration database
    const contracts = {
      '1': {
        'USDC': '0xA0b86a33E6441b8435b662303c0f6a4D2F2b3C4d',
        'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7'
      },
      '137': {
        'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
      }
    };
    
    return contracts[chainId]?.[tokenSymbol] || null;
  }

  /**
   * Create withdrawal request (controller method)
   */
  async createWithdrawalRequest({ userId, amount, token, network, destinationAddress }) {
    try {
      return await this.createWithdrawalRequest(userId, network, token, null, amount, destinationAddress);
    } catch (error) {
      console.error('Error creating withdrawal request:', error);
      throw error;
    }
  }

  /**
   * Get user withdrawal history (controller method)
   */
  async getUserWithdrawalHistory(userId, options = {}) {
    try {
      const { page = 1, limit = 20 } = options;
      const skip = (page - 1) * limit;

      const [withdrawals, total] = await Promise.all([
        Withdraw.find({ userRef: userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Withdraw.countDocuments({ userRef: userId })
      ]);

      return {
        withdrawals,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error getting user withdrawal history:', error);
      throw error;
    }
  }

  /**
   * Get pending withdrawals (controller method)
   */
  async getPendingWithdrawals(options = {}) {
    try {
      const { page = 1, limit = 20 } = options;
      const skip = (page - 1) * limit;

      const [withdrawals, total] = await Promise.all([
        Withdraw.find({ status: 'pending' })
          .populate('userRef', 'username email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Withdraw.countDocuments({ status: 'pending' })
      ]);

      return {
        withdrawals,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error getting pending withdrawals:', error);
      throw error;
    }
  }

  /**
   * Approve withdrawal (controller method)
   */
  async approveWithdrawal(withdrawalId, adminId) {
    try {
      return await this.approveWithdrawal(withdrawalId, adminId);
    } catch (error) {
      console.error('Error approving withdrawal:', error);
      throw error;
    }
  }

  /**
   * Reject withdrawal (controller method)
   */
  async rejectWithdrawal(withdrawalId, adminId, reason) {
    try {
      return await this.rejectWithdrawal(withdrawalId, adminId, reason);
    } catch (error) {
      console.error('Error rejecting withdrawal:', error);
      throw error;
    }
  }

  /**
   * Process withdrawal (controller method)
   */
  async processWithdrawal(withdrawalId, adminId, transactionHash) {
    try {
      // If transaction hash is provided, it means the transaction was executed externally
      if (transactionHash) {
        const withdrawal = await Withdraw.findById(withdrawalId);
        if (!withdrawal) {
          throw new Error('Withdrawal request not found');
        }

        withdrawal.transactionHash = transactionHash;
        withdrawal.status = 'completed';
        withdrawal.processedAt = new Date();
        withdrawal.processedBy = adminId;
        await withdrawal.save();

        // Update transaction history
        const transactionHistory = await TransactionHistory.findOne({
          withdrawalId: withdrawal._id
        });

        if (transactionHistory) {
          transactionHistory.txHash = transactionHash;
          transactionHistory.status = 'confirmed';
          transactionHistory.processedAt = new Date();
          transactionHistory.processedBy = adminId;
          await transactionHistory.save();
        }

        return withdrawal;
      } else {
        // Execute withdrawal automatically
        return await this.processWithdrawal(withdrawalId);
      }
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      throw error;
    }
  }
}

module.exports = new WithdrawalService();