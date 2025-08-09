const Raffle = require('../../models/raffle/raffle');
const User = require('../../models/user/user');
const SecurityLog = require('../../models/security/securityLog');
const vrfService = require('../../services/vrfService');
const { validationResult } = require('express-validator');

/**
 * Raffle Management Controller
 * Handles raffle administration, monitoring, and management
 */

/**
 * Get all raffles with pagination and filtering
 */
exports.getRaffles = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            status = 'all',
            prizeType = 'all',
            sortBy = 'createdAt',
            sortOrder = 'desc',
            search = ''
        } = req.query;

        // Build search query
        const searchQuery = {};
        
        if (search) {
            searchQuery.$or = [
                { eventId: { $regex: search, $options: 'i' } },
                { 'prize.name': { $regex: search, $options: 'i' } },
                { 'creator.username': { $regex: search, $options: 'i' } }
            ];
        }

        // Add status filter
        if (status !== 'all') {
            searchQuery.status = status;
        }

        // Add prize type filter
        if (prizeType !== 'all') {
            searchQuery.prizeType = prizeType;
        }

        // Build sort object
        const sortObj = {};
        sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const raffles = await Raffle.find(searchQuery)
            .populate('creatorId', 'username email profile')
            .populate('winnerId', 'username email profile')
            .sort(sortObj)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const total = await Raffle.countDocuments(searchQuery);

        // Enhance raffle data
        const enhancedRaffles = raffles.map(raffle => ({
            ...raffle,
            ticketsSoldPercentage: raffle.maxTickets ? 
                (raffle.ticketsSold / raffle.maxTickets * 100).toFixed(2) : 
                null,
            timeRemaining: raffle.endTime ? 
                Math.max(0, new Date(raffle.endTime) - new Date()) : 
                null,
            totalRevenue: raffle.ticketPrice * raffle.ticketsSold
        }));

        res.json({
            success: true,
            data: {
                raffles: enhancedRaffles,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Error getting raffles:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get raffles',
            details: error.message
        });
    }
};

/**
 * Get raffle details by ID
 */
exports.getRaffleById = async (req, res) => {
    try {
        const { raffleId } = req.params;

        const raffle = await Raffle.findById(raffleId)
            .populate('creatorId', 'username email profile walletAddresses')
            .populate('winnerId', 'username email profile walletAddresses')
            .lean();

        if (!raffle) {
            return res.status(404).json({
                success: false,
                error: 'Raffle not found'
            });
        }

        // Get additional raffle data
        const participants = await Raffle.aggregate([
            { $match: { _id: raffle._id } },
            { $unwind: '$tickets' },
            { $group: { 
                _id: '$tickets.purchaserId',
                ticketCount: { $sum: 1 },
                totalSpent: { $sum: '$ticketPrice' }
            }},
            { $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'user'
            }},
            { $unwind: '$user' },
            { $project: {
                userId: '$_id',
                username: '$user.username',
                email: '$user.email',
                ticketCount: 1,
                totalSpent: 1
            }}
        ]);

        const raffleDetails = {
            ...raffle,
            participants,
            participantCount: participants.length,
            totalRevenue: raffle.ticketPrice * raffle.ticketsSold,
            ticketsSoldPercentage: raffle.maxTickets ? 
                (raffle.ticketsSold / raffle.maxTickets * 100).toFixed(2) : 
                null,
            timeRemaining: raffle.endTime ? 
                Math.max(0, new Date(raffle.endTime) - new Date()) : 
                null
        };

        res.json({
            success: true,
            data: raffleDetails
        });

    } catch (error) {
        console.error('Error getting raffle details:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get raffle details',
            details: error.message
        });
    }
};

/**
 * Cancel raffle (admin action)
 */
exports.cancelRaffle = async (req, res) => {
    try {
        const { raffleId } = req.params;
        const { reason = 'Admin cancellation' } = req.body;

        const raffle = await Raffle.findById(raffleId);
        if (!raffle) {
            return res.status(404).json({
                success: false,
                error: 'Raffle not found'
            });
        }

        if (raffle.status === 'completed' || raffle.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                error: 'Cannot cancel completed or already cancelled raffle'
            });
        }

        // Update raffle status
        await Raffle.findByIdAndUpdate(raffleId, {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelledBy: req.user._id,
            cancellationReason: reason
        });

        // TODO: Process refunds for all participants
        // This would integrate with the fund management service

        // Log admin action
        await SecurityLog.create({
            eventType: 'admin_raffle_cancelled',
            severity: 'medium',
            playerId: raffle.creatorId,
            details: {
                adminId: req.user._id,
                raffleId,
                reason,
                ticketsSold: raffle.ticketsSold,
                timestamp: new Date()
            },
            timestamp: new Date(),
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            success: true,
            message: 'Raffle cancelled successfully',
            data: { raffleId, reason }
        });

    } catch (error) {
        console.error('Error cancelling raffle:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel raffle',
            details: error.message
        });
    }
};

/**
 * Force raffle draw (admin emergency action)
 */
exports.forceRaffleDraw = async (req, res) => {
    try {
        const { raffleId } = req.params;
        const { reason = 'Admin forced draw' } = req.body;

        const raffle = await Raffle.findById(raffleId);
        if (!raffle) {
            return res.status(404).json({
                success: false,
                error: 'Raffle not found'
            });
        }

        if (raffle.status !== 'active') {
            return res.status(400).json({
                success: false,
                error: 'Can only force draw active raffles'
            });
        }

        if (raffle.ticketsSold === 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot draw raffle with no tickets sold'
            });
        }

        // Force VRF request or use failsafe
        let vrfResult;
        try {
            vrfResult = await vrfService.requestCrossChainVRFRandomness(
                raffleId, 
                raffle.ticketsSold,
                { sourceChain: 'ethereum' }
            );
        } catch (vrfError) {
            console.log('VRF failed, using failsafe:', vrfError);
            vrfResult = await vrfService.useFailsafeRandomness(raffleId, raffle.ticketsSold);
        }

        // Log admin action
        await SecurityLog.create({
            eventType: 'admin_raffle_forced_draw',
            severity: 'high',
            playerId: raffle.creatorId,
            details: {
                adminId: req.user._id,
                raffleId,
                reason,
                ticketsSold: raffle.ticketsSold,
                vrfUsed: !vrfResult.failsafeUsed,
                timestamp: new Date()
            },
            timestamp: new Date(),
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            success: true,
            message: 'Raffle draw forced successfully',
            data: {
                raffleId,
                vrfResult,
                reason
            }
        });

    } catch (error) {
        console.error('Error forcing raffle draw:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to force raffle draw',
            details: error.message
        });
    }
};

/**
 * Get raffle statistics
 */
exports.getRaffleStatistics = async (req, res) => {
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
            cancelledRaffles,
            totalRevenue,
            averageTicketPrice,
            topCreators,
            prizeTypeDistribution
        ] = await Promise.all([
            Raffle.countDocuments({ createdAt: { $gte: startDate } }),
            Raffle.countDocuments({ status: 'active' }),
            Raffle.countDocuments({ 
                status: 'completed',
                createdAt: { $gte: startDate }
            }),
            Raffle.countDocuments({ 
                status: 'cancelled',
                createdAt: { $gte: startDate }
            }),
            Raffle.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { 
                    _id: null, 
                    total: { $sum: { $multiply: ['$ticketPrice', '$ticketsSold'] } }
                }}
            ]),
            Raffle.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { 
                    _id: null, 
                    average: { $avg: '$ticketPrice' }
                }}
            ]),
            Raffle.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { 
                    _id: '$creatorId',
                    raffleCount: { $sum: 1 },
                    totalRevenue: { $sum: { $multiply: ['$ticketPrice', '$ticketsSold'] } }
                }},
                { $sort: { raffleCount: -1 } },
                { $limit: 10 },
                { $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'creator'
                }},
                { $unwind: '$creator' },
                { $project: {
                    username: '$creator.username',
                    raffleCount: 1,
                    totalRevenue: 1
                }}
            ]),
            Raffle.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { 
                    _id: '$prizeType',
                    count: { $sum: 1 }
                }}
            ])
        ]);

        const statistics = {
            overview: {
                totalRaffles,
                activeRaffles,
                completedRaffles,
                cancelledRaffles,
                totalRevenue: totalRevenue[0]?.total || 0,
                averageTicketPrice: averageTicketPrice[0]?.average || 0
            },
            topCreators,
            prizeTypeDistribution,
            timeRange,
            generatedAt: new Date()
        };

        res.json({
            success: true,
            data: statistics
        });

    } catch (error) {
        console.error('Error getting raffle statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get raffle statistics',
            details: error.message
        });
    }
};

/**
 * Update raffle settings (admin only)
 */
exports.updateRaffleSettings = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { raffleId } = req.params;
        const updates = req.body;

        // Only allow certain fields to be updated
        const allowedUpdates = ['endTime', 'maxTickets', 'description'];
        const filteredUpdates = {};
        
        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                filteredUpdates[key] = updates[key];
            }
        });

        const raffle = await Raffle.findByIdAndUpdate(
            raffleId,
            { $set: filteredUpdates },
            { new: true, runValidators: true }
        );

        if (!raffle) {
            return res.status(404).json({
                success: false,
                error: 'Raffle not found'
            });
        }

        // Log admin action
        await SecurityLog.create({
            eventType: 'admin_raffle_updated',
            severity: 'low',
            playerId: raffle.creatorId,
            details: {
                adminId: req.user._id,
                raffleId,
                updatedFields: Object.keys(filteredUpdates),
                timestamp: new Date()
            },
            timestamp: new Date(),
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            success: true,
            data: raffle,
            message: 'Raffle updated successfully'
        });

    } catch (error) {
        console.error('Error updating raffle:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update raffle',
            details: error.message
        });
    }
};

module.exports = {
    getRaffles,
    getRaffleById,
    cancelRaffle,
    forceRaffleDraw,
    getRaffleStatistics,
    updateRaffleSettings
};