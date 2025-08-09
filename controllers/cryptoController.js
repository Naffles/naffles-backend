const { getAsync, setAsync } = require("../config/redisClient");
const { AllowableTokenContractsForLotteries } = require("../models/admin/fileUploadSettings/uploadableContent");
const { createAlchemyInstance } = require("../services/alchemy/alchemy");
const { getAllSupportedTokenDecimalMultiplierAsObject } = require("../utils/helpers");
const sendResponse = require("../utils/responseHandler");
const { Connection, LAMPORTS_PER_SOL, PublicKey, } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID, getAccount, getMint, TOKEN_2022_PROGRAM_ID, getTokenMetadata } = require('@solana/spl-token');
const { Alchemy } = require("alchemy-sdk");
const WalletAddress = require("../models/user/walletAddress");
const { alchemyConfigs, chainIdToNetworkMap } = require("../config/alchemy");
const Web3 = require("web3");

const findAssociatedTokenAddress = async (connection, walletAddress, tokenMintAddress) => {
  try {
    // Determine the program ID based on the token mint information
    let programId = TOKEN_PROGRAM_ID;
    try {
      // First attempt with TOKEN_PROGRAM_ID
      mintInfo = await getMint(connection, new PublicKey(tokenMintAddress), 'confirmed', TOKEN_PROGRAM_ID);
      // console.log("MINT INFO using TOKEN_PROGRAM_ID: ", mintInfo);
    } catch (error) {
      // console.error("Failed with TOKEN_PROGRAM_ID, switching to TOKEN_2022_PROGRAM_ID:", error.message);
      programId = TOKEN_2022_PROGRAM_ID;
    }

    // Now use the determined program ID to get the associated token address
    const tokenAccount = await getAssociatedTokenAddress(
      new PublicKey(tokenMintAddress),
      new PublicKey(walletAddress),
      false, // allowOwnerOffCurve (set to false in most cases)
      programId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return { tokenAccount, programId };
  } catch (error) {
    console.error(`Error finding associated token address for wallet ${walletAddress.toString()} and token mint ${tokenMintAddress.toString()}: ${error.message}`, error);
    throw error;
  }
};

exports.getUserTokenBalance = async (req, res) => {
  try {
    let tokens = req.query.token ? req.query.token.split(',') : [];
    if (tokens.length === 0) {
      // Fetch all token information in one go
      const allTokens = await AllowableTokenContractsForLotteries.find();
      tokens = allTokens.map(token => token.ticker);
    }

    // Fetch token information in one query
    const tokenInfos = await AllowableTokenContractsForLotteries.find({
      ticker: { $in: tokens.map(token => token.toLowerCase()) }
    });

    if (tokenInfos.length === 0) {
      return sendResponse(res, 400, "No tokens found on the list");
    }

    const balances = {};
    const balancePromises = tokenInfos.map(async (tokenInfo) => {
      const token = tokenInfo.ticker.toLowerCase();
      const tokenType = tokenInfo.tokenType;
      const contractAddress = tokenInfo?.contractAddress;
      const chainId = tokenInfo?.chainId;
      const isNativeToken = tokenInfo?.isNativeToken;
      const decimal = tokenInfo?.decimal || 18;

      if (tokenType === "sol" || tokenType === "spl") {
        return await handleSolanaTokenBalance(req.user._id, tokenInfo, contractAddress, chainId, decimal);
      } else if (tokenType === "evm-native" || tokenType === "erc20") {
        return await handleEvmTokenBalance(req.user._id, tokenInfo, contractAddress, chainId, decimal);
      }
    });

    // Execute all balance fetch operations in parallel
    const results = await Promise.all(balancePromises);

    results.forEach((result, index) => {
      balances[tokenInfos[index].ticker.toLowerCase()] = result || 0;
    });

    return sendResponse(res, 200, "User token balances found", balances);
  } catch (error) {
    console.error("Failed to retrieve user token balance:", error);
    return sendResponse(res, 500, "Failed to retrieve user token balance", { error: error.message });
  }
};

async function handleSolanaTokenBalance(userId, tokenInfo, contractAddress, chainId, decimal) {
  const url = chainId === 'mainnet' ? process.env.QUICKNODE_SOLANA_API_KEY_PROD : "https://api.devnet.solana.com";
  const connection = new Connection(url);
  const walletInfo = await WalletAddress.findOne({ userRef: userId, walletType: 'phantom' });

  if (!walletInfo) return 0;

  const publicKey = new PublicKey(walletInfo.address);
  let balance = 0;

  if (tokenInfo.tokenType === "sol") {
    const redisKey = `userbalance:sol:${walletInfo.address}`;
    const cachedData = await getAsync(redisKey);
    if (cachedData) return Number(cachedData);

    balance = await connection.getBalance(publicKey);
    balance = balance / LAMPORTS_PER_SOL;
    await setAsync(redisKey, balance, "EX", 5 * 60);
  } else { // SPL Token
    const redisKey = `userbalance:spl:${walletInfo.address}:${contractAddress}`;
    const cachedData = await getAsync(redisKey);
    if (cachedData) return Number(cachedData);

    const { tokenAccount, programId } = await findAssociatedTokenAddress(connection, publicKey, contractAddress);
    try {
      const info = await getAccount(connection, tokenAccount, 'confirmed', programId);
      const amount = Number(info.amount);
      balance = amount / (10 ** decimal);
      await setAsync(redisKey, balance, "EX", 5 * 60);
    } catch (err) {
      // console.error("Error retrieving SPL balance:", err);
    }
  }
  return balance;
}

async function handleEvmTokenBalance(userId, tokenInfo, contractAddress, chainId, decimal) {
  const walletInfo = await WalletAddress.findOne({ userRef: userId, walletType: 'metamask' });
  if (!walletInfo) return 0;

  const address = walletInfo.address;
  const network = chainIdToNetworkMap[chainId];
  if (!network) return 0;

  const alchemy = new Alchemy(alchemyConfigs[network]);
  let balance = 0;

  if (tokenInfo.isNativeToken) {
    const redisKey = `userbalance:evm-native:${network}:${walletInfo.address}`;
    const cachedData = await getAsync(redisKey);
    if (cachedData) return Number(cachedData);

    balance = await alchemy.core.getBalance(address, "latest");
    balance = Number(Web3.utils.fromWei(balance.toString(), 'ether'));
    await setAsync(redisKey, balance, "EX", 5 * 60);
  } else { // ERC20 Token
    const redisKey = `userbalance:erc20:${network}:${walletInfo.address}:${contractAddress}`;
    const cachedData = await getAsync(redisKey);
    if (cachedData) return Number(cachedData);

    const userBalance = await alchemy.core.getTokenBalances(address, [contractAddress]);
    const balanceToString = userBalance.tokenBalances[0]?.tokenBalance?.toString() || "0";
    balance = BigInt(balanceToString) / BigInt(10 ** decimal);
    balance = Number(balance.toString());
    await setAsync(redisKey, balance, "EX", 5 * 60);
  }
  return balance;
}


exports.getTokenContractsForLotteries = async (req, res) => {
  try {
    // Retrieve all the token contracts for lotteries
    const tokenContracts = await AllowableTokenContractsForLotteries.find();

    // Check if the token contracts data exists
    if (!tokenContracts || tokenContracts.length === 0) {
      return sendResponse(res, 404, "No token contracts data found", []);
    }

    // Prepare the token contracts data dynamically
    const tokenContractsData = tokenContracts.map(contract => ({
      name: contract?.name,
      ticker: (contract?.ticker).toLowerCase(),
      decimal: contract?.decimal,
      network: contract?.network,
      contractAddress: contract?.contractAddress,
      isNativeToken: contract?.isNativeToken,
      chainId: contract?.chainId,
      rpcUrl: contract?.rpcUrl,
      chainName: contract?.chainName,
      tokenType: contract?.tokenType,
      icon: contract?.icon,
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
    }));

    // Send the response with the structured data
    sendResponse(res, 200, "Token Contracts Data", tokenContractsData);
  } catch (error) {
    console.error("Failed to retrieve token contracts data:", error);
    return sendResponse(res, 500, "Failed to retrieve data", {
      error: error.message
    });
  }
};

exports.getCryptoPrice = async (req, res) => {
  try {
    const data = await getAsync('crypto:prices');
    sendResponse(res, 200, "Success", JSON.parse(data));
  } catch (error) {
    // Log the error or handle it as needed
    console.error('Failed to get crypto prices:', error);
    // Send an error response to the client
    return sendResponse(res, 500, "Failed to get crypto prices");
  }
};

exports.getUserNfts = async (req, res) => {
  try {
    const { network, address, contractAddress, pageKey, pageSize } = req.query;

    const alchemy = createAlchemyInstance(network);
    if (!alchemy) {
      return sendResponse(res, 500, "Failed to create instance");
    }

    // Prepare options for the Alchemy API call
    const options = {};
    if (pageKey) {
      options.pageKey = pageKey;
    }
    if (contractAddress) {
      options.contractAddresses = Array.isArray(contractAddress) ? contractAddress : [contractAddress];
    }
    if (pageSize) {
      const size = Math.min(parseInt(pageSize, 10), 100); // Ensure the pageSize does not exceed 100
      options.pageSize = size;
    }

    // Fetch NFTs for the owner
    const data = await alchemy.nft.getNftsForOwner(address, options);
    sendResponse(res, 200, "Success", data);
  } catch (error) {
    // Log the error or handle it as needed
    console.error('Failed to get user NFTs:', error);
    // Send an error response to the client
    return sendResponse(res, 500, "Failed to get user NFTs");
  }
};

exports.getTokenDecimalMultiplier = async (req, res) => {
  try {
    const tokenDecimalMultiplier = await getAllSupportedTokenDecimalMultiplierAsObject();
    sendResponse(res, 200, "Success", tokenDecimalMultiplier);
  } catch (error) {
    console.error('Failed to get token decimal multipliers:', error);
    return sendResponse(res, 500, "Failed to get token decimal multipliers");
  }
};