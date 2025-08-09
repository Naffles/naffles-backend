const { WEB3_POLYGON, getVRFContract } = require('../config/vrfPolygon');
const Raffle = require('../models/raffle/raffle');

/**
 * VRF Verification Utilities
 * Provides functions for verifying VRF randomness on-chain
 */

/**
 * Verify VRF result on Polygon blockchain
 * @param {String} raffleId - Raffle ID to verify
 * @returns {Object} Verification result
 */
const verifyVRFResult = async (raffleId) => {
    try {
        const raffle = await Raffle.findById(raffleId);
        if (!raffle) {
            throw new Error('Raffle not found');
        }

        // Skip verification if failsafe was used
        if (raffle.vrf.failsafeUsed) {
            return {
                verified: false,
                reason: 'Failsafe randomness used - not verifiable on-chain',
                raffleId,
                eventId: raffle.eventId,
                winningTicketNumber: raffle.vrf.winningTicketNumber,
                failsafeUsed: true
            };
        }

        if (!raffle.vrf.transactionHash || !raffle.vrf.polygonTxHash) {
            throw new Error('No VRF transaction hash found');
        }

        const vrfContract = getVRFContract();
        const naffleId = raffle.eventId;

        // Get the Chainlink request ID
        const chainlinkRequestId = await vrfContract.methods
            .naffleIdToChainlinkRequestId(naffleId)
            .call();

        if (!chainlinkRequestId || chainlinkRequestId === '0') {
            throw new Error('No Chainlink request found for this raffle');
        }

        // Get the request status from contract
        const requestStatus = await vrfContract.methods
            .chainlinkRequestStatus(chainlinkRequestId)
            .call();

        if (!requestStatus.fulfilled) {
            return {
                verified: false,
                reason: 'VRF request not yet fulfilled on-chain',
                raffleId,
                eventId: raffle.eventId,
                chainlinkRequestId,
                status: 'pending'
            };
        }

        // Verify the random number matches
        const onChainRandomNumber = parseInt(requestStatus.randomNumber.toString());
        const storedWinningNumber = raffle.vrf.winningTicketNumber;

        const isValid = onChainRandomNumber === storedWinningNumber;

        // Get transaction details
        const txDetails = await getTransactionDetails(raffle.vrf.polygonTxHash);

        return {
            verified: isValid,
            raffleId,
            eventId: raffle.eventId,
            chainlinkRequestId,
            onChainRandomNumber,
            storedWinningNumber,
            polygonTxHash: raffle.vrf.polygonTxHash,
            blockNumber: txDetails.blockNumber,
            blockHash: txDetails.blockHash,
            transactionIndex: txDetails.transactionIndex,
            sourceChain: requestStatus.sourceChain || raffle.vrf.sourceChain,
            verificationUrl: `https://polygonscan.com/tx/${raffle.vrf.polygonTxHash}`,
            timestamp: new Date(),
            failsafeUsed: false
        };

    } catch (error) {
        console.error('Error verifying VRF result:', error);
        throw error;
    }
};

/**
 * Get transaction details from Polygon
 * @param {String} txHash - Transaction hash
 * @returns {Object} Transaction details
 */
const getTransactionDetails = async (txHash) => {
    try {
        const receipt = await WEB3_POLYGON.eth.getTransactionReceipt(txHash);
        const transaction = await WEB3_POLYGON.eth.getTransaction(txHash);

        return {
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash,
            transactionIndex: receipt.transactionIndex,
            gasUsed: receipt.gasUsed,
            status: receipt.status,
            from: transaction.from,
            to: transaction.to,
            gasPrice: transaction.gasPrice,
            timestamp: await getBlockTimestamp(receipt.blockNumber)
        };

    } catch (error) {
        console.error('Error getting transaction details:', error);
        return {
            blockNumber: null,
            blockHash: null,
            transactionIndex: null,
            error: error.message
        };
    }
};

/**
 * Get block timestamp
 * @param {Number} blockNumber - Block number
 * @returns {Date} Block timestamp
 */
const getBlockTimestamp = async (blockNumber) => {
    try {
        const block = await WEB3_POLYGON.eth.getBlock(blockNumber);
        return new Date(Number(block.timestamp) * 1000);
    } catch (error) {
        console.error('Error getting block timestamp:', error);
        return null;
    }
};

/**
 * Batch verify multiple VRF results
 * @param {Array} raffleIds - Array of raffle IDs
 * @returns {Array} Array of verification results
 */
const batchVerifyVRFResults = async (raffleIds) => {
    try {
        const results = [];

        for (const raffleId of raffleIds) {
            try {
                const result = await verifyVRFResult(raffleId);
                results.push(result);
            } catch (error) {
                results.push({
                    verified: false,
                    raffleId,
                    error: error.message
                });
            }
        }

        return results;

    } catch (error) {
        console.error('Error in batch VRF verification:', error);
        throw error;
    }
};

/**
 * Generate verification report for admin
 * @param {Object} filters - Filters for report generation
 * @returns {Object} Verification report
 */
const generateVerificationReport = async (filters = {}) => {
    try {
        const {
            startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
            endDate = new Date(),
            status = 'Fulfilled'
        } = filters;

        // Get raffles to verify
        const raffles = await Raffle.find({
            'vrf.status': status,
            'createdAt': { $gte: startDate, $lte: endDate }
        })
        .select('_id eventId vrf createdAt')
        .lean();

        const raffleIds = raffles.map(r => r._id.toString());
        const verificationResults = await batchVerifyVRFResults(raffleIds);

        // Calculate statistics
        const totalRaffles = verificationResults.length;
        const verifiedRaffles = verificationResults.filter(r => r.verified).length;
        const failsafeRaffles = verificationResults.filter(r => r.failsafeUsed).length;
        const errorRaffles = verificationResults.filter(r => r.error).length;

        const report = {
            period: {
                startDate,
                endDate
            },
            statistics: {
                totalRaffles,
                verifiedRaffles,
                failsafeRaffles,
                errorRaffles,
                verificationRate: totalRaffles > 0 ? ((verifiedRaffles / totalRaffles) * 100).toFixed(2) : 0,
                failsafeRate: totalRaffles > 0 ? ((failsafeRaffles / totalRaffles) * 100).toFixed(2) : 0
            },
            results: verificationResults,
            generatedAt: new Date()
        };

        return report;

    } catch (error) {
        console.error('Error generating verification report:', error);
        throw error;
    }
};

/**
 * Verify VRF configuration is working
 * @returns {Object} Configuration verification result
 */
const verifyVRFConfiguration = async () => {
    try {
        const vrfContract = getVRFContract();

        // Test contract accessibility
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

        // Verify configuration values
        const checks = {
            contractAccessible: true,
            subscriptionIdSet: subscriptionId && subscriptionId !== '0',
            keyHashSet: keyHash && keyHash !== '0x0000000000000000000000000000000000000000000000000000000000000000',
            callbackGasLimitSet: callbackGasLimit && Number(callbackGasLimit) > 0,
            coordinatorSet: coordinator && coordinator !== '0x0000000000000000000000000000000000000000'
        };

        const allChecksPass = Object.values(checks).every(check => check === true);

        return {
            isValid: allChecksPass,
            checks,
            configuration: {
                subscriptionId: subscriptionId.toString(),
                keyHash,
                callbackGasLimit: Number(callbackGasLimit),
                coordinator
            },
            timestamp: new Date()
        };

    } catch (error) {
        console.error('Error verifying VRF configuration:', error);
        return {
            isValid: false,
            error: error.message,
            timestamp: new Date()
        };
    }
};

module.exports = {
    verifyVRFResult,
    getTransactionDetails,
    batchVerifyVRFResults,
    generateVerificationReport,
    verifyVRFConfiguration
};