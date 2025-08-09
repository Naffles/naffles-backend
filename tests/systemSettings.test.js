const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { AdminSettings } = require('../models/admin/adminSettings');
const User = require('../models/user/user');
const SecurityLog = require('../models/security/securityLog');
const TestEnvironment = require('./testEnvironment');

describe('System Settings Controller', () => {
    let testEnv;
    let adminUser;
    let adminToken;

    beforeAll(async () => {
        testEnv = new TestEnvironment();
        await testEnv.setup();
        
        // Create admin user
        adminUser = await User.create({
            username: 'admin',
            email: 'admin@test.com',
            walletAddress: '0x1234567890123456789012345678901234567890',
            isAdmin: true,
            isActive: true
        });

        // Generate admin token (simplified for testing)
        adminToken = 'admin-test-token';
    });

    afterAll(async () => {
        await testEnv.cleanup();
    });

    beforeEach(async () => {
        await AdminSettings.deleteMany({});
        await SecurityLog.deleteMany({});
    });

    describe('GET /api/admin/system-settings', () => {
        it('should get system settings with defaults if none exist', async () => {
            const response = await request(app)
                .get('/api/admin/system-settings')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('canCreateRaffle', 'everyone');
            expect(response.body.data).toHaveProperty('raffleFeePercentage', 3);
            expect(response.body.data).toHaveProperty('wageringFeePercentage', 3);
        });

        it('should get existing system settings', async () => {
            const settings = await AdminSettings.create({
                canCreateRaffle: 'foundersKeyHoldersOnly',
                raffleFeePercentage: 5,
                wageringFeePercentage: 4
            });

            const response = await request(app)
                .get('/api/admin/system-settings')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.canCreateRaffle).toBe('foundersKeyHoldersOnly');
            expect(response.body.data.raffleFeePercentage).toBe(5);
            expect(response.body.data.wageringFeePercentage).toBe(4);
        });
    });

    describe('PUT /api/admin/system-settings', () => {
        it('should update system settings', async () => {
            const updateData = {
                canCreateRaffle: 'foundersKeyHoldersOnly',
                raffleFeePercentage: 5,
                maximumDailyPoints: 2000
            };

            const response = await request(app)
                .put('/api/admin/system-settings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.canCreateRaffle).toBe('foundersKeyHoldersOnly');
            expect(response.body.data.raffleFeePercentage).toBe(5);
            expect(response.body.data.maximumDailyPoints).toBe(2000);

            // Verify security log was created
            const securityLog = await SecurityLog.findOne({ eventType: 'admin_settings_updated' });
            expect(securityLog).toBeTruthy();
            expect(securityLog.details.updatedFields).toEqual(Object.keys(updateData));
        });

        it('should validate input data', async () => {
            const invalidData = {
                canCreateRaffle: 'invalid_option',
                raffleFeePercentage: -5
            };

            const response = await request(app)
                .put('/api/admin/system-settings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Validation failed');
        });
    });

    describe('GET /api/admin/system-settings/geo-blocking', () => {
        it('should get geo-blocking settings', async () => {
            await AdminSettings.create({
                blockedCountries: ['US', 'CN'],
                geoBlockingEnabled: true
            });

            const response = await request(app)
                .get('/api/admin/system-settings/geo-blocking')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.blockedCountries).toEqual(['US', 'CN']);
            expect(response.body.data.geoBlockingEnabled).toBe(true);
        });
    });

    describe('PUT /api/admin/system-settings/geo-blocking', () => {
        it('should update geo-blocking settings', async () => {
            const updateData = {
                blockedCountries: ['US', 'CN', 'RU'],
                geoBlockingEnabled: true
            };

            const response = await request(app)
                .put('/api/admin/system-settings/geo-blocking')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.blockedCountries).toEqual(['US', 'CN', 'RU']);
            expect(response.body.data.geoBlockingEnabled).toBe(true);

            // Verify security log was created
            const securityLog = await SecurityLog.findOne({ eventType: 'geo_blocking_updated' });
            expect(securityLog).toBeTruthy();
            expect(securityLog.severity).toBe('high');
        });
    });

    describe('GET /api/admin/system-settings/kyc', () => {
        it('should get KYC settings', async () => {
            await AdminSettings.create({
                kycRequired: true,
                kycProvider: 'blockpass',
                kycThreshold: 5000
            });

            const response = await request(app)
                .get('/api/admin/system-settings/kyc')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.kycRequired).toBe(true);
            expect(response.body.data.kycProvider).toBe('blockpass');
            expect(response.body.data.kycThreshold).toBe(5000);
        });
    });

    describe('PUT /api/admin/system-settings/kyc', () => {
        it('should update KYC settings', async () => {
            const updateData = {
                kycRequired: true,
                kycProvider: 'jumio',
                kycThreshold: 10000
            };

            const response = await request(app)
                .put('/api/admin/system-settings/kyc')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.kycRequired).toBe(true);
            expect(response.body.data.kycProvider).toBe('jumio');
            expect(response.body.data.kycThreshold).toBe(10000);

            // Verify security log was created
            const securityLog = await SecurityLog.findOne({ eventType: 'kyc_settings_updated' });
            expect(securityLog).toBeTruthy();
            expect(securityLog.severity).toBe('high');
        });
    });

    describe('GET /api/admin/system-settings/metrics', () => {
        it('should get platform metrics', async () => {
            // Create some test data
            await User.create({
                username: 'testuser1',
                email: 'test1@test.com',
                walletAddress: '0x1111111111111111111111111111111111111111'
            });

            await User.create({
                username: 'testuser2',
                email: 'test2@test.com',
                walletAddress: '0x2222222222222222222222222222222222222222'
            });

            const response = await request(app)
                .get('/api/admin/system-settings/metrics')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('overview');
            expect(response.body.data).toHaveProperty('recent');
            expect(response.body.data.overview.totalUsers).toBeGreaterThan(0);
        });
    });

    describe('POST /api/admin/system-settings/upload-csv', () => {
        it('should handle CSV upload', async () => {
            const csvContent = 'email,walletAddress,status\ntest@example.com,0x123,active\ntest2@example.com,0x456,active';
            
            const response = await request(app)
                .post('/api/admin/system-settings/upload-csv')
                .set('Authorization', `Bearer ${adminToken}`)
                .attach('csvFile', Buffer.from(csvContent), 'test.csv')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.processed).toBe(2);
            expect(response.body.data.errors).toBe(0);

            // Verify security log was created
            const securityLog = await SecurityLog.findOne({ eventType: 'csv_upload' });
            expect(securityLog).toBeTruthy();
        });

        it('should handle CSV with errors', async () => {
            const csvContent = 'email,walletAddress,status\ntest@example.com,,active\n,0x456,active';
            
            const response = await request(app)
                .post('/api/admin/system-settings/upload-csv')
                .set('Authorization', `Bearer ${adminToken}`)
                .attach('csvFile', Buffer.from(csvContent), 'test.csv')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.processed).toBe(0);
            expect(response.body.data.errors).toBe(2);
            expect(response.body.data.errorDetails).toHaveLength(2);
        });

        it('should reject non-CSV files', async () => {
            const response = await request(app)
                .post('/api/admin/system-settings/upload-csv')
                .set('Authorization', `Bearer ${adminToken}`)
                .attach('csvFile', Buffer.from('not a csv'), 'test.txt')
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });
});