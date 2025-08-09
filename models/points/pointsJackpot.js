const mongoose = require('mongoose');

const pointsJackpotSchema = new mongoose.Schema({
  currentAmount: {
    type: Number,
    default: 1000, // Starting jackpot amount
    min: 0
  },
  lastWinnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastWinAmount: {
    type: Number,
    default: 0
  },
  lastWinDate: {
    type: Date
  },
  totalWinners: {
    type: Number,
    default: 0
  },
  totalAmountWon: {
    type: Number,
    default: 0
  },
  incrementSettings: {
    raffleCreation: { type: Number, default: 10 },
    ticketPurchase: { type: Number, default: 1 },
    gamePlay: { type: Number, default: 2 },
    timeBasedIncrement: { type: Number, default: 5 }, // Every hour
    lastTimeIncrement: { type: Date, default: Date.now }
  },
  winConditions: {
    minPointsRequired: { type: Number, default: 100 },
    winProbability: { type: Number, default: 0.001 }, // 0.1% chance
    cooldownPeriod: { type: Number, default: 24 * 60 * 60 * 1000 }, // 24 hours in ms
    maxWinsPerDay: { type: Number, default: 3 }
  },
  dailyStats: {
    date: { type: Date, default: () => new Date().setHours(0, 0, 0, 0) },
    winsToday: { type: Number, default: 0 },
    incrementsToday: { type: Number, default: 0 },
    amountAddedToday: { type: Number, default: 0 }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Method to increment jackpot
pointsJackpotSchema.methods.increment = function(amount, source) {
  this.currentAmount += amount;
  
  // Update daily stats
  const today = new Date().setHours(0, 0, 0, 0);
  if (this.dailyStats.date.getTime() !== today) {
    // Reset daily stats for new day
    this.dailyStats.date = new Date(today);
    this.dailyStats.winsToday = 0;
    this.dailyStats.incrementsToday = 0;
    this.dailyStats.amountAddedToday = 0;
  }
  
  this.dailyStats.incrementsToday += 1;
  this.dailyStats.amountAddedToday += amount;
  
  return this.save();
};

// Method to check if user can win jackpot
pointsJackpotSchema.methods.canUserWin = function(userId, userPoints) {
  if (!this.isActive) return false;
  if (userPoints < this.winConditions.minPointsRequired) return false;
  if (this.dailyStats.winsToday >= this.winConditions.maxWinsPerDay) return false;
  
  // Check cooldown if this user won recently
  if (this.lastWinnerId && this.lastWinnerId.toString() === userId.toString()) {
    const timeSinceLastWin = Date.now() - this.lastWinDate.getTime();
    if (timeSinceLastWin < this.winConditions.cooldownPeriod) return false;
  }
  
  return true;
};

// Method to process jackpot win
pointsJackpotSchema.methods.processWin = function(winnerId) {
  const winAmount = this.currentAmount;
  
  this.lastWinnerId = winnerId;
  this.lastWinAmount = winAmount;
  this.lastWinDate = new Date();
  this.totalWinners += 1;
  this.totalAmountWon += winAmount;
  this.currentAmount = 1000; // Reset to base amount
  
  // Update daily stats
  const today = new Date().setHours(0, 0, 0, 0);
  if (this.dailyStats.date.getTime() !== today) {
    this.dailyStats.date = new Date(today);
    this.dailyStats.winsToday = 0;
    this.dailyStats.incrementsToday = 0;
    this.dailyStats.amountAddedToday = 0;
  }
  this.dailyStats.winsToday += 1;
  
  return winAmount;
};

// Method to check for time-based increment
pointsJackpotSchema.methods.checkTimeBasedIncrement = function() {
  const now = new Date();
  const hoursSinceLastIncrement = (now - this.incrementSettings.lastTimeIncrement) / (1000 * 60 * 60);
  
  if (hoursSinceLastIncrement >= 1) {
    const hoursToIncrement = Math.floor(hoursSinceLastIncrement);
    const incrementAmount = this.incrementSettings.timeBasedIncrement * hoursToIncrement;
    
    this.currentAmount += incrementAmount;
    this.incrementSettings.lastTimeIncrement = now;
    
    // Update daily stats
    const today = new Date().setHours(0, 0, 0, 0);
    if (this.dailyStats.date.getTime() !== today) {
      this.dailyStats.date = new Date(today);
      this.dailyStats.winsToday = 0;
      this.dailyStats.incrementsToday = 0;
      this.dailyStats.amountAddedToday = 0;
    }
    this.dailyStats.amountAddedToday += incrementAmount;
    
    return incrementAmount;
  }
  
  return 0;
};

module.exports = mongoose.model('PointsJackpot', pointsJackpotSchema);