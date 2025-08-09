"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSolanaConnection = getSolanaConnection;
exports.getTreasuryKeypair = getTreasuryKeypair;
exports.getSolBalance = getSolBalance;
exports.getSPLTokenBalance = getSPLTokenBalance;
exports.sendSol = sendSol;
exports.sendSPLToken = sendSPLToken;
exports.getSolanaTransactionDetails = getSolanaTransactionDetails;
exports.waitForSolanaConfirmation = waitForSolanaConfirmation;
exports.getCurrentSlot = getCurrentSlot;
exports.getAccountInfo = getAccountInfo;
exports.getTokenAccounts = getTokenAccounts;
exports.getTransactionHistory = getTransactionHistory;
exports.generateSolanaKeypair = generateSolanaKeypair;
exports.getAssociatedTokenAddressForMint = getAssociatedTokenAddressForMint;
exports.accountExists = accountExists;
exports.getMinimumRentExemption = getMinimumRentExemption;
exports.lamportsToSol = lamportsToSol;
exports.solToLamports = solToLamports;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const constants_1 = require("./constants");
function getSolanaConnection() {
    const solanaConfig = constants_1.SUPPORTED_CHAINS.solana;
    return new web3_js_1.Connection(solanaConfig.rpcUrl, 'confirmed');
}
function getTreasuryKeypair() {
    const privateKeyString = process.env.SOLANA_TREASURY_PRIVATE_KEY;
    if (!privateKeyString) {
        throw new Error('Solana treasury private key not configured');
    }
    const privateKeyBytes = Buffer.from(privateKeyString, 'base64');
    return web3_js_1.Keypair.fromSecretKey(privateKeyBytes);
}
async function getSolBalance(address) {
    const connection = getSolanaConnection();
    const publicKey = new web3_js_1.PublicKey(address);
    const balance = await connection.getBalance(publicKey);
    return (balance / web3_js_1.LAMPORTS_PER_SOL).toString();
}
async function getSPLTokenBalance(walletAddress, tokenMintAddress) {
    const connection = getSolanaConnection();
    const walletPublicKey = new web3_js_1.PublicKey(walletAddress);
    const tokenMintPublicKey = new web3_js_1.PublicKey(tokenMintAddress);
    try {
        const associatedTokenAddress = await (0, spl_token_1.getAssociatedTokenAddress)(tokenMintPublicKey, walletPublicKey);
        const tokenAccount = await (0, spl_token_1.getAccount)(connection, associatedTokenAddress);
        const mintInfo = await connection.getParsedAccountInfo(tokenMintPublicKey);
        const decimals = mintInfo.value?.data?.parsed?.info?.decimals || 9;
        return (Number(tokenAccount.amount) / Math.pow(10, decimals)).toString();
    }
    catch (error) {
        console.error('Error getting SPL token balance:', error);
        return '0';
    }
}
async function sendSol(toAddress, amount, fromKeypair) {
    const connection = getSolanaConnection();
    const keypair = fromKeypair || getTreasuryKeypair();
    const toPublicKey = new web3_js_1.PublicKey(toAddress);
    const transaction = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: toPublicKey,
        lamports: Math.floor(parseFloat(amount) * web3_js_1.LAMPORTS_PER_SOL)
    }));
    const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [keypair]);
    return signature;
}
async function sendSPLToken(tokenMintAddress, toAddress, amount, decimals, fromKeypair) {
    const connection = getSolanaConnection();
    const keypair = fromKeypair || getTreasuryKeypair();
    const tokenMintPublicKey = new web3_js_1.PublicKey(tokenMintAddress);
    const toPublicKey = new web3_js_1.PublicKey(toAddress);
    const fromTokenAddress = await (0, spl_token_1.getAssociatedTokenAddress)(tokenMintPublicKey, keypair.publicKey);
    const toTokenAddress = await (0, spl_token_1.getAssociatedTokenAddress)(tokenMintPublicKey, toPublicKey);
    const transaction = new web3_js_1.Transaction().add((0, spl_token_1.createTransferInstruction)(fromTokenAddress, toTokenAddress, keypair.publicKey, Math.floor(parseFloat(amount) * Math.pow(10, decimals))));
    const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [keypair]);
    return signature;
}
async function getSolanaTransactionDetails(signature) {
    const connection = getSolanaConnection();
    try {
        const transaction = await connection.getTransaction(signature, {
            maxSupportedTransactionVersion: 0
        });
        if (!transaction) {
            return null;
        }
        const meta = transaction.meta;
        if (!meta) {
            return null;
        }
        const preBalances = meta.preBalances;
        const postBalances = meta.postBalances;
        const accountKeys = transaction.transaction.message.staticAccountKeys;
        let transferAmount = '0';
        if (preBalances.length > 0 && postBalances.length > 0) {
            const diff = Math.abs(postBalances[0] - preBalances[0]);
            transferAmount = (diff / web3_js_1.LAMPORTS_PER_SOL).toString();
        }
        return {
            hash: signature,
            from: accountKeys[0]?.toString() || '',
            to: accountKeys[1]?.toString() || '',
            value: transferAmount,
            blockNumber: transaction.slot,
            timestamp: transaction.blockTime || 0,
            status: meta.err ? 'failed' : 'confirmed'
        };
    }
    catch (error) {
        console.error('Error fetching Solana transaction details:', error);
        return null;
    }
}
async function waitForSolanaConfirmation(signature, commitment = 'confirmed') {
    const connection = getSolanaConnection();
    try {
        const result = await connection.confirmTransaction(signature, commitment);
        return !result.value.err;
    }
    catch (error) {
        console.error('Error waiting for Solana confirmation:', error);
        return false;
    }
}
async function getCurrentSlot() {
    const connection = getSolanaConnection();
    return await connection.getSlot();
}
async function getAccountInfo(address) {
    const connection = getSolanaConnection();
    const publicKey = new web3_js_1.PublicKey(address);
    return await connection.getAccountInfo(publicKey);
}
async function getTokenAccounts(walletAddress) {
    const connection = getSolanaConnection();
    const walletPublicKey = new web3_js_1.PublicKey(walletAddress);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPublicKey, { programId: spl_token_1.TOKEN_PROGRAM_ID });
    return tokenAccounts.value.map(account => ({
        address: account.pubkey.toString(),
        mint: account.account.data.parsed.info.mint,
        amount: account.account.data.parsed.info.tokenAmount.uiAmount,
        decimals: account.account.data.parsed.info.tokenAmount.decimals
    }));
}
async function getTransactionHistory(address, limit = 10) {
    const connection = getSolanaConnection();
    const publicKey = new web3_js_1.PublicKey(address);
    return await connection.getSignaturesForAddress(publicKey, { limit });
}
function generateSolanaKeypair() {
    const keypair = web3_js_1.Keypair.generate();
    return {
        address: keypair.publicKey.toString(),
        privateKey: Buffer.from(keypair.secretKey).toString('base64')
    };
}
async function getAssociatedTokenAddressForMint(mintAddress, ownerAddress) {
    const mintPublicKey = new web3_js_1.PublicKey(mintAddress);
    const ownerPublicKey = new web3_js_1.PublicKey(ownerAddress);
    const associatedTokenAddress = await (0, spl_token_1.getAssociatedTokenAddress)(mintPublicKey, ownerPublicKey);
    return associatedTokenAddress.toString();
}
async function accountExists(address) {
    const connection = getSolanaConnection();
    const publicKey = new web3_js_1.PublicKey(address);
    try {
        const accountInfo = await connection.getAccountInfo(publicKey);
        return accountInfo !== null;
    }
    catch {
        return false;
    }
}
async function getMinimumRentExemption(dataLength) {
    const connection = getSolanaConnection();
    return await connection.getMinimumBalanceForRentExemption(dataLength);
}
function lamportsToSol(lamports) {
    return (lamports / web3_js_1.LAMPORTS_PER_SOL).toString();
}
function solToLamports(sol) {
    return Math.floor(parseFloat(sol) * web3_js_1.LAMPORTS_PER_SOL);
}
//# sourceMappingURL=solana.js.map