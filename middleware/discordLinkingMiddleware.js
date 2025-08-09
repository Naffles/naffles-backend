/**
 * Discord Account Linking Middleware
 * Middleware for validating Discord account linking requirements
 */

const DiscordAccount = require('../models/user/discordAccount');
const discordOAuthService = require('../services/discordOAuthService');

/**
 * Middleware to check if user has Discord account linked
 * @param {boolean} required - Whether Discord linking is required
 * @returns {Function} Express middleware function
 */
const requireDiscordLink = (required = true) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const linkingStatus = await discordOAuthService.getLinkingStatus(userId);

      if (required && !linkingStatus.isLinked) {
        return res.status(400).json({
          success: false,
          message: 'Discord account linking required',
          requiresDiscordLink: true,
          linkingStatus
        });
      }

      if (linkingStatus.isLinked && !linkingStatus.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Discord account link is inactive',
          requiresDiscordLink: true,
          linkingStatus
        });
      }

      // Add Discord account info to request
      req.discordAccount = linkingStatus.isLinked ? linkingStatus : null;
      
      next();

    } catch (error) {
      console.error('Error in Discord linking middleware:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify Discord account linking'
      });
    }
  };
};

/**
 * Middleware to check if user has specific Discord role in a server
 * @param {string} serverId - Discord server ID
 * @param {string} roleId - Discord role ID
 * @returns {Function} Express middleware function
 */
const requireDiscordRole = (serverId, roleId) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // First check if Discord account is linked
      const linkingStatus = await discordOAuthService.getLinkingStatus(userId);
      
      if (!linkingStatus.isLinked) {
        return res.status(400).json({
          success: false,
          message: 'Discord account linking required for role verification',
          requiresDiscordLink: true,
          requiredRole: { serverId, roleId }
        });
      }

      // Verify and sync account to get latest role information
      const verificationResult = await discordOAuthService.verifyAndSyncAccount(userId, serverId);
      
      if (!verificationResult.serverRoles || !verificationResult.serverRoles.memberFound) {
        return res.status(403).json({
          success: false,
          message: 'User is not a member of the required Discord server',
          requiredRole: { serverId, roleId },
          serverMembership: false
        });
      }

      const userRoles = verificationResult.serverRoles.roles || [];
      const hasRequiredRole = userRoles.includes(roleId);

      if (!hasRequiredRole) {
        return res.status(403).json({
          success: false,
          message: 'User does not have the required Discord role',
          requiredRole: { serverId, roleId },
          userRoles,
          hasRequiredRole: false
        });
      }

      // Add role verification info to request
      req.discordRoleVerification = {
        serverId,
        roleId,
        userRoles,
        hasRequiredRole: true,
        verifiedAt: new Date()
      };

      next();

    } catch (error) {
      console.error('Error in Discord role middleware:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify Discord role requirement'
      });
    }
  };
};

/**
 * Middleware to refresh Discord token if needed
 * @returns {Function} Express middleware function
 */
const refreshDiscordTokenIfNeeded = () => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return next(); // Skip if no user
      }

      const linkingStatus = await discordOAuthService.getLinkingStatus(userId);
      
      if (linkingStatus.isLinked && linkingStatus.needsRefresh) {
        try {
          await discordOAuthService.refreshUserToken(userId);
          console.log(`Discord token refreshed for user ${userId}`);
        } catch (refreshError) {
          console.warn(`Failed to refresh Discord token for user ${userId}:`, refreshError);
          // Don't fail the request, just log the warning
        }
      }

      next();

    } catch (error) {
      console.error('Error in Discord token refresh middleware:', error);
      // Don't fail the request for token refresh issues
      next();
    }
  };
};

/**
 * Middleware to validate Discord account linking permissions
 * @param {Array} requiredPermissions - Array of required permissions
 * @returns {Function} Express middleware function
 */
const validateDiscordPermissions = (requiredPermissions = []) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const linkingStatus = await discordOAuthService.getLinkingStatus(userId);
      
      if (!linkingStatus.isLinked) {
        return res.status(400).json({
          success: false,
          message: 'Discord account linking required',
          requiresDiscordLink: true
        });
      }

      // Check if account has required scopes
      const accountScopes = linkingStatus.scopes || [];
      const missingScopes = requiredPermissions.filter(scope => !accountScopes.includes(scope));

      if (missingScopes.length > 0) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient Discord permissions',
          requiredPermissions,
          currentPermissions: accountScopes,
          missingPermissions: missingScopes,
          requiresRelink: true
        });
      }

      next();

    } catch (error) {
      console.error('Error in Discord permissions middleware:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to validate Discord permissions'
      });
    }
  };
};

module.exports = {
  requireDiscordLink,
  requireDiscordRole,
  refreshDiscordTokenIfNeeded,
  validateDiscordPermissions
};