// Simple logger utility for authentication middleware
const authLogger = {
  info: (message, data = {}) => {
    console.log(`[AUTH INFO] ${message}`, data);
  },
  warn: (message, data = {}) => {
    console.warn(`[AUTH WARN] ${message}`, data);
  },
  error: (message, data = {}) => {
    console.error(`[AUTH ERROR] ${message}`, data);
  }
};

module.exports = {
  authLogger
};