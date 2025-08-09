const mongoose = require('mongoose');

console.log('Testing AffiliateReferral model creation...');

try {
  const affiliateReferralSchema = new mongoose.Schema({
    referralId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    affiliateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Affiliate',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'expired'],
      default: 'active'
    }
  }, {
    timestamps: true
  });

  console.log('Schema created successfully');

  const AffiliateReferral = mongoose.model('AffiliateReferral', affiliateReferralSchema);
  console.log('Model created:', typeof AffiliateReferral);
  console.log('deleteMany method:', typeof AffiliateReferral.deleteMany);

} catch (error) {
  console.error('Error creating model:', error);
}