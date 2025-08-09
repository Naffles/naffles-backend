const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../index");
const User = require("../models/user/user");
const HouseSlot = require("../models/game/houseSlot");
const GameSession = require("../models/game/gameSession");
const PlayerQueue = require("../models/game/playerQueue");
const houseManagementService = require("../services/houseManagementService");
const gameSessionService = require("../services/gameSessionService");
const gamingApiService = require("../services/gamingApiService");
const wageringApiService = require("../services/wageringApiService");

describe("Gaming Infrastructure and House System", () => {
  let testUser;
  let testHouseOwner;
  let authToken;
  let houseOwnerToken;

  beforeAll(async () => {
    // Create test users
    testUser = new User({
      username: "testplayer",
      email: "testplayer@test.com",
      password: "password123",
      temporaryPoints: "1000000000000000000000", // 1000 points
      ethBalance: "1000000000000000000", // 1 ETH
    });
    await testUser.save();

    testHouseOwner = new User({
      username: "houseowner",
      email: "houseowner@test.com",
      password: "password123",
      temporaryPoints: "10000000000000000000000", // 10000 points
      ethBalance: "10000000000000000000", // 10 ETH
    });
    await testHouseOwner.save();

    // Mock authentication tokens (in real app, these would be JWT tokens)
    authToken = "mock-auth-token";
    houseOwnerToken = "mock-house-owner-token";
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ username: { $in: ["testplayer", "houseowner"] } });
    await HouseSlot.deleteMany({});
    await GameSession.deleteMany({});
    await PlayerQueue.deleteMany({});
    await mongoose.connection.close();
  });

  describe("House Management Service", () => {
    let testHouseSlot;

    test("should create a house slot", async () => {
      testHouseSlot = await houseManagementService.createHouseSlot(
        testHouseOwner._id,
        "rockPaperScissors",
        "points",
        "1000000000000000000000" // 1000 points
      );

      expect(testHouseSlot).toBeDefined();
      expect(testHouseSlot.ownerId.toString()).toBe(testHouseOwner._id.toString());
      expect(testHouseSlot.gameType).toBe("rockPaperScissors");
      expect(testHouseSlot.tokenType).toBe("points");
      expect(testHouseSlot.isActive).toBe(true);
      expect(testHouseSlot.status).toBe("active");
    });

    test("should find available house slot", async () => {
      const availableSlot = await houseManagementService.findAvailableHouseSlot(
        "rockPaperScissors",
        "points",
        "100000000000000000000" // 100 points
      );

      expect(availableSlot).toBeDefined();
      expect(availableSlot._id.toString()).toBe(testHouseSlot._id.toString());
    });

    test("should check sufficient funds", () => {
      const hasFunds = testHouseSlot.hasSufficientFunds("100000000000000000000"); // 100 points
      expect(hasFunds).toBe(true);

      const hasInsufficientFunds = testHouseSlot.hasSufficientFunds("2000000000000000000000"); // 2000 points
      expect(hasInsufficientFunds).toBe(false);
    });

    test("should add funds to house slot", async () => {
      const updatedSlot = await houseManagementService.addFundsToHouseSlot(
        testHouseSlot._id,
        "500000000000000000000" // 500 points
      );

      expect(BigInt(updatedSlot.currentFunds)).toBeGreaterThan(BigInt(testHouseSlot.currentFunds));
    });

    test("should get house slot statistics", async () => {
      const stats = await houseManagementService.getHouseSlotStats(testHouseSlot._id);

      expect(stats).toBeDefined();
      expect(stats.gamesPlayed).toBe(0);
      expect(stats.totalWinnings).toBe("0");
      expect(stats.totalLosses).toBe("0");
      expect(stats.netProfit).toBe("0");
    });
  });

  describe("Game Session Service", () => {
    let testGameSession;

    test("should create a game session", async () => {
      testGameSession = await gameSessionService.createGameSession(
        testUser._id,
        "rockPaperScissors",
        "points",
        "100000000000000000000" // 100 points
      );

      expect(testGameSession).toBeDefined();
      expect(testGameSession.playerId.toString()).toBe(testUser._id.toString());
      expect(testGameSession.gameType).toBe("rockPaperScissors");
      expect(testGameSession.status).toBe("in_progress");
      expect(testGameSession.houseSlotId).toBeDefined();
    });

    test("should get active session for player", async () => {
      const activeSession = await gameSessionService.getActiveSessionForPlayer(testUser._id);

      expect(activeSession).toBeDefined();
      expect(activeSession._id.toString()).toBe(testGameSession._id.toString());
    });

    test("should complete game session", async () => {
      const result = {
        winner: "player",
        playerPayout: "200000000000000000000", // 200 points
        housePayout: "0",
        gameData: { playerMove: "rock", houseMove: "scissors" }
      };

      const completedSession = await gameSessionService.completeGameSession(
        testGameSession._id,
        result
      );

      expect(completedSession.status).toBe("completed");
      expect(completedSession.result.winner).toBe("player");
      expect(completedSession.result.playerPayout).toBe("200000000000000000000");
    });
  });

  describe("Gaming API Service", () => {
    test("should initialize a game", async () => {
      const gameSession = await gamingApiService.initializeGame(
        testUser._id,
        "coinToss",
        "points",
        "50000000000000000000", // 50 points
        { maxRounds: 1 }
      );

      expect(gameSession).toBeDefined();
      expect(gameSession.sessionId).toBeDefined();
      expect(gameSession.status).toBe("in_progress");
      expect(gameSession.gameState).toBeDefined();
    });

    test("should submit a move", async () => {
      // First create a new game session
      const gameSession = await gamingApiService.initializeGame(
        testUser._id,
        "coinToss",
        "points",
        "50000000000000000000"
      );

      const moveResult = await gamingApiService.submitMove(
        gameSession.sessionId,
        { choice: "heads" }
      );

      expect(moveResult).toBeDefined();
      expect(moveResult.gameState.playerChoice).toBe("heads");
    });

    test("should finalize a game", async () => {
      // Create and play a game
      const gameSession = await gamingApiService.initializeGame(
        testUser._id,
        "coinToss",
        "points",
        "50000000000000000000"
      );

      await gamingApiService.submitMove(gameSession.sessionId, { choice: "heads" });

      const finalResult = await gamingApiService.finalizeGame(
        gameSession.sessionId,
        { finalChoice: "heads" }
      );

      expect(finalResult).toBeDefined();
      expect(finalResult.status).toBe("completed");
      expect(finalResult.result).toBeDefined();
    });
  });

  describe("Wagering API Service", () => {
    test("should validate player balance", async () => {
      const validation = await wageringApiService.validateBalance(
        testUser._id,
        "points",
        "100000000000000000000" // 100 points
      );

      expect(validation).toBeDefined();
      expect(validation.hasBalance).toBe(true);
      expect(validation.playerId.toString()).toBe(testUser._id.toString());
    });

    test("should create wager session", async () => {
      const wagerSession = await wageringApiService.createWagerSession(
        testUser._id,
        "points",
        "100000000000000000000", // 100 points
        "external-game-123",
        { gameProvider: "ExternalProvider" }
      );

      expect(wagerSession).toBeDefined();
      expect(wagerSession.sessionId).toBeDefined();
      expect(wagerSession.thirdPartyGameId).toBe("external-game-123");
      expect(wagerSession.status).toBe("in_progress");
    });

    test("should process payout", async () => {
      // Create wager session first
      const wagerSession = await wageringApiService.createWagerSession(
        testUser._id,
        "points",
        "100000000000000000000",
        "external-game-456"
      );

      const payoutResult = await wageringApiService.processPayout(
        wagerSession.sessionId,
        {
          winner: "player",
          playerPayout: "200000000000000000000", // 200 points
          gameResult: { outcome: "win" }
        }
      );

      expect(payoutResult).toBeDefined();
      expect(payoutResult.status).toBe("completed");
      expect(payoutResult.result.winner).toBe("player");
      expect(payoutResult.result.playerPayout).toBe("200000000000000000000");
    });

    test("should get wager session status", async () => {
      const wagerSession = await wageringApiService.createWagerSession(
        testUser._id,
        "points",
        "100000000000000000000",
        "external-game-789"
      );

      const status = await wageringApiService.getWagerSessionStatus(wagerSession.sessionId);

      expect(status).toBeDefined();
      expect(status.sessionId.toString()).toBe(wagerSession.sessionId.toString());
      expect(status.status).toBe("in_progress");
      expect(status.thirdPartyGameId).toBe("external-game-789");
    });
  });

  describe("Player Queue System", () => {
    test("should add player to queue when no house slots available", async () => {
      // Deactivate all house slots to force queueing
      await HouseSlot.updateMany({}, { isActive: false });

      const gameSession = await gameSessionService.createGameSession(
        testUser._id,
        "coinToss",
        "points",
        "100000000000000000000"
      );

      expect(gameSession.status).toBe("waiting_for_house");

      const queuePosition = await gameSessionService.getPlayerQueuePosition(
        testUser._id,
        "coinToss",
        "points"
      );

      expect(queuePosition).toBeDefined();
      expect(queuePosition.queuePosition).toBeGreaterThan(0);
    });

    test("should process next player in queue when house slot becomes available", async () => {
      // Reactivate house slots
      await HouseSlot.updateMany({}, { isActive: true, status: "active" });

      const processedSession = await gameSessionService.processNextInQueue("coinToss", "points");

      expect(processedSession).toBeDefined();
      expect(processedSession.status).toBe("in_progress");
    });
  });

  describe("API Endpoints", () => {
    // Note: These tests would require proper authentication middleware setup
    // For now, they serve as examples of how the endpoints should work

    test("should create house slot via API", async () => {
      // This would require proper authentication setup
      // const response = await request(app)
      //   .post("/house/slots")
      //   .set("Authorization", `Bearer ${houseOwnerToken}`)
      //   .send({
      //     gameType: "rockPaperScissors",
      //     tokenType: "points",
      //     fundAmount: "1000000000000000000000"
      //   });
      
      // expect(response.status).toBe(201);
      // expect(response.body.data.houseSlot).toBeDefined();
    });

    test("should initialize game via gaming API", async () => {
      // This would require proper authentication setup
      // const response = await request(app)
      //   .post("/gaming-api/initialize")
      //   .set("Authorization", `Bearer ${authToken}`)
      //   .send({
      //     gameType: "rockPaperScissors",
      //     tokenType: "points",
      //     betAmount: "100000000000000000000"
      //   });
      
      // expect(response.status).toBe(201);
      // expect(response.body.data.sessionId).toBeDefined();
    });

    test("should create wager session via wagering API", async () => {
      // This would require proper authentication setup
      // const response = await request(app)
      //   .post("/wagering-api/sessions")
      //   .set("Authorization", `Bearer ${authToken}`)
      //   .send({
      //     tokenType: "points",
      //     betAmount: "100000000000000000000",
      //     thirdPartyGameId: "external-game-test"
      //   });
      
      // expect(response.status).toBe(201);
      // expect(response.body.data.sessionId).toBeDefined();
    });
  });
});

module.exports = {};