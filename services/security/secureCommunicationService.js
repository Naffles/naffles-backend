const crypto = require('crypto');
const securityMonitoringService = require('./securityMonitoringService');

/**
 * Secure Communication Service
 * Handles secure postMessage communication between iframe and parent
 */
class SecureCommunicationService {
  constructor() {
    this.allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://naffles.com',
      'https://app.naffles.com',
      'https://staging.naffles.com',
      'https://dev.naffles.com'
    ];
    
    this.messageSecret = process.env.MESSAGE_SECURITY_SECRET || crypto.randomBytes(32).toString('hex');
    this.rateLimits = new Map(); // Track rate limits per client
    this.secureChannels = new Map(); // Track secure channels
  }

  /**
   * Validate message origin against whitelist
   */
  validateMessageOrigin(origin) {
    // In development, allow localhost origins
    if (process.env.NODE_ENV === 'development') {
      const localhostPattern = /^https?:\/\/localhost:\d+$/;
      if (localhostPattern.test(origin)) {
        return true;
      }
    }
    
    return this.allowedOrigins.includes(origin);
  }

  /**
   * Create secure message with signature
   */
  createSecureMessage(type, payload, source = 'parent') {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    
    const message = {
      type,
      payload,
      source,
      timestamp,
      nonce
    };
    
    const signature = this.createMessageSignature(message);
    
    return {
      ...message,
      signature
    };
  }

  /**
   * Create message signature
   */
  createMessageSignature(message) {
    const messageString = JSON.stringify({
      type: message.type,
      payload: message.payload,
      source: message.source,
      timestamp: message.timestamp,
      nonce: message.nonce
    });
    
    return crypto.createHmac('sha256', this.messageSecret)
      .update(messageString)
      .digest('hex');
  }

  /**
   * Verify secure message
   */
  verifySecureMessage(message) {
    try {
      if (!message.signature || !message.timestamp || !message.nonce) {
        return false;
      }
      
      // Check message age (not older than 5 minutes)
      const maxAge = 5 * 60 * 1000; // 5 minutes
      const age = Date.now() - message.timestamp;
      if (age > maxAge) {
        console.warn('Message too old:', age);
        return false;
      }
      
      // Verify signature
      const expectedSignature = this.createMessageSignature(message);
      return crypto.timingSafeEqual(
        Buffer.from(message.signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('Error verifying secure message:', error);
      return false;
    }
  }

  /**
   * Establish secure channel
   */
  async establishSecureChannel(clientId) {
    const channelKey = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
    
    const channel = {
      clientId,
      channelKey,
      createdAt: Date.now(),
      expiresAt,
      messageCount: 0
    };
    
    this.secureChannels.set(clientId, channel);
    
    return {
      channelId: clientId,
      channelKey,
      expiresAt
    };
  }

  /**
   * Rate limit check
   */
  async rateLimit(clientId, action) {
    const key = `${clientId}:${action}`;
    const now = Date.now();
    const windowSize = 60 * 1000; // 1 minute window
    const maxRequests = 100; // Max 100 requests per minute
    
    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, {
        count: 1,
        windowStart: now
      });
      return { allowed: true, remaining: maxRequests - 1 };
    }
    
    const limit = this.rateLimits.get(key);
    
    // Reset window if expired
    if (now - limit.windowStart > windowSize) {
      limit.count = 1;
      limit.windowStart = now;
      return { allowed: true, remaining: maxRequests - 1 };
    }
    
    // Check if limit exceeded
    if (limit.count >= maxRequests) {
      // Log security event
      await securityMonitoringService.logSecurityEvent({
        eventType: 'rate_limit_exceeded',
        clientId,
        action,
        details: { count: limit.count, windowStart: limit.windowStart },
        severity: 'medium'
      });
      
      return { allowed: false, remaining: 0, resetTime: limit.windowStart + windowSize };
    }
    
    limit.count++;
    return { allowed: true, remaining: maxRequests - limit.count };
  }

  /**
   * Process secure iframe message
   */
  async processSecureMessage(message, origin, clientId) {
    try {
      // 1. Validate origin
      if (!this.validateMessageOrigin(origin)) {
        await securityMonitoringService.logSecurityEvent({
          eventType: 'unauthorized_origin_message',
          clientId,
          details: { origin, messageType: message.type },
          severity: 'high'
        });
        throw new Error('Unauthorized origin');
      }
      
      // 2. Rate limit check
      const rateLimitResult = await this.rateLimit(clientId, message.type);
      if (!rateLimitResult.allowed) {
        throw new Error('Rate limit exceeded');
      }
      
      // 3. Verify message signature
      if (!this.verifySecureMessage(message)) {
        await securityMonitoringService.logSecurityEvent({
          eventType: 'invalid_message_signature',
          clientId,
          details: { messageType: message.type, origin },
          severity: 'high'
        });
        throw new Error('Invalid message signature');
      }
      
      return {
        success: true,
        message,
        rateLimitRemaining: rateLimitResult.remaining
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get secure channel info
   */
  getSecureChannel(clientId) {
    return this.secureChannels.get(clientId);
  }

  /**
   * Cleanup expired channels and rate limits
   */
  cleanup() {
    const now = Date.now();
    
    // Cleanup expired channels
    for (const [clientId, channel] of this.secureChannels.entries()) {
      if (now > channel.expiresAt) {
        this.secureChannels.delete(clientId);
      }
    }
    
    // Cleanup old rate limit entries
    const windowSize = 60 * 1000; // 1 minute
    for (const [key, limit] of this.rateLimits.entries()) {
      if (now - limit.windowStart > windowSize) {
        this.rateLimits.delete(key);
      }
    }
  }
}

module.exports = new SecureCommunicationService();