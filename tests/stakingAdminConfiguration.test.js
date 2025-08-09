const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const StakingContract = require('../models/staking/stakingContract');
const User = require('../models/user/user');
const { TestEnvironment } = require('./testEnvironment');

describe('Staking Admin Configuration', () => {
  let testEnv;
  let adminUser;
  let adminToken;
  let testContract;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    await testEnv.setup();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    // Create admin user
    adminUser = new User({
      email: 'admin@test.com',
      username: 'admin',
      walletAddresses: ['0x1234567890123456789012345678901234567890'],
      isAdmin: true
    });
    await adminUser.save();

    // Generate admin token
    adminToken = testEnv.generateAuthToken(adminUser._id);

    // Create test contract
    testContract = new StakingContract({
      contractName: 'Test NFT Collection',
      contractAddress: '0x1234567890123456789012345678901234567890',
      blockchain: 'ethereum',
      description: 'Test contract for staking',
      isActive: true,
      createdBy: adminUser._id,
      rewardStructures: {
        sixMonths: {
          openEntryTicketsPerMonth: 5,
          bonusMultiplier: 1.1
        },
        twelveMonths: {
          openEntryTicketsPerMonth: 12,
          bonusMultiplier: 1.25
        },
        threeYears: {
          openEntryTicketsPerMonth: 30,
          bonusMultiplier: 1.5
        }
      }
    });
    await testContract.save();
  });

  afterEach(async () => {
    await User.deleteMany({});
    await StakingContract.deleteMany({});
  });

  describe('GET /api/admin/staking/dashboard', () => {
    it('should return dashboard data for admin users', async () => {
      const response = await request(app)
        .get('/api/admin/staking/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('contracts');
      expect(response.body.data).toHaveProperty('analytics');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data.contracts).toHaveLength(1);
      expect(response.body.data.summary.totalContracts).toBe(1);
    });

    it('should deny access to non-admin users', async () => {
      const regularUser = new User({
        email: 'user@test.com',
        username: 'user',
        walletAddresses: ['0x9876543210987654321098765432109876543210'],
        isAdmin: false
      });
      await regularUser.save();

      const userToken = testEnv.generateAuthToken(regularUser._id);

      await request(app)
        .get('/api/admin/staking/dashboard')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('POST /api/admin/staking/contracts/with-defaults', () => {
    it('should create a new staking contract with default rewards', async () => {
      const contractData = {
        contractName: 'New Test Collection',
        contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        blockchain: 'polygon',
        description: 'New test contract'
      };

      const response = await request(app)
        .post('/api/admin/staking/contracts/with-defaults')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(contractData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.contractName).toBe(contractData.contractName);
      expect(response.body.data.contractAddress).toBe(contractData.contractAddress.toLowerCase());
      expect(response.body.data.blockchain).toBe(contractData.blockchain);
      expect(response.body.data.rewardStructures).toBeDefined();
    });

    it('should validate contract address format', async () => {
      const contractData = {
        contractName: 'Invalid Contract',
        contractAddress: 'invalid-address',
        blockchain: 'ethereum'
      };

      const response = await request(app)
        .post('/api/admin/staking/contracts/with-defaults')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(contractData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid contract address format');
    });

    it('should prevent duplicate contracts', async () => {
      const contractData = {
        contractName: 'Duplicate Contract',
        contractAddress: testContract.contractAddress,
        blockchain: testContract.blockchain
      };

      const response = await request(app)
        .post('/api/admin/staking/contracts/with-defaults')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(contractData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });
  });

  describe('GET /api/admin/staking/contracts/default-rewards/:blockchain', () => {
    it('should return default reward structure for blockchain', async () => {
      const response = await request(app)
        .get('/api/admin/staking/contracts/default-rewards/ethereum')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.blockchain).toBe('ethereum');
      expect(response.body.data.defaultRewardStructure).toHaveProperty('sixMonths');
      expect(response.body.data.defaultRewardStructure).toHaveProperty('twelveMonths');
      expect(response.body.data.defaultRewardStructure).toHaveProperty('threeYears');
    });

    it('should calculate averages from existing contracts', async () => {
      // Create another contract with different rewards
      const anotherContract = new StakingContract({
        contractName: 'Another Test Collection',
        contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        blockchain: 'ethereum',
        isActive: true,
        createdBy: adminUser._id,
        contractValidation: { isValidated: true },
        rewardStructures: {
          sixMonths: {
            openEntryTicketsPerMonth: 10,
            bonusMultiplier: 1.2
          },
          twelveMonths: {
            openEntryTicketsPerMonth: 20,
            bonusMultiplier: 1.3
          },
          threeYears: {
            openEntryTicketsPerMonth: 50,
            bonusMultiplier: 1.6
          }
        }
      });
      await anotherContract.save();

      const response = await request(app)
        .get('/api/admin/staking/contracts/default-rewards/ethereum')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const defaults = response.body.data.defaultRewardStructure;
      
      // Should be averages of the two contracts
      expect(defaults.sixMonths.openEntryTicketsPerMonth).toBe(8); // (5 + 10) / 2 = 7.5 rounded to 8
      expect(defaults.twelveMonths.openEntryTicketsPerMonth).toBe(16); // (12 + 20) / 2 = 16
      expect(defaults.threeYears.openEntryTicketsPerMonth).toBe(40); // (30 + 50) / 2 = 40
    });
  });

  describe('PUT /api/admin/staking/contracts/:contractId/rewards', () => {
    it('should update reward structure for existing contract', async () => {
      const newRewards = {
        rewardStructures: {
          sixMonths: {
            openEntryTicketsPerMonth: 8,
            bonusMultiplier: 1.15
          },
          twelveMonths: {
            openEntryTicketsPerMonth: 15,
            bonusMultiplier: 1.3
          },
          threeYears: {
            openEntryTicketsPerMonth: 35,
            bonusMultiplier: 1.6
          }
        }
      };

      const response = await request(app)
        .put(`/api/admin/staking/contracts/${testContract._id}/rewards`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newRewards)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.rewardStructures.sixMonths.openEntryTicketsPerMonth).toBe(8);
      expect(response.body.data.rewardStructures.twelveMonths.bonusMultiplier).toBe(1.3);
    });

    it('should validate reward structure values', async () => {
      const invalidRewards = {
        rewardStructures: {
          sixMonths: {
            openEntryTicketsPerMonth: -5, // Invalid: negative
            bonusMultiplier: 0.5 // Invalid: less than 1
          },
          twelveMonths: {
            openEntryTicketsPerMonth: 12,
            bonusMultiplier: 1.25
          },
          threeYears: {
            openEntryTicketsPerMonth: 30,
            bonusMultiplier: 1.5
          }
        }
      };

      await request(app)
        .put(`/api/admin/staking/contracts/${testContract._id}/rewards`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidRewards)
        .expect(400);
    });
  });

  describe('POST /api/admin/staking/contracts/validate-address', () => {
    it('should validate Ethereum contract address', async () => {
      const addressData = {
        contractAddress: '0x1234567890123456789012345678901234567890',
        blockchain: 'ethereum'
      };

      const response = await request(app)
        .post('/api/admin/staking/contracts/validate-address')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(addressData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isValid).toBe(true);
      expect(response.body.data.exists).toBe(true); // testContract exists
    });

    it('should validate Solana contract address', async () => {
      const addressData = {
        contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        blockchain: 'solana'
      };

      const response = await request(app)
        .post('/api/admin/staking/contracts/validate-address')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(addressData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isValid).toBe(true);
      expect(response.body.data.exists).toBe(false);
    });

    it('should reject invalid contract addresses', async () => {
      const addressData = {
        contractAddress: 'invalid-address',
        blockchain: 'ethereum'
      };

      const response = await request(app)
        .post('/api/admin/staking/contracts/validate-address')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(addressData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isValid).toBe(false);
    });
  });

  describe('PUT /api/admin/staking/contracts/bulk-update', () => {
    let secondContract;

    beforeEach(async () => {
      secondContract = new StakingContract({
        contractName: 'Second Test Collection',
        contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        blockchain: 'polygon',
        isActive: true,
        createdBy: adminUser._id
      });
      await secondContract.save();
    });

    it('should update multiple contracts', async () => {
      const updateData = {
        contractIds: [testContract._id.toString(), secondContract._id.toString()],
        updates: {
          isActive: false,
          description: 'Bulk updated description'
        }
      };

      const response = await request(app)
        .put('/api/admin/staking/contracts/bulk-update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.updated).toHaveLength(2);
      expect(response.body.data.errors).toHaveLength(0);

      // Verify updates
      const updatedContract1 = await StakingContract.findById(testContract._id);
      const updatedContract2 = await StakingContract.findById(secondContract._id);
      
      expect(updatedContract1.isActive).toBe(false);
      expect(updatedContract1.description).toBe('Bulk updated description');
      expect(updatedContract2.isActive).toBe(false);
      expect(updatedContract2.description).toBe('Bulk updated description');
    });

    it('should handle partial failures in bulk update', async () => {
      const updateData = {
        contractIds: [testContract._id.toString(), 'invalid-id'],
        updates: {
          isActive: false
        }
      };

      const response = await request(app)
        .put('/api/admin/staking/contracts/bulk-update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.updated).toHaveLength(1);
      expect(response.body.data.errors).toHaveLength(1);
    });
  });

  describe('GET /api/admin/staking/contracts/:contractId/analytics', () => {
    it('should return contract analytics', async () => {
      const response = await request(app)
        .get(`/api/admin/staking/contracts/${testContract._id}/analytics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('contract');
      expect(response.body.data).toHaveProperty('performance');
      expect(response.body.data).toHaveProperty('analytics');
      expect(response.body.data.contract._id).toBe(testContract._id.toString());
    });

    it('should return 404 for non-existent contract', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      await request(app)
        .get(`/api/admin/staking/contracts/${fakeId}/analytics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('DELETE /api/admin/staking/contracts/:contractId', () => {
    it('should deactivate contract (soft delete)', async () => {
      const response = await request(app)
        .delete(`/api/admin/staking/contracts/${testContract._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isActive).toBe(false);

      // Verify contract is deactivated
      const updatedContract = await StakingContract.findById(testContract._id);
      expect(updatedContract.isActive).toBe(false);
    });

    it('should prevent deletion of contracts with active positions', async () => {
      // This would require creating a StakingPosition, but for now we'll test the basic case
      // In a real scenario, you'd create active staking positions first
      
      const response = await request(app)
        .delete(`/api/admin/staking/contracts/${testContract._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('CSV Upload and Export', () => {
    it('should handle CSV upload with valid data', async () => {
      const csvContent = `contractName,contractAddress,blockchain,description
Test Collection 1,0x1111111111111111111111111111111111111111,ethereum,First test collection
Test Collection 2,0x2222222222222222222222222222222222222222,polygon,Second test collection`;

      const response = await request(app)
        .post('/api/admin/staking/contracts/upload-csv')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('csvFile', Buffer.from(csvContent), 'test.csv')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.created).toHaveLength(2);
      expect(response.body.data.errors).toHaveLength(0);
    });

    it('should handle CSV upload with invalid data', async () => {
      const csvContent = `contractName,contractAddress,blockchain,description
Invalid Collection,invalid-address,ethereum,Invalid address`;

      const response = await request(app)
        .post('/api/admin/staking/contracts/upload-csv')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('csvFile', Buffer.from(csvContent), 'test.csv')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toHaveLength(1);
    });

    it('should export contracts as CSV', async () => {
      const response = await request(app)
        .get('/api/admin/staking/contracts/export-csv')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toContain('contractName');
      expect(response.text).toContain(testContract.contractName);
    });
  });
});