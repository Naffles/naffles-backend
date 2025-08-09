const mongoose = require("mongoose");
const { Schema } = mongoose;

const openEntryAllocationSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // Allocation details
  ticketsAllocated: {
    type: Number,
    required: true,
    min: 0
  },
  ticketsUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  ticketsRemaining: {
    type: Number,
    default: function() {
      return this.ticketsAllocated - this.ticketsUsed;
    }
  },
  // Allocation source and timing
  allocationDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  expirationDate: {
    type: Date,
    required: true,
    default: function() {
      // Default to end of next month
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 2);
      nextMonth.setDate(0); // Last day of next month
      nextMonth.setHours(23, 59, 59, 999);
      return nextMonth;
    }
  },
  source: {
    type: String,
    enum: [
      "founders_key_benefits",
      "staking_rewards", 
      "admin_allocation",
      "promotion",
      "airdrop",
      "community_reward"
    ],
    required: true
  },
  sourceDetails: {
    foundersKeyId: String,
    stakingRecordId: Schema.Types.ObjectId,
    adminUserId: Schema.Types.ObjectId,
    promotionId: String,
    communityId: Schema.Types.ObjectId
  },
  // Status tracking
  status: {
    type: String,
    enum: ["pending", "active", "expired", "fully_used"],
    default: "pending"
  },
  activatedAt: Date,
  // Usage tracking
  usageHistory: [{
    raffleId: {
      type: Schema.Types.ObjectId,
      ref: "Raffle"
    },
    ticketsUsed: {
      type: Number,
      required: true
    },
    usedAt: {
      type: Date,
      default: Date.now
    },
    transactionId: String
  }],
  // Metadata
  notes: String,
  metadata: {
    type: Map,
    of: Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
openEntryAllocationSchema.index({ userId: 1, status: 1 });
openEntryAllocationSchema.index({ allocationDate: 1 });
openEntryAllocationSchema.index({ expirationDate: 1, status: 1 });
openEntryAllocationSchema.index({ source: 1 });

// Virtual for isExpired
openEntryAllocationSchema.virtual('isExpired').get(function() {
  return new Date() > this.expirationDate;
});

// Virtual for isFullyUsed
openEntryAllocationSchema.virtual('isFullyUsed').get(function() {
  return this.ticketsUsed >= this.ticketsAllocated;
});

// Instance methods
openEntryAllocationSchema.methods.useTickets = function(amount, raffleId, transactionId) {
  if (this.status !== 'active') {
    throw new Error('Allocation is not active');
  }
  
  if (this.ticketsRemaining < amount) {
    throw new Error('Insufficient tickets remaining');
  }
  
  if (this.isExpired) {
    throw new Error('Allocation has expired');
  }
  
  // Record usage
  this.usageHistory.push({
    raffleId,
    ticketsUsed: amount,
    usedAt: new Date(),
    transactionId
  });
  
  this.ticketsUsed += amount;
  this.ticketsRemaining = this.ticketsAllocated - this.ticketsUsed;
  
  // Update status if fully used
  if (this.isFullyUsed) {
    this.status = 'fully_used';
  }
  
  return this.save();
};

openEntryAllocationSchema.methods.activate = function() {
  if (this.status === 'pending') {
    this.status = 'active';
    this.activatedAt = new Date();
    return this.save();
  }
  throw new Error('Allocation cannot be activated');
};

openEntryAllocationSchema.methods.expire = function() {
  if (this.status === 'active' || this.status === 'pending') {
    this.status = 'expired';
    return this.save();
  }
  throw new Error('Allocation cannot be expired');
};

// Static methods
openEntryAllocationSchema.statics.getActiveAllocationsForUser = function(userId) {
  return this.find({
    userId,
    status: 'active',
    expirationDate: { $gt: new Date() },
    ticketsRemaining: { $gt: 0 }
  }).sort({ allocationDate: 1 });
};

openEntryAllocationSchema.statics.getTotalAvailableTickets = function(userId) {
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        status: 'active',
        expirationDate: { $gt: new Date() }
      }
    },
    {
      $group: {
        _id: null,
        totalTickets: { $sum: '$ticketsRemaining' }
      }
    }
  ]);
};

openEntryAllocationSchema.statics.getExpiredAllocations = function() {
  return this.find({
    status: { $in: ['active', 'pending'] },
    expirationDate: { $lt: new Date() }
  });
};

openEntryAllocationSchema.statics.getAllocationStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: {
          source: '$source',
          status: '$status'
        },
        count: { $sum: 1 },
        totalAllocated: { $sum: '$ticketsAllocated' },
        totalUsed: { $sum: '$ticketsUsed' }
      }
    },
    {
      $group: {
        _id: '$_id.source',
        statuses: {
          $push: {
            status: '$_id.status',
            count: '$count',
            totalAllocated: '$totalAllocated',
            totalUsed: '$totalUsed'
          }
        },
        totalCount: { $sum: '$count' },
        grandTotalAllocated: { $sum: '$totalAllocated' },
        grandTotalUsed: { $sum: '$totalUsed' }
      }
    }
  ]);
};

// Pre-save middleware
openEntryAllocationSchema.pre('save', function(next) {
  // Update tickets remaining
  this.ticketsRemaining = this.ticketsAllocated - this.ticketsUsed;
  
  // Auto-expire if past expiration date
  if (this.status === 'active' && this.isExpired) {
    this.status = 'expired';
  }
  
  // Auto-mark as fully used
  if (this.ticketsUsed >= this.ticketsAllocated && this.status === 'active') {
    this.status = 'fully_used';
  }
  
  next();
});

module.exports = mongoose.model("OpenEntryAllocation", openEntryAllocationSchema);