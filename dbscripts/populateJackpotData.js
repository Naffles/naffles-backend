const Jackpot = require("../models/jackpot/jackpot");

async function populateGiveawayJackpot() {
    console.log("populating jackpot data...");

    try {
        // Find existing jackpot
        const jackpotExists = await Jackpot.findOne();
        if (!jackpotExists) {
            // If jackpot not found, create one
            const jackpot = new Jackpot({
                prizePoolType: "nafflings",
                totalAmount: 2000, // Set the initial total amount if needed
                isGiveaway: true,
                isActive: false,
                lastUpdated: Date.now() // Set to the current time
            });
            await jackpot.save();
            console.log('New Jackpot initialized');
        } else {
            console.log('Jackpot already exists');
        }
    } catch (error) {
        console.log("Error populating jackpot data:", error);
    }
}

module.exports = populateGiveawayJackpot;