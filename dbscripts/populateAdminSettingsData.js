// const mongoose = require('mongoose');
const {
    AdminSettings,
    PointsEarningActivitiesSettings,
    JackpotAccumulationSettings
} = require('../models/admin/adminSettings');

async function populateAdminSettings() {
    console.log("populating admin settings...");

    // Check if default data already exists
    const adminSettingsExists = await AdminSettings.findOne();
    if (!adminSettingsExists) {
        await PointsEarningActivitiesSettings.deleteMany({});
        // Default Earning Activity Points Settings
        const defaultEarningActivitySettings = await PointsEarningActivitiesSettings.insertMany([
            { activity: "perReserveRaffleCreated", points: 50.0 },
            { activity: "perUnconditionalRaffleCreated", points: 100.0 },
            { activity: "perSystemGamePlayed", points: 2.0 },
            { activity: "perPlayerGamePlayed", points: 5.0 },
            { activity: "perPartnerTokenBetAmount", points: 0.25 },
            { activity: "perUnlimitedRaffleCreated", points: 2.0 },
            { activity: "perRaffleSellOut", points: 2.0 },
            { activity: "perUsd10TicketsPurchased", points: 2.0 },
            { activity: "perGameWin", points: 2.0 },
            { activity: "perUsd10BetAmount", points: 2.0 },
            { activity: "perNaffBetAmount", points: 2.0 },
            { activity: "nafflesTweetPost", points: 2.0 }
        ]);

        await JackpotAccumulationSettings.deleteMany({});
        // Default Jackpot Accumulation Settings
        const defaultJackpotAccumulationSettings = await JackpotAccumulationSettings.insertMany([
            { activity: "newAccountPoints", points: 5.0 },
            { activity: "newRafflePoints", points: 10.0 },
            { activity: "ticketPurchasePoints", points: 15.0 },
            { activity: "tokenGameCompletedPoints", points: 20.0 },
            { activity: "pointsGameCompletedPoints", points: 25.0 },
        ]);

        // Default Admin Settings
        const defaultAdminSettings = new AdminSettings({
            pointsEarningActivities: defaultEarningActivitySettings.map(setting => setting._id),
            jackpotAccumulation: defaultJackpotAccumulationSettings.map(setting => setting._id),
            jackpotPointsPerTenSeconds: 5,
            machineCreatedGamesBetValue: [
                { tokenType: 'nafflings', amount: "100" },
            ]
        });

        await defaultAdminSettings.save();
        console.log('Default admin settings created');
    } else {
        console.log('Default admin settings already exist');
    }
}

module.exports = populateAdminSettings;
