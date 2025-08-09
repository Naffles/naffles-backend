/**
 * Custom error class for raffle-related errors
 */
class RaffleError extends Error {
    constructor(message, code, statusCode = 500, details = null) {
        super(message);
        this.name = 'RaffleError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date().toISOString();
        
        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, RaffleError);
        }
    }

    /**
     * Convert error to JSON for API responses
     */
    toJSON() {
        return {
            error: {
                name: this.name,
                message: this.message,
                code: this.code,
                statusCode: this.statusCode,
                details: this.details,
                timestamp: this.timestamp
            }
        };
    }

    /**
     * Static factory methods for common errors
     */
    static insufficientBalance(token, required, available) {
        return new RaffleError(
            `Insufficient ${token} balance. Required: ${required}, Available: ${available}`,
            'INSUFFICIENT_BALANCE',
            400,
            { token, required, available }
        );
    }

    static raffleNotFound(raffleId) {
        return new RaffleError(
            `Raffle not found: ${raffleId}`,
            'RAFFLE_NOT_FOUND',
            404,
            { raffleId }
        );
    }

    static raffleEnded(raffleId) {
        return new RaffleError(
            `Raffle has already ended: ${raffleId}`,
            'RAFFLE_ENDED',
            400,
            { raffleId }
        );
    }

    static ticketsUnavailable(available, requested) {
        return new RaffleError(
            `Not enough tickets available. Available: ${available}, Requested: ${requested}`,
            'TICKETS_UNAVAILABLE',
            400,
            { available, requested }
        );
    }

    static invalidAsset(assetType, reason) {
        return new RaffleError(
            `Invalid ${assetType}: ${reason}`,
            'INVALID_ASSET',
            400,
            { assetType, reason }
        );
    }

    static unauthorized(action, userId, raffleId) {
        return new RaffleError(
            `User ${userId} is not authorized to ${action} raffle ${raffleId}`,
            'UNAUTHORIZED',
            403,
            { action, userId, raffleId }
        );
    }

    static vrfFailure(raffleId, reason) {
        return new RaffleError(
            `VRF failed for raffle ${raffleId}: ${reason}`,
            'VRF_FAILURE',
            500,
            { raffleId, reason }
        );
    }

    static escrowFailure(raffleId, operation, reason) {
        return new RaffleError(
            `Escrow ${operation} failed for raffle ${raffleId}: ${reason}`,
            'ESCROW_FAILURE',
            500,
            { raffleId, operation, reason }
        );
    }
}

module.exports = RaffleError;