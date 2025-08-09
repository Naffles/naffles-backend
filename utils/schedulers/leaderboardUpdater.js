const cron = require("node-cron");
const UserStats = require("../../models/analytics/userStats");
const leaderboardQueue = require("../worker/leaderboardWorker");


const leaderboardUpdater = async () => {
    console.log("Leaderboard updater started");

    let count = 0;
    const cronJob = async () => {
        try {
            const limit = 100; // Number of items per page
            const totalPages = await UserStats.countDocuments().then(count => Math.ceil(count / limit));

            for (let page = 1; page <= totalPages; page++) {
                leaderboardQueue.add({ page, limit });
            }
        } catch (error) {
            console.error("Error in cronJob:", error);
        }
    };
  
    // Immediate execution at runtime
    await cronJob();

    cron.schedule("*/5 * * * *", cronJob);
};

module.exports = leaderboardUpdater;