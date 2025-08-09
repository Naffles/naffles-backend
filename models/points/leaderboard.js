const mongoose = require('mongoose');

const leaderboardEntrySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  walletAddress: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['points', 'gaming_wins', 'gaming_volume', 'raffle_wins', 'raffle_created', 'referrals'],
    required: true
  },
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'all_time'],
    required: true
  },
  value: {
    type: Number,
    required: true,
    default: 0
  },
  rank: {
    type: Number,
    required: true
  },
  previousRank: {
    type: Number,
    default: null
  },
  change: {
    type: String,
    enum: ['up', 'down', 'same', 'new'],
    default: 'new'
  },
  periodStart: {
    type: Date,
    required: true
  },
  periodEnd: {
    type: Date,
    required: true
  },
  metadata: {
    gamesPlayed: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    totalWagered: { type: Number, default: 0 },
    totalWon: { type: Number, default: 0 },
    rafflesCreated: { type: Number, default: 0 },
    rafflesWon: { type: Number, default: 0 },
    referralCount: { type: Number, default: 0 },
    pointsEarned: { type: Number, default: 0 },
    achievementsUnlocked: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
leaderboardEntrySchema.index({ category: 1, period: 1, rank: 1 });
leaderboardEntrySchema.index({ category: 1, period: 1, value: -1 });
leaderboardEntrySchema.index({ userId: 1, category: 1, period: 1 });
leaderboardEntrySchema.index({ periodStart: 1, periodEnd: 1 });

// Method to calculate rank change
leaderboardEntrySchema.methods.calculateChange = function() {
  if (this.previousRank === null) {
    this.change = 'new';
  } else if (this.rank < this.previousRank) {
    this.change = 'up';
  } else if (this.rank > this.previousRank) {
    this.change = 'down';
  } else {
    this.change = 'same';
  }
};

// Static method to get leaderboard for category and period
leaderboardEntrySchema.statics.getLeaderboard = function(category, period, limit = 100) {
  const now = new Date();
  let periodStart, periodEnd;

  switch (period) {
    case 'daily':
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'weekly':
      const dayOfWeek = now.getDay();
      periodStart = new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case 'all_time':
      periodStart = new Date(0);
      periodEnd = new Date('2099-12-31');
      break;
  }

  return this.find({
    category,
    period,
    periodStart: { $lte: periodStart },
    periodEnd: { $gte: periodEnd }
  })
  .populate('userId', 'username walletAddresses profileData')
  .sort({ rank: 1 })
  .limit(limit);
};

// Static method to update user's leaderboard entry
leaderboardEntrySchema.statics.updateUserEntry = async function(userId, category, period, value, metadata = {}) {
  const now = new Date();
  let periodStart, periodEnd;

  switch (period) {
    case 'daily':
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'weekly':
      const dayOfWeek = now.getDay();
      periodStart = new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case 'all_time':
      periodStart = new Date(0);
      periodEnd = new Date('2099-12-31');
      break;
  }

  // Find or create entry
  let entry = await this.findOne({
    userId,
    category,
    period,
    periodStart: { $lte: periodStart },
    periodEnd: { $gte: periodEnd }
  });

  if (!entry) {
    // Get user info
    const User = mongoose.model('User');
    const user = await User.findById(userId);
    
    entry = new this({
      userId,
      username: user.username || user.walletAddresses[0].substring(0, 8),
      walletAddress: user.walletAddresses[0],
      category,
      period,
      value: 0,
      rank: 999999, // Will be recalculated
      periodStart,
      periodEnd,
      metadata: {}
    });
  }

  // Update value and metadata
  entry.value = value;
  entry.metadata = { ...entry.metadata, ...metadata };
  
  await entry.save();
  return entry;
};

module.exports = mongoose.model('LeaderboardEntry', leaderboardEntrySchema);