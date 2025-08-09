const mongoose = require('mongoose');
const Affiliate = require('./models/affiliate/affiliate');
const AffiliateReferral = require('./models/affiliate/affiliateReferral');

async function testModels() {
  try {
    console.log('Testing affiliate models...');
    
    // Test if models are properly exported
    console.log('Affiliate model:', typeof Affiliate);
    console.log('AffiliateReferral model:', typeof AffiliateReferral);
    
    // Test if deleteMany exists
    console.log('Affiliate.deleteMany:', typeof Affiliate.deleteMany);
    console.log('AffiliateReferral.deleteMany:', typeof AffiliateReferral.deleteMany);
    
    console.log('✅ Models loaded successfully');
    
  } catch (error) {
    console.error('❌ Error testing models:', error);
  }
}

testModels();