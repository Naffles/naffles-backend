module.exports = {
  async up(db, client) {
    // Remove the "transactionDetails" field from all documents in the withdraws collection
    await db.collection('withdraws').updateMany({}, {
      $unset: {
        transactionDetails: ""
      }
    });

    // This part ensures that the schema is updated
    // No direct changes to document values are necessary for enum modifications
  },

  async down(db, client) {
    // Re-add the "transactionDetails" field to all documents in the withdraws collection with default settings
    await db.collection('withdraws').updateMany({}, {
      $set: {
        transactionDetails: {}
      }
    });

    // No need to revert enum modifications in the documents themselves
  }
};
