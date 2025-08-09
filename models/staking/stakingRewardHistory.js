const mongoose = require('mongoose');

const stakingRewardHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  stakingPositionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StakingPosition',
    required: true,
    index: true
  },
  stakingContractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StakingContract',
    required: true,
    index: true
  },
  // Reward details
  distributionDate: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  openEntryTickets: {
    type: Number,
    required: true,
    min: 0
  },
  bonusMultiplier: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  effectiveValue: {
    type: Number,
    required: true,
    min: 0
  },
  // Distribution context
  distributionType: {
    type: String,
    enum: ['monthly', 'manual', 'missed', 'claim'],
    default: 'monthly'
  },
  distributionMonth: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  distributionYear: {
    type: Number,
    required: true
  },
  // NFT details at time of distribution
  nftTokenId: {
    type: String,
    required: true
  },
  nftContractAddress: {
    type: String,
    required: true,
    lowercase: true
  },
  blockchain: {
    type: String,
    required: true,
    enum: ['ethereum', 'solana', 'polygon', 'base'],
    lowercase: true
  },
  // Staking context
  stakingDuration: {
    type: Number,
    required: true,
    enum: [6, 12, 36] // months
  },
  stakingStartDate: {
    type: Date,
    required: true
  },
  stakingEndDate: {
    type: Date,
    required: true
  },
  // Raffle ticket integration
  raffleTicketsCreated: [{
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RaffleTicket'
    },
    raffleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Raffle'
    },
    naffleTicketId: String
  }],
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'distributed', 'claimed', 'failed'],
    default: 'distributed'
  },
  failureReason: String,
  // Notification tracking
  notificationSent: {
    type: Boolean,
    default: false
  },
  notificationSentAt: Date,
  // Admin tracking
  distributedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  distributionSource: {
    type: String,
    enum: ['scheduler', 'manual', 'api'],
    default: 'scheduler'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
stakingRewardHistorySchema.index({ userId: 1, distributionDate: -1 });
stakingRewardHistorySchema.index({ stakingPositionId: 1, distributionDate: -1 });
stakingRewardHistorySchema.index({ stakingContractId: 1, distributionDate: -1 });
stakingRewardHistorySchema.index({ distributionYear: 1, distributionMonth: 1 });
stakingRewardHistorySchema.index({ blockchain: 1, nftContractAddress: 1 });
stakingRewardHistorySchema.index({ status: 1, distributionDate: -1 });

// Virtual for NFT identifier
stakingRewardHistorySchema.virtual('nftId').get(function() {
  return `${this.blockchain}:${this.nftContractAddress}:${this.nftTokenId}`;
});

// Virtual for distribution period
stakingRewardHistorySchema.virtual('distributionPeriod').get(function() {
  return `${this.distributionYear}-${String(this.distributionMonth).padStart(2, '0')}`;
});

// Method to calculate effective reward value
stakingRewardHistorySchema.methods.calculateEffectiveValue = function() {
  return this.openEntryTickets * this.bonusMultiplier;
};

// Static method to get user's total rewards
stakingRewardHistorySchema.statics.getUserTotalRewards = function(userId, timeRange = null) {
  const query = { userId, status: 'distributed' };
  
  if (timeRange) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRange);
    query.distributionDate = { $gte: startDate };
  }
  
  return this.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalTickets: { $sum: '$openEntryTickets' },
        totalEffectiveValue: { $sum: '$effectiveValue' },
        totalDistributions: { $sum: 1 },
        averageMultiplier: { $avg: '$bonusMultiplier' }
      }
    }
  ]);
};

// Static method to get contract performance metrics
stakingRewardHistorySchema.statics.getContractMetrics = function(contractId, timeRange = null) {
  const query = { stakingContractId: contractId, status: 'distributed' };
  
  if (timeRange) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRange);
    query.distributionDate = { $gte: startDate };
  }
  
  return this.aggregate([
    { $match: query },
    {
      $group: {
        _id: {
          year: '$distributionYear',
          month: '$distributionMonth'
        },
        totalTickets: { $sum: '$openEntryTickets' },
        totalEffectiveValue: { $sum: '$effectiveValue' },
        uniqueUsers: { $addToSet: '$userId' },
        totalDistributions: { $sum: 1 }
      }
    },
    {
      $addFields: {
        uniqueUserCount: { $size: '$uniqueUsers' }
      }
    },
    {
      $sort: { '_id.year': -1, '_id.month': -1 }
    }
  ]);
};

// Static method to get monthly distribution summary
stakingRewardHistorySchema.statics.getMonthlyDistributionSummary = function(year, month) {
  return this.aggregate([
    {
      $match: {
        distributionYear: year,
        distributionMonth: month,
        status: 'distributed'
      }
    },
    {
      $group: {
        _id: {
          contractId: '$stakingContractId',
          duration: '$stakingDuration'
        },
        totalTickets: { $sum: '$openEntryTickets' },
        totalEffectiveValue: { $sum: '$effectiveValue' },
        positionCount: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' }
      }
    },
    {
      $lookup: {
        from: 'stakingcontracts',
        localField: '_id.contractId',
        foreignField: '_id',
        as: 'contract'
      }
    },
    {
      $unwind: '$contract'
    },
    {
      $addFields: {
        uniqueUserCount: { $size: '$uniqueUsers' }
      }
    },
    {
      $project: {
        contractName: '$contract.contractName',
        contractAddress: '$contract.contractAddress',
        blockchain: '$contract.blockchain',
        stakingDuration: '$_id.duration',
        totalTickets: 1,
        totalEffectiveValue: 1,
        positionCount: 1,
        uniqueUserCount: 1
      }
    }
  ]);
};

// Pre-save middleware to calculate effective value
stakingRewardHistorySchema.pre('save', function(next) {
  if (this.isModified('openEntryTickets') || this.isModified('bonusMultiplier')) {
    this.effectiveValue = this.calculateEffectiveValue();
  }
  
  // Set distribution month and year if not set
  if (!this.distributionMonth || !this.distributionYear) {
    const date = this.distributionDate || new Date();
    this.distributionMonth = date.getMonth() + 1;
    this.distributionYear = date.getFullYear();
  }
  
  next();
});

module.exports = mongoose.model('StakingRewardHistory', stakingRewardHistorySchema);