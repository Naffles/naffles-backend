const mongoose = require('mongoose');
const Achievement = require('../models/points/achievement');
require('dotenv').config();

const stakingAchievements = [
  // First-time staking achievements
  {
    name: 'First Stake',
    description: 'Stake your first NFT',
    category: 'staking',
    type: 'count',
    requirements: { activity: 'nft_staking', threshold: 1 },
    rewards: { points: 100, badge: 'first-stake' },
    rarity: 'common',
    order: 100
  },
  {
    name: 'Staking Novice',
    description: 'Stake 3 NFTs',
    category: 'staking',
    type: 'count',
    requirements: { activity: 'nft_staking', threshold: 3 },
    rewards: { points: 250, badge: 'staking-novice' },
    rarity: 'common',
    order: 101
  },
  {
    name: 'Active Staker',
    description: 'Stake 5 NFTs',
    category: 'staking',
    type: 'count',
    requirements: { activity: 'nft_staking', threshold: 5 },
    rewards: { points: 500, badge: 'active-staker', multiplier: 1.05 },
    rarity: 'uncommon',
    order: 102
  },
  {
    name: 'Dedicated Staker',
    description: 'Stake 10 NFTs',
    category: 'staking',
    type: 'count',
    requirements: { activity: 'nft_staking', threshold: 10 },
    rewards: { points: 1000, badge: 'dedicated-staker', multiplier: 1.1 },
    rarity: 'rare',
    order: 103
  },
  {
    name: 'Staking Master',
    description: 'Stake 25 NFTs',
    category: 'staking',
    type: 'count',
    requirements: { activity: 'nft_staking', threshold: 25 },
    rewards: { points: 2500, badge: 'staking-master', multiplier: 1.15 },
    rarity: 'epic',
    order: 104
  },
  {
    name: 'Staking Legend',
    description: 'Stake 50 NFTs',
    category: 'staking',
    type: 'count',
    requirements: { activity: 'nft_staking', threshold: 50 },
    rewards: { points: 5000, badge: 'staking-legend', multiplier: 1.25, title: 'Staking Legend' },
    rarity: 'legendary',
    order: 105
  },

  // Duration-based achievements
  {
    name: 'Short-term Commitment',
    description: 'Complete a 6-month staking period',
    category: 'staking',
    type: 'special',
    requirements: { activity: 'staking_duration_complete', threshold: 1 },
    rewards: { points: 200, badge: 'short-term-staker' },
    rarity: 'common',
    order: 110
  },
  {
    name: 'Medium-term Investor',
    description: 'Complete a 12-month staking period',
    category: 'staking',
    type: 'special',
    requirements: { activity: 'staking_duration_complete', threshold: 1 },
    rewards: { points: 500, badge: 'medium-term-staker', multiplier: 1.1 },
    rarity: 'uncommon',
    order: 111
  },
  {
    name: 'Long-term Commitment',
    description: 'Complete a 3-year staking period',
    category: 'staking',
    type: 'special',
    requirements: { activity: 'staking_duration_complete', threshold: 1 },
    rewards: { points: 2000, badge: 'long-term-staker', multiplier: 1.2, title: 'Diamond Hands' },
    rarity: 'epic',
    order: 112
  },
  {
    name: 'Duration Master',
    description: 'Complete 5 long-term (12+ month) stakes',
    category: 'staking',
    type: 'count',
    requirements: { activity: 'long_term_stakes', threshold: 5 },
    rewards: { points: 3000, badge: 'duration-master', multiplier: 1.25 },
    rarity: 'epic',
    order: 113
  },
  {
    name: 'Patience Incarnate',
    description: 'Complete 3 three-year staking periods',
    category: 'staking',
    type: 'count',
    requirements: { activity: 'three_year_stakes', threshold: 3 },
    rewards: { points: 10000, badge: 'patience-incarnate', multiplier: 1.5, title: 'Zen Master' },
    rarity: 'legendary',
    order: 114
  },

  // Reward-based achievements
  {
    name: 'First Rewards',
    description: 'Earn your first staking rewards',
    category: 'staking',
    type: 'count',
    requirements: { activity: 'staking_reward', threshold: 1 },
    rewards: { points: 50, badge: 'first-rewards' },
    rarity: 'common',
    order: 120
  },
  {
    name: 'Reward Collector',
    description: 'Earn 100 open-entry tickets from staking',
    category: 'staking',
    type: 'amount',
    requirements: { activity: 'staking_tickets_earned', threshold: 100 },
    rewards: { points: 300, badge: 'reward-collector' },
    rarity: 'uncommon',
    order: 121
  },
  {
    name: 'Reward Accumulator',
    description: 'Earn 500 open-entry tickets from staking',
    category: 'staking',
    type: 'amount',
    requirements: { activity: 'staking_tickets_earned', threshold: 500 },
    rewards: { points: 1000, badge: 'reward-accumulator', multiplier: 1.1 },
    rarity: 'rare',
    order: 122
  },
  {
    name: 'Reward Master',
    description: 'Earn 1,000 open-entry tickets from staking',
    category: 'staking',
    type: 'amount',
    requirements: { activity: 'staking_tickets_earned', threshold: 1000 },
    rewards: { points: 2500, badge: 'reward-master', multiplier: 1.15 },
    rarity: 'epic',
    order: 123
  },
  {
    name: 'Reward Legend',
    description: 'Earn 5,000 open-entry tickets from staking',
    category: 'staking',
    type: 'amount',
    requirements: { activity: 'staking_tickets_earned', threshold: 5000 },
    rewards: { points: 10000, badge: 'reward-legend', multiplier: 1.25, title: 'Reward Magnate' },
    rarity: 'legendary',
    order: 124
  },

  // Multi-blockchain achievements
  {
    name: 'Multi-chain Staker',
    description: 'Stake NFTs on 2 different blockchains',
    category: 'staking',
    type: 'special',
    requirements: { activity: 'multi_blockchain_staking', threshold: 2 },
    rewards: { points: 500, badge: 'multi-chain-staker', multiplier: 1.1 },
    rarity: 'uncommon',
    order: 130
  },
  {
    name: 'Blockchain Explorer',
    description: 'Stake NFTs on 3 different blockchains',
    category: 'staking',
    type: 'special',
    requirements: { activity: 'multi_blockchain_staking', threshold: 3 },
    rewards: { points: 1500, badge: 'blockchain-explorer', multiplier: 1.2 },
    rarity: 'rare',
    order: 131
  },
  {
    name: 'Omnichain Master',
    description: 'Stake NFTs on all supported blockchains',
    category: 'staking',
    type: 'special',
    requirements: { activity: 'multi_blockchain_staking', threshold: 4 },
    rewards: { points: 5000, badge: 'omnichain-master', multiplier: 1.3, title: 'Omnichain Pioneer' },
    rarity: 'legendary',
    order: 132
  },

  // Portfolio achievements
  {
    name: 'Diversified Portfolio',
    description: 'Stake NFTs from 5 different collections',
    category: 'staking',
    type: 'special',
    requirements: { activity: 'collection_diversity', threshold: 5 },
    rewards: { points: 750, badge: 'diversified-portfolio', multiplier: 1.1 },
    rarity: 'uncommon',
    order: 140
  },
  {
    name: 'Collection Connoisseur',
    description: 'Stake NFTs from 10 different collections',
    category: 'staking',
    type: 'special',
    requirements: { activity: 'collection_diversity', threshold: 10 },
    rewards: { points: 2000, badge: 'collection-connoisseur', multiplier: 1.15 },
    rarity: 'rare',
    order: 141
  },
  {
    name: 'Portfolio Master',
    description: 'Stake NFTs from 20 different collections',
    category: 'staking',
    type: 'special',
    requirements: { activity: 'collection_diversity', threshold: 20 },
    rewards: { points: 5000, badge: 'portfolio-master', multiplier: 1.25, title: 'Portfolio Architect' },
    rarity: 'epic',
    order: 142
  },

  // Consistency achievements
  {
    name: 'Consistent Staker',
    description: 'Receive staking rewards for 6 consecutive months',
    category: 'staking',
    type: 'streak',
    requirements: { activity: 'monthly_rewards', threshold: 6 },
    rewards: { points: 1000, badge: 'consistent-staker', multiplier: 1.1 },
    rarity: 'uncommon',
    order: 150
  },
  {
    name: 'Steady Earner',
    description: 'Receive staking rewards for 12 consecutive months',
    category: 'staking',
    type: 'streak',
    requirements: { activity: 'monthly_rewards', threshold: 12 },
    rewards: { points: 2500, badge: 'steady-earner', multiplier: 1.2 },
    rarity: 'rare',
    order: 151
  },
  {
    name: 'Unwavering Commitment',
    description: 'Receive staking rewards for 24 consecutive months',
    category: 'staking',
    type: 'streak',
    requirements: { activity: 'monthly_rewards', threshold: 24 },
    rewards: { points: 7500, badge: 'unwavering-commitment', multiplier: 1.3, title: 'Steadfast Staker' },
    rarity: 'epic',
    order: 152
  },

  // Special milestone achievements
  {
    name: 'Early Staker',
    description: 'One of the first 100 users to stake an NFT',
    category: 'staking',
    type: 'special',
    requirements: { activity: 'early_adoption', threshold: 1 },
    rewards: { points: 1000, badge: 'early-staker', title: 'Staking Pioneer' },
    rarity: 'rare',
    order: 160
  },
  {
    name: 'Beta Staker',
    description: 'Participated in staking system beta testing',
    category: 'staking',
    type: 'special',
    requirements: { activity: 'beta_participation', threshold: 1 },
    rewards: { points: 2000, badge: 'beta-staker', title: 'Beta Pioneer' },
    rarity: 'epic',
    order: 161
  },
  {
    name: 'Perfect Timing',
    description: 'Unstake an NFT on the exact day it becomes available',
    category: 'staking',
    type: 'special',
    requirements: { activity: 'perfect_timing_unstake', threshold: 1 },
    rewards: { points: 500, badge: 'perfect-timing' },
    rarity: 'uncommon',
    order: 162
  },
  {
    name: 'Maximum Multiplier',
    description: 'Earn rewards with the highest possible bonus multiplier',
    category: 'staking',
    type: 'special',
    requirements: { activity: 'max_multiplier_reward', threshold: 1 },
    rewards: { points: 1000, badge: 'maximum-multiplier', multiplier: 1.1 },
    rarity: 'rare',
    order: 163
  }
];

async function initializeStakingAchievements() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles');
    console.log('Connected to MongoDB');

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const achievementData of stakingAchievements) {
      try {
        const existing = await Achievement.findOne({ name: achievementData.name });
        
        if (existing) {
          // Update existing achievement if needed
          const hasChanges = JSON.stringify(existing.toObject()) !== JSON.stringify({
            ...existing.toObject(),
            ...achievementData,
            _id: existing._id,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt
          });

          if (hasChanges) {
            await Achievement.findByIdAndUpdate(existing._id, achievementData);
            console.log(`Updated achievement: ${achievementData.name}`);
            updated++;
          } else {
            console.log(`Skipped achievement (no changes): ${achievementData.name}`);
            skipped++;
          }
        } else {
          // Create new achievement
          const achievement = new Achievement(achievementData);
          await achievement.save();
          console.log(`Created achievement: ${achievementData.name}`);
          created++;
        }
      } catch (error) {
        console.error(`Error processing achievement ${achievementData.name}:`, error.message);
      }
    }

    console.log('\nStaking achievements initialization complete:');
    console.log(`- Created: ${created}`);
    console.log(`- Updated: ${updated}`);
    console.log(`- Skipped: ${skipped}`);
    console.log(`- Total processed: ${created + updated + skipped}`);

  } catch (error) {
    console.error('Error initializing staking achievements:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the initialization if this script is executed directly
if (require.main === module) {
  initializeStakingAchievements()
    .then(() => {
      console.log('Staking achievements initialization completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to initialize staking achievements:', error);
      process.exit(1);
    });
}

module.exports = { stakingAchievements, initializeStakingAchievements };