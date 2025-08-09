const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['gaming', 'raffles', 'social', 'milestones', 'special'],
    required: true
  },
  type: {
    type: String,
    enum: ['count', 'streak', 'amount', 'special'],
    required: true
  },
  requirements: {
    activity: {
      type: String,
      enum: [
        'raffle_creation',
        'raffle_wins',
        'ticket_purchases',
        'gaming_sessions',
        'gaming_wins',
        'points_earned',
        'consecutive_days',
        'referrals',
        'community_participation',
        'special_event'
      ]
    },
    threshold: { type: Number, required: true },
    timeframe: { type: String, enum: ['daily', 'weekly', 'monthly', 'all_time'], default: 'all_time' }
  },
  rewards: {
    points: { type: Number, default: 0 },
    badge: { type: String },
    title: { type: String },
    multiplier: { type: Number, default: 1.0 },
    specialReward: { type: String }
  },
  rarity: {
    type: String,
    enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
    default: 'common'
  },
  icon: {
    type: String,
    default: 'trophy'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isRepeatable: {
    type: Boolean,
    default: false
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
achievementSchema.index({ category: 1, isActive: 1 });
achievementSchema.index({ rarity: 1, isActive: 1 });
achievementSchema.index({ order: 1 });

module.exports = mongoose.model('Achievement', achievementSchema);