const mongoose = require('mongoose');

console.log('Creating minimal test model...');

const testSchema = new mongoose.Schema({
  name: String
});

const TestModel = mongoose.model('TestModel', testSchema);

console.log('TestModel type:', typeof TestModel);
console.log('TestModel.deleteMany:', typeof TestModel.deleteMany);

// Now test the actual affiliate referral model
console.log('\nTesting actual AffiliateReferral model...');

const affiliateReferralSchema = new mongoose.Schema({
  referralId: String,
  affiliateId: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId
});

const AffiliateReferral = mongoose.model('AffiliateReferral', affiliateReferralSchema);

console.log('AffiliateReferral type:', typeof AffiliateReferral);
console.log('AffiliateReferral.deleteMany:', typeof AffiliateReferral.deleteMany);