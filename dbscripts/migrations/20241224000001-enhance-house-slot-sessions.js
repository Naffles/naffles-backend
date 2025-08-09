/**
 * Migration: Enhance HouseSlot model for session support
 * Adds session-based fields to existing house slots
 */

module.exports = {
  async up(db, client) {
    console.log('Adding session fields to HouseSlot collection...');
    
    // Add new session fields to all existing house slots
    await db.collection('houseslots').updateMany(
      {},
      {
        $set: {
          roundsPerSession: 20,
          safetyMultiplier: 10,
          currentSessionId: null,
          sessionRoundsUsed: 0,
          sessionExpiresAt: null
        }
      }
    );
    
    // Create new indexes for session fields
    await db.collection('houseslots').createIndex({ currentSessionId: 1 });
    await db.collection('houseslots').createIndex({ sessionExpiresAt: 1 });
    await db.collection('houseslots').createIndex({ 
      gameType: 1, 
      tokenType: 1, 
      currentSessionId: 1 
    });
    
    console.log('Successfully enhanced HouseSlot collection for session support');
  },

  async down(db, client) {
    console.log('Removing session fields from HouseSlot collection...');
    
    // Remove session fields
    await db.collection('houseslots').updateMany(
      {},
      {
        $unset: {
          roundsPerSession: "",
          safetyMultiplier: "",
          currentSessionId: "",
          sessionRoundsUsed: "",
          sessionExpiresAt: ""
        }
      }
    );
    
    // Drop session-related indexes
    try {
      await db.collection('houseslots').dropIndex({ currentSessionId: 1 });
      await db.collection('houseslots').dropIndex({ sessionExpiresAt: 1 });
      await db.collection('houseslots').dropIndex({ 
        gameType: 1, 
        tokenType: 1, 
        currentSessionId: 1 
      });
    } catch (error) {
      console.log('Some indexes may not exist, continuing...');
    }
    
    console.log('Successfully removed session enhancements from HouseSlot collection');
  }
};