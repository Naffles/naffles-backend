
module.exports = {
  async up(db, client) {
    const walletBalances = await db.collection('walletbalances').find({}).toArray();

    for (const walletBalance of walletBalances) {
      // Convert balances to Map if not already in Map format
      if (walletBalance.balances && typeof walletBalance.balances === 'object' && !walletBalance.balances._bsontype) {
        const balances = Object.entries(walletBalance.balances).reduce((acc, [key, value]) => {
          acc[key] = value.toString();
          return acc;
        }, {});
        await db.collection('walletbalances').updateOne({ _id: walletBalance._id }, { $set: { balances } });
        console.log(`WalletBalance document ${walletBalance._id} balances migrated successfully`);
      }

      // Convert fundingBalances to Map if not already in Map format
      if (walletBalance.fundingBalances && typeof walletBalance.fundingBalances === 'object' && !walletBalance.fundingBalances._bsontype) {
        const fundingBalances = Object.entries(walletBalance.fundingBalances).reduce((acc, [key, value]) => {
          acc[key] = value.toString();
          return acc;
        }, {});
        await db.collection('walletbalances').updateOne({ _id: walletBalance._id }, { $set: { fundingBalances } });
        console.log(`WalletBalance document ${walletBalance._id} fundingBalances migrated successfully`);
      }
    }

    console.log('All WalletBalance documents migrated successfully');
  },

  async down(db, client) {
    const walletBalances = await db.collection('walletbalances').find({}).toArray();

    for (const walletBalance of walletBalances) {
      // Convert balances from Map back to fixed fields if needed
      if (walletBalance.balances && walletBalance.balances._bsontype === 'Map') {
        const balances = {};
        walletBalance.balances.forEach((value, key) => {
          balances[key] = value;
        });
        await db.collection('walletbalances').updateOne({ _id: walletBalance._id }, { $set: { balances } });
        console.log(`WalletBalance document ${walletBalance._id} balances reverted successfully`);
      }

      // Convert fundingBalances from Map back to fixed fields if needed
      if (walletBalance.fundingBalances && walletBalance.fundingBalances._bsontype === 'Map') {
        const fundingBalances = {};
        walletBalance.fundingBalances.forEach((value, key) => {
          fundingBalances[key] = value;
        });
        await db.collection('walletbalances').updateOne({ _id: walletBalance._id }, { $set: { fundingBalances } });
        console.log(`WalletBalance document ${walletBalance._id} fundingBalances reverted successfully`);
      }
    }

    console.log('All WalletBalance documents reverted successfully');
  },
};
