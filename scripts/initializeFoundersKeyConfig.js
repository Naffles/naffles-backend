const mongoose = require('mongoose');
const FoundersKeyConfig = require('../models/admin/foundersKeyConfig');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

const initializeFoundersKeyConfig = async () => {
  console.log('🔧 Initializing Founders Key Configuration...\n');

  try {
    // Check if configuration already exists
    const existingConfig = await FoundersKeyConfig.findOne({ isActive: true });
    
    if (existingConfig) {
      console.log('⚠️  Active configuration already exists');
      console.log('📊 Current Configuration:');
      console.log('   Version:', existingConfig.version);
      console.log('   Created:', existingConfig.createdAt.toISOString());
      console.log('   Updated:', existingConfig.updatedAt.toISOString());
      
      // Display current settings
      console.log('\n🎯 Tier Multipliers:');
      Object.entries(existingConfig.tierMultipliers).forEach(([tier, data]) => {
        console.log(`   ${tier}: Fee ${data.feeDiscountMultiplier}x, Tickets ${data.openEntryTicketsMultiplier}x`);
      });
      
      console.log('\n⏰ Staking Multipliers:');
      Object.entries(existingConfig.stakingMultipliers).forEach(([duration, data]) => {
        console.log(`   ${duration}: ${data.minDays} days → ${data.multiplier}x`);
      });
      
      console.log('\n🌐 Global Settings:');
      console.log(`   Max Fee Discount: ${existingConfig.globalSettings.maxFeeDiscountPercent}%`);
      console.log(`   Max Fee Discount (No Staking): ${existingConfig.globalSettings.maxFeeDiscountWithoutStaking}%`);
      console.log(`   Priority Access Min Tier: ${existingConfig.globalSettings.priorityAccessMinTier}`);
      console.log(`   Staking Duration: ${existingConfig.globalSettings.minStakingDurationDays}-${existingConfig.globalSettings.maxStakingDurationDays} days`);
      
      return;
    }

    // Create default configuration
    console.log('📝 Creating default configuration...');
    
    const defaultConfig = new FoundersKeyConfig({
      tierMultipliers: {
        tier1: {
          feeDiscountMultiplier: 1.0,
          openEntryTicketsMultiplier: 1
        },
        tier2: {
          feeDiscountMultiplier: 1.5,
          openEntryTicketsMultiplier: 2
        },
        tier3: {
          feeDiscountMultiplier: 2.0,
          openEntryTicketsMultiplier: 3
        },
        tier4: {
          feeDiscountMultiplier: 2.5,
          openEntryTicketsMultiplier: 5
        },
        tier5: {
          feeDiscountMultiplier: 3.0,
          openEntryTicketsMultiplier: 8
        }
      },
      stakingMultipliers: {
        duration30Days: {
          multiplier: 1.1,
          minDays: 30
        },
        duration90Days: {
          multiplier: 1.25,
          minDays: 90
        },
        duration180Days: {
          multiplier: 1.5,
          minDays: 180
        },
        duration365Days: {
          multiplier: 2.0,
          minDays: 365
        }
      },
      globalSettings: {
        maxFeeDiscountPercent: 75,
        maxFeeDiscountWithoutStaking: 50,
        priorityAccessMinTier: 2,
        maxStakingDurationDays: 1095, // 3 years
        minStakingDurationDays: 30
      },
      isActive: true
    });

    await defaultConfig.save();
    console.log('✅ Default configuration created successfully');

    // Display the created configuration
    console.log('\n📊 Created Configuration:');
    console.log('   Version:', defaultConfig.version);
    console.log('   ID:', defaultConfig._id);

    console.log('\n🎯 Tier Multipliers:');
    Object.entries(defaultConfig.tierMultipliers).forEach(([tier, data]) => {
      const tierNames = { tier1: 'Bronze', tier2: 'Silver', tier3: 'Gold', tier4: 'Platinum', tier5: 'Diamond' };
      console.log(`   ${tier} (${tierNames[tier]}): Fee ${data.feeDiscountMultiplier}x, Tickets ${data.openEntryTicketsMultiplier}x`);
    });

    console.log('\n⏰ Staking Multipliers:');
    Object.entries(defaultConfig.stakingMultipliers).forEach(([duration, data]) => {
      const durationNames = {
        duration30Days: '1 Month',
        duration90Days: '3 Months',
        duration180Days: '6 Months',
        duration365Days: '1 Year'
      };
      console.log(`   ${durationNames[duration]} (${data.minDays}+ days): ${data.multiplier}x multiplier`);
    });

    console.log('\n🌐 Global Settings:');
    console.log(`   Maximum Fee Discount (with staking): ${defaultConfig.globalSettings.maxFeeDiscountPercent}%`);
    console.log(`   Maximum Fee Discount (without staking): ${defaultConfig.globalSettings.maxFeeDiscountWithoutStaking}%`);
    console.log(`   Priority Access Minimum Tier: ${defaultConfig.globalSettings.priorityAccessMinTier}`);
    console.log(`   Staking Duration Range: ${defaultConfig.globalSettings.minStakingDurationDays}-${defaultConfig.globalSettings.maxStakingDurationDays} days`);

    // Test the configuration methods
    console.log('\n🧪 Testing Configuration Methods:');
    
    // Test tier multiplier
    const tier3FeeMultiplier = defaultConfig.getTierMultiplier(3, 'feeDiscount');
    const tier3TicketsMultiplier = defaultConfig.getTierMultiplier(3, 'openEntryTickets');
    console.log(`   Tier 3 Fee Multiplier: ${tier3FeeMultiplier}`);
    console.log(`   Tier 3 Tickets Multiplier: ${tier3TicketsMultiplier}`);
    
    // Test staking multiplier
    const staking6MonthsMultiplier = defaultConfig.getStakingMultiplier(180);
    const staking1YearMultiplier = defaultConfig.getStakingMultiplier(365);
    console.log(`   6 Months Staking Multiplier: ${staking6MonthsMultiplier}`);
    console.log(`   1 Year Staking Multiplier: ${staking1YearMultiplier}`);
    
    // Test benefit calculation
    const mockBaseBenefits = {
      feeDiscount: 10, // 10% base
      priorityAccess: false,
      openEntryTickets: 2 // 2 base tickets
    };
    
    const tier3NoStaking = defaultConfig.calculateBenefits(mockBaseBenefits, 3, 0);
    const tier3With6MonthStaking = defaultConfig.calculateBenefits(mockBaseBenefits, 3, 180);
    
    console.log('\n📈 Example Benefit Calculations (Base: 10% fee discount, 2 tickets):');
    console.log(`   Tier 3, No Staking: ${tier3NoStaking.feeDiscount}% discount, ${tier3NoStaking.openEntryTickets} tickets, Priority: ${tier3NoStaking.priorityAccess}`);
    console.log(`   Tier 3, 6 Month Staking: ${tier3With6MonthStaking.feeDiscount}% discount, ${tier3With6MonthStaking.openEntryTickets} tickets, Priority: ${tier3With6MonthStaking.priorityAccess}`);

    console.log('\n🎉 Founders Key Configuration Initialization Complete!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Access the admin panel to modify these settings');
    console.log('   2. Use the configuration API endpoints to manage settings');
    console.log('   3. The system will automatically use these values for benefit calculations');
    console.log('   4. All changes are versioned and tracked for audit purposes');

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    throw error;
  }
};

const main = async () => {
  await connectDB();
  
  try {
    await initializeFoundersKeyConfig();
  } catch (error) {
    console.error('Initialization failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
  }
};

// Run initialization if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { initializeFoundersKeyConfig };