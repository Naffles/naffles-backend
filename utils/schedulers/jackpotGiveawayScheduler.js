const cron = require("node-cron");
const Giveaway = require("../../models/raffle/giveaway");
const Jackpot = require("../../models/jackpot/jackpot");
const raffleService = require("../../services/raffleService");
const { redlock } = require("../../config/redisClient");
const mongoose = require("mongoose");

// Function to handle the giveaway draw logic
const checkAndHandleGiveaways = async () => {
	console.log("Checking giveaways...");

	// Enable transation in case of rollback
	const session = await mongoose.startSession();
	session.startTransaction();

	// localhost = 30secs, dev/staging/prod = 10 mins
	const duration =
		process.env.NODE_ENV === "localhost" ? 30 * 1000 : 10 * 60 * 1000;
	try {
		// Attempt to acquire the lock
		await redlock.acquire(["jackpot-giveaway-auto-handler"], duration);
		// Check for any active giveaway
		const activeGiveaways = await Giveaway.find({
			"status.isActive": true,
			scheduledDrawDate: { $lte: new Date() },
		});

		if (activeGiveaways.length > 0) {
			for (const giveaway of activeGiveaways) {
				// Fetch jackpot object
				const jackpot = await Jackpot.findById(giveaway.jackpot);
				await raffleService.handleGiveawayDraw({ session, jackpot, giveaway });
				await raffleService.createGiveaway({ session, jackpot }, giveaway);

				await session.commitTransaction();
			}
		}
	} catch (error) {
		await session.abortTransaction();
		console.error("Error handling giveaway draw:", error);
	} finally {
		session.endSession();
	}
};

// Schedule the job checker to run every 6 hours
cron.schedule("0 */6 * * *", () => {
	checkAndHandleGiveaways();
});

module.exports = checkAndHandleGiveaways;
