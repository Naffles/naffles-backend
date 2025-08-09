const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const Raffle = require('../models/raffle/raffle');
const RafflePrize = require('../models/raffle/rafflePrize');
const User = require('../models/user/user');
const WalletBalance = require('../models/user/walletBalance');
const RaffleTicket = require('../models/raffle/raffleTicket');
const { generateJWT } = require('../utils/jwt');

describe('Raffle System Tests', () => {
    let testUser;
    let authToken;
    let testRaffle;
    let testRafflePrize;

    beforeAll(async () => {
        // Connect to test database
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/naffles_test');
        }
    });

    beforeEach(async () => {
        // Clean up test data
        await Raffle.deleteMany({});
        await RafflePrize.deleteMany({});
        await User.deleteMany({});
        await WalletBalance.deleteMany({});
        await RaffleTicket.deleteMany({});

        // Create test user
        testUser = new User({
            username: 'testuser',
            email: 'test@example.com',
            temporaryPoints: '1000000000000000000', // 1 token worth
            role: 'user'
        });
        await testUser.save();

        // Create wallet balance for test user
        const walletBalance = new WalletBalance({
            userRef: testUser._id,
            balances: new Map([
                ['eth', '1000000000000000000'], // 1 ETH
                ['usdc', '1000000000'] // 1000 USDC
            ])
        });
        await walletBalance.save();

        // Generate auth token
        authToken = generateJWT(testUser._id);
    });

    afterAll(async () => {
        await mongoose.connection.close();
    });

    describe('Raffle Creation', () => {
        test('should create a token raffle successfully', async () => {
            const raffleData = {
                lotteryTypeEnum: 'TOKEN',
                raffleTypeEnum: 'STANDARD',
                coinType: 'usdc',
                ticketsAvailable: 100,
                perTicketPrice: '1000000', // 1 USDC
                raffleDurationDays: 7,
                rafflePrize: {
                    token: 'usdc',
                    amount: '100000000', // 100 USDC
                    chainId: '1'
                }
            };

            const response = await request(app)
                .post('/raffle')
                .set('Authorization', `Bearer ${authToken}`)
                .send(raffleData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.lotteryTypeEnum).toBe('TOKEN');
            expect(response.body.data.raffleTypeEnum).toBe('STANDARD');
        });

        test('should create an NFT raffle successfully', async () => {
            const raffleData = {
                lotteryTypeEnum: 'NFT',
                raffleTypeEnum: 'STANDARD',
                coinType: 'eth',
                ticketsAvailable: 50,
                perTicketPrice: '10000000000000000', // 0.01 ETH
                raffleDurationDays: 3,
                rafflePrize: {
                    contractAddress: '0x1234567890123456789012345678901234567890',
                    tokenId: '1',
                    chainId: '1',
                    collection: 'Test Collection'
                }
            };

            const response = await request(app)
                .post('/raffle')
                .set('Authorization', `Bearer ${authToken}`)
                .send(raffleData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.lotteryTypeEnum).toBe('NFT');
        });

        test('should create an unlimited raffle successfully', async () => {
            const raffleData = {
                lotteryTypeEnum: 'TOKEN',
                raffleTypeEnum: 'UNLIMITED',
                coinType: 'usdc',
                perTicketPrice: '1000000', // 1 USDC
                raffleDurationDays: 7,
                reservePrice: '50000000', // 50 USDC reserve
                rafflePrize: {
                    token: 'usdc',
                    amount: '100000000', // 100 USDC
                    chainId: '1'
                }
            };

            const response = await request(app)
                .post('/raffle')
                .set('Authorization', `Bearer ${authToken}`)
                .send(raffleData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.raffleTypeEnum).toBe('UNLIMITED');
        });

        test('should fail to create raffle with insufficient balance', async () => {
            const raffleData = {
                lotteryTypeEnum: 'TOKEN',
                raffleTypeEnum: 'STANDARD',
                coinType: 'usdc',
                ticketsAvailable: 100,
                perTicketPrice: '1000000',
                raffleDurationDays: 7,
                rafflePrize: {
                    token: 'usdc',
                    amount: '2000000000', // 2000 USDC (more than user has)
                    chainId: '1'
                }
            };

            const response = await request(app)
                .post('/raffle')
                .set('Authorization', `Bearer ${authToken}`)
                .send(raffleData)
                .expect(400);

            expect(response.body.message).toContain('not enough balance');
        });
    });

    describe('Ticket Purchasing', () => {
        beforeEach(async () => {
            // Create a test raffle
            testRafflePrize = new RafflePrize({
                lotteryTypeEnum: 'TOKEN',
                tokenPrize: {
                    token: 'usdc',
                    amount: '100000000',
                    chainId: '1'
                }
            });
            await testRafflePrize.save();

            testRaffle = new Raffle({
                rafflePrize: testRafflePrize._id,
                eventId: 'TEST001',
                lotteryTypeEnum: 'TOKEN',
                raffleTypeEnum: 'STANDARD',
                coinType: 'usdc',
                ticketsAvailable: 100,
                perTicketPrice: '1000000',
                raffleDurationDays: 7,
                createdBy: testUser._id
            });
            await testRaffle.save();

            testRafflePrize.raffle = testRaffle._id;
            await testRafflePrize.save();
        });

        test('should purchase raffle tickets successfully', async () => {
            const purchaseData = {
                quantity: 5
            };

            const response = await request(app)
                .post(`/raffle/${testRaffle._id}/ticket-purchase`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(purchaseData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.purchasedTicketsCount).toBe(5);
            expect(response.body.data.total).toBe(5);
        });

        test('should fail to purchase more tickets than available', async () => {
            const purchaseData = {
                quantity: 150 // More than available
            };

            const response = await request(app)
                .post(`/raffle/${testRaffle._id}/ticket-purchase`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(purchaseData)
                .expect(500);

            expect(response.body.message).toContain('tickets left');
        });

        test('should fail to purchase tickets with insufficient balance', async () => {
            // Update user balance to be insufficient
            await WalletBalance.findOneAndUpdate(
                { userRef: testUser._id },
                { $set: { 'balances.usdc': '1000000' } } // Only 1 USDC
            );

            const purchaseData = {
                quantity: 5 // Would cost 5 USDC
            };

            const response = await request(app)
                .post(`/raffle/${testRaffle._id}/ticket-purchase`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(purchaseData)
                .expect(400);

            expect(response.body.message).toContain('not enough balance');
        });
    });

    describe('Raffle Drawing', () => {
        beforeEach(async () => {
            // Create a test raffle with tickets
            testRafflePrize = new RafflePrize({
                lotteryTypeEnum: 'TOKEN',
                tokenPrize: {
                    token: 'usdc',
                    amount: '100000000',
                    chainId: '1'
                }
            });
            await testRafflePrize.save();

            testRaffle = new Raffle({
                rafflePrize: testRafflePrize._id,
                eventId: 'TEST002',
                lotteryTypeEnum: 'TOKEN',
                raffleTypeEnum: 'STANDARD',
                coinType: 'usdc',
                ticketsAvailable: 95, // 5 tickets sold
                ticketsSold: 5,
                perTicketPrice: '1000000',
                raffleDurationDays: 7,
                createdBy: testUser._id
            });
            await testRaffle.save();

            // Create some tickets
            for (let i = 1; i <= 5; i++) {
                const ticket = new RaffleTicket({
                    purchasedBy: testUser._id,
                    raffle: testRaffle._id,
                    naffleTicketId: `TICKET${i}`,
                    ticketNumber: i
                });
                await ticket.save();
            }
        });

        test('should draw raffle winner successfully', async () => {
            const response = await request(app)
                .post(`/raffle/${testRaffle._id}/draw`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('requested for raffle draw');
        });

        test('should fail to draw winner if not raffle creator', async () => {
            // Create another user
            const anotherUser = new User({
                username: 'anotheruser',
                email: 'another@example.com',
                role: 'user'
            });
            await anotherUser.save();

            const anotherToken = generateJWT(anotherUser._id);

            const response = await request(app)
                .post(`/raffle/${testRaffle._id}/draw`)
                .set('Authorization', `Bearer ${anotherToken}`)
                .expect(401);

            expect(response.body.message).toContain('not allowed to draw');
        });
    });

    describe('Raffle Cancellation', () => {
        beforeEach(async () => {
            testRafflePrize = new RafflePrize({
                lotteryTypeEnum: 'TOKEN',
                tokenPrize: {
                    token: 'usdc',
                    amount: '100000000',
                    chainId: '1'
                }
            });
            await testRafflePrize.save();

            testRaffle = new Raffle({
                rafflePrize: testRafflePrize._id,
                eventId: 'TEST003',
                lotteryTypeEnum: 'TOKEN',
                raffleTypeEnum: 'UNLIMITED', // Can be cancelled
                coinType: 'usdc',
                perTicketPrice: '1000000',
                raffleDurationDays: 7,
                createdBy: testUser._id
            });
            await testRaffle.save();
        });

        test('should cancel and refund raffle successfully', async () => {
            // Set raffle end date to past so it can be cancelled
            testRaffle.raffleEndDate = new Date(Date.now() - 1000);
            await testRaffle.save();

            const response = await request(app)
                .post(`/raffle/${testRaffle._id}/cancel-and-refund`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('cancelled and refunded');
        });

        test('should fail to cancel unconditional raffle', async () => {
            testRaffle.raffleTypeEnum = 'UNCONDITIONAL';
            await testRaffle.save();

            const response = await request(app)
                .post(`/raffle/${testRaffle._id}/cancel-and-refund`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(400);

            expect(response.body.message).toContain('cannot be cancelled');
        });
    });

    describe('Raffle Browsing', () => {
        beforeEach(async () => {
            // Create multiple test raffles
            for (let i = 1; i <= 3; i++) {
                const rafflePrize = new RafflePrize({
                    lotteryTypeEnum: 'TOKEN',
                    tokenPrize: {
                        token: 'usdc',
                        amount: '100000000',
                        chainId: '1'
                    }
                });
                await rafflePrize.save();

                const raffle = new Raffle({
                    rafflePrize: rafflePrize._id,
                    eventId: `TEST00${i}`,
                    lotteryTypeEnum: 'TOKEN',
                    raffleTypeEnum: 'STANDARD',
                    coinType: 'usdc',
                    ticketsAvailable: 100,
                    perTicketPrice: '1000000',
                    raffleDurationDays: 7,
                    createdBy: testUser._id
                });
                await raffle.save();

                rafflePrize.raffle = raffle._id;
                await rafflePrize.save();
            }
        });

        test('should fetch active raffles successfully', async () => {
            const response = await request(app)
                .get('/raffle?isActive=true')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.raffles).toHaveLength(3);
        });

        test('should filter raffles by lottery type', async () => {
            const response = await request(app)
                .get('/raffle?lotteryTypes=TOKEN')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.raffles.every(r => r.lotteryTypeEnum === 'TOKEN')).toBe(true);
        });

        test('should get raffle details successfully', async () => {
            const raffle = await Raffle.findOne({});
            
            const response = await request(app)
                .get(`/raffle/${raffle._id}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data._id).toBe(raffle._id.toString());
        });
    });
});