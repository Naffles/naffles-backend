module.exports = {
  async up(db, client) {

    // Remove the datePurchased field from all raffleTicket documents
    await db.collection('raffletickets').updateMany(
      {},
      { $unset: { datePurchased: "" } }
    );

    console.log('Raffle tickets updated: datePurchased field removed');

    // Fetch all raffle tickets
    const tickets = await db.collection('raffletickets').find({}).toArray();
    if (tickets.length <= 0) return;
    // Group tickets by raffle
    const raffleGroups = tickets.reduce((acc, ticket) => {
      const raffleId = ticket.raffle.toString();
      if (!acc[raffleId]) {
        acc[raffleId] = [];
      }
      acc[raffleId].push(ticket);
      return acc;
    }, {});

    // Iterate over each group and update tickets with ticketNumber
    for (const raffleId in raffleGroups) {
      if (raffleGroups.hasOwnProperty(raffleId)) {
        const raffleTickets = raffleGroups[raffleId];
        // Sort tickets by createdAt to ensure the order
        raffleTickets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        // Assign ticketNumber based on sorted order
        for (let i = 0; i < raffleTickets.length; i++) {
          const ticket = raffleTickets[i];
          const ticketNumber = i + 1; // ticket numbers start from 1
          await db.collection('raffletickets').updateOne(
            { _id: ticket._id },
            { $set: { ticketNumber } }
          );
        }
      }
    }

    console.log('Raffle tickets updated with ticketNumber');
  },

  async down(db, client) {
    // Remove the ticketNumber field if the migration is rolled back
    await db.collection('raffletickets').updateMany(
      {},
      { $unset: { ticketNumber: "" } }
    );

    console.log('Raffle tickets reverted');
  }
};
