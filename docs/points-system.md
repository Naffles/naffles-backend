# Points System Documentation

## Overview

The Naffles Points System is a comprehensive gamification feature that rewards users for various platform activities. It includes points earning, achievements, leaderboards, jackpots, and partner token bonuses.

## Core Components

### 1. Points Balance (`PointsBalance`)
- Tracks user's current points balance
- Maintains total earned and spent points
- Calculates user tier based on total earned points
- Tiers: Bronze (0+), Silver (1000+), Gold (5000+), Platinum (15000+), Diamond (50000+)

### 2. Points Transactions (`PointsTransaction`)
- Records all points earning and spending activities
- Supports different transaction types: earned, spent, bonus, penalty, jackpot, admin_award, admin_deduct
- Tracks multipliers and base amounts
- Includes metadata for context and audit trails

### 3. Points Jackpot (`PointsJackpot`)
- Progressive jackpot that grows with platform activity
- Automatic increments based on user activities
- Time-based increments (hourly)
- Configurable win conditions and probabilities

### 4. Achievements (`Achievement` & `UserAchievement`)
- Predefined achievements for various activities
- Categories: gaming, raffles, social, milestones, special
- Types: count, streak, amount, special
- Rarity levels: common, uncommon, rare, epic, legendary

### 5. Leaderboards (`LeaderboardEntry`)
- Multiple leaderboard categories: points, gaming wins, gaming volume, raffle wins, raffle created, referrals
- Time periods: daily, weekly, monthly, all-time
- Rank tracking with change indicators (up, down, same, new)

### 6. Partner Tokens (`PartnerToken`)
- Bonus multipliers for using specific tokens
- Configurable per activity type
- Chain-specific token contracts
- Time-based validity periods

## Points Earning Activities

| Activity | Base Points | Description |
|----------|-------------|-------------|
| `raffle_creation` | 50 | Creating a raffle |
| `raffle_ticket_purchase` | 1 | Per $10 spent on tickets |
| `gaming_blackjack` | 5 | Playing blackjack |
| `gaming_coin_toss` | 3 | Playing coin toss |
| `gaming_rock_paper_scissors` | 3 | Playing rock paper scissors |
| `gaming_crypto_slots` | 8 | Playing crypto slots |
| `token_staking` | 10 | Per day of staking |
| `referral_bonus` | 25 | Referring new users |
| `daily_login` | 5 | Daily login bonus |
| `community_task` | 15 | Completing community tasks |

## API Endpoints

### Public Endpoints
- `GET /api/points/jackpot` - Get current jackpot information
- `GET /api/points/achievements` - Get all achievements
- `GET /api/points/leaderboard/:category/:period` - Get leaderboard
- `GET /api/points/leaderboard/options` - Get available categories and periods

### User Endpoints (Authentication Required)
- `GET /api/points/balance` - Get user's points balance and info
- `GET /api/points/transactions` - Get transaction history
- `GET /api/points/achievements/user` - Get user's achievements
- `GET /api/points/achievements/summary` - Get achievement summary
- `GET /api/points/leaderboard/:category/:period/position` - Get user's position

### Admin Endpoints (Admin Authentication Required)
- `POST /api/points/award` - Award points to user
- `POST /api/points/deduct` - Deduct points from user
- `POST /api/points/bulk-award` - Bulk award points
- `GET /api/points/stats` - Get points system statistics

### Admin Management Endpoints
- `GET /admin/points/achievements` - Manage achievements
- `POST /admin/points/achievements` - Create achievement
- `PUT /admin/points/achievements/:id` - Update achievement
- `DELETE /admin/points/achievements/:id` - Delete achievement
- `GET /admin/points/partner-tokens` - Manage partner tokens
- `POST /admin/points/partner-tokens` - Create partner token
- `POST /admin/points/partner-tokens/bulk-upload` - Bulk upload tokens
- `POST /admin/points/leaderboards/recalculate/:category/:period` - Recalculate ranks
- `GET /admin/points/jackpot` - Manage jackpot settings
- `POST /admin/points/jackpot/reset` - Reset jackpot
- `PUT /admin/points/jackpot/settings` - Update jackpot settings

## Usage Examples

### Awarding Points
```javascript
const pointsService = require('./services/pointsService');

// Award points for gaming activity
const result = await pointsService.awardPoints(userId, 'gaming_blackjack', {
  betAmount: 100,
  winAmount: 200,
  tokenContract: '0x123...',
  chainId: '1'
});

console.log(`Awarded ${result.pointsAwarded} points (${result.multiplier}x multiplier)`);
```

### Checking Achievements
```javascript
const achievementService = require('./services/achievementService');

// Get user's achievements with progress
const achievements = await achievementService.getUserAchievements(userId, true);

// Get achievement summary
const summary = await achievementService.getUserAchievementSummary(userId);
console.log(`Completed ${summary.completed}/${summary.totalAchievements} achievements`);
```

### Leaderboard Operations
```javascript
const leaderboardService = require('./services/leaderboardService');

// Get points leaderboard
const leaderboard = await leaderboardService.getLeaderboard('points', 'weekly', 50);

// Get user's position
const position = await leaderboardService.getUserPosition(userId, 'points', 'all_time');
console.log(`User rank: ${position.userEntry.rank}`);
```

## Integration with Gaming System

The points system automatically integrates with the gaming infrastructure:

1. **Game Completion**: Points are awarded when games complete
2. **Achievement Progress**: Gaming activities update achievement progress
3. **Leaderboard Updates**: Gaming statistics update leaderboards
4. **Jackpot Increments**: Game activities increment the jackpot
5. **Partner Token Bonuses**: Using partner tokens provides point multipliers

### Gaming Integration Example
```javascript
// In game completion handler
const gameResult = await gameService.completeGame(gameId);

if (gameResult.completed) {
  // Award points for playing
  await pointsService.awardPoints(userId, `gaming_${gameType}`, {
    betAmount: gameResult.betAmount,
    winAmount: gameResult.winAmount,
    tokenContract: gameResult.tokenContract,
    chainId: gameResult.chainId
  });
}
```

## Database Schema

### Points Balance
```javascript
{
  userId: ObjectId,
  balance: Number,
  totalEarned: Number,
  totalSpent: Number,
  tier: String, // bronze, silver, gold, platinum, diamond
  tierProgress: Number, // 0-100
  lastActivity: Date
}
```

### Points Transaction
```javascript
{
  userId: ObjectId,
  type: String, // earned, spent, bonus, penalty, jackpot, admin_award, admin_deduct
  activity: String, // raffle_creation, gaming_blackjack, etc.
  amount: Number,
  balanceBefore: Number,
  balanceAfter: Number,
  multiplier: Number,
  baseAmount: Number,
  metadata: {
    raffleId: ObjectId,
    gameSessionId: ObjectId,
    achievementId: ObjectId,
    // ... other contextual data
  },
  description: String,
  isReversible: Boolean
}
```

### Achievement
```javascript
{
  name: String,
  description: String,
  category: String, // gaming, raffles, social, milestones, special
  type: String, // count, streak, amount, special
  requirements: {
    activity: String,
    threshold: Number,
    timeframe: String // daily, weekly, monthly, all_time
  },
  rewards: {
    points: Number,
    badge: String,
    title: String,
    multiplier: Number
  },
  rarity: String, // common, uncommon, rare, epic, legendary
  isActive: Boolean
}
```

## Initialization

To initialize the points system:

```bash
# Run the initialization script
node scripts/initializePointsSystem.js
```

This will:
1. Create default achievements
2. Set up default partner tokens
3. Initialize the jackpot system
4. Create necessary database indexes

## Testing

Run the comprehensive test suite:

```bash
# Run points system tests
npm test tests/pointsSystem.test.js
```

The test suite covers:
- Points earning and deduction
- Partner token multipliers
- Achievement progress tracking
- Leaderboard functionality
- Jackpot system
- Integration scenarios

## Performance Considerations

1. **Leaderboard Recalculation**: Run periodically via cron jobs, not on every update
2. **Achievement Checking**: Optimized to only check relevant achievements
3. **Database Indexes**: Proper indexing on frequently queried fields
4. **Caching**: Consider Redis caching for frequently accessed leaderboards
5. **Batch Operations**: Use bulk operations for mass point awards

## Security Features

1. **Transaction Audit Trail**: All point transactions are logged
2. **Reversible Transactions**: Admin transactions can be reversed
3. **Rate Limiting**: Prevent abuse of point-earning activities
4. **Validation**: Server-side validation of all point operations
5. **Admin Controls**: Comprehensive admin tools for monitoring and management

## Future Enhancements

1. **Point Spending**: Marketplace for spending points
2. **Seasonal Events**: Time-limited achievements and bonuses
3. **Guild System**: Team-based point competitions
4. **NFT Rewards**: Achievement-based NFT minting
5. **Cross-Platform Integration**: Points across multiple Naffles services