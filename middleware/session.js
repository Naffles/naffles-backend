const session = require("express-session");
const RedisStore = require("connect-redis")(session);
const { client } = require("../config/redisClient");
const { SESSION_SECRET } = require("../config/config");

const sessionMiddleware = session({
  store: new RedisStore({ client }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV == "localhost" ? false : true,
    httpOnly: process.env.NODE_ENV == "localhost" ? false : true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  },
});

module.exports = sessionMiddleware;
