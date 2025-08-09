const User = require('../../models/user/user');
const WalletAddress = require('../../models/user/walletAddress');
const Raffle = require('../../models/raffle/raffle');
const GameHistory = require('../../models/game/gameHistory');
const GameAnalytics = require('../../models/analytics/gameAnalytics');
const { Fee } = require('../../models/analytics/fee');
const Deposit = require('../../models/transactions/deposit');
const Withdraw = require('../../models/transactions/withdraw');
const Community = require('../../models/community/community');
const CommunityPointsBalance = require('../../models/points/communityPointsBalance');
const AllowlistParticipation = require('../../models/allowlist/allowlistParticipation');
const Allowlist = require('../../models/allowlist/allowlist');
const SecurityLog = require('../../models/security/securityLog');
const vrfService = require('../../services/vrfService');
const sendResponse = require('../../utils/responseHandler');

/**
 * Comprehensive Admin Controller
 * Handles all administrative functions including analytics, user management, and system monitoring
 */

/**
 * Get platform dashboard metrics
 */
exports.getPlatformDashboard = async (req, res) => {
    try {
        const { timeRange = '30d' } = req.query;
        
        // Calculate date range
        const now = new Date();
        let startDate;
        switch (timeRange) {
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        // Get comprehensive platform metrics
        const [
            totalUsers,
            activeUsers,
            totalWallets,
            totalRaffles,
            activeRaffles,
            totalCommunities,
            activeCommunities,
            totalGamesPlayed,
            totalDeposits,
            totalWithdrawals,
            pendingWithdrawals,
            totalAllowlists,
            activeAllowlists,
            securityEvents
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ lastActive: { $gte: startDate } }),
            WalletAddress.countDocuments(),
            Raffle.countDocuments(),
            Raffle.countDocuments({ status: 'active' }),
            Community.countDocuments(),
            Community.countDocuments({ isActive: true }),
            GameHistory.countDocuments({ createdAt: { $gte: startDate } }),
            Deposit.countDocuments({ createdAt: { $gte: startDate } }),
            Withdraw.countDocuments({ createdAt: { $gte: startDate } }),
            Withdraw.countDocuments({ status: 'pending' }),
            Allowlist.countDocuments({ createdAt: { $gte: startDate } }),
            Allowlist.countDocuments({ status: 'active' }),
            SecurityLog.countDocuments({ 
                createdAt: { $gte: startDate },
                severity: { $in: ['medium', 'high', 'critical'] }
            })
        ]);

        // Get treasury balance (placeholder - would integrate with actual treasury service)
        const treasuryBalance = [
            { type: 'ETH', balance: '125.4567', usd: '245,678' },
            { type: 'BTC', balance: '5.2345', usd: '189,234' },
            { type: 'SOL', balance: '1,234.56', usd: '87,654' },
            { type: 'USDC', balance: '50,000', usd: '50,000' }
        ];

        // Get VRF status
        const vrfStatus = await vrfService.getVRFStatusDashboard();

        const dashboard = {
            overview: {
                totalUsers,
                activeUsers,
                totalWallets,
                totalRaffles,
                activeRaffles,
                totalCommunities,
                activeCommunities,
                totalGamesPlayed,
                securityEvents
            },
            financial: {
                totalDeposits,
                totalWithdrawals,
                pendingWithdrawals,
                treasuryBalance
            },
            allowlists: {
                totalAllowlists,
                activeAllowlists
            },
            vrf: vrfStatus,
            timeRange,
            lastUpdated: new Date()
        };

        res.json({
            success: true,
            data: dashboard
        });

    } catch (error) {
        console.error('Error getting platform dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get platform dashboard',
            details: error.message
        });
    }
};

/**
 * Get user analytics
 */
exports.getUserAnalytics = async (req, res) => {
    try {
        const { timeRange = '30d' } = req.query;
        
        // Calculate date range
        const now = new Date();
        let startDate;
        switch (timeRange) {
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const [
            totalUsers,
            newUsers,
            activeUsers,
            totalWallets,
            verifiedUsers,
            communityMembers
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ createdAt: { $gte: startDate } }),
            User.countDocuments({ lastActive: { $gte: startDate } }),
            WalletAddress.countDocuments(),
            User.countDocuments({ isVerified: true }),
            CommunityPointsBalance.distinct('userId').then(users => users.length)
        ]);

        const analyticsData = [
            { description: 'Total Users', value: totalUsers },
            { description: 'New Users', value: newUsers },
            { description: 'Active Users', value: activeUsers },
            { description: 'Total Wallets', value: totalWallets },
            { description: 'Verified Users', value: verifiedUsers },
            { description: 'Community Members', value: communityMembers }
        ];

        sendResponse(res, 200, 'User Analytics Data', analyticsData);

    } catch (error) {
        console.error('Failed to retrieve user analytics:', error);
        sendResponse(res, 500, 'Failed to retrieve user analytics', {
            error: error.message
        });
    }
};

/**
 * Get game analytics
 */
exports.getGameAnalytics = async (req, res) => {
    try {
        const { timeRange = '30d' } = req.query;
        
        // Calculate date range
        const now = new Date();
        let startDate;
        switch (timeRange) {
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        // Get game analytics
        const analytics = await GameAnalytics.findOne();
        const fee = await Fee.findOne();

        // Get recent game statistics
        const [
            totalGames,
            blackjackGames,
            coinTossGames,
            rpsGames,
            totalBetsVolume
        ] = await Promise.all([
            GameHistory.countDocuments({ createdAt: { $gte: startDate } }),
            GameHistory.countDocuments({ 
                gameType: 'blackjack',
                createdAt: { $gte: startDate }
            }),
            GameHistory.countDocuments({ 
                gameType: 'coinToss',
                createdAt: { $gte: startDate }
            }),
            GameHistory.countDocuments({ 
                gameType: 'rockPaperScissors',
                createdAt: { $gte: startDate }
            }),
            GameHistory.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: '$betAmount' } } }
            ])
        ]);

        const analyticsData = [
            { description: 'Total Games', value: totalGames },
            { description: 'Blackjack Games', value: blackjackGames },
            { description: 'Coin Toss Games', value: coinTossGames },
            { description: 'Rock Paper Scissors', value: rpsGames },
            { description: 'Total Bet Volume', value: totalBetsVolume[0]?.total || 0 }
        ];

        // Include fees earned if available
        if (fee && fee.balances) {
            for (const [key, value] of fee.balances.entries()) {
                if (value > 0) {
                    const convertedValue = Number(value) / Math.pow(10, 18);
                    const usdValue = convertedValue * 2000; // Placeholder conversion
                    analyticsData.push({
                        description: `Fees Earned (${key})`,
                        value: `${convertedValue.toFixed(4)} (${usdValue.toFixed(2)} USD)`
                    });
                }
            }
        }

        sendResponse(res, 200, 'Game Analytics Data', analyticsData);

    } catch (error) {
        console.error('Failed to retrieve game analytics:', error);
        sendResponse(res, 500, 'Failed to retrieve game analytics', {
            error: error.message
        });
    }
};

/**
 * Get raffle analytics
 */
exports.getRaffleAnalytics = async (req, res) => {
    try {
        const { timeRange = '30d' } = req.query;
        
        // Calculate date range
        const now = new Date();
        let startDate;
        switch (timeRange) {
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const [
            totalRaffles,
            activeRaffles,
            completedRaffles,
            totalTicketsSold,
            totalRevenue,
            nftRaffles,
            tokenRaffles
        ] = await Promise.all([
            Raffle.countDocuments({ createdAt: { $gte: startDate } }),
            Raffle.countDocuments({ status: 'active' }),
            Raffle.countDocuments({ 
                status: 'completed',
                createdAt: { $gte: startDate }
            }),
            Raffle.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: '$ticketsSold' } } }
            ]),
            Raffle.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: '$totalRevenue' } } }
            ]),
            Raffle.countDocuments({ 
                prizeType: 'nft',
                createdAt: { $gte: startDate }
            }),
            Raffle.countDocuments({ 
                prizeType: 'token',
                createdAt: { $gte: startDate }
            })
        ]);

        const analyticsData = [
            { description: 'Total Raffles', value: totalRaffles },
            { description: 'Active Raffles', value: activeRaffles },
            { description: 'Completed Raffles', value: completedRaffles },
            { description: 'Tickets Sold', value: totalTicketsSold[0]?.total || 0 },
            { description: 'Total Revenue', value: totalRevenue[0]?.total || 0 },
            { description: 'NFT Raffles', value: nftRaffles },
            { description: 'Token Raffles', value: tokenRaffles }
        ];

        sendResponse(res, 200, 'Raffle Analytics Data', analyticsData);

    } catch (error) {
        console.error('Failed to retrieve raffle analytics:', error);
        sendResponse(res, 500, 'Failed to retrieve raffle analytics', {
            error: error.message
        });
    }
};

/**
 * Get security monitoring dashboard
 */
exports.getSecurityDashboard = async (req, res) => {
    try {
        const { timeRange = '24h' } = req.query;
        
        // Calculate date range
        const now = new Date();
        let startDate;
        switch (timeRange) {
            case '1h':
                startDate = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case '24h':
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }

        const [
            totalEvents,
            criticalEvents,
            highEvents,
            mediumEvents,
            lowEvents,
            recentEvents
        ] = await Promise.all([
            SecurityLog.countDocuments({ createdAt: { $gte: startDate } }),
            SecurityLog.countDocuments({ 
                severity: 'critical',
                createdAt: { $gte: startDate }
            }),
            SecurityLog.countDocuments({ 
                severity: 'high',
                createdAt: { $gte: startDate }
            }),
            SecurityLog.countDocuments({ 
                severity: 'medium',
                createdAt: { $gte: startDate }
            }),
            SecurityLog.countDocuments({ 
                severity: 'low',
                createdAt: { $gte: startDate }
            }),
            SecurityLog.find({ createdAt: { $gte: startDate } })
                .sort({ createdAt: -1 })
                .limit(10)
                .select('eventType severity playerId details timestamp')
        ]);

        const securityDashboard = {
            summary: {
                totalEvents,
                criticalEvents,
                highEvents,
                mediumEvents,
                lowEvents
            },
            recentEvents: recentEvents.map(event => ({
                eventType: event.eventType,
                severity: event.severity,
                playerId: event.playerId,
                timestamp: event.timestamp,
                details: event.details
            })),
            timeRange,
            lastUpdated: new Date()
        };

        res.json({
            success: true,
            data: securityDashboard
        });

    } catch (error) {
        console.error('Error getting security dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get security dashboard',
            details: error.message
        });
    }
};

/**
 * Get system health status
 */
exports.getSystemHealth = async (req, res) => {
    try {
        // Check various system components
        const [
            dbStatus,
            vrfHealth,
            securityStatus
        ] = await Promise.all([
            checkDatabaseHealth(),
            vrfService.validateVRFHealth(),
            checkSecuritySystemHealth()
        ]);

        const systemHealth = {
            overall: 'healthy', // Will be calculated based on component status
            components: {
                database: dbStatus,
                vrf: vrfHealth,
                security: securityStatus
            },
            lastChecked: new Date()
        };

        // Determine overall health
        const unhealthyComponents = Object.values(systemHealth.components)
            .filter(component => component.status !== 'healthy');
        
        if (unhealthyComponents.length > 0) {
            systemHealth.overall = unhealthyComponents.some(c => c.status === 'critical') 
                ? 'critical' 
                : 'warning';
        }

        res.json({
            success: true,
            data: systemHealth
        });

    } catch (error) {
        console.error('Error getting system health:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get system health',
            details: error.message
        });
    }
};

/**
 * Helper function to check database health
 */
async function checkDatabaseHealth() {
    try {
        const mongoose = require('mongoose');
        const dbState = mongoose.connection.readyState;
        
        if (dbState === 1) {
            return {
                status: 'healthy',
                message: 'Database connection is active',
                details: {
                    readyState: dbState,
                    host: mongoose.connection.host,
                    name: mongoose.connection.name
                }
            };
        } else {
            return {
                status: 'critical',
                message: 'Database connection is not active',
                details: { readyState: dbState }
            };
        }
    } catch (error) {
        return {
            status: 'critical',
            message: 'Database health check failed',
            details: { error: error.message }
        };
    }
}

/**
 * Helper function to check security system health
 */
async function checkSecuritySystemHealth() {
    try {
        // Check recent critical security events
        const criticalEvents = await SecurityLog.countDocuments({
            severity: 'critical',
            createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
        });

        if (criticalEvents > 10) {
            return {
                status: 'critical',
                message: 'High number of critical security events',
                details: { criticalEvents }
            };
        } else if (criticalEvents > 5) {
            return {
                status: 'warning',
                message: 'Elevated security events detected',
                details: { criticalEvents }
            };
        } else {
            return {
                status: 'healthy',
                message: 'Security system operating normally',
                details: { criticalEvents }
            };
        }
    } catch (error) {
        return {
            status: 'critical',
            message: 'Security system health check failed',
            details: { error: error.message }
        };
    }
}

module.exports = {
    getPlatformDashboard,
    getUserAnalytics,
    getGameAnalytics,
    getRaffleAnalytics,
    getSecurityDashboard,
    getSystemHealth
};