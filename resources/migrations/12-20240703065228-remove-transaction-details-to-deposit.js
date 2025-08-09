module.exports = {
  async up(db, client) {
    // Remove the "transactionDetails" field from all documents in the deposits collection
    await db.collection('deposits').updateMany({}, {
      $unset: {
        transactionDetails: ""
      }
    });
    // // Drop the index for the "transactionDetails" field if it exists
    // const indexes = await db.collection('deposits').indexes();
    // if (indexes.some(index => index.key.hasOwnProperty('transactionDetails'))) {
    //   await db.collection('deposits').dropIndex('transactionDetails_1');
    // }
  },

  async down(db, client) {
    // Re-add the "transactionDetails" field to all documents in the deposits collection with default settings
    await db.collection('deposits').updateMany({}, {
      $set: {
        transactionDetails: {}
      }
    });
    // // Recreate the index for the "transactionDetails" field if necessary
    // await db.collection('deposits').createIndex({ transactionDetails: 1 }, { background: true });
  }
};
