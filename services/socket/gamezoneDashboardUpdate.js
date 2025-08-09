
const cron = require("node-cron");
const { redlock, setAsync, getAsync } = require("../../config/redisClient");

// emit gamezone dashboard update when an active game has been deleted
const emitGamezoneDashboardUpdateOnActiveGameDelete = async (io) => {
  try {
    const data = await getAsync('gamezonedashboard:update');
    if (data) {
      io.emit("newGameDeleted", true);
      await setAsync('gamezonedashboard:update', false);
    }
  } catch (error) {
    console.error("Error fetching gamezone update data", error);
  }
}

const cronUpdateGamezoneDashboard = async (io) => {
  console.log("Initialize CRON for updating gamezone dashboard");
  const cronJob = async () => {
    try {
      // Attempt to acquire the lock
      await redlock.acquire(['get-gamezone-dashboard-update'], 10 * 1000); // 10000 ms = 10 seconds
      await emitGamezoneDashboardUpdateOnActiveGameDelete(io);
      // await fetchAndSaveCryptoPrices();
    } catch (error) {
      // console.log(error)
    }
  };

  // Immediate execution at runtime with lock
  await cronJob();
  // Schedule the task to run every 10 seconds
  cron.schedule("*/10 * * * * *", cronJob);
};

module.exports = cronUpdateGamezoneDashboard;
