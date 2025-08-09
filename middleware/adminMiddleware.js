const sendResponse = require("../utils/responseHandler");

// Middleware to check if user has admin privileges
const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    return sendResponse(res, 401, "Authentication required.");
  }

  // Check if user has admin role
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return sendResponse(res, 403, "Access denied. Admin privileges required.");
  }

  next();
};

// Middleware to check if user has super admin privileges
const superAdminMiddleware = (req, res, next) => {
  if (!req.user) {
    return sendResponse(res, 401, "Authentication required.");
  }

  // Check if user has super admin role
  if (req.user.role !== 'superadmin') {
    return sendResponse(res, 403, "Access denied. Super admin privileges required.");
  }

  next();
};

module.exports = {
  adminMiddleware,
  superAdminMiddleware
};