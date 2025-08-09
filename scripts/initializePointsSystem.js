const mongoose = require('mongoose');
const achievementService = require('../services/achievementService');
const PartnerToken = require('../models/points/partnerToken');
const PointsJackpot = require('../models/points/pointsJackpot');

// Default partner tokens for testing
const defaultPartnerTokens = [
  {
    name: 'Ethereum',
    symbol: 'ETH',
    contractAddress: '0x0000000000000000000000000000000000000000',
    chainId: '1',
    multiplier: 1.2,
    partnerInfo: {
      name: 'Ethereum Foundation',
      website: 'https://ethereum.org',
      description: 'The native token of Ethereum blockchain',
      logo: 'https://ethereum.org/static/6b935ac0e6194247347855dc3d328e83/6ed5f/eth-diamond-black.webp'
    },
    bonusActivities: {
      gaming: true,
      raffleTickets: true,
      raffleCreation: false,
      staking: true
    }
  },
  {
    name: 'Solana',
    symbol: 'SOL',
    contractAddress: 'So11111111111111111111111111111111111111112',
    chainId: 'solana',
    multiplier: 1.3,
    partnerInfo: {
      name: 'Solana Foundation',
      website: 'https://solana.com',
      description: 'The native token of Solana blockchain',
      logo: 'https://solana.com/_next/static/media/logotype.e4df684f.svg'
    },
    bonusActivities: {
      gaming: true,
      raffleTickets: true,
      raffleCreation: true,
      staking: true
    }
  },
  {
    name: 'Polygon',
    symbol: 'MATIC',
    contractAddress: '0x0000000000000000000000000000000000001010',
    chainId: '137',
    multiplier: 1.25,
    partnerInfo: {
      name: 'Polygon Technology',
      website: 'https://polygon.technology',
      description: 'The native token of Polygon network',
      logo: 'https://polygon.technology/logo.svg'
    },
    bonusActivities: {
      gaming: true,
      raffleTickets: true,
      raffleCreation: false,
      staking: false
    }
  },
  {
    name: 'Base ETH',
    symbol: 'ETH',
    contractAddress: '0x0000000000000000000000000000000000000000',
    chainId: '8453',
    multiplier: 1.15,
    partnerInfo: {
      name: 'Base Network',
      website: 'https://base.org',
      description: 'Ethereum on Base L2 network',
      logo: 'https://base.org/logo.svg'
    },
    bonusActivities: {
      gaming: true,
      raffleTickets: true,
      raffleCreation: false,
      staking: false
    }
  }
];

async function initializePointsSystem() {
  try {
    console.log('🚀 Initializing Points System...');

    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles');
      console.log('📦 Connected to MongoDB');
    }

    // Initialize default achievements
    console.log('🏆 Initializing default achievements...');
    await achievementService.initializeDefaultAchievements();
    console.log('✅ Default achievements initialized');

    // Initialize default partner tokens
    console.log('🪙 Initializing default partner tokens...');
    for (const tokenData of defaultPartnerTokens) {
      const existing = await PartnerToken.findOne({
        contractAddress: tokenData.contractAddress.toLowerCase(),
        chainId: tokenData.chainId
      });

      if (!existing) {
        const partnerToken = new PartnerToken({
          ...tokenData,
          contractAddress: tokenData.contractAddress.toLowerCase()
        });
        await partnerToken.save();
        console.log(`✅ Created partner token: ${tokenData.name} (${tokenData.symbol})`);
      } else {
        console.log(`⏭️  Partner token already exists: ${tokenData.name} (${tokenData.symbol})`);
      }
    }

    // Initialize jackpot
    console.log('🎰 Initializing points jackpot...');
    let jackpot = await PointsJackpot.findOne();
    if (!jackpot) {
      jackpot = new PointsJackpot();
      await jackpot.save();
      console.log('✅ Points jackpot initialized');
    } else {
      console.log('⏭️  Points jackpot already exists');
    }

    console.log('🎉 Points system initialization completed successfully!');
    console.log('\n📊 Summary:');
    
    const achievementCount = await require('../models/points/achievement').countDocuments({ isActive: true });
    const partnerTokenCount = await PartnerToken.countDocuments({ isActive: true });
    
    console.log(`   • Achievements: ${achievementCount}`);
    console.log(`   • Partner Tokens: ${partnerTokenCount}`);
    console.log(`   • Jackpot: ${jackpot.currentAmount} points`);
    
    console.log('\n🔧 Next steps:');
    console.log('   1. Start the server: npm run dev');
    console.log('   2. Test points endpoints: /api/points/*');
    console.log('   3. Access admin panel: /admin/points');
    console.log('   4. Configure additional partner tokens as needed');

  } catch (error) {
    console.error('❌ Error initializing points system:', error);
    throw error;
  }
}

// Run initialization if called directly
if (require.main === module) {
  initializePointsSystem()
    .then(() => {
      console.log('✅ Initialization completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Initialization failed:', error);
      process.exit(1);
    });
}

module.exports = initializePointsSystem;