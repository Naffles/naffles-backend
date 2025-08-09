const mongoose = require('mongoose');
const RafflePrize = require('../models/raffle/rafflePrize');
const Raffle = require('../models/raffle/raffle');
const { AllowableNFTCollectionsForLotteries, AllowableTokenContractsForLotteries } = require('../models/admin/fileUploadSettings/uploadableContent');
const assetValidationService = require('../services/assetValidationService');

// Mock Alchemy service
jest.mock('../services/alchemy/alchemy', () => ({
    createAlchemyInstance: jest.fn().mockReturnValue({
        nft: {
            getOwnersForNft: jest.fn(),
            getNftMetadata: jest.fn()
        },
        core: {
            getTokenBalances: jest.fn(),
            getTokenMetadata: jest.fn()
        }
    })
}));

describe('Asset Validation Service Tests', () => {
    let testRaffle;
    let testRafflePrize;
    let mockAlchemy;

    beforeAll(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/naffles_test');
        }
    });

    beforeEach(async () => {
        // Clean up test data
        await Raffle.deleteMany({});
        await RafflePrize.deleteMany({});
        await AllowableNFTCollectionsForLotteries.deleteMany({});
        await AllowableTokenContractsForLotteries.deleteMany({});

        // Set up mock Alchemy instance
        const { createAlchemyInstance } = require('../services/alchemy/alchemy');
        mockAlchemy = {
            nft: {
                getOwnersForNft: jest.fn(),
                getNftMetadata: jest.fn()
            },
            core: {
                getTokenBalances: jest.fn(),
                getTokenMetadata: jest.fn()
            }
        };
        createAlchemyInstance.mockReturnValue(mockAlchemy);

        // Create test raffle
        testRaffle = new Raffle({
            eventId: 'ASSET_TEST_001',
            lotteryTypeEnum: 'NFT',
            raffleTypeEnum: 'STANDARD',
            coinType: 'eth',
            ticketsAvailable: 100,
            perTicketPrice: '10000000000000000',
            raffleDurationDays: 7,
            createdBy: new mongoose.Types.ObjectId()
        });
        await testRaffle.save();
    });

    afterAll(async () => {
        await mongoose.connection.close();
    });

    describe('NFT Asset Validation', () => {
        beforeEach(async () => {
            // Create allowed NFT collection
            const allowedCollection = new AllowableNFTCollectionsForLotteries({
                name: 'Test Collection',
                contractAddress: '0x1234567890123456789012345678901234567890'
            });
            await allowedCollection.save();
        });

        test('should validate NFT asset successfully', async () => {
            const nftPrize = {
                contractAddress: '0x1234567890123456789012345678901234567890',
                tokenId: '1',
                chainId: '1'
            };
            const ownerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

            // Mock Alchemy responses
            mockAlchemy.nft.getOwnersForNft.mockResolvedValue({
                owners: [ownerAddress]
            });
            mockAlchemy.nft.getNftMetadata.mockResolvedValue({
                title: 'Test NFT',
                description: 'A test NFT',
                image: 'https://example.com/image.png',
                rawMetadata: {
                    attributes: [
                        { trait_type: 'Color', value: 'Blue' }
                    ]
                }
            });

            const result = await assetValidationService.validateNFTAsset(nftPrize, ownerAddress);

            expect(result.isValid).toBe(true);
            expect(result.metadata.name).toBe('Test NFT');
            expect(result.metadata.description).toBe('A test NFT');
            expect(result.metadata.image).toBe('https://example.com/image.png');
            expect(result.metadata.attributes).toHaveLength(1);
        });

        test('should fail validation for non-allowed NFT collection', async () => {
            const nftPrize = {
                contractAddress: '0x9999999999999999999999999999999999999999', // Not in allowed list
                tokenId: '1',
                chainId: '1'
            };
            const ownerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

            const result = await assetValidationService.validateNFTAsset(nftPrize, ownerAddress);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe('NFT collection is not approved for raffles');
        });

        test('should fail validation for wrong owner', async () => {
            const nftPrize = {
                contractAddress: '0x1234567890123456789012345678901234567890',
                tokenId: '1',
                chainId: '1'
            };
            const ownerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
            const wrongOwner = '0x9999999999999999999999999999999999999999';

            // Mock Alchemy to return different owner
            mockAlchemy.nft.getOwnersForNft.mockResolvedValue({
                owners: [wrongOwner]
            });

            const result = await assetValidationService.validateNFTAsset(nftPrize, ownerAddress);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe('NFT ownership verification failed');
        });

        test('should handle Alchemy API errors', async () => {
            const nftPrize = {
                contractAddress: '0x1234567890123456789012345678901234567890',
                tokenId: '1',
                chainId: '1'
            };
            const ownerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

            // Mock Alchemy to throw error
            mockAlchemy.nft.getOwnersForNft.mockRejectedValue(new Error('API Error'));

            const result = await assetValidationService.validateNFTAsset(nftPrize, ownerAddress);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Failed to verify NFT ownership on blockchain');
        });

        test('should handle unsupported blockchain network', async () => {
            const { createAlchemyInstance } = require('../services/alchemy/alchemy');
            createAlchemyInstance.mockReturnValue(null); // Unsupported network

            const nftPrize = {
                contractAddress: '0x1234567890123456789012345678901234567890',
                tokenId: '1',
                chainId: '999' // Unsupported chain
            };
            const ownerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

            const result = await assetValidationService.validateNFTAsset(nftPrize, ownerAddress);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Blockchain network not supported');
        });
    });

    describe('Token Asset Validation', () => {
        beforeEach(async () => {
            // Create allowed token contract
            const allowedToken = new AllowableTokenContractsForLotteries({
                name: 'Test Token',
                contractAddress: '0xa0b86a33e6776e681c6c7b6c6c7b6c6c7b6c6c7b',
                ticker: 'TEST'
            });
            await allowedToken.save();
        });

        test('should validate token asset successfully', async () => {
            const tokenPrize = {
                token: '0xa0b86a33e6776e681c6c7b6c6c7b6c6c7b6c6c7b',
                amount: '1000000000000000000', // 1 token
                chainId: '1'
            };
            const ownerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

            // Mock Alchemy responses
            mockAlchemy.core.getTokenBalances.mockResolvedValue({
                tokenBalances: [{
                    tokenBalance: '2000000000000000000' // 2 tokens (sufficient)
                }]
            });
            mockAlchemy.core.getTokenMetadata.mockResolvedValue({
                symbol: 'TEST',
                decimals: 18,
                name: 'Test Token'
            });

            const result = await assetValidationService.validateTokenAsset(tokenPrize, ownerAddress);

            expect(result.isValid).toBe(true);
            expect(result.metadata.symbol).toBe('TEST');
            expect(result.metadata.decimals).toBe(18);
            expect(result.metadata.name).toBe('Test Token');
        });

        test('should fail validation for non-allowed token contract', async () => {
            const tokenPrize = {
                token: '0x9999999999999999999999999999999999999999', // Not in allowed list
                amount: '1000000000000000000',
                chainId: '1'
            };
            const ownerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

            const result = await assetValidationService.validateTokenAsset(tokenPrize, ownerAddress);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Token contract is not approved for raffles');
        });

        test('should fail validation for insufficient balance', async () => {
            const tokenPrize = {
                token: '0xa0b86a33e6776e681c6c7b6c6c7b6c6c7b6c6c7b',
                amount: '1000000000000000000', // 1 token
                chainId: '1'
            };
            const ownerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

            // Mock Alchemy to return insufficient balance
            mockAlchemy.core.getTokenBalances.mockResolvedValue({
                tokenBalances: [{
                    tokenBalance: '500000000000000000' // 0.5 tokens (insufficient)
                }]
            });

            const result = await assetValidationService.validateTokenAsset(tokenPrize, ownerAddress);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Insufficient token balance');
        });
    });

    describe('Raffle Prize Asset Validation', () => {
        test('should validate NFT raffle prize', async () => {
            // Create NFT raffle prize
            testRafflePrize = new RafflePrize({
                raffle: testRaffle._id,
                lotteryTypeEnum: 'NFT',
                nftPrize: {
                    contractAddress: '0x1234567890123456789012345678901234567890',
                    tokenId: '1',
                    chainId: '1'
                }
            });
            await testRafflePrize.save();

            // Create allowed collection
            const allowedCollection = new AllowableNFTCollectionsForLotteries({
                name: 'Test Collection',
                contractAddress: '0x1234567890123456789012345678901234567890'
            });
            await allowedCollection.save();

            const ownerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

            // Mock successful validation
            mockAlchemy.nft.getOwnersForNft.mockResolvedValue({
                owners: [ownerAddress]
            });
            mockAlchemy.nft.getNftMetadata.mockResolvedValue({
                title: 'Test NFT',
                description: 'A test NFT',
                image: 'https://example.com/image.png',
                rawMetadata: { attributes: [] }
            });

            const result = await assetValidationService.validateRafflePrizeAsset(testRaffle._id, ownerAddress);

            expect(result.isValid).toBe(true);

            // Check that raffle prize was updated
            const updatedPrize = await RafflePrize.findById(testRafflePrize._id);
            expect(updatedPrize.validationStatus).toBe('validated');
            expect(updatedPrize.nftPrize.validated).toBe(true);
            expect(updatedPrize.nftPrize.ownershipVerified).toBe(true);
        });

        test('should validate token raffle prize', async () => {
            // Update raffle to be token type
            testRaffle.lotteryTypeEnum = 'TOKEN';
            await testRaffle.save();

            // Create token raffle prize
            testRafflePrize = new RafflePrize({
                raffle: testRaffle._id,
                lotteryTypeEnum: 'TOKEN',
                tokenPrize: {
                    token: '0xa0b86a33e6776e681c6c7b6c6c7b6c6c7b6c6c7b',
                    amount: '1000000000000000000',
                    chainId: '1'
                }
            });
            await testRafflePrize.save();

            // Create allowed token
            const allowedToken = new AllowableTokenContractsForLotteries({
                name: 'Test Token',
                contractAddress: '0xa0b86a33e6776e681c6c7b6c6c7b6c6c7b6c6c7b'
            });
            await allowedToken.save();

            const ownerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

            // Mock successful validation
            mockAlchemy.core.getTokenBalances.mockResolvedValue({
                tokenBalances: [{
                    tokenBalance: '2000000000000000000'
                }]
            });
            mockAlchemy.core.getTokenMetadata.mockResolvedValue({
                symbol: 'TEST',
                decimals: 18,
                name: 'Test Token'
            });

            const result = await assetValidationService.validateRafflePrizeAsset(testRaffle._id, ownerAddress);

            expect(result.isValid).toBe(true);

            // Check that raffle prize was updated
            const updatedPrize = await RafflePrize.findById(testRafflePrize._id);
            expect(updatedPrize.validationStatus).toBe('validated');
            expect(updatedPrize.tokenPrize.validated).toBe(true);
            expect(updatedPrize.tokenPrize.symbol).toBe('TEST');
            expect(updatedPrize.tokenPrize.decimals).toBe(18);
        });

        test('should handle non-existent raffle prize', async () => {
            const fakeRaffleId = new mongoose.Types.ObjectId();
            const ownerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

            const result = await assetValidationService.validateRafflePrizeAsset(fakeRaffleId, ownerAddress);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Raffle prize not found');
        });
    });

    describe('Escrow Management', () => {
        test('should get correct escrow address for different chains', () => {
            // Mock environment variables
            process.env.ETHEREUM_TREASURY_ADDRESS = '0xETH_TREASURY';
            process.env.POLYGON_TREASURY_ADDRESS = '0xPOLYGON_TREASURY';
            process.env.BASE_TREASURY_ADDRESS = '0xBASE_TREASURY';
            process.env.DEFAULT_TREASURY_ADDRESS = '0xDEFAULT_TREASURY';

            expect(assetValidationService.getEscrowAddress('1')).toBe('0xETH_TREASURY');
            expect(assetValidationService.getEscrowAddress('137')).toBe('0xPOLYGON_TREASURY');
            expect(assetValidationService.getEscrowAddress('8453')).toBe('0xBASE_TREASURY');
            expect(assetValidationService.getEscrowAddress('999')).toBe('0xDEFAULT_TREASURY');
        });

        test('should verify NFT escrow successfully', async () => {
            const nftPrize = {
                contractAddress: '0x1234567890123456789012345678901234567890',
                tokenId: '1',
                chainId: '1'
            };

            process.env.ETHEREUM_TREASURY_ADDRESS = '0xETH_TREASURY';

            // Mock Alchemy to return treasury as owner
            mockAlchemy.nft.getOwnersForNft.mockResolvedValue({
                owners: ['0xETH_TREASURY']
            });

            const result = await assetValidationService.verifyNFTEscrow(nftPrize);

            expect(result).toBe(true);
        });

        test('should fail NFT escrow verification when not in escrow', async () => {
            const nftPrize = {
                contractAddress: '0x1234567890123456789012345678901234567890',
                tokenId: '1',
                chainId: '1'
            };

            process.env.ETHEREUM_TREASURY_ADDRESS = '0xETH_TREASURY';

            // Mock Alchemy to return different owner
            mockAlchemy.nft.getOwnersForNft.mockResolvedValue({
                owners: ['0xSOME_OTHER_ADDRESS']
            });

            const result = await assetValidationService.verifyNFTEscrow(nftPrize);

            expect(result).toBe(false);
        });
    });
});