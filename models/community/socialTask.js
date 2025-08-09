const mongoose = require('mongoose');

const socialTaskSchema = new mongoose.Schema({
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  type: {
    type: String,
    required: true,
    enum: [
      'twitter_follow',
      'twitter_retweet',
      'twitter_like',
      'discord_join',
      'telegram_join',
      'raffle_entry',
      'custom_url',
      'quiz',
      'survey'
    ]
  },
  configuration: {
    // Twitter tasks
    twitterUsername: String,
    tweetUrl: String,
    
    // Discord tasks
    discordServerId: String,
    discordServerName: String,
    discordInviteUrl: String,
    requiredRole: String,
    
    // Telegram tasks
    telegramChannelUrl: String,
    telegramChannelName: String,
    
    // Raffle tasks
    raffleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Raffle'
    },
    
    // Custom URL tasks
    targetUrl: String,
    verificationMethod: {
      type: String,
      enum: ['manual', 'automatic', 'screenshot'],
      default: 'manual'
    },
    
    // Quiz/Survey tasks
    questions: [{
      question: String,
      type: {
        type: String,
        enum: ['multiple_choice', 'text', 'boolean']
      },
      options: [String], // For multiple choice
      correctAnswer: String, // For quiz
      required: {
        type: Boolean,
        default: true
      }
    }]
  },
  rewards: {
    points: {
      type: Number,
      required: true,
      min: 0
    },
    bonusMultiplier: {
      type: Number,
      default: 1,
      min: 0.1,
      max: 10
    },
    additionalRewards: [{
      type: {
        type: String,
        enum: ['badge', 'role', 'access', 'nft']
      },
      value: String,
      description: String
    }]
  },
  requirements: {
    minimumLevel: {
      type: Number,
      default: 0
    },
    requiredTasks: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SocialTask'
    }],
    cooldownPeriod: {
      type: Number, // in hours
      default: 0
    },
    maxCompletions: {
      type: Number,
      default: 1 // 0 = unlimited
    }
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed', 'expired'],
    default: 'draft'
  },
  schedule: {
    startDate: Date,
    endDate: Date,
    isRecurring: {
      type: Boolean,
      default: false
    },
    recurringPattern: {
      type: String,
      enum: ['daily', 'weekly', 'monthly']
    }
  },
  stats: {
    totalCompletions: {
      type: Number,
      default: 0
    },
    uniqueCompletions: {
      type: Number,
      default: 0
    },
    totalPointsAwarded: {
      type: Number,
      default: 0
    },
    averageCompletionTime: {
      type: Number, // in minutes
      default: 0
    }
  },
  verification: {
    requiresApproval: {
      type: Boolean,
      default: false
    },
    autoVerify: {
      type: Boolean,
      default: true
    },
    verificationInstructions: String
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
socialTaskSchema.index({ communityId: 1, status: 1 });
socialTaskSchema.index({ createdBy: 1 });
socialTaskSchema.index({ type: 1 });
socialTaskSchema.index({ 'schedule.startDate': 1, 'schedule.endDate': 1 });
socialTaskSchema.index({ isActive: 1, status: 1 });

// Virtual for completion rate
socialTaskSchema.virtual('completionRate').get(function() {
  if (this.stats.totalCompletions === 0) return 0;
  return (this.stats.uniqueCompletions / this.stats.totalCompletions) * 100;
});

// Method to check if task is available for user
socialTaskSchema.methods.isAvailableForUser = function(userId, userLevel = 0, completedTasks = []) {
  // Check if task is active
  if (!this.isActive || this.status !== 'active') {
    return { available: false, reason: 'Task is not active' };
  }
  
  // Check schedule
  const now = new Date();
  if (this.schedule.startDate && now < this.schedule.startDate) {
    return { available: false, reason: 'Task has not started yet' };
  }
  
  if (this.schedule.endDate && now > this.schedule.endDate) {
    return { available: false, reason: 'Task has expired' };
  }
  
  // Check minimum level requirement
  if (userLevel < this.requirements.minimumLevel) {
    return { 
      available: false, 
      reason: `Requires level ${this.requirements.minimumLevel}` 
    };
  }
  
  // Check required tasks
  if (this.requirements.requiredTasks && this.requirements.requiredTasks.length > 0) {
    const hasRequiredTasks = this.requirements.requiredTasks.every(taskId => 
      completedTasks.includes(taskId.toString())
    );
    
    if (!hasRequiredTasks) {
      return { available: false, reason: 'Required tasks not completed' };
    }
  }
  
  return { available: true };
};

// Method to calculate points with bonuses
socialTaskSchema.methods.calculateRewardPoints = function(basePoints = null) {
  const points = basePoints || this.rewards.points;
  return Math.floor(points * this.rewards.bonusMultiplier);
};

// Static method to get active tasks for community
socialTaskSchema.statics.getActiveTasks = async function(communityId, userId = null) {
  const query = {
    communityId,
    isActive: true,
    status: 'active'
  };
  
  const now = new Date();
  query.$or = [
    { 'schedule.startDate': { $exists: false } },
    { 'schedule.startDate': { $lte: now } }
  ];
  
  query.$and = [
    {
      $or: [
        { 'schedule.endDate': { $exists: false } },
        { 'schedule.endDate': { $gte: now } }
      ]
    }
  ];
  
  const tasks = await this.find(query)
    .populate('createdBy', 'username')
    .sort({ createdAt: -1 });
  
  return tasks;
};

// Static method to get task statistics
socialTaskSchema.statics.getTaskStatistics = async function(communityId, timeframe = '30d') {
  const timeframeMs = {
    '1d': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000
  };
  
  const startDate = new Date(Date.now() - (timeframeMs[timeframe] || timeframeMs['30d']));
  
  const stats = await this.aggregate([
    {
      $match: {
        communityId: new mongoose.Types.ObjectId(communityId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalCompletions: { $sum: '$stats.totalCompletions' },
        totalPointsAwarded: { $sum: '$stats.totalPointsAwarded' },
        avgCompletionTime: { $avg: '$stats.averageCompletionTime' }
      }
    },
    {
      $sort: { totalCompletions: -1 }
    }
  ]);
  
  return stats;
};

module.exports = mongoose.model('SocialTask', socialTaskSchema);