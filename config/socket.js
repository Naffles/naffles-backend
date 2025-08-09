const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const Redis = require("ioredis");
const corsOptions = require("./cors");
const { REDIS_URL, REDIS_PORT } = require("./config");

const pubClient = new Redis({ host: REDIS_URL, port: REDIS_PORT });
const subClient = pubClient.duplicate();

const io = new Server({
  cors: corsOptions,
});

io.adapter(createAdapter(pubClient, subClient));

module.exports = io;
