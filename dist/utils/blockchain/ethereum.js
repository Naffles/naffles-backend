"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEthereumProvider = getEthereumProvider;
exports.getTreasuryWallet = getTreasuryWallet;
exports.getCurrentGasPrice = getCurrentGasPrice;
exports.estimateGas = estimateGas;
exports.getNativeBalance = getNativeBalance;
exports.getERC20Balance = getERC20Balance;
exports.sendNativeToken = sendNativeToken;
exports.sendERC20Token = sendERC20Token;
exports.getTransactionDetails = getTransactionDetails;
exports.waitForConfirmation = waitForConfirmation;
exports.getCurrentBlockNumber = getCurrentBlockNumber;
exports.getBlockDetails = getBlockDetails;
exports.executeContractCall = executeContractCall;
exports.generateWallet = generateWallet;
exports.toWei = toWei;
exports.fromWei = fromWei;
exports.isContract = isContract;
const ethers_1 = require("ethers");
const constants_1 = require("./constants");
function getEthereumProvider(chainId) {
    const chain = Object.values(constants_1.SUPPORTED_CHAINS).find(c => c.chainId === chainId && c.isEVM);
    if (!chain) {
        throw new Error(`Unsupported EVM chain: ${chainId}`);
    }
    return new ethers_1.ethers.JsonRpcProvider(chain.rpcUrl);
}
function getTreasuryWallet(chainId) {
    const provider = getEthereumProvider(chainId);
    const privateKey = process.env.TREASURY_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('Treasury private key not configured');
    }
    return new ethers_1.ethers.Wallet(privateKey, provider);
}
async function getCurrentGasPrice(chainId) {
    const provider = getEthereumProvider(chainId);
    const feeData = await provider.getFeeData();
    if (!feeData.gasPrice) {
        throw new Error('Unable to fetch gas price');
    }
    return feeData.gasPrice;
}
async function estimateGas(chainId, transaction) {
    const provider = getEthereumProvider(chainId);
    try {
        return await provider.estimateGas(transaction);
    }
    catch (error) {
        console.error('Gas estimation failed:', error);
        if (transaction.data) {
            return BigInt(constants_1.GAS_LIMITS.CONTRACT_INTERACTION);
        }
        else {
            return BigInt(constants_1.GAS_LIMITS.ETH_TRANSFER);
        }
    }
}
async function getNativeBalance(chainId, address) {
    const provider = getEthereumProvider(chainId);
    const balance = await provider.getBalance(address);
    return ethers_1.ethers.formatEther(balance);
}
async function getERC20Balance(chainId, tokenAddress, walletAddress) {
    const provider = getEthereumProvider(chainId);
    const erc20Abi = [
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)'
    ];
    const contract = new ethers_1.ethers.Contract(tokenAddress, erc20Abi, provider);
    const [balance, decimals] = await Promise.all([
        contract.balanceOf(walletAddress),
        contract.decimals()
    ]);
    return ethers_1.ethers.formatUnits(balance, decimals);
}
async function sendNativeToken(chainId, toAddress, amount, privateKey) {
    const provider = getEthereumProvider(chainId);
    const wallet = privateKey
        ? new ethers_1.ethers.Wallet(privateKey, provider)
        : getTreasuryWallet(chainId);
    const transaction = {
        to: toAddress,
        value: ethers_1.ethers.parseEther(amount).toString()
    };
    const gasLimit = await estimateGas(chainId, transaction);
    const gasPrice = await getCurrentGasPrice(chainId);
    const tx = await wallet.sendTransaction({
        ...transaction,
        gasLimit,
        gasPrice
    });
    return tx.hash;
}
async function sendERC20Token(chainId, tokenAddress, toAddress, amount, decimals, privateKey) {
    const provider = getEthereumProvider(chainId);
    const wallet = privateKey
        ? new ethers_1.ethers.Wallet(privateKey, provider)
        : getTreasuryWallet(chainId);
    const erc20Abi = [
        'function transfer(address to, uint256 amount) returns (bool)'
    ];
    const contract = new ethers_1.ethers.Contract(tokenAddress, erc20Abi, wallet);
    const amountInWei = ethers_1.ethers.parseUnits(amount, decimals);
    const tx = await contract.transfer(toAddress, amountInWei);
    return tx.hash;
}
async function getTransactionDetails(chainId, txHash) {
    const provider = getEthereumProvider(chainId);
    try {
        const [tx, receipt] = await Promise.all([
            provider.getTransaction(txHash),
            provider.getTransactionReceipt(txHash)
        ]);
        if (!tx) {
            return null;
        }
        return {
            hash: tx.hash,
            from: tx.from,
            to: tx.to || '',
            value: ethers_1.ethers.formatEther(tx.value),
            blockNumber: tx.blockNumber || 0,
            timestamp: 0,
            gasUsed: receipt?.gasUsed.toString(),
            gasPrice: tx.gasPrice?.toString(),
            status: receipt ? (receipt.status === 1 ? 'confirmed' : 'failed') : 'pending'
        };
    }
    catch (error) {
        console.error('Error fetching transaction details:', error);
        return null;
    }
}
async function waitForConfirmation(chainId, txHash, confirmations = 1) {
    const provider = getEthereumProvider(chainId);
    try {
        const receipt = await provider.waitForTransaction(txHash, confirmations);
        return receipt?.status === 1;
    }
    catch (error) {
        console.error('Error waiting for confirmation:', error);
        return false;
    }
}
async function getCurrentBlockNumber(chainId) {
    const provider = getEthereumProvider(chainId);
    return await provider.getBlockNumber();
}
async function getBlockDetails(chainId, blockNumber) {
    const provider = getEthereumProvider(chainId);
    return await provider.getBlock(blockNumber);
}
async function executeContractCall(chainId, contractCall, privateKey) {
    const provider = getEthereumProvider(chainId);
    const wallet = privateKey
        ? new ethers_1.ethers.Wallet(privateKey, provider)
        : getTreasuryWallet(chainId);
    const contract = new ethers_1.ethers.Contract(contractCall.contractAddress, [], wallet);
    const tx = await contract[contractCall.functionName](...contractCall.parameters, {
        value: contractCall.value ? ethers_1.ethers.parseEther(contractCall.value) : 0,
        gasLimit: contractCall.gasLimit ? BigInt(contractCall.gasLimit) : undefined
    });
    return tx.hash;
}
function generateWallet() {
    const wallet = ethers_1.ethers.Wallet.createRandom();
    return {
        address: wallet.address,
        privateKey: wallet.privateKey
    };
}
function toWei(amount, decimals) {
    return ethers_1.ethers.parseUnits(amount, decimals);
}
function fromWei(amount, decimals) {
    return ethers_1.ethers.formatUnits(amount, decimals);
}
async function isContract(chainId, address) {
    const provider = getEthereumProvider(chainId);
    const code = await provider.getCode(address);
    return code !== '0x';
}
//# sourceMappingURL=ethereum.js.map