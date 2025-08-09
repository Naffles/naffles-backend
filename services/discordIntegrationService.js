/**
 * Discord Integration Service
 * Handles Discord API integration for role verification and user linking
 */

const axios = require('axios');

class DiscordIntegrationService {
  constructor() {
    this.baseURL = 'https://discord.com/api/v10';
    this.botToken = process.env.DISCORD_BOT_TOKEN;
    this.clientId = process.env.DISCORD_CLIENT_ID;
    this.clientSecret = process.env.DISCORD_CLIENT_SECRET;
    this.redirectUri = process.env.DISCORD_REDIRECT_URI;
    
    // Cache Discord data for 5 minutes to avoid rate limits
    this.roleCache = new Map();
    this.userCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get Discord user information using OAuth token
   * @param {string} accessToken - Discord OAuth access token
   * @returns {Promise<Object>} Discord user information
   */
  async getDiscordUser(accessToken) {
    try {
      const cacheKey = `user_${accessToken}`;
      
      // Check cache first
      if (this.userCache.has(cacheKey)) {
        const cached = this.userCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return cached.data;
        }
      }

      const response = await axios.get(`${this.baseURL}/users/@me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const userData = response.data;
      
      // Cache the result
      this.userCache.set(cacheKey, {
        data: userData,
        timestamp: Date.now()
      });

      return userData;

    } catch (error) {
      console.error('Error getting Discord user:', error.response?.data || error.message);
      throw new Error('Failed to get Discord user information');
    }
  }

  /**
   * Get user's roles in a specific Discord server
   * @param {string} userId - Discord user ID
   * @param {string} serverId - Discord server (guild) ID
   * @returns {Promise<Array>} Array of role IDs
   */
  async getUserRolesInServer(userId, serverId) {
    try {
      const cacheKey = `roles_${userId}_${serverId}`;
      
      // Check cache first
      if (this.roleCache.has(cacheKey)) {
        const cached = this.roleCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return cached.data;
        }
      }

      if (!this.botToken) {
        throw new Error('Discord bot token not configured');
      }

      const response = await axios.get(
        `${this.baseURL}/guilds/${serverId}/members/${userId}`,
        {
          headers: {
            'Authorization': `Bot ${this.botToken}`
          }
        }
      );

      const roles = response.data.roles || [];
      
      // Cache the result
      this.roleCache.set(cacheKey, {
        data: roles,
        timestamp: Date.now()
      });

      return roles;

    } catch (error) {
      if (error.response?.status === 404) {
        // User not found in server
        return [];
      }
      
      console.error('Error getting user roles:', error.response?.data || error.message);
      throw new Error('Failed to get Discord user roles');
    }
  }

  /**
   * Get server information including roles
   * @param {string} serverId - Discord server (guild) ID
   * @returns {Promise<Object>} Server information with roles
   */
  async getServerInfo(serverId) {
    try {
      const cacheKey = `server_${serverId}`;
      
      // Check cache first
      if (this.roleCache.has(cacheKey)) {
        const cached = this.roleCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return cached.data;
        }
      }

      if (!this.botToken) {
        throw new Error('Discord bot token not configured');
      }

      const [guildResponse, rolesResponse] = await Promise.all([
        axios.get(`${this.baseURL}/guilds/${serverId}`, {
          headers: { 'Authorization': `Bot ${this.botToken}` }
        }),
        axios.get(`${this.baseURL}/guilds/${serverId}/roles`, {
          headers: { 'Authorization': `Bot ${this.botToken}` }
        })
      ]);

      const serverInfo = {
        ...guildResponse.data,
        roles: rolesResponse.data
      };
      
      // Cache the result
      this.roleCache.set(cacheKey, {
        data: serverInfo,
        timestamp: Date.now()
      });

      return serverInfo;

    } catch (error) {
      console.error('Error getting server info:', error.response?.data || error.message);
      throw new Error('Failed to get Discord server information');
    }
  }

  /**
   * Verify if user has specific role in server
   * @param {string} userId - Discord user ID
   * @param {string} serverId - Discord server ID
   * @param {string} roleId - Discord role ID to check
   * @returns {Promise<boolean>} Whether user has the role
   */
  async verifyUserRole(userId, serverId, roleId) {
    try {
      const userRoles = await this.getUserRolesInServer(userId, serverId);
      return userRoles.includes(roleId);
    } catch (error) {
      console.error('Error verifying user role:', error);
      return false;
    }
  }

  /**
   * Get role information by ID
   * @param {string} serverId - Discord server ID
   * @param {string} roleId - Discord role ID
   * @returns {Promise<Object>} Role information
   */
  async getRoleInfo(serverId, roleId) {
    try {
      const serverInfo = await this.getServerInfo(serverId);
      const role = serverInfo.roles.find(r => r.id === roleId);
      
      if (!role) {
        throw new Error('Role not found in server');
      }

      return role;
    } catch (error) {
      console.error('Error getting role info:', error);
      throw error;
    }
  }

  /**
   * Exchange OAuth code for access token
   * @param {string} code - OAuth authorization code
   * @returns {Promise<Object>} Token information
   */
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post(`${this.baseURL}/oauth2/token`, 
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
      console.error('Error exchanging code for token:', error.response?.data || error.message);
      throw new Error('Failed to exchange Discord authorization code');
    }
  }

  /**
   * Refresh Discord access token
   * @param {string} refreshToken - Discord refresh token
   * @returns {Promise<Object>} New token information
   */
  async refreshAccessToken(refreshToken) {
    try {
      const response = await axios.post(`${this.baseURL}/oauth2/token`,
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error refreshing token:', error.response?.data || error.message);
      throw new Error('Failed to refresh Discord access token');
    }
  }

  /**
   * Clear cache for specific user or server
   * @param {string} type - 'user' or 'server' or 'all'
   * @param {string} id - User ID or Server ID
   */
  clearCache(type = 'all', id = null) {
    if (type === 'all') {
      this.roleCache.clear();
      this.userCache.clear();
    } else if (type === 'user' && id) {
      // Clear all cache entries for this user
      for (const [key, value] of this.roleCache.entries()) {
        if (key.includes(`_${id}_`)) {
          this.roleCache.delete(key);
        }
      }
      for (const [key, value] of this.userCache.entries()) {
        if (key.includes(`_${id}`)) {
          this.userCache.delete(key);
        }
      }
    } else if (type === 'server' && id) {
      // Clear all cache entries for this server
      for (const [key, value] of this.roleCache.entries()) {
        if (key.includes(`_${id}`) || key.includes(`server_${id}`)) {
          this.roleCache.delete(key);
        }
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      roleCacheSize: this.roleCache.size,
      userCacheSize: this.userCache.size,
      cacheTimeout: this.cacheTimeout
    };
  }

  /**
   * Validate Discord configuration
   * @returns {Object} Configuration validation result
   */
  validateConfiguration() {
    const missing = [];
    
    if (!this.botToken) missing.push('DISCORD_BOT_TOKEN');
    if (!this.clientId) missing.push('DISCORD_CLIENT_ID');
    if (!this.clientSecret) missing.push('DISCORD_CLIENT_SECRET');
    if (!this.redirectUri) missing.push('DISCORD_REDIRECT_URI');

    return {
      isValid: missing.length === 0,
      missingConfig: missing,
      hasBasicConfig: Boolean(this.botToken && this.clientId)
    };
  }
}

module.exports = new DiscordIntegrationService();