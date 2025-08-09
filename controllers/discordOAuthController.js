/**
 * Discord OAuth Controller
 * Handles Discord OAuth endpoints for account linking
 */

const discordOAuthService = require('../services/discordOAuthService');
const authService = require('../services/authService');

class DiscordOAuthController {
  /**
   * Generate Discord OAuth authorization URL
   * POST /api/discord/oauth/authorize
   */
  async generateAuthURL(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      
      const authData = discordOAuthService.generateAuthorizationURL(userId, ipAddress);

      res.json({
        success: true,
        authUrl: authData.authUrl,
        state: authData.state,
        expiresAt: authData.expiresAt
      });

    } catch (error) {
      console.error('Error generating Discord auth URL:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to generate authorization URL'
      });
    }
  }

  /**
   * Handle Discord OAuth callback
   * POST /api/discord/oauth/callback
   */
  async handleCallback(req, res) {
    try {
      const { code, state } = req.body;
      
      if (!code || !state) {
        return res.status(400).json({
          success: false,
          message: 'Missing authorization code or state parameter'
        });
      }

      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('User-Agent') || 'unknown';

      const result = await discordOAuthService.completeOAuthFlow(
        code,
        state,
        ipAddress,
        userAgent
      );

      res.json(result);

    } catch (error) {
      console.error('Error handling Discord OAuth callback:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to complete Discord linking'
      });
    }
  }

  /**
   * Get Discord account linking status
   * GET /api/discord/oauth/status
   */
  async getLinkingStatus(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const status = await discordOAuthService.getLinkingStatus(userId);

      res.json({
        success: true,
        ...status
      });

    } catch (error) {
      console.error('Error getting Discord linking status:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get linking status'
      });
    }
  }

  /**
   * Refresh Discord access token
   * POST /api/discord/oauth/refresh
   */
  async refreshToken(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const result = await discordOAuthService.refreshUserToken(userId);

      res.json(result);

    } catch (error) {
      console.error('Error refreshing Discord token:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to refresh Discord token'
      });
    }
  }

  /**
   * Unlink Discord account
   * DELETE /api/discord/oauth/unlink
   */
  async unlinkAccount(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { reason } = req.body;
      const result = await discordOAuthService.unlinkDiscordAccount(userId, reason);

      res.json(result);

    } catch (error) {
      console.error('Error unlinking Discord account:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to unlink Discord account'
      });
    }
  }

  /**
   * Verify and sync Discord account
   * POST /api/discord/oauth/verify
   */
  async verifyAccount(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { serverId } = req.body;
      const result = await discordOAuthService.verifyAndSyncAccount(userId, serverId);

      res.json(result);

    } catch (error) {
      console.error('Error verifying Discord account:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to verify Discord account'
      });
    }
  }

  /**
   * Get user's Discord roles in a specific server
   * GET /api/discord/oauth/roles/:serverId
   */
  async getUserRoles(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { serverId } = req.params;
      if (!serverId) {
        return res.status(400).json({
          success: false,
          message: 'Server ID is required'
        });
      }

      // Get user's Discord account
      const status = await discordOAuthService.getLinkingStatus(userId);
      if (!status.isLinked) {
        return res.status(400).json({
          success: false,
          message: 'Discord account not linked'
        });
      }

      // Verify and sync to get latest role information
      const result = await discordOAuthService.verifyAndSyncAccount(userId, serverId);

      res.json({
        success: true,
        discordUser: result.discordUser,
        serverRoles: result.serverRoles
      });

    } catch (error) {
      console.error('Error getting Discord user roles:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get Discord roles'
      });
    }
  }

  /**
   * Get OAuth security statistics (admin only)
   * GET /api/discord/oauth/security-stats
   */
  async getSecurityStats(req, res) {
    try {
      // Check if user is admin
      if (!req.user?.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const stats = discordOAuthService.getSecurityStats();

      res.json({
        success: true,
        stats
      });

    } catch (error) {
      console.error('Error getting OAuth security stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get security statistics'
      });
    }
  }

  /**
   * Validate OAuth configuration (admin only)
   * GET /api/discord/oauth/config-status
   */
  async getConfigStatus(req, res) {
    try {
      // Check if user is admin
      if (!req.user?.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const config = discordOAuthService.validateConfiguration();

      res.json({
        success: true,
        configuration: config
      });

    } catch (error) {
      console.error('Error getting OAuth config status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get configuration status'
      });
    }
  }

  /**
   * Get account linking management interface data
   * GET /api/discord/oauth/management
   */
  async getManagementData(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Get linking status
      const status = await discordOAuthService.getLinkingStatus(userId);

      // Get user information
      const User = require('../models/user/user');
      const user = await User.findById(userId).select('username email createdAt');

      const managementData = {
        user: {
          id: userId,
          username: user.username,
          email: user.email,
          createdAt: user.createdAt
        },
        discord: status,
        actions: {
          canLink: !status.isLinked,
          canUnlink: status.isLinked && status.isActive,
          canRefresh: status.isLinked && status.needsRefresh,
          canVerify: status.isLinked
        }
      };

      res.json({
        success: true,
        data: managementData
      });

    } catch (error) {
      console.error('Error getting management data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get account management data'
      });
    }
  }
}

module.exports = new DiscordOAuthController();