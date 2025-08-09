const mongoose = require('mongoose');

// Mock mongoose and models
jest.mock('mongoose', () => ({
  Types: {
    ObjectId: {
      isValid: jest.fn().mockReturnValue(true)
    }
  },
  connection: {
    readyState: 1,
    close: jest.fn()
  },
  connect: jest.fn(),
  model: jest.fn()
}));

// Mock models
jest.mock('../models/raffle/raffle', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  updateOne: jest.fn(),
  deleteMany: jest.fn(),
  aggregate: jest.fn()
}));

jest.mock('../models/raffle/rafflePrize', () => ({
  deleteMany: jest.fn()
}));

jest.mock('../models/raffle/raffleTicket', () => ({
  deleteMany: jest.fn()
}));

jest.mock('../models/user/user', () => ({
  deleteMany: jest.fn()
}));

const vrfService = require('../services/vrfService');
const Raffle = require('../models/raffle/raffle');

// Mock the VRF configuration
jest.mock('../config/vrf', () => ({
    WEB3_VRF: {
        eth: {
            Contract: jest.fn().mockImplementation(() => ({
                methods: {
                    naffleIdToChainlinkRequestId: jest.fn().mockReturnValue({
                        call: jest.fn().mockResolvedValue('0x123456789')
                    }),
                    chainlinkRequestStatus: jest.fn().mockReturnValue({
                        call: jest.fn().mockResolvedValue({
                            randomNumber: '42',
                            fulfilled: true
                        })
                    })
                }
            }))
        }
    },
    VRF_CONTRACT_ABI: [],
    VRF_CONTRACT_ADDRESS: '0x1234567890123456789012345678901234567890'
}));

// Mock the Polygon VRF configuration
jest.mock('../config/vrfPolygon', () => ({
    WEB3_POLYGON: {
        eth: {
            getGasPrice: jest.fn().mockResolvedValue('20000000000'),
            getBlockNumber: jest.fn().mockResolvedValue(12345),
            getTransactionReceipt: jest.fn().mockResolvedValue({
                blockNumber: 12345,
                blockHash: '0xabcdef',
                transactionIndex: 0,
                gasUsed: 150000,
                status: true
            }),
            getTransaction: jest.fn().mockResolvedValue({
                from: '0x123',
                to: '0x456',
                gasPrice: '20000000000'
            }),
            getBlock: jest.fn().mockResolvedValue({
                timestamp: Math.floor(Date.now() / 1000)
            })
        }
    },
    vrfWallet: {
        getWallet: jest.fn().mockReturnValue({
            address: '0x1234567890123456789012345678901234567890'
        })
    },
    getVRFContract: jest.fn().mockReturnValue({
        methods: {
            naffleIdToChainlinkRequestId: jest.fn().mockReturnValue({
                call: jest.fn().mockResolvedValue('0x123456789')
            }),
            chainlinkRequestStatus: jest.fn().mockReturnValue({
                call: jest.fn().mockResolvedValue({
                    randomNumber: '42',
                    fulfilled: true,
                    sourceChain: 'ethereum'
                })
            }),
            drawWinnerCrossChain: jest.fn().mockReturnValue({
                send: jest.fn().mockResolvedValue({
                    transactionHash: '0xpolygontxhash123'
                })
            }),
            chainlinkVRFSubscriptionId: jest.fn().mockReturnValue({
                call: jest.fn().mockResolvedValue('123')
            }),
            chainlinkVRFGasLaneKeyHash: jest.fn().mockReturnValue({
                call: jest.fn().mockResolvedValue('0xkeyhash123')
            }),
            chainlinkVRFCallbackGasLimit: jest.fn().mockReturnValue({
                call: jest.fn().mockResolvedValue('200000')
            }),
            s_vrfCoordinator: jest.fn().mockReturnValue({
                call: jest.fn().mockResolvedValue('0xcoordinator123')
            })
        }
    }),
    getLinkContract: jest.fn().mockReturnValue({
        methods: {
            balanceOf: jest.fn().mockReturnValue({
                call: jest.fn().mockResolvedValue('50000000000000000000') // 50 LINK
            }),
            decimals: jest.fn().mockReturnValue({
                call: jest.fn().mockResolvedValue('18')
            })
        }
    }),
    VRF_POLYGON_CONFIG: {
        NETWORK: 'polygon',
        CHAIN_ID: '137',
        REQUEST_CONFIRMATIONS: 3
    }
}));

// Mock the random utility
jest.mock('../utils/random', () => ({
    requestForRandomNumber: jest.fn().mockResolvedValue('0xabcdef123456789')
}));

describe('VRF Service Tests', () => {
    let testRaffle;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Set up test raffle
        testRaffle = {
            _id: 'mock-raffle-id',
            eventId: 'VRF_TEST_001',
            ticketsSold: 5,
            vrf: {
                status: 'Pending',
                transactionHash: null,
                polygonTxHash: null,
                winningTicketNumber: 0,
                requestId: null,
                failsafeUsed: false,
                sourceChain: 'ethereum'
            },
            save: jest.fn().mockResolvedValue(true)
        };
        
        // Configure Raffle mock to return our test raffle
        Raffle.findById.mockResolvedValue(testRaffle);
    });

    describe('VRF Random Number Request', () => {
        test('should request VRF randomness successfully', async () => {
            const result = await vrfService.requestVRFRandomness(testRaffle._id, 5);

            expect(result.success).toBe(true);
            expect(result.transactionHash).toBe('0xabcdef123456789');
            expect(result.requestId).toContain('VRF_TEST_001');

            // Check that raffle VRF status was updated
            const updatedRaffle = await Raffle.findById(testRaffle._id);
            expect(updatedRaffle.vrf.status).toBe('In Progress');
            expect(updatedRaffle.vrf.transactionHash).toBe('0xabcdef123456789');
        });

        test('should use failsafe when VRF request fails', async () => {
            // Mock VRF request to fail
            const { requestForRandomNumber } = require('../utils/random');
            requestForRandomNumber.mockRejectedValueOnce(new Error('VRF request failed'));

            const result = await vrfService.requestVRFRandomness(testRaffle._id, 5);

            expect(result.success).toBe(true);
            expect(result.failsafeUsed).toBe(true);
            expect(result.winningTicketNumber).toBeGreaterThan(0);
            expect(result.winningTicketNumber).toBeLessThanOrEqual(5);

            // Check that raffle was updated with failsafe result
            const updatedRaffle = await Raffle.findById(testRaffle._id);
            expect(updatedRaffle.vrf.status).toBe('Fulfilled');
            expect(updatedRaffle.vrf.failsafeUsed).toBe(true);
            expect(updatedRaffle.vrf.transactionHash).toBeNull();
        });

        test('should handle non-existent raffle', async () => {
            const fakeRaffleId = new mongoose.Types.ObjectId();

            await expect(vrfService.requestVRFRandomness(fakeRaffleId, 5))
                .rejects.toThrow('Raffle not found');
        });
    });

    describe('VRF Fulfillment Check', () => {
        test('should check VRF fulfillment successfully', async () => {
            // Set up raffle with VRF in progress
            testRaffle.vrf.status = 'In Progress';
            testRaffle.vrf.transactionHash = '0xabcdef123456789';
            await testRaffle.save();

            const result = await vrfService.checkVRFFulfillment(testRaffle._id);

            expect(result.fulfilled).toBe(true);
            expect(result.winningTicketNumber).toBe(42);
            expect(result.randomNumber).toBe('42');

            // Check that raffle was updated
            const updatedRaffle = await Raffle.findById(testRaffle._id);
            expect(updatedRaffle.vrf.status).toBe('Fulfilled');
            expect(updatedRaffle.vrf.winningTicketNumber).toBe(42);
        });

        test('should use failsafe when VRF check fails', async () => {
            // Set up raffle with VRF in progress
            testRaffle.vrf.status = 'In Progress';
            await testRaffle.save();

            // Mock VRF contract call to fail
            const { WEB3_VRF } = require('../config/vrf');
            WEB3_VRF.eth.Contract.mockImplementationOnce(() => {
                throw new Error('Contract call failed');
            });

            const result = await vrfService.checkVRFFulfillment(testRaffle._id);

            expect(result.fulfilled).toBe(true);
            expect(result.failsafeUsed).toBe(true);
            expect(result.winningTicketNumber).toBeGreaterThan(0);
        });

        test('should return unfulfilled status when VRF not ready', async () => {
            // Mock VRF to return unfulfilled
            const { WEB3_VRF } = require('../config/vrf');
            WEB3_VRF.eth.Contract.mockImplementationOnce(() => ({
                methods: {
                    naffleIdToChainlinkRequestId: jest.fn().mockReturnValue({
                        call: jest.fn().mockResolvedValue('0x123456789')
                    }),
                    chainlinkRequestStatus: jest.fn().mockReturnValue({
                        call: jest.fn().mockResolvedValue({
                            randomNumber: '0',
                            fulfilled: false
                        })
                    })
                }
            }));

            testRaffle.vrf.status = 'In Progress';
            await testRaffle.save();

            const result = await vrfService.checkVRFFulfillment(testRaffle._id);

            expect(result.fulfilled).toBe(false);
            expect(result.status).toBe('In Progress');
        });
    });

    describe('Failsafe Randomness', () => {
        test('should generate failsafe random number', async () => {
            const result = await vrfService.useFailsafeRandomness(testRaffle._id, 5);

            expect(result.success).toBe(true);
            expect(result.fulfilled).toBe(true);
            expect(result.failsafeUsed).toBe(true);
            expect(result.winningTicketNumber).toBeGreaterThan(0);
            expect(result.winningTicketNumber).toBeLessThanOrEqual(5);

            // Check that raffle was updated
            const updatedRaffle = await Raffle.findById(testRaffle._id);
            expect(updatedRaffle.vrf.status).toBe('Fulfilled');
            expect(updatedRaffle.vrf.failsafeUsed).toBe(true);
            expect(updatedRaffle.vrf.transactionHash).toBeNull();
        });

        test('should handle invalid range', async () => {
            await expect(vrfService.useFailsafeRandomness(testRaffle._id, 0))
                .rejects.toThrow();
        });
    });

    describe('Verifiable Results', () => {
        test('should get verifiable result for VRF raffle', async () => {
            // Set up completed VRF raffle
            testRaffle.vrf.status = 'Fulfilled';
            testRaffle.vrf.winningTicketNumber = 3;
            testRaffle.vrf.transactionHash = '0xabcdef123456789';
            testRaffle.vrf.failsafeUsed = false;
            await testRaffle.save();

            const result = await vrfService.getVerifiableResult(testRaffle._id);

            expect(result.raffleId).toBe(testRaffle._id.toString());
            expect(result.eventId).toBe('VRF_TEST_001');
            expect(result.winningTicketNumber).toBe(3);
            expect(result.vrfStatus).toBe('Fulfilled');
            expect(result.failsafeUsed).toBe(false);
            expect(result.verifiable).toBe(true);
            expect(result.chainlinkRequestId).toBe('0x123456789');
            expect(result.onChainRandomNumber).toBe('42');
        });

        test('should get verifiable result for failsafe raffle', async () => {
            // Set up completed failsafe raffle
            testRaffle.vrf.status = 'Fulfilled';
            testRaffle.vrf.winningTicketNumber = 2;
            testRaffle.vrf.failsafeUsed = true;
            testRaffle.vrf.transactionHash = null;
            await testRaffle.save();

            const result = await vrfService.getVerifiableResult(testRaffle._id);

            expect(result.raffleId).toBe(testRaffle._id.toString());
            expect(result.winningTicketNumber).toBe(2);
            expect(result.failsafeUsed).toBe(true);
            expect(result.verifiable).toBe(false);
            expect(result.transactionHash).toBeNull();
        });
    });

    describe('VRF Failure Handling', () => {
        test('should handle VRF failure and use failsafe', async () => {
            // Set up raffle with VRF request ID
            testRaffle.vrf.requestId = 'VRF_TEST_001_123456789';
            await testRaffle.save();

            const result = await vrfService.handleVRFFailure('VRF_TEST_001_123456789');

            expect(result.success).toBe(true);
            expect(result.failsafeUsed).toBe(true);
            expect(result.winningTicketNumber).toBeGreaterThan(0);

            // Check that raffle status was updated
            const updatedRaffle = await Raffle.findById(testRaffle._id);
            expect(updatedRaffle.vrf.status).toBe('Fulfilled');
            expect(updatedRaffle.vrf.failsafeUsed).toBe(true);
        });

        test('should handle non-existent request ID', async () => {
            await expect(vrfService.handleVRFFailure('NON_EXISTENT_REQUEST'))
                .rejects.toThrow('Raffle not found for request ID');
        });
    });

    describe('Cross-Chain VRF Integration', () => {
        test('should request cross-chain VRF randomness successfully', async () => {
            const result = await vrfService.requestCrossChainVRFRandomness(
                testRaffle._id, 
                5, 
                { sourceChain: 'ethereum' }
            );

            expect(result.success).toBe(true);
            expect(result.polygonTxHash).toBe('0xpolygontxhash123');
            expect(result.sourceChain).toBe('ethereum');

            // Check that raffle VRF status was updated
            const updatedRaffle = await Raffle.findById(testRaffle._id);
            expect(updatedRaffle.vrf.status).toBe('In Progress');
            expect(updatedRaffle.vrf.polygonTxHash).toBe('0xpolygontxhash123');
            expect(updatedRaffle.vrf.sourceChain).toBe('ethereum');
        });

        test('should check Polygon VRF fulfillment successfully', async () => {
            // Set up raffle with VRF in progress
            testRaffle.vrf.status = 'In Progress';
            testRaffle.vrf.polygonTxHash = '0xpolygontxhash123';
            testRaffle.vrf.sourceChain = 'ethereum';
            await testRaffle.save();

            const result = await vrfService.checkPolygonVRFFulfillment(testRaffle._id);

            expect(result.fulfilled).toBe(true);
            expect(result.winningTicketNumber).toBe(42);
            expect(result.sourceChain).toBe('ethereum');
            expect(result.polygonTxHash).toBe('0xpolygontxhash123');
            expect(result.verifiable).toBe(true);

            // Check that raffle was updated
            const updatedRaffle = await Raffle.findById(testRaffle._id);
            expect(updatedRaffle.vrf.status).toBe('Fulfilled');
            expect(updatedRaffle.vrf.winningTicketNumber).toBe(42);
        });

        test('should handle cross-chain VRF failure with failsafe', async () => {
            // Mock VRF contract to fail
            const { getVRFContract } = require('../config/vrfPolygon');
            getVRFContract.mockReturnValueOnce({
                methods: {
                    naffleIdToChainlinkRequestId: jest.fn().mockReturnValue({
                        call: jest.fn().mockRejectedValue(new Error('Contract call failed'))
                    })
                }
            });

            const result = await vrfService.requestCrossChainVRFRandomness(testRaffle._id, 5);

            expect(result.success).toBe(true);
            expect(result.failsafeUsed).toBe(true);
            expect(result.winningTicketNumber).toBeGreaterThan(0);
            expect(result.winningTicketNumber).toBeLessThanOrEqual(5);

            // Check that raffle was updated with failsafe result
            const updatedRaffle = await Raffle.findById(testRaffle._id);
            expect(updatedRaffle.vrf.status).toBe('Fulfilled');
            expect(updatedRaffle.vrf.failsafeUsed).toBe(true);
            expect(updatedRaffle.vrf.transactionHash).toBeNull();
        });
    });

    describe('VRF Configuration Management', () => {
        test('should get VRF configuration successfully', async () => {
            const config = await vrfService.getVRFConfiguration();

            expect(config.isConfigured).toBe(true);
            expect(config.network).toBe('polygon');
            expect(config.chainId).toBe('137');
            expect(config.subscriptionId).toBe('123');
            expect(config.keyHash).toBe('0xkeyhash123');
            expect(config.callbackGasLimit).toBe(200000);
            expect(config.coordinatorAddress).toBe('0xcoordinator123');
            expect(config.linkBalance).toBe('50.0000');
        });

        test('should get LINK balance successfully', async () => {
            const balance = await vrfService.getLinkBalance();

            expect(balance.balance).toBe('50000000000000000000');
            expect(balance.balanceFormatted).toBe('50.0000');
            expect(balance.decimals).toBe(18);
            expect(balance.walletAddress).toBe('0x1234567890123456789012345678901234567890');
        });

        test('should monitor LINK balance and detect low balance', async () => {
            // Mock low balance
            const { getLinkContract } = require('../config/vrfPolygon');
            getLinkContract.mockReturnValueOnce({
                methods: {
                    balanceOf: jest.fn().mockReturnValue({
                        call: jest.fn().mockResolvedValue('5000000000000000000') // 5 LINK
                    }),
                    decimals: jest.fn().mockReturnValue({
                        call: jest.fn().mockResolvedValue('18')
                    })
                }
            });

            const status = await vrfService.monitorLinkBalance(10);

            expect(status.currentBalance).toBe(5);
            expect(status.threshold).toBe(10);
            expect(status.isLow).toBe(true);
        });
    });

    describe('VRF Status Dashboard', () => {
        test('should get VRF status dashboard', async () => {
            // Create some test raffles with different VRF statuses
            const fulfilledRaffle = new Raffle({
                rafflePrize: testRafflePrize._id,
                eventId: 'FULFILLED_TEST_001',
                lotteryTypeEnum: 'TOKEN',
                raffleTypeEnum: 'STANDARD',
                coinType: 'usdc',
                ticketsAvailable: 95,
                ticketsSold: 10,
                perTicketPrice: '1000000',
                raffleDurationDays: 7,
                createdBy: testUser._id
            });
            fulfilledRaffle.vrf.status = 'Fulfilled';
            fulfilledRaffle.vrf.winningTicketNumber = 5;
            await fulfilledRaffle.save();

            const failedRaffle = new Raffle({
                rafflePrize: testRafflePrize._id,
                eventId: 'FAILED_TEST_001',
                lotteryTypeEnum: 'TOKEN',
                raffleTypeEnum: 'STANDARD',
                coinType: 'usdc',
                ticketsAvailable: 95,
                ticketsSold: 8,
                perTicketPrice: '1000000',
                raffleDurationDays: 7,
                createdBy: testUser._id
            });
            failedRaffle.vrf.status = 'Failed';
            failedRaffle.vrf.failsafeUsed = true;
            await failedRaffle.save();

            const dashboard = await vrfService.getVRFStatusDashboard();

            expect(dashboard.configuration.isConfigured).toBe(true);
            expect(dashboard.linkBalance.balanceFormatted).toBe('50.0000');
            expect(dashboard.statistics.totalRequests).toBeGreaterThan(0);
            expect(dashboard.statistics.fulfilledRequests).toBeGreaterThan(0);
            expect(dashboard.statistics.failsafeUsed).toBeGreaterThan(0);
            expect(dashboard.recentRequests).toBeInstanceOf(Array);
            expect(dashboard.lastUpdated).toBeInstanceOf(Date);
        });
    });

    describe('VRF Health Validation', () => {
        test('should validate VRF health successfully', async () => {
            const health = await vrfService.validateVRFHealth();

            expect(health.isHealthy).toBe(true);
            expect(health.checks.polygonConnection).toBe(true);
            expect(health.checks.contractAccessible).toBe(true);
            expect(health.checks.walletConfigured).toBe(true);
            expect(health.checks.linkBalance).toBe(true);
            expect(health.checks.subscriptionActive).toBe(true);
            expect(health.issues).toHaveLength(0);
        });

        test('should detect unhealthy VRF system', async () => {
            // Mock connection failure
            const { WEB3_POLYGON } = require('../config/vrfPolygon');
            WEB3_POLYGON.eth.getBlockNumber.mockRejectedValueOnce(new Error('Connection failed'));

            const health = await vrfService.validateVRFHealth();

            expect(health.isHealthy).toBe(false);
            expect(health.checks.polygonConnection).toBe(false);
            expect(health.issues).toContain('Cannot connect to Polygon network');
        });
    });

    describe('VRF Verification', () => {
        test('should verify VRF result on-chain', async () => {
            const vrfVerification = require('../utils/vrfVerification');
            
            // Set up raffle with VRF result
            testRaffle.vrf.status = 'Fulfilled';
            testRaffle.vrf.winningTicketNumber = 42;
            testRaffle.vrf.polygonTxHash = '0xpolygontxhash123';
            testRaffle.vrf.failsafeUsed = false;
            await testRaffle.save();

            const verification = await vrfVerification.verifyVRFResult(testRaffle._id);

            expect(verification.verified).toBe(true);
            expect(verification.onChainRandomNumber).toBe(42);
            expect(verification.storedWinningNumber).toBe(42);
            expect(verification.polygonTxHash).toBe('0xpolygontxhash123');
            expect(verification.failsafeUsed).toBe(false);
            expect(verification.verificationUrl).toContain('polygonscan.com');
        });

        test('should handle failsafe verification correctly', async () => {
            const vrfVerification = require('../utils/vrfVerification');
            
            // Set up raffle with failsafe result
            testRaffle.vrf.status = 'Fulfilled';
            testRaffle.vrf.winningTicketNumber = 3;
            testRaffle.vrf.failsafeUsed = true;
            testRaffle.vrf.transactionHash = null;
            await testRaffle.save();

            const verification = await vrfVerification.verifyVRFResult(testRaffle._id);

            expect(verification.verified).toBe(false);
            expect(verification.reason).toContain('Failsafe randomness used');
            expect(verification.failsafeUsed).toBe(true);
            expect(verification.winningTicketNumber).toBe(3);
        });
    });});
