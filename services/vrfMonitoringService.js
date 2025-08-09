const vrfService = require('./vrfService');
const Raffle = require('../models/raffle/raffle');
const cron = require('node-cron');

/**
 * VRF Monitoring Service
 * Handles background monitoring and maintenance of VRF operations
 */

class VRFMonitoringService {
    constructor() {
        this.isRunning = false;
        this.monitoringInterval = null;
        this.balanceCheckInterval = null;
        this.healthCheckInterval = null;
        
        // Configuration
        this.config = {
            monitoringIntervalMs: 30000, // 30 seconds
            balanceCheckIntervalMs: 300000, // 5 minutes
            healthCheckIntervalMs: 60000, // 1 minute
            linkBalanceThreshold: 10, // LINK tokens
            maxRetries: 3,
            retryDelayMs: 5000
        };
    }

    /**
     * Start VRF monitoring service
     */
    start() {
        if (this.isRunning) {
            console.log('VRF monitoring service is already running');
            return;
        }

        console.log('Starting VRF monitoring service...');
        this.isRunning = true;

        // Start monitoring intervals
        this.startVRFRequestMonitoring();
        this.startLinkBalanceMonitoring();
        this.startHealthChecks();

        // Schedule daily cleanup
        this.scheduleDailyCleanup();

        console.log('VRF monitoring service started successfully');
    }

    /**
     * Stop VRF monitoring service
     */
    stop() {
        if (!this.isRunning) {
            console.log('VRF monitoring service is not running');
            return;
        }

        console.log('Stopping VRF monitoring service...');
        this.isRunning = false;

        // Clear intervals
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        if (this.balanceCheckInterval) {
            clearInterval(this.balanceCheckInterval);
            this.balanceCheckInterval = null;
        }

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        console.log('VRF monitoring service stopped');
    }

    /**
     * Monitor pending VRF requests
     */
    startVRFRequestMonitoring() {
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.checkPendingVRFRequests();
            } catch (error) {
                console.error('Error in VRF request monitoring:', error);
            }
        }, this.config.monitoringIntervalMs);
    }

    /**
     * Monitor LINK balance
     */
    startLinkBalanceMonitoring() {
        this.balanceCheckInterval = setInterval(async () => {
            try {
                await this.checkLinkBalance();
            } catch (error) {
                console.error('Error in LINK balance monitoring:', error);
            }
        }, this.config.balanceCheckIntervalMs);
    }

    /**
     * Perform health checks
     */
    startHealthChecks() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.performHealthCheck();
            } catch (error) {
                console.error('Error in VRF health check:', error);
            }
        }, this.config.healthCheckIntervalMs);
    }

    /**
     * Check and process pending VRF requests
     */
    async checkPendingVRFRequests() {
        try {
            // Find raffles with VRF requests in progress
            const pendingRaffles = await Raffle.find({
                'vrf.status': 'In Progress',
                'vrf.transactionHash': { $exists: true, $ne: null }
            }).limit(50);

            console.log(`Checking ${pendingRaffles.length} pending VRF requests`);

            for (const raffle of pendingRaffles) {
                try {
                    // Check if VRF has been fulfilled
                    const result = await vrfService.checkPolygonVRFFulfillment(raffle._id.toString());
                    
                    if (result.fulfilled) {
                        console.log(`VRF fulfilled for raffle ${raffle.eventId}: winning ticket ${result.winningTicketNumber}`);
                        
                        // Update raffle status to completed if needed
                        if (raffle.vrf.status !== 'Completed') {
                            await this.processVRFFulfillment(raffle, result);
                        }
                    } else {
                        // Check if request is too old (stuck)
                        const requestAge = Date.now() - new Date(raffle.updatedAt).getTime();
                        const maxAge = 10 * 60 * 1000; // 10 minutes
                        
                        if (requestAge > maxAge) {
                            console.warn(`VRF request for raffle ${raffle.eventId} is stuck (${Math.floor(requestAge / 60000)} minutes old)`);
                            await this.handleStuckVRFRequest(raffle);
                        }
                    }
                } catch (error) {
                    console.error(`Error checking VRF for raffle ${raffle.eventId}:`, error);
                    
                    // Increment retry count
                    const retryCount = (raffle.vrf.retryCount || 0) + 1;
                    
                    if (retryCount >= this.config.maxRetries) {
                        console.error(`Max retries reached for raffle ${raffle.eventId}, using failsafe`);
                        await this.useFailsafeForRaffle(raffle);
                    } else {
                        // Update retry count
                        await Raffle.updateOne(
                            { _id: raffle._id },
                            { 
                                $set: { 'vrf.retryCount': retryCount },
                                $currentDate: { updatedAt: true }
                            }
                        );
                    }
                }
            }
        } catch (error) {
            console.error('Error in checkPendingVRFRequests:', error);
        }
    }

    /**
     * Check LINK balance and alert if low
     */
    async checkLinkBalance() {
        try {
            const balanceStatus = await vrfService.monitorLinkBalance(this.config.linkBalanceThreshold);
            
            if (balanceStatus.isLow) {
                console.warn(`LINK balance is low: ${balanceStatus.currentBalance} LINK`);
                await this.sendLowBalanceAlert(balanceStatus);
            }
        } catch (error) {
            console.error('Error checking LINK balance:', error);
        }
    }

    /**
     * Perform VRF system health check
     */
    async performHealthCheck() {
        try {
            const health = await vrfService.validateVRFHealth();
            
            if (!health.isHealthy) {
                console.error('VRF system health check failed:', health.issues);
                await this.sendHealthAlert(health);
            }
        } catch (error) {
            console.error('Error in VRF health check:', error);
        }
    }

    /**
     * Process VRF fulfillment
     */
    async processVRFFulfillment(raffle, result) {
        try {
            // Additional processing after VRF fulfillment
            console.log(`Processing VRF fulfillment for raffle ${raffle.eventId}`);
            
            // Update raffle status
            await Raffle.updateOne(
                { _id: raffle._id },
                { 
                    $set: { 
                        'vrf.status': 'Completed',
                        'vrf.completedAt': new Date()
                    }
                }
            );
            
            // TODO: Trigger raffle completion workflow
            // This would include winner notification, prize distribution, etc.
            
        } catch (error) {
            console.error(`Error processing VRF fulfillment for raffle ${raffle.eventId}:`, error);
        }
    }

    /**
     * Handle stuck VRF request
     */
    async handleStuckVRFRequest(raffle) {
        try {
            console.log(`Handling stuck VRF request for raffle ${raffle.eventId}`);
            
            // Mark as failed and use failsafe
            await Raffle.updateOne(
                { _id: raffle._id },
                { 
                    $set: { 
                        'vrf.status': 'Failed',
                        'vrf.failureReason': 'Request timeout'
                    }
                }
            );
            
            // Use failsafe randomness
            await this.useFailsafeForRaffle(raffle);
            
        } catch (error) {
            console.error(`Error handling stuck VRF request for raffle ${raffle.eventId}:`, error);
        }
    }

    /**
     * Use failsafe randomness for raffle
     */
    async useFailsafeForRaffle(raffle) {
        try {
            console.log(`Using failsafe randomness for raffle ${raffle.eventId}`);
            
            const result = await vrfService.useFailsafeRandomness(
                raffle._id.toString(), 
                raffle.ticketsSold
            );
            
            if (result.success) {
                console.log(`Failsafe applied successfully for raffle ${raffle.eventId}: winning ticket ${result.winningTicketNumber}`);
                await this.processVRFFulfillment(raffle, result);
            }
            
        } catch (error) {
            console.error(`Error using failsafe for raffle ${raffle.eventId}:`, error);
        }
    }

    /**
     * Send low balance alert
     */
    async sendLowBalanceAlert(balanceStatus) {
        try {
            // TODO: Implement alert system (email, Slack, etc.)
            console.warn('LINK Balance Alert:', {
                currentBalance: balanceStatus.currentBalance,
                threshold: balanceStatus.threshold,
                walletAddress: balanceStatus.walletAddress,
                timestamp: balanceStatus.lastChecked
            });
            
            // Store alert in database for admin dashboard
            // This could be implemented with a separate alerts collection
            
        } catch (error) {
            console.error('Error sending low balance alert:', error);
        }
    }

    /**
     * Send health alert
     */
    async sendHealthAlert(health) {
        try {
            // TODO: Implement alert system
            console.error('VRF Health Alert:', {
                isHealthy: health.isHealthy,
                issues: health.issues,
                checks: health.checks,
                timestamp: health.timestamp
            });
            
        } catch (error) {
            console.error('Error sending health alert:', error);
        }
    }

    /**
     * Schedule daily cleanup tasks
     */
    scheduleDailyCleanup() {
        // Run cleanup at 2 AM daily
        cron.schedule('0 2 * * *', async () => {
            try {
                await this.performDailyCleanup();
            } catch (error) {
                console.error('Error in daily VRF cleanup:', error);
            }
        });
    }

    /**
     * Perform daily cleanup tasks
     */
    async performDailyCleanup() {
        try {
            console.log('Performing daily VRF cleanup...');
            
            // Clean up old failed requests (older than 7 days)
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            
            const cleanupResult = await Raffle.updateMany(
                {
                    'vrf.status': 'Failed',
                    'updatedAt': { $lt: sevenDaysAgo }
                },
                {
                    $unset: { 'vrf.retryCount': 1 }
                }
            );
            
            console.log(`Cleaned up ${cleanupResult.modifiedCount} old failed VRF requests`);
            
            // Generate daily VRF report
            await this.generateDailyReport();
            
        } catch (error) {
            console.error('Error in daily VRF cleanup:', error);
        }
    }

    /**
     * Generate daily VRF report
     */
    async generateDailyReport() {
        try {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const today = new Date();
            
            const stats = await Raffle.aggregate([
                {
                    $match: {
                        'createdAt': { $gte: yesterday, $lt: today }
                    }
                },
                {
                    $group: {
                        _id: '$vrf.status',
                        count: { $sum: 1 }
                    }
                }
            ]);
            
            const failsafeCount = await Raffle.countDocuments({
                'vrf.failsafeUsed': true,
                'createdAt': { $gte: yesterday, $lt: today }
            });
            
            const report = {
                date: yesterday.toISOString().split('T')[0],
                statistics: stats.reduce((acc, stat) => {
                    acc[stat._id] = stat.count;
                    return acc;
                }, {}),
                failsafeUsed: failsafeCount,
                timestamp: new Date()
            };
            
            console.log('Daily VRF Report:', report);
            
            // TODO: Store report in database or send to monitoring system
            
        } catch (error) {
            console.error('Error generating daily VRF report:', error);
        }
    }

    /**
     * Get monitoring status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            config: this.config,
            intervals: {
                monitoring: !!this.monitoringInterval,
                balanceCheck: !!this.balanceCheckInterval,
                healthCheck: !!this.healthCheckInterval
            }
        };
    }
}

// Create singleton instance
const vrfMonitoringService = new VRFMonitoringService();

module.exports = vrfMonitoringService;