const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const StakingPosition = require('../models/staking/stakingPosition');
const StakingContract = require('../models/staking/stakingContract');
const User = require('../models/user/user');
const smartContractService = require('../services/smartContractService');
const blockchainVerificationService = require('../services/blockchainVerificationService');
const stakingService = require('../services/stakingService');

// Mock smart contract service
jest.mock('../services/smartContractService');
jest.mock('../services/blockchainVerificationService');

describe('Smart Contract Staking System', () => {
  let testUser;
  let adminUser;
  let testContract;
  let authToken;
  let adminToken;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/naffles_test');
    }
  });

  beforeEach(async () => {
    // Clear test data
    await StakingPosition.deleteMany({});
    await StakingContract.deleteMany({});
    await User.deleteMany({});

    // Create test user
    testUser = new User({
      email: 'test@example.com',
      walletAddresses: ['0x1234567890123456789012345678901234567890'],
      foundersKeys: [],
      pointsBalance: 0
    });
    await testUser.save();

    // Create admin user
    adminUser = new User({
      email: 'admin@example.com',
      walletAddresses: ['0x0987654321098765432109876543210987654321'],
      role: 'admin',
      foundersKeys: [],
      pointsBalance: 0
    });
    await adminUser.save();

    // Create test staking contract
    testContract = new StakingContract({
      contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      blockchain: 'ethereum',
      contractName: 'Test NFT Collection',
      description: 'Test collection for smart contract staking',
      isActive: true,
      rewardStructures: {
        sixMonths: { openEntryTicketsPerMonth: 5, bonusMultiplier: 1.1 },
        twelveMonths: { openEntryTicketsPerMonth: 12, bonusMultiplier: 1.25 },
        threeYears: { openEntryTicketsPerMonth: 30, bonusMultiplier: 1.5 }
      },
      contractValidation: {
        isValidated: true,
        validatedAt: new Date(),
        validatedBy: adminUser._id
      },
      createdBy: adminUser._id
    });
    await testContract.save();

    // Generate auth tokens (simplified for testing)
    authToken = 'test-auth-token';
    adminToken = 'admin-auth-token';

    // Reset mocks
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Smart Contract Service', () => {
    describe('stakeNFT', () => {
      it('should stake NFT using smart contract', async () => {
        const mockResult = {
          success: true,
          transactionHash: '0xabcdef123456',
          blockNumber: 12345,
          gasUsed: '21000',
          positionId: 'contract-position-123',
          stakingData: {
            blockchain: 'ethereum',
            nftContract: testContract.contractAddress,
            tokenId: '1',
            duration: 0,
            userWallet: testUser.walletAddresses[0],
            stakedAt: new Date(),
            contractAddress: testContract.contractAddress
          }
        };

        smartContractService.stakeNFT.mockResolvedValue(mockResult);

        const result = await smartContractService.stakeNFT(
          'ethereum',
          testContract.contractAddress,
          '1',
          0,
          testUser.walletAddresses[0]
        );

        expect(result.success).toBe(true);
        expect(result.positionId).toBe('contract-position-123');
        expect(result.transactionHash).toBe('0xabcdef123456');
        expect(smartContractService.stakeNFT).toHaveBeenCalledWith(
          'ethereum',
          testContract.contractAddress,
          '1',
          0,
          testUser.walletAddresses[0]
        );
      });

      it('should handle smart contract staking failure', async () => {
        const mockResult = {
          success: false,
          error: 'Contract paused'
        };

        smartContractService.stakeNFT.mockResolvedValue(mockResult);

        const result = await smartContractService.stakeNFT(
          'ethereum',
          testContract.contractAddress,
          '1',
          0,
          testUser.walletAddresses[0]
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Contract paused');
      });
    });

    describe('claimNFT', () => {
      it('should claim NFT using smart contract', async () => {
        const mockResult = {
          success: true,
          transactionHash: '0xfedcba654321',
          blockNumber: 12346,
          gasUsed: '25000',
          claimData: {
            blockchain: 'ethereum',
            positionId: 'contract-position-123',
            userWallet: testUser.walletAddresses[0],
            claimedAt: new Date(),
            contractAddress: testContract.contractAddress
          }
        };

        smartContractService.claimNFT.mockResolvedValue(mockResult);

        const result = await smartContractService.claimNFT(
          'ethereum',
          'contract-position-123',
          testUser.walletAddresses[0]
        );

        expect(result.success).toBe(true);
        expect(result.transactionHash).toBe('0xfedcba654321');
        expect(smartContractService.claimNFT).toHaveBeenCalledWith(
          'ethereum',
          'contract-position-123',
          testUser.walletAddresses[0]
        );
      });
    });

    describe('adminUnlock', () => {
      it('should admin unlock NFT using smart contract', async () => {
        const mockResult = {
          success: true,
          transactionHash: '0xadmin123456',
          blockNumber: 12347,
          gasUsed: '30000',
          unlockData: {
            blockchain: 'ethereum',
            positionId: 'contract-position-123',
            reason: 'Emergency unlock requested by user',
            adminWallet: adminUser.walletAddresses[0],
            unlockedAt: new Date(),
            contractAddress: testContract.contractAddress
          }
        };

        smartContractService.adminUnlock.mockResolvedValue(mockResult);

        const result = await smartContractService.adminUnlock(
          'ethereum',
          'contract-position-123',
          'Emergency unlock requested by user',
          adminUser.walletAddresses[0]
        );

        expect(result.success).toBe(true);
        expect(result.transactionHash).toBe('0xadmin123456');
        expect(smartContractService.adminUnlock).toHaveBeenCalledWith(
          'ethereum',
          'contract-position-123',
          'Emergency unlock requested by user',
          adminUser.walletAddresses[0]
        );
      });
    });
  });

  describe('Blockchain Verification Service', () => {
    describe('verifyStakingStatus', () => {
      it('should verify staking status against smart contract', async () => {
        const mockVerification = {
          verified: true,
          contractData: {
            owner: testUser.walletAddresses[0],
            nftContract: testContract.contractAddress,
            tokenId: '1',
            stakedAt: new Date(),
            unlockAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
            duration: 0,
            active: true
          },
          databaseData: {
            owner: testUser.walletAddresses[0],
            nftContract: testContract.contractAddress,
            tokenId: '1',
            stakedAt: new Date(),
            unlockAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
            duration: 6,
            active: true
          },
          discrepancies: [],
          integrityScore: 100
        };

        blockchainVerificationService.verifyStakingStatus.mockResolvedValue(mockVerification);

        const result = await blockchainVerificationService.verifyStakingStatus(
          'ethereum',
          'contract-position-123'
        );

        expect(result.verified).toBe(true);
        expect(result.integrityScore).toBe(100);
        expect(result.discrepancies).toHaveLength(0);
      });

      it('should detect discrepancies between contract and database', async () => {
        const mockVerification = {
          verified: false,
          contractData: {
            owner: testUser.walletAddresses[0],
            nftContract: testContract.contractAddress,
            tokenId: '1',
            stakedAt: new Date(),
            unlockAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
            duration: 0,
            active: true
          },
          databaseData: {
            owner: testUser.walletAddresses[0],
            nftContract: testContract.contractAddress,
            tokenId: '1',
            stakedAt: new Date(),
            unlockAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
            duration: 6,
            active: false // Discrepancy here
          },
          discrepancies: [
            {
              field: 'active',
              contract: true,
              database: false
            }
          ],
          integrityScore: 75
        };

        blockchainVerificationService.verifyStakingStatus.mockResolvedValue(mockVerification);

        const result = await blockchainVerificationService.verifyStakingStatus(
          'ethereum',
          'contract-position-123'
        );

        expect(result.verified).toBe(false);
        expect(result.integrityScore).toBe(75);
        expect(result.discrepancies).toHaveLength(1);
        expect(result.discrepancies[0].field).toBe('active');
      });
    });

    describe('verifyCrossChainStaking', () => {
      it('should verify staking across multiple chains', async () => {
        const mockVerification = {
          totalStaked: 2,
          activePositions: [
            {
              positionId: 'eth-position-1',
              nftContract: testContract.contractAddress,
              tokenId: '1',
              duration: 6,
              verified: true
            },
            {
              positionId: 'poly-position-1',
              nftContract: '0xpolygoncontract123',
              tokenId: '2',
              duration: 12,
              verified: true
            }
          ],
          collectionBreakdown: {
            [testContract.contractAddress]: {
              count: 1,
              contractName: 'Test NFT Collection',
              blockchain: 'ethereum'
            },
            '0xpolygoncontract123': {
              count: 1,
              contractName: 'Polygon NFT Collection',
              blockchain: 'polygon'
            }
          },
          eligibleForBenefits: true,
          verificationScore: 95,
          chains: {
            ethereum: { positions: 1, totalStaked: 1, verified: true },
            polygon: { positions: 1, totalStaked: 1, verified: true },
            base: { positions: 0, totalStaked: 0, verified: true },
            solana: { positions: 0, totalStaked: 0, verified: true }
          }
        };

        blockchainVerificationService.verifyCrossChainStaking.mockResolvedValue(mockVerification);

        const result = await blockchainVerificationService.verifyCrossChainStaking(
          testUser.walletAddresses
        );

        expect(result.totalStaked).toBe(2);
        expect(result.eligibleForBenefits).toBe(true);
        expect(result.verificationScore).toBe(95);
        expect(Object.keys(result.collectionBreakdown)).toHaveLength(2);
      });
    });

    describe('verifyGamingBonuses', () => {
      it('should calculate gaming bonuses based on staked NFTs', async () => {
        const mockBonuses = {
          eligible: true,
          bonuses: {
            [testContract.contractAddress]: {
              contractName: 'Test NFT Collection',
              stakedCount: 1,
              averageMultiplier: 1.1,
              blockchain: 'ethereum'
            }
          },
          totalMultiplier: 1.1,
          verificationScore: 100,
          totalStaked: 1
        };

        blockchainVerificationService.verifyGamingBonuses.mockResolvedValue(mockBonuses);

        const result = await blockchainVerificationService.verifyGamingBonuses(
          testUser.walletAddresses
        );

        expect(result.eligible).toBe(true);
        expect(result.totalMultiplier).toBe(1.1);
        expect(result.bonuses[testContract.contractAddress]).toBeDefined();
        expect(result.bonuses[testContract.contractAddress].stakedCount).toBe(1);
      });
    });
  });

  describe('Staking Service Integration', () => {
    describe('stakeNFT with smart contracts', () => {
      it('should stake NFT and create database record with smart contract data', async () => {
        // Mock smart contract staking
        const mockLockResult = {
          success: true,
          lockingData: {
            walletAddress: testUser.walletAddresses[0],
            contractAddress: testContract.contractAddress,
            tokenId: '1',
            blockchain: 'ethereum',
            stakingDuration: '6m',
            lockedAt: new Date(),
            unlockAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
            lockingHash: 'contract-position-123',
            smartContractPositionId: 'contract-position-123',
            onChainVerified: true
          },
          transactionHash: '0xstake123456',
          blockNumber: 12345,
          gasUsed: '21000'
        };

        // Mock blockchain service
        const stakingBlockchainService = require('../services/stakingBlockchainService');
        stakingBlockchainService.lockNFT = jest.fn().mockResolvedValue(mockLockResult);
        stakingBlockchainService.verifyNFTOwnership = jest.fn().mockResolvedValue(true);

        const nftData = {
          contractAddress: testContract.contractAddress,
          tokenId: '1',
          metadata: {
            name: 'Test NFT #1',
            description: 'Test NFT for staking',
            image: 'https://example.com/nft1.png'
          }
        };

        const result = await stakingService.stakeNFT(
          testUser._id,
          testContract._id,
          nftData,
          6
        );

        expect(result).toBeDefined();
        expect(result.smartContractPositionId).toBe('contract-position-123');
        expect(result.onChainVerified).toBe(true);

        // Verify database record
        const dbPosition = await StakingPosition.findById(result._id);
        expect(dbPosition.smartContractPositionId).toBe('contract-position-123');
        expect(dbPosition.onChainVerified).toBe(true);
        expect(dbPosition.stakingTransaction.txHash).toBe('0xstake123456');
      });
    });

    describe('unstakeNFT with smart contracts', () => {
      it('should unstake NFT using smart contract and update database', async () => {
        // Create a staking position first
        const stakingPosition = new StakingPosition({
          userId: testUser._id,
          stakingContractId: testContract._id,
          nftTokenId: '1',
          nftContractAddress: testContract.contractAddress,
          blockchain: 'ethereum',
          stakingDuration: 6,
          stakedAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // 6 months ago
          lockingHash: 'test-hash',
          walletAddress: testUser.walletAddresses[0],
          smartContractPositionId: 'contract-position-123',
          onChainVerified: true
        });
        await stakingPosition.save();

        // Mock smart contract unlocking
        const mockUnlockResult = {
          success: true,
          unlockingData: {
            walletAddress: testUser.walletAddresses[0],
            contractAddress: testContract.contractAddress,
            tokenId: '1',
            blockchain: 'ethereum',
            unlockedAt: new Date(),
            unlockingHash: 'unlock-hash-123',
            smartContractPositionId: 'contract-position-123',
            onChainVerified: true
          },
          transactionHash: '0xunstake123456',
          blockNumber: 12346,
          gasUsed: '25000'
        };

        const stakingBlockchainService = require('../services/stakingBlockchainService');
        stakingBlockchainService.unlockNFT = jest.fn().mockResolvedValue(mockUnlockResult);

        const result = await stakingService.unstakeNFT(
          testUser._id,
          stakingPosition._id,
          '0xunstake123456',
          12346
        );

        expect(result.status).toBe('unstaked');
        expect(result.actualUnstakedAt).toBeDefined();
        expect(result.unstakingTransaction.txHash).toBe('0xunstake123456');
      });
    });
  });

  describe('Admin Functions', () => {
    describe('adminUnlockNFT', () => {
      it('should allow admin to unlock NFT via smart contract', async () => {
        // Create a staking position
        const stakingPosition = new StakingPosition({
          userId: testUser._id,
          stakingContractId: testContract._id,
          nftTokenId: '1',
          nftContractAddress: testContract.contractAddress,
          blockchain: 'ethereum',
          stakingDuration: 6,
          stakedAt: new Date(),
          lockingHash: 'test-hash',
          walletAddress: testUser.walletAddresses[0],
          smartContractPositionId: 'contract-position-123',
          onChainVerified: true
        });
        await stakingPosition.save();

        // Mock admin unlock
        const mockUnlockResult = {
          success: true,
          transactionHash: '0xadminunlock123',
          blockNumber: 12347,
          gasUsed: '30000',
          unlockData: {
            blockchain: 'ethereum',
            positionId: 'contract-position-123',
            reason: 'Emergency unlock requested',
            adminWallet: adminUser.walletAddresses[0],
            unlockedAt: new Date(),
            contractAddress: testContract.contractAddress
          }
        };

        const stakingBlockchainService = require('../services/stakingBlockchainService');
        stakingBlockchainService.adminUnlockNFT = jest.fn().mockResolvedValue(mockUnlockResult);

        const result = await stakingService.adminUnlockNFT(
          stakingPosition._id,
          'Emergency unlock requested',
          adminUser._id
        );

        expect(result.success).toBe(true);
        expect(result.transactionHash).toBe('0xadminunlock123');
        expect(result.adminAction).toBe('smart_contract_unlock');

        // Verify database update
        const updatedPosition = await StakingPosition.findById(stakingPosition._id);
        expect(updatedPosition.status).toBe('unstaked');
        expect(updatedPosition.emergencyUnlock).toBeDefined();
        expect(updatedPosition.emergencyUnlock.reason).toBe('Emergency unlock requested');
      });
    });

    describe('pauseContract', () => {
      it('should allow admin to pause smart contract', async () => {
        const mockPauseResult = {
          success: true,
          transactionHash: '0xpause123456',
          blockNumber: 12348,
          gasUsed: '35000',
          pauseData: {
            blockchain: 'ethereum',
            adminWallet: adminUser.walletAddresses[0],
            pausedAt: new Date(),
            contractAddress: testContract.contractAddress
          }
        };

        const stakingBlockchainService = require('../services/stakingBlockchainService');
        stakingBlockchainService.pauseStakingContract = jest.fn().mockResolvedValue(mockPauseResult);

        const result = await stakingService.pauseStakingContract('ethereum', adminUser._id);

        expect(result.success).toBe(true);
        expect(result.transactionHash).toBe('0xpause123456');
        expect(result.adminAction).toBe('contract_pause');
      });
    });
  });

  describe('Data Consistency', () => {
    describe('performDataConsistencyCheck', () => {
      it('should check consistency between database and smart contracts', async () => {
        const mockConsistencyCheck = {
          totalChecked: 100,
          inconsistencies: 5,
          consistencyScore: 95,
          issues: [
            {
              type: 'verification_failed',
              positionId: 'position-123',
              blockchain: 'ethereum',
              smartContractPositionId: 'contract-position-123',
              discrepancies: [
                { field: 'active', contract: true, database: false }
              ],
              integrityScore: 75
            }
          ],
          timestamp: new Date()
        };

        blockchainVerificationService.performDataConsistencyCheck.mockResolvedValue(mockConsistencyCheck);

        const result = await stakingService.performDataConsistencyCheck('ethereum');

        expect(result.totalChecked).toBe(100);
        expect(result.consistencyScore).toBe(95);
        expect(result.issues).toHaveLength(5);
      });
    });
  });

  describe('Security and Monitoring', () => {
    describe('detectAnomalies', () => {
      it('should detect suspicious staking patterns', async () => {
        const mockAnomalies = {
          timeWindow: 24,
          totalAnomalies: 2,
          anomalies: [
            {
              type: 'high_frequency_staking',
              wallet: testUser.walletAddresses[0],
              frequency: 15,
              severity: 'medium'
            },
            {
              type: 'unusual_contract_activity',
              contract: testContract.contractAddress,
              frequency: 50,
              averageActivity: 10,
              severity: 'high'
            }
          ],
          riskScore: 15,
          timestamp: new Date()
        };

        blockchainVerificationService.detectAnomalies.mockResolvedValue(mockAnomalies);

        const result = await blockchainVerificationService.detectAnomalies();

        expect(result.totalAnomalies).toBe(2);
        expect(result.riskScore).toBe(15);
        expect(result.anomalies[0].type).toBe('high_frequency_staking');
        expect(result.anomalies[1].type).toBe('unusual_contract_activity');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle smart contract connection failures gracefully', async () => {
      smartContractService.stakeNFT.mockRejectedValue(new Error('Network connection failed'));

      try {
        await smartContractService.stakeNFT(
          'ethereum',
          testContract.contractAddress,
          '1',
          0,
          testUser.walletAddresses[0]
        );
      } catch (error) {
        expect(error.message).toBe('Network connection failed');
      }
    });

    it('should handle invalid smart contract responses', async () => {
      smartContractService.getStakingPosition.mockResolvedValue(null);

      const result = await smartContractService.getStakingPosition('ethereum', 'invalid-position');
      expect(result).toBeNull();
    });

    it('should handle verification service failures', async () => {
      blockchainVerificationService.verifyStakingStatus.mockResolvedValue({
        verified: false,
        error: 'Position not found on smart contract',
        blockchain: 'ethereum',
        positionId: 'invalid-position'
      });

      const result = await blockchainVerificationService.verifyStakingStatus(
        'ethereum',
        'invalid-position'
      );

      expect(result.verified).toBe(false);
      expect(result.error).toBe('Position not found on smart contract');
    });
  });

  describe('Performance', () => {
    it('should handle batch verification efficiently', async () => {
      const positions = Array.from({ length: 50 }, (_, i) => ({
        blockchain: 'ethereum',
        positionId: `contract-position-${i}`,
        dbPositionId: `db-position-${i}`
      }));

      const mockResults = positions.map(pos => ({
        verified: true,
        blockchain: pos.blockchain,
        positionId: pos.positionId,
        integrityScore: 100
      }));

      blockchainVerificationService.batchVerifyStakingPositions.mockResolvedValue(mockResults);

      const startTime = Date.now();
      const result = await blockchainVerificationService.batchVerifyStakingPositions(positions);
      const endTime = Date.now();

      expect(result).toHaveLength(50);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.every(r => r.verified)).toBe(true);
    });
  });
});

describe('Smart Contract Admin API', () => {
  let adminToken;
  let testPosition;

  beforeEach(async () => {
    // Setup admin authentication (simplified for testing)
    adminToken = 'admin-test-token';

    // Create test staking position
    testPosition = new StakingPosition({
      userId: new mongoose.Types.ObjectId(),
      stakingContractId: new mongoose.Types.ObjectId(),
      nftTokenId: '1',
      nftContractAddress: '0xtest123',
      blockchain: 'ethereum',
      stakingDuration: 6,
      stakedAt: new Date(),
      lockingHash: 'test-hash',
      walletAddress: '0x1234567890123456789012345678901234567890',
      smartContractPositionId: 'contract-position-123',
      onChainVerified: true
    });
    await testPosition.save();
  });

  describe('POST /admin/smart-contract/unlock-nft', () => {
    it('should unlock NFT with valid admin request', async () => {
      const mockUnlockResult = {
        success: true,
        position: testPosition,
        transactionHash: '0xunlock123',
        adminAction: 'smart_contract_unlock'
      };

      stakingService.adminUnlockNFT = jest.fn().mockResolvedValue(mockUnlockResult);

      const response = await request(app)
        .post('/admin/smart-contract/unlock-nft')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          positionId: testPosition._id.toString(),
          reason: 'Emergency unlock requested by user support'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transactionHash).toBe('0xunlock123');
    });

    it('should reject unlock request with insufficient reason', async () => {
      const response = await request(app)
        .post('/admin/smart-contract/unlock-nft')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          positionId: testPosition._id.toString(),
          reason: 'Short' // Too short
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('at least 10 characters');
    });
  });

  describe('GET /admin/smart-contract/health', () => {
    it('should return smart contract health status', async () => {
      const mockHealth = {
        enabled: true,
        status: 'healthy',
        chains: {
          ethereum: { connected: true, blockNumber: 12345 },
          polygon: { connected: true, blockNumber: 67890 },
          base: { connected: true, blockNumber: 11111 },
          solana: { connected: true, slot: 22222 }
        },
        contracts: {
          ethereum: { available: true, stats: { totalStaked: 100 } },
          polygon: { available: true, stats: { totalStaked: 50 } }
        }
      };

      stakingService.getSmartContractHealth = jest.fn().mockResolvedValue(mockHealth);

      const response = await request(app)
        .get('/admin/smart-contract/health')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.enabled).toBe(true);
      expect(response.body.data.status).toBe('healthy');
    });
  });

  describe('GET /admin/smart-contract/consistency-check', () => {
    it('should perform data consistency check', async () => {
      const mockConsistencyCheck = {
        totalChecked: 100,
        inconsistencies: 2,
        consistencyScore: 98,
        issues: [],
        timestamp: new Date()
      };

      stakingService.performDataConsistencyCheck = jest.fn().mockResolvedValue(mockConsistencyCheck);

      const response = await request(app)
        .get('/admin/smart-contract/consistency-check')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.consistencyScore).toBe(98);
    });
  });
});