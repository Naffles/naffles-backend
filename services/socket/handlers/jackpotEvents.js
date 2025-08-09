const mongoose = require('mongoose');
const Jackpot = require('../../../models/jackpot/jackpot'); // Adjust the path as necessary
const { AdminSettings, JackpotAccumulationSettings } = require('../../../models/admin/adminSettings');

// update jackpot based on activity
function updateJackpotByActivity(io, socket) {
    return async({ activity }) => {
        try {
            const { points } = activity;
            let jackpot = await Jackpot.findOne();
    
            if (!jackpot) {
                jackpot = new Jackpot({ totalAmount: 0 });
            }
    
            jackpot.totalAmount += points;
    
            await jackpot.save();
    
            io.emit('jackpotUpdate', jackpot);
    
            return jackpot;
        } catch (error) {
            console.error('Error incrementing jackpot by activity:', error);
        }
    }
}

module.exports = { updateJackpotByActivity };
