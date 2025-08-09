const crypto = require('crypto');

/**
 * VRF Wrapper Service with Failsafe Randomness
 * 
 * This service provides a failsafe mechanism for VRF (Verifiable Random Function) operations.
 * If VRF is unavailable due to configuration issues, it falls back to secure pseudorandom generation.
 * 
 * In production, VRF should always be properly configured for provably fair randomness.
 * The fallback is intended for development/testing environments only.
 */
class VRFWrapper {
  constructor() {
    this.vrfService = null;
    this.isVrfAvailable = false;
    this.initializeVRF();
  }

  /**
   * Initialize VRF service with graceful error handling
   */
  initializeVRF() {
    try {
      this.vrfService = require('./vrfService');
      this.isVrfAvailable = true;
      console.log('✅ VRF service initialized successfully');
    } catch (error) {
      console.warn('⚠️  VRF service unavailable, using failsafe randomness:', error.message);
      console.warn('⚠️  This is acceptable for development but VRF should be configured for production');
      this.isVrfAvailable = false;
    }
  }

  /**
   * Request randomness with VRF failsafe
   * @returns {Promise<Object>} VRF request or fallback random data
   */
  async requestRandomness() {
    if (this.isVrfAvailable) {
      try {
        const vrfRequest = await this.vrfService.requestRandomness();
        console.log('🎲 VRF randomness requested:', vrfRequest.requestId);
        return vrfRequest;
      } catch (error) {
        console.warn('⚠️  VRF request failed, falling back to secure randomness:', error.message);
        return this.generateFallbackRandomness();
      }
    } else {
      return this.generateFallbackRandomness();
    }
  }

  /**
   * Generate cryptographically secure fallback randomness
   * @returns {Object} Fallback random data structure
   */
  generateFallbackRandomness() {
    const randomBytes = crypto.randomBytes(32);
    const requestId = `fallback_${Date.now()}_${randomBytes.toString('hex').substring(0, 8)}`;
    
    console.log('🎲 Using fallback randomness:', requestId);
    
    return {
      requestId,
      randomness: randomBytes.toString('hex'),
      isFallback: true,
      timestamp: new Date(),
      source: 'crypto.randomBytes'
    };
  }

  /**
   * Get random number between 0 and 1 with VRF failsafe
   * @returns {Promise<number>} Random number between 0 and 1
   */
  async getRandomFloat() {
    if (this.isVrfAvailable) {
      try {
        const vrfRequest = await this.vrfService.requestRandomness();
        // Convert VRF randomness to float (this would be implemented based on VRF response format)
        const randomHex = vrfRequest.randomness || this.generateFallbackRandomness().randomness;
        const randomInt = parseInt(randomHex.substring(0, 8), 16);
        return randomInt / 0xFFFFFFFF;
      } catch (error) {
        console.warn('⚠️  VRF random float failed, using fallback:', error.message);
        return this.getFallbackRandomFloat();
      }
    } else {
      return this.getFallbackRandomFloat();
    }
  }

  /**
   * Generate fallback random float
   * @returns {number} Cryptographically secure random float
   */
  getFallbackRandomFloat() {
    const randomBytes = crypto.randomBytes(4);
    const randomInt = randomBytes.readUInt32BE(0);
    return randomInt / 0xFFFFFFFF;
  }

  /**
   * Get random integer within range with VRF failsafe
   * @param {number} min - Minimum value (inclusive)
   * @param {number} max - Maximum value (exclusive)
   * @returns {Promise<number>} Random integer
   */
  async getRandomInt(min, max) {
    const randomFloat = await this.getRandomFloat();
    return Math.floor(randomFloat * (max - min)) + min;
  }

  /**
   * Get random choice from array with VRF failsafe
   * @param {Array} choices - Array of choices
   * @returns {Promise<*>} Random choice from array
   */
  async getRandomChoice(choices) {
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error('Choices must be a non-empty array');
    }
    
    const randomIndex = await this.getRandomInt(0, choices.length);
    return choices[randomIndex];
  }

  /**
   * Generate coin flip result with VRF failsafe
   * @returns {Promise<string>} 'heads' or 'tails'
   */
  async coinFlip() {
    return await this.getRandomChoice(['heads', 'tails']);
  }

  /**
   * Generate rock-paper-scissors choice with VRF failsafe
   * @returns {Promise<string>} 'rock', 'paper', or 'scissors'
   */
  async rockPaperScissorsChoice() {
    return await this.getRandomChoice(['rock', 'paper', 'scissors']);
  }

  /**
   * Check if VRF is available
   * @returns {boolean} True if VRF is available
   */
  isVRFAvailable() {
    return this.isVrfAvailable;
  }

  /**
   * Get randomness source information
   * @returns {Object} Information about current randomness source
   */
  getRandomnessSource() {
    return {
      isVrfAvailable: this.isVrfAvailable,
      source: this.isVrfAvailable ? 'Chainlink VRF' : 'Crypto.randomBytes (Fallback)',
      isProduction: process.env.NODE_ENV === 'production',
      warning: !this.isVrfAvailable ? 'VRF should be configured for production use' : null
    };
  }

  /**
   * Validate randomness configuration for production
   * @throws {Error} If VRF is not available in production
   */
  validateProductionReadiness() {
    if (process.env.NODE_ENV === 'production' && !this.isVrfAvailable) {
      throw new Error('VRF must be properly configured for production use. Fallback randomness is not suitable for production gaming.');
    }
  }
}

// Export singleton instance
module.exports = new VRFWrapper();