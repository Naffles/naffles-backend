const rateLimit = require('express-rate-limit');
const { setAsync, getAsync, incrAsync, expireAsync } = require('../config/redisClient');

/**
 * Enhanced rate limiting middleware for authentication endpoints
 * Uses Redis for distributed rate limiting across multiple server instances
 */

/**
 * Create Redis-based rate limiter
 */
const createRedisRateLimit = (options) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 5, // limit each IP to 5 requests per windowMs
    message = 'Too many requests, please try again later',
    keyGenerator = (req) => req.ip,
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = options;

  return async (req, res, next) => {
    try {
      const key = `rate_limit:${keyGenerator(req)}`;
      const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
      const windowKey = `${key}:${windowStart}`;

      // Get current count
      const current = await getAsync(windowKey);
      const count = current ? parseInt(current) : 0;

      // Check if limit exceeded
      if (count >= max) {
        return res.status(429).json({
          success: false,
          message,
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }

      // Increment counter
      const newCount = await incrAsync(windowKey);
      
      // Set expiration on first request in window
      if (newCount === 1) {
        await expireAsync(windowKey, Math.ceil(windowMs / 1000));
      }

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': max,
        'X-RateLimit-Remaining': Math.max(0, max - newCount),
        'X-RateLimit-Reset': new Date(windowStart + windowMs).toISOString()
      });

      next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      // Fail open - allow request if rate limiting fails
      next();
    }
  };
};

/**
 * Authentication rate limiter - strict limits for auth endpoints
 */
const authRateLimit = createRedisRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later',
  keyGenerator: (req) => `auth:${req.ip}`,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

/**
 * Login rate limiter - even stricter for login attempts
 */
const loginRateLimit = createRedisRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 login attempts per windowMs
  message: 'Too many login attempts, please try again in 15 minutes',
  keyGenerator: (req) => `login:${req.ip}`,
  skipSuccessfulRequests: true, // Don't count successful logins
  skipFailedRequests: false
});

/**
 * Registration rate limiter - prevent spam registrations
 */
const registrationRateLimit = createRedisRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 registrations per hour
  message: 'Too many registration attempts, please try again later',
  keyGenerator: (req) => `register:${req.ip}`,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

/**
 * Password reset rate limiter
 */
const passwordResetRateLimit = createRedisRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 password reset requests per hour
  message: 'Too many password reset attempts, please try again later',
  keyGenerator: (req) => `password_reset:${req.ip}`,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

/**
 * Email verification rate limiter
 */
const emailVerificationRateLimit = createRedisRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // limit each IP to 3 verification requests per 5 minutes
  message: 'Too many verification requests, please try again later',
  keyGenerator: (req) => `email_verify:${req.ip}`,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

/**
 * User-specific rate limiter (by user ID)
 */
const createUserRateLimit = (options) => {
  return createRedisRateLimit({
    ...options,
    keyGenerator: (req) => `user:${req.user?._id || req.ip}`
  });
};

/**
 * Wallet connection rate limiter - prevent wallet spam
 */
const walletConnectionRateLimit = createRedisRateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // limit each IP to 10 wallet connections per 10 minutes
  message: 'Too many wallet connection attempts, please try again later',
  keyGenerator: (req) => `wallet:${req.ip}`,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

module.exports = {
  authRateLimit,
  loginRateLimit,
  registrationRateLimit,
  passwordResetRateLimit,
  emailVerificationRateLimit,
  walletConnectionRateLimit,
  createRedisRateLimit,
  createUserRateLimit
};