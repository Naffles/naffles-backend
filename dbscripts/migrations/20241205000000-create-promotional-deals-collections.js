const { MongoClient } = require('mongodb');

module.exports = {
  async up(db, client) {
    console.log('Creating promotional deals collections and indexes...');
    
    // Create promotions collection
    await db.createCollection('promotions');
    
    // Create indexes for promotions
    await db.collection('promotions').createIndexes([
      { key: { status: 1, startDate: 1, endDate: 1 }, name: 'status_dates_idx' },
      { key: { type: 1, status: 1 }, name: 'type_status_idx' },
      { key: { 'targetingCriteria.userType': 1 }, name: 'targeting_usertype_idx' },
      { key: { priority: -1, startDate: 1 }, name: 'priority_startdate_idx' },
      { key: { createdBy: 1 }, name: 'created_by_idx' },
      { key: { createdAt: 1 }, name: 'created_at_idx' },
      { key: { updatedAt: 1 }, name: 'updated_at_idx' }
    ]);
    
    // Create userpromotions collection
    await db.createCollection('userpromotions');
    
    // Create indexes for userpromotions
    await db.collection('userpromotions').createIndexes([
      { key: { userId: 1, promotionId: 1 }, name: 'user_promotion_unique_idx', unique: true },
      { key: { userId: 1, status: 1 }, name: 'user_status_idx' },
      { key: { promotionId: 1, status: 1 }, name: 'promotion_status_idx' },
      { key: { expiresAt: 1 }, name: 'expires_at_idx' },
      { key: { bonusCreditsExpiresAt: 1 }, name: 'bonus_expires_at_idx' },
      { key: { 'fraudFlags.flagType': 1, 'fraudFlags.resolved': 1 }, name: 'fraud_flags_idx' },
      { key: { assignedAt: 1 }, name: 'assigned_at_idx' },
      { key: { lastUsedAt: 1 }, name: 'last_used_at_idx' }
    ]);
    
    // Create bonuscreditsbalances collection
    await db.createCollection('bonuscreditsbalances');
    
    // Create indexes for bonuscreditsbalances
    await db.collection('bonuscreditsbalances').createIndexes([
      { key: { userId: 1 }, name: 'user_id_unique_idx', unique: true },
      { key: { 'expiryEntries.expiresAt': 1 }, name: 'expiry_entries_expires_idx' },
      { key: { 'expiryEntries.status': 1 }, name: 'expiry_entries_status_idx' },
      { key: { 'balances.tokenContract': 1, 'balances.blockchain': 1 }, name: 'balances_token_idx' },
      { key: { createdAt: 1 }, name: 'created_at_idx' },
      { key: { updatedAt: 1 }, name: 'updated_at_idx' }
    ]);
    
    // Create activitytrackers collection
    await db.createCollection('activitytrackers');
    
    // Create indexes for activitytrackers
    await db.collection('activitytrackers').createIndexes([
      { key: { userId: 1 }, name: 'user_id_idx' },
      { key: { 'trackingPeriods.periodType': 1, 'trackingPeriods.status': 1 }, name: 'periods_type_status_idx' },
      { key: { 'trackingPeriods.endDate': 1 }, name: 'periods_end_date_idx' },
      { key: { 'trackingPeriods.eligiblePromotions.promotionId': 1 }, name: 'eligible_promotions_idx' },
      { key: { 'fraudIndicators.resolved': 1, 'fraudIndicators.severity': 1 }, name: 'fraud_indicators_idx' },
      { key: { createdAt: 1 }, name: 'created_at_idx' },
      { key: { updatedAt: 1 }, name: 'updated_at_idx' }
    ]);
    
    console.log('Promotional deals collections and indexes created successfully');
  },

  async down(db, client) {
    console.log('Dropping promotional deals collections...');
    
    // Drop collections
    await db.collection('promotions').drop().catch(() => {});
    await db.collection('userpromotions').drop().catch(() => {});
    await db.collection('bonuscreditsbalances').drop().catch(() => {});
    await db.collection('activitytrackers').drop().catch(() => {});
    
    console.log('Promotional deals collections dropped successfully');
  }
};