const mongoose = require('mongoose');

const pointsBalanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
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
    enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    default: 'bronze'
  },
  tierProgress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {
  timestamps: true
});

// Index for efficient queries
pointsBalanceSchema.index({ userId: 1 });
pointsBalanceSchema.index({ balance: -1 });
pointsBalanceSchema.index({ totalEarned: -1 });
pointsBalanceSchema.index({ tier: 1, balance: -1 });

// Virtual for rank calculation
pointsBalanceSchema.virtual('rank').get(function() {
  return this._rank || 0;
});

// Method to update tier based on total earned points
pointsBalanceSchema.methods.updateTier = function() {
  const tiers = [
    { name: 'bronze', threshold: 0 },
    { name: 'silver', threshold: 1000 },
    { name: 'gold', threshold: 5000 },
    { name: 'platinum', threshold: 15000 },
    { name: 'diamond', threshold: 50000 }
  ];

  let newTier = 'bronze';
  let nextTierThreshold = 1000;

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

module.exports = mongoose.model('PointsBalance', pointsBalanceSchema);