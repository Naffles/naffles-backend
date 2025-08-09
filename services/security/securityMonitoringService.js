const crypto = require('crypto');

/**
 * Security Monitoring Service
 * Monitors game integrity and detects suspicious activities
 */
class SecurityMonitoringService {
  constructor() {
    this.suspiciousActivityThresholds = {
      rapidActions: 5, // Max actions per 10 seconds
      highWinRate: 0.8, // 80% win rate threshold
      largeWinStreak: 10, // Consecutive wins
      unusualBettingPattern: 5 // Same bet amount 5+ times in a row
    };
    
    this.playerActivityCache = new Map();
    this.securityAlerts = [];
  }

  /**
   * Log security event
   */
  async logSecurityEvent(event) {
    const SecurityLog = require('../../models/security/securityLog');
    
    try {
      const securityLog = new SecurityLog({
        playerId: event.playerId,
        eventType: event.eventType,
        details: event.details,
        timestamp: new Date(),
        severity: event.severity || this.calculateSeverity(event.eventType),
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        sessionId: event.sessionId
      });

      await securityLog.save();

      // Check if this triggers an alert
      await this.checkForSecurityAlerts(event);

      console.log(`Security event logged: ${event.eventType} for player ${event.playerId}`);
      return securityLog;
    } catch (error) {
      console.error('Error logging security event:', error);
      throw error;
    }
  }

  /**
   * Detect suspicious activity patterns
   */
  async detectSuspiciousActivity(playerId, actions) {
    const playerActivity = this.getPlayerActivity(playerId);
    const suspiciousActivities = [];

    // Check for rapid actions
    const rapidActions = this.detectRapidActions(actions);
    if (rapidActions.isSuspicious) {
      suspiciousActivities.push({
        type: 'rapid_actions',
        severity: 'medium',
        details: rapidActions
      });
    }

    // Check win rate patterns
    const winRateAnalysis = await this.analyzeWinRate(playerId);
    if (winRateAnalysis.isSuspicious) {
      suspiciousActivities.push({
        type: 'unusual_win_rate',
        severity: 'high',
        details: winRateAnalysis
      });
    }

    // Check betting patterns
    const bettingPattern = this.analyzeBettingPattern(actions);
    if (bettingPattern.isSuspicious) {
      suspiciousActivities.push({
        type: 'unusual_betting_pattern',
        severity: 'medium',
        details: bettingPattern
      });
    }

    // Update player activity cache
    this.updatePlayerActivity(playerId, actions);

    return {
      playerId,
      suspiciousActivities,
      riskScore: this.calculateRiskScore(suspiciousActivities),
      timestamp: new Date()
    };
  }

  /**
   * Monitor game integrity
   */
  async monitorGameIntegrity(sessionId) {
    try {
      const GameSession = require('../../models/game/gameSession');
      const session = await GameSession.findById(sessionId);
      
      if (!session) {
        return { status: 'error', message: 'Session not found' };
      }

      const integrityChecks = [];

      // Check game state signature
      const signatureValid = this.verifyGameStateSignature(session.gameState);
      integrityChecks.push({
        check: 'signature_verification',
        passed: signatureValid,
        details: signatureValid ? 'Valid signature' : 'Invalid signature detected'
      });

      // Check session timing
      const timingCheck = this.checkSessionTiming(session);
      integrityChecks.push({
        check: 'session_timing',
        passed: timingCheck.isValid,
        details: timingCheck.details
      });

      // Check for impossible outcomes
      const outcomeCheck = this.checkGameOutcome(session);
      integrityChecks.push({
        check: 'outcome_validation',
        passed: outcomeCheck.isValid,
        details: outcomeCheck.details
      });

      const overallIntegrity = integrityChecks.every(check => check.passed);

      if (!overallIntegrity) {
        await this.logSecurityEvent({
          playerId: session.playerId,
          eventType: 'game_integrity_violation',
          severity: 'critical',
          sessionId,
          details: { integrityChecks }
        });
      }

      return {
        sessionId,
        overallIntegrity,
        integrityChecks,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error monitoring game integrity:', error);
      throw error;
    }
  }

  /**
   * Generate security report
   */
  async generateSecurityReport(timeRange) {
    try {
      const SecurityLog = require('../../models/security/securityLog');
      
      const startDate = new Date(timeRange.start);
      const endDate = new Date(timeRange.end);

      // Get security events in time range
      const securityEvents = await SecurityLog.find({
        timestamp: { $gte: startDate, $lte: endDate }
      }).sort({ timestamp: -1 });

      // Aggregate statistics
      const eventsByType = {};
      const eventsBySeverity = {};
      const playerEvents = {};

      securityEvents.forEach(event => {
        // By type
        eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
        
        // By severity
        eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
        
        // By player
        if (!playerEvents[event.playerId]) {
          playerEvents[event.playerId] = [];
        }
        playerEvents[event.playerId].push(event);
      });

      // Identify high-risk players
      const highRiskPlayers = Object.entries(playerEvents)
        .filter(([playerId, events]) => events.length > 5 || events.some(e => e.severity === 'critical'))
        .map(([playerId, events]) => ({
          playerId,
          eventCount: events.length,
          highestSeverity: this.getHighestSeverity(events),
          recentEvents: events.slice(0, 5)
        }));

      return {
        timeRange: { startDate, endDate },
        summary: {
          totalEvents: securityEvents.length,
          eventsByType,
          eventsBySeverity,
          uniquePlayersAffected: Object.keys(playerEvents).length
        },
        highRiskPlayers,
        recentCriticalEvents: securityEvents.filter(e => e.severity === 'critical').slice(0, 10),
        recommendations: this.generateSecurityRecommendations(securityEvents)
      };
    } catch (error) {
      console.error('Error generating security report:', error);
      throw error;
    }
  }

  /**
   * Alert security team
   */
  async alertSecurityTeam(eventType, details) {
    const alert = {
      id: crypto.randomBytes(8).toString('hex'),
      eventType,
      details,
      timestamp: new Date(),
      severity: this.calculateSeverity(eventType),
      status: 'active'
    };

    this.securityAlerts.push(alert);

    // Log the alert
    console.error(`🚨 SECURITY ALERT: ${eventType}`, details);

    // TODO: Implement actual alerting (email, Slack, etc.)
    // For now, just log to console and store in memory

    return alert;
  }

  /**
   * Detect rapid actions
   */
  detectRapidActions(actions) {
    if (actions.length < 2) {
      return { isSuspicious: false };
    }

    const recentActions = actions.slice(-10); // Last 10 actions
    const timeWindow = 10000; // 10 seconds
    const now = Date.now();

    const rapidActions = recentActions.filter(action => 
      now - new Date(action.timestamp).getTime() < timeWindow
    );

    const isSuspicious = rapidActions.length > this.suspiciousActivityThresholds.rapidActions;

    return {
      isSuspicious,
      actionCount: rapidActions.length,
      timeWindow: timeWindow / 1000,
      threshold: this.suspiciousActivityThresholds.rapidActions
    };
  }

  /**
   * Analyze win rate patterns
   */
  async analyzeWinRate(playerId) {
    try {
      const GameSession = require('../../models/game/gameSession');
      
      // Get recent completed games
      const recentGames = await GameSession.find({
        playerId,
        status: 'completed',
        completedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      }).sort({ completedAt: -1 }).limit(20);

      if (recentGames.length < 10) {
        return { isSuspicious: false, reason: 'Insufficient data' };
      }

      const wins = recentGames.filter(game => 
        game.result && game.result.outcome === 'win'
      ).length;

      const winRate = wins / recentGames.length;
      const isSuspicious = winRate > this.suspiciousActivityThresholds.highWinRate;

      // Check for win streaks
      let currentStreak = 0;
      let maxStreak = 0;
      
      for (const game of recentGames) {
        if (game.result && game.result.outcome === 'win') {
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
      }

      const hasLongWinStreak = maxStreak >= this.suspiciousActivityThresholds.largeWinStreak;

      return {
        isSuspicious: isSuspicious || hasLongWinStreak,
        winRate,
        gamesAnalyzed: recentGames.length,
        wins,
        maxWinStreak: maxStreak,
        thresholds: {
          winRate: this.suspiciousActivityThresholds.highWinRate,
          winStreak: this.suspiciousActivityThresholds.largeWinStreak
        }
      };
    } catch (error) {
      console.error('Error analyzing win rate:', error);
      return { isSuspicious: false, error: error.message };
    }
  }

  /**
   * Analyze betting patterns
   */
  analyzeBettingPattern(actions) {
    if (actions.length < 5) {
      return { isSuspicious: false };
    }

    const betAmounts = actions
      .filter(action => action.type === 'bet_placed')
      .map(action => action.betAmount)
      .slice(-10); // Last 10 bets

    if (betAmounts.length < 5) {
      return { isSuspicious: false };
    }

    // Check for repeated bet amounts
    const amountCounts = {};
    betAmounts.forEach(amount => {
      amountCounts[amount] = (amountCounts[amount] || 0) + 1;
    });

    const maxRepeats = Math.max(...Object.values(amountCounts));
    const isSuspicious = maxRepeats >= this.suspiciousActivityThresholds.unusualBettingPattern;

    return {
      isSuspicious,
      maxRepeats,
      threshold: this.suspiciousActivityThresholds.unusualBettingPattern,
      betAmounts,
      amountCounts
    };
  }

  /**
   * Calculate risk score
   */
  calculateRiskScore(suspiciousActivities) {
    let score = 0;
    
    suspiciousActivities.forEach(activity => {
      switch (activity.severity) {
        case 'critical': score += 100; break;
        case 'high': score += 50; break;
        case 'medium': score += 25; break;
        case 'low': score += 10; break;
      }
    });

    return Math.min(score, 100); // Cap at 100
  }

  /**
   * Calculate event severity
   */
  calculateSeverity(eventType) {
    const severityMap = {
      'result_mismatch': 'critical',
      'game_integrity_violation': 'critical',
      'invalid_game_state': 'high',
      'unauthorized_origin': 'high',
      'unusual_win_rate': 'high',
      'rapid_actions': 'medium',
      'unusual_betting_pattern': 'medium',
      'suspicious_timing': 'medium',
      'rate_limit_exceeded': 'low'
    };

    return severityMap[eventType] || 'low';
  }

  /**
   * Verify game state signature
   */
  verifyGameStateSignature(signedGameState) {
    const gameSecurityService = require('./gameSecurityService');
    return gameSecurityService.verifyGameStateSignature(signedGameState);
  }

  /**
   * Check session timing
   */
  checkSessionTiming(session) {
    const createdAt = new Date(session.createdAt);
    const completedAt = session.completedAt ? new Date(session.completedAt) : new Date();
    const duration = completedAt - createdAt;

    // Games should take at least 1 second and at most 30 minutes
    const minDuration = 1000; // 1 second
    const maxDuration = 30 * 60 * 1000; // 30 minutes

    const isValid = duration >= minDuration && duration <= maxDuration;

    return {
      isValid,
      duration,
      details: isValid ? 'Normal timing' : `Unusual duration: ${duration}ms`
    };
  }

  /**
   * Check game outcome validity
   */
  checkGameOutcome(session) {
    if (!session.result) {
      return { isValid: true, details: 'No result to validate' };
    }

    // Basic outcome validation
    const validOutcomes = ['win', 'lose', 'draw'];
    const isValidOutcome = validOutcomes.includes(session.result.outcome);

    if (!isValidOutcome) {
      return { isValid: false, details: `Invalid outcome: ${session.result.outcome}` };
    }

    // Check win amount logic
    const betAmount = parseFloat(session.betAmount);
    const winAmount = parseFloat(session.result.winAmount || '0');

    let expectedWinAmount = 0;
    switch (session.result.outcome) {
      case 'win':
        expectedWinAmount = betAmount * 2; // Standard 1:1 payout
        break;
      case 'draw':
        expectedWinAmount = betAmount; // Return bet
        break;
      case 'lose':
        expectedWinAmount = 0;
        break;
    }

    // Allow for blackjack 2.5x payout
    const isValidWinAmount = winAmount === expectedWinAmount || 
      (session.gameType === 'blackjack' && winAmount === betAmount * 2.5);

    return {
      isValid: isValidWinAmount,
      details: isValidWinAmount ? 'Valid win amount' : `Invalid win amount: expected ${expectedWinAmount}, got ${winAmount}`
    };
  }

  /**
   * Get player activity from cache
   */
  getPlayerActivity(playerId) {
    if (!this.playerActivityCache.has(playerId)) {
      this.playerActivityCache.set(playerId, {
        actions: [],
        firstSeen: new Date(),
        lastSeen: new Date()
      });
    }
    return this.playerActivityCache.get(playerId);
  }

  /**
   * Update player activity cache
   */
  updatePlayerActivity(playerId, actions) {
    const activity = this.getPlayerActivity(playerId);
    activity.actions = [...activity.actions, ...actions].slice(-50); // Keep last 50 actions
    activity.lastSeen = new Date();
  }

  /**
   * Get highest severity from events
   */
  getHighestSeverity(events) {
    const severityOrder = ['critical', 'high', 'medium', 'low'];
    
    for (const severity of severityOrder) {
      if (events.some(event => event.severity === severity)) {
        return severity;
      }
    }
    
    return 'low';
  }

  /**
   * Generate security recommendations
   */
  generateSecurityRecommendations(securityEvents) {
    const recommendations = [];
    
    const criticalEvents = securityEvents.filter(e => e.severity === 'critical');
    if (criticalEvents.length > 0) {
      recommendations.push({
        priority: 'high',
        action: 'Investigate critical security events immediately',
        details: `${criticalEvents.length} critical events detected`
      });
    }

    const resultMismatches = securityEvents.filter(e => e.eventType === 'result_mismatch');
    if (resultMismatches.length > 0) {
      recommendations.push({
        priority: 'critical',
        action: 'Review game result verification system',
        details: `${resultMismatches.length} result mismatches detected`
      });
    }

    const rapidActions = securityEvents.filter(e => e.eventType === 'rapid_actions');
    if (rapidActions.length > 10) {
      recommendations.push({
        priority: 'medium',
        action: 'Consider implementing stricter rate limiting',
        details: `${rapidActions.length} rapid action events detected`
      });
    }

    return recommendations;
  }

  /**
   * Check for security alerts
   */
  async checkForSecurityAlerts(event) {
    // Critical events trigger immediate alerts
    if (event.severity === 'critical') {
      await this.alertSecurityTeam(event.eventType, event.details);
    }

    // Multiple high-severity events from same player
    if (event.severity === 'high') {
      const SecurityLog = require('../../models/security/securityLog');
      const recentHighEvents = await SecurityLog.countDocuments({
        playerId: event.playerId,
        severity: 'high',
        timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
      });

      if (recentHighEvents >= 3) {
        await this.alertSecurityTeam('multiple_high_severity_events', {
          playerId: event.playerId,
          eventCount: recentHighEvents,
          latestEvent: event
        });
      }
    }
  }
}

module.exports = new SecurityMonitoringService();