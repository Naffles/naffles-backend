
module.exports = {
  async up(db, client) {
    // Perform migration to the new schema
    const treasuries = await db.collection('treasuries').find({}).toArray();

    for (const treasury of treasuries) {
      // Convert balances to Map if not already in Map format
      if (treasury.balances && typeof treasury.balances === 'object' && !treasury.balances._bsontype) {
        const balances = Object.entries(treasury.balances).reduce((acc, [key, value]) => {
          acc[key] = value.toString();
          return acc;
        }, {});
        await db.collection('treasuries').updateOne({ _id: treasury._id }, { $set: { balances } });
        console.log(`Treasury document ${treasury._id} migrated successfully`);
      }
    }
    
    console.log('All treasury documents migrated successfully');
  },

  async down(db, client) {
    // Optional: Write the code to reverse the migration here
  },
};
