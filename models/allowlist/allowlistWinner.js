const mongoose = require('mongoose');

const allowlistWinnerSchema = new mongoose.Schema({
  // References
  allowlistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Allowlist',
    required: true
  },
  participationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AllowlistParticipation',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Winner information
  walletAddress: {
    type: String,
    required: true,
    lowercase: true
  },
  winnerPosition: {
    type: Number,
    required: true,
    min: 1
  },
  
  // Social data for export
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
  
  // Notification tracking
  notificationSent: {
    type: Boolean,
    default: false
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  bellNotificationSent: {
    type: Boolean,
    default: false
  },
  
  // Claim management
  claimStatus: {
    type: String,
    enum: ['pending', 'claimed', 'expired'],
    default: 'pending'
  },
  claimExpiresAt: {
    type: Date,
    default: function() {
      // Winners have 7 days to claim by default
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  },
  claimedAt: {
    type: Date,
    default: null
  },
  
  // Action page item for claiming
  actionItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ActionItem',
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
allowlistWinnerSchema.index({ allowlistId: 1, winnerPosition: 1 }, { unique: true });
allowlistWinnerSchema.index({ userId: 1, claimStatus: 1 });
allowlistWinnerSchema.index({ allowlistId: 1, claimStatus: 1 });
allowlistWinnerSchema.index({ claimExpiresAt: 1, claimStatus: 1 });

// Method to check if claim has expired
allowlistWinnerSchema.methods.isClaimExpired = function() {
  return this.claimStatus === 'pending' && new Date() > this.claimExpiresAt;
};

// Method to prepare export data
allowlistWinnerSchema.methods.getExportData = function() {
  return {
    walletAddress: this.walletAddress,
    winnerPosition: this.winnerPosition,
    twitterHandle: this.socialData.twitterHandle || '',
    discordUsername: this.socialData.discordUsername || '',
    telegramUsername: this.socialData.telegramUsername || '',
    email: this.socialData.email || '',
    customFormData: this.socialData.customFormData ? Object.fromEntries(this.socialData.customFormData) : {}
  };
};

// Static method to get winners for export
allowlistWinnerSchema.statics.getWinnersForExport = async function(allowlistId, format = 'json') {
  const winners = await this.find({ allowlistId })
    .sort({ winnerPosition: 1 })
    .lean();
  
  const exportData = winners.map(winner => ({
    walletAddress: winner.walletAddress,
    winnerPosition: winner.winnerPosition,
    twitterHandle: winner.socialData?.twitterHandle || '',
    discordUsername: winner.socialData?.discordUsername || '',
    telegramUsername: winner.socialData?.telegramUsername || '',
    email: winner.socialData?.email || '',
    customFormData: winner.socialData?.customFormData ? Object.fromEntries(winner.socialData.customFormData) : {}
  }));
  
  if (format === 'csv') {
    const headers = ['walletAddress', 'winnerPosition', 'twitterHandle', 'discordUsername', 'telegramUsername', 'email'];
    const csvRows = [headers.join(',')];
    
    exportData.forEach(winner => {
      const row = headers.map(header => {
        const value = winner[header] || '';
        // Escape commas and quotes in CSV
        return `"${value.toString().replace(/"/g, '""')}"`;
      });
      csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
  }
  
  return exportData;
};

// Static method to expire old claims
allowlistWinnerSchema.statics.expireOldClaims = async function() {
  const expiredWinners = await this.updateMany(
    {
      claimStatus: 'pending',
      claimExpiresAt: { $lt: new Date() }
    },
    {
      $set: { claimStatus: 'expired' }
    }
  );
  
  return expiredWinners.modifiedCount;
};

module.exports = mongoose.model('AllowlistWinner', allowlistWinnerSchema);