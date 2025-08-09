const mongoose = require('mongoose');

const affiliateSchema = new mongoose.Schema({
  // Affiliate identification
  affiliateId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  
  // Affiliate URL and tracking
  affiliateCode: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  customUrl: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Commission structure
  commissionRate: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 5 // 5% default commission
  },
  commissionType: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage'
  },
  fixedCommissionAmount: {
    type: Number,
    default: 0
  },
  
  // Activity-specific commission rates
  activityCommissions: {
    raffleTickets: {
      rate: { type: Number, default: 0 },
      enabled: { type: Boolean, default: true }
    },
    gaming: {
      rate: { type: Number, default: 0 },
      enabled: { type: Boolean, default: true }
    },
    deposits: {
      rate: { type: Number, default: 0 },
      enabled: { type: Boolean, default: false }
    },
    staking: {
      rate: { type: Number, default: 0 },
      enabled: { type: Boolean, default: false }
    }
  },
  
  // Status and configuration
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending'],
    default: 'pending'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Tracking and analytics
  totalClicks: {
    type: Number,
    default: 0
  },
  totalConversions: {
    type: Number,
    default: 0
  },
  totalCommissionEarned: {
    type: Number,
    default: 0
  },
  totalCommissionPaid: {
    type: Number,
    default: 0
  },
  
  // Payment information
  paymentMethod: {
    type: String,
    enum: ['crypto', 'bank_transfer', 'paypal'],
    default: 'crypto'
  },
  paymentDetails: {
    cryptoAddress: { type: String },
    cryptoNetwork: { type: String },
    bankDetails: {
      accountNumber: { type: String },
      routingNumber: { type: String },
      bankName: { type: String }
    },
    paypalEmail: { type: String }
  },
  
  // Minimum payout threshold
  minimumPayout: {
    type: Number,
    default: 50
  },
  
  // Attribution settings
  attributionWindow: {
    type: Number,
    default: 30 // 30 days default attribution window
  },
  cookieLifetime: {
    type: Number,
    default: 30 // 30 days cookie lifetime
  },
  
  // Terms and conditions
  termsAccepted: {
    type: Boolean,
    default: false
  },
  termsAcceptedAt: {
    type: Date
  },
  
  // Metadata
  notes: {
    type: String
  },
  tags: [{
    type: String
  }],
  
  // Dates
  approvedAt: {
    type: Date
  },
  lastPayoutAt: {
    type: Date
  },
  
}, {
  timestamps: true
});

// Indexes for performance
affiliateSchema.index({ affiliateCode: 1 });
affiliateSchema.index({ status: 1, isActive: 1 });
affiliateSchema.index({ email: 1 });
affiliateSchema.index({ createdAt: -1 });

// Virtual for conversion rate
affiliateSchema.virtual('conversionRate').get(function() {
  if (this.totalClicks === 0) return 0;
  return (this.totalConversions / this.totalClicks * 100).toFixed(2);
});

// Virtual for pending commission
affiliateSchema.virtual('pendingCommission').get(function() {
  return this.totalCommissionEarned - this.totalCommissionPaid;
});

// Method to generate affiliate URL
affiliateSchema.methods.generateAffiliateUrl = function(baseUrl = 'https://naffles.com') {
  return `${baseUrl}?ref=${this.affiliateCode}`;
};

// Method to check if affiliate can receive commission for activity
affiliateSchema.methods.canEarnCommission = function(activityType) {
  if (!this.isActive || this.status !== 'active') return false;
  
  const activity = this.activityCommissions[activityType];
  return activity && activity.enabled && activity.rate > 0;
};

// Method to calculate commission for amount
affiliateSchema.methods.calculateCommission = function(amount, activityType = null) {
  if (!this.isActive || this.status !== 'active') return 0;
  
  let rate = this.commissionRate;
  
  // Use activity-specific rate if provided and available
  if (activityType && this.activityCommissions[activityType]) {
    const activityCommission = this.activityCommissions[activityType];
    if (activityCommission.enabled && activityCommission.rate > 0) {
      rate = activityCommission.rate;
    }
  }
  
  if (this.commissionType === 'fixed') {
    return this.fixedCommissionAmount;
  }
  
  return (amount * rate) / 100;
};

// Static method to find by affiliate code
affiliateSchema.statics.findByCode = function(code) {
  return this.findOne({
    affiliateCode: code,
    isActive: true,
    status: 'active'
  });
};

// Static method to get active affiliates
affiliateSchema.statics.getActiveAffiliates = function() {
  return this.find({
    isActive: true,
    status: 'active'
  }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Affiliate', affiliateSchema);