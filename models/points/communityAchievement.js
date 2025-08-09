const mongoose = require('mongoose');

const communityAchievementSchema = new mongoose.Schema({
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  category: {
    type: String,
    enum: ['gaming', 'raffles', 'social', 'milestones', 'special', 'community'],
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
      required: true
    },
    threshold: {
      type: Number,
      required: true,
      min: 1
    },
    timeframe: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'all_time'],
      default: 'all_time'
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  rewards: {
    points: {
      type: Number,
      required: true,
      min: 0
    },
    pointsName: {
      type: String,
      required: true
    },
    badge: {
      type: String,
      maxlength: 100
    },
    title: {
      type: String,
      maxlength: 50
    },
    multiplier: {
      type: Number,
      default: 1.0,
      min: 1.0
    }
  },
  rarity: {
    type: String,
    enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
    default: 'common'
  },
  icon: {
    type: String,
    maxlength: 200
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isSystemWide: {
    type: Boolean,
    default: false // Only true for Naffles system-wide achievements
  },
  // Community-specific metadata
  isNafflesCommunity: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
communityAchievementSchema.index({ communityId: 1, isActive: 1 });
communityAchievementSchema.index({ communityId: 1, category: 1 });
communityAchievementSchema.index({ communityId: 1, rarity: 1 });
communityAchievementSchema.index({ isSystemWide: 1 });
communityAchievementSchema.index({ 'requirements.activity': 1, communityId: 1 });
communityAchievementSchema.index({ order: 1, communityId: 1 });

// Method to check if achievement is relevant to activity
communityAchievementSchema.methods.isRelevantToActivity = function(activity) {
  const activityMap = {
    raffle_creation: ['raffle_creation', 'community_participation'],
    raffle_ticket_purchase: ['ticket_purchases', 'community_participation'],
    gaming_blackjack: ['gaming_sessions', 'gaming_wins', 'community_participation'],
    gaming_coin_toss: ['gaming_sessions', 'gaming_wins', 'community_participation'],
    gaming_rock_paper_scissors: ['gaming_sessions', 'gaming_wins', 'community_participation'],
    gaming_crypto_slots: ['gaming_sessions', 'gaming_wins', 'community_participation'],
    daily_login: ['consecutive_days', 'community_participation'],
    community_task: ['community_participation', 'social_tasks'],
    referral_bonus: ['referrals', 'community_growth']
  };

  const relevantActivities = activityMap[activity] || [];
  return relevantActivities.includes(this.requirements.activity);
};

// Static method to get community achievements
communityAchievementSchema.statics.getCommunityAchievements = async function(communityId, filters = {}) {
  const query = { communityId, isActive: true };
  
  if (filters.category) query.category = filters.category;
  if (filters.rarity) query.rarity = filters.rarity;
  
  return await this.find(query)
    .sort({ order: 1, createdAt: 1 })
    .populate('createdBy', 'username');
};

// Static method to create default achievements for new community
communityAchievementSchema.statics.createDefaultAchievements = async function(communityId) {
  const Community = mongoose.model('Community');
  const community = await Community.findById(communityId);
  
  if (!community) {
    throw new Error('Community not found');
  }

  const defaultAchievements = [
    {
      name: 'Welcome!',
      description: 'Join the community and earn your first points',
      category: 'milestones',
      type: 'count',
      requirements: {
        activity: 'community_participation',
        threshold: 1
      },
      rewards: {
        points: 100,
        pointsName: community.pointsConfiguration.pointsName,
        badge: 'welcome',
        title: 'Newcomer'
      },
      rarity: 'common',
      order: 1
    },
    {
      name: 'Point Collector',
      description: 'Earn your first 1,000 points',
      category: 'milestones',
      type: 'amount',
      requirements: {
        activity: 'points_earned',
        threshold: 1000
      },
      rewards: {
        points: 200,
        pointsName: community.pointsConfiguration.pointsName,
        badge: 'collector',
        title: 'Collector'
      },
      rarity: 'uncommon',
      order: 2
    },
    {
      name: 'Community Champion',
      description: 'Complete 10 community tasks',
      category: 'social',
      type: 'count',
      requirements: {
        activity: 'community_participation',
        threshold: 10
      },
      rewards: {
        points: 500,
        pointsName: community.pointsConfiguration.pointsName,
        badge: 'champion',
        title: 'Champion'
      },
      rarity: 'rare',
      order: 3
    }
  ];

  const achievements = defaultAchievements.map(achievement => ({
    ...achievement,
    communityId,
    isNafflesCommunity: community.isNafflesCommunity,
    createdBy: community.creatorId
  }));

  return await this.insertMany(achievements);
};

module.exports = mongoose.model('CommunityAchievement', communityAchievementSchema);