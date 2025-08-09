const User = require('../../models/user/user');
const WalletAddress = require('../../models/user/walletAddress');
const TokenBalance = require('../../models/user/tokenBalance');
const GameHistory = require('../../models/game/gameHistory');
const CommunityPointsBalance = require('../../models/points/communityPointsBalance');
const PointsTransaction = require('../../models/points/pointsTransaction');
const SecurityLog = require('../../models/security/securityLog');
const { validationResult } = require('express-validator');
const sendResponse = require('../../utils/responseHandler');

/**
 * User Management Controller
 * Handles user administration, moderation, and account management
 */

/**
 * Get all users with pagination and filtering
 */
exports.getUsers = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            search = '', 
            status = 'all',
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build search query
        const searchQuery = {};
        if (search) {
            searchQuery.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { 'profile.displayName': { $regex: search, $options: 'i' } }
            ];
        }

        // Add status filter
        if (status !== 'all') {
            switch (status) {
                case 'active':
                    searchQuery.isActive = true;
                    break;
                case 'inactive':
                    searchQuery.isActive = false;
                    break;
                case 'banned':
                    searchQuery.isBanned = true;
                    break;
                case 'verified':
                    searchQuery.isVerified = true;
                    break;
            }
        }

        // Build sort object
        const sortObj = {};
        sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const users = await User.find(searchQuery)
            .populate('walletAddresses')
            .sort(sortObj)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .select('-password')
            .lean();

        const total = await User.countDocuments(searchQuery);

        // Enhance user data with additional information
        const enhancedUsers = await Promise.all(users.map(async (user) => {
            const [balances, gameCount, pointsBalance] = await Promise.all([
                TokenBalance.find({ userId: user._id }).lean(),
                GameHistory.countDocuments({ playerId: user._id }),
                CommunityPointsBalance.findOne({ userId: user._id }).lean()
            ]);

            return {
                ...user,
                balances: balances || [],
                totalGames: gameCount,
                pointsBalance: pointsBalance?.balance || 0
            };
        }));

        res.json({
            success: true,
            data: {
                users: enhancedUsers,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get users',
            details: error.message
        });
    }
};

/**
 * Get user details by ID
 */
exports.getUserById = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId)
            .populate('walletAddresses')
            .select('-password')
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get additional user data
        const [
            balances,
            gameHistory,
            pointsTransactions,
            securityEvents
        ] = await Promise.all([
            TokenBalance.find({ userId }).lean(),
            GameHistory.find({ playerId: userId })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean(),
            PointsTransaction.find({ userId })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean(),
            SecurityLog.find({ playerId: userId })
                .sort({ timestamp: -1 })
                .limit(5)
                .lean()
        ]);

        const userDetails = {
            ...user,
            balances: balances || [],
            recentGames: gameHistory || [],
            recentPointsTransactions: pointsTransactions || [],
            securityEvents: securityEvents || []
        };

        res.json({
            success: true,
            data: userDetails
        });

    } catch (error) {
        console.error('Error getting user details:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user details',
            details: error.message
        });
    }
};

/**
 * Update user profile
 */
exports.updateUser = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { userId } = req.params;
        const updates = req.body;

        // Remove sensitive fields that shouldn't be updated via admin
        delete updates.password;
        delete updates.walletAddresses;

        const user = await User.findByIdAndUpdate(
            userId,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Log admin action
        await SecurityLog.create({
            eventType: 'admin_user_update',
            severity: 'low',
            playerId: userId,
            details: {
                adminId: req.user._id,
                updatedFields: Object.keys(updates),
                timestamp: new Date()
            },
            timestamp: new Date(),
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            success: true,
            data: user,
            message: 'User updated successfully'
        });

    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user',
            details: error.message
        });
    }
};

/**
 * Ban/unban user
 */
exports.toggleUserBan = async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason = 'Admin action' } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const newBanStatus = !user.isBanned;
        
        await User.findByIdAndUpdate(userId, {
            isBanned: newBanStatus,
            banReason: newBanStatus ? reason : null,
            bannedAt: newBanStatus ? new Date() : null,
            bannedBy: newBanStatus ? req.user._id : null
        });

        // Log security event
        await SecurityLog.create({
            eventType: newBanStatus ? 'user_banned' : 'user_unbanned',
            severity: 'medium',
            playerId: userId,
            details: {
                adminId: req.user._id,
                reason,
                timestamp: new Date()
            },
            timestamp: new Date(),
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            success: true,
            message: `User ${newBanStatus ? 'banned' : 'unbanned'} successfully`,
            data: { isBanned: newBanStatus }
        });

    } catch (error) {
        console.error('Error toggling user ban:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to toggle user ban',
            details: error.message
        });
    }
};

/**
 * Update user balance
 */
exports.updateUserBalance = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { userId } = req.params;
        const { tokenType, amount, operation, reason } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        let balance = await TokenBalance.findOne({ userId, tokenType });
        
        if (!balance) {
            balance = new TokenBalance({
                userId,
                tokenType,
                balance: '0',
                chain: 'ethereum' // Default chain
            });
        }

        const currentBalance = parseFloat(balance.balance);
        let newBalance;

        switch (operation) {
            case 'add':
                newBalance = currentBalance + parseFloat(amount);
                break;
            case 'subtract':
                newBalance = Math.max(0, currentBalance - parseFloat(amount));
                break;
            case 'set':
                newBalance = parseFloat(amount);
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid operation'
                });
        }

        balance.balance = newBalance.toString();
        await balance.save();

        // Log admin action
        await SecurityLog.create({
            eventType: 'admin_balance_update',
            severity: 'medium',
            playerId: userId,
            details: {
                adminId: req.user._id,
                tokenType,
                operation,
                amount,
                previousBalance: currentBalance,
                newBalance,
                reason,
                timestamp: new Date()
            },
            timestamp: new Date(),
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            success: true,
            message: 'User balance updated successfully',
            data: {
                tokenType,
                previousBalance: currentBalance,
                newBalance,
                operation
            }
        });

    } catch (error) {
        console.error('Error updating user balance:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user balance',
            details: error.message
        });
    }
};

/**
 * Get user activity log
 */
exports.getUserActivityLog = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20, type = 'all' } = req.query;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Build query for different activity types
        const activities = [];

        // Get game history
        if (type === 'all' || type === 'games') {
            const games = await GameHistory.find({ playerId: userId })
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .lean();
            
            activities.push(...games.map(game => ({
                type: 'game',
                action: `Played ${game.gameType}`,
                details: {
                    gameType: game.gameType,
                    betAmount: game.betAmount,
                    result: game.result
                },
                timestamp: game.createdAt
            })));
        }

        // Get points transactions
        if (type === 'all' || type === 'points') {
            const pointsTransactions = await PointsTransaction.find({ userId })
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .lean();
            
            activities.push(...pointsTransactions.map(tx => ({
                type: 'points',
                action: `${tx.type} points`,
                details: {
                    amount: tx.amount,
                    reason: tx.reason,
                    communityId: tx.communityId
                },
                timestamp: tx.createdAt
            })));
        }

        // Get security events
        if (type === 'all' || type === 'security') {
            const securityEvents = await SecurityLog.find({ playerId: userId })
                .sort({ timestamp: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .lean();
            
            activities.push(...securityEvents.map(event => ({
                type: 'security',
                action: event.eventType,
                details: {
                    severity: event.severity,
                    details: event.details
                },
                timestamp: event.timestamp
            })));
        }

        // Sort all activities by timestamp
        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({
            success: true,
            data: {
                activities: activities.slice(0, limit),
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: activities.length
                }
            }
        });

    } catch (error) {
        console.error('Error getting user activity log:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user activity log',
            details: error.message
        });
    }
};

module.exports = {
    getUsers,
    getUserById,
    updateUser,
    toggleUserBan,
    updateUserBalance,
    getUserActivityLog
};