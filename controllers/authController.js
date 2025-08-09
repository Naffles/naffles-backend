const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const WalletAddress = require("../models/user/walletAddress");
const User = require("../models/user/user");
const sendResponse = require("../utils/responseHandler");
const { generateUsername } = require("unique-username-generator");
const { setAsync, getAsync } = require("../config/redisClient");
const { sendEmailVerificationCode } = require("../utils/sendEmail");
const createWalletBalance = require("../utils/createWalletBalance");
const { convertToBigInt } = require("../utils/convert");
const { NEW_ACCOUNT_CREATED } = require("../utils/constants/JackpotAccumulationConstants");
const { updateJackpot } = require("../services/jackpotAccumulation");
const { SEND_EMAIL_VERIFICATION_CODE_TIMEOUT_S } = require("../config/config");
const AuthService = require("../services/authService");
const { authLogger } = require("../utils/shared/logger");

exports.sendEmailVerification = async (req, res) => {
  const { email } = req.body;
  try {
    // Generate a 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000);
    // Store the verification code in Redis with a 10-minute expiration
    await setAsync(
      `userCreationVerification:${email}`,
      verificationCode,
      "EX",
      SEND_EMAIL_VERIFICATION_CODE_TIMEOUT_S,
    );
    // Attempt to send the verification code via email
    await sendEmailVerificationCode(verificationCode, email);
    // If successful, send a response back to the client
    return sendResponse(res, 200, "Verification email sent successfully");
  } catch (error) {
    // Log the error or handle it as needed
    console.error('Failed to send verification email:', error);
    // Send an error response to the client
    return sendResponse(res, 500, "Failed to send verification email");
  }
};

exports.signUp = async (req, res) => {
  const { email, password, verificationCode, username } = req.body;

  try {
    if (!email || !password || !verificationCode) {
      return sendResponse(
        res,
        400,
        "Email, password, and verification code are required"
      );
    }

    const result = await AuthService.registerWithCredentials(
      email, 
      password, 
      verificationCode, 
      username
    );

    // Generate token for immediate login
    const token = AuthService.generateToken(result.user.id);
    const sessionId = await AuthService.createSession(result.user.id, {
      authMethod: 'email'
    });

    return sendResponse(res, 201, "User created successfully", {
      user: result.user,
      token,
      sessionId
    });
  } catch (error) {
    console.error("Signup error:", error);
    return sendResponse(res, 500, error.message || "Error signing up user");
  }
};

exports.login = async (req, res) => {
  const { identifier, password } = req.body; // 'identifier' can be either username or email
  if (!identifier || !password) {
    return sendResponse(res, 400, "Identifier and password required");
  }
  
  try {
    // Log authentication attempt
    authLogger.info('Credential authentication attempt', {
      identifier: identifier.includes("@") ? "email" : "username",
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Determine if the identifier is an email or username
    const email = identifier.includes("@") ? identifier : null;
    
    if (email) {
      // Use AuthService for email login
      const result = await AuthService.authenticateWithCredentials(
        email, 
        password, 
        req.session
      );
      
      // Clear demo score from session after applying
      if (req.session.demo && req.session.demo.score) {
        req.session.demo.score = 0;
      }

      // Log successful authentication
      authLogger.loginSuccess(result.user.id, 'email', {
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return sendResponse(res, 200, "User logged in successfully", {
        user: result.user,
        token: result.token,
        sessionId: result.sessionId
      });
    } else {
      // Handle username login (legacy support)
      const user = await User.findOne({ username: identifier }).select("+password");
      if (!user) {
        authLogger.loginFailure('User not found', {
          username: identifier,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        return sendResponse(res, 401, "User not found");
      }

      const isPasswordMatch = await bcrypt.compare(password, user.password);
      if (!isPasswordMatch) {
        authLogger.loginFailure('Invalid password', {
          userId: user._id.toString(),
          username: identifier,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        return sendResponse(res, 401, "Invalid credentials");
      }

      // Add temporary points from session to user (if present)
      if (req.session.demo && req.session.demo.score) {
        const demoScore = req.session.demo.score;
        const pointsToAdd = await convertToBigInt(demoScore.toString());
        const currentPoints = BigInt(user?.temporaryPoints || 0);
        const totalPoints = pointsToAdd + currentPoints;
        user.temporaryPoints = totalPoints.toString();
        await user.save();
        req.session.demo.score = 0;
      }

      await user.incrementLoginCount();
      await user.updateLastActivity();
      await createWalletBalance(user._id);

      const token = AuthService.generateToken(user._id);
      const sessionId = await AuthService.createSession(user._id, {
        authMethod: 'username'
      });

      // Log successful authentication
      authLogger.loginSuccess(user._id.toString(), 'username', {
        username: identifier,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return sendResponse(res, 200, "User logged in successfully", {
        user: user.toSafeObject(),
        token,
        sessionId
      });
    }
  } catch (error) {
    // Log failed authentication
    authLogger.loginFailure(error.message, {
      identifier: identifier.includes("@") ? "email" : "username",
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      error: error.message
    });

    console.error("Login error:", error);
    return sendResponse(res, 500, error.message || "Error logging in user");
  }
};

exports.loginUsingWallet = async (req, res) => {
  const { walletType, address, chainId = "1", signature, timestamp } = req.body;
  
  try {
    // Log authentication attempt
    authLogger.info('Wallet authentication attempt', {
      walletType,
      address,
      chainId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    const result = await AuthService.authenticateWithWallet(
      { address, walletType, chainId, signature, timestamp },
      req.session
    );

    // Clear demo score from session after applying
    if (req.session.demo && req.session.demo.score) {
      req.session.demo.score = 0;
    }

    // Set user in session for compatibility
    req.session.user = result.user;

    // Log successful authentication
    authLogger.loginSuccess(result.user.id, 'wallet', {
      walletType,
      address,
      chainId,
      isNewUser: result.isNewUser,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    return sendResponse(
      res,
      result.isNewUser ? 201 : 200,
      result.isNewUser
        ? "New user created with wallet login"
        : "User logged in successfully",
      {
        user: result.user,
        token: result.token,
        sessionId: result.sessionId,
        isNewUser: result.isNewUser
      }
    );
  } catch (error) {
    // Log failed authentication
    authLogger.loginFailure(error.message, {
      walletType,
      address,
      chainId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      error: error.message
    });

    console.error("Wallet login error:", error);
    return sendResponse(res, 500, error.message || "Failed to authenticate with wallet");
  }
};
/**
 * Link wallet to existing user account
 */
exports.linkWallet = async (req, res) => {
  const { address, walletType, chainId = "1" } = req.body;
  
  try {
    if (!req.user || !req.user._id) {
      return sendResponse(res, 401, "Authentication required");
    }

    const walletAddress = await AuthService.linkWalletToUser(req.user._id, {
      address,
      walletType,
      chainId
    });

    return sendResponse(res, 201, "Wallet linked successfully", {
      wallet: {
        address: walletAddress.address,
        walletType: walletAddress.walletType,
        chainId: walletAddress.chainId,
        isPrimary: walletAddress.isPrimary,
        connectedAt: walletAddress.connectedAt
      }
    });
  } catch (error) {
    console.error("Link wallet error:", error);
    return sendResponse(res, 500, error.message || "Failed to link wallet");
  }
};

/**
 * Logout user and destroy session
 */
exports.logout = async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const userId = req.user?._id?.toString();
    
    // Log logout attempt
    authLogger.logout(userId || 'unknown', {
      sessionId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (sessionId) {
      await AuthService.destroySession(sessionId);
    }

    // Clear session data
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destruction error:", err);
          authLogger.error('Session destruction failed', {
            userId,
            sessionId,
            error: err.message
          });
        }
      });
    }

    return sendResponse(res, 200, "Logged out successfully");
  } catch (error) {
    console.error("Logout error:", error);
    authLogger.error('Logout failed', {
      userId: req.user?._id?.toString(),
      error: error.message,
      ip: req.ip
    });
    return sendResponse(res, 500, "Error during logout");
  }
};

/**
 * Refresh authentication token
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return sendResponse(res, 400, "Refresh token required");
    }

    // Verify refresh token
    const decoded = AuthService.verifyToken(refreshToken);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return sendResponse(res, 401, "Invalid refresh token");
    }

    // Generate new tokens
    const newToken = AuthService.generateToken(user._id);
    const newRefreshToken = AuthService.generateToken(user._id, "30d");
    
    // Update session activity
    const sessionId = req.headers['x-session-id'];
    if (sessionId) {
      await AuthService.updateSessionActivity(sessionId);
    }

    return sendResponse(res, 200, "Token refreshed successfully", {
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return sendResponse(res, 401, "Invalid or expired refresh token");
  }
};

/**
 * Verify user session
 */
exports.verifySession = async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
      return sendResponse(res, 400, "Session ID required");
    }

    const session = await AuthService.getSession(sessionId);
    
    if (!session) {
      return sendResponse(res, 401, "Invalid or expired session");
    }

    // Update session activity
    await AuthService.updateSessionActivity(sessionId);

    return sendResponse(res, 200, "Session valid", {
      session: {
        userId: session.userId,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        authMethod: session.authMethod
      }
    });
  } catch (error) {
    console.error("Session verification error:", error);
    return sendResponse(res, 500, "Error verifying session");
  }
};

/**
 * Get user's authentication methods
 */
exports.getAuthMethods = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return sendResponse(res, 401, "Authentication required");
    }

    const user = await User.findById(req.user._id).select("+password");
    const wallets = await WalletAddress.findUserWallets(req.user._id);

    const authMethods = {
      email: !!user.email && !!user.password,
      wallet: wallets.length > 0,
      wallets: wallets.map(wallet => ({
        address: wallet.address,
        walletType: wallet.walletType,
        chainId: wallet.chainId,
        isPrimary: wallet.isPrimary
      }))
    };

    return sendResponse(res, 200, "Authentication methods retrieved", authMethods);
  } catch (error) {
    console.error("Get auth methods error:", error);
    return sendResponse(res, 500, "Error retrieving authentication methods");
  }
};