const mongoose = require('mongoose');

const communityPointsTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true
  },
  type: {
    type: String,
    enum: ['earned', 'spent', 'bonus', 'penalty', 'jackpot', 'admin_award', 'admin_deduct', 'achievement'],
    required: true
  },
  activity: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  balanceBefore: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  multiplier: {
    type: Number,
    default: 1.0
  },
  baseAmount: {
    type: Number,
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  description: {
    type: String,
    required: true
  },
  isReversible: {
    type: Boolean,
    default: false
  },
  isSystemWide: {
    type: Boolean,
    default: false // Only true for Naffles system-wide activities
  },
  // Community-specific metadata
  pointsName: {
    type: String,
    required: true
  },
  isNafflesCommunity: {
    type: Boolean,
    default: false
  },
  // Admin tracking
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reversedAt: {
    type: Date
  },
  reversedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
communityPointsTransactionSchema.index({ userId: 1, communityId: 1, createdAt: -1 });
communityPointsTransactionSchema.index({ communityId: 1, createdAt: -1 });
communityPointsTransactionSchema.index({ userId: 1, createdAt: -1 });
communityPointsTransactionSchema.index({ type: 1, communityId: 1 });
communityPointsTransactionSchema.index({ activity: 1, communityId: 1 });
communityPointsTransactionSchema.index({ isSystemWide: 1 });
communityPointsTransactionSchema.index({ isReversible: 1, reversedAt: 1 });

// Method to reverse transaction (admin only)
communityPointsTransactionSchema.methods.reverse = async function(adminId, reason) {
  if (!this.isReversible || this.reversedAt) {
    throw new Error('Transaction cannot be reversed');
  }

  const CommunityPointsBalance = mongoose.model('CommunityPointsBalance');
  const balance = await CommunityPointsBalance.findOne({
    userId: this.userId,
    communityId: this.communityId
  });

  if (!balance) {
    throw new Error('User balance not found');
  }

  // Create reversal transaction
  const reversalTransaction = new this.constructor({
    userId: this.userId,
    communityId: this.communityId,
    type: 'admin_deduct',
    activity: 'transaction_reversal',
    amount: -this.amount,
    balanceBefore: balance.balance,
    balanceAfter: balance.balance - this.amount,
    baseAmount: -this.amount,
    metadata: {
      originalTransactionId: this._id,
      reason,
      adminId
    },
    description: `Reversal: ${this.description}`,
    pointsName: this.pointsName,
    isNafflesCommunity: this.isNafflesCommunity,
    adminId,
    isReversible: false
  });

  // Update balance
  balance.balance -= this.amount;
  if (this.amount > 0) {
    balance.totalEarned -= this.amount;
  } else {
    balance.totalSpent += this.amount;
  }
  await balance.updateTier();

  // Mark original transaction as reversed
  this.reversedAt = new Date();
  this.reversedBy = adminId;

  // Save all changes
  await Promise.all([
    reversalTransaction.save(),
    balance.save(),
    this.save()
  ]);

  return reversalTransaction;
};

// Static method to get transaction history for user in community
communityPointsTransactionSchema.statics.getUserCommunityHistory = async function(userId, communityId, options = {}) {
  const query = { userId, communityId };
  
  if (options.type) query.type = options.type;
  if (options.activity) query.activity = options.activity;
  if (options.dateFrom) query.createdAt = { $gte: new Date(options.dateFrom) };
  if (options.dateTo) {
    query.createdAt = query.createdAt || {};
    query.createdAt.$lte = new Date(options.dateTo);
  }

  const page = options.page || 1;
  const limit = options.limit || 20;
  const skip = (page - 1) * limit;

  const transactions = await this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('adminId', 'username')
    .populate('reversedBy', 'username');

  const total = await this.countDocuments(query);

  return {
    transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static method to get community transaction analytics
communityPointsTransactionSchema.statics.getCommunityAnalytics = async function(communityId, timeframe = '30d') {
  const startDate = new Date();
  switch (timeframe) {
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 90);
      break;
    default:
      startDate.setDate(startDate.getDate() - 30);
  }

  const analytics = await this.aggregate([
    {
      $match: {
        communityId: new mongoose.Types.ObjectId(communityId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          type: '$type',
          activity: '$activity'
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        avgAmount: { $avg: '$amount' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  return analytics;
};

module.exports = mongoose.model('CommunityPointsTransaction', communityPointsTransactionSchema);