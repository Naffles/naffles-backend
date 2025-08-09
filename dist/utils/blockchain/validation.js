"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidEthereumAddress = isValidEthereumAddress;
exports.isValidSolanaAddress = isValidSolanaAddress;
exports.isValidAddress = isValidAddress;
exports.isValidTransactionHash = isValidTransactionHash;
exports.isValidTokenAmount = isValidTokenAmount;
exports.isValidTokenAmountObject = isValidTokenAmountObject;
exports.isSupportedChain = isSupportedChain;
exports.isSupportedToken = isSupportedToken;
exports.isValidPrivateKey = isValidPrivateKey;
exports.isValidGasPrice = isValidGasPrice;
exports.isValidGasLimit = isValidGasLimit;
exports.isValidNonce = isValidNonce;
exports.sanitizeAddress = sanitizeAddress;
exports.sanitizeTransactionHash = sanitizeTransactionHash;
exports.validateWithdrawalRequest = validateWithdrawalRequest;
exports.validateDepositAddressRequest = validateDepositAddressRequest;
const ethers_1 = require("ethers");
const web3_js_1 = require("@solana/web3.js");
const constants_1 = require("./constants");
function isValidEthereumAddress(address) {
    try {
        return ethers_1.ethers.isAddress(address);
    }
    catch {
        return false;
    }
}
function isValidSolanaAddress(address) {
    try {
        new web3_js_1.PublicKey(address);
        return true;
    }
    catch {
        return false;
    }
}
function isValidAddress(address, chainId) {
    const chain = Object.values(constants_1.SUPPORTED_CHAINS).find(c => c.chainId === chainId);
    if (!chain) {
        return false;
    }
    if (chain.isEVM) {
        return isValidEthereumAddress(address);
    }
    else if (chainId === 'solana-mainnet') {
        return isValidSolanaAddress(address);
    }
    return false;
}
function isValidTransactionHash(hash, chainId) {
    const chain = Object.values(constants_1.SUPPORTED_CHAINS).find(c => c.chainId === chainId);
    if (!chain) {
        return false;
    }
    if (chain.isEVM) {
        return /^0x[a-fA-F0-9]{64}$/.test(hash);
    }
    else if (chainId === 'solana-mainnet') {
        return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(hash);
    }
    return false;
}
function isValidTokenAmount(amount, decimals) {
    try {
        const num = parseFloat(amount);
        if (isNaN(num) || num < 0) {
            return false;
        }
        const decimalPlaces = (amount.split('.')[1] || '').length;
        return decimalPlaces <= decimals;
    }
    catch {
        return false;
    }
}
function isValidTokenAmountObject(tokenAmount) {
    if (!tokenAmount || typeof tokenAmount !== 'object') {
        return false;
    }
    const { amount, tokenContract, chainId, decimals, symbol } = tokenAmount;
    if (!amount || !chainId || !symbol || decimals === undefined) {
        return false;
    }
    if (!isValidTokenAmount(amount, decimals)) {
        return false;
    }
    const chain = Object.values(constants_1.SUPPORTED_CHAINS).find(c => c.chainId === chainId);
    if (!chain) {
        return false;
    }
    if (tokenContract && tokenContract !== 'native') {
        if (!isValidAddress(tokenContract, chainId)) {
            return false;
        }
    }
    return true;
}
function isSupportedChain(chainId) {
    return Object.values(constants_1.SUPPORTED_CHAINS).some(chain => chain.chainId === chainId);
}
function isSupportedToken(symbol, chainId) {
    const chainName = Object.entries(constants_1.SUPPORTED_CHAINS).find(([_, config]) => config.chainId === chainId)?.[0];
    if (!chainName || !(chainName in constants_1.SUPPORTED_TOKENS)) {
        return false;
    }
    const tokens = constants_1.SUPPORTED_TOKENS[chainName];
    return tokens?.some((token) => token.symbol.toLowerCase() === symbol.toLowerCase()) || false;
}
function isValidPrivateKey(privateKey, chainId) {
    const chain = Object.values(constants_1.SUPPORTED_CHAINS).find(c => c.chainId === chainId);
    if (!chain) {
        return false;
    }
    if (chain.isEVM) {
        const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
        return /^[a-fA-F0-9]{64}$/.test(cleanKey);
    }
    else if (chainId === 'solana-mainnet') {
        return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(privateKey);
    }
    return false;
}
function isValidGasPrice(gasPrice) {
    try {
        const price = parseFloat(gasPrice);
        return !isNaN(price) && price > 0;
    }
    catch {
        return false;
    }
}
function isValidGasLimit(gasLimit) {
    try {
        const limit = parseInt(gasLimit);
        return !isNaN(limit) && limit > 0 && limit <= 10000000;
    }
    catch {
        return false;
    }
}
function isValidNonce(nonce) {
    return Number.isInteger(nonce) && nonce >= 0;
}
function sanitizeAddress(address) {
    return address.trim().toLowerCase();
}
function sanitizeTransactionHash(hash) {
    return hash.trim();
}
function validateWithdrawalRequest(amount, destinationAddress, userId) {
    const errors = [];
    if (!userId || typeof userId !== 'string') {
        errors.push('Invalid user ID');
    }
    if (!isValidTokenAmountObject(amount)) {
        errors.push('Invalid token amount');
    }
    if (!isValidAddress(destinationAddress, amount.chainId)) {
        errors.push('Invalid destination address');
    }
    if (!isSupportedToken(amount.symbol, amount.chainId)) {
        errors.push('Unsupported token');
    }
    return {
        isValid: errors.length === 0,
        errors
    };
}
function validateDepositAddressRequest(userId, chainId, tokenContract) {
    const errors = [];
    if (!userId || typeof userId !== 'string') {
        errors.push('Invalid user ID');
    }
    if (!isSupportedChain(chainId)) {
        errors.push('Unsupported chain');
    }
    if (tokenContract && tokenContract !== 'native') {
        if (!isValidAddress(tokenContract, chainId)) {
            errors.push('Invalid token contract address');
        }
    }
    return {
        isValid: errors.length === 0,
        errors
    };
}
//# sourceMappingURL=validation.js.map