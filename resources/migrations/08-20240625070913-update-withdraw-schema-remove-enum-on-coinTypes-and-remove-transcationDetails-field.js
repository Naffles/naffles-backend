
module.exports = {
  async up(db, client) {
    // Remove `transactionDetails` field
    await db.collection('withdraws').updateMany({}, {
      $unset: { transactionDetails: "" }
    });

    // Remove the enum constraint on `coinType`
    const withdraws = await db.collection('withdraws').find({ coinType: { $nin: ["eth", "sol"] } }).toArray();
    for (const withdraw of withdraws) {
      // If the `coinType` is not valid, set it to a default value or handle as needed
      await db.collection('withdraws').updateOne({ _id: withdraw._id }, {
        $set: { coinType: "unknown" } // Change "unknown" to a default valid value if needed
      });
    }
  },

  async down(db, client) {
    // Restore the `transactionDetails` field with an empty object
    await db.collection('withdraws').updateMany({}, {
      $set: { transactionDetails: {} }
    });

    // This down migration cannot fully restore the `enum` constraint on `coinType` since MongoDB does not support it natively
  }
};
