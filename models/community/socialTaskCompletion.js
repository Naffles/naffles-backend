const mongoose = require('mongoose');

const socialTaskCompletionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SocialTask',
    required: true
  },
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'approved', 'rejected', 'completed'],
    default: 'pending'
  },
  submissionData: {
    // Twitter verification
    twitterHandle: String,
    tweetUrl: String,
    screenshotUrl: String,
    
    // Discord verification
    discordUsername: String,
    discordUserId: String,
    
    // Telegram verification
    telegramUsername: String,
    telegramUserId: String,
    
    // Custom URL verification
    proofUrl: String,
    proofDescription: String,
    
    // Quiz/Survey responses
    responses: [{
      questionIndex: Number,
      answer: String,
      isCorrect: Boolean
    }],
    
    // General submission data
    notes: String,
    attachments: [String] // URLs to uploaded files
  },
  verification: {
    method: {
      type: String,
      enum: ['automatic', 'manual', 'api', 'screenshot'],
      default: 'manual'
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    verifiedAt: Date,
    verificationNotes: String,
    apiResponse: mongoose.Schema.Types.Mixed // Store API verification response
  },
  rewards: {
    pointsAwarded: {
      type: Number,
      default: 0
    },
    bonusMultiplier: {
      type: Number,
      default: 1
    },
    additionalRewards: [{
      type: String,
      value: String,
      awarded: {
        type: Boolean,
        default: false
      }
    }]
  },
  completionTime: {
    startedAt: {
      type: Date,
      default: Date.now
    },
    submittedAt: Date,
    completedAt: Date,
    durationMinutes: Number
  },
  attempts: {
    type: Number,
    default: 1
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for unique user-task combinations
socialTaskCompletionSchema.index({ userId: 1, taskId: 1 }, { unique: true });
socialTaskCompletionSchema.index({ communityId: 1, status: 1 });
socialTaskCompletionSchema.index({ taskId: 1, status: 1 });
socialTaskCompletionSchema.index({ userId: 1, communityId: 1 });
socialTaskCompletionSchema.index({ createdAt: -1 });

// Virtual for completion duration
socialTaskCompletionSchema.virtual('completionDuration').get(function() {
  if (this.completionTime.completedAt && this.completionTime.startedAt) {
    return Math.floor((this.completionTime.completedAt - this.completionTime.startedAt) / (1000 * 60));
  }
  return null;
});

// Method to calculate score for quiz tasks
socialTaskCompletionSchema.methods.calculateQuizScore = function() {
  if (!this.submissionData.responses || this.submissionData.responses.length === 0) {
    return 0;
  }
  
  const correctAnswers = this.submissionData.responses.filter(r => r.isCorrect).length;
  const totalQuestions = this.submissionData.responses.length;
  
  return Math.round((correctAnswers / totalQuestions) * 100);
};

// Method to update completion status
socialTaskCompletionSchema.methods.updateStatus = async function(newStatus, verificationData = {}) {
  this.status = newStatus;
  
  if (newStatus === 'submitted') {
    this.completionTime.submittedAt = new Date();
  }
  
  if (newStatus === 'completed' || newStatus === 'approved') {
    this.completionTime.completedAt = new Date();
    this.completionTime.durationMinutes = this.completionDuration;
    
    if (verificationData.verifiedBy) {
      this.verification.verifiedBy = verificationData.verifiedBy;
      this.verification.verifiedAt = new Date();
      this.verification.verificationNotes = verificationData.notes;
    }
  }
  
  return await this.save();
};

// Static method to get user's completed tasks in community
socialTaskCompletionSchema.statics.getUserCompletedTasks = async function(userId, communityId) {
  return await this.find({
    userId,
    communityId,
    status: { $in: ['completed', 'approved'] },
    isActive: true
  }).populate('taskId');
};

// Static method to get task completion statistics
socialTaskCompletionSchema.statics.getTaskCompletionStats = async function(taskId) {
  const stats = await this.aggregate([
    { $match: { taskId: new mongoose.Types.ObjectId(taskId), isActive: true } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgDuration: { $avg: '$completionTime.durationMinutes' }
      }
    }
  ]);
  
  const totalCompletions = await this.countDocuments({ taskId, isActive: true });
  const uniqueUsers = await this.distinct('userId', { taskId, isActive: true });
  
  return {
    statusBreakdown: stats,
    totalCompletions,
    uniqueCompletions: uniqueUsers.length,
    completionRate: uniqueUsers.length > 0 ? (uniqueUsers.length / totalCompletions) * 100 : 0
  };
};

// Static method to get user's task completion history
socialTaskCompletionSchema.statics.getUserTaskHistory = async function(userId, communityId, options = {}) {
  const query = { userId, communityId, isActive: true };
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.taskType) {
    // This would require a lookup to the SocialTask collection
    const SocialTask = mongoose.model('SocialTask');
    const tasks = await SocialTask.find({ type: options.taskType }).select('_id');
    query.taskId = { $in: tasks.map(t => t._id) };
  }
  
  const completions = await this.find(query)
    .populate('taskId', 'title type rewards')
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0);
  
  return completions;
};

// Static method to get pending verifications for community admins
socialTaskCompletionSchema.statics.getPendingVerifications = async function(communityId, options = {}) {
  const query = {
    communityId,
    status: 'submitted',
    isActive: true
  };
  
  const completions = await this.find(query)
    .populate('userId', 'username email')
    .populate('taskId', 'title type verification')
    .sort({ createdAt: 1 }) // Oldest first for FIFO processing
    .limit(options.limit || 50)
    .skip(options.skip || 0);
  
  return completions;
};

// Static method to get community task analytics
socialTaskCompletionSchema.statics.getCommunityTaskAnalytics = async function(communityId, timeframe = '30d') {
  const timeframeMs = {
    '1d': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000
  };
  
  const startDate = new Date(Date.now() - (timeframeMs[timeframe] || timeframeMs['30d']));
  
  const analytics = await this.aggregate([
    {
      $match: {
        communityId: new mongoose.Types.ObjectId(communityId),
        createdAt: { $gte: startDate },
        isActive: true
      }
    },
    {
      $lookup: {
        from: 'socialtasks',
        localField: 'taskId',
        foreignField: '_id',
        as: 'task'
      }
    },
    { $unwind: '$task' },
    {
      $group: {
        _id: {
          taskType: '$task.type',
          status: '$status'
        },
        count: { $sum: 1 },
        totalPoints: { $sum: '$rewards.pointsAwarded' },
        avgCompletionTime: { $avg: '$completionTime.durationMinutes' }
      }
    },
    {
      $group: {
        _id: '$_id.taskType',
        statusBreakdown: {
          $push: {
            status: '$_id.status',
            count: '$count',
            totalPoints: '$totalPoints',
            avgCompletionTime: '$avgCompletionTime'
          }
        },
        totalCompletions: { $sum: '$count' },
        totalPointsAwarded: { $sum: '$totalPoints' }
      }
    },
    {
      $sort: { totalCompletions: -1 }
    }
  ]);
  
  return analytics;
};

module.exports = mongoose.model('SocialTaskCompletion', socialTaskCompletionSchema);