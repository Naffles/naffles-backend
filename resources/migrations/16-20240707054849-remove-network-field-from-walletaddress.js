// migrations/[timestamp]-remove-network-field-from-walletaddress.js
module.exports = {
  async up(db, client) {
    // Remove the 'network' field from the 'WalletAddress' collection
    await db.collection('walletaddresses').updateMany({}, { $unset: { network: "" } });
  },

  async down(db, client) {
    // Add the 'network' field back to the 'WalletAddress' collection
    await db.collection('walletaddresses').updateMany({}, { $set: { network: null } });
  }
};
