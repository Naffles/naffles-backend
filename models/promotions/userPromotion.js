const mongoose = require('mongoose');

const userPromotionSchema = new mongoose.Schema({
  // User and promotion references
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  promotionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Promotion',
    required: true
  },
  
  // Assignment details
  assignedAt: {
    type: Date,
    default: Date.now
  },
  assignedBy: {
    type: String,
    enum: ['system', 'admin', 'user_action'],
    default: 'system'
  },
  
  // Usage tracking
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsedAt: Date,
  totalSavings: {
    type: Number,
    default: 0
  },
  totalBonusReceived: {
    type: Number,
    default: 0
  },
  
  // Status and expiry
  status: {
    type: String,
    enum: ['active', 'used', 'expired', 'revoked'],
    default: 'active'
  },
  expiresAt: Date,
  
  // Usage history for detailed tracking
  usageHistory: [{
    usedAt: {
      type: Date,
      default: Date.now
    },
    transactionId: mongoose.Schema.Types.ObjectId,
    usageType: {
      type: String,
      enum: ['fee_discount', 'deposit_bonus', 'free_tokens']
    },
    originalAmount: Number,
    discountAmount: Number,
    bonusAmount: Number,
    feeType: String,
    details: mongoose.Schema.Types.Mixed
  }],
  
  // Fraud prevention tracking
  fraudFlags: [{
    flagType: {
      type: String,
      enum: ['suspicious_usage', 'rapid_usage', 'unusual_pattern', 'manual_review']
    },
    flaggedAt: {
      type: Date,
      default: Date.now
    },
    flaggedBy: String,
    description: String,
    resolved: {
      type: Boolean,
      default: false
    },
    resolvedAt: Date,
    resolvedBy: String
  }],
  
  // Activity tracking for free tokens
  activityProgress: [{
    activityType: String,
    currentCount: {
      type: Number,
      default: 0
    },
    requiredCount: Number,
    lastActivityAt: Date,
    completed: {
      type: Boolean,
      default: false
    },
    completedAt: Date
  }],
  
  // Bonus credits specific tracking
  bonusCreditsBalance: {
    type: Number,
    default: 0
  },
  bonusCreditsExpiresAt: Date,
  bonusCreditsUsed: {
    type: Number,
    default: 0
  },
  
  // Metadata
  metadata: {
    assignmentReason: String,
    nftHoldingsAtAssignment: [mongoose.Schema.Types.Mixed],
    userTierAtAssignment: String,
    campaignId: String
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
userPromotionSchema.index({ userId: 1, promotionId: 1 }, { unique: true });
userPromotionSchema.index({ userId: 1, status: 1 });
userPromotionSchema.index({ promotionId: 1, status: 1 });
userPromotionSchema.index({ expiresAt: 1 });
userPromotionSchema.index({ bonusCreditsExpiresAt: 1 });
userPromotionSchema.index({ 'fraudFlags.flagType': 1, 'fraudFlags.resolved': 1 });

// Virtual for checking if promotion is still valid
userPromotionSchema.virtual('isValid').get(function() {
  if (this.status !== 'active') return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
});

// Virtual for checking if bonus credits are expired
userPromotionSchema.virtual('bonusCreditsExpired').get(function() {
  return this.bonusCreditsExpiresAt && this.bonusCreditsExpiresAt < new Date();
});

// Method to check if user can use this promotion
userPromotionSchema.methods.canUse = function(promotion) {
  if (!this.isValid) return false;
  
  // Check usage limits
  if (promotion.fraudPreventionConfig && promotion.fraudPreventionConfig.maxUsagePerUser) {
    if (this.usageCount >= promotion.fraudPreventionConfig.maxUsagePerUser) {
      return false;
    }
  }
  
  // Check cooldown period
  if (promotion.fraudPreventionConfig && promotion.fraudPreventionConfig.cooldownPeriod && this.lastUsedAt) {
    const cooldownMs = promotion.fraudPreventionConfig.cooldownPeriod * 60 * 60 * 1000;
    if (Date.now() - this.lastUsedAt.getTime() < cooldownMs) {
      return false;
    }
  }
  
  // Check for unresolved fraud flags
  const unresolvedFlags = this.fraudFlags.filter(flag => !flag.resolved);
  if (unresolvedFlags.length > 0) {
    return false;
  }
  
  return true;
};

// Method to record usage
userPromotionSchema.methods.recordUsage = function(usageData) {
  this.usageCount += 1;
  this.lastUsedAt = new Date();
  
  if (usageData.discountAmount) {
    this.totalSavings += usageData.discountAmount;
  }
  
  if (usageData.bonusAmount) {
    this.totalBonusReceived += usageData.bonusAmount;
    this.bonusCreditsBalance += usageData.bonusAmount;
  }
  
  this.usageHistory.push({
    usedAt: new Date(),
    transactionId: usageData.transactionId,
    usageType: usageData.usageType,
    originalAmount: usageData.originalAmount,
    discountAmount: usageData.discountAmount || 0,
    bonusAmount: usageData.bonusAmount || 0,
    feeType: usageData.feeType,
    details: usageData.details
  });
  
  return this.save();
};

// Method to update activity progress
userPromotionSchema.methods.updateActivityProgress = function(activityType) {
  const progress = this.activityProgress.find(p => p.activityType === activityType);
  if (progress && !progress.completed) {
    progress.currentCount += 1;
    progress.lastActivityAt = new Date();
    
    if (progress.currentCount >= progress.requiredCount) {
      progress.completed = true;
      progress.completedAt = new Date();
    }
  }
  
  return this.save();
};

// Method to flag for fraud
userPromotionSchema.methods.flagForFraud = function(flagType, description, flaggedBy = 'system') {
  this.fraudFlags.push({
    flagType,
    description,
    flaggedBy,
    flaggedAt: new Date()
  });
  
  return this.save();
};

// Method to use bonus credits
userPromotionSchema.methods.useBonusCredits = function(amount) {
  if (this.bonusCreditsBalance < amount) {
    throw new Error('Insufficient bonus credits');
  }
  
  if (this.bonusCreditsExpired) {
    throw new Error('Bonus credits have expired');
  }
  
  this.bonusCreditsBalance -= amount;
  this.bonusCreditsUsed += amount;
  
  return this.save();
};

// Static method to find active promotions for user
userPromotionSchema.statics.findActiveForUser = function(userId) {
  return this.find({
    userId,
    status: 'active',
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  }).populate('promotionId');
};

// Static method to find expired bonus credits
userPromotionSchema.statics.findExpiredBonusCredits = function() {
  return this.find({
    bonusCreditsBalance: { $gt: 0 },
    bonusCreditsExpiresAt: { $lt: new Date() }
  });
};

userPromotionSchema.set('toJSON', { virtuals: true });
userPromotionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('UserPromotion', userPromotionSchema);