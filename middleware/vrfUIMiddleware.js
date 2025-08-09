/**
 * VRF UI Middleware
 * Handles UI logic for VRF results, including hiding Chainlink transaction IDs when failsafe is used
 */

/**
 * Process VRF data for UI display
 * @param {Object} vrfData - VRF data from raffle
 * @returns {Object} Processed VRF data for UI
 */
const processVRFForUI = (vrfData) => {
    if (!vrfData) {
        return {
            status: 'Pending',
            showTransactionHash: false,
            showVerificationLink: false,
            isVerifiable: false
        };
    }

    const processed = {
        status: vrfData.status,
        winningTicketNumber: vrfData.winningTicketNumber,
        failsafeUsed: vrfData.failsafeUsed || false,
        sourceChain: vrfData.sourceChain || 'ethereum',
        isVerifiable: !vrfData.failsafeUsed && vrfData.status === 'Fulfilled'
    };

    // Hide transaction hash and verification links when failsafe is used
    if (vrfData.failsafeUsed) {
        processed.showTransactionHash = false;
        processed.showVerificationLink = false;
        processed.transactionHash = null;
        processed.polygonTxHash = null;
        processed.verificationMessage = 'Result generated using secure off-chain randomness';
    } else {
        processed.showTransactionHash = !!vrfData.polygonTxHash;
        processed.showVerificationLink = !!vrfData.polygonTxHash;
        processed.transactionHash = vrfData.transactionHash;
        processed.polygonTxHash = vrfData.polygonTxHash;
        
        if (vrfData.polygonTxHash) {
            processed.verificationUrl = `https://polygonscan.com/tx/${vrfData.polygonTxHash}`;
            processed.verificationMessage = 'Result verified on Polygon blockchain';
        }
    }

    return processed;
};

/**
 * Middleware to process VRF data in API responses
 */
const vrfUIMiddleware = (req, res, next) => {
    // Store original json method
    const originalJson = res.json;

    // Override json method to process VRF data
    res.json = function(data) {
        if (data && typeof data === 'object') {
            // Process single raffle
            if (data.vrf) {
                data.vrf = processVRFForUI(data.vrf);
            }

            // Process array of raffles
            if (data.raffles && Array.isArray(data.raffles)) {
                data.raffles = data.raffles.map(raffle => {
                    if (raffle.vrf) {
                        raffle.vrf = processVRFForUI(raffle.vrf);
                    }
                    return raffle;
                });
            }

            // Process data.data structure
            if (data.data) {
                if (data.data.vrf) {
                    data.data.vrf = processVRFForUI(data.data.vrf);
                }

                if (data.data.raffles && Array.isArray(data.data.raffles)) {
                    data.data.raffles = data.data.raffles.map(raffle => {
                        if (raffle.vrf) {
                            raffle.vrf = processVRFForUI(raffle.vrf);
                        }
                        return raffle;
                    });
                }

                // Handle single raffle in data
                if (data.data.raffle && data.data.raffle.vrf) {
                    data.data.raffle.vrf = processVRFForUI(data.data.raffle.vrf);
                }
            }
        }

        // Call original json method
        return originalJson.call(this, data);
    };

    next();
};

/**
 * Process VRF verification result for UI
 * @param {Object} verificationResult - VRF verification result
 * @returns {Object} Processed verification result for UI
 */
const processVerificationForUI = (verificationResult) => {
    if (!verificationResult) {
        return null;
    }

    const processed = {
        verified: verificationResult.verified,
        raffleId: verificationResult.raffleId,
        eventId: verificationResult.eventId,
        winningTicketNumber: verificationResult.winningTicketNumber || verificationResult.storedWinningNumber,
        failsafeUsed: verificationResult.failsafeUsed || false,
        timestamp: verificationResult.timestamp
    };

    if (verificationResult.failsafeUsed) {
        processed.verificationStatus = 'failsafe';
        processed.verificationMessage = 'Secure off-chain randomness was used for this result';
        processed.showBlockchainDetails = false;
    } else if (verificationResult.verified) {
        processed.verificationStatus = 'verified';
        processed.verificationMessage = 'Result verified on Polygon blockchain';
        processed.showBlockchainDetails = true;
        processed.polygonTxHash = verificationResult.polygonTxHash;
        processed.verificationUrl = verificationResult.verificationUrl;
        processed.blockNumber = verificationResult.blockNumber;
        processed.sourceChain = verificationResult.sourceChain;
    } else {
        processed.verificationStatus = 'unverified';
        processed.verificationMessage = verificationResult.reason || 'Unable to verify result';
        processed.showBlockchainDetails = false;
    }

    return processed;
};

/**
 * Get VRF status display information
 * @param {String} status - VRF status
 * @param {Boolean} failsafeUsed - Whether failsafe was used
 * @returns {Object} Status display information
 */
const getVRFStatusDisplay = (status, failsafeUsed = false) => {
    const statusMap = {
        'Pending': {
            label: 'Pending',
            color: 'gray',
            description: 'Waiting for raffle to end',
            showSpinner: false
        },
        'In Progress': {
            label: 'Drawing Winner',
            color: 'blue',
            description: 'Generating random number...',
            showSpinner: true
        },
        'Fulfilled': {
            label: failsafeUsed ? 'Winner Selected' : 'Winner Verified',
            color: 'green',
            description: failsafeUsed ? 
                'Winner selected using secure randomness' : 
                'Winner verified on blockchain',
            showSpinner: false
        },
        'Failed': {
            label: 'Processing',
            color: 'yellow',
            description: 'Finalizing winner selection...',
            showSpinner: true
        },
        'Completed': {
            label: 'Complete',
            color: 'green',
            description: 'Raffle completed successfully',
            showSpinner: false
        }
    };

    return statusMap[status] || statusMap['Pending'];
};

/**
 * Format VRF data for public API (removes sensitive information)
 * @param {Object} vrfData - VRF data
 * @returns {Object} Public VRF data
 */
const formatVRFForPublicAPI = (vrfData) => {
    if (!vrfData) {
        return null;
    }

    const publicData = {
        status: vrfData.status,
        winningTicketNumber: vrfData.winningTicketNumber,
        isVerifiable: !vrfData.failsafeUsed && vrfData.status === 'Fulfilled'
    };

    // Only include verification info if not using failsafe
    if (!vrfData.failsafeUsed && vrfData.polygonTxHash) {
        publicData.verificationUrl = `https://polygonscan.com/tx/${vrfData.polygonTxHash}`;
        publicData.sourceChain = vrfData.sourceChain;
    }

    // Add status display information
    publicData.statusDisplay = getVRFStatusDisplay(vrfData.status, vrfData.failsafeUsed);

    return publicData;
};

module.exports = {
    vrfUIMiddleware,
    processVRFForUI,
    processVerificationForUI,
    getVRFStatusDisplay,
    formatVRFForPublicAPI
};