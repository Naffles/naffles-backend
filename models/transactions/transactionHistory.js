const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const transactionHistorySchema = new Schema({
  // Transaction identification
  txHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  chainId: {
    type: String,
    required: true,
    index: true
  },
  blockNumber: {
    type: Number,
    index: true
  },
  blockHash: String,
  transactionIndex: Number,
  
  // Transaction type and direction
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'internal_transfer', 'fee_collection', 'consolidation'],
    required: true,
    index: true
  },
  direction: {
    type: String,
    enum: ['incoming', 'outgoing', 'internal'],
    required: true,
    index: true
  },
  
  // Addresses involved
  fromAddress: {
    type: String,
    required: true,
    index: true
  },
  toAddress: {
    type: String,
    required: true,
    index: true
  },
  
  // Token and amount information
  tokenSymbol: {
    type: String,
    required: true,
    index: true
  },
  tokenContract: {
    type: String,
    required: true,
    index: true
  },
  tokenDecimals: {
    type: Number,
    required: true
  },
  amount: {
    type: String,
    required: true
  },
  amountUSD: {
    type: Number,
    index: true
  },
  
  // Gas and fee information
  gasUsed: String,
  gasPrice: String,
  gasFee: String,
  gasFeeUSD: Number,
  
  // Transaction status and confirmation
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed', 'dropped'],
    default: 'pending',
    index: true
  },
  confirmations: {
    type: Number,
    default: 0
  },
  requiredConfirmations: {
    type: Number,
    default: 1
  },
  
  // User association (if applicable)
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    sparse: true,
    index: true
  },
  
  // Related records
  depositId: {
    type: Schema.Types.ObjectId,
    ref: 'Deposit',
    sparse: true
  },
  withdrawalId: {
    type: Schema.Types.ObjectId,
    ref: 'Withdraw',
    sparse: true
  },
  withdrawalRequestId: {
    type: Schema.Types.ObjectId,
    ref: 'WithdrawalRequest',
    sparse: true
  },
  
  // Processing information
  processedAt: Date,
  processedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Metadata and notes
  metadata: {
    type: Map,
    of: String,
    default: {}
  },
  adminNotes: String,
  
  // Monitoring and alerts
  alerts: [{
    type: {
      type: String,
      enum: ['large_amount', 'suspicious_address', 'failed_transaction', 'low_confirmations']
    },
    message: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    resolvedAt: Date,
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Exchange rate at time of transaction
  exchangeRate: {
    rate: Number,
    source: String,
    timestamp: Date
  }
}, { 
  timestamps: true 
});

// Compound indexes for efficient queries
transactionHistorySchema.index({ chainId: 1, type: 1, status: 1 });
transactionHistorySchema.index({ userId: 1, type: 1, createdAt: -1 });
transactionHistorySchema.index({ fromAddress: 1, toAddress: 1 });
transactionHistorySchema.index({ tokenSymbol: 1, chainId: 1 });
transactionHistorySchema.index({ createdAt: -1 });
transactionHistorySchema.index({ amountUSD: -1 });

// Instance methods
transactionHistorySchema.methods.updateStatus = function(status, confirmations = 0) {
  this.status = status;
  this.confirmations = confirmations;
  if (status === 'confirmed' && !this.processedAt) {
    this.processedAt = new Date();
  }
  return this.save();
};

transactionHistorySchema.methods.addAlert = function(type, message, severity = 'medium') {
  this.alerts.push({
    type,
    message,
    severity,
    createdAt: new Date()
  });
  return this.save();
};

transactionHistorySchema.methods.resolveAlert = function(alertId, adminId) {
  const alert = this.alerts.id(alertId);
  if (alert) {
    alert.resolvedAt = new Date();
    alert.resolvedBy = adminId;
  }
  return this.save();
};

transactionHistorySchema.methods.updateExchangeRate = function(rate, source = 'coingecko') {
  this.exchangeRate = {
    rate,
    source,
    timestamp: new Date()
  };
  if (rate && this.amount) {
    this.amountUSD = parseFloat(this.amount) * rate;
  }
  return this.save();
};

transactionHistorySchema.methods.isConfirmed = function() {
  return this.status === 'confirmed' && this.confirmations >= this.requiredConfirmations;
};

transactionHistorySchema.methods.isTreasuryTransaction = function() {
  // Check if either address is a treasury address
  // This would need to be implemented based on your treasury address storage
  return this.metadata.get('isTreasuryTransaction') === 'true';
};

// Static methods
transactionHistorySchema.statics.findByUser = function(userId, options = {}) {
  const query = { userId };
  
  if (options.type) query.type = options.type;
  if (options.status) query.status = options.status;
  if (options.chainId) query.chainId = options.chainId;
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0);
};

transactionHistorySchema.statics.findByTxHash = function(txHash) {
  return this.findOne({ txHash });
};

transactionHistorySchema.statics.findPendingTransactions = function(chainId = null) {
  const query = { status: 'pending' };
  if (chainId) query.chainId = chainId;
  
  return this.find(query).sort({ createdAt: 1 });
};

transactionHistorySchema.statics.getTransactionStats = function(timeframe = '24h') {
  const now = new Date();
  let startDate;
  
  switch (timeframe) {
    case '1h':
      startDate = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  
  return this.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    { $group: {
      _id: {
        type: '$type',
        status: '$status',
        chainId: '$chainId'
      },
      count: { $sum: 1 },
      totalAmount: { $sum: { $toDouble: '$amount' } },
      totalAmountUSD: { $sum: '$amountUSD' },
      avgAmount: { $avg: { $toDouble: '$amount' } }
    }},
    { $sort: { '_id.type': 1, '_id.chainId': 1 } }
  ]);
};

transactionHistorySchema.statics.findLargeTransactions = function(threshold = 10000, timeframe = '24h') {
  const now = new Date();
  const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  return this.find({
    createdAt: { $gte: startDate },
    amountUSD: { $gte: threshold }
  }).sort({ amountUSD: -1 });
};

transactionHistorySchema.statics.findFailedTransactions = function(chainId = null, limit = 100) {
  const query = { status: 'failed' };
  if (chainId) query.chainId = chainId;
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Pre-save middleware
transactionHistorySchema.pre('save', function(next) {
  // Auto-calculate USD amount if exchange rate is available
  if (this.isModified('amount') || this.isModified('exchangeRate')) {
    if (this.exchangeRate && this.exchangeRate.rate && this.amount) {
      this.amountUSD = parseFloat(this.amount) * this.exchangeRate.rate;
    }
  }
  
  // Set processed timestamp when status changes to confirmed
  if (this.isModified('status') && this.status === 'confirmed' && !this.processedAt) {
    this.processedAt = new Date();
  }
  
  next();
});

// Virtual for formatted amount
transactionHistorySchema.virtual('formattedAmount').get(function() {
  const amount = parseFloat(this.amount);
  if (amount === 0) return '0';
  if (amount < 0.000001) return '< 0.000001';
  return amount.toFixed(6);
});

// Virtual for explorer URL
transactionHistorySchema.virtual('explorerUrl').get(function() {
  // This would need to be implemented based on your chain configuration
  const explorers = {
    '1': 'https://etherscan.io/tx/',
    '137': 'https://polygonscan.com/tx/',
    '8453': 'https://basescan.org/tx/',
    'solana-mainnet': 'https://solscan.io/tx/'
  };
  
  const baseUrl = explorers[this.chainId];
  return baseUrl ? `${baseUrl}${this.txHash}` : null;
});

module.exports = mongoose.model("TransactionHistory", transactionHistorySchema);