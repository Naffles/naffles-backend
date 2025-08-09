const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const gamingNFTService = require('./gamingNFTService');
const WalletAddress = require('../models/user/walletAddress');
const DiscordAccount = require('../models/user/discordAccount');
const discordIntegrationService = require('./discordIntegrationService');

class CommunityAccessService {
  /**
   * Validate if user meets community access requirements with combined logic
   * @param {string} userId - User ID
   * @param {string} communityId - Community ID
   * @returns {Promise<Object>} Comprehensive validation result
   */
  async validateCommunityAccess(userId, communityId) {
    try {
      const community = await Community.findById(communityId);
      if (!community || !community.isActive) {
        const result = {
          hasAccess: false,
          reason: 'Community not found or inactive',
          errorCode: 'COMMUNITY_NOT_FOUND'
        };
        
        await this.logAccessAttempt(userId, communityId, 'access_denied', result);
        return result;
      }

      // Public communities allow anyone
      if (community.accessRequirements.isPublic) {
        const result = {
          hasAccess: true,
          reason: 'Public community',
          communityName: community.name
        };
        
        await this.logAccessAttempt(userId, communityId, 'access_granted', result);
        return result;
      }

      // Check if user is already a member
      const existingMembership = await CommunityMember.findOne({
        userId,
        communityId,
        isActive: true
      });

      if (existingMembership) {
        const result = {
          hasAccess: true,
          reason: 'Already a member',
          memberSince: existingMembership.joinedAt,
          role: existingMembership.role
        };
        
        await this.logAccessAttempt(userId, communityId, 'access_granted', result);
        return result;
      }

      // Perform comprehensive validation with combined logic
      const validationResult = await this.performCombinedValidation(
        userId, 
        community.accessRequirements
      );

      // Log the access attempt
      await this.logAccessAttempt(
        userId, 
        communityId, 
        validationResult.hasAccess ? 'access_granted' : 'access_denied',
        validationResult
      );

      return {
        ...validationResult,
        communityName: community.name,
        communityId
      };

    } catch (error) {
      console.error('Error validating community access:', error);
      const result = {
        hasAccess: false,
        reason: 'Validation error',
        error: error.message,
        errorCode: 'VALIDATION_ERROR'
      };
      
      await this.logAccessAttempt(userId, communityId, 'validation_error', result);
      return result;
    }
  }

  /**
   * Perform combined validation with AND/OR logic
   * @param {string} userId - User ID
   * @param {Object} accessRequirements - Community access requirements
   * @returns {Promise<Object>} Combined validation result
   */
  async performCombinedValidation(userId, accessRequirements) {
    const validationResults = {
      nftValidation: null,
      discordValidation: null
    };

    const hasNFTRequirements = accessRequirements.nftRequirements && 
                              accessRequirements.nftRequirements.length > 0;
    const hasDiscordRequirements = accessRequirements.discordRoles && 
                                  accessRequirements.discordRoles.length > 0;

    // If no requirements, deny access (shouldn't happen for non-public communities)
    if (!hasNFTRequirements && !hasDiscordRequirements) {
      return {
        hasAccess: false,
        reason: 'No access requirements configured',
        errorCode: 'NO_REQUIREMENTS',
        validationResults
      };
    }

    // Validate NFT requirements
    if (hasNFTRequirements) {
      validationResults.nftValidation = await this.validateNFTRequirements(
        accessRequirements.nftRequirements,
        userId
      );
    }

    // Validate Discord role requirements
    if (hasDiscordRequirements) {
      validationResults.discordValidation = await this.validateDiscordRequirements(
        accessRequirements.discordRoles,
        userId
      );
    }

    // Apply logic (AND/OR)
    const requirementLogic = accessRequirements.requirementLogic || 'AND';
    
    if (requirementLogic === 'OR') {
      // OR logic: user needs to meet at least one requirement type
      const nftValid = !hasNFTRequirements || validationResults.nftValidation?.isValid;
      const discordValid = !hasDiscordRequirements || validationResults.discordValidation?.isValid;
      
      if (nftValid || discordValid) {
        return {
          hasAccess: true,
          reason: 'At least one requirement met (OR logic)',
          requirementLogic: 'OR',
          validationResults
        };
      } else {
        return this.generateAccessDenialMessage(
          validationResults, 
          'OR', 
          hasNFTRequirements, 
          hasDiscordRequirements
        );
      }
    } else {
      // AND logic: user needs to meet all requirement types (default)
      const nftValid = !hasNFTRequirements || validationResults.nftValidation?.isValid;
      const discordValid = !hasDiscordRequirements || validationResults.discordValidation?.isValid;
      
      if (nftValid && discordValid) {
        return {
          hasAccess: true,
          reason: 'All requirements met (AND logic)',
          requirementLogic: 'AND',
          validationResults
        };
      } else {
        return this.generateAccessDenialMessage(
          validationResults, 
          'AND', 
          hasNFTRequirements, 
          hasDiscordRequirements
        );
      }
    }
  }

  /**
   * Validate NFT requirements with multi-wallet scanning and specific token ID support
   * @param {Array} nftRequirements - Array of NFT requirements
   * @param {string} userId - User ID for wallet lookup
   * @returns {Promise<Object>} Validation result
   */
  async validateNFTRequirements(nftRequirements, userId) {
    try {
      const validationResults = [];

      // Get all user wallets from database
      const userWallets = await WalletAddress.findUserWallets(userId);
      
      if (userWallets.length === 0) {
        return {
          isValid: false,
          error: 'No wallets connected to user account',
          details: []
        };
      }

      for (const requirement of nftRequirements) {
        const { 
          contractAddress, 
          chainId, 
          minTokens = 1, 
          specificTokenIds = [],
          requireAllTokenIds = false 
        } = requirement;
        
        // Get user's wallets for this chain
        const chainWallets = userWallets.filter(wallet => wallet.chainId === chainId);
        
        if (chainWallets.length === 0) {
          validationResults.push({
            contractAddress,
            chainId,
            isValid: false,
            reason: 'No wallet connected for this chain',
            required: minTokens,
            found: 0,
            walletResults: []
          });
          continue;
        }

        // Check NFT ownership across all user wallets for this chain
        let totalTokens = 0;
        let foundTokenIds = [];
        const walletResults = [];

        for (const wallet of chainWallets) {
          try {
            let tokenCount = 0;
            let walletTokenIds = [];

            if (specificTokenIds.length > 0) {
              // Check for specific token IDs
              const ownedTokens = await this.checkSpecificTokenOwnership(
                wallet.address,
                contractAddress,
                chainId,
                specificTokenIds
              );
              
              tokenCount = ownedTokens.length;
              walletTokenIds = ownedTokens;
              foundTokenIds.push(...ownedTokens);
            } else {
              // Check general ownership count
              tokenCount = await this.checkNFTOwnership(
                wallet.address,
                contractAddress,
                chainId
              );
            }
            
            totalTokens += tokenCount;
            walletResults.push({
              walletAddress: wallet.address,
              tokenCount,
              tokenIds: walletTokenIds
            });
          } catch (error) {
            console.error(`Error checking NFT ownership for wallet ${wallet.address}:`, error);
            walletResults.push({
              walletAddress: wallet.address,
              tokenCount: 0,
              tokenIds: [],
              error: error.message
            });
          }
        }

        // Determine if requirement is met
        let isValid = false;
        
        if (specificTokenIds.length > 0) {
          if (requireAllTokenIds) {
            // Must own ALL specified token IDs
            isValid = specificTokenIds.every(tokenId => foundTokenIds.includes(tokenId));
          } else {
            // Must own at least minTokens of the specified token IDs
            isValid = foundTokenIds.length >= minTokens;
          }
        } else {
          // General token count requirement
          isValid = totalTokens >= minTokens;
        }

        validationResults.push({
          contractAddress,
          chainId,
          isValid,
          required: minTokens,
          found: totalTokens,
          specificTokenIds,
          foundTokenIds,
          requireAllTokenIds,
          walletResults
        });
      }

      // All requirements must be met
      const isValid = validationResults.every(result => result.isValid);

      return {
        isValid,
        details: validationResults,
        scannedWallets: userWallets.length,
        validationTime: new Date()
      };

    } catch (error) {
      console.error('Error validating NFT requirements:', error);
      return {
        isValid: false,
        error: error.message,
        details: []
      };
    }
  }

  /**
   * Validate Discord role requirements with real-time API verification
   * @param {Array} discordRequirements - Array of Discord role requirements
   * @param {string} userId - User ID for Discord account lookup
   * @returns {Promise<Object>} Validation result
   */
  async validateDiscordRequirements(discordRequirements, userId) {
    try {
      const validationResults = [];

      // Get user's linked Discord account
      const discordAccount = await DiscordAccount.findByUserId(userId);
      
      if (!discordAccount) {
        return {
          isValid: false,
          error: 'No Discord account linked to user',
          details: discordRequirements.map(req => ({
            serverId: req.serverId,
            roleId: req.roleId,
            roleName: req.roleName,
            isValid: false,
            reason: 'Discord account not linked'
          }))
        };
      }

      // Check if token needs refresh
      if (discordAccount.needsTokenRefresh()) {
        try {
          const newTokens = await discordIntegrationService.refreshAccessToken(
            discordAccount.refreshToken
          );
          await discordAccount.updateTokens(newTokens);
        } catch (refreshError) {
          console.error('Failed to refresh Discord token:', refreshError);
          return {
            isValid: false,
            error: 'Discord token expired and refresh failed',
            details: []
          };
        }
      }

      // Validate each Discord role requirement
      for (const requirement of discordRequirements) {
        const { serverId, roleId, roleName } = requirement;
        
        try {
          // Get user's roles in this server using Discord API
          const userRoles = await discordIntegrationService.getUserRolesInServer(
            discordAccount.discordUserId,
            serverId
          );
          
          const hasRole = userRoles.includes(roleId);
          
          // Get role information for better error messages
          let roleInfo = null;
          try {
            roleInfo = await discordIntegrationService.getRoleInfo(serverId, roleId);
          } catch (roleError) {
            console.warn(`Could not get role info for ${roleId}:`, roleError.message);
          }
          
          validationResults.push({
            serverId,
            roleId,
            roleName: roleInfo?.name || roleName,
            isValid: hasRole,
            userRoles,
            roleInfo,
            discordUsername: `${discordAccount.username}#${discordAccount.discriminator}`
          });
          
        } catch (serverError) {
          console.error(`Error checking roles for server ${serverId}:`, serverError);
          validationResults.push({
            serverId,
            roleId,
            roleName,
            isValid: false,
            reason: 'Failed to check server roles',
            error: serverError.message
          });
        }
      }

      // All requirements must be met
      const isValid = validationResults.every(result => result.isValid);

      return {
        isValid,
        details: validationResults,
        discordAccount: {
          username: discordAccount.username,
          discriminator: discordAccount.discriminator,
          verified: discordAccount.verified
        },
        validatedAt: new Date()
      };

    } catch (error) {
      console.error('Error validating Discord requirements:', error);
      return {
        isValid: false,
        error: error.message,
        details: []
      };
    }
  }

  /**
   * Check NFT ownership for a specific wallet and contract
   * @param {string} walletAddress - Wallet address to check
   * @param {string} contractAddress - NFT contract address
   * @param {string} chainId - Blockchain chain ID
   * @returns {Promise<number>} Number of tokens owned
   */
  async checkNFTOwnership(walletAddress, contractAddress, chainId) {
    try {
      // Use the existing gaming NFT service to check ownership
      const configuredContracts = [{
        contractAddress,
        chainId,
        contractName: 'Community Access NFT',
        multiplier: 1,
        bonusType: 'access'
      }];

      const nfts = await gamingNFTService.scanWalletForGamingNFTs(
        walletAddress, 
        chainId, 
        configuredContracts
      );

      // Return count of NFTs from this contract
      return nfts.filter(nft => 
        nft.contractAddress.toLowerCase() === contractAddress.toLowerCase()
      ).length;
      
    } catch (error) {
      console.error('Error checking NFT ownership:', error);
      throw error;
    }
  }

  /**
   * Check ownership of specific token IDs
   * @param {string} walletAddress - Wallet address to check
   * @param {string} contractAddress - NFT contract address
   * @param {string} chainId - Blockchain chain ID
   * @param {Array} tokenIds - Specific token IDs to check
   * @returns {Promise<Array>} Array of owned token IDs
   */
  async checkSpecificTokenOwnership(walletAddress, contractAddress, chainId, tokenIds) {
    try {
      const { createAlchemyInstance } = require('./alchemy/alchemy');
      const alchemy = createAlchemyInstance(chainId);
      
      if (!alchemy) {
        console.warn(`Unsupported chain ID for NFT scanning: ${chainId}`);
        return [];
      }

      const ownedTokenIds = [];

      // Check each specific token ID
      for (const tokenId of tokenIds) {
        try {
          const owners = await alchemy.nft.getOwnersForNft(contractAddress, tokenId);
          const isOwner = owners.owners.some(
            addr => addr.toLowerCase() === walletAddress.toLowerCase()
          );
          
          if (isOwner) {
            ownedTokenIds.push(tokenId);
          }
        } catch (tokenError) {
          console.error(`Error checking token ${tokenId} ownership:`, tokenError);
          // Continue checking other tokens
        }
      }

      return ownedTokenIds;
      
    } catch (error) {
      console.error('Error checking specific token ownership:', error);
      return [];
    }
  }

  /**
   * Get community access requirements summary
   * @param {string} communityId - Community ID
   * @returns {Promise<Object>} Access requirements summary
   */
  async getCommunityAccessRequirements(communityId) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      return {
        isPublic: community.accessRequirements.isPublic,
        nftRequirements: community.accessRequirements.nftRequirements || [],
        discordRoles: community.accessRequirements.discordRoles || [],
        hasRequirements: !community.accessRequirements.isPublic && (
          (community.accessRequirements.nftRequirements && community.accessRequirements.nftRequirements.length > 0) ||
          (community.accessRequirements.discordRoles && community.accessRequirements.discordRoles.length > 0)
        )
      };
    } catch (error) {
      console.error('Error getting community access requirements:', error);
      throw error;
    }
  }

  /**
   * Update community access requirements
   * @param {string} communityId - Community ID
   * @param {string} userId - User ID (must be community admin)
   * @param {Object} accessRequirements - New access requirements
   * @returns {Promise<Object>} Updated community
   */
  async updateCommunityAccessRequirements(communityId, userId, accessRequirements) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      // Check if user can manage this community
      const communityManagementService = require('./communityManagementService');
      const canManage = await communityManagementService.canUserManageCommunity(userId, communityId);
      
      if (!canManage) {
        throw new Error('Insufficient permissions to manage community access');
      }

      // Validate access requirements structure
      const validatedRequirements = this.validateAccessRequirementsStructure(accessRequirements);

      // Update community access requirements
      community.accessRequirements = {
        ...community.accessRequirements,
        ...validatedRequirements
      };

      await community.save();
      
      // Log the access requirement change
      await this.logAccessAttempt(userId, communityId, 'requirements_updated', {
        success: true,
        newRequirements: validatedRequirements,
        updatedBy: userId
      });

      return community;

    } catch (error) {
      console.error('Error updating community access requirements:', error);
      throw error;
    }
  }

  /**
   * Validate access requirements structure with AND/OR logic support
   * @param {Object} accessRequirements - Access requirements to validate
   * @returns {Object} Validated access requirements
   */
  validateAccessRequirementsStructure(accessRequirements) {
    const validated = {};

    if (accessRequirements.isPublic !== undefined) {
      validated.isPublic = Boolean(accessRequirements.isPublic);
    }

    // Support for requirement logic (AND/OR)
    if (accessRequirements.requirementLogic !== undefined) {
      validated.requirementLogic = ['AND', 'OR'].includes(accessRequirements.requirementLogic) 
        ? accessRequirements.requirementLogic 
        : 'AND'; // Default to AND
    }

    if (accessRequirements.nftRequirements) {
      validated.nftRequirements = accessRequirements.nftRequirements.map(req => ({
        contractAddress: req.contractAddress,
        chainId: req.chainId,
        minTokens: Math.max(1, parseInt(req.minTokens) || 1),
        specificTokenIds: req.specificTokenIds || [],
        requireAllTokenIds: Boolean(req.requireAllTokenIds),
        name: req.name || 'NFT Requirement' // For better error messages
      }));
    }

    if (accessRequirements.discordRoles) {
      validated.discordRoles = accessRequirements.discordRoles.map(role => ({
        serverId: role.serverId,
        roleId: role.roleId,
        roleName: role.roleName || 'Unknown Role',
        serverName: role.serverName || 'Discord Server' // For better error messages
      }));
    }

    return validated;
  }

  /**
   * Perform real-time NFT ownership validation for community access
   * @param {string} userId - User ID
   * @param {string} communityId - Community ID
   * @returns {Promise<Object>} Real-time validation result
   */
  async performRealTimeNFTValidation(userId, communityId) {
    try {
      const community = await Community.findById(communityId);
      if (!community || !community.accessRequirements.nftRequirements) {
        return {
          isValid: true,
          reason: 'No NFT requirements to validate'
        };
      }

      // Force fresh validation (bypass any caching)
      gamingNFTService.clearWalletCache('*'); // Clear all cache
      
      const validation = await this.validateNFTRequirements(
        community.accessRequirements.nftRequirements,
        userId
      );

      return {
        isValid: validation.isValid,
        details: validation.details,
        validatedAt: new Date(),
        communityId,
        userId
      };

    } catch (error) {
      console.error('Error performing real-time NFT validation:', error);
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  /**
   * Bulk validate NFT requirements for multiple users
   * @param {Array} userIds - Array of user IDs
   * @param {string} communityId - Community ID
   * @returns {Promise<Object>} Bulk validation results
   */
  async bulkValidateNFTRequirements(userIds, communityId) {
    try {
      const results = {};
      const community = await Community.findById(communityId);
      
      if (!community || !community.accessRequirements.nftRequirements) {
        return { error: 'Community not found or no NFT requirements' };
      }

      for (const userId of userIds) {
        try {
          const validation = await this.validateNFTRequirements(
            community.accessRequirements.nftRequirements,
            userId
          );
          
          results[userId] = {
            isValid: validation.isValid,
            details: validation.details
          };
        } catch (error) {
          results[userId] = {
            isValid: false,
            error: error.message
          };
        }
      }

      return {
        communityId,
        validatedAt: new Date(),
        results
      };

    } catch (error) {
      console.error('Error performing bulk NFT validation:', error);
      return {
        error: error.message
      };
    }
  }

  /**
   * Link Discord account to user
   * @param {string} userId - User ID
   * @param {string} authCode - Discord OAuth authorization code
   * @returns {Promise<Object>} Link result
   */
  async linkDiscordAccount(userId, authCode) {
    try {
      // Exchange code for tokens
      const tokenData = await discordIntegrationService.exchangeCodeForToken(authCode);
      
      // Get Discord user information
      const discordUser = await discordIntegrationService.getDiscordUser(tokenData.access_token);
      
      // Create or update Discord account link
      const discordAccount = await DiscordAccount.createOrUpdateLink(
        userId,
        discordUser,
        tokenData
      );

      return {
        success: true,
        discordAccount: {
          username: discordAccount.username,
          discriminator: discordAccount.discriminator,
          avatar: discordAccount.avatar,
          verified: discordAccount.verified
        },
        linkedAt: discordAccount.linkedAt
      };

    } catch (error) {
      console.error('Error linking Discord account:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Unlink Discord account from user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Unlink result
   */
  async unlinkDiscordAccount(userId) {
    try {
      const discordAccount = await DiscordAccount.findByUserId(userId);
      
      if (!discordAccount) {
        return {
          success: false,
          error: 'No Discord account linked'
        };
      }

      discordAccount.isActive = false;
      await discordAccount.save();

      // Clear Discord cache for this user
      discordIntegrationService.clearCache('user', discordAccount.discordUserId);

      return {
        success: true,
        message: 'Discord account unlinked successfully'
      };

    } catch (error) {
      console.error('Error unlinking Discord account:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get user's Discord account information
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Discord account info
   */
  async getUserDiscordInfo(userId) {
    try {
      const discordAccount = await DiscordAccount.findByUserId(userId);
      
      if (!discordAccount) {
        return {
          linked: false,
          account: null
        };
      }

      return {
        linked: true,
        account: {
          username: discordAccount.username,
          discriminator: discordAccount.discriminator,
          avatar: discordAccount.avatar,
          verified: discordAccount.verified,
          linkedAt: discordAccount.linkedAt,
          lastVerified: discordAccount.lastVerified
        }
      };

    } catch (error) {
      console.error('Error getting Discord info:', error);
      return {
        linked: false,
        error: error.message
      };
    }
  }

  /**
   * Perform real-time Discord role validation
   * @param {string} userId - User ID
   * @param {string} communityId - Community ID
   * @returns {Promise<Object>} Real-time validation result
   */
  async performRealTimeDiscordValidation(userId, communityId) {
    try {
      const community = await Community.findById(communityId);
      if (!community || !community.accessRequirements.discordRoles) {
        return {
          isValid: true,
          reason: 'No Discord requirements to validate'
        };
      }

      // Force fresh validation (clear cache)
      const discordAccount = await DiscordAccount.findByUserId(userId);
      if (discordAccount) {
        discordIntegrationService.clearCache('user', discordAccount.discordUserId);
      }
      
      const validation = await this.validateDiscordRequirements(
        community.accessRequirements.discordRoles,
        userId
      );

      return {
        isValid: validation.isValid,
        details: validation.details,
        validatedAt: new Date(),
        communityId,
        userId
      };

    } catch (error) {
      console.error('Error performing real-time Discord validation:', error);
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  /**
   * Generate detailed access denial message with clear feedback
   * @param {Object} validationResults - Validation results from requirements
   * @param {string} logic - 'AND' or 'OR' logic
   * @param {boolean} hasNFTRequirements - Whether NFT requirements exist
   * @param {boolean} hasDiscordRequirements - Whether Discord requirements exist
   * @returns {Object} Detailed denial message
   */
  generateAccessDenialMessage(validationResults, logic, hasNFTRequirements, hasDiscordRequirements) {
    const failedRequirements = [];
    const detailedFeedback = [];

    // Analyze NFT validation failures
    if (hasNFTRequirements && !validationResults.nftValidation?.isValid) {
      failedRequirements.push('NFT ownership');
      
      if (validationResults.nftValidation?.error) {
        detailedFeedback.push({
          type: 'NFT',
          issue: validationResults.nftValidation.error,
          solution: 'Please ensure you have connected wallets that own the required NFTs'
        });
      } else if (validationResults.nftValidation?.details) {
        validationResults.nftValidation.details.forEach(detail => {
          if (!detail.isValid) {
            detailedFeedback.push({
              type: 'NFT',
              contract: detail.contractAddress,
              required: detail.required,
              found: detail.found,
              issue: `Need ${detail.required} NFT(s) from contract ${detail.contractAddress}, but found ${detail.found}`,
              solution: 'Acquire the required NFTs or connect additional wallets that own them'
            });
          }
        });
      }
    }

    // Analyze Discord validation failures
    if (hasDiscordRequirements && !validationResults.discordValidation?.isValid) {
      failedRequirements.push('Discord roles');
      
      if (validationResults.discordValidation?.error) {
        detailedFeedback.push({
          type: 'Discord',
          issue: validationResults.discordValidation.error,
          solution: validationResults.discordValidation.error.includes('not linked') 
            ? 'Please link your Discord account to your Naffles profile'
            : 'Please check your Discord account connection and try again'
        });
      } else if (validationResults.discordValidation?.details) {
        validationResults.discordValidation.details.forEach(detail => {
          if (!detail.isValid) {
            detailedFeedback.push({
              type: 'Discord',
              server: detail.serverName || 'Discord Server',
              role: detail.roleName,
              issue: `Missing required role "${detail.roleName}" in ${detail.serverName || 'Discord server'}`,
              solution: 'Join the Discord server and obtain the required role, or contact server administrators'
            });
          }
        });
      }
    }

    // Generate main reason based on logic
    let reason;
    if (logic === 'OR') {
      reason = `Access denied: You must meet at least one of the following requirements: ${failedRequirements.join(' OR ')}`;
    } else {
      reason = `Access denied: You must meet all of the following requirements: ${failedRequirements.join(' AND ')}`;
    }

    return {
      hasAccess: false,
      reason,
      errorCode: 'REQUIREMENTS_NOT_MET',
      requirementLogic: logic,
      failedRequirements,
      detailedFeedback,
      validationResults,
      suggestions: this.generateAccessSuggestions(detailedFeedback)
    };
  }

  /**
   * Generate helpful suggestions for gaining access
   * @param {Array} detailedFeedback - Detailed feedback from validation
   * @returns {Array} Array of actionable suggestions
   */
  generateAccessSuggestions(detailedFeedback) {
    const suggestions = [];
    const hasNFTIssues = detailedFeedback.some(f => f.type === 'NFT');
    const hasDiscordIssues = detailedFeedback.some(f => f.type === 'Discord');

    if (hasNFTIssues) {
      suggestions.push({
        action: 'Connect additional wallets',
        description: 'Link more wallet addresses to your account that may contain the required NFTs'
      });
      suggestions.push({
        action: 'Acquire required NFTs',
        description: 'Purchase or obtain the NFTs specified in the requirements'
      });
    }

    if (hasDiscordIssues) {
      const needsLinking = detailedFeedback.some(f => 
        f.type === 'Discord' && f.issue.includes('not linked')
      );
      
      if (needsLinking) {
        suggestions.push({
          action: 'Link Discord account',
          description: 'Connect your Discord account to your Naffles profile in account settings'
        });
      } else {
        suggestions.push({
          action: 'Join Discord servers',
          description: 'Join the required Discord servers and obtain the necessary roles'
        });
        suggestions.push({
          action: 'Contact server admins',
          description: 'Reach out to Discord server administrators for role assignment'
        });
      }
    }

    return suggestions;
  }

  /**
   * Log community access attempts for monitoring and analytics
   * @param {string} userId - User ID
   * @param {string} communityId - Community ID
   * @param {string} eventType - Type of access event
   * @param {Object} details - Event details
   */
  async logAccessAttempt(userId, communityId, eventType, details) {
    try {
      // Create access log entry (you may want to create a dedicated model for this)
      const logEntry = {
        userId,
        communityId,
        eventType,
        details,
        timestamp: new Date(),
        ipAddress: details.ipAddress || null,
        userAgent: details.userAgent || null
      };

      // For now, just log to console - in production, save to database
      console.log('Community Access Log:', JSON.stringify(logEntry, null, 2));

      // TODO: Implement database logging
      // const CommunityAccessLog = require('../models/community/communityAccessLog');
      // await CommunityAccessLog.create(logEntry);

    } catch (error) {
      console.error('Error logging access attempt:', error);
      // Don't throw error as this shouldn't break the main flow
    }
  }

  /**
   * Get access validation results with detailed feedback
   * @param {string} userId - User ID
   * @param {string} communityId - Community ID
   * @returns {Promise<Object>} Detailed validation results
   */
  async getAccessValidationResults(userId, communityId) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        return {
          error: 'Community not found',
          errorCode: 'COMMUNITY_NOT_FOUND'
        };
      }

      const requirements = await this.getCommunityAccessRequirements(communityId);
      const validation = await this.validateCommunityAccess(userId, communityId);

      return {
        community: {
          id: communityId,
          name: community.name,
          isPublic: community.accessRequirements.isPublic
        },
        requirements,
        validation,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Error getting access validation results:', error);
      return {
        error: error.message,
        errorCode: 'VALIDATION_ERROR'
      };
    }
  }

  /**
   * Handle graceful validation failures
   * @param {string} userId - User ID
   * @param {string} communityId - Community ID
   * @param {Error} error - The error that occurred
   * @returns {Object} Graceful failure response
   */
  handleValidationFailure(userId, communityId, error) {
    const failureResponse = {
      hasAccess: false,
      reason: 'Validation system temporarily unavailable',
      errorCode: 'SYSTEM_ERROR',
      temporaryFailure: true,
      retryAfter: 300, // 5 minutes
      supportMessage: 'If this issue persists, please contact support with the error code above'
    };

    // Log the failure for monitoring
    this.logAccessAttempt(userId, communityId, 'system_failure', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date()
    });

    return failureResponse;
  }
}

module.exports = new CommunityAccessService();