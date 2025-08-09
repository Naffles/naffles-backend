const jwt = require("jsonwebtoken");
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const User = require("../models/user/user");
const sendResponse = require("../utils/responseHandler");
const { ethers } = require('ethers');
const ClientProfile = require("../models/client/clientProfile");
const { authLogger } = require("../utils/shared/logger");

const authenticate = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    // Extract the token from the 'Authorization' header
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) {
    authLogger.warn('Authentication failed: No token provided', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    return sendResponse(res, 401, "No token provided. Please log in.");
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Find the user based on the token's id payload
    const user = await User.findById(decoded.id).select("+password");
    if (!user) {
      authLogger.warn('Authentication failed: User not found', {
        userId: decoded.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      return sendResponse(
        res,
        401,
        "The user belonging to this token no longer exists."
      );
    }

    // Check if user is blocked
    if (user.isBlocked) {
      authLogger.warn('Authentication failed: User blocked', {
        userId: user._id.toString(),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        blockReason: user.blockReason
      });
      return sendResponse(
        res,
        403,
        "Account has been blocked. Please contact support."
      );
    }

    // Update session activity if session ID is provided
    const sessionId = req.headers['x-session-id'];
    if (sessionId) {
      try {
        const AuthService = require("../services/authService");
        await AuthService.updateSessionActivity(sessionId);
      } catch (sessionError) {
        console.warn("Failed to update session activity:", sessionError);
        // Don't fail authentication for session update errors
      }
    }

    // Update user's last activity
    try {
      await user.updateLastActivity();
    } catch (activityError) {
      console.warn("Failed to update user activity:", activityError);
      // Don't fail authentication for activity update errors
    }

    // Grant access to the protected route
    req.user = user; // Adding user to request object so that routes can use it
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      authLogger.warn('Authentication failed: Token expired', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      return sendResponse(res, 401, "Token has expired. Please log in again.");
    }
    
    authLogger.warn('Authentication failed: Invalid token', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      error: error.message
    });
    return sendResponse(res, 403, "Invalid token. Please log in again.");
  }
};

const authenticateSignature = async (req, res, next) => {
  const { signature, address, timestamp, walletType } = req.body;
  try {
    const currentTime = Date.now();
    const signTime = new Date(timestamp);
    signTime.setMinutes(signTime.getMinutes() + 5); // 5minutes expiration
    if (currentTime >= signTime.getTime()) return sendResponse(res, 400, `Signature expired`);
    const message =
      `Welcome to Naffles.com!\nPlease confirm your sign-in request.\n\nYour Address: ${address}\nTimestamp: ${timestamp}\n\nThis signature request will expire 5 minutes after the timestamp shown above.`
    let validSignature = false;

    if (walletType == "phantom") {
      const encoder = new TextEncoder();
      const messageUint8 = encoder.encode(message);
      const verified = nacl
        .sign
        .detached
        .verify(
          messageUint8,
          bs58.decode(signature),
          bs58.decode(address)
        );
      validSignature = verified ? true : false;
    } else if (walletType == "metamask") {
      const signingAddress = ethers.verifyMessage(message, signature);
      validSignature = signingAddress.toLowerCase() === address.toLowerCase();
    } else {
      return sendResponse(res, 500, "Invalid wallet type");
    }
    validSignature ? next() : sendResponse(res, 500, "Failed to verify signature");
  } catch (error) {
    console.error("Failed to verify signature", error);
    return sendResponse(res, 500, "Failed to verify signature");
  }
}

const authenticateSignatureWhenUpdatingWallet = async (req, res, next) => {
  const { signature, address, timestamp, walletType } = req.body;
  try {
    const currentTime = Date.now();
    const signTime = new Date(timestamp);
    signTime.setMinutes(signTime.getMinutes() + 5); // 5minutes expiration
    if (currentTime >= signTime.getTime()) return sendResponse(res, 400, `Signature expired`);
    const message =
      `Welcome to Naffles.com!\nPlease confirm your wallet connection.\n\nYour Address: ${address}\nTimestamp: ${timestamp}\n\nThis signature request will expire 5 minutes after the timestamp shown above.`
    let validSignature = false;

    if (walletType == "phantom") {
      const encoder = new TextEncoder();
      const messageUint8 = encoder.encode(message);
      const verified = nacl
        .sign
        .detached
        .verify(
          messageUint8,
          bs58.decode(signature),
          bs58.decode(address)
        );
      validSignature = verified ? true : false;
    } else if (walletType == "metamask") {
      const signingAddress = ethers.verifyMessage(message, signature);
      validSignature = signingAddress.toLowerCase() === address.toLowerCase();
    } else {
      return sendResponse(res, 500, "Invalid wallet type");
    }
    validSignature ? next() : sendResponse(res, 500, "Failed to verify signature");
  } catch (error) {
    console.error("Failed to verify signature", error);
    return sendResponse(res, 500, "Failed to verify signature");
  }
}

// Middleware to check user role
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendResponse(res, 403, "Authentication required.");
    }
    const hasRequiredRole = roles.some(role => req.user.role === role);
    if (!hasRequiredRole) {
      return sendResponse(res, 403, "Access denied. Insufficient permissions.");
    }
    next();
  };
};

const isUserClientProfileAdmin = async (req, res, next) => {
  // use this after authenticate to have req.user
  const user = req.user;
  try {
    const clientProfile = await ClientProfile.findOne({ adminRef: user._id });
    if (!clientProfile) {
      return sendResponse(res, 400, "Client profile not found");
    }
    req.clientProfile = clientProfile;
    next();
  } catch (error) {
    console.log("isUserClientProfileAdmin error: ", error);
    return sendResponse(res, 403, "Access denied. User is not an admin of the client profile.");
  }
};

module.exports = {
  isUserClientProfileAdmin,
  authenticate,
  authenticateSignature,
  requireRole,
  authenticateSignatureWhenUpdatingWallet
};
