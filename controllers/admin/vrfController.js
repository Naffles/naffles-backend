const vrfService = require('../../services/vrfService');
const { validationResult } = require('express-validator');

/**
 * Admin VRF Controller
 * Handles VRF configuration and monitoring for admin interface
 */

/**
 * Get VRF configuration
 */
const getVRFConfiguration = async (req, res) => {
    try {
        const config = await vrfService.getVRFConfiguration();
        
        res.json({
            success: true,
            data: config
        });
        
    } catch (error) {
        console.error('Error getting VRF configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get VRF configuration',
            details: error.message
        });
    }
};

/**
 * Update VRF configuration
 */
const updateVRFConfiguration = async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        
        const {
            coordinatorAddress,
            subscriptionId,
            keyHash,
            callbackGasLimit,
            requestConfirmations
        } = req.body;
        
        // Validate admin permissions
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        
        const result = await vrfService.updateVRFConfiguration({
            coordinatorAddress,
            subscriptionId,
            keyHash,
            callbackGasLimit,
            requestConfirmations
        });
        
        res.json({
            success: true,
            data: result,
            message: 'VRF configuration updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating VRF configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update VRF configuration',
            details: error.message
        });
    }
};

/**
 * Get VRF status dashboard
 */
const getVRFStatusDashboard = async (req, res) => {
    try {
        const dashboard = await vrfService.getVRFStatusDashboard();
        
        res.json({
            success: true,
            data: dashboard
        });
        
    } catch (error) {
        console.error('Error getting VRF status dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get VRF status dashboard',
            details: error.message
        });
    }
};

/**
 * Get LINK token balance
 */
const getLinkBalance = async (req, res) => {
    try {
        const balance = await vrfService.getLinkBalance();
        
        res.json({
            success: true,
            data: balance
        });
        
    } catch (error) {
        console.error('Error getting LINK balance:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get LINK balance',
            details: error.message
        });
    }
};

/**
 * Monitor LINK balance with threshold
 */
const monitorLinkBalance = async (req, res) => {
    try {
        const { threshold = 10 } = req.query;
        const status = await vrfService.monitorLinkBalance(parseFloat(threshold));
        
        res.json({
            success: true,
            data: status
        });
        
    } catch (error) {
        console.error('Error monitoring LINK balance:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to monitor LINK balance',
            details: error.message
        });
    }
};

/**
 * Validate VRF system health
 */
const validateVRFHealth = async (req, res) => {
    try {
        const health = await vrfService.validateVRFHealth();
        
        res.json({
            success: true,
            data: health
        });
        
    } catch (error) {
        console.error('Error validating VRF health:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to validate VRF health',
            details: error.message
        });
    }
};

/**
 * Get VRF request history
 */
const getVRFRequestHistory = async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        
        const Raffle = require('../../models/raffle/raffle');
        
        const query = {};
        if (status) {
            query['vrf.status'] = status;
        }
        
        const requests = await Raffle.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .select('eventId vrf createdAt updatedAt')
            .lean();
        
        const total = await Raffle.countDocuments(query);
        
        res.json({
            success: true,
            data: {
                requests: requests.map(req => ({
                    eventId: req.eventId,
                    status: req.vrf.status,
                    transactionHash: req.vrf.transactionHash,
                    polygonTxHash: req.vrf.polygonTxHash,
                    winningTicketNumber: req.vrf.winningTicketNumber,
                    failsafeUsed: req.vrf.failsafeUsed,
                    sourceChain: req.vrf.sourceChain,
                    createdAt: req.createdAt,
                    updatedAt: req.updatedAt
                })),
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('Error getting VRF request history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get VRF request history',
            details: error.message
        });
    }
};

/**
 * Manually trigger VRF request (admin emergency function)
 */
const manualVRFRequest = async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        
        // Validate admin permissions
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        
        const { raffleId, sourceChain = 'ethereum' } = req.body;
        
        const Raffle = require('../../models/raffle/raffle');
        const raffle = await Raffle.findById(raffleId);
        
        if (!raffle) {
            return res.status(404).json({
                success: false,
                error: 'Raffle not found'
            });
        }
        
        const result = await vrfService.requestCrossChainVRFRandomness(
            raffleId, 
            raffle.ticketsSold, 
            { sourceChain }
        );
        
        res.json({
            success: true,
            data: result,
            message: 'Manual VRF request initiated'
        });
        
    } catch (error) {
        console.error('Error with manual VRF request:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate manual VRF request',
            details: error.message
        });
    }
};

/**
 * Force failsafe for stuck VRF request (admin emergency function)
 */
const forceFailsafe = async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        
        // Validate admin permissions
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        
        const { raffleId } = req.body;
        
        const Raffle = require('../../models/raffle/raffle');
        const raffle = await Raffle.findById(raffleId);
        
        if (!raffle) {
            return res.status(404).json({
                success: false,
                error: 'Raffle not found'
            });
        }
        
        if (raffle.vrf.status === 'Fulfilled') {
            return res.status(400).json({
                success: false,
                error: 'Raffle VRF already fulfilled'
            });
        }
        
        const result = await vrfService.useFailsafeRandomness(raffleId, raffle.ticketsSold);
        
        res.json({
            success: true,
            data: result,
            message: 'Failsafe randomness applied successfully'
        });
        
    } catch (error) {
        console.error('Error forcing failsafe:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to force failsafe',
            details: error.message
        });
    }
};

module.exports = {
    getVRFConfiguration,
    updateVRFConfiguration,
    getVRFStatusDashboard,
    getLinkBalance,
    monitorLinkBalance,
    validateVRFHealth,
    getVRFRequestHistory,
    manualVRFRequest,
    forceFailsafe
};