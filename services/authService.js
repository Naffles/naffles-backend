const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/user/user");
const WalletAddress = require("../models/user/walletAddress");
const { generateUsername } = require("unique-username-generator");
const { setAsync, getAsync, delAsync } = require("../config/redisClient");
const createWalletBalance = require("../utils/createWalletBalance");
const { convertToBigInt } = require("../utils/convert");
const { NEW_ACCOUNT_CREATED } = require("../utils/constants/JackpotAccumulationConstants");
const { updateJackpot } = require("./jackpotAccumulation");
const { authLogger } = require("../utils/shared/logger");
const { validateWalletAddress, isValidSignature, isValidTimestamp } = require("../utils/blockchain/validation");

/**
 * Enhanced Authentication Service
 * Handles wallet-based and email/password authentication with session management
 */
class AuthService {
  /**
   * Generate JWT token for user
   */
  static generateToken(userId, expiresIn = "7d") {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn });
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET);
  }

  /**
   * Create user session in Redis
   */
  static async createSession(userId, sessionData = {}) {
    const sessionId = `session:${userId}:${Date.now()}`;
    const sessionInfo = {
      userId,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      ...sessionData
    };
    
    // Store session for 7 days
    await setAsync(sessionId, JSON.stringify(sessionInfo), "EX", 7 * 24 * 60 * 60);
    return sessionId;
  }

  /**
   * Get session from Redis
   */
  static async getSession(sessionId) {
    const sessionData = await getAsync(sessionId);
    return sessionData ? JSON.parse(sessionData) : null;
  }

  /**
   * Update session activity
   */
  static async updateSessionActivity(sessionId) {
    const session = await this.getSession(sessionId);
    if (session) {
      session.lastActivity = new Date().toISOString();
      await setAsync(sessionId, JSON.stringify(session), "EX", 7 * 24 * 60 * 60);
    }
  }

  /**
   * Destroy session
   */
  static async destroySession(sessionId) {
    await delAsync(sessionId);
  }

  /**
   * Authenticate user with wallet signature
   */
  static async authenticateWithWallet(walletData, sessionData = {}) {
    const { address, walletType, chainId = "1", signature, timestamp } = walletData;
    
    try {
      // Enhanced validation
      const addressValidation = validateWalletAddress(address, walletType, chainId);
      if (!addressValidation.isValid) {
        authLogger.loginFailure('Invalid wallet address', { 
          address, 
          walletType, 
          chainId, 
          error: addressValidation.error 
        });
        throw new Error(addressValidation.error);
      }

      // Validate signature if provided
      if (signature) {
        const signatureValidation = isValidSignature(signature, walletType);
        if (!signatureValidation.isValid) {
          authLogger.loginFailure('Invalid signature format', { 
            address, 
            walletType, 
            error: signatureValidation.error 
          });
          throw new Error(signatureValidation.error);
        }
      }

      // Validate timestamp if provided
      if (timestamp) {
        const timestampValidation = isValidTimestamp(timestamp, 5);
        if (!timestampValidation.isValid) {
          authLogger.loginFailure('Invalid or expired timestamp', { 
            address, 
            timestamp, 
            error: timestampValidation.error 
          });
          throw new Error(timestampValidation.error);
        }
      }

      // Check if wallet address exists
      let walletAddress = await WalletAddress.findByAddress(address);
      let user;
      let isNewUser = false;

      if (walletAddress && walletAddress.userRef) {
        // Existing user
        user = walletAddress.userRef;
        await walletAddress.markAsUsed();
        
        authLogger.loginSuccess(user._id.toString(), 'wallet', {
          walletAddress: address,
          walletType,
          chainId
        });
      } else {
        // Create new user
        isNewUser = true;
        const username = `${generateUsername("", 3)}_${new Date().getTime()}`;
        
        user = new User({
          username,
          authMethods: { wallet: true },
          primaryWallet: {
            address: address.toLowerCase(),
            walletType,
            chainId
          }
        });
        await user.save();

        // Create wallet address record
        walletAddress = new WalletAddress({
          userRef: user._id,
          address: address.toLowerCase(),
          walletType,
          chainId,
          isPrimary: true,
          isVerified: true,
          connectedAt: new Date(),
          lastUsedAt: new Date()
        });
        await walletAddress.save();

        // Create wallet balance
        await createWalletBalance(user._id);

        // Update jackpot on new user created
        await updateJackpot(NEW_ACCOUNT_CREATED);

        authLogger.registration(user._id.toString(), 'wallet', {
          walletAddress: address,
          walletType,
          chainId
        });
      }

      // Update user activity
      await user.incrementLoginCount();
      await user.updateLastActivity();

      // Handle temporary points from session
      if (sessionData.demo && sessionData.demo.score) {
        const demoScore = sessionData.demo.score;
        const pointsToAdd = await convertToBigInt(demoScore.toString());
        const currentPoints = BigInt(user?.temporaryPoints || 0);
        const totalPoints = pointsToAdd + currentPoints;
        user.temporaryPoints = totalPoints.toString();
        await user.save();
      }

      // Generate token and create session
      const token = this.generateToken(user._id);
      const sessionId = await this.createSession(user._id, {
        walletAddress: address,
        walletType,
        chainId,
        authMethod: 'wallet'
      });

      authLogger.sessionCreated(user._id.toString(), sessionId, {
        authMethod: 'wallet',
        walletType
      });

      return {
        user: user.toSafeObject(),
        token,
        sessionId,
        isNewUser
      };

    } catch (error) {
      authLogger.loginFailure('Wallet authentication failed', { 
        address, 
        walletType, 
        error: error.message 
      });
      console.error("Wallet authentication error:", error);
      throw new Error("Failed to authenticate with wallet");
    }
  }

  /**
   * Authenticate user with email and password
   */
  static async authenticateWithCredentials(email, password, sessionData = {}) {
    try {
      // Find user by email
      const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
      if (!user) {
        throw new Error("User not found");
      }

      // Verify password
      const isPasswordMatch = await bcrypt.compare(password, user.password);
      if (!isPasswordMatch) {
        throw new Error("Invalid credentials");
      }

      // Update user activity
      await user.incrementLoginCount();
      await user.updateLastActivity();

      // Handle temporary points from session
      if (sessionData.demo && sessionData.demo.score) {
        const demoScore = sessionData.demo.score;
        const pointsToAdd = await convertToBigInt(demoScore.toString());
        const currentPoints = BigInt(user?.temporaryPoints || 0);
        const totalPoints = pointsToAdd + currentPoints;
        user.temporaryPoints = totalPoints.toString();
        await user.save();
      }

      // Ensure wallet balance exists
      await createWalletBalance(user._id);

      // Generate token and create session
      const token = this.generateToken(user._id);
      const sessionId = await this.createSession(user._id, {
        authMethod: 'email'
      });

      return {
        user: user.toSafeObject(),
        token,
        sessionId,
        isNewUser: false
      };

    } catch (error) {
      console.error("Credential authentication error:", error);
      throw error;
    }
  }

  /**
   * Register user with email and password
   */
  static async registerWithCredentials(email, password, verificationCode, username = null) {
    try {
      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw new Error("Email already exists");
      }

      // Verify email verification code
      const storedCode = await getAsync(`userCreationVerification:${email}`);
      if (!storedCode || storedCode !== verificationCode.toString()) {
        throw new Error("Invalid or expired verification code");
      }

      // Generate username if not provided
      const finalUsername = username || `${generateUsername("", 3)}_${new Date().getTime()}`;

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = new User({
        email: email.toLowerCase(),
        username: finalUsername,
        password: hashedPassword,
        authMethods: { email: true },
        isVerified: true
      });
      await user.save();

      // Create wallet balance
      await createWalletBalance(user._id);

      // Update jackpot on new user created
      await updateJackpot(NEW_ACCOUNT_CREATED);

      // Clean up verification code
      await delAsync(`userCreationVerification:${email}`);

      return {
        user: user.toSafeObject(),
        isNewUser: true
      };

    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    }
  }

  /**
   * Link wallet to existing user account
   */
  static async linkWalletToUser(userId, walletData) {
    const { address, walletType, chainId = "1" } = walletData;
    
    try {
      // Check if wallet is already linked to another user
      const existingWallet = await WalletAddress.findByAddress(address);
      if (existingWallet) {
        throw new Error("Wallet already linked to another account");
      }

      // Check if user already has a wallet of this type
      const userWalletOfType = await WalletAddress.findOne({
        userRef: userId,
        walletType
      });
      if (userWalletOfType) {
        throw new Error("User already has a wallet of this type");
      }

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Create wallet address record
      const isPrimary = !user.primaryWallet.address; // First wallet becomes primary
      const walletAddress = new WalletAddress({
        userRef: userId,
        address: address.toLowerCase(),
        walletType,
        chainId,
        isPrimary,
        isVerified: true,
        connectedAt: new Date()
      });
      await walletAddress.save();

      // Update user's primary wallet if this is their first wallet
      if (isPrimary) {
        user.primaryWallet = {
          address: address.toLowerCase(),
          walletType,
          chainId
        };
        user.authMethods.wallet = true;
        await user.save();
      }

      return walletAddress;

    } catch (error) {
      console.error("Wallet linking error:", error);
      throw error;
    }
  }

  /**
   * Get user profile with wallet information
   */
  static async getUserProfile(userId) {
    try {
      const user = await User.findById(userId).select("+password");
      if (!user) {
        throw new Error("User not found");
      }

      // Get user's wallets
      const wallets = await WalletAddress.findUserWallets(userId);

      // Get wallet balance
      let userWalletBalance = await require("../models/user/walletBalance").findOne({ userRef: userId });
      if (!userWalletBalance) {
        userWalletBalance = await createWalletBalance(userId);
      }

      const profile = user.toSafeObject();
      profile.hasPassword = !!user.password;
      profile.wallets = wallets.map(wallet => ({
        address: wallet.address,
        walletType: wallet.walletType,
        chainId: wallet.chainId,
        isPrimary: wallet.isPrimary,
        connectedAt: wallet.connectedAt,
        lastUsedAt: wallet.lastUsedAt,
        metadata: wallet.metadata
      }));

      return profile;

    } catch (error) {
      console.error("Get profile error:", error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  static async updateUserProfile(userId, updates) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Handle profile data updates
      if (updates.profileData) {
        user.profileData = { ...user.profileData, ...updates.profileData };
      }

      // Handle basic field updates
      const allowedFields = ['username', 'email'];
      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          user[field] = updates[field];
        }
      });

      // Handle social updates
      if (updates.socials) {
        user.socials = { ...user.socials, ...updates.socials };
      }

      await user.save();
      return user.toSafeObject();

    } catch (error) {
      console.error("Profile update error:", error);
      throw error;
    }
  }

  /**
   * Check if user has Founders Keys and update benefits
   */
  static async checkAndUpdateFoundersKeys(userId, walletAddress) {
    try {
      // This would integrate with blockchain to check for Founders Key NFTs
      // For now, we'll return a placeholder implementation
      const user = await User.findById(userId);
      if (!user) {
        return null;
      }

      // TODO: Implement actual blockchain integration to check for Founders Keys
      // This would involve:
      // 1. Querying the blockchain for NFTs owned by the wallet
      // 2. Filtering for Founders Key contract addresses
      // 3. Updating the user's foundersKeys array
      // 4. Calculating benefits based on key tiers

      return user.getFoundersKeyBenefits();

    } catch (error) {
      console.error("Founders Key check error:", error);
      throw error;
    }
  }
}

module.exports = AuthService;