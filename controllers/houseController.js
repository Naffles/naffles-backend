const sendResponse = require("../utils/responseHandler");
const houseManagementService = require("../services/houseManagementService");
const { convertToNum } = require("../utils/convert");
const { getAllValidTickers } = require("../utils/helpers");
const { VALID_GAMES } = require("../config/config");

/**
 * Create a new house slot
 */
exports.createHouseSlot = async (req, res) => {
  try {
    const { gameType, tokenType, fundAmount } = req.body;
    const ownerId = req.user._id;

    // Validate input
    if (!gameType || !tokenType || !fundAmount) {
      return sendResponse(res, 400, "Missing required fields: gameType, tokenType, fundAmount");
    }

    // Validate game type
    if (!VALID_GAMES.includes(gameType)) {
      return sendResponse(res, 400, "Invalid game type");
    }

    // Validate token type
    const validTokenTypes = await getAllValidTickers();
    if (!validTokenTypes.includes(tokenType.toLowerCase())) {
      return sendResponse(res, 400, "Invalid token type");
    }

    // Validate fund amount
    const fundAmountNum = await convertToNum(fundAmount, tokenType);
    if (fundAmountNum <= 0) {
      return sendResponse(res, 400, "Fund amount must be greater than 0");
    }

    const houseSlot = await houseManagementService.createHouseSlot(
      ownerId,
      gameType,
      tokenType.toLowerCase(),
      fundAmount
    );

    return sendResponse(res, 201, "House slot created successfully", {
      houseSlot: {
        id: houseSlot._id,
        gameType: houseSlot.gameType,
        tokenType: houseSlot.tokenType,
        fundAmount: houseSlot.fundAmount,
        currentFunds: houseSlot.currentFunds,
        minimumFunds: houseSlot.minimumFunds,
        queuePosition: houseSlot.queuePosition,
        isActive: houseSlot.isActive,
        status: houseSlot.status
      }
    });
  } catch (error) {
    console.error("Error creating house slot:", error);
    return sendResponse(res, 500, "Error creating house slot", {
      error: error.message
    });
  }
};

/**
 * Get house slots for the authenticated user
 */
exports.getMyHouseSlots = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const houseSlots = await houseManagementService.getHouseSlotsForOwner(ownerId);

    const houseSlotsWithStats = await Promise.all(
      houseSlots.map(async (slot) => {
        const stats = await houseManagementService.getHouseSlotStats(slot._id);
        return {
          id: slot._id,
          gameType: slot.gameType,
          tokenType: slot.tokenType,
          fundAmount: slot.fundAmount,
          currentFunds: slot.currentFunds,
          minimumFunds: slot.minimumFunds,
          queuePosition: slot.queuePosition,
          isActive: slot.isActive,
          status: slot.status,
          createdAt: slot.createdAt,
          lastUsed: slot.lastUsed,
          stats
        };
      })
    );

    return sendResponse(res, 200, "House slots retrieved successfully", {
      houseSlots: houseSlotsWithStats
    });
  } catch (error) {
    console.error("Error getting house slots:", error);
    return sendResponse(res, 500, "Error retrieving house slots", {
      error: error.message
    });
  }
};

/**
 * Add funds to a house slot
 */
exports.addFunds = async (req, res) => {
  try {
    const { houseSlotId } = req.params;
    const { amount } = req.body;

    if (!amount) {
      return sendResponse(res, 400, "Amount is required");
    }

    const updatedSlot = await houseManagementService.addFundsToHouseSlot(houseSlotId, amount);

    return sendResponse(res, 200, "Funds added successfully", {
      houseSlot: {
        id: updatedSlot._id,
        currentFunds: updatedSlot.currentFunds,
        isActive: updatedSlot.isActive,
        status: updatedSlot.status
      }
    });
  } catch (error) {
    console.error("Error adding funds:", error);
    return sendResponse(res, 500, "Error adding funds", {
      error: error.message
    });
  }
};

/**
 * Withdraw funds from a house slot
 */
exports.withdrawFunds = async (req, res) => {
  try {
    const { houseSlotId } = req.params;
    const { amount } = req.body;

    if (!amount) {
      return sendResponse(res, 400, "Amount is required");
    }

    const updatedSlot = await houseManagementService.withdrawFundsFromHouseSlot(houseSlotId, amount);

    return sendResponse(res, 200, "Funds withdrawn successfully", {
      houseSlot: {
        id: updatedSlot._id,
        currentFunds: updatedSlot.currentFunds,
        isActive: updatedSlot.isActive,
        status: updatedSlot.status
      }
    });
  } catch (error) {
    console.error("Error withdrawing funds:", error);
    return sendResponse(res, 500, "Error withdrawing funds", {
      error: error.message
    });
  }
};

/**
 * Deactivate a house slot
 */
exports.deactivateHouseSlot = async (req, res) => {
  try {
    const { houseSlotId } = req.params;

    const updatedSlot = await houseManagementService.deactivateHouseSlot(houseSlotId);

    return sendResponse(res, 200, "House slot deactivated successfully", {
      houseSlot: {
        id: updatedSlot._id,
        isActive: updatedSlot.isActive,
        status: updatedSlot.status
      }
    });
  } catch (error) {
    console.error("Error deactivating house slot:", error);
    return sendResponse(res, 500, "Error deactivating house slot", {
      error: error.message
    });
  }
};

/**
 * Get house slot statistics
 */
exports.getHouseSlotStats = async (req, res) => {
  try {
    const { houseSlotId } = req.params;

    const stats = await houseManagementService.getHouseSlotStats(houseSlotId);

    return sendResponse(res, 200, "House slot statistics retrieved successfully", {
      stats
    });
  } catch (error) {
    console.error("Error getting house slot stats:", error);
    return sendResponse(res, 500, "Error retrieving house slot statistics", {
      error: error.message
    });
  }
};

/**
 * Get available house slots for a specific game type and token
 */
exports.getAvailableHouseSlots = async (req, res) => {
  try {
    const { gameType, tokenType } = req.query;

    if (!gameType || !tokenType) {
      return sendResponse(res, 400, "gameType and tokenType are required");
    }

    // This is primarily for admin/monitoring purposes
    const HouseSlot = require("../models/game/houseSlot");
    const availableSlots = await HouseSlot.find({
      gameType,
      tokenType: tokenType.toLowerCase(),
      isActive: true,
      status: "active"
    }).sort({ queuePosition: 1, lastUsed: 1 });

    const slotsWithAvailability = availableSlots.map(slot => ({
      id: slot._id,
      ownerId: slot.ownerId,
      gameType: slot.gameType,
      tokenType: slot.tokenType,
      currentFunds: slot.currentFunds,
      minimumFunds: slot.minimumFunds,
      queuePosition: slot.queuePosition,
      gamesPlayed: slot.gamesPlayed,
      lastUsed: slot.lastUsed,
      canAcceptBets: BigInt(slot.currentFunds) > BigInt(slot.minimumFunds)
    }));

    return sendResponse(res, 200, "Available house slots retrieved successfully", {
      availableSlots: slotsWithAvailability,
      totalSlots: slotsWithAvailability.length,
      activeSlots: slotsWithAvailability.filter(slot => slot.canAcceptBets).length
    });
  } catch (error) {
    console.error("Error getting available house slots:", error);
    return sendResponse(res, 500, "Error retrieving available house slots", {
      error: error.message
    });
  }
};