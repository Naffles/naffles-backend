const { incrAsync, expireAsync } = require("../config/redisClient");

// Unified rate limiter middleware
const rateLimiter = (options = {}) => {
  // Defaults can be adjusted as needed
  const {
    durationSec = 60, // Default duration for rate limiting window
    allowedHits = 1000, // Default allowed hits in the duration
    isGeneral = false, // Flag to determine the type of rate limiting
  } = options;

  return async (req, res, next) => {
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    // Construct the key based on whether it's a general or specific rate limit
    const pathSegment = isGeneral ? "general" : req.path;
    const key = `rateLimit:${pathSegment}:${ip}`;

    try {
      let requestCount = await incrAsync(key);
      if (requestCount === 1) {
        await expireAsync(key, durationSec);
      }

      if (requestCount > allowedHits) {
        // Send different messages for general vs. specific to make it clear which limit was exceeded
        const message = isGeneral
          ? "Too many requests"
          : `Too many requests to ${req.path} (specific limit exceeded)`;
        return res.status(429).send({ message });
      }

      next();
    } catch (err) {
      console.error(
        `Error in ${
          isGeneral ? "general" : "specific"
        } rate limiter middleware:`,
        err
      );
      return res.status(500).send("Internal Server Error");
    }
  };
};

module.exports = rateLimiter;
