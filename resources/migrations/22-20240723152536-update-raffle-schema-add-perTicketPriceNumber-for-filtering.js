module.exports = {
  async up(db, client) {
    // Add new indexes
    await db.collection('raffles').createIndex({ coinType: 1 }, { sparse: true });
    await db.collection('raffles').createIndex({ raffleEndDate: 1 }, { sparse: true });
    await db.collection('raffles').createIndex({ perTicketPriceNumber: 1 });
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
  }
};
