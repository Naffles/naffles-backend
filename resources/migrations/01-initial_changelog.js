const bcrypt = require("bcryptjs");

module.exports = {
    async up(db, client) {
        const collectionsToPopulate = [
            "activegames",
            "adminsettings",
            "deposits",
            "gameanalytics",
            "gamehistories",
            "giveaways",
            "jackpotaccumulationsettings",
            "jackpothistories",
            "jackpots",
            "messages",
            "pointsearningactivitiessettings",
            "raffleprizes",
            "raffles",
            "ticketdiscounts",
            "treasuries",
            "uploadablecontentsettings",
            "userdepositandwithdrawhistories",
            "users",
            "userstats",
            "walletaddresses",
            "walletbalances",
            "withdraws"
        ];

        // Drop collections if exists then create
        for(const name of collectionsToPopulate) {
            const collections = await db.listCollections({ name }).toArray();

            if(collections.length > 0) {
                console.log(`Cleaning collection: ${name}`);
                await db.collection(name).deleteMany({});
            }
        }

        // Initial Data dump
        // Admin settings - Points earning activities
        const defaultEarningActivitySettings = await db.collection("pointsearningactivitiessettings").insertMany([
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

        // Admin settings - Jackpot accumulation settings
        const defaultJackpotAccumulationSettings = await db.collection("jackpotaccumulationsettings").insertMany([
            { activity: "newAccountPoints", points: 5.0 },
            { activity: "newRafflePoints", points: 10.0 },
            { activity: "ticketPurchasePoints", points: 15.0 },
            { activity: "tokenGameCompletedPoints", points: 20.0 },
            { activity: "pointsGameCompletedPoints", points: 25.0 }
        ]);

        // Admin settings - General
        await db.collection("adminsettings").insertOne({
            canCreateRaffle: "everyone",
            raffleTokenCountRequired: 2000,
            raffleFeePercentage: 0.03,
            wageringFeePercentage: 0.03,
            allowSellersReserveRaffles: true,
            salesRoyalties: true,
            openEntryExchangeRate: 500,
            pointsEarningActivities: Object.values(defaultEarningActivitySettings.insertedIds),
            jackpotAccumulation: Object.values(defaultJackpotAccumulationSettings.insertedIds),
            jackpotPointsPerTenSeconds: 5,
            maximumDailyPoints: 50,
            machineCreatedGamesBetValue: [
                { tokenType: "nafflings", amount: "0" },
                { tokenType: "eth", amount: "0" },
                { tokenType: "sol", amount: "0" },
            ]
        });

        const userResult = await db.collection("users").insertOne({
            temporaryPoints: "0",
            temporaryPointsAsNumber: 0,
            profileImage: "",
            username: "supernaffler001",
            email: "devnaffles@gmail.com",
            password: await bcrypt.hash("M@0y5zjhK$", 12),
            role: "super"
        });

        // Ticket discounts
        await db.collection("ticketdiscounts").insertMany([
            { code: 1, name: "No discount" },
            { code: 2, name: "1/5/10 free per 5/20/50 sold" },
            { code: 3, name: "2/5/20 free per 5/10/25 sold" }
        ]);

        // Jackpot initialization
        const jackpotResult = await db.collection("jackpots").insertOne({
            prizePoolType: "nafflings",
            totalAmount: 0,
            isGiveaway: true,
            isActive: true,
            lastUpdated: Date.now()
        });

        // Admin giveaway
        // Calculate dates
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 7);
        const scheduledDrawDate = new Date(endDate);
        scheduledDrawDate.setDate(endDate.getDate() + 1);
        await db.collection("giveaways").insertOne({
            jackpot: jackpotResult.insertedId,
            startDate: startDate,
            endDate: endDate,
            scheduledDrawDate: scheduledDrawDate,
            createdBy: userResult.insertedId,
            status: { isActive: true, wonBy: null },
            homepageDurationDays: 3
        });

        // Treasury
        await db.collection("treasuries").insertOne({
            balances: { eth: "0", sol: "0" }
        });

        // No initial jackpot histories
        // No initial user stats
        // No initial analytics
    },
  
    async down(db, client) {
        // Drop collections
        await db.collection("activegames").drop();
        await db.collection("adminsettings").drop();
        await db.collection("deposits").drop();
        await db.collection("gameanalytics").drop();
        await db.collection("gamehistories").drop();
        await db.collection("giveaways").drop();
        await db.collection("jackpotaccumulationsettings").drop();
        await db.collection("jackpothistories").drop();
        await db.collection("jackpots").drop();
        await db.collection("messages").drop();
        await db.collection("pointsearningactivitiessettings").drop();
        await db.collection("raffleprizes").drop();
        await db.collection("raffles").drop();
        await db.collection("ticketdiscounts").drop();
        await db.collection("treasuries").drop();
        await db.collection("uploadablecontentsettings").drop();
        await db.collection("userdepositandwithdrawhistories").drop();
        await db.collection("users").drop();
        await db.collection("userstats").drop();
        await db.collection("walletaddresses").drop();
        await db.collection("walletbalances").drop();
        await db.collection("withdraws").drop();
    }
  };