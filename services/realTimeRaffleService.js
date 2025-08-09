const { Server } = require('socket.io');
const RaffleError = require('../utils/errors/RaffleError');

/**
 * Real-time raffle updates service using Socket.IO
 */
class RealTimeRaffleService {
    constructor() {
        this.io = null;
        this.connectedUsers = new Map(); // userId -> socketId mapping
        this.raffleRooms = new Map(); // raffleId -> Set of socketIds
    }

    /**
     * Initialize Socket.IO server
     */
    initialize(server) {
        this.io = new Server(server, {
            cors: {
                origin: ['http://localhost:3000', 'http://localhost:3001'],
                credentials: true
            },
            transports: ['websocket', 'polling']
        });

        this.setupEventHandlers();
        console.log('✅ Real-time raffle service initialized');
    }

    /**
     * Setup Socket.IO event handlers
     */
    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`User connected: ${socket.id}`);

            // Handle user authentication
            socket.on('authenticate', (data) => {
                this.handleAuthentication(socket, data);
            });

            // Handle joining raffle room
            socket.on('joinRaffle', (data) => {
                this.handleJoinRaffle(socket, data);
            });

            // Handle leaving raffle room
            socket.on('leaveRaffle', (data) => {
                this.handleLeaveRaffle(socket, data);
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                this.handleDisconnection(socket);
            });

            // Handle raffle creation subscription
            socket.on('subscribeToRaffleUpdates', () => {
                socket.join('raffle-updates');
            });

            // Handle user-specific notifications
            socket.on('subscribeToUserNotifications', (userId) => {
                if (userId) {
                    socket.join(`user-${userId}`);
                }
            });
        });
    }

    /**
     * Handle user authentication
     */
    handleAuthentication(socket, data) {
        try {
            const { userId, token } = data;
            
            // TODO: Verify JWT token
            // For now, we'll trust the userId
            
            this.connectedUsers.set(userId, socket.id);
            socket.userId = userId;
            socket.join(`user-${userId}`);
            
            socket.emit('authenticated', { success: true, userId });
            console.log(`User ${userId} authenticated with socket ${socket.id}`);
            
        } catch (error) {
            socket.emit('authError', { error: 'Authentication failed' });
        }
    }

    /**
     * Handle joining raffle room
     */
    handleJoinRaffle(socket, data) {
        try {
            const { raffleId } = data;
            
            if (!raffleId) {
                socket.emit('error', { message: 'Raffle ID is required' });
                return;
            }

            socket.join(`raffle-${raffleId}`);
            
            // Track raffle room membership
            if (!this.raffleRooms.has(raffleId)) {
                this.raffleRooms.set(raffleId, new Set());
            }
            this.raffleRooms.get(raffleId).add(socket.id);

            socket.emit('joinedRaffle', { raffleId, success: true });
            console.log(`Socket ${socket.id} joined raffle ${raffleId}`);
            
        } catch (error) {
            socket.emit('error', { message: 'Failed to join raffle' });
        }
    }

    /**
     * Handle leaving raffle room
     */
    handleLeaveRaffle(socket, data) {
        try {
            const { raffleId } = data;
            
            socket.leave(`raffle-${raffleId}`);
            
            // Remove from raffle room tracking
            if (this.raffleRooms.has(raffleId)) {
                this.raffleRooms.get(raffleId).delete(socket.id);
                if (this.raffleRooms.get(raffleId).size === 0) {
                    this.raffleRooms.delete(raffleId);
                }
            }

            socket.emit('leftRaffle', { raffleId, success: true });
            
        } catch (error) {
            socket.emit('error', { message: 'Failed to leave raffle' });
        }
    }

    /**
     * Handle user disconnection
     */
    handleDisconnection(socket) {
        console.log(`User disconnected: ${socket.id}`);
        
        // Remove from connected users
        if (socket.userId) {
            this.connectedUsers.delete(socket.userId);
        }

        // Remove from all raffle rooms
        for (const [raffleId, socketIds] of this.raffleRooms.entries()) {
            socketIds.delete(socket.id);
            if (socketIds.size === 0) {
                this.raffleRooms.delete(raffleId);
            }
        }
    }

    /**
     * Emit ticket purchase update
     */
    emitTicketPurchased(raffleId, ticketData) {
        if (!this.io) return;

        const updateData = {
            type: 'TICKET_PURCHASED',
            raffleId,
            data: {
                ticketsSold: ticketData.ticketsSold,
                ticketsAvailable: ticketData.ticketsAvailable,
                purchasedBy: ticketData.purchasedBy,
                quantity: ticketData.quantity,
                timestamp: new Date().toISOString()
            }
        };

        // Emit to raffle room
        this.io.to(`raffle-${raffleId}`).emit('raffleUpdate', updateData);
        
        // Emit to general raffle updates subscribers
        this.io.to('raffle-updates').emit('raffleUpdate', updateData);

        console.log(`Emitted ticket purchase update for raffle ${raffleId}`);
    }

    /**
     * Emit raffle countdown update
     */
    emitCountdownUpdate(raffleId, timeRemaining) {
        if (!this.io) return;

        const updateData = {
            type: 'COUNTDOWN_UPDATE',
            raffleId,
            data: {
                timeRemaining,
                timestamp: new Date().toISOString()
            }
        };

        this.io.to(`raffle-${raffleId}`).emit('raffleUpdate', updateData);
    }

    /**
     * Emit raffle status change
     */
    emitRaffleStatusChange(raffleId, status, additionalData = {}) {
        if (!this.io) return;

        const updateData = {
            type: 'STATUS_CHANGE',
            raffleId,
            data: {
                status,
                ...additionalData,
                timestamp: new Date().toISOString()
            }
        };

        this.io.to(`raffle-${raffleId}`).emit('raffleUpdate', updateData);
        this.io.to('raffle-updates').emit('raffleUpdate', updateData);

        console.log(`Emitted status change for raffle ${raffleId}: ${status}`);
    }

    /**
     * Emit winner announcement
     */
    emitWinnerAnnouncement(raffleId, winnerData) {
        if (!this.io) return;

        const updateData = {
            type: 'WINNER_ANNOUNCED',
            raffleId,
            data: {
                winner: winnerData.winner,
                winningTicket: winnerData.winningTicket,
                prize: winnerData.prize,
                timestamp: new Date().toISOString()
            }
        };

        // Emit to raffle room
        this.io.to(`raffle-${raffleId}`).emit('raffleUpdate', updateData);
        
        // Emit to winner specifically
        if (winnerData.winner && winnerData.winner._id) {
            this.io.to(`user-${winnerData.winner._id}`).emit('winnerNotification', updateData);
        }

        // Emit to general updates
        this.io.to('raffle-updates').emit('raffleUpdate', updateData);

        console.log(`Emitted winner announcement for raffle ${raffleId}`);
    }

    /**
     * Emit raffle creation notification
     */
    emitRaffleCreated(raffleData) {
        if (!this.io) return;

        const updateData = {
            type: 'RAFFLE_CREATED',
            data: {
                raffleId: raffleData._id,
                eventId: raffleData.eventId,
                lotteryType: raffleData.lotteryTypeEnum,
                raffleType: raffleData.raffleTypeEnum,
                createdBy: raffleData.createdBy,
                timestamp: new Date().toISOString()
            }
        };

        this.io.to('raffle-updates').emit('raffleUpdate', updateData);
        console.log(`Emitted raffle creation notification for ${raffleData.eventId}`);
    }

    /**
     * Emit raffle cancelled notification
     */
    emitRaffleCancelled(raffleId, reason) {
        if (!this.io) return;

        const updateData = {
            type: 'RAFFLE_CANCELLED',
            raffleId,
            data: {
                reason,
                timestamp: new Date().toISOString()
            }
        };

        this.io.to(`raffle-${raffleId}`).emit('raffleUpdate', updateData);
        this.io.to('raffle-updates').emit('raffleUpdate', updateData);

        console.log(`Emitted raffle cancellation for ${raffleId}`);
    }

    /**
     * Emit user-specific notification
     */
    emitUserNotification(userId, notification) {
        if (!this.io) return;

        this.io.to(`user-${userId}`).emit('userNotification', {
            ...notification,
            timestamp: new Date().toISOString()
        });

        console.log(`Emitted notification to user ${userId}`);
    }

    /**
     * Get connection statistics
     */
    getConnectionStats() {
        return {
            connectedUsers: this.connectedUsers.size,
            activeRaffleRooms: this.raffleRooms.size,
            totalConnections: this.io ? this.io.sockets.sockets.size : 0
        };
    }

    /**
     * Get users in raffle room
     */
    getRaffleRoomUsers(raffleId) {
        const socketIds = this.raffleRooms.get(raffleId) || new Set();
        const users = [];
        
        for (const [userId, socketId] of this.connectedUsers.entries()) {
            if (socketIds.has(socketId)) {
                users.push(userId);
            }
        }
        
        return users;
    }

    /**
     * Start countdown timer for raffle
     */
    startRaffleCountdown(raffleId, endTime) {
        const interval = setInterval(() => {
            const now = new Date();
            const timeRemaining = Math.max(0, endTime - now);
            
            if (timeRemaining <= 0) {
                clearInterval(interval);
                this.emitRaffleStatusChange(raffleId, 'ENDED');
            } else {
                this.emitCountdownUpdate(raffleId, timeRemaining);
            }
        }, 1000); // Update every second

        return interval;
    }
}

// Create singleton instance
const realTimeRaffleService = new RealTimeRaffleService();

module.exports = realTimeRaffleService;