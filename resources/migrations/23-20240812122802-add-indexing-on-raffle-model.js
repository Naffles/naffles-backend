
module.exports = {
  async up(db, client) {
    // Drop existing indexes if they exist
    try {
      await db.collection('raffles').dropIndex('lotteryTypeEnum_1');
    } catch (error) {
      if (error.codeName === 'IndexNotFound') {
        console.log('Index lotteryTypeEnum_1 not found, skipping drop.');
      } else {
        throw error;
      }
    }

    try {
      await db.collection('raffles').dropIndex('raffleTypeEnum_1');
    } catch (error) {
      if (error.codeName === 'IndexNotFound') {
        console.log('Index raffleTypeEnum_1 not found, skipping drop.');
      } else {
        throw error;
      }
    }

    try {
      await db.collection('raffles').dropIndex('createdBy_1');
    } catch (error) {
      if (error.codeName === 'IndexNotFound') {
        console.log('Index createdBy_1 not found, skipping drop.');
      } else {
        throw error;
      }
    }

    try {
      await db.collection('raffles').dropIndex('ticketsAvailableOpenEntry_1');
    } catch (error) {
      if (error.codeName === 'IndexNotFound') {
        console.log('Index ticketsAvailableOpenEntry_1 not found, skipping drop.');
      } else {
        throw error;
      }
    }

    // Create new indexes
    await db.collection('raffles').createIndex({ lotteryTypeEnum: 1 });
    await db.collection('raffles').createIndex({ raffleTypeEnum: 1 });
    await db.collection('raffles').createIndex({ createdBy: 1 });
    await db.collection('raffles').createIndex({ ticketsAvailableOpenEntry: 1 });
  }
};
