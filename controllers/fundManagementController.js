const DepositService = require('../services/fundManagement/depositService');
const WithdrawalService = require('../services/fundManagement/withdrawalService');
const TreasuryWallet = require('../models/transactions/treasuryWallet');
const TransactionHistory = require('../models/transactions/transactionHistory');
const WalletBalance = require('../models/user/walletBalance');

class FundManagementController {
  // User deposit endpoints
  async getTreasuryAddress(req, res) {
    try {
      const { chainId } = req.params;
      
      const treasuryAddress = await DepositService.getTreasuryAddress(chainId);
      
      res.json({
        success: true,
        data: { treasuryAddress, chainId }
      });
    } catch (error) {
      console.error('Error getting treasury address:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get treasury address',
        error: error.message
      });
    }
  }

  async createPendingDeposit(req, res) {
    try {
      const { userId, amount, token, network, transactionHash, fromAddress } = req.body;

      if (!userId || !amount || !token || !network || !transactionHash || !fromAddress) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields'
        });
      }

      const deposit = await DepositService.createPendingDeposit({
        userId,
        amount,
        token,
        network,
        transactionHash,
        fromAddress
      });

      res.json({
        success: true,
        data: deposit
      });
    } catch (error) {
      console.error('Error creating pending deposit:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create pending deposit',
        error: error.message
      });
    }
  }

  async getUserPendingDeposits(req, res) {
    try {
      const { userId } = req.params;
      
      const deposits = await DepositService.getUserPendingDeposits(userId);
      
      res.json({
        success: true,
        data: deposits
      });
    } catch (error) {
      console.error('Error getting user pending deposits:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get pending deposits',
        error: error.message
      });
    }
  }

  async getUserDepositHistory(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      const history = await DepositService.getUserDepositHistory(userId, { page, limit });
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Error getting user deposit history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get deposit history',
        error: error.message
      });
    }
  }

  // User withdrawal endpoints
  async createWithdrawalRequest(req, res) {
    try {
      const { userId, amount, token, network, destinationAddress } = req.body;

      if (!userId || !amount || !token || !network || !destinationAddress) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields'
        });
      }

      const withdrawal = await WithdrawalService.createWithdrawalRequest({
        userId,
        amount,
        token,
        network,
        destinationAddress
      });

      res.json({
        success: true,
        data: withdrawal
      });
    } catch (error) {
      console.error('Error creating withdrawal request:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create withdrawal request',
        error: error.message
      });
    }
  }

  async getUserWithdrawalHistory(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      const history = await WithdrawalService.getUserWithdrawalHistory(userId, { page, limit });
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Error getting user withdrawal history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get withdrawal history',
        error: error.message
      });
    }
  }

  // User balance endpoints
  async getUserBalances(req, res) {
    try {
      const { userId } = req.params;
      
      const balances = await WalletBalance.find({ userId }).lean();
      
      res.json({
        success: true,
        data: balances
      });
    } catch (error) {
      console.error('Error getting user balances:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user balances',
        error: error.message
      });
    }
  }

  async getUserBalanceSummary(req, res) {
    try {
      const { userId } = req.params;
      
      const summary = await DepositService.getUserBalanceSummary(userId);
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Error getting user balance summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get balance summary',
        error: error.message
      });
    }
  }

  // Transaction history endpoints
  async getUserTransactionHistory(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20, type, network } = req.query;

      const filter = { userId };
      if (type) filter.type = type;
      if (network) filter.network = network;

      const skip = (page - 1) * limit;
      
      const [transactions, total] = await Promise.all([
        TransactionHistory.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        TransactionHistory.countDocuments(filter)
      ]);

      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error getting transaction history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get transaction history',
        error: error.message
      });
    }
  }

  async getTransactionDetails(req, res) {
    try {
      const { txHash } = req.params;
      
      const transaction = await TransactionHistory.findOne({ transactionHash: txHash }).lean();
      
      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      res.json({
        success: true,
        data: transaction
      });
    } catch (error) {
      console.error('Error getting transaction details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get transaction details',
        error: error.message
      });
    }
  }

  // Admin withdrawal management endpoints
  async getPendingWithdrawals(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      
      const withdrawals = await WithdrawalService.getPendingWithdrawals({ page, limit });
      
      res.json({
        success: true,
        data: withdrawals
      });
    } catch (error) {
      console.error('Error getting pending withdrawals:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get pending withdrawals',
        error: error.message
      });
    }
  }

  async approveWithdrawal(req, res) {
    try {
      const { withdrawalId } = req.params;
      const adminId = req.user.id;
      
      const withdrawal = await WithdrawalService.approveWithdrawal(withdrawalId, adminId);
      
      res.json({
        success: true,
        data: withdrawal
      });
    } catch (error) {
      console.error('Error approving withdrawal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to approve withdrawal',
        error: error.message
      });
    }
  }

  async rejectWithdrawal(req, res) {
    try {
      const { withdrawalId } = req.params;
      const { reason } = req.body;
      const adminId = req.user.id;
      
      const withdrawal = await WithdrawalService.rejectWithdrawal(withdrawalId, adminId, reason);
      
      res.json({
        success: true,
        data: withdrawal
      });
    } catch (error) {
      console.error('Error rejecting withdrawal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reject withdrawal',
        error: error.message
      });
    }
  }

  async processWithdrawal(req, res) {
    try {
      const { withdrawalId } = req.params;
      const { transactionHash } = req.body;
      const adminId = req.user.id;
      
      const withdrawal = await WithdrawalService.processWithdrawal(withdrawalId, adminId, transactionHash);
      
      res.json({
        success: true,
        data: withdrawal
      });
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process withdrawal',
        error: error.message
      });
    }
  }

  // Admin treasury management endpoints
  async getTreasuryBalances(req, res) {
    try {
      const balances = await DepositService.getTreasuryBalances();
      
      res.json({
        success: true,
        data: balances
      });
    } catch (error) {
      console.error('Error getting treasury balances:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get treasury balances',
        error: error.message
      });
    }
  }

  async getTreasuryHealth(req, res) {
    try {
      const health = await DepositService.getTreasuryHealth();
      
      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      console.error('Error getting treasury health:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get treasury health',
        error: error.message
      });
    }
  }

  async getTreasuryConfigurations(req, res) {
    try {
      const configurations = await TreasuryWallet.find({}).lean();
      
      res.json({
        success: true,
        data: configurations
      });
    } catch (error) {
      console.error('Error getting treasury configurations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get treasury configurations',
        error: error.message
      });
    }
  }

  async updateTreasuryAddress(req, res) {
    try {
      const { chainId, address, mfaCode } = req.body;
      
      if (!chainId || !address || !mfaCode) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: chainId, address, mfaCode'
        });
      }

      // TODO: Verify MFA code
      
      const wallet = await TreasuryWallet.findOneAndUpdate(
        { chainId },
        { address, updatedAt: new Date(), updatedBy: req.user.id },
        { new: true, upsert: true }
      );

      res.json({
        success: true,
        data: wallet
      });
    } catch (error) {
      console.error('Error updating treasury address:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update treasury address',
        error: error.message
      });
    }
  }

  async getTreasuryAddressAdmin(req, res) {
    try {
      const { chainId } = req.params;
      
      const wallet = await TreasuryWallet.findOne({ chainId }).lean();
      
      if (!wallet) {
        return res.status(404).json({
          success: false,
          message: 'Treasury wallet not found for this chain'
        });
      }

      res.json({
        success: true,
        data: wallet
      });
    } catch (error) {
      console.error('Error getting treasury address (admin):', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get treasury address',
        error: error.message
      });
    }
  }

  // Admin transaction monitoring endpoints
  async getRecentTransactions(req, res) {
    try {
      const { limit = 50 } = req.query;
      
      const transactions = await TransactionHistory.find({})
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .lean();

      res.json({
        success: true,
        data: transactions
      });
    } catch (error) {
      console.error('Error getting recent transactions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get recent transactions',
        error: error.message
      });
    }
  }

  async getTransactionStats(req, res) {
    try {
      const stats = await DepositService.getTransactionStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting transaction stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get transaction stats',
        error: error.message
      });
    }
  }

  async getLargeTransactions(req, res) {
    try {
      const { threshold = 10000, limit = 20 } = req.query;
      
      const transactions = await TransactionHistory.find({
        usdValue: { $gte: parseFloat(threshold) }
      })
        .sort({ usdValue: -1 })
        .limit(parseInt(limit))
        .lean();

      res.json({
        success: true,
        data: transactions
      });
    } catch (error) {
      console.error('Error getting large transactions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get large transactions',
        error: error.message
      });
    }
  }

  async getFailedTransactions(req, res) {
    try {
      const { limit = 20 } = req.query;
      
      const transactions = await TransactionHistory.find({
        status: 'failed'
      })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .lean();

      res.json({
        success: true,
        data: transactions
      });
    } catch (error) {
      console.error('Error getting failed transactions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get failed transactions',
        error: error.message
      });
    }
  }

  // Monitoring and health endpoints
  async healthCheck(req, res) {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date(),
        services: {
          database: 'connected',
          blockchain: 'connected'
        }
      };

      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      console.error('Error in health check:', error);
      res.status(500).json({
        success: false,
        message: 'Health check failed',
        error: error.message
      });
    }
  }

  async getMonitoringStatus(req, res) {
    try {
      const status = await DepositService.getMonitoringStatus();
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Error getting monitoring status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get monitoring status',
        error: error.message
      });
    }
  }

  async startMonitoring(req, res) {
    try {
      await DepositService.startMonitoring();
      
      res.json({
        success: true,
        message: 'Monitoring started successfully'
      });
    } catch (error) {
      console.error('Error starting monitoring:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start monitoring',
        error: error.message
      });
    }
  }

  async stopMonitoring(req, res) {
    try {
      await DepositService.stopMonitoring();
      
      res.json({
        success: true,
        message: 'Monitoring stopped successfully'
      });
    } catch (error) {
      console.error('Error stopping monitoring:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop monitoring',
        error: error.message
      });
    }
  }

  // Exchange rate endpoints
  async getExchangeRates(req, res) {
    try {
      const rates = await DepositService.getExchangeRates();
      
      res.json({
        success: true,
        data: rates
      });
    } catch (error) {
      console.error('Error getting exchange rates:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get exchange rates',
        error: error.message
      });
    }
  }

  async getSupportedChains(req, res) {
    try {
      const chains = await DepositService.getSupportedChains();
      
      res.json({
        success: true,
        data: chains
      });
    } catch (error) {
      console.error('Error getting supported chains:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get supported chains',
        error: error.message
      });
    }
  }
}

module.exports = new FundManagementController();