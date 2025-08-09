
module.exports = {
  async up(db, client) {
    // Migrate totalDepositedAmount and totalWithdrawnAmount to use Map
    const histories = await db.collection('userdepositandwithdrawhistories').find().toArray();

    for (const history of histories) {
      const updatedDepositedAmount = {};
      const updatedWithdrawnAmount = {};

      if (history.totalDepositedAmount) {
        for (const [key, value] of Object.entries(history.totalDepositedAmount)) {
          updatedDepositedAmount[key] = value.toString();
        }
      }

      if (history.totalWithdrawnAmount) {
        for (const [key, value] of Object.entries(history.totalWithdrawnAmount)) {
          updatedWithdrawnAmount[key] = value.toString();
        }
      }

      await db.collection('userdepositandwithdrawhistories').updateOne(
        { _id: history._id },
        {
          $set: {
            totalDepositedAmount: updatedDepositedAmount,
            totalWithdrawnAmount: updatedWithdrawnAmount,
          }
        }
      );
    }
  },

  async down(db, client) {
    // Migrate totalDepositedAmount and totalWithdrawnAmount back to plain objects with eth and sol keys
    const histories = await db.collection('userdepositandwithdrawhistories').find().toArray();

    for (const history of histories) {
      const updatedDepositedAmount = {
        eth: "0",
        sol: "0",
      };
      const updatedWithdrawnAmount = {
        eth: "0",
        sol: "0",
      };

      if (history.totalDepositedAmount) {
        for (const [key, value] of Object.entries(history.totalDepositedAmount)) {
          if (key === 'eth' || key === 'sol') {
            updatedDepositedAmount[key] = value.toString();
          }
        }
      }

      if (history.totalWithdrawnAmount) {
        for (const [key, value] of Object.entries(history.totalWithdrawnAmount)) {
          if (key === 'eth' || key === 'sol') {
            updatedWithdrawnAmount[key] = value.toString();
          }
        }
      }

      await db.collection('userdepositandwithdrawhistories').updateOne(
        { _id: history._id },
        {
          $set: {
            totalDepositedAmount: updatedDepositedAmount,
            totalWithdrawnAmount: updatedWithdrawnAmount,
          }
        }
      );
    }
  }
};
