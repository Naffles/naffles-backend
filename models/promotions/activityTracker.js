const mongoose = require('mongoose');

const activityTrackerSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Activity tracking periods
  trackingPeriods: [{
    periodType: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      required: true
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    
    // Activity counters
    activities: {
      login: {
        count: { type: Number, default: 0 },
        lastActivity: Date,
        details: [{ timestamp: Date, metadata: mongoose.Schema.Types.Mixed }]
      },
      raffle_participation: {
        count: { type: Number, default: 0 },
        lastActivity: Date,
        details: [{ 
          timestamp: Date, 
          raffleId: mongoose.Schema.Types.ObjectId,
          ticketsPurchased: Number,
          amountSpent: Number,
          metadata: mongoose.Schema.Types.Mixed 
        }]
      },
      gaming_activity: {
        count: { type: Number, default: 0 },
        lastActivity: Date,
        details: [{ 
          timestamp: Date, 
          gameType: String,
          sessionId: mongoose.Schema.Types.ObjectId,
          amountWagered: Number,
          outcome: String,
          metadata: mongoose.Schema.Types.Mixed 
        }]
      },
      community_engagement: {
        count: { type: Number, default: 0 },
        lastActivity: Date,
        details: [{ 
          timestamp: Date, 
          engagementType: String,
          communityId: mongoose.Schema.Types.ObjectId,
          pointsEarned: Number,
          metadata: mongoose.Schema.Types.Mixed 
        }]
      }
    },
    
    // Promotion eligibility tracking
    eligiblePromotions: [{
      promotionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Promotion'
      },
      requirements: [{
        activityType: String,
        requiredCount: Number,
        currentCount: Number,
        completed: { type: Boolean, default: false },
        completedAt: Date
      }],
      overallCompleted: { type: Boolean, default: false },
      rewardClaimed: { type: Boolean, default: false },
      rewardClaimedAt: Date
    }],
    
    // Status
    status: {
      type: String,
      enum: ['active', 'completed', 'expired'],
      default: 'active'
    }
  }],
  
  // Lifetime statistics
  lifetimeStats: {
    totalLogins: { type: Number, default: 0 },
    totalRaffleParticipations: { type: Number, default: 0 },
    totalGamingSessions: { type: Number, default: 0 },
    totalCommunityEngagements: { type: Number, default: 0 },
    totalRewardsClaimed: { type: Number, default: 0 },
    firstActivityDate: Date,
    lastActivityDate: Date
  },
  
  // Achievement tracking
  achievements: [{
    achievementType: {
      type: String,
      enum: ['activity_streak', 'milestone_reached', 'promotion_completed']
    },
    achievementName: String,
    description: String,
    unlockedAt: {
      type: Date,
      default: Date.now
    },
    rewardType: String,
    rewardAmount: Number,
    metadata: mongoose.Schema.Types.Mixed
  }],
  
  // Fraud detection
  fraudIndicators: [{
    indicatorType: {
      type: String,
      enum: ['unusual_activity_pattern', 'rapid_activity_burst', 'suspicious_timing']
    },
    description: String,
    detectedAt: {
      type: Date,
      default: Date.now
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    resolved: { type: Boolean, default: false },
    resolvedAt: Date,
    resolvedBy: String
  }]
}, {
  timestamps: true
});

// Indexes for efficient queries
activityTrackerSchema.index({ userId: 1 });
activityTrackerSchema.index({ 'trackingPeriods.periodType': 1, 'trackingPeriods.status': 1 });
activityTrackerSchema.index({ 'trackingPeriods.endDate': 1 });
activityTrackerSchema.index({ 'trackingPeriods.eligiblePromotions.promotionId': 1 });
activityTrackerSchema.index({ 'fraudIndicators.resolved': 1, 'fraudIndicators.severity': 1 });

// Virtual for current active periods
activityTrackerSchema.virtual('activePeriods').get(function() {
  const now = new Date();
  return this.trackingPeriods.filter(period => 
    period.status === 'active' && 
    period.startDate <= now && 
    period.endDate >= now
  );
});

// Method to record activity
activityTrackerSchema.methods.recordActivity = function(activityType, details = {}) {
  const now = new Date();
  
  // Update lifetime stats
  this.lifetimeStats[`total${activityType.charAt(0).toUpperCase() + activityType.slice(1).replace('_', '')}s`] += 1;
  this.lifetimeStats.lastActivityDate = now;
  if (!this.lifetimeStats.firstActivityDate) {
    this.lifetimeStats.firstActivityDate = now;
  }
  
  // Update active periods
  for (const period of this.activePeriods) {
    const activity = period.activities[activityType];
    if (activity) {
      activity.count += 1;
      activity.lastActivity = now;
      activity.details.push({
        timestamp: now,
        ...details
      });
      
      // Check promotion requirements
      this.checkPromotionRequirements(period, activityType);
    }
  }
  
  // Check for fraud indicators
  this.checkFraudIndicators(activityType, details);
  
  return this.save();
};

// Method to check promotion requirements
activityTrackerSchema.methods.checkPromotionRequirements = function(period, activityType) {
  for (const eligiblePromotion of period.eligiblePromotions) {
    if (eligiblePromotion.overallCompleted) continue;
    
    const requirement = eligiblePromotion.requirements.find(req => req.activityType === activityType);
    if (requirement && !requirement.completed) {
      requirement.currentCount = period.activities[activityType].count;
      
      if (requirement.currentCount >= requirement.requiredCount) {
        requirement.completed = true;
        requirement.completedAt = new Date();
      }
      
      // Check if all requirements are completed
      const allCompleted = eligiblePromotion.requirements.every(req => req.completed);
      if (allCompleted) {
        eligiblePromotion.overallCompleted = true;
      }
    }
  }
};

// Method to check for fraud indicators
activityTrackerSchema.methods.checkFraudIndicators = function(activityType, details) {
  const now = new Date();
  const recentActivities = this.trackingPeriods
    .filter(p => p.status === 'active')
    .flatMap(p => p.activities[activityType]?.details || [])
    .filter(d => now - d.timestamp < 60 * 60 * 1000); // Last hour
  
  // Check for rapid activity burst (more than 10 activities in 1 hour)
  if (recentActivities.length > 10) {
    this.fraudIndicators.push({
      indicatorType: 'rapid_activity_burst',
      description: `${recentActivities.length} ${activityType} activities in the last hour`,
      severity: 'high'
    });
  }
  
  // Check for unusual timing (activities at very regular intervals)
  if (recentActivities.length >= 5) {
    const intervals = [];
    for (let i = 1; i < recentActivities.length; i++) {
      intervals.push(recentActivities[i].timestamp - recentActivities[i-1].timestamp);
    }
    
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    
    // If variance is very low, activities are too regular (possible bot)
    if (variance < 1000) { // Less than 1 second variance
      this.fraudIndicators.push({
        indicatorType: 'suspicious_timing',
        description: `Activities occurring at suspiciously regular intervals (${Math.round(avgInterval/1000)}s avg)`,
        severity: 'medium'
      });
    }
  }
};

// Method to create new tracking period
activityTrackerSchema.methods.createTrackingPeriod = function(periodType, promotions = []) {
  const now = new Date();
  let endDate = new Date();
  
  switch (periodType) {
    case 'daily':
      endDate.setDate(endDate.getDate() + 1);
      break;
    case 'weekly':
      endDate.setDate(endDate.getDate() + 7);
      break;
    case 'monthly':
      endDate.setMonth(endDate.getMonth() + 1);
      break;
  }
  
  const period = {
    periodType,
    startDate: now,
    endDate,
    activities: {
      login: { count: 0, details: [] },
      raffle_participation: { count: 0, details: [] },
      gaming_activity: { count: 0, details: [] },
      community_engagement: { count: 0, details: [] }
    },
    eligiblePromotions: promotions.map(promotion => ({
      promotionId: promotion._id,
      requirements: promotion.freeTokensConfig.activityRequirements.map(req => ({
        activityType: req.activityType,
        requiredCount: req.requiredCount,
        currentCount: 0,
        completed: false
      })),
      overallCompleted: false,
      rewardClaimed: false
    })),
    status: 'active'
  };
  
  this.trackingPeriods.push(period);
  return this.save();
};

// Method to claim promotion reward
activityTrackerSchema.methods.claimPromotionReward = function(periodId, promotionId) {
  const period = this.trackingPeriods.id(periodId);
  if (!period) throw new Error('Tracking period not found');
  
  const eligiblePromotion = period.eligiblePromotions.find(ep => 
    ep.promotionId.toString() === promotionId.toString()
  );
  
  if (!eligiblePromotion) throw new Error('Promotion not found in tracking period');
  if (!eligiblePromotion.overallCompleted) throw new Error('Promotion requirements not completed');
  if (eligiblePromotion.rewardClaimed) throw new Error('Reward already claimed');
  
  eligiblePromotion.rewardClaimed = true;
  eligiblePromotion.rewardClaimedAt = new Date();
  this.lifetimeStats.totalRewardsClaimed += 1;
  
  return this.save();
};

// Method to expire old periods
activityTrackerSchema.methods.expireOldPeriods = function() {
  const now = new Date();
  let updated = false;
  
  for (const period of this.trackingPeriods) {
    if (period.status === 'active' && period.endDate < now) {
      period.status = 'expired';
      updated = true;
    }
  }
  
  if (updated) {
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Static method to find users eligible for rewards
activityTrackerSchema.statics.findUsersEligibleForRewards = function() {
  return this.find({
    'trackingPeriods': {
      $elemMatch: {
        status: 'active',
        'eligiblePromotions.overallCompleted': true,
        'eligiblePromotions.rewardClaimed': false
      }
    }
  });
};

// Static method to cleanup expired periods
activityTrackerSchema.statics.cleanupExpiredPeriods = function() {
  return this.find({
    'trackingPeriods': {
      $elemMatch: {
        status: 'active',
        endDate: { $lt: new Date() }
      }
    }
  }).then(trackers => {
    return Promise.all(trackers.map(tracker => tracker.expireOldPeriods()));
  });
};

activityTrackerSchema.set('toJSON', { virtuals: true });
activityTrackerSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('ActivityTracker', activityTrackerSchema);