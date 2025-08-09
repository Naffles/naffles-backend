const User = require('../models/user/user');
const WalletAddress = require('../models/user/walletAddress');
const WalletBalance = require('../models/user/walletBalance');
const ActionItem = require('../models/user/actionItem');
const UserHistory = require('../models/user/userHistory');
const PointsBalance = require('../models/points/pointsBalance');
const UserAchievement = require('../models/points/userAchievement');
const StakingPosition = require('../models/staking/stakingPosition');
const CommunityMember = require('../models/community/communityMember');
// Services will be loaded dynamically to avoid circular dependencies
const { getUserProfileImage } = require('../utils/image');
const { convertToNum } = require('../utils/convert');

class UserProfileService {
  /**
   * Get comprehensive user profile with all integrated systems
   */
  async getComprehensiveProfile(userId) {
    try {
      const user = await User.findById(userId)
        .populate('foundersKeys')
        .lean();

      if (!user) {
        throw new Error('User not found');
      }

      // Get all related data in parallel
      const [
        wallets,
        walletBalance,
        actionItems,
        pointsBalance,
        achievements,
        stakingPositions,
        communityMemberships,
        transactionHistory,
        activitySummary
      ] = await Promise.all([
        this.getUserWallets(userId),
        this.getUserWalletBalance(userId),
        this.getUserActionItems(userId),
        this.getUserPointsBalance(userId),
        this.getUserAchievements(userId),
        this.getUserStakingPositions(userId),
        this.getUserCommunityMemberships(userId),
        this.getUserTransactionHistory(userId, 10),
        this.getUserActivitySummary(userId)
      ]);

      // Calculate founders key benefits
      const foundersKeyBenefits = user.foundersKeys ? 
        user.foundersKeys.reduce((benefits, key) => {
          benefits.feeDiscount = Math.max(benefits.feeDiscount, key.benefits.feeDiscount);
          benefits.priorityAccess = benefits.priorityAccess || key.benefits.priorityAccess;
          benefits.openEntryTickets += key.benefits.openEntryTickets;
          return benefits;
        }, { feeDiscount: 0, priorityAccess: false, openEntryTickets: 0 }) :
        { feeDiscount: 0, priorityAccess: false, openEntryTickets: 0 };

      return {
        // Basic user info
        id: user._id,
        username: user.username,
        email: user.email,
        profileImage: user.profileImage,
        profileImageUrl: await getUserProfileImage(user.profileImage),
        role: user.role,
        tier: user.tier,
        isVerified: user.isVerified,
        isBlocked: user.isBlocked,
        
        // Profile data
        profileData: user.profileData || {},
        
        // Authentication methods
        authMethods: user.authMethods,
        
        // Timestamps
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        lastActiveAt: user.lastActiveAt,
        loginCount: user.loginCount,
        
        // Wallets and balances
        wallets,
        primaryWallet: user.primaryWallet,
        walletBalance,
        
        // Points and achievements
        pointsBalance: await convertToNum(pointsBalance?.balance || '0'),
        temporaryPoints: await convertToNum(user.temporaryPoints || '0'),
        achievements,
        
        // Founders keys and benefits
        foundersKeys: user.foundersKeys || [],
        foundersKeyBenefits,
        
        // Staking information
        stakingPositions,
        
        // Community memberships
        communityMemberships,
        
        // Action items and notifications
        actionItems,
        
        // Activity data
        transactionHistory,
        activitySummary,
        
        // Social connections
        socials: user.socials || {},
        
        // Geolocation
        geolocation: user.geolocation || {}
      };
    } catch (error) {
      console.error('Error getting comprehensive profile:', error);
      throw error;
    }
  }

  /**
   * Get user wallets with metadata
   */
  async getUserWallets(userId) {
    try {
      const wallets = await WalletAddress.find({ userRef: userId })
        .sort({ isPrimary: -1, connectedAt: -1 })
        .lean();

      return wallets.map(wallet => ({
        id: wallet._id,
        address: wallet.address,
        walletType: wallet.walletType,
        chainId: wallet.chainId,
        isPrimary: wallet.isPrimary,
        connectedAt: wallet.connectedAt,
        metadata: wallet.metadata || {}
      }));
    } catch (error) {
      console.error('Error getting user wallets:', error);
      throw error;
    }
  }

  /**
   * Get user wallet balance with conversion rates
   */
  async getUserWalletBalance(userId) {
    try {
      const walletBalance = await WalletBalance.findOne({ userRef: userId });
      if (!walletBalance) {
        return { balances: new Map(), fundingBalances: new Map() };
      }

      return {
        balances: walletBalance.balances,
        fundingBalances: walletBalance.fundingBalances,
        lastUpdated: walletBalance.updatedAt
      };
    } catch (error) {
      console.error('Error getting wallet balance:', error);
      throw error;
    }
  }

  /**
   * Get user action items (notifications)
   */
  async getUserActionItems(userId, limit = 20) {
    try {
      const actionItems = await ActionItem.getUserActiveItems(userId, limit);
      
      return actionItems.map(item => ({
        id: item._id,
        type: item.type,
        title: item.title,
        description: item.description,
        actionUrl: item.actionUrl,
        priority: item.priority,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        metadata: item.metadata
      }));
    } catch (error) {
      console.error('Error getting action items:', error);
      throw error;
    }
  }

  /**
   * Get user points balance
   */
  async getUserPointsBalance(userId) {
    try {
      return await PointsBalance.findOne({ userRef: userId });
    } catch (error) {
      console.error('Error getting points balance:', error);
      throw error;
    }
  }

  /**
   * Get user achievements
   */
  async getUserAchievements(userId, limit = 50) {
    try {
      const userAchievements = await UserAchievement.find({ userRef: userId })
        .populate('achievementRef')
        .sort({ unlockedAt: -1 })
        .limit(limit)
        .lean();

      return userAchievements.map(ua => ({
        id: ua._id,
        achievement: ua.achievementRef,
        unlockedAt: ua.unlockedAt,
        progress: ua.progress,
        isCompleted: ua.isCompleted
      }));
    } catch (error) {
      console.error('Error getting user achievements:', error);
      throw error;
    }
  }

  /**
   * Get user staking positions
   */
  async getUserStakingPositions(userId) {
    try {
      const positions = await StakingPosition.find({ 
        userRef: userId,
        isActive: true 
      })
      .populate('contractRef')
      .sort({ stakedAt: -1 })
      .lean();

      return positions.map(position => ({
        id: position._id,
        contract: position.contractRef,
        tokenId: position.tokenId,
        duration: position.duration,
        stakedAt: position.stakedAt,
        expiresAt: position.expiresAt,
        rewards: position.rewards,
        isActive: position.isActive
      }));
    } catch (error) {
      console.error('Error getting staking positions:', error);
      throw error;
    }
  }

  /**
   * Get user community memberships
   */
  async getUserCommunityMemberships(userId) {
    try {
      const memberships = await CommunityMember.find({ userRef: userId })
        .populate('communityRef')
        .sort({ joinedAt: -1 })
        .lean();

      return memberships.map(membership => ({
        id: membership._id,
        community: membership.communityRef,
        role: membership.role,
        joinedAt: membership.joinedAt,
        isActive: membership.isActive,
        permissions: membership.permissions
      }));
    } catch (error) {
      console.error('Error getting community memberships:', error);
      throw error;
    }
  }

  /**
   * Get user transaction history
   */
  async getUserTransactionHistory(userId, limit = 20) {
    try {
      const history = await UserHistory.find({ userRef: userId })
        .sort({ dateCreated: -1 })
        .limit(limit)
        .lean();

      return history.map(item => ({
        id: item._id,
        eventType: item.eventType,
        eventId: item.eventId,
        status: item.status,
        amount: item.amount,
        details: item.details,
        dateCreated: item.dateCreated
      }));
    } catch (error) {
      console.error('Error getting transaction history:', error);
      throw error;
    }
  }

  /**
   * Get user activity summary
   */
  async getUserActivitySummary(userId) {
    try {
      const [
        totalRafflesCreated,
        totalRafflesEntered,
        totalGamesPlayed,
        totalPointsEarned,
        totalAchievements,
        totalStakingRewards
      ] = await Promise.all([
        UserHistory.countDocuments({ 
          userRef: userId, 
          eventType: 'raffle',
          status: { $in: ['won', 'lost', 'live'] }
        }),
        UserHistory.countDocuments({ 
          userRef: userId, 
          eventType: 'raffle'
        }),
        UserHistory.countDocuments({ 
          userRef: userId, 
          eventType: 'game'
        }),
        this.getTotalPointsEarned(userId),
        UserAchievement.countDocuments({ 
          userRef: userId, 
          isCompleted: true 
        }),
        this.getTotalStakingRewards(userId)
      ]);

      return {
        totalRafflesCreated,
        totalRafflesEntered,
        totalGamesPlayed,
        totalPointsEarned,
        totalAchievements,
        totalStakingRewards,
        memberSince: await this.getMemberSince(userId),
        lastActivity: await this.getLastActivity(userId)
      };
    } catch (error) {
      console.error('Error getting activity summary:', error);
      throw error;
    }
  }

  /**
   * Update user profile data
   */
  async updateProfileData(userId, profileData) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { 
          $set: { 
            'profileData': {
              ...profileData,
              updatedAt: new Date()
            }
          }
        },
        { new: true, runValidators: true }
      );

      if (!user) {
        throw new Error('User not found');
      }

      return user.profileData;
    } catch (error) {
      console.error('Error updating profile data:', error);
      throw error;
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(userId, preferences) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { 
          $set: { 
            'profileData.preferences': {
              ...preferences,
              updatedAt: new Date()
            }
          }
        },
        { new: true, runValidators: true }
      );

      if (!user) {
        throw new Error('User not found');
      }

      return user.profileData.preferences;
    } catch (error) {
      console.error('Error updating user preferences:', error);
      throw error;
    }
  }

  /**
   * Set primary wallet
   */
  async setPrimaryWallet(userId, walletAddress) {
    try {
      // First, remove primary status from all wallets
      await WalletAddress.updateMany(
        { userRef: userId },
        { $set: { isPrimary: false } }
      );

      // Set the specified wallet as primary
      const wallet = await WalletAddress.findOneAndUpdate(
        { userRef: userId, address: walletAddress },
        { $set: { isPrimary: true } },
        { new: true }
      );

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Update user's primary wallet reference
      await User.findByIdAndUpdate(userId, {
        $set: {
          primaryWallet: {
            address: wallet.address,
            walletType: wallet.walletType,
            chainId: wallet.chainId
          }
        }
      });

      return wallet;
    } catch (error) {
      console.error('Error setting primary wallet:', error);
      throw error;
    }
  }

  /**
   * Update wallet metadata
   */
  async updateWalletMetadata(userId, walletAddress, metadata) {
    try {
      const wallet = await WalletAddress.findOneAndUpdate(
        { userRef: userId, address: walletAddress },
        { 
          $set: { 
            metadata: {
              ...metadata,
              updatedAt: new Date()
            }
          }
        },
        { new: true }
      );

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      return wallet;
    } catch (error) {
      console.error('Error updating wallet metadata:', error);
      throw error;
    }
  }

  /**
   * Get user notification preferences
   */
  async getNotificationPreferences(userId) {
    try {
      const user = await User.findById(userId).select('profileData.preferences.notifications');
      
      return user?.profileData?.preferences?.notifications || {
        email: true,
        push: true,
        marketing: false,
        gameResults: true,
        raffleUpdates: true,
        stakingRewards: true,
        communityActivity: true,
        achievementUnlocks: true
      };
    } catch (error) {
      console.error('Error getting notification preferences:', error);
      throw error;
    }
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(userId, preferences) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { 
          $set: { 
            'profileData.preferences.notifications': {
              ...preferences,
              updatedAt: new Date()
            }
          }
        },
        { new: true, runValidators: true }
      );

      if (!user) {
        throw new Error('User not found');
      }

      return user.profileData.preferences.notifications;
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      throw error;
    }
  }

  // Helper methods
  async getTotalPointsEarned(userId) {
    try {
      const pointsBalance = await PointsBalance.findOne({ userRef: userId });
      return pointsBalance ? await convertToNum(pointsBalance.totalEarned || '0') : 0;
    } catch (error) {
      return 0;
    }
  }

  async getTotalStakingRewards(userId) {
    try {
      const positions = await StakingPosition.find({ userRef: userId });
      return positions.reduce((total, position) => {
        return total + (position.rewards?.totalRewards || 0);
      }, 0);
    } catch (error) {
      return 0;
    }
  }

  async getMemberSince(userId) {
    try {
      const user = await User.findById(userId).select('createdAt');
      return user?.createdAt || new Date();
    } catch (error) {
      return new Date();
    }
  }

  async getLastActivity(userId) {
    try {
      const user = await User.findById(userId).select('lastActiveAt');
      return user?.lastActiveAt || new Date();
    } catch (error) {
      return new Date();
    }
  }
}

module.exports = new UserProfileService();