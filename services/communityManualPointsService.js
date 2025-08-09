const mongoose = require('mongoose');
const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const CommunityPointsBalance = require('../models/points/communityPointsBalance');
const CommunityPointsTransaction = require('../models/points/communityPointsTransaction');
const User = require('../models/user/user');
const DiscordAccount = require('../models/user/discordAccount');
const csv = require('csv-parser');
const { Readable } = require('stream');

class CommunityManualPointsService {
  constructor() {
    this.supportedIdentifierTypes = ['wallet_address', 'twitter_username', 'discord_username'];
  }

  /**
   * Generate sample CSV template with example data
   */
  generateSampleCSV() {
    const sampleData = [
      {
        type: 'wallet_address',
        type_value: '0x1234567890123456789012345678901234567890',
        points_value: 100
      },
      {
        type: 'wallet_address', 
        type_value: 'DsVmA5hWGAnP2FADTLJYstfXndxvGPgqzrpoC9kKz1Cy',
        points_value: 250
      },
      {
        type: 'twitter_username',
        type_value: '@example_user',
        points_value: 50
      },
      {
        type: 'twitter_username',
        type_value: 'another_user',
        points_value: 75
      },
      {
        type: 'discord_username',
        type_value: 'user#1234',
        points_value: 150
      },
      {
        type: 'discord_username',
        type_value: 'community_member#5678',
        points_value: 200
      }
    ];

    // Convert to CSV format
    const headers = 'Type,Type Value,Points Value\n';
    const rows = sampleData.map(row => 
      `${row.type},${row.type_value},${row.points_value}`
    ).join('\n');

    return headers + rows;
  }

  /**
   * Validate CSV format and data
   */
  async validateCSVData(csvData) {
    const errors = [];
    const validRows = [];

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const rowNumber = i + 2; // Account for header row

      // Validate required fields
      if (!row.type || !row.type_value || row.points_value === undefined) {
        errors.push({
          row: rowNumber,
          error: 'Missing required fields (Type, Type Value, or Points Value)',
          data: row
        });
        continue;
      }

      // Validate identifier type
      if (!this.supportedIdentifierTypes.includes(row.type.toLowerCase())) {
        errors.push({
          row: rowNumber,
          error: `Invalid identifier type. Must be one of: ${this.supportedIdentifierTypes.join(', ')}`,
          data: row
        });
        continue;
      }

      // Validate points value
      const pointsValue = parseInt(row.points_value);
      if (isNaN(pointsValue)) {
        errors.push({
          row: rowNumber,
          error: 'Points Value must be a valid number',
          data: row
        });
        continue;
      }

      // Validate identifier format
      const typeValue = row.type_value.trim();
      const validationError = this.validateIdentifierFormat(row.type.toLowerCase(), typeValue);
      if (validationError) {
        errors.push({
          row: rowNumber,
          error: validationError,
          data: row
        });
        continue;
      }

      validRows.push({
        type: row.type.toLowerCase(),
        typeValue: typeValue,
        pointsValue: pointsValue,
        originalRow: rowNumber
      });
    }

    return { validRows, errors };
  }

  /**
   * Validate identifier format based on type
   */
  validateIdentifierFormat(type, value) {
    switch (type) {
      case 'wallet_address':
        // Basic wallet address validation (Ethereum/Solana)
        if (value.startsWith('0x')) {
          // Ethereum-style address
          if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
            return 'Invalid Ethereum wallet address format';
          }
        } else {
          // Solana-style address (base58, typically 32-44 characters)
          if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
            return 'Invalid Solana wallet address format';
          }
        }
        break;
      
      case 'twitter_username':
        // Remove @ if present and validate
        const twitterUsername = value.replace(/^@/, '');
        if (!/^[A-Za-z0-9_]{1,15}$/.test(twitterUsername)) {
          return 'Invalid Twitter username format (1-15 characters, letters, numbers, underscore only)';
        }
        break;
      
      case 'discord_username':
        // Discord username with discriminator (username#1234) or new format
        if (value.includes('#')) {
          if (!/^.{1,32}#[0-9]{4}$/.test(value)) {
            return 'Invalid Discord username format (username#1234)';
          }
        } else {
          if (!/^[a-z0-9._]{2,32}$/.test(value)) {
            return 'Invalid Discord username format (2-32 characters, lowercase letters, numbers, dots, underscores)';
          }
        }
        break;
      
      default:
        return 'Unsupported identifier type';
    }

    return null;
  }

  /**
   * Parse CSV content from buffer or string
   */
  async parseCSV(csvContent) {
    return new Promise((resolve, reject) => {
      const results = [];
      const stream = Readable.from(csvContent);

      stream
        .pipe(csv({
          mapHeaders: ({ header }) => header.toLowerCase().replace(/\s+/g, '_')
        }))
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  /**
   * Find user by identifier
   */
  async findUserByIdentifier(type, value, communityId) {
    let user = null;

    switch (type) {
      case 'wallet_address':
        // Check primary wallet first
        user = await User.findOne({ 'primaryWallet.address': value });
        
        // If not found in primary wallet, could check wallet connections
        // This would require a separate wallet connections model
        break;
      
      case 'twitter_username':
        const twitterUsername = value.replace(/^@/, '');
        user = await User.findOne({ 'socials.twitter.username': twitterUsername });
        break;
      
      case 'discord_username':
        if (value.includes('#')) {
          // Old format with discriminator
          const [username, discriminator] = value.split('#');
          const discordAccount = await DiscordAccount.findOne({ 
            username: username,
            discriminator: discriminator,
            isActive: true
          }).populate('userId');
          user = discordAccount?.userId;
        } else {
          // New format without discriminator
          const discordAccount = await DiscordAccount.findOne({ 
            username: value,
            isActive: true
          }).populate('userId');
          user = discordAccount?.userId;
        }
        break;
    }

    if (!user) {
      return null;
    }

    // Check if user is a member of the community
    const membership = await CommunityMember.findOne({
      userId: user._id,
      communityId: communityId,
      isActive: true
    });

    if (!membership) {
      return null;
    }

    return user;
  }

  /**
   * Credit points to a single user
   */
  async creditPointsToUser(userId, communityId, pointsAmount, reason, adminId) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      // Get or create points balance
      const pointsBalance = await CommunityPointsBalance.initializeUserPoints(userId, communityId);
      const balanceBefore = pointsBalance.balance;

      // Create transaction record
      const transaction = new CommunityPointsTransaction({
        userId,
        communityId,
        type: 'admin_award',
        activity: 'manual_credit',
        amount: pointsAmount,
        balanceBefore,
        balanceAfter: balanceBefore + pointsAmount,
        multiplier: 1.0,
        baseAmount: pointsAmount,
        metadata: {
          adminId,
          reason,
          method: 'manual_credit'
        },
        description: reason || `Manual points credit by admin`,
        pointsName: community.pointsConfiguration.pointsName,
        isNafflesCommunity: community.isNafflesCommunity,
        adminId,
        isReversible: true
      });

      // Update balance
      pointsBalance.balance += pointsAmount;
      pointsBalance.totalEarned += pointsAmount;
      pointsBalance.lastActivity = new Date();
      await pointsBalance.updateTier();

      // Update community stats
      community.stats.totalPointsIssued += pointsAmount;

      // Save all records
      await Promise.all([
        transaction.save(),
        pointsBalance.save(),
        community.save()
      ]);

      return {
        success: true,
        pointsAwarded: pointsAmount,
        newBalance: pointsBalance.balance,
        transaction: transaction._id,
        user: {
          id: userId,
          username: (await User.findById(userId)).username
        }
      };
    } catch (error) {
      console.error('Error crediting points to user:', error);
      throw error;
    }
  }

  /**
   * Process bulk CSV points crediting
   */
  async processBulkPointsCrediting(communityId, csvData, adminId, reason = 'Bulk points credit') {
    try {
      // Validate community and admin permissions
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      // Check if admin can manage this community
      const canManage = await this.canUserManageCommunity(adminId, communityId);
      if (!canManage) {
        throw new Error('Insufficient permissions to credit points in this community');
      }

      // Parse and validate CSV data
      const parsedData = await this.parseCSV(csvData);
      const { validRows, errors: validationErrors } = await this.validateCSVData(parsedData);

      const results = {
        totalProcessed: validRows.length,
        successful: [],
        failed: [],
        validationErrors,
        summary: {
          totalPointsAwarded: 0,
          usersProcessed: 0,
          usersNotFound: 0,
          errors: 0
        }
      };

      // Process each valid row
      for (const row of validRows) {
        try {
          // Find user by identifier
          const user = await this.findUserByIdentifier(row.type, row.typeValue, communityId);
          
          if (!user) {
            results.failed.push({
              row: row.originalRow,
              identifier: `${row.type}: ${row.typeValue}`,
              points: row.pointsValue,
              error: 'User not found or not a member of this community'
            });
            results.summary.usersNotFound++;
            continue;
          }

          // Credit points to user
          const creditResult = await this.creditPointsToUser(
            user._id,
            communityId,
            row.pointsValue,
            reason,
            adminId
          );

          results.successful.push({
            row: row.originalRow,
            identifier: `${row.type}: ${row.typeValue}`,
            points: row.pointsValue,
            user: creditResult.user,
            newBalance: creditResult.newBalance,
            transactionId: creditResult.transaction
          });

          results.summary.totalPointsAwarded += row.pointsValue;
          results.summary.usersProcessed++;

        } catch (error) {
          results.failed.push({
            row: row.originalRow,
            identifier: `${row.type}: ${row.typeValue}`,
            points: row.pointsValue,
            error: error.message
          });
          results.summary.errors++;
        }
      }

      // Create audit log entry
      await this.createAuditLogEntry(adminId, communityId, 'bulk_points_credit', {
        totalRows: parsedData.length,
        validRows: validRows.length,
        successful: results.successful.length,
        failed: results.failed.length,
        totalPointsAwarded: results.summary.totalPointsAwarded,
        reason
      });

      return results;
    } catch (error) {
      console.error('Error processing bulk points crediting:', error);
      throw error;
    }
  }

  /**
   * Credit points to individual user by identifier
   */
  async creditPointsToUserByIdentifier(communityId, identifierType, identifierValue, pointsAmount, reason, adminId) {
    try {
      // Validate community and admin permissions
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      const canManage = await this.canUserManageCommunity(adminId, communityId);
      if (!canManage) {
        throw new Error('Insufficient permissions to credit points in this community');
      }

      // Validate identifier format
      const validationError = this.validateIdentifierFormat(identifierType, identifierValue);
      if (validationError) {
        throw new Error(validationError);
      }

      // Find user
      const user = await this.findUserByIdentifier(identifierType, identifierValue, communityId);
      if (!user) {
        throw new Error('User not found or not a member of this community');
      }

      // Credit points
      const result = await this.creditPointsToUser(user._id, communityId, pointsAmount, reason, adminId);

      // Create audit log entry
      await this.createAuditLogEntry(adminId, communityId, 'individual_points_credit', {
        targetUserId: user._id,
        targetUsername: user.username,
        identifierType,
        identifierValue,
        pointsAmount,
        reason
      });

      return result;
    } catch (error) {
      console.error('Error crediting points to user by identifier:', error);
      throw error;
    }
  }

  /**
   * Get audit history for manual points crediting
   */
  async getAuditHistory(communityId, adminId, options = {}) {
    try {
      const canManage = await this.canUserManageCommunity(adminId, communityId);
      if (!canManage) {
        throw new Error('Insufficient permissions to view audit history');
      }

      const page = options.page || 1;
      const limit = options.limit || 20;
      const skip = (page - 1) * limit;

      // Query manual credit transactions
      const query = {
        communityId,
        type: 'admin_award',
        activity: 'manual_credit'
      };

      if (options.dateFrom) {
        query.createdAt = { $gte: new Date(options.dateFrom) };
      }
      if (options.dateTo) {
        query.createdAt = query.createdAt || {};
        query.createdAt.$lte = new Date(options.dateTo);
      }
      if (options.adminId) {
        query.adminId = options.adminId;
      }

      const transactions = await CommunityPointsTransaction.find(query)
        .populate('userId', 'username')
        .populate('adminId', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await CommunityPointsTransaction.countDocuments(query);

      return {
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error getting audit history:', error);
      throw error;
    }
  }

  /**
   * Check if user can manage community (owner, admin, or Naffles admin)
   */
  async canUserManageCommunity(userId, communityId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return false;
      }

      // Naffles admins can manage any community
      if (user.role === 'admin' || user.role === 'super_admin') {
        return true;
      }

      // Check if user is community owner or admin
      const community = await Community.findById(communityId);
      if (!community) {
        return false;
      }

      if (community.creatorId.toString() === userId.toString()) {
        return true;
      }

      // Check if user is community admin
      const membership = await CommunityMember.findOne({
        userId,
        communityId,
        role: { $in: ['admin', 'moderator'] },
        isActive: true
      });

      return !!membership;
    } catch (error) {
      console.error('Error checking community management permissions:', error);
      return false;
    }
  }

  /**
   * Create audit log entry for manual points operations
   */
  async createAuditLogEntry(adminId, communityId, action, metadata) {
    try {
      // This could be expanded to use a dedicated audit log model
      // For now, we'll use the transaction metadata to track audit information
      console.log('Audit log entry created:', {
        adminId,
        communityId,
        action,
        metadata,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error creating audit log entry:', error);
    }
  }

  /**
   * Get community points crediting statistics
   */
  async getCommunityPointsCreditingStats(communityId, adminId, timeframe = '30d') {
    try {
      const canManage = await this.canUserManageCommunity(adminId, communityId);
      if (!canManage) {
        throw new Error('Insufficient permissions to view statistics');
      }

      const startDate = new Date();
      switch (timeframe) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 30);
      }

      const stats = await CommunityPointsTransaction.aggregate([
        {
          $match: {
            communityId: new mongoose.Types.ObjectId(communityId),
            type: 'admin_award',
            activity: 'manual_credit',
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            totalCredits: { $sum: 1 },
            totalPointsAwarded: { $sum: '$amount' },
            uniqueUsers: { $addToSet: '$userId' },
            uniqueAdmins: { $addToSet: '$adminId' }
          }
        },
        {
          $project: {
            totalCredits: 1,
            totalPointsAwarded: 1,
            uniqueUsersCount: { $size: '$uniqueUsers' },
            uniqueAdminsCount: { $size: '$uniqueAdmins' }
          }
        }
      ]);

      return stats[0] || {
        totalCredits: 0,
        totalPointsAwarded: 0,
        uniqueUsersCount: 0,
        uniqueAdminsCount: 0
      };
    } catch (error) {
      console.error('Error getting community points crediting stats:', error);
      throw error;
    }
  }
}

module.exports = new CommunityManualPointsService();