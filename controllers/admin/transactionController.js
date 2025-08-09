const Deposit = require('../../models/transactions/deposit');
const Withdraw = require('../../models/transactions/withdraw');
const TokenBalance = require('../../models/user/tokenBalance');
const User = require('../../models/user/user');
const SecurityLog = require('../../models/security/securityLog');
const { validationResult } = require('express-validator');

/**
 * Transaction Controller
 * Handles transaction monitoring, review, and management
 */

/**
 * Get all transactions with pagination and filtering
 */
exports.getTransactions = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            type = 'all',
            status = 'all',
            sortBy = 'createdAt',
            sortOrder = 'desc',
            search = '',
            startDate,
            endDate
        } = req.query;

        // Build date range filter
        const dateFilter = {};
        if (startDate) {
            dateFilter.$gte = new Date(startDate);
        }
        if (endDate) {
            dateFilter.$lte = new Date(endDate);
        }

        let transactions = [];
        let total = 0;

        // Get deposits
        if (type === 'all' || type === 'deposit') {
            const depositQuery = {};
            if (Object.keys(dateFilter).length > 0) {
                depositQuery.createdAt = dateFilter;
            }
            if (status !== 'all') {
                depositQuery.status = status;
            }
            if (search) {
                depositQuery.$or = [
                    { transactionHash: { $regex: search, $options: 'i' } },
                    { fromAddress: { $regex: search, $options: 'i' } },
                    { toAddress: { $regex: search, $options: 'i' } }
                ];
            }

            const deposits = await Deposit.find(depositQuery)
                .populate('userId', 'username email')
                .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
                .lean();

            transactions.push(...deposits.map(deposit => ({
                ...deposit,
                type: 'deposit',
                user: deposit.userId
            })));
        }

        // Get withdrawals
        if (type === 'all' || type === 'withdrawal') {
            const withdrawalQuery = {};
            if (Object.keys(dateFilter).length > 0) {
                withdrawalQuery.createdAt = dateFilter;
            }
            if (status !== 'all') {
                withdrawalQuery.status = status;
            }
            if (search) {
                withdrawalQuery.$or = [
                    { transactionHash: { $regex: search, $options: 'i' } },
                    { toAddress: { $regex: search, $options: 'i' } }
                ];
            }

            const withdrawals = await Withdraw.find(withdrawalQuery)
                .populate('userId', 'username email')
                .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
                .lean();

            transactions.push(...withdrawals.map(withdrawal => ({
                ...withdrawal,
                type: 'withdrawal',
                user: withdrawal.userId
            })));
        }

        // Sort all transactions
        transactions.sort((a, b) => {
            const aValue = a[sortBy];
            const bValue = b[sortBy];
            
            if (sortOrder === 'desc') {
                return new Date(bValue) - new Date(aValue);
            } else {
                return new Date(aValue) - new Date(bValue);
            }
        });

        // Apply pagination
        total = transactions.length;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        transactions = transactions.slice(startIndex, endIndex);

        res.json({
            success: true,
            data: {
                transactions,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Error getting transactions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get transactions',
            details: error.message
        });
    }
};

/**
 * Get pending withdrawal requests
 */
exports.getPendingWithdrawals = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const withdrawals = await Withdraw.find({ status: 'pending' })
            .populate('userId', 'username email profile walletAddresses')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const total = await Withdraw.countDocuments({ status: 'pending' });

        // Enhance withdrawal data with user balance information
        const enhancedWithdrawals = await Promise.all(withdrawals.map(async (withdrawal) => {
            const userBalance = await TokenBalance.findOne({
                userId: withdrawal.userId._id,
                tokenType: withdrawal.tokenType
            });

            return {
                ...withdrawal,
                userCurrentBalance: userBalance ? userBalance.balance : '0',
                canProcess: userBalance && parseFloat(userBalance.balance) >= parseFloat(withdrawal.amount)
            };
        }));

        res.json({
            success: true,
            data: {
                withdrawals: enhancedWithdrawals,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Error getting pending withdrawals:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get pending withdrawals',
            details: error.message
        });
    }
};

/**
 * Approve withdrawal request
 */
exports.approveWithdrawal = async (req, res) => {
    try {
        const { withdrawalId } = req.params;
        const { notes = '' } = req.body;

        const withdrawal = await Withdraw.findById(withdrawalId)
            .populate('userId', 'username email');

        if (!withdrawal) {
            return res.status(404).json({
                success: false,
                error: 'Withdrawal request not found'
            });
        }

        if (withdrawal.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: 'Withdrawal request is not pending'
            });
        }

        // Check user balance
        const userBalance = await TokenBalance.findOne({
            userId: withdrawal.userId._id,
            tokenType: withdrawal.tokenType
        });

        if (!userBalance || parseFloat(userBalance.balance) < parseFloat(withdrawal.amount)) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient user balance'
            });
        }

        // Update withdrawal status
        await Withdraw.findByIdAndUpdate(withdrawalId, {
            status: 'approved',
            approvedAt: new Date(),
            approvedBy: req.user._id,
            adminNotes: notes
        });

        // Deduct from user balance
        const newBalance = (parseFloat(userBalance.balance) - parseFloat(withdrawal.amount)).toString();
        await TokenBalance.findByIdAndUpdate(userBalance._id, {
            balance: newBalance
        });

        // Log admin action
        await SecurityLog.create({
            eventType: 'admin_withdrawal_approved',
            severity: 'medium',
            playerId: withdrawal.userId._id,
            details: {
                adminId: req.user._id,
                withdrawalId,
                amount: withdrawal.amount,
                tokenType: withdrawal.tokenType,
                notes,
                timestamp: new Date()
            },
            timestamp: new Date(),
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            success: true,
            message: 'Withdrawal approved successfully',
            data: { withdrawalId, amount: withdrawal.amount, tokenType: withdrawal.tokenType }
        });

    } catch (error) {
        console.error('Error approving withdrawal:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to approve withdrawal',
            details: error.message
        });
    }
};

/**
 * Reject withdrawal request
 */
exports.rejectWithdrawal = async (req, res) => {
    try {
        const { withdrawalId } = req.params;
        const { reason = 'Admin rejection', notes = '' } = req.body;

        const withdrawal = await Withdraw.findById(withdrawalId)
            .populate('userId', 'username email');

        if (!withdrawal) {
            return res.status(404).json({
                success: false,
                error: 'Withdrawal request not found'
            });
        }

        if (withdrawal.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: 'Withdrawal request is not pending'
            });
        }

        // Update withdrawal status
        await Withdraw.findByIdAndUpdate(withdrawalId, {
            status: 'rejected',
            rejectedAt: new Date(),
            rejectedBy: req.user._id,
            rejectionReason: reason,
            adminNotes: notes
        });

        // Log admin action
        await SecurityLog.create({
            eventType: 'admin_withdrawal_rejected',
            severity: 'low',
            playerId: withdrawal.userId._id,
            details: {
                adminId: req.user._id,
                withdrawalId,
                amount: withdrawal.amount,
                tokenType: withdrawal.tokenType,
                reason,
                notes,
                timestamp: new Date()
            },
            timestamp: new Date(),
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            success: true,
            message: 'Withdrawal rejected successfully',
            data: { withdrawalId, reason }
        });

    } catch (error) {
        console.error('Error rejecting withdrawal:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reject withdrawal',
            details: error.message
        });
    }
};

/**
 * Get transaction statistics
 */
exports.getTransactionStatistics = async (req, res) => {
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
            totalDeposits,
            totalWithdrawals,
            pendingWithdrawals,
            depositVolume,
            withdrawalVolume,
            depositsByToken,
            withdrawalsByToken,
            depositsByStatus,
            withdrawalsByStatus
        ] = await Promise.all([
            Deposit.countDocuments({ createdAt: { $gte: startDate } }),
            Withdraw.countDocuments({ createdAt: { $gte: startDate } }),
            Withdraw.countDocuments({ status: 'pending' }),
            Deposit.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { 
                    _id: null, 
                    total: { $sum: { $toDouble: '$amount' } }
                }}
            ]),
            Withdraw.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { 
                    _id: null, 
                    total: { $sum: { $toDouble: '$amount' } }
                }}
            ]),
            Deposit.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { 
                    _id: '$tokenType',
                    count: { $sum: 1 },
                    volume: { $sum: { $toDouble: '$amount' } }
                }}
            ]),
            Withdraw.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { 
                    _id: '$tokenType',
                    count: { $sum: 1 },
                    volume: { $sum: { $toDouble: '$amount' } }
                }}
            ]),
            Deposit.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { 
                    _id: '$status',
                    count: { $sum: 1 }
                }}
            ]),
            Withdraw.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { 
                    _id: '$status',
                    count: { $sum: 1 }
                }}
            ])
        ]);

        const statistics = {
            overview: {
                totalDeposits,
                totalWithdrawals,
                pendingWithdrawals,
                depositVolume: depositVolume[0]?.total || 0,
                withdrawalVolume: withdrawalVolume[0]?.total || 0,
                netFlow: (depositVolume[0]?.total || 0) - (withdrawalVolume[0]?.total || 0)
            },
            byToken: {
                deposits: depositsByToken,
                withdrawals: withdrawalsByToken
            },
            byStatus: {
                deposits: depositsByStatus,
                withdrawals: withdrawalsByStatus
            },
            timeRange,
            generatedAt: new Date()
        };

        res.json({
            success: true,
            data: statistics
        });

    } catch (error) {
        console.error('Error getting transaction statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get transaction statistics',
            details: error.message
        });
    }
};

/**
 * Flag suspicious transaction
 */
exports.flagTransaction = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const { type, reason, severity = 'medium' } = req.body;

        let transaction;
        if (type === 'deposit') {
            transaction = await Deposit.findById(transactionId).populate('userId');
        } else if (type === 'withdrawal') {
            transaction = await Withdraw.findById(transactionId).populate('userId');
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid transaction type'
            });
        }

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        // Log security event
        await SecurityLog.create({
            eventType: 'admin_transaction_flagged',
            severity,
            playerId: transaction.userId._id,
            details: {
                adminId: req.user._id,
                transactionId,
                transactionType: type,
                amount: transaction.amount,
                tokenType: transaction.tokenType,
                reason,
                timestamp: new Date()
            },
            timestamp: new Date(),
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            success: true,
            message: 'Transaction flagged successfully',
            data: { transactionId, type, reason, severity }
        });

    } catch (error) {
        console.error('Error flagging transaction:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to flag transaction',
            details: error.message
        });
    }
};

module.exports = {
    getTransactions,
    getPendingWithdrawals,
    approveWithdrawal,
    rejectWithdrawal,
    getTransactionStatistics,
    flagTransaction
};