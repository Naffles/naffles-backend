const mongoose = require('mongoose');

const userAchievementSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  achievementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Achievement',
    required: true
  },
  progress: {
    type: Number,
    default: 0,
    min: 0
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date
  },
  pointsAwarded: {
    type: Number,
    default: 0
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  bestStreak: {
    type: Number,
    default: 0
  },
  lastActivity: {
    type: Date
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound index to ensure one record per user per achievement
userAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });
userAchievementSchema.index({ userId: 1, isCompleted: 1 });
userAchievementSchema.index({ achievementId: 1, isCompleted: 1 });

// Method to update progress
userAchievementSchema.methods.updateProgress = function(amount, achievement) {
  if (this.isCompleted && !achievement.isRepeatable) {
    return false; // Already completed and not repeatable
  }

  const oldProgress = this.progress;
  
  if (achievement.type === 'streak') {
    // Handle streak-based achievements
    const now = new Date();
    const lastActivity = this.lastActivity || new Date(0);
    const daysDiff = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 1) {
      // Consecutive day
      this.currentStreak += 1;
    } else if (daysDiff > 1) {
      // Streak broken
      this.currentStreak = 1;
    }
    
    this.progress = this.currentStreak;
    this.bestStreak = Math.max(this.bestStreak, this.currentStreak);
    this.lastActivity = now;
  } else {
    // Handle count/amount based achievements
    this.progress += amount;
    this.lastActivity = new Date();
  }

  // Check if achievement is completed
  if (!this.isCompleted && this.progress >= achievement.requirements.threshold) {
    this.isCompleted = true;
    this.completedAt = new Date();
    this.pointsAwarded = achievement.rewards.points;
    return true; // Achievement unlocked
  }

  return false; // Progress updated but not completed
};

// Method to reset for repeatable achievements
userAchievementSchema.methods.reset = function() {
  this.progress = 0;
  this.isCompleted = false;
  this.completedAt = null;
  this.pointsAwarded = 0;
  this.currentStreak = 0;
  this.metadata = {};
};

module.exports = mongoose.model('UserAchievement', userAchievementSchema);