/**
 * Security monitoring and threat detection utilities
 */

import { authLogger, securityLogger } from './logger';
import { setAsync, getAsync, incrAsync, expireAsync } from '../../config/redisClient';

export interface SecurityEvent {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  ip: string;
  userAgent?: string;
  userId?: string;
  timestamp: Date;
  metadata?: any;
}

export interface ThreatScore {
  ip: string;
  score: number;
  reasons: string[];
  lastUpdated: Date;
}

/**
 * Security monitor class
 */
export class SecurityMonitor {
  private static instance: SecurityMonitor;
  private suspiciousIPs: Map<string, ThreatScore> = new Map();
  private maxThreatScore = 100;
  private blockThreshold = 80;

  private constructor() {}

  public static getInstance(): SecurityMonitor {
    if (!SecurityMonitor.instance) {
      SecurityMonitor.instance = new SecurityMonitor();
    }
    return SecurityMonitor.instance;
  }

  /**
   * Record a security event
   */
  public async recordSecurityEvent(event: SecurityEvent): Promise<void> {
    // Log the event
    securityLogger.warn(`Security Event: ${event.type}`, {
      ...event,
      category: 'security'
    });

    // Update threat score for IP
    await this.updateThreatScore(event.ip, event.type, event.severity);

    // Check if IP should be blocked
    const threatScore = await this.getThreatScore(event.ip);
    if (threatScore && threatScore.score >= this.blockThreshold) {
      await this.blockIP(event.ip, threatScore.reasons);
    }
  }

  /**
   * Update threat score for an IP
   */
  private async updateThreatScore(ip: string, eventType: string, severity: string): Promise<void> {
    const scoreIncrease = this.getScoreIncrease(eventType, severity);
    const key = `threat_score:${ip}`;
    
    try {
      // Get current score
      const currentData = await getAsync(key);
      let threatScore: ThreatScore;
      
      if (currentData) {
        threatScore = JSON.parse(currentData);
        threatScore.score = Math.min(this.maxThreatScore, threatScore.score + scoreIncrease);
        threatScore.reasons.push(`${eventType} (${severity})`);
        threatScore.lastUpdated = new Date();
      } else {
        threatScore = {
          ip,
          score: scoreIncrease,
          reasons: [`${eventType} (${severity})`],
          lastUpdated: new Date()
        };
      }

      // Store updated score with 24 hour expiration
      await setAsync(key, JSON.stringify(threatScore), 'EX', 24 * 60 * 60);
      
      // Update in-memory cache
      this.suspiciousIPs.set(ip, threatScore);
      
    } catch (error) {
      console.error('Failed to update threat score:', error);
    }
  }

  /**
   * Get score increase based on event type and severity
   */
  private getScoreIncrease(eventType: string, severity: string): number {
    const baseScores = {
      'failed_login': 10,
      'invalid_token': 5,
      'rate_limit_exceeded': 15,
      'suspicious_signature': 20,
      'blocked_user_attempt': 25,
      'invalid_wallet_format': 8,
      'timestamp_manipulation': 30,
      'multiple_failed_attempts': 20
    };

    const severityMultipliers = {
      'low': 1,
      'medium': 1.5,
      'high': 2,
      'critical': 3
    };

    const baseScore = baseScores[eventType] || 5;
    const multiplier = severityMultipliers[severity] || 1;
    
    return Math.round(baseScore * multiplier);
  }

  /**
   * Get threat score for an IP
   */
  public async getThreatScore(ip: string): Promise<ThreatScore | null> {
    try {
      const key = `threat_score:${ip}`;
      const data = await getAsync(key);
      
      if (data) {
        const threatScore = JSON.parse(data);
        this.suspiciousIPs.set(ip, threatScore);
        return threatScore;
      }
      
      return this.suspiciousIPs.get(ip) || null;
    } catch (error) {
      console.error('Failed to get threat score:', error);
      return null;
    }
  }

  /**
   * Block an IP address
   */
  private async blockIP(ip: string, reasons: string[]): Promise<void> {
    const key = `blocked_ip:${ip}`;
    const blockData = {
      ip,
      reasons,
      blockedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    };

    try {
      await setAsync(key, JSON.stringify(blockData), 'EX', 24 * 60 * 60);
      
      securityLogger.error(`IP blocked due to suspicious activity`, {
        ip,
        reasons,
        category: 'security',
        severity: 'critical'
      });
    } catch (error) {
      console.error('Failed to block IP:', error);
    }
  }

  /**
   * Check if an IP is blocked
   */
  public async isIPBlocked(ip: string): Promise<boolean> {
    try {
      const key = `blocked_ip:${ip}`;
      const data = await getAsync(key);
      return !!data;
    } catch (error) {
      console.error('Failed to check IP block status:', error);
      return false;
    }
  }

  /**
   * Record failed login attempt
   */
  public async recordFailedLogin(ip: string, userAgent?: string, userId?: string, reason?: string): Promise<void> {
    await this.recordSecurityEvent({
      type: 'failed_login',
      severity: 'medium',
      description: `Failed login attempt: ${reason || 'Invalid credentials'}`,
      ip,
      userAgent,
      userId,
      timestamp: new Date(),
      metadata: { reason }
    });
  }

  /**
   * Record rate limit exceeded
   */
  public async recordRateLimitExceeded(ip: string, endpoint: string, userAgent?: string): Promise<void> {
    await this.recordSecurityEvent({
      type: 'rate_limit_exceeded',
      severity: 'high',
      description: `Rate limit exceeded for endpoint: ${endpoint}`,
      ip,
      userAgent,
      timestamp: new Date(),
      metadata: { endpoint }
    });
  }

  /**
   * Record suspicious wallet activity
   */
  public async recordSuspiciousWalletActivity(ip: string, walletAddress: string, reason: string, userAgent?: string): Promise<void> {
    await this.recordSecurityEvent({
      type: 'suspicious_signature',
      severity: 'high',
      description: `Suspicious wallet activity: ${reason}`,
      ip,
      userAgent,
      timestamp: new Date(),
      metadata: { walletAddress, reason }
    });
  }

  /**
   * Record blocked user attempt
   */
  public async recordBlockedUserAttempt(ip: string, userId: string, userAgent?: string): Promise<void> {
    await this.recordSecurityEvent({
      type: 'blocked_user_attempt',
      severity: 'high',
      description: 'Blocked user attempted to access system',
      ip,
      userAgent,
      userId,
      timestamp: new Date()
    });
  }

  /**
   * Get security statistics
   */
  public getSecurityStats(): any {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recentThreats = Array.from(this.suspiciousIPs.values())
      .filter(threat => threat.lastUpdated > last24Hours);
    
    const highThreatIPs = recentThreats.filter(threat => threat.score >= this.blockThreshold);
    const mediumThreatIPs = recentThreats.filter(threat => threat.score >= 50 && threat.score < this.blockThreshold);
    
    return {
      totalSuspiciousIPs: recentThreats.length,
      highThreatIPs: highThreatIPs.length,
      mediumThreatIPs: mediumThreatIPs.length,
      blockedIPs: highThreatIPs.length,
      averageThreatScore: recentThreats.length > 0 
        ? recentThreats.reduce((sum, threat) => sum + threat.score, 0) / recentThreats.length 
        : 0
    };
  }

  /**
   * Clear threat data for an IP (admin function)
   */
  public async clearThreatData(ip: string): Promise<void> {
    try {
      const threatKey = `threat_score:${ip}`;
      const blockKey = `blocked_ip:${ip}`;
      
      await Promise.all([
        setAsync(threatKey, '', 'EX', 1),
        setAsync(blockKey, '', 'EX', 1)
      ]);
      
      this.suspiciousIPs.delete(ip);
      
      securityLogger.info(`Threat data cleared for IP: ${ip}`, {
        ip,
        category: 'security'
      });
    } catch (error) {
      console.error('Failed to clear threat data:', error);
    }
  }
}

/**
 * Security middleware to check for blocked IPs
 */
export async function securityMiddleware(req: any, res: any, next: any) {
  const monitor = SecurityMonitor.getInstance();
  const ip = req.ip || req.connection.remoteAddress;
  
  try {
    const isBlocked = await monitor.isIPBlocked(ip);
    
    if (isBlocked) {
      securityLogger.warn(`Blocked IP attempted access`, {
        ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        category: 'security'
      });
      
      return res.status(403).json({
        success: false,
        message: 'Access denied due to suspicious activity'
      });
    }
    
    next();
  } catch (error) {
    console.error('Security middleware error:', error);
    next(); // Continue on error to avoid blocking legitimate users
  }
}

// Export singleton instance
export const securityMonitor = SecurityMonitor.getInstance();