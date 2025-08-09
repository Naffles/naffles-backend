const { createAlchemyInstance } = require("./alchemy/alchemy");
const { AdminSettings } = require("../models/admin/adminSettings");
const { AllowableNFTCollectionsForLotteries, AllowableTokenContractsForLotteries } = require("../models/admin/fileUploadSettings/uploadableContent");
const RafflePrize = require("../models/raffle/rafflePrize");
const RaffleConstants = require("../utils/constants/RaffleConstants");

/**
 * Validates NFT ownership and collection eligibility
 * @param {Object} nftPrize - NFT prize object
 * @param {String} ownerAddress - Address of the NFT owner
 * @returns {Object} Validation result
 */
const validateNFTAsset = async (nftPrize, ownerAddress) => {
    try {
        const { contractAddress, tokenId, chainId } = nftPrize;
        
        // Check if NFT collection is allowed
        const allowedCollections = await AllowableNFTCollectionsForLotteries.find({});
        const isCollectionAllowed = allowedCollections.some(
            collection => collection.contractAddress.toLowerCase() === contractAddress.toLowerCase()
        );
        
        if (!isCollectionAllowed) {
            return {
                isValid: false,
                error: "NFT collection is not approved for raffles"
            };
        }
        
        // Verify NFT ownership using Alchemy
        const alchemy = createAlchemyInstance(chainId);
        if (!alchemy) {
            return {
                isValid: false,
                error: "Blockchain network not supported"
            };
        }
        
        try {
            const owner = await alchemy.nft.getOwnersForNft(contractAddress, tokenId);
            const isOwner = owner.owners.some(
                addr => addr.toLowerCase() === ownerAddress.toLowerCase()
            );
            
            if (!isOwner) {
                return {
                    isValid: false,
                    error: "NFT ownership verification failed"
                };
            }
            
            // Get NFT metadata
            const nftMetadata = await alchemy.nft.getNftMetadata(contractAddress, tokenId);
            
            return {
                isValid: true,
                metadata: {
                    name: nftMetadata.title,
                    description: nftMetadata.description,
                    image: nftMetadata.media?.[0]?.gateway || nftMetadata.image,
                    attributes: nftMetadata.rawMetadata?.attributes || []
                }
            };
        } catch (alchemyError) {
            console.error("Alchemy NFT validation error:", alchemyError);
            return {
                isValid: false,
                error: "Failed to verify NFT ownership on blockchain"
            };
        }
        
    } catch (error) {
        console.error("NFT validation error:", error);
        return {
            isValid: false,
            error: "NFT validation failed"
        };
    }
};

/**
 * Validates token contract and user balance
 * @param {Object} tokenPrize - Token prize object
 * @param {String} ownerAddress - Address of the token owner
 * @returns {Object} Validation result
 */
const validateTokenAsset = async (tokenPrize, ownerAddress) => {
    try {
        const { token: contractAddress, amount, chainId } = tokenPrize;
        
        // Check if token contract is allowed
        const allowedTokens = await AllowableTokenContractsForLotteries.find({});
        const allowedToken = allowedTokens.find(
            token => token.contractAddress.toLowerCase() === contractAddress.toLowerCase()
        );
        
        if (!allowedToken) {
            return {
                isValid: false,
                error: "Token contract is not approved for raffles"
            };
        }
        
        // Verify token balance using Alchemy
        const alchemy = createAlchemyInstance(chainId);
        if (!alchemy) {
            return {
                isValid: false,
                error: "Blockchain network not supported"
            };
        }
        
        try {
            const tokenBalances = await alchemy.core.getTokenBalances(ownerAddress, [contractAddress]);
            const tokenBalance = tokenBalances.tokenBalances[0];
            
            if (!tokenBalance || BigInt(tokenBalance.tokenBalance || "0") < BigInt(amount)) {
                return {
                    isValid: false,
                    error: "Insufficient token balance"
                };
            }
            
            // Get token metadata
            const tokenMetadata = await alchemy.core.getTokenMetadata(contractAddress);
            
            return {
                isValid: true,
                metadata: {
                    symbol: tokenMetadata.symbol,
                    decimals: tokenMetadata.decimals,
                    name: tokenMetadata.name
                }
            };
        } catch (alchemyError) {
            console.error("Alchemy token validation error:", alchemyError);
            return {
                isValid: false,
                error: "Failed to verify token balance on blockchain"
            };
        }
        
    } catch (error) {
        console.error("Token validation error:", error);
        return {
            isValid: false,
            error: "Token validation failed"
        };
    }
};

/**
 * Validates raffle prize asset based on lottery type
 * @param {String} raffleId - Raffle ID
 * @param {String} ownerAddress - Address of the asset owner
 * @returns {Object} Validation result
 */
const validateRafflePrizeAsset = async (raffleId, ownerAddress) => {
    try {
        const rafflePrize = await RafflePrize.findOne({ raffle: raffleId });
        if (!rafflePrize) {
            return {
                isValid: false,
                error: "Raffle prize not found"
            };
        }
        
        let validationResult;
        
        switch (rafflePrize.lotteryTypeEnum) {
            case RaffleConstants.LOTTERY_TYPE_NFT:
                validationResult = await validateNFTAsset(rafflePrize.nftPrize, ownerAddress);
                if (validationResult.isValid) {
                    rafflePrize.nftPrize.metadata = validationResult.metadata;
                    rafflePrize.nftPrize.validated = true;
                    rafflePrize.nftPrize.ownershipVerified = true;
                }
                break;
                
            case RaffleConstants.LOTTERY_TYPE_TOKEN:
                validationResult = await validateTokenAsset(rafflePrize.tokenPrize, ownerAddress);
                if (validationResult.isValid) {
                    rafflePrize.tokenPrize.symbol = validationResult.metadata.symbol;
                    rafflePrize.tokenPrize.decimals = validationResult.metadata.decimals;
                    rafflePrize.tokenPrize.validated = true;
                }
                break;
                
            case RaffleConstants.LOTTERY_TYPE_NAFFLINGS:
                // Nafflings validation is handled in the balance check
                validationResult = { isValid: true };
                break;
                
            default:
                validationResult = {
                    isValid: false,
                    error: "Unsupported lottery type"
                };
        }
        
        // Update validation status
        rafflePrize.validationStatus = validationResult.isValid ? "validated" : "failed";
        rafflePrize.validationError = validationResult.error || null;
        await rafflePrize.save();
        
        return validationResult;
        
    } catch (error) {
        console.error("Raffle prize validation error:", error);
        return {
            isValid: false,
            error: "Asset validation failed"
        };
    }
};

/**
 * Generates escrow address for NFT deposits
 * @param {String} chainId - Blockchain chain ID
 * @returns {String} Escrow wallet address
 */
const getEscrowAddress = (chainId) => {
    // Return appropriate treasury wallet address based on chain
    const escrowAddresses = {
        "1": process.env.ETHEREUM_TREASURY_ADDRESS,
        "137": process.env.POLYGON_TREASURY_ADDRESS,
        "8453": process.env.BASE_TREASURY_ADDRESS,
        // Add more chains as needed
    };
    
    return escrowAddresses[chainId] || process.env.DEFAULT_TREASURY_ADDRESS;
};

/**
 * Verifies NFT has been transferred to escrow
 * @param {Object} nftPrize - NFT prize object
 * @returns {Boolean} Whether NFT is in escrow
 */
const verifyNFTEscrow = async (nftPrize) => {
    try {
        const { contractAddress, tokenId, chainId } = nftPrize;
        const escrowAddress = getEscrowAddress(chainId);
        
        const alchemy = createAlchemyInstance(chainId);
        if (!alchemy) {
            return false;
        }
        
        const owner = await alchemy.nft.getOwnersForNft(contractAddress, tokenId);
        return owner.owners.some(
            addr => addr.toLowerCase() === escrowAddress.toLowerCase()
        );
        
    } catch (error) {
        console.error("NFT escrow verification error:", error);
        return false;
    }
};

module.exports = {
    validateNFTAsset,
    validateTokenAsset,
    validateRafflePrizeAsset,
    getEscrowAddress,
    verifyNFTEscrow
};