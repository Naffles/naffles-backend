
module.exports = {
  async up(db, client) {
    // Remove `transactionDetails` field and `enum` constraint on `coinType`
    await db.collection('deposits').updateMany({}, {
      $unset: { transactionDetails: "" }
    });

    // If there are any documents where `coinType` is not "eth" or "sol", handle them accordingly
    const deposits = await db.collection('deposits').find({ coinType: { $nin: ["eth", "sol"] } }).toArray();
    for (const deposit of deposits) {
      // If the `coinType` is not valid, set it to a default value or handle as needed
      await db.collection('deposits').updateOne({ _id: deposit._id }, {
        $set: { coinType: "unknown" } // Change "unknown" to a default valid value if needed
      });
    }
  },

  async down(db, client) {
    // Restore the `transactionDetails` field with an empty object
    await db.collection('deposits').updateMany({}, {
      $set: { transactionDetails: {} }
    });

    // This down migration cannot fully restore the `enum` constraint on `coinType` since MongoDB does not support it natively
  }
};
