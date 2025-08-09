// Clear require cache
delete require.cache[require.resolve('./models/affiliate/affiliate')];
delete require.cache[require.resolve('./models/affiliate/affiliateReferral')];

const mongoose = require('mongoose');
const Affiliate = require('./models/affiliate/affiliate');
const AffiliateReferral = require('./models/affiliate/affiliateReferral');

async function testModels() {
  try {
    console.log('Testing affiliate models (fresh)...');
    
    // Test if models are properly exported
    console.log('Affiliate model:', typeof Affiliate);
    console.log('AffiliateReferral model:', typeof AffiliateReferral);
    console.log('AffiliateReferral constructor:', AffiliateReferral.constructor.name);
    console.log('AffiliateReferral prototype:', Object.getPrototypeOf(AffiliateReferral));
    
    // Test if deleteMany exists
    console.log('Affiliate.deleteMany:', typeof Affiliate.deleteMany);
    console.log('AffiliateReferral.deleteMany:', typeof AffiliateReferral.deleteMany);
    
    // Try to access the model directly
    console.log('AffiliateReferral keys:', Object.keys(AffiliateReferral));
    
    console.log('✅ Models loaded successfully');
    
  } catch (error) {
    console.error('❌ Error testing models:', error);
  }
}

testModels();