const crypto = require('crypto');
const nacl = require('tweetnacl');
const bs58 = require('bs58');

const walletController = require("../controllers/walletController");

// Generate a key pair
function generateKeyPair() {
    const keyPair = nacl.sign.keyPair();
    const publicKey = bs58.encode(keyPair.publicKey);
    const privateKey = bs58.encode(keyPair.secretKey);  // In Ed25519, the private key is often referred to as the secret key

    return { publicKey, privateKey };
}

// Sign a message
function signMessage(message, privateKey) {
    console.log(`signMessage = ${privateKey}`);
    // const decodedPrivateKey = bs58.decode(privateKey);
    const messageUint8 = Buffer.from(message, 'utf8');

    // Sign the message using the private (secret) key
    const signedMessage = nacl.sign.detached(messageUint8, bs58.decode(privateKey));

    // Encode the signature to Base58
    const signature = bs58.encode(signedMessage);
    console.log('Signature:', signature);
    return signature;
}

function encodeKeyToBase58(key) {
    // Assuming the key is in PEM format and needs to be converted to Base58
    // Strip the PEM headers and footers and decode from base64 to binary buffer
    const base64 = key.replace(/(-----(BEGIN|END) (PUBLIC|PRIVATE) KEY-----|\n)/g, '');
    const buffer = Buffer.from(base64, 'base64');

    // Encode the buffer to Base58
    return bs58.encode(buffer);
}

// Verify the signature
function verifySignature(message, signature, publicKey) {
    const verifier = crypto.createVerify('sha256');
    verifier.update(message);
    verifier.end();
    const isVerified = verifier.verify(publicKey, signature, 'base64');
    console.log('Signature verified:', isVerified);
    return isVerified;
}

// Example usage
const { publicKey, privateKey } = generateKeyPair();
const message = 'This is a secret message';
const signature = signMessage(message, privateKey);
// verifySignature(message, signature, publicKey);
// const req = { signature: signature, publickey: publicKey }
// const res = {};
// walletController.validSignature(req, res);

module.exports = {
    generateKeyPair,
    signMessage,
    encodeKeyToBase58
}