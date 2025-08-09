"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptionUtil = exports.EncryptionUtil = void 0;
exports.createEncryptionUtil = createEncryptionUtil;
const crypto_1 = __importDefault(require("crypto"));
class EncryptionUtil {
    constructor(secretKey, algorithm = 'aes-256-gcm') {
        this.algorithm = algorithm;
        this.secretKey = crypto_1.default.scryptSync(secretKey, 'salt', 32);
    }
    encrypt(text) {
        const iv = crypto_1.default.randomBytes(16);
        const cipher = crypto_1.default.createCipher(this.algorithm, this.secretKey);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return {
            encrypted,
            iv: iv.toString('hex'),
            tag: ''
        };
    }
    decrypt(input) {
        const decipher = crypto_1.default.createDecipher(this.algorithm, this.secretKey);
        let decrypted = decipher.update(input.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    hashPassword(password) {
        const salt = crypto_1.default.randomBytes(16).toString('hex');
        const hash = crypto_1.default.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
        return `${salt}:${hash}`;
    }
    verifyPassword(password, hashedPassword) {
        const [salt, hash] = hashedPassword.split(':');
        const verifyHash = crypto_1.default.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
        return hash === verifyHash;
    }
    generateRandomString(length = 32) {
        return crypto_1.default.randomBytes(length).toString('hex');
    }
    generateUUID() {
        return crypto_1.default.randomUUID();
    }
    createHMAC(data, secret) {
        return crypto_1.default.createHmac('sha256', secret).update(data).digest('hex');
    }
    verifyHMAC(data, signature, secret) {
        const expectedSignature = this.createHMAC(data, secret);
        return crypto_1.default.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
    }
    encryptForStorage(data) {
        const jsonString = JSON.stringify(data);
        const result = this.encrypt(jsonString);
        return JSON.stringify(result);
    }
    decryptFromStorage(encryptedData) {
        const decryptionInput = JSON.parse(encryptedData);
        const decryptedString = this.decrypt(decryptionInput);
        return JSON.parse(decryptedString);
    }
}
exports.EncryptionUtil = EncryptionUtil;
function createEncryptionUtil(secretKey) {
    const key = secretKey || process.env.ENCRYPTION_SECRET_KEY;
    if (!key) {
        throw new Error('Encryption secret key is required');
    }
    return new EncryptionUtil(key);
}
exports.encryptionUtil = createEncryptionUtil();
//# sourceMappingURL=encryption.js.map