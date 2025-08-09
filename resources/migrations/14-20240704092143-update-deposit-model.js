module.exports = {
  async up(db, client) {
    // Rename field chainId to network
    await db.collection('deposits').updateMany(
      { chainId: { $exists: true } },
      { $rename: { chainId: 'network' } }
    );

    // Update network field values
    await db.collection('deposits').updateMany(
      { network: 'mainnet' },
      { $set: { network: 'sol-mainnet' } }
    );
    await db.collection('deposits').updateMany(
      { network: 'devnet' },
      { $set: { network: 'sol-devnet' } }
    );

    // Add blockNumber field if it doesn't exist
    await db.collection('deposits').updateMany(
      { blockNumber: { $exists: false } },
      { $set: { blockNumber: null } }
    );
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  }
};
