const mongoose = require('mongoose');

const allowlistParticipationSchema = new mongoose.Schema({
  // References
  allowlistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Allowlist',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Entry information
  walletAddress: {
    type: String,
    required: true,
    lowercase: true
  },
  entryTime: {
    type: Date,
    default: Date.now
  },
  
  // Social verification data
  socialData: {
    twitterHandle: String,
    discordUsername: String,
    telegramUsername: String,
    email: String,
    customFormData: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },
  
  // Payment status
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'refunded'],
    default: 'pending'
  },
  paymentAmount: {
    tokenType: String,
    amount: String
  },
  
  // Task completion tracking
  taskCompletionStatus: [{
    taskId: {
      type: String,
      required: true
    },
    completed: {
      type: Boolean,
      default: false
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    verificationData: {
      type: mongoose.Schema.Types.Mixed
    }
  }],
  
  // Winner status
  isWinner: {
    type: Boolean,
    default: false
  },
  winnerPosition: {
    type: Number,
    default: null
  },
  
  // Refund and profit guarantee tracking
  refundStatus: {
    type: String,
    enum: ['pending', 'processed', 'failed', 'not_applicable'],
    default: 'not_applicable'
  },
  refundAmount: {
    ticketRefund: {
      tokenType: String,
      amount: String
    },
    profitBonus: {
      tokenType: String,
      amount: String
    },
    totalRefund: {
      tokenType: String,
      amount: String
    }
  },
  refundProcessedAt: {
    type: Date,
    default: null
  },
  
  // Notification tracking
  notificationsSent: {
    entryConfirmed: {
      type: Boolean,
      default: false
    },
    winner: {
      type: Boolean,
      default: false
    },
    refund: {
      type: Boolean,
      default: false
    },
    email: {
      type: Boolean,
      default: false
    }
  },
  
  // Winner claim management
  claimStatus: {
    type: String,
    enum: ['pending', 'claimed', 'expired', 'not_applicable'],
    default: 'not_applicable'
  },
  claimExpiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
allowlistParticipationSchema.index({ allowlistId: 1, userId: 1 }, { unique: true });
allowlistParticipationSchema.index({ allowlistId: 1, isWinner: 1 });
allowlistParticipationSchema.index({ allowlistId: 1, paymentStatus: 1 });
allowlistParticipationSchema.index({ walletAddress: 1, allowlistId: 1 });
allowlistParticipationSchema.index({ refundStatus: 1 });

// Method to check if all required tasks are completed
allowlistParticipationSchema.methods.areRequiredTasksCompleted = function(requiredTasks) {
  const completedTaskIds = this.taskCompletionStatus
    .filter(task => task.completed)
    .map(task => task.taskId);
  
  return requiredTasks.every(taskId => completedTaskIds.includes(taskId));
};

// Method to calculate total refund amount
allowlistParticipationSchema.methods.calculateTotalRefund = function(ticketRefund, profitBonus) {
  const ticketAmount = parseFloat(ticketRefund || '0');
  const bonusAmount = parseFloat(profitBonus || '0');
  const total = ticketAmount + bonusAmount;
  
  return {
    ticketRefund: {
      tokenType: this.paymentAmount.tokenType,
      amount: ticketRefund || '0'
    },
    profitBonus: {
      tokenType: this.paymentAmount.tokenType,
      amount: profitBonus || '0'
    },
    totalRefund: {
      tokenType: this.paymentAmount.tokenType,
      amount: total.toString()
    }
  };
};

// Static method to get participation statistics
allowlistParticipationSchema.statics.getParticipationStats = async function(allowlistId) {
  const stats = await this.aggregate([
    { $match: { allowlistId: mongoose.Types.ObjectId(allowlistId) } },
    {
      $group: {
        _id: null,
        totalParticipants: { $sum: 1 },
        winners: { $sum: { $cond: ['$isWinner', 1, 0] } },
        losers: { $sum: { $cond: ['$isWinner', 0, 1] } },
        paidEntries: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'completed'] }, 1, 0] } },
        refundsProcessed: { $sum: { $cond: [{ $eq: ['$refundStatus', 'processed'] }, 1, 0] } }
      }
    }
  ]);
  
  return stats[0] || {
    totalParticipants: 0,
    winners: 0,
    losers: 0,
    paidEntries: 0,
    refundsProcessed: 0
  };
};

module.exports = mongoose.model('AllowlistParticipation', allowlistParticipationSchema);