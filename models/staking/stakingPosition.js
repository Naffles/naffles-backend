const mongoose = require('mongoose');

const stakingPositionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  stakingContractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StakingContract',
    required: true
  },
  // NFT details
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
  nftMetadata: {
    name: String,
    description: String,
    image: String,
    attributes: [{
      trait_type: String,
      value: mongoose.Schema.Types.Mixed
    }]
  },
  // Staking details
  stakingDuration: {
    type: Number,
    required: true,
    enum: [6, 12, 36], // months
    validate: {
      validator: function(v) {
        return [6, 12, 36].includes(v);
      },
      message: 'Staking duration must be 6, 12, or 36 months'
    }
  },
  stakedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  unstakeAt: {
    type: Date,
    required: true
  },
  actualUnstakedAt: Date,
  status: {
    type: String,
    enum: ['active', 'unstaked', 'expired'],
    default: 'active'
  },
  // Reward tracking
  totalRewardsEarned: {
    type: Number,
    default: 0
  },
  lastRewardDistribution: Date,
  rewardHistory: [{
    distributedAt: {
      type: Date,
      required: true
    },
    openEntryTickets: {
      type: Number,
      required: true
    },
    bonusMultiplier: {
      type: Number,
      required: true
    },
    month: {
      type: Number,
      required: true
    },
    year: {
      type: Number,
      required: true
    }
  }],
  // Blockchain integration fields
  walletAddress: {
    type: String,
    required: true,
    lowercase: true
  },
  lockingHash: {
    type: String,
    required: true
  },
  unlockingHash: String,
  lockingTransactionHash: String,
  unlockingTransactionHash: String,
  // Smart contract integration fields
  smartContractPositionId: {
    type: String,
    sparse: true // Allows null values but creates unique index for non-null values
  },
  onChainVerified: {
    type: Boolean,
    default: false
  },
  blockchainTransactionHash: String, // Deprecated - use stakingTransaction.txHash
  smartContractEventId: String,
  // Blockchain transaction data
  stakingTransaction: {
    txHash: String,
    blockNumber: Number,
    gasUsed: Number,
    confirmed: {
      type: Boolean,
      default: false
    }
  },
  unstakingTransaction: {
    txHash: String,
    blockNumber: Number,
    gasUsed: Number,
    confirmed: {
      type: Boolean,
      default: false
    }
  },
  // Early unstaking penalty (if applicable)
  earlyUnstakePenalty: {
    applied: {
      type: Boolean,
      default: false
    },
    penaltyAmount: {
      type: Number,
      default: 0
    },
    reason: String
  },
  // Emergency actions
  emergencyUnlock: {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    unlockedAt: Date,
    transactionHash: String
  },
  emergencyWithdraw: {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    recipient: String,
    reason: String,
    withdrawnAt: Date,
    transactionHash: String
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
stakingPositionSchema.index({ userId: 1, status: 1 });
stakingPositionSchema.index({ stakingContractId: 1, status: 1 });
stakingPositionSchema.index({ nftContractAddress: 1, nftTokenId: 1 });
stakingPositionSchema.index({ unstakeAt: 1, status: 1 });
stakingPositionSchema.index({ blockchain: 1, status: 1 });
stakingPositionSchema.index({ smartContractPositionId: 1 }, { sparse: true });
stakingPositionSchema.index({ onChainVerified: 1, status: 1 });
stakingPositionSchema.index({ walletAddress: 1, blockchain: 1, status: 1 });

// Virtual for unique NFT identifier
stakingPositionSchema.virtual('nftId').get(function() {
  return `${this.blockchain}:${this.nftContractAddress}:${this.nftTokenId}`;
});

// Virtual for staking progress percentage
stakingPositionSchema.virtual('stakingProgress').get(function() {
  if (this.status !== 'active') return 100;
  
  const now = new Date();
  const totalDuration = this.unstakeAt.getTime() - this.stakedAt.getTime();
  const elapsed = now.getTime() - this.stakedAt.getTime();
  
  return Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
});

// Virtual for remaining time
stakingPositionSchema.virtual('remainingTime').get(function() {
  if (this.status !== 'active') return 0;
  
  const now = new Date();
  const remaining = this.unstakeAt.getTime() - now.getTime();
  
  return Math.max(0, remaining);
});

// Virtual for remaining days
stakingPositionSchema.virtual('remainingDays').get(function() {
  return Math.ceil(this.remainingTime / (1000 * 60 * 60 * 24));
});

// Method to check if position is eligible for rewards
stakingPositionSchema.methods.isEligibleForRewards = function() {
  return this.status === 'active' && new Date() < this.unstakeAt;
};

// Method to check if position can be unstaked
stakingPositionSchema.methods.canUnstake = function() {
  return this.status === 'active' && new Date() >= this.unstakeAt;
};

// Method to calculate next reward distribution date
stakingPositionSchema.methods.getNextRewardDate = function() {
  if (!this.isEligibleForRewards()) return null;
  
  const lastDistribution = this.lastRewardDistribution || this.stakedAt;
  const nextMonth = new Date(lastDistribution);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  
  return nextMonth > this.unstakeAt ? this.unstakeAt : nextMonth;
};

// Method to calculate pending rewards
stakingPositionSchema.methods.calculatePendingRewards = async function() {
  if (!this.isEligibleForRewards()) return 0;
  
  const stakingContract = await mongoose.model('StakingContract')
    .findById(this.stakingContractId);
  
  if (!stakingContract) return 0;
  
  const rewardStructure = stakingContract.getRewardStructure(this.stakingDuration);
  const lastDistribution = this.lastRewardDistribution || this.stakedAt;
  const now = new Date();
  
  // Calculate complete months since last distribution
  const monthsDiff = (now.getFullYear() - lastDistribution.getFullYear()) * 12 + 
                    (now.getMonth() - lastDistribution.getMonth());
  
  return Math.max(0, monthsDiff * rewardStructure.openEntryTicketsPerMonth);
};

// Method to add reward distribution record
stakingPositionSchema.methods.addRewardDistribution = function(tickets, multiplier) {
  const now = new Date();
  
  this.rewardHistory.push({
    distributedAt: now,
    openEntryTickets: tickets,
    bonusMultiplier: multiplier,
    month: now.getMonth() + 1,
    year: now.getFullYear()
  });
  
  this.totalRewardsEarned += tickets;
  this.lastRewardDistribution = now;
};

// Method to unstake position
stakingPositionSchema.methods.unstake = function(txHash, blockNumber) {
  this.status = 'unstaked';
  this.actualUnstakedAt = new Date();
  
  if (txHash) {
    this.unstakingTransaction = {
      txHash,
      blockNumber,
      confirmed: true
    };
  }
  
  // Check for early unstaking penalty
  if (this.actualUnstakedAt < this.unstakeAt) {
    const remainingTime = this.unstakeAt.getTime() - this.actualUnstakedAt.getTime();
    const totalTime = this.unstakeAt.getTime() - this.stakedAt.getTime();
    const penaltyPercentage = (remainingTime / totalTime) * 0.1; // 10% max penalty
    
    this.earlyUnstakePenalty = {
      applied: true,
      penaltyAmount: Math.floor(this.totalRewardsEarned * penaltyPercentage),
      reason: `Early unstaking penalty: ${Math.round(penaltyPercentage * 100)}%`
    };
  }
};

// Static method to find positions eligible for rewards
stakingPositionSchema.statics.findEligibleForRewards = function() {
  const now = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  
  return this.find({
    status: 'active',
    unstakeAt: { $gt: now },
    $or: [
      { lastRewardDistribution: { $lt: oneMonthAgo } },
      { lastRewardDistribution: { $exists: false } }
    ]
  }).populate('stakingContractId userId');
};

// Static method to get user's staking portfolio
stakingPositionSchema.statics.getUserPortfolio = function(userId) {
  return this.find({ userId })
    .populate('stakingContractId')
    .sort({ stakedAt: -1 });
};

// Pre-save middleware to set unstake date
stakingPositionSchema.pre('save', function(next) {
  if (this.isNew && !this.unstakeAt) {
    const unstakeDate = new Date(this.stakedAt);
    unstakeDate.setMonth(unstakeDate.getMonth() + this.stakingDuration);
    this.unstakeAt = unstakeDate;
  }
  next();
});

module.exports = mongoose.model('StakingPosition', stakingPositionSchema);