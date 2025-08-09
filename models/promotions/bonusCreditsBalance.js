const mongoose = require('mongoose');

const bonusCreditsBalanceSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Balance tracking by token type
  balances: [{
    tokenContract: {
      type: String,
      required: true
    },
    tokenSymbol: {
      type: String,
      required: true
    },
    blockchain: {
      type: String,
      required: true
    },
    balance: {
      type: Number,
      default: 0,
      min: 0
    },
    totalAwarded: {
      type: Number,
      default: 0
    },
    totalUsed: {
      type: Number,
      default: 0
    },
    totalExpired: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Expiry tracking
  expiryEntries: [{
    tokenContract: String,
    tokenSymbol: String,
    blockchain: String,
    amount: {
      type: Number,
      required: true
    },
    awardedAt: {
      type: Date,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    promotionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Promotion'
    },
    status: {
      type: String,
      enum: ['active', 'used', 'expired'],
      default: 'active'
    }
  }],
  
  // Usage history
  usageHistory: [{
    transactionId: mongoose.Schema.Types.ObjectId,
    tokenContract: String,
    tokenSymbol: String,
    blockchain: String,
    amount: {
      type: Number,
      required: true
    },
    usedAt: {
      type: Date,
      default: Date.now
    },
    usageType: {
      type: String,
      enum: ['gambling', 'raffle_purchase', 'community_product', 'other']
    },
    description: String,
    remainingBalance: Number
  }],
  
  // Warning and notification tracking
  warnings: [{
    warningType: {
      type: String,
      enum: ['expiry_warning', 'withdrawal_warning', 'low_balance']
    },
    message: String,
    triggeredAt: {
      type: Date,
      default: Date.now
    },
    acknowledged: {
      type: Boolean,
      default: false
    },
    acknowledgedAt: Date
  }],
  
  // Settings
  settings: {
    enableExpiryWarnings: {
      type: Boolean,
      default: true
    },
    warningDaysBefore: {
      type: Number,
      default: 7
    },
    enableWithdrawalWarnings: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
bonusCreditsBalanceSchema.index({ userId: 1 });
bonusCreditsBalanceSchema.index({ 'expiryEntries.expiresAt': 1 });
bonusCreditsBalanceSchema.index({ 'expiryEntries.status': 1 });
bonusCreditsBalanceSchema.index({ 'balances.tokenContract': 1, 'balances.blockchain': 1 });

// Virtual for total balance across all tokens
bonusCreditsBalanceSchema.virtual('totalBalance').get(function() {
  return this.balances.reduce((total, balance) => total + balance.balance, 0);
});

// Virtual for checking if user has any bonus credits
bonusCreditsBalanceSchema.virtual('hasCredits').get(function() {
  return this.totalBalance > 0;
});

// Method to get balance for specific token
bonusCreditsBalanceSchema.methods.getTokenBalance = function(tokenContract, blockchain) {
  const balance = this.balances.find(b => 
    b.tokenContract.toLowerCase() === tokenContract.toLowerCase() && 
    b.blockchain === blockchain
  );
  return balance ? balance.balance : 0;
};

// Method to add bonus credits
bonusCreditsBalanceSchema.methods.addCredits = function(tokenInfo, amount, expiryDate, promotionId) {
  // Find or create balance entry
  let balance = this.balances.find(b => 
    b.tokenContract.toLowerCase() === tokenInfo.tokenContract.toLowerCase() && 
    b.blockchain === tokenInfo.blockchain
  );
  
  if (!balance) {
    balance = {
      tokenContract: tokenInfo.tokenContract,
      tokenSymbol: tokenInfo.tokenSymbol,
      blockchain: tokenInfo.blockchain,
      balance: 0,
      totalAwarded: 0,
      totalUsed: 0,
      totalExpired: 0,
      lastUpdated: new Date()
    };
    this.balances.push(balance);
  }
  
  // Update balance
  balance.balance += amount;
  balance.totalAwarded += amount;
  balance.lastUpdated = new Date();
  
  // Add expiry entry
  this.expiryEntries.push({
    tokenContract: tokenInfo.tokenContract,
    tokenSymbol: tokenInfo.tokenSymbol,
    blockchain: tokenInfo.blockchain,
    amount,
    awardedAt: new Date(),
    expiresAt: expiryDate,
    promotionId,
    status: 'active'
  });
  
  return this.save();
};

// Method to use bonus credits (FIFO - First In, First Out)
bonusCreditsBalanceSchema.methods.useCredits = function(tokenContract, blockchain, amount, usageInfo) {
  const balance = this.balances.find(b => 
    b.tokenContract.toLowerCase() === tokenContract.toLowerCase() && 
    b.blockchain === blockchain
  );
  
  if (!balance || balance.balance < amount) {
    throw new Error('Insufficient bonus credits');
  }
  
  let remainingToUse = amount;
  const activeEntries = this.expiryEntries
    .filter(e => 
      e.tokenContract.toLowerCase() === tokenContract.toLowerCase() &&
      e.blockchain === blockchain &&
      e.status === 'active' &&
      e.expiresAt > new Date()
    )
    .sort((a, b) => a.awardedAt - b.awardedAt); // FIFO
  
  // Use credits from oldest entries first
  for (const entry of activeEntries) {
    if (remainingToUse <= 0) break;
    
    const useFromEntry = Math.min(remainingToUse, entry.amount);
    entry.amount -= useFromEntry;
    remainingToUse -= useFromEntry;
    
    if (entry.amount <= 0) {
      entry.status = 'used';
    }
  }
  
  // Update balance
  balance.balance -= amount;
  balance.totalUsed += amount;
  balance.lastUpdated = new Date();
  
  // Record usage
  this.usageHistory.push({
    transactionId: usageInfo.transactionId,
    tokenContract,
    tokenSymbol: balance.tokenSymbol,
    blockchain,
    amount,
    usageType: usageInfo.usageType,
    description: usageInfo.description,
    remainingBalance: balance.balance
  });
  
  return this.save();
};

// Method to expire old credits
bonusCreditsBalanceSchema.methods.expireOldCredits = function() {
  const now = new Date();
  let totalExpired = 0;
  
  for (const entry of this.expiryEntries) {
    if (entry.status === 'active' && entry.expiresAt <= now) {
      entry.status = 'expired';
      totalExpired += entry.amount;
      
      // Update balance
      const balance = this.balances.find(b => 
        b.tokenContract.toLowerCase() === entry.tokenContract.toLowerCase() && 
        b.blockchain === entry.blockchain
      );
      if (balance) {
        balance.balance -= entry.amount;
        balance.totalExpired += entry.amount;
        balance.lastUpdated = new Date();
      }
    }
  }
  
  if (totalExpired > 0) {
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Method to check for expiring credits and create warnings
bonusCreditsBalanceSchema.methods.checkExpiryWarnings = function() {
  if (!this.settings.enableExpiryWarnings) return;
  
  const warningDate = new Date();
  warningDate.setDate(warningDate.getDate() + this.settings.warningDaysBefore);
  
  const expiringEntries = this.expiryEntries.filter(e => 
    e.status === 'active' && 
    e.expiresAt <= warningDate &&
    e.expiresAt > new Date()
  );
  
  if (expiringEntries.length > 0) {
    const totalExpiring = expiringEntries.reduce((sum, e) => sum + e.amount, 0);
    
    this.warnings.push({
      warningType: 'expiry_warning',
      message: `${totalExpiring} bonus credits will expire within ${this.settings.warningDaysBefore} days`,
      triggeredAt: new Date()
    });
    
    return this.save();
  }
};

// Method to create withdrawal warning
bonusCreditsBalanceSchema.methods.createWithdrawalWarning = function() {
  if (!this.settings.enableWithdrawalWarnings || this.totalBalance === 0) return;
  
  this.warnings.push({
    warningType: 'withdrawal_warning',
    message: `You have ${this.totalBalance} bonus credits that will be reset if you withdraw funds`,
    triggeredAt: new Date()
  });
  
  return this.save();
};

// Method to reset all bonus credits (for withdrawals)
bonusCreditsBalanceSchema.methods.resetAllCredits = function() {
  // Mark all active entries as expired
  for (const entry of this.expiryEntries) {
    if (entry.status === 'active') {
      entry.status = 'expired';
    }
  }
  
  // Reset all balances
  for (const balance of this.balances) {
    balance.totalExpired += balance.balance;
    balance.balance = 0;
    balance.lastUpdated = new Date();
  }
  
  return this.save();
};

// Static method to find users with expiring credits
bonusCreditsBalanceSchema.statics.findUsersWithExpiringCredits = function(days = 7) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + days);
  
  return this.find({
    'expiryEntries': {
      $elemMatch: {
        status: 'active',
        expiresAt: { $lte: expiryDate, $gt: new Date() }
      }
    }
  });
};

// Static method to cleanup expired credits
bonusCreditsBalanceSchema.statics.cleanupExpiredCredits = function() {
  return this.find({
    'expiryEntries': {
      $elemMatch: {
        status: 'active',
        expiresAt: { $lt: new Date() }
      }
    }
  }).then(users => {
    return Promise.all(users.map(user => user.expireOldCredits()));
  });
};

bonusCreditsBalanceSchema.set('toJSON', { virtuals: true });
bonusCreditsBalanceSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('BonusCreditsBalance', bonusCreditsBalanceSchema);