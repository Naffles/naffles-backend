/**
 * Database indexes for optimal raffle query performance
 */

const mongoose = require('mongoose');

/**
 * Apply performance indexes to raffle-related collections
 */
async function applyRaffleIndexes() {
    try {
        console.log('Applying raffle performance indexes...');
        
        // Raffle collection indexes
        const Raffle = mongoose.model('Raffle');
        
        // Compound indexes for common queries
        await Raffle.collection.createIndex(
            { 'status.isActive': 1, raffleEndDate: 1 },
            { name: 'active_raffles_by_end_date' }
        );
        
        await Raffle.collection.createIndex(
            { createdBy: 1, 'status.isCompleted': 1 },
            { name: 'user_raffles_by_completion' }
        );
        
        await Raffle.collection.createIndex(
            { lotteryTypeEnum: 1, raffleTypeEnum: 1, 'status.isActive': 1 },
            { name: 'raffles_by_type_and_status' }
        );
        
        await Raffle.collection.createIndex(
            { coinType: 1, 'status.isActive': 1, perTicketPriceNumber: 1 },
            { name: 'raffles_by_coin_and_price' }
        );
        
        await Raffle.collection.createIndex(
            { clientProfileRef: 1, 'status.isActive': 1 },
            { name: 'community_raffles', sparse: true }
        );
        
        await Raffle.collection.createIndex(
            { isFeatured: 1, 'status.isActive': 1, createdAt: -1 },
            { name: 'featured_raffles' }
        );
        
        // VRF status index for processing
        await Raffle.collection.createIndex(
            { 'vrf.status': 1, raffleEndDate: 1 },
            { name: 'vrf_processing_queue' }
        );
        
        // RaffleTicket collection indexes
        const RaffleTicket = mongoose.model('RaffleTicket');
        
        await RaffleTicket.collection.createIndex(
            { raffle: 1, purchasedBy: 1 },
            { name: 'tickets_by_raffle_and_user' }
        );
        
        await RaffleTicket.collection.createIndex(
            { purchasedBy: 1, createdAt: -1 },
            { name: 'user_ticket_history' }
        );
        
        await RaffleTicket.collection.createIndex(
            { raffle: 1, ticketNumber: 1 },
            { name: 'raffle_ticket_numbers', unique: true, sparse: true }
        );
        
        await RaffleTicket.collection.createIndex(
            { raffle: 1, isFree: 1 },
            { name: 'raffle_tickets_by_type' }
        );
        
        // RafflePrize collection indexes
        const RafflePrize = mongoose.model('RafflePrize');
        
        await RafflePrize.collection.createIndex(
            { raffle: 1 },
            { name: 'prizes_by_raffle', unique: true }
        );
        
        await RafflePrize.collection.createIndex(
            { lotteryTypeEnum: 1, validationStatus: 1 },
            { name: 'prizes_by_type_and_validation' }
        );
        
        await RafflePrize.collection.createIndex(
            { 'nftPrize.contractAddress': 1, 'nftPrize.tokenId': 1 },
            { name: 'nft_prizes', sparse: true }
        );
        
        await RafflePrize.collection.createIndex(
            { 'tokenPrize.token': 1, 'tokenPrize.chainId': 1 },
            { name: 'token_prizes', sparse: true }
        );
        
        // RaffleWinner collection indexes
        const RaffleWinner = mongoose.model('RaffleWinner');
        
        await RaffleWinner.collection.createIndex(
            { raffle: 1 },
            { name: 'winners_by_raffle', unique: true }
        );
        
        await RaffleWinner.collection.createIndex(
            { user: 1, createdAt: -1 },
            { name: 'user_wins_history' }
        );
        
        await RaffleWinner.collection.createIndex(
            { isClaimed: 1, createdAt: -1 },
            { name: 'unclaimed_prizes' }
        );
        
        // Text indexes for search functionality
        await Raffle.collection.createIndex(
            { eventId: 'text' },
            { name: 'raffle_text_search' }
        );
        
        console.log('✅ Raffle performance indexes applied successfully');
        
        return {
            success: true,
            message: 'All raffle indexes created successfully'
        };
        
    } catch (error) {
        console.error('❌ Error applying raffle indexes:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Remove all raffle indexes (for maintenance)
 */
async function removeRaffleIndexes() {
    try {
        console.log('Removing raffle indexes...');
        
        const collections = ['raffles', 'raffletickets', 'raffleprizes', 'rafflewinners'];
        
        for (const collectionName of collections) {
            const collection = mongoose.connection.db.collection(collectionName);
            const indexes = await collection.indexes();
            
            for (const index of indexes) {
                if (index.name !== '_id_') {
                    await collection.dropIndex(index.name);
                    console.log(`Dropped index: ${index.name} from ${collectionName}`);
                }
            }
        }
        
        console.log('✅ Raffle indexes removed successfully');
        return { success: true };
        
    } catch (error) {
        console.error('❌ Error removing raffle indexes:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get index statistics for raffle collections
 */
async function getRaffleIndexStats() {
    try {
        const stats = {};
        const collections = ['raffles', 'raffletickets', 'raffleprizes', 'rafflewinners'];
        
        for (const collectionName of collections) {
            const collection = mongoose.connection.db.collection(collectionName);
            const indexes = await collection.indexes();
            const indexStats = await collection.stats();
            
            stats[collectionName] = {
                indexCount: indexes.length,
                indexes: indexes.map(idx => ({
                    name: idx.name,
                    keys: idx.key,
                    unique: idx.unique || false,
                    sparse: idx.sparse || false
                })),
                totalIndexSize: indexStats.totalIndexSize,
                avgObjSize: indexStats.avgObjSize
            };
        }
        
        return { success: true, stats };
        
    } catch (error) {
        console.error('Error getting index stats:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Analyze query performance for common raffle operations
 */
async function analyzeRaffleQueryPerformance() {
    try {
        const Raffle = mongoose.model('Raffle');
        const RaffleTicket = mongoose.model('RaffleTicket');
        
        const queries = [
            {
                name: 'Active Raffles',
                collection: Raffle,
                query: { 'status.isActive': true },
                sort: { raffleEndDate: 1 }
            },
            {
                name: 'User Raffles',
                collection: Raffle,
                query: { createdBy: new mongoose.Types.ObjectId() },
                sort: { createdAt: -1 }
            },
            {
                name: 'Raffle Tickets',
                collection: RaffleTicket,
                query: { raffle: new mongoose.Types.ObjectId() },
                sort: { ticketNumber: 1 }
            }
        ];
        
        const results = [];
        
        for (const queryTest of queries) {
            const startTime = Date.now();
            const explain = await queryTest.collection
                .find(queryTest.query)
                .sort(queryTest.sort)
                .limit(100)
                .explain('executionStats');
            
            const endTime = Date.now();
            
            results.push({
                name: queryTest.name,
                executionTime: endTime - startTime,
                docsExamined: explain.executionStats.totalDocsExamined,
                docsReturned: explain.executionStats.totalDocsReturned,
                indexUsed: explain.executionStats.executionStages.indexName || 'COLLSCAN',
                efficient: explain.executionStats.totalDocsExamined === explain.executionStats.totalDocsReturned
            });
        }
        
        return { success: true, results };
        
    } catch (error) {
        console.error('Error analyzing query performance:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    applyRaffleIndexes,
    removeRaffleIndexes,
    getRaffleIndexStats,
    analyzeRaffleQueryPerformance
};