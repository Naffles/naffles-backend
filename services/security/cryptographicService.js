const crypto = require('crypto');
const vrfWrapper = require('../vrfWrapper');

/**
 * Cryptographic Service
 * Handles all cryptographic operations for game security
 */
class CryptographicService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    this.gameSecretKey = process.env.GAME_SECRET_KEY || this.generateSecretKey();
  }

  /**
   * Generate a secure secret key
   * @returns {string} Base64 encoded secret key
   */
  generateSecretKey() {
    return crypto.randomBytes(this.keyLength).toString('base64');
  }

  /**
   * Sign game state with HMAC
   * @param {Object} gameState - Game state to sign
   * @param {string} secretKey - Secret key for signing
   * @returns {string} HMAC signature
   */
  signGameState(gameState, secretKey = this.gameSecretKey) {
    try {
      const dataString = JSON.stringify(gameState);
      const hmac = crypto.createHmac('sha256', secretKey);
      hmac.update(dataString);
      return hmac.digest('hex');
    } catch (error) {
      console.error('Error signing game state:', error);
      throw new Error('Failed to sign game state');
    }
  }

  /**
   * Verify game state signature
   * @param {Object} signedState - Signed game state object
   * @param {string} publicKey - Public key for verification (not used in HMAC)
   * @returns {boolean} Verification result
   */
  verifyGameStateSignature(signedState, publicKey = this.gameSecretKey) {
    try {
      const { data, signature } = signedState;
      const expectedSignature = this.signGameState(data, publicKey);
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('Error verifying game state signature:', error);
      return false;
    }
  }

  /**
   * Generate cryptographically secure random number using VRF
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {Promise<number>} Random number
   */
  async generateSecureRandom(min, max) {
    try {
      // Use VRF wrapper for secure randomness
      const randomValue = await vrfWrapper.generateSecureRandom();
      
      // Convert to range [min, max]
      const range = max - min + 1;
      return min + (randomValue % range);
    } catch (error) {
      console.error('Error generating secure random:', error);
      // Fallback to crypto.randomInt for development
      return crypto.randomInt(min, max + 1);
    }
  }

  /**
   * Create message signature for iframe communication
   * @param {any} message - Message to sign
   * @param {string} secretKey - Secret key
   * @returns {string} Message signature
   */
  createMessageSignature(message, secretKey = this.gameSecretKey) {
    try {
      const messageString = JSON.stringify(message);
      const hmac = crypto.createHmac('sha256', secretKey);
      hmac.update(messageString);
      return hmac.digest('hex');
    } catch (error) {
      console.error('Error creating message signature:', error);
      throw new Error('Failed to create message signature');
    }
  }

  /**
   * Verify message signature
   * @param {any} message - Original message
   * @param {string} signature - Signature to verify
   * @param {string} publicKey - Public key for verification
   * @returns {boolean} Verification result
   */
  verifyMessageSignature(message, signature, publicKey = this.gameSecretKey) {
    try {
      const expectedSignature = this.createMessageSignature(message, publicKey);
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('Error verifying message signature:', error);
      return false;
    }
  }

  /**
   * Hash game session data
   * @param {Object} sessionData - Game session data
   * @returns {string} SHA-256 hash
   */
  hashGameSession(sessionData) {
    try {
      const dataString = JSON.stringify(sessionData);
      return crypto.createHash('sha256').update(dataString).digest('hex');
    } catch (error) {
      console.error('Error hashing game session:', error);
      throw new Error('Failed to hash game session');
    }
  }

  /**
   * Encrypt sensitive game data
   * @param {string} data - Data to encrypt
   * @param {string} key - Encryption key
   * @returns {Object} Encrypted data with IV and tag
   */
  encryptGameData(data, key = this.gameSecretKey) {
    try {
      const keyBuffer = Buffer.from(key, 'base64');
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, keyBuffer, iv);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      console.error('Error encrypting game data:', error);
      throw new Error('Failed to encrypt game data');
    }
  }

  /**
   * Decrypt sensitive game data
   * @param {Object} encryptedData - Encrypted data object
   * @param {string} key - Decryption key
   * @returns {string} Decrypted data
   */
  decryptGameData(encryptedData, key = this.gameSecretKey) {
    try {
      const keyBuffer = Buffer.from(key, 'base64');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');
      
      const decipher = crypto.createDecipher(this.algorithm, keyBuffer, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Error decrypting game data:', error);
      throw new Error('Failed to decrypt game data');
    }
  }

  /**
   * Generate nonce for message uniqueness
   * @returns {string} Random nonce
   */
  generateNonce() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Create secure game state with signature
   * @param {Object} gameState - Game state data
   * @returns {Object} Signed game state
   */
  createSignedGameState(gameState) {
    const timestamp = Date.now();
    const nonce = this.generateNonce();
    
    const stateWithMeta = {
      ...gameState,
      timestamp,
      nonce
    };
    
    const signature = this.signGameState(stateWithMeta);
    
    return {
      data: stateWithMeta,
      signature,
      timestamp,
      nonce
    };
  }

  /**
   * Verify signed game state integrity
   * @param {Object} signedState - Signed game state
   * @returns {boolean} Verification result
   */
  verifySignedGameState(signedState) {
    try {
      // Check signature
      if (!this.verifyGameStateSignature(signedState)) {
        return false;
      }
      
      // Check timestamp (not older than 1 hour)
      const maxAge = 60 * 60 * 1000; // 1 hour in milliseconds
      const age = Date.now() - signedState.timestamp;
      if (age > maxAge) {
        console.warn('Game state too old:', age);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error verifying signed game state:', error);
      return false;
    }
  }

  /**
   * Generate secure session token
   * @param {string} playerId - Player ID
   * @param {string} gameType - Game type
   * @returns {string} Secure session token
   */
  generateSessionToken(playerId, gameType) {
    const payload = {
      playerId,
      gameType,
      timestamp: Date.now(),
      nonce: this.generateNonce()
    };
    
    const signature = this.createMessageSignature(payload);
    const token = Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
    
    return token;
  }

  /**
   * Verify session token
   * @param {string} token - Session token to verify
   * @returns {Object|null} Decoded payload or null if invalid
   */
  verifySessionToken(token) {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
      const { payload, signature } = decoded;
      
      if (!this.verifyMessageSignature(payload, signature)) {
        return null;
      }
      
      // Check token age (valid for 24 hours)
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      const age = Date.now() - payload.timestamp;
      if (age > maxAge) {
        return null;
      }
      
      return payload;
    } catch (error) {
      console.error('Error verifying session token:', error);
      return null;
    }
  }
}

module.exports = new CryptographicService();