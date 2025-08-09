const mongoose = require('mongoose');

const actionItemSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Action type
  type: {
    type: String,
    required: true,
    enum: [
      'claim_winner',
      'allowlist_claim',
      'raffle_claim',
      'staking_reward',
      'community_invitation',
      'verification_required',
      'payment_required',
      'general_action'
    ]
  },
  
  // Display information
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  
  // Action details
  actionUrl: {
    type: String,
    required: true
  },
  
  // Status
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date,
    default: null
  },
  
  // Expiration
  expiresAt: {
    type: Date,
    default: null
  },
  expired: {
    type: Boolean,
    default: false
  },
  
  // Priority
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Metadata for additional context
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Notification tracking
  notificationSent: {
    type: Boolean,
    default: false
  },
  emailSent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
actionItemSchema.index({ userId: 1, completed: 1 });
actionItemSchema.index({ userId: 1, type: 1 });
actionItemSchema.index({ expiresAt: 1, expired: 1 });
actionItemSchema.index({ completed: 1, expiresAt: 1 });

// Virtual for checking if item is expired
actionItemSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt && !this.completed;
});

// Method to mark as completed
actionItemSchema.methods.markCompleted = function() {
  this.completed = true;
  this.completedAt = new Date();
  return this.save();
};

// Method to mark as expired
actionItemSchema.methods.markExpired = function() {
  this.expired = true;
  return this.save();
};

// Static method to get user's active action items
actionItemSchema.statics.getUserActiveItems = async function(userId, limit = 20) {
  return await this.find({
    userId,
    completed: false,
    expired: false,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  })
  .sort({ priority: -1, createdAt: -1 })
  .limit(limit);
};

// Static method to expire old items
actionItemSchema.statics.expireOldItems = async function() {
  const expiredItems = await this.updateMany(
    {
      completed: false,
      expired: false,
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { expired: true }
    }
  );
  
  return expiredItems.modifiedCount;
};

// Static method to clean up old completed items
actionItemSchema.statics.cleanupOldItems = async function(daysOld = 30) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  
  const deletedItems = await this.deleteMany({
    $or: [
      { completed: true, completedAt: { $lt: cutoffDate } },
      { expired: true, createdAt: { $lt: cutoffDate } }
    ]
  });
  
  return deletedItems.deletedCount;
};

module.exports = mongoose.model('ActionItem', actionItemSchema);