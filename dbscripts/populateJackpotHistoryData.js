const JackpotHistory = require("../models/jackpot/jackpotHistory");
const WalletAddress = require("../models/user/walletAddress");

const createRandomJackpotHistoryEntry = (user, walletAddress) => {
    return new JackpotHistory({
        user: user._id,
        walletAddress: walletAddress._id,
        wonAmount: Math.floor(Math.random() * (100000 - 50000 + 1)) + 50000, // Random amount between 50K and 100K
        tokenType: "nafflings",
        isGiveaway: Math.random() < 0.5
    });
};

const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function populateJackpotHistory() {
    // console.log("populating jackpot history data...");
    try {
        // Fetch existing users and wallet addresses
        const walletAddresses = await WalletAddress.find()
            .populate("userRef")
            .limit(10)
            .exec();

        if (walletAddresses.length === 0) {
            console.log("Not enough wallet addresses found to populate jackpot history");
            return new Error("No wallet addresses found.");
        }

        // Clear existing jackpot history data
        await JackpotHistory.deleteMany({});

        // Create 10 random jackpot history entries, reusing users and wallet addresses if necessary
        const jackpotHistoryEntries = [];
        var jackpotEntriesCreated = 0;
        let walletAddress;
        for (let i = 0; i < 10; i++) {
            if (i < walletAddresses.length) {
                walletAddress = walletAddresses[i];
            } else {
                walletAddress = getRandomElement(walletAddresses);
            }
            const user = walletAddress.userRef;
            jackpotHistoryEntries.push(createRandomJackpotHistoryEntry(user, walletAddress));
            jackpotEntriesCreated++;
        }

        // Save the new jackpot history entries
        await JackpotHistory.insertMany(jackpotHistoryEntries);
        console.log(`${jackpotEntriesCreated} random JackpotHistory entries initialized`);
    } catch (error) {
        console.log("Error populating jackpot data:", error);
    }
}

module.exports = populateJackpotHistory;