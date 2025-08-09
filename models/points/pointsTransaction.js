const mongoose = require('mongoose');

const pointsTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['earned', 'spent', 'bonus', 'penalty', 'jackpot', 'admin_award', 'admin_deduct'],
    required: true
  },
  activity: {
    type: String,
    enum: [
      'raffle_creation',
      'raffle_ticket_purchase', 
      'gaming_blackjack',
      'gaming_coin_toss',
      'gaming_rock_paper_scissors',
      'gaming_crypto_slots',
      'token_staking',
      'referral_bonus',
      'partner_token_bonus',
      'daily_login',
      'achievement_unlock',
      'jackpot_win',
      'admin_manual',
      'milestone_reward',
      'community_task'
    ],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  balanceBefore: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  multiplier: {
    type: Number,
    default: 1.0,
    min: 0.1,
    max: 10.0
  },
  baseAmount: {
    type: Number,
    required: true
  },
  metadata: {
    raffleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Raffle' },
    gameSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameSession' },
    achievementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Achievement' },
    referredUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    partnerToken: { type: String },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String },
    additionalData: { type: mongoose.Schema.Types.Mixed }
  },
  description: {
    type: String,
    required: true
  },
  isReversible: {
    type: Boolean,
    default: false
  },
  reversedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PointsTransaction'
  },
  reversedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
pointsTransactionSchema.index({ userId: 1, createdAt: -1 });
pointsTransactionSchema.index({ type: 1, createdAt: -1 });
pointsTransactionSchema.index({ activity: 1, createdAt: -1 });
pointsTransactionSchema.index({ 'metadata.raffleId': 1 });
pointsTransactionSchema.index({ 'metadata.gameSessionId': 1 });
pointsTransactionSchema.index({ 'metadata.achievementId': 1 });

// Method to reverse transaction
pointsTransactionSchema.methods.reverse = async function(adminId, reason) {
  if (!this.isReversible) {
    throw new Error('Transaction is not reversible');
  }
  
  if (this.reversedBy) {
    throw new Error('Transaction already reversed');
  }

  // Create reverse transaction
  const reverseTransaction = new this.constructor({
    userId: this.userId,
    type: this.type === 'earned' ? 'penalty' : 'earned',
    activity: 'admin_manual',
    amount: -this.amount,
    balanceBefore: 0, // Will be set by service
    balanceAfter: 0, // Will be set by service
    baseAmount: -this.baseAmount,
    metadata: {
      adminId,
      reason,
      originalTransactionId: this._id
    },
    description: `Reversal: ${reason}`,
    isReversible: false
  });

  this.reversedBy = reverseTransaction._id;
  this.reversedAt = new Date();
  
  return reverseTransaction;
};

module.exports = mongoose.model('PointsTransaction', pointsTransactionSchema);