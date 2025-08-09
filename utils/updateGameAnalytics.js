const GameAnalytics = require('../models/analytics/gameAnalytics');

const updateGameAnalytics = async (gameType) => {
  try {
    let gameAnalytics = await GameAnalytics.findOne();

    if (!gameAnalytics) {
      const newGameAnalytics = {
        totalGames: 1,
      };

      newGameAnalytics[gameType] = 1;
      gameAnalytics = new GameAnalytics(newGameAnalytics);
    } else {
      gameAnalytics.totalGames += 1;
      gameAnalytics[gameType] = (gameAnalytics[gameType] || 0) + 1;
    }

    await gameAnalytics.save();
  } catch (error) {
    console.error(`Error updating game analytics: ${error.message}`);
    throw new Error('Failed to update game analytics');
  }
};

module.exports = updateGameAnalytics;
