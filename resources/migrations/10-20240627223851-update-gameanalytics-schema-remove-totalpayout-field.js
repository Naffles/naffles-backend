
module.exports = {
  async up(db, client) {
    // Remove the totalPayout field from the gameAnalytics collection
    await db.collection('gameanalytics').updateMany({}, { $unset: { totalPayout: 1 } });
  },

  async down(db, client) {
    // Re-add the totalPayout field with default value "0" to the gameAnalytics collection
    await db.collection('gameanalytics').updateMany({}, { $set: { totalPayout: "0" } });
  }
};
