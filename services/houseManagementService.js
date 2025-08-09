const HouseSlot = require("../models/game/houseSlot");
const GameSession = require("../models/game/gameSession");
const PlayerQueue = require("../models/game/playerQueue");
const { convertToBigInt } = require("../utils/convert");

class HouseManagementService {
  /**
   * Find an available house slot for a game
   * @param {string} gameType - Type of game
   * @param {string} tokenType - Token type
   * @param {string} betAmount - Bet amount as string
   * @returns {Object|null} Available house slot or null
   */
  async findAvailableHouseSlot(gameType, tokenType, betAmount) {
    try {
      // Find active house slots with sufficient funds, ordered by queue position and last used
      const availableSlots = await HouseSlot.find({
        gameType,
        tokenType,
        isActive: true,
        status: "active"
      }).sort({ queuePosition: 1, lastUsed: 1 });

      for (const slot of availableSlots) {
        if (slot.hasSufficientFunds(betAmount)) {
          return slot;
        }
      }

      return null;
    } catch (error) {
      console.error("Error finding available house slot:", error);
      throw error;
    }
  }

  /**
   * Create a new house slot
   * @param {string} ownerId - Owner user ID
   * @param {string} gameType - Type of game
   * @param {string} tokenType - Token type
   * @param {string} fundAmount - Initial fund amount
   * @returns {Object} Created house slot
   */
  async createHouseSlot(ownerId, gameType, tokenType, fundAmount) {
    try {
      // Get next queue position
      const lastSlot = await HouseSlot.findOne({
        gameType,
        tokenType
      }).sort({ queuePosition: -1 });

      const queuePosition = lastSlot ? lastSlot.queuePosition + 1 : 1;

      const houseSlot = new HouseSlot({
        ownerId,
        gameType,
        tokenType,
        fundAmount,
        queuePosition
      });

      await houseSlot.save();
      return houseSlot;
    } catch (error) {
      console.error("Error creating house slot:", error);
      throw error;
    }
  }

  /**
   * Rotate house slots to ensure fair distribution
   * @param {string} gameType - Type of game
   * @param {string} tokenType - Token type
   */
  async rotateHouseSlots(gameType, tokenType) {
    try {
      const activeSlots = await HouseSlot.find({
        gameType,
        tokenType,
        isActive: true,
        status: "active"
      }).sort({ queuePosition: 1 });

      if (activeSlots.length <= 1) return;

      // Move the first slot to the end
      const firstSlot = activeSlots[0];
      const maxPosition = Math.max(...activeSlots.map(slot => slot.queuePosition));
      
      firstSlot.queuePosition = maxPosition + 1;
      await firstSlot.save();

      // Reorder remaining slots
      for (let i = 1; i < activeSlots.length; i++) {
        activeSlots[i].queuePosition = i;
        await activeSlots[i].save();
      }
    } catch (error) {
      console.error("Error rotating house slots:", error);
      throw error;
    }
  }

  /**
   * Add funds to a house slot
   * @param {string} houseSlotId - House slot ID
   * @param {string} amount - Amount to add
   * @returns {Object} Updated house slot
   */
  async addFundsToHouseSlot(houseSlotId, amount) {
    try {
      const houseSlot = await HouseSlot.findById(houseSlotId);
      if (!houseSlot) {
        throw new Error("House slot not found");
      }

      const currentFundsBigInt = BigInt(houseSlot.currentFunds);
      const amountBigInt = BigInt(amount);
      const newFundsBigInt = currentFundsBigInt + amountBigInt;

      houseSlot.currentFunds = newFundsBigInt.toString();
      
      // Reactivate if it was inactive due to insufficient funds
      if (houseSlot.status === "insufficient_funds") {
        const minimumFundsBigInt = BigInt(houseSlot.minimumFunds);
        if (newFundsBigInt >= minimumFundsBigInt) {
          houseSlot.isActive = true;
          houseSlot.status = "active";
        }
      }

      await houseSlot.save();
      return houseSlot;
    } catch (error) {
      console.error("Error adding funds to house slot:", error);
      throw error;
    }
  }

  /**
   * Withdraw funds from a house slot
   * @param {string} houseSlotId - House slot ID
   * @param {string} amount - Amount to withdraw
   * @returns {Object} Updated house slot
   */
  async withdrawFundsFromHouseSlot(houseSlotId, amount) {
    try {
      const houseSlot = await HouseSlot.findById(houseSlotId);
      if (!houseSlot) {
        throw new Error("House slot not found");
      }

      const currentFundsBigInt = BigInt(houseSlot.currentFunds);
      const amountBigInt = BigInt(amount);
      const minimumFundsBigInt = BigInt(houseSlot.minimumFunds);

      if (currentFundsBigInt - amountBigInt < minimumFundsBigInt) {
        throw new Error("Cannot withdraw funds below minimum required amount");
      }

      houseSlot.currentFunds = (currentFundsBigInt - amountBigInt).toString();
      await houseSlot.save();
      return houseSlot;
    } catch (error) {
      console.error("Error withdrawing funds from house slot:", error);
      throw error;
    }
  }

  /**
   * Get house slots for a specific owner
   * @param {string} ownerId - Owner user ID
   * @returns {Array} Array of house slots
   */
  async getHouseSlotsForOwner(ownerId) {
    try {
      return await HouseSlot.find({ ownerId }).sort({ createdAt: -1 });
    } catch (error) {
      console.error("Error getting house slots for owner:", error);
      throw error;
    }
  }

  /**
   * Deactivate a house slot
   * @param {string} houseSlotId - House slot ID
   * @returns {Object} Updated house slot
   */
  async deactivateHouseSlot(houseSlotId) {
    try {
      const houseSlot = await HouseSlot.findById(houseSlotId);
      if (!houseSlot) {
        throw new Error("House slot not found");
      }

      houseSlot.isActive = false;
      houseSlot.status = "inactive";
      await houseSlot.save();
      return houseSlot;
    } catch (error) {
      console.error("Error deactivating house slot:", error);
      throw error;
    }
  }

  /**
   * Get house slot statistics
   * @param {string} houseSlotId - House slot ID
   * @returns {Object} House slot statistics
   */
  async getHouseSlotStats(houseSlotId) {
    try {
      const houseSlot = await HouseSlot.findById(houseSlotId);
      if (!houseSlot) {
        throw new Error("House slot not found");
      }

      const totalWinningsBigInt = BigInt(houseSlot.totalWinnings);
      const totalLossesBigInt = BigInt(houseSlot.totalLosses);
      const netProfitBigInt = totalWinningsBigInt - totalLossesBigInt;

      return {
        gamesPlayed: houseSlot.gamesPlayed,
        totalWinnings: houseSlot.totalWinnings,
        totalLosses: houseSlot.totalLosses,
        netProfit: netProfitBigInt.toString(),
        currentFunds: houseSlot.currentFunds,
        fundUtilization: houseSlot.gamesPlayed > 0 ? 
          ((BigInt(houseSlot.fundAmount) - BigInt(houseSlot.currentFunds)) * BigInt(100) / BigInt(houseSlot.fundAmount)).toString() + "%" : "0%"
      };
    } catch (error) {
      console.error("Error getting house slot stats:", error);
      throw error;
    }
  }
}

module.exports = new HouseManagementService();