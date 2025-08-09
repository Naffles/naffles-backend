const UserPromotion = require('../../models/promotions/userPromotion');
const BonusCreditsBalance = require('../../models/promotions/bonusCreditsBalance');
const ActivityTracker = require('../../models/promotions/activityTracker');
const User = require('../../models/user/user');

class FraudPreventionService {
  constructor() {
    this.suspiciousPatterns = {
      rapidUsage: {
        threshold: 10, // More than 10 uses in 1 hour
        timeWindow: 60 * 60 * 1000 // 1 hour in milliseconds
      },
      unusualTiming: {
        maxVariance: 1000, // Less than 1 second variance indicates bot behavior
        minSamples: 5
      },
      multipleAccounts: {
        ipThreshold: 5, // More than 5 accounts from same IP
        deviceThreshold: 3 // More than 3 accounts from same device
      },
      bonusAbuse: {
        maxBonusPerDay: 1000, // Maximum bonus credits per day
        maxPromotionsPerUser: 10 // Maximum active promotions per user
      }
    };
  }

  /**
   * Analyze user promotion usage patterns for fraud
   */
  async analyzePromotionUsage(userId, promotionId = null) {
    try {
      const analysisResults = {
        userId,
        riskScore: 0,
        riskLevel: 'low',
        flags: [],
        recommendations: []
      };
      
      // Get user's promotion usage history
      const query = { userId };
      if (promotionId) query.promotionId = promotionId;
      
      const userPromotions = await UserPromotion.find(query)
        .populate('promotionId')
        .sort({ createdAt: -1 });
      
      if (userPromotions.length === 0) {
        return analysisResults;
      }
      
      // Analyze rapid usage patterns
      await this.checkRapidUsagePattern(userPromotions, analysisResults);
      
      // Analyze timing patterns
      await this.checkTimingPatterns(userPromotions, analysisResults);
      
      // Analyze bonus credits abuse
      await this.checkBonusCreditsAbuse(userId, analysisResults);
      
      // Analyze multiple account indicators
      await this.checkMultipleAccountIndicators(userId, analysisResults);
      
      // Analyze activity patterns
      await this.checkActivityPatterns(userId, analysisResults);
      
      // Calculate overall risk score and level
      this.calculateRiskScore(analysisResults);
      
      // Generate recommendations
      this.generateRecommendations(analysisResults);
      
      // Log analysis if high risk
      if (analysisResults.riskLevel === 'high') {
        console.warn(`High risk user detected: ${userId}`, analysisResults);
        await this.createSecurityAlert(userId, analysisResults);
      }
      
      return analysisResults;
    } catch (error) {
      console.error('Error analyzing promotion usage:', error);
      throw error;
    }
  }

  /**
   * Check for rapid usage patterns
   */
  async checkRapidUsagePattern(userPromotions, analysisResults) {
    const now = new Date();
    const timeWindow = this.suspiciousPatterns.rapidUsage.timeWindow;
    const threshold = this.suspiciousPatterns.rapidUsage.threshold;
    
    // Count recent usage
    let recentUsage = 0;
    for (const userPromotion of userPromotions) {
      for (const usage of userPromotion.usageHistory) {
        if (now - usage.usedAt.getTime() < timeWindow) {
          recentUsage++;
        }
      }
    }
    
    if (recentUsage > threshold) {
      analysisResults.flags.push({
        type: 'rapid_usage',
        severity: 'high',
        description: `${recentUsage} promotion uses in the last hour (threshold: ${threshold})`,
        data: { recentUsage, threshold, timeWindow }
      });
      analysisResults.riskScore += 30;
    }
  }

  /**
   * Check for suspicious timing patterns
   */
  async checkTimingPatterns(userPromotions, analysisResults) {
    const allUsages = [];
    
    for (const userPromotion of userPromotions) {
      for (const usage of userPromotion.usageHistory) {
        allUsages.push(usage.usedAt);
      }
    }
    
    if (allUsages.length < this.suspiciousPatterns.unusualTiming.minSamples) {
      return;
    }
    
    // Sort by time
    allUsages.sort((a, b) => a - b);
    
    // Calculate intervals between usages
    const intervals = [];
    for (let i = 1; i < allUsages.length; i++) {
      intervals.push(allUsages[i] - allUsages[i-1]);
    }
    
    // Calculate variance
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    
    if (variance < this.suspiciousPatterns.unusualTiming.maxVariance) {
      analysisResults.flags.push({
        type: 'suspicious_timing',
        severity: 'medium',
        description: `Activities occurring at suspiciously regular intervals (variance: ${Math.round(variance)}ms)`,
        data: { variance, avgInterval: Math.round(avgInterval), intervals: intervals.length }
      });
      analysisResults.riskScore += 20;
    }
  }

  /**
   * Check for bonus credits abuse
   */
  async checkBonusCreditsAbuse(userId, analysisResults) {
    const bonusBalance = await BonusCreditsBalance.findOne({ userId });
    
    if (!bonusBalance) return;
    
    // Check daily bonus accumulation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaysBonuses = bonusBalance.expiryEntries.filter(entry => 
      entry.awardedAt >= today && entry.status === 'active'
    );
    
    const totalBonusToday = todaysBonuses.reduce((sum, entry) => sum + entry.amount, 0);
    
    if (totalBonusToday > this.suspiciousPatterns.bonusAbuse.maxBonusPerDay) {
      analysisResults.flags.push({
        type: 'excessive_bonus',
        severity: 'high',
        description: `Received ${totalBonusToday} bonus credits today (limit: ${this.suspiciousPatterns.bonusAbuse.maxBonusPerDay})`,
        data: { totalBonusToday, limit: this.suspiciousPatterns.bonusAbuse.maxBonusPerDay }
      });
      analysisResults.riskScore += 25;
    }
    
    // Check total active promotions
    const activePromotions = await UserPromotion.countDocuments({
      userId,
      status: 'active'
    });
    
    if (activePromotions > this.suspiciousPatterns.bonusAbuse.maxPromotionsPerUser) {
      analysisResults.flags.push({
        type: 'excessive_promotions',
        severity: 'medium',
        description: `Has ${activePromotions} active promotions (limit: ${this.suspiciousPatterns.bonusAbuse.maxPromotionsPerUser})`,
        data: { activePromotions, limit: this.suspiciousPatterns.bonusAbuse.maxPromotionsPerUser }
      });
      analysisResults.riskScore += 15;
    }
  }

  /**
   * Check for multiple account indicators
   */
  async checkMultipleAccountIndicators(userId, analysisResults) {
    const user = await User.findById(userId).lean();
    if (!user) return;
    
    // This would require additional user tracking data (IP addresses, device fingerprints)
    // For now, we'll check for similar wallet patterns or registration patterns
    
    // Check for users with similar wallet addresses (same first/last characters)
    if (user.walletAddresses && user.walletAddresses.length > 0) {
      const primaryWallet = user.walletAddresses[0];
      const walletPattern = primaryWallet.substring(0, 4) + '*' + primaryWallet.substring(-4);
      
      // This is a simplified check - in production, you'd want more sophisticated analysis
      const similarUsers = await User.countDocuments({
        _id: { $ne: userId },
        walletAddresses: {
          $elemMatch: {
            $regex: `^${primaryWallet.substring(0, 2)}.*${primaryWallet.substring(-2)}$`
          }
        }
      });
      
      if (similarUsers > 2) {
        analysisResults.flags.push({
          type: 'similar_wallets',
          severity: 'medium',
          description: `Found ${similarUsers} users with similar wallet patterns`,
          data: { similarUsers, walletPattern }
        });
        analysisResults.riskScore += 10;
      }
    }
    
    // Check for rapid account creation patterns
    const recentUsers = await User.countDocuments({
      createdAt: {
        $gte: new Date(user.createdAt.getTime() - 24 * 60 * 60 * 1000), // 24 hours before
        $lte: new Date(user.createdAt.getTime() + 24 * 60 * 60 * 1000)  // 24 hours after
      }
    });
    
    if (recentUsers > 10) {
      analysisResults.flags.push({
        type: 'rapid_registration',
        severity: 'low',
        description: `${recentUsers} accounts created within 48 hours of this user`,
        data: { recentUsers, registrationDate: user.createdAt }
      });
      analysisResults.riskScore += 5;
    }
  }

  /**
   * Check activity patterns for bot-like behavior
   */
  async checkActivityPatterns(userId, analysisResults) {
    const activityTracker = await ActivityTracker.findOne({ userId });
    
    if (!activityTracker) return;
    
    // Check for bot-like activity patterns
    for (const period of activityTracker.trackingPeriods) {
      if (period.status !== 'active') continue;
      
      // Check for perfect activity completion (suspicious)
      const totalActivities = Object.values(period.activities).reduce((sum, activity) => sum + activity.count, 0);
      
      if (totalActivities > 100) { // High activity user
        // Check if activities are too evenly distributed (bot-like)
        const activityCounts = Object.values(period.activities).map(a => a.count);
        const avgActivity = activityCounts.reduce((sum, count) => sum + count, 0) / activityCounts.length;
        const variance = activityCounts.reduce((sum, count) => sum + Math.pow(count - avgActivity, 2), 0) / activityCounts.length;
        
        if (variance < avgActivity * 0.1) { // Very low variance relative to average
          analysisResults.flags.push({
            type: 'uniform_activity',
            severity: 'medium',
            description: 'Activity distribution is suspiciously uniform across all types',
            data: { totalActivities, variance, avgActivity }
          });
          analysisResults.riskScore += 15;
        }
      }
    }
    
    // Check fraud indicators from activity tracker
    const unresolvedFraudIndicators = activityTracker.fraudIndicators.filter(indicator => !indicator.resolved);
    
    if (unresolvedFraudIndicators.length > 0) {
      for (const indicator of unresolvedFraudIndicators) {
        analysisResults.flags.push({
          type: 'activity_fraud_indicator',
          severity: indicator.severity,
          description: indicator.description,
          data: { indicatorType: indicator.indicatorType, detectedAt: indicator.detectedAt }
        });
        
        const scoreIncrease = indicator.severity === 'high' ? 20 : indicator.severity === 'medium' ? 10 : 5;
        analysisResults.riskScore += scoreIncrease;
      }
    }
  }

  /**
   * Calculate overall risk score and level
   */
  calculateRiskScore(analysisResults) {
    // Risk score is already accumulated, now determine level
    if (analysisResults.riskScore >= 50) {
      analysisResults.riskLevel = 'high';
    } else if (analysisResults.riskScore >= 25) {
      analysisResults.riskLevel = 'medium';
    } else {
      analysisResults.riskLevel = 'low';
    }
    
    // Cap risk score at 100
    analysisResults.riskScore = Math.min(100, analysisResults.riskScore);
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysisResults) {
    const recommendations = [];
    
    for (const flag of analysisResults.flags) {
      switch (flag.type) {
        case 'rapid_usage':
          recommendations.push('Implement rate limiting for this user');
          recommendations.push('Require manual approval for future promotions');
          break;
        case 'suspicious_timing':
          recommendations.push('Flag for manual review');
          recommendations.push('Implement CAPTCHA verification');
          break;
        case 'excessive_bonus':
          recommendations.push('Temporarily suspend bonus credit awards');
          recommendations.push('Review recent deposit transactions');
          break;
        case 'excessive_promotions':
          recommendations.push('Limit active promotions per user');
          recommendations.push('Review promotion assignment criteria');
          break;
        case 'similar_wallets':
          recommendations.push('Investigate potential multiple accounts');
          recommendations.push('Cross-reference with KYC data if available');
          break;
        case 'uniform_activity':
          recommendations.push('Implement behavioral analysis');
          recommendations.push('Require additional verification');
          break;
      }
    }
    
    // Remove duplicates
    analysisResults.recommendations = [...new Set(recommendations)];
  }

  /**
   * Create security alert for high-risk users
   */
  async createSecurityAlert(userId, analysisResults) {
    try {
      // This would integrate with your alerting system
      const alert = {
        type: 'promotion_fraud_risk',
        userId,
        riskLevel: analysisResults.riskLevel,
        riskScore: analysisResults.riskScore,
        flags: analysisResults.flags,
        recommendations: analysisResults.recommendations,
        createdAt: new Date(),
        status: 'open'
      };
      
      // Log to console for now (in production, send to monitoring system)
      console.warn('SECURITY ALERT - Promotion Fraud Risk:', alert);
      
      // You could save this to a SecurityAlert model or send to external monitoring
      return alert;
    } catch (error) {
      console.error('Error creating security alert:', error);
    }
  }

  /**
   * Flag user promotion for fraud
   */
  async flagUserPromotionForFraud(userPromotionId, flagData) {
    try {
      const {
        flagType,
        description,
        flaggedBy = 'system',
        severity = 'medium'
      } = flagData;
      
      const userPromotion = await UserPromotion.findById(userPromotionId);
      if (!userPromotion) {
        throw new Error('User promotion not found');
      }
      
      await userPromotion.flagForFraud(flagType, description, flaggedBy);
      
      // If high severity, also run full analysis
      if (severity === 'high') {
        await this.analyzePromotionUsage(userPromotion.userId, userPromotion.promotionId);
      }
      
      console.log(`Flagged user promotion ${userPromotionId} for fraud: ${flagType}`);
      
      return {
        success: true,
        userPromotionId,
        flagType,
        description,
        flaggedBy,
        flaggedAt: new Date()
      };
    } catch (error) {
      console.error('Error flagging user promotion for fraud:', error);
      throw error;
    }
  }

  /**
   * Resolve fraud flag
   */
  async resolveFraudFlag(userPromotionId, flagId, resolutionData) {
    try {
      const {
        resolvedBy,
        resolution,
        notes
      } = resolutionData;
      
      const userPromotion = await UserPromotion.findById(userPromotionId);
      if (!userPromotion) {
        throw new Error('User promotion not found');
      }
      
      const flag = userPromotion.fraudFlags.id(flagId);
      if (!flag) {
        throw new Error('Fraud flag not found');
      }
      
      flag.resolved = true;
      flag.resolvedAt = new Date();
      flag.resolvedBy = resolvedBy;
      flag.resolution = resolution;
      flag.notes = notes;
      
      await userPromotion.save();
      
      console.log(`Resolved fraud flag ${flagId} for user promotion ${userPromotionId}`);
      
      return {
        success: true,
        flagId,
        resolution,
        resolvedBy,
        resolvedAt: flag.resolvedAt
      };
    } catch (error) {
      console.error('Error resolving fraud flag:', error);
      throw error;
    }
  }

  /**
   * Get fraud statistics
   */
  async getFraudStatistics(options = {}) {
    try {
      const {
        startDate,
        endDate,
        riskLevel
      } = options;
      
      // Build date filter
      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);
      
      // Get fraud flags statistics
      const fraudFlagsStats = await UserPromotion.aggregate([
        { $unwind: '$fraudFlags' },
        ...(Object.keys(dateFilter).length > 0 ? [{ $match: { 'fraudFlags.flaggedAt': dateFilter } }] : []),
        {
          $group: {
            _id: '$fraudFlags.flagType',
            count: { $sum: 1 },
            resolved: {
              $sum: {
                $cond: ['$fraudFlags.resolved', 1, 0]
              }
            },
            unresolved: {
              $sum: {
                $cond: ['$fraudFlags.resolved', 0, 1]
              }
            }
          }
        }
      ]);
      
      // Get users with fraud flags
      const usersWithFlags = await UserPromotion.distinct('userId', {
        'fraudFlags.0': { $exists: true },
        ...(Object.keys(dateFilter).length > 0 ? { 'fraudFlags.flaggedAt': dateFilter } : {})
      });
      
      // Get activity tracker fraud indicators
      const activityFraudStats = await ActivityTracker.aggregate([
        { $unwind: '$fraudIndicators' },
        ...(Object.keys(dateFilter).length > 0 ? [{ $match: { 'fraudIndicators.detectedAt': dateFilter } }] : []),
        {
          $group: {
            _id: '$fraudIndicators.indicatorType',
            count: { $sum: 1 },
            bySeverity: {
              $push: '$fraudIndicators.severity'
            }
          }
        }
      ]);
      
      return {
        fraudFlags: {
          byType: fraudFlagsStats,
          totalUsers: usersWithFlags.length,
          totalFlags: fraudFlagsStats.reduce((sum, stat) => sum + stat.count, 0),
          resolvedFlags: fraudFlagsStats.reduce((sum, stat) => sum + stat.resolved, 0),
          unresolvedFlags: fraudFlagsStats.reduce((sum, stat) => sum + stat.unresolved, 0)
        },
        activityFraud: {
          byType: activityFraudStats,
          totalIndicators: activityFraudStats.reduce((sum, stat) => sum + stat.count, 0)
        },
        calculatedAt: new Date()
      };
    } catch (error) {
      console.error('Error getting fraud statistics:', error);
      throw error;
    }
  }

  /**
   * Batch analyze users for fraud
   */
  async batchAnalyzeUsers(userIds, options = {}) {
    try {
      const { concurrency = 5 } = options;
      const results = [];
      
      // Process users in batches to avoid overwhelming the system
      for (let i = 0; i < userIds.length; i += concurrency) {
        const batch = userIds.slice(i, i + concurrency);
        
        const batchPromises = batch.map(userId => 
          this.analyzePromotionUsage(userId).catch(error => ({
            userId,
            error: error.message,
            riskScore: 0,
            riskLevel: 'unknown'
          }))
        );
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }
      
      // Summarize results
      const summary = {
        totalAnalyzed: results.length,
        highRisk: results.filter(r => r.riskLevel === 'high').length,
        mediumRisk: results.filter(r => r.riskLevel === 'medium').length,
        lowRisk: results.filter(r => r.riskLevel === 'low').length,
        errors: results.filter(r => r.error).length,
        averageRiskScore: results.reduce((sum, r) => sum + (r.riskScore || 0), 0) / results.length
      };
      
      return {
        results,
        summary,
        analyzedAt: new Date()
      };
    } catch (error) {
      console.error('Error in batch user analysis:', error);
      throw error;
    }
  }

  /**
   * Set custom fraud detection patterns
   */
  setFraudPatterns(patterns) {
    this.suspiciousPatterns = { ...this.suspiciousPatterns, ...patterns };
  }

  /**
   * Get current fraud detection patterns
   */
  getFraudPatterns() {
    return this.suspiciousPatterns;
  }
}

module.exports = FraudPreventionService;