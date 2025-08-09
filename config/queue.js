// config/queue.js
const Queue = require('bull');
const { REDIS_URL, REDIS_PORT } = require('./config');

// Helper function to initialize a queue with event listeners
function createQueue(name) {
  const queue = new Queue(name, {
    redis: {
      host: REDIS_URL || 'localhost',
      port: REDIS_PORT || 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      maxclients: 100, // Increase Redis connection pool size for efficiency
    }
  });

  // Attach event listeners to the queue
  queue.on('stalled', (job) => {
    console.error(`Job ${job.id} stalled and is being reprocessed`);
  });

  queue.on('waiting', (jobId) => {
    console.log(`Job ${jobId} is waiting to be processed`);
  });

  queue.on('active', (job) => {
    console.log(`Job ${job.id} is now active`);
  });

  queue.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed successfully with result: ${result}`);
  });

  queue.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed with error: ${err.message}`);
  });

  return queue;
}

// Initialize queues using the helper function
const checkTwitterTaskQueue = createQueue('check-twitter-task');
const joinAirdropcheckTwitterFollowQueue = createQueue('airdrop-join-check-twitter-follow');
const joinAirdropcheckTwitterRetweetQueue = createQueue('airdrop-join-check-twitter-retweet-post');
const requestForRandomNumberVrfQueue = createQueue('request-for-random-number-vrf');

module.exports = {
  checkTwitterTaskQueue,
  joinAirdropcheckTwitterFollowQueue,
  joinAirdropcheckTwitterRetweetQueue,
  requestForRandomNumberVrfQueue
};
