/**
 * Discord OAuth Service
 * Handles Discord OAuth flow, account linking, and security measures
 */

const axios = require('axios');
const crypto = require('crypto');
const DiscordAccount = require('../models/user/discordAccount');
const User = require('../models/user/user');
const discordIntegrationService = require('./discordIntegrationService');

class DiscordOAuthService {
  constructor() {
    this.baseURL = 'https://discord.com/api/v10';
    this.clientId = process.env.DISCORD_CLIENT_ID;
    this.clientSecret = process.env.DISCORD_CLIENT_SECRET;
    this.redirectUri = process.env.DISCORD_REDIRECT_URI;
    this.scopes = ['identify', 'email', 'guilds.members.read'];
    
    // Security tracking
    this.linkingAttempts = new Map(); // Track linking attempts for fraud detection
    this.suspiciousIPs = new Set(); // Track suspicious IP addresses
    this.maxAttemptsPerIP = 10; // Max attempts per IP per hour
    this.maxAttemptsPerUser = 5; // Max attempts per user per hour
    this.attemptWindow = 60 * 60 * 1000; // 1 hour in milliseconds
  }

  /**
   * Generate OAuth authorization URL with state parameter for security
   * @param {string} userId - Naffles user ID
   * @param {string} ipAddress - Client IP address
   * @returns {Object} Authorization URL and state
   */
  generateAuthorizationURL(userId, ipAddress) {
    try {
      // Check for suspicious activity
      if (this.isSuspiciousActivity(userId, ipAddress)) {
        throw new Error('Too many linking attempts. Please try again later.');
      }

      // Generate secure state parameter
      const state = this.generateSecureState(userId, ipAddress);
      
      const params = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        response_type: 'code',
        scope: this.scopes.join(' '),
        state: state
      });

      const authUrl = `https://discord.com/oauth2/authorize?${params.toString()}`;

      // Track the attempt
      this.trackLinkingAttempt(userId, ipAddress, 'auth_url_generated');

      return {
        authUrl,
        state,
        expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
      };

    } catch (error) {
      console.error('Error generating Discord auth URL:', error);
      throw error;
    }
  }

  /**
   * Generate secure state parameter
   * @param {string} userId - User ID
   * @param {string} ipAddress - IP address
   * @returns {string} Secure state parameter
   */
  generateSecureState(userId, ipAddress) {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const data = `${userId}:${ipAddress}:${timestamp}:${nonce}`;
    const signature = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'fallback-secret')
      .update(data)
      .digest('hex');
    
    return Buffer.from(`${data}:${signature}`).toString('base64');
  }

  /**
   * Verify and decode state parameter
   * @param {string} state - State parameter from OAuth callback
   * @param {string} ipAddress - Current IP address
   * @returns {Object} Decoded state data
   */
  verifyState(state, ipAddress) {
    try {
      const decoded = Buffer.from(state, 'base64').toString('utf8');
      const parts = decoded.split(':');
      
      if (parts.length !== 5) {
        throw new Error('Invalid state format');
      }

      const [userId, originalIP, timestamp, nonce, signature] = parts;
      
      // Verify signature
      const data = `${userId}:${originalIP}:${timestamp}:${nonce}`;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.JWT_SECRET || 'fallback-secret')
        .update(data)
        .digest('hex');

      if (signature !== expectedSignature) {
        throw new Error('Invalid state signature');
      }

      // Check timestamp (10 minutes expiry)
      const stateAge = Date.now() - parseInt(timestamp);
      if (stateAge > 10 * 60 * 1000) {
        throw new Error('State parameter expired');
      }

      // Verify IP address matches (optional security check)
      if (originalIP !== ipAddress) {
        console.warn(`IP address mismatch in OAuth state: ${originalIP} vs ${ipAddress}`);
        // Don't throw error, just log for monitoring
      }

      return {
        userId,
        originalIP,
        timestamp: parseInt(timestamp),
        nonce,
        isValid: true
      };

    } catch (error) {
      console.error('Error verifying OAuth state:', error);
      throw new Error('Invalid or expired state parameter');
    }
  }

  /**
   * Complete OAuth flow and link Discord account
   * @param {string} code - OAuth authorization code
   * @param {string} state - State parameter
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<Object>} Linking result
   */
  async completeOAuthFlow(code, state, ipAddress, userAgent) {
    try {
      // Verify state parameter
      const stateData = this.verifyState(state, ipAddress);
      const userId = stateData.userId;

      // Check for suspicious activity
      if (this.isSuspiciousActivity(userId, ipAddress)) {
        throw new Error('Too many linking attempts. Please try again later.');
      }

      // Exchange code for tokens
      const tokenData = await this.exchangeCodeForTokens(code);
      
      // Get Discord user information
      const discordUser = await discordIntegrationService.getDiscordUser(tokenData.access_token);

      // Check if Discord account is already linked to another user
      const existingLink = await DiscordAccount.findByDiscordId(discordUser.id);
      if (existingLink && existingLink.userId.toString() !== userId) {
        throw new Error('This Discord account is already linked to another Naffles account');
      }

      // Verify user exists
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Create or update Discord account link
      const discordAccount = await DiscordAccount.createOrUpdateLink(
        userId,
        discordUser,
        tokenData
      );

      // Track successful linking
      this.trackLinkingAttempt(userId, ipAddress, 'link_successful', {
        discordUserId: discordUser.id,
        discordUsername: discordUser.username
      });

      // Clear any previous failed attempts for this user
      this.clearUserAttempts(userId);

      return {
        success: true,
        discordAccount: {
          id: discordAccount._id,
          discordUserId: discordAccount.discordUserId,
          username: discordAccount.username,
          discriminator: discordAccount.discriminator,
          avatar: discordAccount.avatar,
          verified: discordAccount.verified,
          linkedAt: discordAccount.linkedAt
        },
        user: {
          id: user._id,
          username: user.username
        }
      };

    } catch (error) {
      console.error('Error completing OAuth flow:', error);
      
      // Track failed attempt if we have state data
      try {
        const stateData = this.verifyState(state, ipAddress);
        this.trackLinkingAttempt(stateData.userId, ipAddress, 'link_failed', {
          error: error.message
        });
      } catch (stateError) {
        // State verification failed, track as suspicious
        this.trackSuspiciousActivity(ipAddress, 'invalid_state');
      }

      throw error;
    }
  }

  /**
   * Exchange OAuth code for access tokens
   * @param {string} code - Authorization code
   * @returns {Promise<Object>} Token data
   */
  async exchangeCodeForTokens(code) {
    try {
      const response = await axios.post(
        `${this.baseURL}/oauth2/token`,
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: this.redirectUri
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error exchanging OAuth code:', error.response?.data || error.message);
      throw new Error('Failed to exchange Discord authorization code');
    }
  }

  /**
   * Get Discord account linking status for user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Linking status
   */
  async getLinkingStatus(userId) {
    try {
      const discordAccount = await DiscordAccount.findByUserId(userId);
      
      if (!discordAccount) {
        return {
          isLinked: false,
          canLink: true,
          message: 'Discord account not linked'
        };
      }

      // Check if token needs refresh
      const needsRefresh = discordAccount.needsTokenRefresh();
      
      return {
        isLinked: true,
        isActive: discordAccount.isActive,
        needsRefresh,
        discordUser: {
          id: discordAccount.discordUserId,
          username: discordAccount.username,
          discriminator: discordAccount.discriminator,
          avatar: discordAccount.avatar,
          verified: discordAccount.verified
        },
        linkedAt: discordAccount.linkedAt,
        lastVerified: discordAccount.lastVerified,
        scopes: discordAccount.scopes
      };

    } catch (error) {
      console.error('Error getting linking status:', error);
      throw new Error('Failed to get Discord linking status');
    }
  }

  /**
   * Refresh Discord access token
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Refresh result
   */
  async refreshUserToken(userId) {
    try {
      const discordAccount = await DiscordAccount.findByUserId(userId);
      
      if (!discordAccount) {
        throw new Error('Discord account not linked');
      }

      if (!discordAccount.refreshToken) {
        throw new Error('No refresh token available');
      }

      // Refresh the token
      const newTokenData = await discordIntegrationService.refreshAccessToken(
        discordAccount.refreshToken
      );

      // Update the account with new tokens
      await discordAccount.updateTokens(newTokenData);

      // Get updated Discord user info
      const discordUser = await discordIntegrationService.getDiscordUser(
        newTokenData.access_token
      );

      // Update Discord user information
      await discordAccount.updateDiscordInfo(discordUser);

      return {
        success: true,
        tokenRefreshed: true,
        expiresAt: discordAccount.tokenExpiresAt
      };

    } catch (error) {
      console.error('Error refreshing Discord token:', error);
      throw new Error('Failed to refresh Discord token');
    }
  }

  /**
   * Unlink Discord account from user
   * @param {string} userId - User ID
   * @param {string} reason - Reason for unlinking
   * @returns {Promise<Object>} Unlink result
   */
  async unlinkDiscordAccount(userId, reason = 'user_request') {
    try {
      const discordAccount = await DiscordAccount.findByUserId(userId);
      
      if (!discordAccount) {
        return {
          success: true,
          message: 'Discord account was not linked'
        };
      }

      // Deactivate the account link
      discordAccount.isActive = false;
      await discordAccount.save();

      // Log the unlinking
      console.log(`Discord account unlinked for user ${userId}:`, {
        discordUserId: discordAccount.discordUserId,
        discordUsername: discordAccount.username,
        reason,
        unlinkedAt: new Date()
      });

      return {
        success: true,
        message: 'Discord account successfully unlinked',
        unlinkedAccount: {
          discordUserId: discordAccount.discordUserId,
          username: discordAccount.username
        }
      };

    } catch (error) {
      console.error('Error unlinking Discord account:', error);
      throw new Error('Failed to unlink Discord account');
    }
  }

  /**
   * Verify Discord account and sync role information
   * @param {string} userId - User ID
   * @param {string} serverId - Discord server ID (optional)
   * @returns {Promise<Object>} Verification result
   */
  async verifyAndSyncAccount(userId, serverId = null) {
    try {
      const discordAccount = await DiscordAccount.findByUserId(userId);
      
      if (!discordAccount) {
        throw new Error('Discord account not linked');
      }

      // Refresh token if needed
      if (discordAccount.needsTokenRefresh()) {
        await this.refreshUserToken(userId);
        // Reload the account after refresh
        await discordAccount.reload();
      }

      // Get current Discord user info
      const discordUser = await discordIntegrationService.getDiscordUser(
        discordAccount.accessToken
      );

      // Update Discord user information
      await discordAccount.updateDiscordInfo(discordUser);

      const result = {
        success: true,
        verified: true,
        discordUser: {
          id: discordUser.id,
          username: discordUser.username,
          discriminator: discordUser.discriminator,
          avatar: discordUser.avatar,
          verified: discordUser.verified
        },
        lastVerified: discordAccount.lastVerified
      };

      // If server ID provided, get role information
      if (serverId) {
        try {
          const userRoles = await discordIntegrationService.getUserRolesInServer(
            discordUser.id,
            serverId
          );
          
          result.serverRoles = {
            serverId,
            roles: userRoles,
            memberFound: userRoles.length > 0
          };
        } catch (roleError) {
          console.warn('Error getting server roles:', roleError);
          result.serverRoles = {
            serverId,
            roles: [],
            memberFound: false,
            error: 'Failed to get server roles'
          };
        }
      }

      return result;

    } catch (error) {
      console.error('Error verifying Discord account:', error);
      throw new Error('Failed to verify Discord account');
    }
  }

  /**
   * Check if activity is suspicious (fraud detection)
   * @param {string} userId - User ID
   * @param {string} ipAddress - IP address
   * @returns {boolean} Whether activity is suspicious
   */
  isSuspiciousActivity(userId, ipAddress) {
    const now = Date.now();
    const windowStart = now - this.attemptWindow;

    // Check IP-based attempts
    const ipAttempts = Array.from(this.linkingAttempts.values())
      .filter(attempt => 
        attempt.ipAddress === ipAddress && 
        attempt.timestamp > windowStart
      );

    if (ipAttempts.length >= this.maxAttemptsPerIP) {
      this.suspiciousIPs.add(ipAddress);
      return true;
    }

    // Check user-based attempts
    const userAttempts = Array.from(this.linkingAttempts.values())
      .filter(attempt => 
        attempt.userId === userId && 
        attempt.timestamp > windowStart
      );

    if (userAttempts.length >= this.maxAttemptsPerUser) {
      return true;
    }

    // Check if IP is marked as suspicious
    if (this.suspiciousIPs.has(ipAddress)) {
      return true;
    }

    return false;
  }

  /**
   * Track linking attempt for fraud detection
   * @param {string} userId - User ID
   * @param {string} ipAddress - IP address
   * @param {string} action - Action type
   * @param {Object} metadata - Additional metadata
   */
  trackLinkingAttempt(userId, ipAddress, action, metadata = {}) {
    const attemptId = crypto.randomUUID();
    const attempt = {
      id: attemptId,
      userId,
      ipAddress,
      action,
      timestamp: Date.now(),
      metadata
    };

    this.linkingAttempts.set(attemptId, attempt);

    // Clean up old attempts (older than 24 hours)
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    for (const [id, attempt] of this.linkingAttempts.entries()) {
      if (attempt.timestamp < cutoff) {
        this.linkingAttempts.delete(id);
      }
    }
  }

  /**
   * Track suspicious activity
   * @param {string} ipAddress - IP address
   * @param {string} reason - Reason for suspicion
   */
  trackSuspiciousActivity(ipAddress, reason) {
    this.suspiciousIPs.add(ipAddress);
    console.warn(`Suspicious Discord OAuth activity from IP ${ipAddress}: ${reason}`);
    
    // Log to security monitoring if available
    // This could be enhanced to integrate with a security monitoring service
  }

  /**
   * Clear attempts for a specific user (after successful linking)
   * @param {string} userId - User ID
   */
  clearUserAttempts(userId) {
    for (const [id, attempt] of this.linkingAttempts.entries()) {
      if (attempt.userId === userId) {
        this.linkingAttempts.delete(id);
      }
    }
    
    // Also clear from suspicious IPs if this was the only user from that IP
    const userAttempts = Array.from(this.linkingAttempts.values())
      .filter(attempt => attempt.userId === userId);
    
    if (userAttempts.length === 0) {
      // Find IPs that only had attempts from this user
      const userIPs = new Set();
      for (const [id, attempt] of this.linkingAttempts.entries()) {
        if (attempt.userId === userId) {
          userIPs.add(attempt.ipAddress);
        }
      }
      
      // Remove IPs that no longer have any attempts
      for (const ip of userIPs) {
        const ipHasOtherAttempts = Array.from(this.linkingAttempts.values())
          .some(attempt => attempt.ipAddress === ip && attempt.userId !== userId);
        
        if (!ipHasOtherAttempts) {
          this.suspiciousIPs.delete(ip);
        }
      }
    }
  }

  /**
   * Get security statistics
   * @returns {Object} Security statistics
   */
  getSecurityStats() {
    const now = Date.now();
    const hourAgo = now - this.attemptWindow;

    const recentAttempts = Array.from(this.linkingAttempts.values())
      .filter(attempt => attempt.timestamp > hourAgo);

    const attemptsByAction = {};
    recentAttempts.forEach(attempt => {
      attemptsByAction[attempt.action] = (attemptsByAction[attempt.action] || 0) + 1;
    });

    return {
      totalAttempts: this.linkingAttempts.size,
      recentAttempts: recentAttempts.length,
      suspiciousIPs: this.suspiciousIPs.size,
      attemptsByAction,
      windowSize: this.attemptWindow,
      maxAttemptsPerIP: this.maxAttemptsPerIP,
      maxAttemptsPerUser: this.maxAttemptsPerUser
    };
  }

  /**
   * Validate OAuth configuration
   * @returns {Object} Configuration validation
   */
  validateConfiguration() {
    const missing = [];
    
    if (!this.clientId) missing.push('DISCORD_CLIENT_ID');
    if (!this.clientSecret) missing.push('DISCORD_CLIENT_SECRET');
    if (!this.redirectUri) missing.push('DISCORD_REDIRECT_URI');

    return {
      isValid: missing.length === 0,
      missingConfig: missing,
      scopes: this.scopes,
      redirectUri: this.redirectUri
    };
  }
}

module.exports = new DiscordOAuthService();