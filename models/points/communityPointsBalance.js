const mongoose = require('mongoose');

const communityPointsBalanceSchema = new mongoose.Schema({
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
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  totalEarned: {
    type: Number,
    default: 0,
    min: 0
  },
  totalSpent: {
    type: Number,
    default: 0,
    min: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  tier: {
    type: String,
    default: 'bronze'
  },
  tierProgress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  // Community-specific metadata
  communityName: {
    type: String,
    required: true
  },
  pointsName: {
    type: String,
    required: true
  },
  pointsSymbol: {
    type: String
  },
  isNafflesCommunity: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Compound index for unique user-community balance
communityPointsBalanceSchema.index({ userId: 1, communityId: 1 }, { unique: true });
communityPointsBalanceSchema.index({ communityId: 1, balance: -1 });
communityPointsBalanceSchema.index({ communityId: 1, totalEarned: -1 });
communityPointsBalanceSchema.index({ communityId: 1, tier: 1, balance: -1 });
communityPointsBalanceSchema.index({ userId: 1 });
communityPointsBalanceSchema.index({ isNafflesCommunity: 1 });

// Virtual for rank calculation
communityPointsBalanceSchema.virtual('rank').get(function() {
  return this._rank || 0;
});

// Method to update tier based on total earned points and community configuration
communityPointsBalanceSchema.methods.updateTier = async function() {
  const Community = mongoose.model('Community');
  const community = await Community.findById(this.communityId);
  
  if (!community) {
    return;
  }
  
  const tiers = community.getTierConfiguration();
  let newTier = tiers[0].name;
  let nextTierThreshold = tiers[1]?.threshold;

  for (let i = tiers.length - 1; i >= 0; i--) {
    if (this.totalEarned >= tiers[i].threshold) {
      newTier = tiers[i].name;
      nextTierThreshold = i < tiers.length - 1 ? tiers[i + 1].threshold : null;
      break;
    }
  }

  this.tier = newTier;
  
  if (nextTierThreshold) {
    const currentTierThreshold = tiers.find(t => t.name === newTier).threshold;
    this.tierProgress = ((this.totalEarned - currentTierThreshold) / (nextTierThreshold - currentTierThreshold)) * 100;
  } else {
    this.tierProgress = 100; // Max tier reached
  }
};

// Static method to initialize user points for a community
communityPointsBalanceSchema.statics.initializeUserPoints = async function(userId, communityId) {
  const Community = mongoose.model('Community');
  const community = await Community.findById(communityId);
  
  if (!community) {
    throw new Error('Community not found');
  }
  
  let pointsBalance = await this.findOne({ userId, communityId });
  
  if (!pointsBalance) {
    pointsBalance = new this({
      userId,
      communityId,
      balance: community.pointsConfiguration.initialBalance,
      communityName: community.name,
      pointsName: community.pointsConfiguration.pointsName,
      pointsSymbol: community.pointsConfiguration.pointsSymbol,
      isNafflesCommunity: community.isNafflesCommunity
    });
    await pointsBalance.save();
  }

  return pointsBalance;
};

// Static method to get user's points across all communities
communityPointsBalanceSchema.statics.getUserPointsSummary = async function(userId) {
  const balances = await this.find({ userId })
    .populate('communityId', 'name slug branding features')
    .sort({ totalEarned: -1 });

  return {
    communities: balances.map(balance => ({
      communityId: balance.communityId._id,
      communityName: balance.communityName,
      pointsName: balance.pointsName,
      pointsSymbol: balance.pointsSymbol,
      balance: balance.balance,
      tier: balance.tier,
      rank: balance.rank,
      hasJackpot: balance.isNafflesCommunity,
      branding: balance.communityId.branding
    })),
    totalCommunities: balances.length
  };
};

// Static method to get community leaderboard
communityPointsBalanceSchema.statics.getCommunityLeaderboard = async function(communityId, limit = 100) {
  return await this.find({ communityId })
    .populate('userId', 'username profileData')
    .sort({ totalEarned: -1, balance: -1 })
    .limit(limit);
};

module.exports = mongoose.model('CommunityPointsBalance', communityPointsBalanceSchema);