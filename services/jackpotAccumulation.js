const { AdminSettings, JackpotAccumulationSettings } = require("../models/admin/adminSettings");
const { JACKPOT_INTERVAL_SECONDS } = require("../config/config");
const Jackpot = require("../models/jackpot/jackpot");
const io = require("../config/socket");
const {
    NEW_ACCOUNT_CREATED,
    NEW_RAFFLE_CREATED,
    RAFFLE_TICKET_PURCHASE,
    TOKEN_GAME_COMPLETED,
    POINTS_GAME_COMPLETED 
} = require("../utils/constants/JackpotAccumulationConstants");

// Initialize jackpot on startup
async function initializeJackpot(options = {}) {
    const {
        prizePoolType = "nafflings",
        startingAmount = 0,
        isGiveaway = false,
        isActive = true
    } = options;
    try {
        let jackpot;
        // Check if a giveaway jackpot of prizePoolType already exists
        if(isGiveaway) {
            jackpot = await Jackpot.findOne({
                prizePoolType: prizePoolType,
                isGiveaway: true
            });

            if (jackpot && jackpot.isActive) {
                console.log("Giveaway jackpot is active");
                return;
            }
        }

        /**
         * If no active giveaway jackpot of prizePoolType exists
         * or isGiveaway = false, create or update the jackpot
         */
        if (!jackpot) {
            // Create a new jackpot if no existing inactive giveaway jackpot was found
            jackpot = new Jackpot({
                prizePoolType: prizePoolType,
                totalAmount: startingAmount,
                isActive: isActive,
                isGiveaway: isGiveaway,
                lastUpdated: Date.now()
            });
            await jackpot.save();
        } else {
            // Update the existing inactive giveaway jackpot
            jackpot.totalAmount = startingAmount;
            jackpot.isActive = isActive;
            jackpot.lastUpdated = Date.now(); // Set to the current time
            await jackpot.save();
            console.log("Existing inactive Giveaway Jackpot reinitialized:", jackpot._id);
        }

        return jackpot;
    } catch (error) {
        console.log("Error populating jackpot data:", error);
        throw error;
    }
}

// Compute jackpot accumulated points per 10 seconds
async function calculateAndUpdateJackpot(jackpot, params = {}) {
    console.log(`Calculating and updating the jackpot... interval is ${JACKPOT_INTERVAL_SECONDS}`);
    const { winner = null, update = true, session = null } = params;
    try {
        const adminSettings = await AdminSettings.findOne();
        if (!adminSettings) {
            console.error("Admin settings not found.");
            return;
        }
        // Calculate points accumulated since the last update
        const lastUpdated = jackpot.lastUpdated;
        const pointsPer10Seconds = adminSettings.jackpotPointsPerTenSeconds;
        const pointsAccumulated = await getPointsAccumulated(lastUpdated, pointsPer10Seconds);
        
        // Update the jackpot value based on admin settings
        jackpot.totalAmount += pointsAccumulated;
        jackpot.lastUpdated = Date.now();

        const currentJackpotPrize = jackpot.totalAmount;
        if(winner) {
            console.log(`Jackpot has been won by ${winner} Setting jackpot amount to 0`)
            jackpot.totalAmount = 0;
        }

        if(update) await jackpot.save({ session });
        // Emit the updated jackpot value
        io.emit("jackpotUpdate", jackpot);
        return currentJackpotPrize;
    } catch (error) {
        console.error('Error updating jackpot:', error);
        throw error;
    }
}

async function getPointsAccumulated(lastUpdated, pointsPer10Seconds) {
    const now = Date.now();
    const timeDifference = now - lastUpdated;
    const timeDifferenceInSeconds = timeDifference / 1000;

    // Calculate the number of complete ten-second intervals that have passed since last update
    const completeIntervals = Math.floor(timeDifferenceInSeconds / JACKPOT_INTERVAL_SECONDS);
    
    // Calculate points accumulated since the last update
    return pointsPer10Seconds * completeIntervals;
}

async function updateJackpot(settingType, session = null) {
    // TODO make it so that it updates all 
    // active giveaway jackpots of any prizePoolType
    const jackpot = await Jackpot.findOne({ isGiveaway: true });
    let setting = {};
    try {
        switch(settingType) {
            case NEW_ACCOUNT_CREATED : {
                setting = await JackpotAccumulationSettings.findOne({ activity: "newAccountPoints" });
                break;
            }
            case NEW_RAFFLE_CREATED : {
                setting = await JackpotAccumulationSettings.findOne({ activity: "newRafflePoints" });
                break;
            }
            case RAFFLE_TICKET_PURCHASE : {
                setting = await JackpotAccumulationSettings.findOne({ activity: "ticketPurchasePoints" });
                break;
            }
            case TOKEN_GAME_COMPLETED : {
                setting = await JackpotAccumulationSettings.findOne({ activity: "tokenGameCompletedPoints" });
                break;
            }
            case POINTS_GAME_COMPLETED : {
                setting = await JackpotAccumulationSettings.findOne({ activity: "pointsGameCompletedPoints" });
                break;
            }
            default : {
                console.log("Invalid settingType");
                return false;
            }
        }
    } catch(err) {
        console.log("Error updating jackpot with settingType:", settingType, "| error:", err);
        throw err;
    }
    jackpot.totalAmount += setting.points;
    await jackpot.save({ session });

    return true;
}

module.exports = { 
    initializeJackpot,
    calculateAndUpdateJackpot,
    getPointsAccumulated,
    updateJackpot,
}
