const mongoose = require('mongoose');

const securityLogSchema = new mongoose.Schema({
  playerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  eventType: {
    type: String,
    required: true,
    enum: [
      'result_mismatch',
      'game_integrity_violation',
      'invalid_game_state',
      'unauthorized_origin',
      'unusual_win_rate',
      'rapid_actions',
      'unusual_betting_pattern',
      'suspicious_timing',
      'rate_limit_exceeded',
      'multiple_high_severity_events',
      'client_side_tampering',
      'invalid_signature',
      'session_timeout_abuse',
      'impossible_outcome'
    ],
    index: true
  },
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    index: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  sessionId: {
    type: String,
    index: true
  },
  ipAddress: {
    type: String,
    index: true
  },
  userAgent: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  investigated: {
    type: Boolean,
    default: false,
    index: true
  },
  investigatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  investigatedAt: {
    type: Date
  },
  resolution: {
    type: String,
    enum: ['false_positive', 'confirmed_threat', 'user_warned', 'user_suspended', 'system_updated']
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
securityLogSchema.index({ playerId: 1, timestamp: -1 });
securityLogSchema.index({ eventType: 1, timestamp: -1 });
securityLogSchema.index({ severity: 1, timestamp: -1 });
securityLogSchema.index({ investigated: 1, severity: -1 });

// TTL index to automatically delete old logs after 1 year
securityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

// Static methods
securityLogSchema.statics.getEventsByPlayer = function(playerId, timeRange = {}) {
  const query = { playerId };
  
  if (timeRange.start) {
    query.timestamp = { $gte: new Date(timeRange.start) };
  }
  if (timeRange.end) {
    query.timestamp = { ...query.timestamp, $lte: new Date(timeRange.end) };
  }
  
  return this.find(query).sort({ timestamp: -1 });
};

securityLogSchema.statics.getCriticalEvents = function(limit = 50) {
  return this.find({ severity: 'critical' })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('playerId', 'username email');
};

securityLogSchema.statics.getEventsByType = function(eventType, timeRange = {}) {
  const query = { eventType };
  
  if (timeRange.start) {
    query.timestamp = { $gte: new Date(timeRange.start) };
  }
  if (timeRange.end) {
    query.timestamp = { ...query.timestamp, $lte: new Date(timeRange.end) };
  }
  
  return this.find(query).sort({ timestamp: -1 });
};

securityLogSchema.statics.getSecuritySummary = async function(timeRange = {}) {
  const matchStage = {};
  
  if (timeRange.start || timeRange.end) {
    matchStage.timestamp = {};
    if (timeRange.start) matchStage.timestamp.$gte = new Date(timeRange.start);
    if (timeRange.end) matchStage.timestamp.$lte = new Date(timeRange.end);
  }

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalEvents: { $sum: 1 },
        eventsByType: {
          $push: {
            eventType: '$eventType',
            severity: '$severity'
          }
        },
        criticalCount: {
          $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] }
        },
        highCount: {
          $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] }
        },
        mediumCount: {
          $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] }
        },
        lowCount: {
          $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] }
        },
        uniquePlayers: { $addToSet: '$playerId' }
      }
    },
    {
      $project: {
        totalEvents: 1,
        criticalCount: 1,
        highCount: 1,
        mediumCount: 1,
        lowCount: 1,
        uniquePlayersCount: { $size: '$uniquePlayers' },
        eventsByType: 1
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result[0] || {
    totalEvents: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    uniquePlayersCount: 0,
    eventsByType: []
  };
};

// Instance methods
securityLogSchema.methods.markInvestigated = function(investigatorId, resolution, notes) {
  this.investigated = true;
  this.investigatedBy = investigatorId;
  this.investigatedAt = new Date();
  this.resolution = resolution;
  this.notes = notes;
  return this.save();
};

securityLogSchema.methods.isHighRisk = function() {
  return ['critical', 'high'].includes(this.severity);
};

securityLogSchema.methods.requiresImmedateAction = function() {
  const criticalEventTypes = [
    'result_mismatch',
    'game_integrity_violation',
    'client_side_tampering',
    'impossible_outcome'
  ];
  
  return this.severity === 'critical' || criticalEventTypes.includes(this.eventType);
};

// Pre-save middleware
securityLogSchema.pre('save', function(next) {
  // Ensure timestamp is set
  if (!this.timestamp) {
    this.timestamp = new Date();
  }
  
  // Auto-set severity based on event type if not provided
  if (!this.severity) {
    const severityMap = {
      'result_mismatch': 'critical',
      'game_integrity_violation': 'critical',
      'impossible_outcome': 'critical',
      'client_side_tampering': 'critical',
      'invalid_game_state': 'high',
      'unauthorized_origin': 'high',
      'unusual_win_rate': 'high',
      'rapid_actions': 'medium',
      'unusual_betting_pattern': 'medium',
      'suspicious_timing': 'medium',
      'rate_limit_exceeded': 'low'
    };
    
    this.severity = severityMap[this.eventType] || 'low';
  }
  
  next();
});

// Post-save middleware for alerting
securityLogSchema.post('save', async function(doc) {
  // Send immediate alerts for critical events
  if (doc.severity === 'critical') {
    console.error(`🚨 CRITICAL SECURITY EVENT: ${doc.eventType}`, {
      playerId: doc.playerId,
      details: doc.details,
      timestamp: doc.timestamp
    });
    
    // TODO: Implement actual alerting system (email, Slack, etc.)
  }
});

const SecurityLog = mongoose.model('SecurityLog', securityLogSchema);

module.exports = SecurityLog;