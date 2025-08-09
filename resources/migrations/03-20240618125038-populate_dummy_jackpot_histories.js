const createRandomJackpotHistoryEntry = (user, walletAddress) => ({
  user: user._id,
  walletAddress: walletAddress._id,
  wonAmount: Math.floor(Math.random() * (2000 - 500 + 1)) + 500, // Random amount between 50K and 100K
  tokenType: "nafflings",
  isGiveaway: Math.random() < 0.5
});

const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

module.exports = {
  async up(db, client) {
    try {
      // Fetch existing users and wallet addresses
      const walletAddresses = await db.collection("walletaddresses")
        .aggregate([
          {
            $lookup: {
              from: "users",
              localField: "userRef",
              foreignField: "_id",
              as: "userRef"
            }
          },
          { $unwind: "$userRef" }
        ])
        .limit(5)
        .toArray();

      if (walletAddresses.length === 0) {
        console.log("Not enough wallet addresses found to populate jackpot history");
        throw new Error("No wallet addresses found.");
      }

      // Clear existing jackpot history data
      await db.collection("jackpothistories").deleteMany({});

      // Create 10 random jackpot history entries, reusing users and wallet addresses if necessary
      const jackpotHistoryEntries = [];
      for (let i = 0; i < 5; i++) {
        const walletAddress = i < walletAddresses.length ? walletAddresses[i] : getRandomElement(walletAddresses);
        const user = walletAddress.userRef;
        jackpotHistoryEntries.push(createRandomJackpotHistoryEntry(user, walletAddress));
      }

      // Save the new jackpot history entries
      await db.collection("jackpothistories").insertMany(jackpotHistoryEntries);
      console.log(`${jackpotHistoryEntries.length} random JackpotHistory entries initialized`);
    } catch (error) {
      console.log("Error populating jackpot data:", error);
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection("albums").updateOne({artist: "The Beatles"}, {$set: {blacklisted: false}});
  }
};
