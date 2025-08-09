module.exports = {
  async up(db, client) {
    // Fetch all sequences to migrate
    const sequences = await db.collection('sequences').find({}).toArray();

    // Update each sequence to add createdAt and updatedAt timestamps
    for (const sequence of sequences) {
      await db.collection('sequences').updateOne(
        { _id: sequence._id },
        {
          $set: {
            createdAt: sequence.lastUpdated,
            updatedAt: sequence.lastUpdated
          },
          $unset: {
            lastUpdated: ""
          }
        }
      );
    }

    console.log('Sequences updated with createdAt and updatedAt timestamps');
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  }
};
