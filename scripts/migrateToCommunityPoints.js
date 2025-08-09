const mongoose = require('mongoose');
const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const CommunityPointsBalance = require('../models/points/communityPointsBalance');
const CommunityPointsTransaction = require('../models/points/communityPointsTransaction');
const CommunityAchievement = require('../models/points/communityAchievement');

// Import existing models for migration
const PointsBalance = require('../models/points/pointsBalance');
const PointsTransaction = require('../models/points/pointsTransaction');
const Achievement = require('../models/points/achievement');
const UserAchievement = require('../models/points/userAchievement');

class CommunityPointsMigration {
  constructor() {
    this.nafflesCommunityId = null;
  }

  async migrate() {
    try {
      console.log('Starting community points system migration...');

      // Step 1: Create Naffles flagship community
      await this.createNafflesCommunity();

      // Step 2: Migrate existing users to Naffles community
      await this.migrateUsersToNafflesCommunity();

      // Step 3: Migrate existing points balances
      await this.migratePointsBalances();

      // Step 4: Migrate existing transactions
      await this.migratePointsTransactions();

      // Step 5: Migrate achievements
      await this.migrateAchievements();

      // Step 6: Create indexes
      await this.createIndexes();

      console.log('Community points system migration completed successfully!');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  async createNafflesCommunity() {
    console.log('Creating Naffles flagship community...');
    
    const nafflesCommunity = await Community.createNafflesCommunity();
    this.nafflesCommunityId = nafflesCommunity._id;
    
    console.log(`Naffles community created with ID: ${this.nafflesCommunityId}`);
  }

  async migrateUsersToNafflesCommunity() {
    console.log('Migrating existing users to Naffles community...');
    
    // Get all users who have points balances (existing users)
    const existingUsers = await PointsBalance.find({}).distinct('userId');
    
    console.log(`Found ${existingUsers.length} existing users to migrate`);

    let migratedCount = 0;
    for (const userId of existingUsers) {
      try {
        // Check if user is already a member
        const existingMembership = await CommunityMember.findOne({
          userId,
          communityId: this.nafflesCommunityId
        });

        if (!existingMembership) {
          const membership = new CommunityMember({
            userId,
            communityId: this.nafflesCommunityId,
            role: 'member',
            joinedAt: new Date('2024-01-01') // Set historical join date
          });
          await membership.save();
          migratedCount++;
        }
      } catch (error) {
        console.error(`Error migrating user ${userId}:`, error);
      }
    }

    // Update community member count
    const community = await Community.findById(this.nafflesCommunityId);
    community.stats.memberCount = migratedCount;
    await community.save();

    console.log(`Migrated ${migratedCount} users to Naffles community`);
  }

  async migratePointsBalances() {
    console.log('Migrating points balances...');
    
    const existingBalances = await PointsBalance.find({});
    console.log(`Found ${existingBalances.length} points balances to migrate`);

    let migratedCount = 0;
    for (const balance of existingBalances) {
      try {
        // Check if already migrated
        const existingCommunityBalance = await CommunityPointsBalance.findOne({
          userId: balance.userId,
          communityId: this.nafflesCommunityId
        });

        if (!existingCommunityBalance) {
          const communityBalance = new CommunityPointsBalance({
            userId: balance.userId,
            communityId: this.nafflesCommunityId,
            balance: balance.balance,
            totalEarned: balance.totalEarned,
            totalSpent: balance.totalSpent,
            lastActivity: balance.lastActivity,
            tier: balance.tier,
            tierProgress: balance.tierProgress,
            communityName: 'Naffles',
            pointsName: 'Naffles Points',
            pointsSymbol: 'NP',
            isNafflesCommunity: true,
            createdAt: balance.createdAt,
            updatedAt: balance.updatedAt
          });
          
          await communityBalance.save();
          migratedCount++;
        }
      } catch (error) {
        console.error(`Error migrating balance for user ${balance.userId}:`, error);
      }
    }

    console.log(`Migrated ${migratedCount} points balances`);
  }

  async migratePointsTransactions() {
    console.log('Migrating points transactions...');
    
    const existingTransactions = await PointsTransaction.find({}).sort({ createdAt: 1 });
    console.log(`Found ${existingTransactions.length} transactions to migrate`);

    let migratedCount = 0;
    const batchSize = 1000;
    
    for (let i = 0; i < existingTransactions.length; i += batchSize) {
      const batch = existingTransactions.slice(i, i + batchSize);
      const communityTransactions = [];

      for (const transaction of batch) {
        try {
          // Check if already migrated
          const existingCommunityTransaction = await CommunityPointsTransaction.findOne({
            userId: transaction.userId,
            communityId: this.nafflesCommunityId,
            createdAt: transaction.createdAt,
            amount: transaction.amount
          });

          if (!existingCommunityTransaction) {
            communityTransactions.push({
              userId: transaction.userId,
              communityId: this.nafflesCommunityId,
              type: transaction.type,
              activity: transaction.activity,
              amount: transaction.amount,
              balanceBefore: transaction.balanceBefore,
              balanceAfter: transaction.balanceAfter,
              multiplier: transaction.multiplier,
              baseAmount: transaction.baseAmount,
              metadata: transaction.metadata,
              description: transaction.description,
              isReversible: transaction.isReversible,
              isSystemWide: true, // All existing transactions are system-wide
              pointsName: 'Naffles Points',
              isNafflesCommunity: true,
              createdAt: transaction.createdAt,
              updatedAt: transaction.updatedAt
            });
          }
        } catch (error) {
          console.error(`Error preparing transaction ${transaction._id}:`, error);
        }
      }

      if (communityTransactions.length > 0) {
        await CommunityPointsTransaction.insertMany(communityTransactions);
        migratedCount += communityTransactions.length;
      }

      console.log(`Migrated batch ${Math.floor(i / batchSize) + 1}, total: ${migratedCount}`);
    }

    console.log(`Migrated ${migratedCount} transactions`);
  }

  async migrateAchievements() {
    console.log('Migrating achievements...');
    
    const existingAchievements = await Achievement.find({});
    console.log(`Found ${existingAchievements.length} achievements to migrate`);

    let migratedCount = 0;
    for (const achievement of existingAchievements) {
      try {
        // Check if already migrated
        const existingCommunityAchievement = await CommunityAchievement.findOne({
          communityId: this.nafflesCommunityId,
          name: achievement.name
        });

        if (!existingCommunityAchievement) {
          const communityAchievement = new CommunityAchievement({
            communityId: this.nafflesCommunityId,
            name: achievement.name,
            description: achievement.description,
            category: achievement.category,
            type: achievement.type,
            requirements: achievement.requirements,
            rewards: {
              ...achievement.rewards,
              pointsName: 'Naffles Points'
            },
            rarity: achievement.rarity,
            icon: achievement.icon,
            isActive: achievement.isActive,
            isSystemWide: true, // All existing achievements are system-wide
            isNafflesCommunity: true,
            order: migratedCount,
            createdAt: achievement.createdAt,
            updatedAt: achievement.updatedAt
          });
          
          await communityAchievement.save();
          migratedCount++;
        }
      } catch (error) {
        console.error(`Error migrating achievement ${achievement._id}:`, error);
      }
    }

    console.log(`Migrated ${migratedCount} achievements`);
  }

  async createIndexes() {
    console.log('Creating database indexes...');
    
    try {
      await CommunityPointsBalance.createIndexes();
      await CommunityPointsTransaction.createIndexes();
      await CommunityAchievement.createIndexes();
      await Community.createIndexes();
      await CommunityMember.createIndexes();
      
      console.log('Database indexes created successfully');
    } catch (error) {
      console.error('Error creating indexes:', error);
    }
  }

  async rollback() {
    console.log('Rolling back community points migration...');
    
    try {
      // Remove migrated data
      await CommunityPointsBalance.deleteMany({ isNafflesCommunity: true });
      await CommunityPointsTransaction.deleteMany({ isNafflesCommunity: true });
      await CommunityAchievement.deleteMany({ isNafflesCommunity: true });
      await CommunityMember.deleteMany({ communityId: this.nafflesCommunityId });
      await Community.deleteOne({ isNafflesCommunity: true });
      
      console.log('Migration rollback completed');
    } catch (error) {
      console.error('Error during rollback:', error);
      throw error;
    }
  }
}

// CLI execution
if (require.main === module) {
  const migration = new CommunityPointsMigration();
  
  const command = process.argv[2];
  
  if (command === 'rollback') {
    migration.rollback()
      .then(() => {
        console.log('Rollback completed successfully');
        process.exit(0);
      })
      .catch(error => {
        console.error('Rollback failed:', error);
        process.exit(1);
      });
  } else {
    migration.migrate()
      .then(() => {
        console.log('Migration completed successfully');
        process.exit(0);
      })
      .catch(error => {
        console.error('Migration failed:', error);
        process.exit(1);
      });
  }
}

module.exports = CommunityPointsMigration;