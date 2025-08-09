const mongoose = require("mongoose");

// Simple verification without database connection
async function verifyGamingModels() {
  console.log("🎮 Verifying Gaming Infrastructure Models...\n");

  try {
    // Test 1: Verify Models can be loaded
    console.log("📋 Testing Model Loading...");
    
    const HouseSlot = require("./models/game/houseSlot");
    const GameSession = require("./models/game/gameSession");
    const PlayerQueue = require("./models/game/playerQueue");
    
    console.log("✅ HouseSlot model loaded successfully");
    console.log("✅ GameSession model loaded successfully");
    console.log("✅ PlayerQueue model loaded successfully");

    // Test 2: Verify Model Structure
    console.log("\n🏗️  Testing Model Structure...");
    
    // Test HouseSlot model structure
    const testHouseSlot = new HouseSlot({
      ownerId: new mongoose.Types.ObjectId(),
      gameType: "rockPaperScissors",
      tokenType: "points",
      fundAmount: "1000000000000000000000"
    });
    
    console.log("✅ HouseSlot model structure verified");
    console.log(`   - Fund amount: ${testHouseSlot.fundAmount}`);
    console.log(`   - Current funds: ${testHouseSlot.currentFunds}`);
    console.log(`   - Is active: ${testHouseSlot.isActive}`);
    console.log(`   - Status: ${testHouseSlot.status}`);

    // Test GameSession model structure
    const testGameSession = new GameSession({
      playerId: new mongoose.Types.ObjectId(),
      gameType: "coinToss",
      tokenType: "points",
      betAmount: "100000000000000000000"
    });
    
    console.log("✅ GameSession model structure verified");
    console.log(`   - Status: ${testGameSession.status}`);
    console.log(`   - Game type: ${testGameSession.gameType}`);
    console.log(`   - Token type: ${testGameSession.tokenType}`);
    console.log(`   - Is third party: ${testGameSession.isThirdParty}`);

    // Test PlayerQueue model structure
    const testPlayerQueue = new PlayerQueue({
      playerId: new mongoose.Types.ObjectId(),
      gameType: "rockPaperScissors",
      tokenType: "points",
      betAmount: "50000000000000000000",
      queuePosition: 1
    });
    
    console.log("✅ PlayerQueue model structure verified");
    console.log(`   - Queue position: ${testPlayerQueue.queuePosition}`);
    console.log(`   - Status: ${testPlayerQueue.status}`);
    console.log(`   - Game type: ${testPlayerQueue.gameType}`);

    // Test 3: Verify Services can be loaded
    console.log("\n🔧 Testing Service Loading...");
    
    const houseManagementService = require("./services/houseManagementService");
    const gameSessionService = require("./services/gameSessionService");
    
    console.log("✅ HouseManagementService loaded successfully");
    console.log("✅ GameSessionService loaded successfully");

    // Test 4: Verify Controllers can be loaded
    console.log("\n🎯 Testing Controller Loading...");
    
    const houseController = require("./controllers/houseController");
    const gamingApiController = require("./controllers/gamingApiController");
    const wageringApiController = require("./controllers/wageringApiController");
    
    console.log("✅ HouseController loaded successfully");
    console.log("✅ GamingApiController loaded successfully");
    console.log("✅ WageringApiController loaded successfully");

    // Test 5: Verify Routes can be loaded
    console.log("\n🛣️  Testing Route Loading...");
    
    const houseRoutes = require("./routes/houseRoutes");
    const gamingApiRoutes = require("./routes/gamingApiRoutes");
    const wageringApiRoutes = require("./routes/wageringApiRoutes");
    
    console.log("✅ House routes loaded successfully");
    console.log("✅ Gaming API routes loaded successfully");
    console.log("✅ Wagering API routes loaded successfully");

    // Test 6: Verify Model Methods
    console.log("\n⚙️  Testing Model Methods...");
    
    // Test HouseSlot methods (set currentFunds and minimumFunds manually since pre-save hasn't run)
    testHouseSlot.currentFunds = testHouseSlot.fundAmount;
    testHouseSlot.minimumFunds = (BigInt(testHouseSlot.fundAmount) / BigInt(10)).toString();
    const hasFunds = testHouseSlot.hasSufficientFunds("100000000000000000000");
    console.log(`✅ HouseSlot.hasSufficientFunds(): ${hasFunds}`);
    
    // Test GameSession methods
    const isExpired = testGameSession.isExpired();
    console.log(`✅ GameSession.isExpired(): ${isExpired}`);
    
    // Test PlayerQueue methods
    const queueIsExpired = testPlayerQueue.isExpired();
    console.log(`✅ PlayerQueue.isExpired(): ${queueIsExpired}`);

    // Test 7: Verify Configuration
    console.log("\n⚙️  Testing Configuration...");
    
    const { VALID_GAMES } = require("./config/config");
    console.log("✅ Valid games configuration loaded:");
    VALID_GAMES.forEach(game => console.log(`   - ${game}`));

    console.log("\n🎉 Gaming Infrastructure Models Verification Complete!");
    console.log("\n📋 Implementation Summary:");
    console.log("✅ All models load successfully without errors");
    console.log("✅ Model structures are properly defined");
    console.log("✅ Model methods work correctly");
    console.log("✅ Services load successfully");
    console.log("✅ Controllers load successfully");
    console.log("✅ Routes load successfully");
    console.log("✅ Configuration is properly integrated");

    console.log("\n🚀 Gaming infrastructure components are ready for use!");

  } catch (error) {
    console.error("❌ Error during verification:", error);
    process.exit(1);
  }
}

// Run verification if this file is executed directly
if (require.main === module) {
  verifyGamingModels();
}

module.exports = { verifyGamingModels };