
module.exports = {
  async up(db, client) {
    // Get all documents from the allowabletokencontractsforlotteries collection
    const tokenContracts = await db.collection('allowabletokencontractsforlotteries').find({}).toArray();

    // Loop through each document and update the ticker to lowercase
    for (const contract of tokenContracts) {
      if (contract.ticker) {
        const updatedTicker = contract.ticker.toLowerCase();

        // Update the document in the collection
        await db.collection('allowabletokencontractsforlotteries').updateOne(
          { _id: contract._id },
          { $set: { ticker: updatedTicker } }
        );
      }
    }

    // Get all documents from the adminsettings collection
    const adminSettings = await db.collection('adminsettings').find({}).toArray();

    // Loop through each document and update the tokenType in machineCreatedGamesBetValue array
    for (const setting of adminSettings) {
      if (setting.machineCreatedGamesBetValue && setting.machineCreatedGamesBetValue.length > 0) {
        const updatedBetValues = setting.machineCreatedGamesBetValue.map(betValue => ({
          ...betValue,
          tokenType: betValue.tokenType.toLowerCase()
        }));

        await db.collection('adminsettings').updateOne(
          { _id: setting._id },
          { $set: { machineCreatedGamesBetValue: updatedBetValues } }
        );
      }
    }

    // Get all documents from the fee collection
    const fees = await db.collection('fees').find({}).toArray();

    // Loop through each document and update the balances keys to lowercase
    for (const fee of fees) {
      if (fee.balances) {
        const updatedBalances = {};
        for (const [key, value] of Object.entries(fee.balances)) {
          updatedBalances[key.toLowerCase()] = value;
        }

        await db.collection('fees').updateOne(
          { _id: fee._id },
          { $set: { balances: updatedBalances } }
        );
      }
    }

    // Get all documents from the treasury collection
    const treasuries = await db.collection('treasuries').find({}).toArray();

    // Loop through each document and update the balances keys to lowercase
    for (const treasury of treasuries) {
      if (treasury.balances) {
        const updatedBalances = {};
        for (const [key, value] of Object.entries(treasury.balances)) {
          updatedBalances[key.toLowerCase()] = value;
        }

        await db.collection('treasuries').updateOne(
          { _id: treasury._id },
          { $set: { balances: updatedBalances } }
        );
      }
    }

    // Get all documents from the walletbalances collection
    const walletBalances = await db.collection('walletbalances').find({}).toArray();

    // Loop through each document and update the balances and fundingBalances keys to lowercase
    for (const walletBalance of walletBalances) {
      const updatedBalances = {};
      const updatedFundingBalances = {};

      // Update balances keys to lowercase
      if (walletBalance.balances) {
        for (const [key, value] of Object.entries(walletBalance.balances)) {
          updatedBalances[key.toLowerCase()] = value;
        }
      }

      // Update fundingBalances keys to lowercase
      if (walletBalance.fundingBalances) {
        for (const [key, value] of Object.entries(walletBalance.fundingBalances)) {
          updatedFundingBalances[key.toLowerCase()] = value;
        }
      }

      // Update the document in the collection
      await db.collection('walletbalances').updateOne(
        { _id: walletBalance._id },
        { $set: { balances: updatedBalances, fundingBalances: updatedFundingBalances } }
      );
    }

    // Get all documents from the activegames collection
    const activeGames = await db.collection('activegames').find({}).toArray();

    // Loop through each document and update the coinType to lowercase
    for (const game of activeGames) {
      if (game.coinType) {
        const updatedCoinType = game.coinType.toLowerCase();

        // Update the document in the collection
        await db.collection('activegames').updateOne(
          { _id: game._id },
          { $set: { coinType: updatedCoinType } }
        );
      }
    }

    // Get all documents from the gamehistory collection
    const gameHistories = await db.collection('gamehistories').find({}).toArray();

    // Loop through each document and update the coinType to lowercase
    for (const game of gameHistories) {
      if (game.coinType) {
        const updatedCoinType = game.coinType.toLowerCase();

        // Update the document in the collection
        await db.collection('gamehistories').updateOne(
          { _id: game._id },
          { $set: { coinType: updatedCoinType } }
        );
      }
    }

    // Get all documents from the raffles collection
    const raffles = await db.collection('raffles').find({}).toArray();

    // Loop through each document and update the coinType to lowercase
    for (const raffle of raffles) {
      if (raffle.coinType) {
        const updatedCoinType = raffle.coinType.toLowerCase();

        // Update the document in the collection
        await db.collection('raffles').updateOne(
          { _id: raffle._id },
          { $set: { coinType: updatedCoinType } }
        );
      }
    }

    // Get all documents from the deposits collection
    const deposits = await db.collection('deposits').find({}).toArray();

    // Loop through each document and update the coinType to lowercase
    for (const deposit of deposits) {
      if (deposit.coinType) {
        const updatedCoinType = deposit.coinType.toLowerCase();

        // Update the document in the collection
        await db.collection('deposits').updateOne(
          { _id: deposit._id },
          { $set: { coinType: updatedCoinType } }
        );
      }
    }

    // Get all documents from the withdraws collection
    const withdraws = await db.collection('withdraws').find({}).toArray();

    // Loop through each document and update the coinType to lowercase
    for (const withdraw of withdraws) {
      if (withdraw.coinType) {
        const updatedCoinType = withdraw.coinType.toLowerCase();

        // Update the document in the collection
        await db.collection('withdraws').updateOne(
          { _id: withdraw._id },
          { $set: { coinType: updatedCoinType } }
        );
      }
    }


    // Get all documents from the userlogs collection
    const userLogs = await db.collection('userlogs').find({}).toArray();

    // Loop through each document and update the coinType in transaction to lowercase
    for (const log of userLogs) {
      if (log.transaction && log.transaction.coinType) {
        const updatedCoinType = log.transaction.coinType.toLowerCase();

        // Update the document in the collection
        await db.collection('userlogs').updateOne(
          { _id: log._id },
          { $set: { 'transaction.coinType': updatedCoinType } }
        );
      }
    }

  },

  async down(db, client) {
    // If needed, write the logic to revert the changes made in the up() function
    // In this case, it might not be necessary to revert the changes
  }
};
