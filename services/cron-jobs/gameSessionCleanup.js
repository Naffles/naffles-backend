const cron = require("node-cron");
const gameSessionService = require("../gameSessionService");

/**
 * Cleanup expired game sessions and queue entries
 * Runs every 5 minutes
 */
const startGameSessionCleanup = () => {
  // Run every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      console.log("Starting game session cleanup...");
      await gameSessionService.cleanupExpiredEntries();
      console.log("Game session cleanup completed");
    } catch (error) {
      console.error("Error during game session cleanup:", error);
    }
  });

  console.log("Game session cleanup scheduler started");
};

module.exports = startGameSessionCleanup;