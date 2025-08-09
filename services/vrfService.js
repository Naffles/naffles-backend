const { WEB3_VRF, VRF_CONTRACT_ABI, VRF_CONTRACT_ADDRESS, VRF_WALLET } = require('../config/vrf');
const { 
  WEB3_POLYGON, 
  vrfWallet, 
  getVRFContract, 
  getLinkContract,
  VRF_POLYGON_CONFIG 
} = require('../config/vrfPolygon');
const { requestForRandomNumber } = require('../utils/random');
const vrfWrapper = require('./vrfWrapper');
const mongoose = require('mongoose');
const Raffle = require('../models/raffle/raffle');
const RaffleConstants = require('../utils/constants/RaffleConstants');

/**
 * Requests random number from Chainlink VRF
 * @param {String} raffleId - Raffle ID
 * @param {Number} range - Range for random number (e.g., total tickets)
 * @param {Object} options - Additional options
 * @returns {Object} VRF request result
 */
const requestVRFRandomness = async (raffleId, range, options = {}) => {
    try {
        // Input validation
        if (!raffleId || !mongoose.Types.ObjectId.isValid(raffleId)) {
            throw new Error("Invalid raffle ID provided");
        }
        
        if (!range || range <= 0 || !Number.isInteger(range)) {
            throw new Error("Invalid range provided - must be a positive integer");
        }
        
        const { nativePayment = false, isAllowlist = false } = options;
        
        // Get raffle to use eventId as naffleId
        const raffle = await Raffle.findById(raffleId);
        if (!raffle) {
            throw new Error(`Raffle not found with ID: ${raffleId}`);
        }
        
        // Check if raffle is in valid state for VRF request
        if (raffle.vrf.status !== "Pending") {
            throw new Error(`Cannot request VRF for raffle in status: ${raffle.vrf.status}`);
        }
        
        const naffleId = raffle.eventId;
        
        // Request random number from VRF contract
        const transactionHash = await requestForRandomNumber(naffleId, range, {
            nativePayment,
            isAllowlist
        });
        
        if (transactionHash) {
            // Update raffle VRF status
            raffle.vrf.status = "In Progress";
            raffle.vrf.transactionHash = transactionHash;
            raffle.vrf.requestId = `${naffleId}_${Date.now()}`;
            await raffle.save();
            
            console.log(`VRF request successful for raffle ${raffleId}, tx: ${transactionHash}`);
            
            return {
                success: true,
                transactionHash,
                requestId: raffle.vrf.requestId
            };
        } else {
            // VRF request already fulfilled or failed
            console.warn(`VRF request returned null transaction hash for raffle ${raffleId}`);
            return {
                success: false,
                error: "VRF request already processed or failed"
            };
        }
        
    } catch (error) {
        console.error(`VRF request error for raffle ${raffleId}:`, error);
        
        // Use failsafe mechanism only if raffle exists
        try {
            const failsafeResult = await useFailsafeRandomness(raffleId, range);
            console.log(`Failsafe mechanism activated for raffle ${raffleId}`);
            return failsafeResult;
        } catch (failsafeError) {
            console.error(`Failsafe mechanism failed for raffle ${raffleId}:`, failsafeError);
            throw new Error(`VRF request failed and failsafe mechanism also failed: ${failsafeError.message}`);
        }
    }
};

/**
 * Checks VRF fulfillment status
 * @param {String} raffleId - Raffle ID
 * @returns {Object} VRF status result
 */
const checkVRFFulfillment = async (raffleId) => {
    try {
        const raffle = await Raffle.findById(raffleId);
        if (!raffle) {
            throw new Error("Raffle not found");
        }
        
        const naffleId = raffle.eventId;
        const contract = new WEB3_VRF.eth.Contract(VRF_CONTRACT_ABI, VRF_CONTRACT_ADDRESS);
        
        const chainLinkId = await contract.methods
            .naffleIdToChainlinkRequestId(naffleId)
            .call();
            
        const { randomNumber, fulfilled } = await contract.methods
            .chainlinkRequestStatus(chainLinkId)
            .call();
        
        if (fulfilled) {
            const winningTicketNumber = parseInt(randomNumber.toString());
            
            // Update raffle with VRF result
            raffle.vrf.status = "Fulfilled";
            raffle.vrf.winningTicketNumber = winningTicketNumber;
            await raffle.save();
            
            return {
                fulfilled: true,
                winningTicketNumber,
                randomNumber: randomNumber.toString()
            };
        }
        
        return {
            fulfilled: false,
            status: raffle.vrf.status
        };
        
    } catch (error) {
        console.error("VRF fulfillment check error:", error);
        
        // If VRF check fails, use failsafe
        const raffle = await Raffle.findById(raffleId);
        if (raffle && raffle.vrf.status === "In Progress") {
            const failsafeResult = await useFailsafeRandomness(raffleId, raffle.ticketsSold);
            return failsafeResult;
        }
        
        throw error;
    }
};

/**
 * Failsafe random number generation when VRF fails
 * Uses the unified VRF wrapper for consistent failsafe behavior
 * @param {String} raffleId - Raffle ID
 * @param {Number} range - Range for random number
 * @returns {Object} Failsafe result
 */
const useFailsafeRandomness = async (raffleId, range) => {
    try {
        const raffle = await Raffle.findById(raffleId);
        if (!raffle) {
            throw new Error("Raffle not found");
        }
        
        // Use unified VRF wrapper for consistent failsafe behavior
        const randomnessRequest = await vrfWrapper.requestRandomness();
        const winningTicketNumber = await vrfWrapper.getRandomInt(1, range + 1);
        
        // Update raffle with failsafe result
        raffle.vrf.status = "Fulfilled";
        raffle.vrf.winningTicketNumber = winningTicketNumber;
        raffle.vrf.failsafeUsed = true;
        raffle.vrf.transactionHash = null; // Clear VRF transaction hash when using failsafe
        raffle.vrf.failsafeRequestId = randomnessRequest.requestId; // Store failsafe request ID
        await raffle.save();
        
        console.log(`Unified failsafe randomness used for raffle ${raffleId}: ${winningTicketNumber}`);
        console.log(`Failsafe source: ${vrfWrapper.getRandomnessSource().source}`);
        
        return {
            success: true,
            fulfilled: true,
            winningTicketNumber,
            failsafeUsed: true,
            failsafeRequestId: randomnessRequest.requestId,
            randomnessSource: vrfWrapper.getRandomnessSource()
        };
        
    } catch (error) {
        console.error("Unified failsafe randomness error:", error);
        throw error;
    }
};

/**
 * Gets verifiable result for a raffle
 * @param {String} raffleId - Raffle ID
 * @returns {Object} Verifiable result
 */
const getVerifiableResult = async (raffleId) => {
    try {
        const raffle = await Raffle.findById(raffleId);
        if (!raffle) {
            throw new Error("Raffle not found");
        }
        
        const result = {
            raffleId,
            eventId: raffle.eventId,
            winningTicketNumber: raffle.vrf.winningTicketNumber,
            vrfStatus: raffle.vrf.status,
            failsafeUsed: raffle.vrf.failsafeUsed,
            transactionHash: raffle.vrf.transactionHash,
            verifiable: !raffle.vrf.failsafeUsed
        };
        
        // If VRF was used, get on-chain verification data
        if (!raffle.vrf.failsafeUsed && raffle.vrf.transactionHash) {
            try {
                const contract = new WEB3_VRF.eth.Contract(VRF_CONTRACT_ABI, VRF_CONTRACT_ADDRESS);
                const chainLinkId = await contract.methods
                    .naffleIdToChainlinkRequestId(raffle.eventId)
                    .call();
                    
                const chainlinkStatus = await contract.methods
                    .chainlinkRequestStatus(chainLinkId)
                    .call();
                
                result.chainlinkRequestId = chainLinkId;
                result.onChainRandomNumber = chainlinkStatus.randomNumber.toString();
                result.onChainVerified = chainlinkStatus.fulfilled;
            } catch (vrfError) {
                console.error("VRF verification error:", vrfError);
                result.verificationError = "Could not verify on-chain";
            }
        }
        
        return result;
        
    } catch (error) {
        console.error("Get verifiable result error:", error);
        throw error;
    }
};

/**
 * Handles VRF failure by updating status and using failsafe
 * @param {String} requestId - VRF request ID
 * @returns {Object} Failure handling result
 */
const handleVRFFailure = async (requestId) => {
    try {
        const raffle = await Raffle.findOne({ "vrf.requestId": requestId });
        if (!raffle) {
            throw new Error("Raffle not found for request ID");
        }
        
        // Mark VRF as failed
        raffle.vrf.status = "Failed";
        await raffle.save();
        
        // Use failsafe randomness
        const failsafeResult = await useFailsafeRandomness(raffle._id.toString(), raffle.ticketsSold);
        
        return {
            success: true,
            failsafeUsed: true,
            winningTicketNumber: failsafeResult.winningTicketNumber
        };
        
    } catch (error) {
        console.error("VRF failure handling error:", error);
        throw error;
    }
};

module.exports = {
    requestVRFRandomness,
    checkVRFFulfillment,
    useFailsafeRandomness,
    getVerifiableResult,
    handleVRFFailure
};

/**
 * Enhanced VRF Service with Polygon optimization and cross-chain support
 */

/**
 * Requests random number from Chainlink VRF on Polygon for cross-chain use
 * @param {String} raffleId - Raffle ID
 * @param {Number} range - Range for random number (e.g., total tickets)
 * @param {Object} options - Additional options including source chain
 * @returns {Object} VRF request result
 */
const requestCrossChainVRFRandomness = async (raffleId, range, options = {}) => {
    try {
        // Input validation
        if (!raffleId || !mongoose.Types.ObjectId.isValid(raffleId)) {
            throw new Error("Invalid raffle ID provided");
        }
        
        if (!range || range <= 0 || !Number.isInteger(range)) {
            throw new Error("Invalid range provided - must be a positive integer");
        }
        
        const { 
            nativePayment = false, 
            isAllowlist = false, 
            sourceChain = 'ethereum' 
        } = options;
        
        // Get raffle to use eventId as naffleId
        const raffle = await Raffle.findById(raffleId);
        if (!raffle) {
            throw new Error(`Raffle not found with ID: ${raffleId}`);
        }
        
        // Check if raffle is in valid state for VRF request
        if (raffle.vrf.status !== "Pending") {
            throw new Error(`Cannot request VRF for raffle in status: ${raffle.vrf.status}`);
        }
        
        const naffleId = raffle.eventId;
        
        // Use Polygon-optimized VRF contract
        const vrfContract = getVRFContract();
        const wallet = vrfWallet.getWallet();
        
        // Check if VRF request already exists
        const chainLinkId = await vrfContract.methods
            .naffleIdToChainlinkRequestId(naffleId)
            .call();
            
        const requestStatus = await vrfContract.methods
            .chainlinkRequestStatus(chainLinkId)
            .call();
        
        if (!requestStatus.fulfilled && requestStatus.exists) {
            console.log(`VRF request already exists for raffle ${raffleId}`);
            return {
                success: false,
                error: "VRF request already in progress"
            };
        }
        
        if (requestStatus.fulfilled) {
            console.log(`VRF request already fulfilled for raffle ${raffleId}`);
            return {
                success: false,
                error: "VRF request already fulfilled"
            };
        }
        
        // Get current gas price for Polygon
        const gasPrice = await WEB3_POLYGON.eth.getGasPrice();
        const adjustedGasPrice = Math.floor(Number(gasPrice) * 1.1); // 10% buffer
        
        // Make cross-chain VRF request
        const tx = await vrfContract.methods
            .drawWinnerCrossChain(naffleId, range, nativePayment, isAllowlist, sourceChain)
            .send({
                from: wallet.address,
                gas: VRF_POLYGON_CONFIG.CALLBACK_GAS_LIMIT,
                gasPrice: adjustedGasPrice.toString()
            });
        
        console.log(`Cross-chain VRF request successful for raffle ${raffleId} (${sourceChain}), Polygon tx: ${tx.transactionHash}`);
        
        // Update raffle VRF status
        raffle.vrf.status = "In Progress";
        raffle.vrf.transactionHash = tx.transactionHash;
        raffle.vrf.requestId = `${naffleId}_${Date.now()}`;
        raffle.vrf.sourceChain = sourceChain;
        raffle.vrf.polygonTxHash = tx.transactionHash;
        await raffle.save();
        
        return {
            success: true,
            transactionHash: tx.transactionHash,
            polygonTxHash: tx.transactionHash,
            requestId: raffle.vrf.requestId,
            sourceChain
        };
        
    } catch (error) {
        console.error(`Cross-chain VRF request error for raffle ${raffleId}:`, error);
        
        // Use failsafe mechanism
        try {
            const failsafeResult = await useFailsafeRandomness(raffleId, range);
            console.log(`Failsafe mechanism activated for raffle ${raffleId}`);
            return failsafeResult;
        } catch (failsafeError) {
            console.error(`Failsafe mechanism failed for raffle ${raffleId}:`, failsafeError);
            throw new Error(`VRF request failed and failsafe mechanism also failed: ${failsafeError.message}`);
        }
    }
};

/**
 * Checks VRF fulfillment status on Polygon network
 * @param {String} raffleId - Raffle ID
 * @returns {Object} VRF status result
 */
const checkPolygonVRFFulfillment = async (raffleId) => {
    try {
        const raffle = await Raffle.findById(raffleId);
        if (!raffle) {
            throw new Error("Raffle not found");
        }
        
        const naffleId = raffle.eventId;
        const vrfContract = getVRFContract();
        
        const chainLinkId = await vrfContract.methods
            .naffleIdToChainlinkRequestId(naffleId)
            .call();
            
        const requestStatus = await vrfContract.methods
            .chainlinkRequestStatus(chainLinkId)
            .call();
        
        if (requestStatus.fulfilled) {
            const winningTicketNumber = parseInt(requestStatus.randomNumber.toString());
            
            // Update raffle with VRF result
            raffle.vrf.status = "Fulfilled";
            raffle.vrf.winningTicketNumber = winningTicketNumber;
            raffle.vrf.polygonTxHash = raffle.vrf.transactionHash; // Ensure Polygon tx is recorded
            await raffle.save();
            
            return {
                fulfilled: true,
                winningTicketNumber,
                randomNumber: requestStatus.randomNumber.toString(),
                sourceChain: requestStatus.sourceChain,
                polygonTxHash: raffle.vrf.polygonTxHash,
                verifiable: true
            };
        }
        
        return {
            fulfilled: false,
            status: raffle.vrf.status,
            sourceChain: raffle.vrf.sourceChain
        };
        
    } catch (error) {
        console.error("Polygon VRF fulfillment check error:", error);
        
        // If VRF check fails, use failsafe
        const raffle = await Raffle.findById(raffleId);
        if (raffle && raffle.vrf.status === "In Progress") {
            const failsafeResult = await useFailsafeRandomness(raffleId, raffle.ticketsSold);
            return failsafeResult;
        }
        
        throw error;
    }
};

/**
 * Gets LINK token balance for VRF operations
 * @returns {Object} LINK balance information
 */
const getLinkBalance = async () => {
    try {
        const linkContract = getLinkContract();
        const wallet = vrfWallet.getWallet();
        
        const balance = await linkContract.methods
            .balanceOf(wallet.address)
            .call();
            
        const decimals = await linkContract.methods
            .decimals()
            .call();
        
        const balanceFormatted = (Number(balance) / Math.pow(10, Number(decimals))).toFixed(4);
        
        return {
            balance: balance.toString(),
            balanceFormatted,
            decimals: Number(decimals),
            walletAddress: wallet.address,
            tokenAddress: VRF_POLYGON_CONFIG.LINK_TOKEN_ADDRESS
        };
        
    } catch (error) {
        console.error("Error getting LINK balance:", error);
        throw error;
    }
};

/**
 * Monitors LINK balance and alerts when low
 * @param {Number} threshold - Minimum LINK balance threshold
 * @returns {Object} Balance status
 */
const monitorLinkBalance = async (threshold = 10) => {
    try {
        const balanceInfo = await getLinkBalance();
        const currentBalance = parseFloat(balanceInfo.balanceFormatted);
        
        const status = {
            currentBalance,
            threshold,
            isLow: currentBalance < threshold,
            walletAddress: balanceInfo.walletAddress,
            lastChecked: new Date()
        };
        
        if (status.isLow) {
            console.warn(`LINK balance is low: ${currentBalance} LINK (threshold: ${threshold})`);
            // TODO: Send alert to admin dashboard
        }
        
        return status;
        
    } catch (error) {
        console.error("Error monitoring LINK balance:", error);
        throw error;
    }
};

/**
 * Gets VRF configuration for admin interface
 * @returns {Object} Current VRF configuration
 */
const getVRFConfiguration = async () => {
    try {
        const vrfContract = getVRFContract();
        const wallet = vrfWallet.getWallet();
        
        const [
            subscriptionId,
            keyHash,
            callbackGasLimit,
            coordinator
        ] = await Promise.all([
            vrfContract.methods.chainlinkVRFSubscriptionId().call(),
            vrfContract.methods.chainlinkVRFGasLaneKeyHash().call(),
            vrfContract.methods.chainlinkVRFCallbackGasLimit().call(),
            vrfContract.methods.s_vrfCoordinator().call()
        ]);
        
        const linkBalance = await getLinkBalance();
        
        return {
            network: VRF_POLYGON_CONFIG.NETWORK,
            chainId: VRF_POLYGON_CONFIG.CHAIN_ID,
            coordinatorAddress: coordinator,
            subscriptionId: subscriptionId.toString(),
            keyHash,
            callbackGasLimit: Number(callbackGasLimit),
            requestConfirmations: VRF_POLYGON_CONFIG.REQUEST_CONFIRMATIONS,
            linkTokenAddress: VRF_POLYGON_CONFIG.LINK_TOKEN_ADDRESS,
            vrfWalletAddress: wallet.address,
            linkBalance: linkBalance.balanceFormatted,
            contractAddress: process.env.POLYGON_VRF_CONTRACT_ADDRESS,
            isConfigured: true
        };
        
    } catch (error) {
        console.error("Error getting VRF configuration:", error);
        return {
            isConfigured: false,
            error: error.message
        };
    }
};

/**
 * Updates VRF configuration (admin only)
 * @param {Object} config - New VRF configuration
 * @returns {Object} Update result
 */
const updateVRFConfiguration = async (config) => {
    try {
        const vrfContract = getVRFContract();
        const wallet = vrfWallet.getWallet();
        
        const {
            subscriptionId,
            keyHash,
            callbackGasLimit,
            requestConfirmations
        } = config;
        
        // Validate configuration
        if (!subscriptionId || !keyHash || !callbackGasLimit) {
            throw new Error("Missing required VRF configuration parameters");
        }
        
        const gasPrice = await WEB3_POLYGON.eth.getGasPrice();
        const adjustedGasPrice = Math.floor(Number(gasPrice) * 1.1);
        
        // Update VRF settings on contract
        const tx = await vrfContract.methods
            .setChainlinkVRFSettings(
                subscriptionId,
                keyHash,
                callbackGasLimit,
                requestConfirmations || VRF_POLYGON_CONFIG.REQUEST_CONFIRMATIONS
            )
            .send({
                from: wallet.address,
                gas: 100000,
                gasPrice: adjustedGasPrice.toString()
            });
        
        console.log(`VRF configuration updated, tx: ${tx.transactionHash}`);
        
        return {
            success: true,
            transactionHash: tx.transactionHash,
            updatedConfig: config
        };
        
    } catch (error) {
        console.error("Error updating VRF configuration:", error);
        throw error;
    }
};

/**
 * Gets VRF status dashboard data
 * @returns {Object} VRF status information
 */
const getVRFStatusDashboard = async () => {
    try {
        const config = await getVRFConfiguration();
        const linkBalance = await getLinkBalance();
        
        // Get recent VRF requests from database
        const recentRequests = await Raffle.find({
            "vrf.status": { $in: ["In Progress", "Fulfilled", "Failed"] }
        })
        .sort({ "vrf.requestTime": -1 })
        .limit(10)
        .select('eventId vrf createdAt')
        .lean();
        
        // Calculate statistics
        const totalRequests = await Raffle.countDocuments({
            "vrf.status": { $ne: "Pending" }
        });
        
        const fulfilledRequests = await Raffle.countDocuments({
            "vrf.status": "Fulfilled"
        });
        
        const failedRequests = await Raffle.countDocuments({
            "vrf.status": "Failed"
        });
        
        const failsafeUsed = await Raffle.countDocuments({
            "vrf.failsafeUsed": true
        });
        
        return {
            configuration: config,
            linkBalance,
            statistics: {
                totalRequests,
                fulfilledRequests,
                failedRequests,
                failsafeUsed,
                successRate: totalRequests > 0 ? ((fulfilledRequests / totalRequests) * 100).toFixed(2) : 0
            },
            recentRequests: recentRequests.map(req => ({
                eventId: req.eventId,
                status: req.vrf.status,
                transactionHash: req.vrf.transactionHash,
                polygonTxHash: req.vrf.polygonTxHash,
                failsafeUsed: req.vrf.failsafeUsed,
                createdAt: req.createdAt
            })),
            lastUpdated: new Date()
        };
        
    } catch (error) {
        console.error("Error getting VRF status dashboard:", error);
        throw error;
    }
};

/**
 * Validates VRF system health
 * @returns {Object} Health check result
 */
const validateVRFHealth = async () => {
    try {
        const checks = {
            polygonConnection: false,
            contractAccessible: false,
            walletConfigured: false,
            linkBalance: false,
            subscriptionActive: false
        };
        
        const issues = [];
        
        // Check Polygon connection
        try {
            await WEB3_POLYGON.eth.getBlockNumber();
            checks.polygonConnection = true;
        } catch (error) {
            issues.push("Cannot connect to Polygon network");
        }
        
        // Check contract accessibility
        try {
            const vrfContract = getVRFContract();
            await vrfContract.methods.chainlinkVRFSubscriptionId().call();
            checks.contractAccessible = true;
        } catch (error) {
            issues.push("VRF contract not accessible");
        }
        
        // Check wallet configuration
        try {
            const wallet = vrfWallet.getWallet();
            if (wallet && wallet.address) {
                checks.walletConfigured = true;
            }
        } catch (error) {
            issues.push("VRF wallet not properly configured");
        }
        
        // Check LINK balance
        try {
            const linkBalance = await getLinkBalance();
            if (parseFloat(linkBalance.balanceFormatted) > 1) {
                checks.linkBalance = true;
            } else {
                issues.push("LINK balance is too low");
            }
        } catch (error) {
            issues.push("Cannot check LINK balance");
        }
        
        // Check subscription status (simplified)
        try {
            const config = await getVRFConfiguration();
            if (config.subscriptionId && config.subscriptionId !== "0") {
                checks.subscriptionActive = true;
            } else {
                issues.push("VRF subscription not active");
            }
        } catch (error) {
            issues.push("Cannot verify subscription status");
        }
        
        const isHealthy = Object.values(checks).every(check => check === true);
        
        return {
            isHealthy,
            checks,
            issues,
            timestamp: new Date()
        };
        
    } catch (error) {
        console.error("Error validating VRF health:", error);
        return {
            isHealthy: false,
            checks: {},
            issues: ["Health check failed: " + error.message],
            timestamp: new Date()
        };
    }
};

/**
 * Generate batch randomness for session-based games
 * @param {number} roundsNeeded - Number of rounds needing randomness
 * @returns {Object} Batch randomness data
 */
const generateBatchRandomness = async (roundsNeeded) => {
    try {
        if (!roundsNeeded || roundsNeeded <= 0 || roundsNeeded > 2048) {
            throw new Error("Invalid rounds needed - must be between 1 and 2048");
        }

        // Use VRF wrapper for cryptographically secure randomness
        const randomnessRequest = await vrfWrapper.requestRandomness();
        
        // Generate seed from initial randomness
        const seed = randomnessRequest.randomness.slice(0, 32); // Use first 32 bytes as seed
        
        // Expand randomness using cryptographically secure method
        const expandedRandomness = await expandRandomness(seed, roundsNeeded);
        
        return {
            randomness: expandedRandomness,
            proof: randomnessRequest.proof || null,
            seed: seed,
            rounds: roundsNeeded,
            requestId: randomnessRequest.requestId,
            source: vrfWrapper.getRandomnessSource().source,
            timestamp: new Date()
        };
        
    } catch (error) {
        console.error("Error generating batch randomness:", error);
        throw error;
    }
};

/**
 * Expand initial randomness to multiple rounds using HKDF-like approach
 * @param {string} seed - Initial seed
 * @param {number} rounds - Number of rounds needed
 * @returns {Array} Array of random values for each round
 */
const expandRandomness = async (seed, rounds) => {
    try {
        const crypto = require('crypto');
        const expandedValues = [];
        
        for (let i = 0; i < rounds; i++) {
            // Create unique input for each round
            const roundInput = Buffer.concat([
                Buffer.from(seed, 'hex'),
                Buffer.from(i.toString().padStart(8, '0'))
            ]);
            
            // Generate hash for this round
            const hash = crypto.createHash('sha256').update(roundInput).digest();
            
            // Convert to random number (0-1)
            const randomValue = parseInt(hash.toString('hex').slice(0, 16), 16) / Math.pow(2, 64);
            expandedValues.push(randomValue);
        }
        
        return expandedValues;
        
    } catch (error) {
        console.error("Error expanding randomness:", error);
        throw error;
    }
};

/**
 * Verify batch randomness integrity
 * @param {Object} vrfData - VRF data to verify
 * @param {number} roundIndex - Specific round to verify
 * @returns {Object} Verification result
 */
const verifyBatchRandomness = async (vrfData, roundIndex) => {
    try {
        const { seed, rounds, randomness } = vrfData;
        
        if (roundIndex < 0 || roundIndex >= rounds) {
            throw new Error("Invalid round index");
        }
        
        // Re-generate the specific round's randomness
        const verificationValues = await expandRandomness(seed, rounds);
        
        const isValid = Math.abs(verificationValues[roundIndex] - randomness[roundIndex]) < 1e-10;
        
        return {
            isValid,
            roundIndex,
            expectedValue: verificationValues[roundIndex],
            actualValue: randomness[roundIndex],
            seed,
            timestamp: new Date()
        };
        
    } catch (error) {
        console.error("Error verifying batch randomness:", error);
        throw error;
    }
};

/**
 * Create VRF audit trail for session
 * @param {string} sessionId - Session ID
 * @param {Object} vrfData - VRF data used
 * @param {Array} gameResults - Results of each round
 * @returns {Object} Audit trail entry
 */
const createVRFAuditTrail = async (sessionId, vrfData, gameResults) => {
    try {
        const auditEntry = {
            sessionId,
            vrfRequestId: vrfData.requestId,
            seed: vrfData.seed,
            source: vrfData.source,
            totalRounds: vrfData.rounds,
            roundsUsed: gameResults.length,
            gameResults: gameResults.map((result, index) => ({
                roundIndex: index,
                randomValue: vrfData.randomness[index],
                gameOutcome: result.outcome,
                playerWin: result.playerWin,
                houseWin: result.houseWin
            })),
            createdAt: new Date(),
            verifiable: vrfData.proof !== null
        };
        
        // Store audit trail (you might want to create a dedicated collection)
        console.log(`VRF audit trail created for session ${sessionId}`);
        
        return auditEntry;
        
    } catch (error) {
        console.error("Error creating VRF audit trail:", error);
        throw error;
    }
};

module.exports = {
    // Original functions
    requestVRFRandomness,
    checkVRFFulfillment,
    useFailsafeRandomness,
    getVerifiableResult,
    handleVRFFailure,
    
    // Enhanced Polygon-optimized functions
    requestCrossChainVRFRandomness,
    checkPolygonVRFFulfillment,
    getLinkBalance,
    monitorLinkBalance,
    getVRFConfiguration,
    updateVRFConfiguration,
    getVRFStatusDashboard,
    validateVRFHealth,
    
    // Batch processing functions for session-based games
    generateBatchRandomness,
    expandRandomness,
    verifyBatchRandomness,
    createVRFAuditTrail
};