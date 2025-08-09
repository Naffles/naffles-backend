const IORedis = require("ioredis");
const Queue = require("bull");
const { REDIS_URL, REDIS_PORT } = require("../../config/config");
const updateLeaderboardInCache = require("../updateLeaderboardInCache");

const bullClient = new IORedis({
    host: REDIS_URL,
    port: REDIS_PORT,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  });


const leaderboardQueue = new Queue("leaderboard", {
    createClient: function (type) {
      switch (type) {
        case 'client':
          return bullClient;
        case 'subscriber':
          return bullClient.duplicate();
        default:
          return new IORedis({
            host: REDIS_URL,
            port: REDIS_PORT,
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
          });
      }
      }
    });

leaderboardQueue.process(async (job) => {
    const { page, limit } = job.data;
    await updateLeaderboardInCache(page, limit);
});

leaderboardQueue.on('completed', (job) => {
  console.log(`Leaderboards cache updated successfully: Job#${job.id}`);
});

leaderboardQueue.on('failed', (job, err) => {
console.error(`Job failed: ${job.id}, error: ${err}`);
});

module.exports = leaderboardQueue;