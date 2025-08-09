module.exports = {
  async up(db, client) {
    // Fetch all raffles to migrate
    const raffles = await db.collection('raffles').find({}).toArray();

    // Update each raffle to add or modify the vrf field
    for (const raffle of raffles) {
      if (raffle.status && raffle.status.wonBy) {
        // If wonBy is not null
        await db.collection('raffles').updateOne(
          { _id: raffle._id },
          {
            $set: {
              'vrf.status': 'Fulfilled',
              'vrf.transactionHash': 'internally-edited',
              'vrf.winningNumber': 69
            }
          }
        );
      } else {
        // If wonBy is null
        await db.collection('raffles').updateOne(
          { _id: raffle._id },
          {
            $set: {
              'vrf.status': 'Pending',
              'vrf.transactionHash': null,
              'vrf.winningNumber': 0
            }
          }
        );
      }
    }

    console.log('Raffles updated with vrf field');
  },

  async down(db, client) {
    // Rollback: Remove the vrf field from all raffles
    await db.collection('raffles').updateMany(
      {},
      {
        $unset: {
          vrf: ""
        }
      }
    );

    console.log('Raffles vrf field removed');
  }
};
