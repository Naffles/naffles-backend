// const mongoose = require("mongoose");
const Raffle = require("../models/raffle/raffle");
const User = require("../models/user/user");
const { initializeJackpot } = require("../services/jackpotAccumulation");

const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function populateRaffles() {
    console.log("populating raffles data...");

    try {
        // Find existing raffles
        const raffleExists = await Raffle.findOne();
        const users = await User.find({}).limit(10).exec();

        // Create raffles if not exists
        if (!raffleExists && users.length > 0) {
            for (let i = 0; i < 10; i++) {
                const startDate = new Date();
                startDate.setDate(startDate.getDate() + i * 2); // Sets a different start date for each raffle
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 10); // Each raffle ends 10 days after it starts
                const drawDate = new Date(endDate);
                drawDate.setDate(drawDate.getDate() + 1); // Draw date is one day after the end date

                const isActive = Math.random() < 0.5;
                const status = {
                    isActive: isActive,
                    wonBy: isActive ? null : getRandomElement(users)._id
                }

                const startingAmounts = [0, 2000, 4000, 6000];
                const jackpot = await initializeJackpot({ startingAmount: getRandomElement(startingAmounts) });

                let createdBy;
                if (status.wonBy) {
                    // Ensure createdBy is not the same as wonBy
                    do {
                        createdBy = getRandomElement(users)._id;
                    } while (createdBy === status.wonBy);
                } else {
                    createdBy = getRandomElement(users)._id;
                }

                const isGiveaway = Math.random() < 0.3; // Randomly makes some raffles giveaways
                const newRaffle = new Raffle({
                    jackpot: jackpot._id,
                    startDate: startDate,
                    endDate: endDate,
                    scheduledDrawDate: drawDate,
                    createdBy: createdBy,
                    status: status, // Randomly sets some raffles to active
                    ticketsSold: Math.floor(Math.random() * 100),
                    ticketsAvailable: 100,
                    homepageDuration: isGiveaway ? Math.floor(Math.random() * 10) : null
                });

                await newRaffle.save();
            }

            console.log('Dummy raffles created!');
        } else {
            console.log("Raffles data exists");
        }
    } catch (error) {
        console.log("Error populating raffles data:", error);
    }
}

module.exports = populateRaffles;