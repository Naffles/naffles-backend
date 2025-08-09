/**
 * Enhanced shared logging utility with authentication-specific logging
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogEntry {
  timestamp: string;
  level: string;
  service: string;
  message: string;
  data?: any;
  error?: Error;
  userId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  walletAddress?: string;
  authMethod?: string;
}

/**
 * Authentication event types
 */
export enum AuthEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  REGISTRATION = 'registration',
  PASSWORD_RESET = 'password_reset',
  WALLET_CONNECTED = 'wallet_connected',
  WALLET_DISCONNECTED = 'wallet_disconnected',
  SESSION_CREATED = 'session_created',
  SESSION_EXPIRED = 'session_expired',
  TOKEN_REFRESH = 'token_refresh',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity'
}

/**
 * Enhanced logger with structured logging
 */
class Logger {
  private static instance: Logger;
  private serviceName: string;
  private logLevel: LogLevel;
  private enableConsole: boolean;
  private enableFile: boolean;

  private constructor(
    serviceName: string = 'naffles-service',
    logLevel: LogLevel = LogLevel.INFO,
    enableConsole: boolean = true,
    enableFile: boolean = false
  ) {
    this.serviceName = serviceName;
    this.logLevel = logLevel;
    this.enableConsole = enableConsole;
    this.enableFile = enableFile;
  }

  public static getInstance(
    serviceName?: string,
    logLevel?: LogLevel,
    enableConsole?: boolean,
    enableFile?: boolean
  ): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(serviceName, logLevel, enableConsole, enableFile);
    }
    return Logger.instance;
  }

  /**
   * Create log entry
   */
  private createLogEntry(level: string, message: string, data?: any, error?: Error, context?: any): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      data,
      error,
      ...context
    };
  }

  /**
   * Format log entry for console output
   */
  private formatConsoleOutput(entry: LogEntry): string {
    const timestamp = entry.timestamp;
    const level = entry.level.toUpperCase().padEnd(5);
    const service = entry.service.padEnd(15);
    
    let output = `[${timestamp}] ${level} [${service}] ${entry.message}`;
    
    if (entry.data) {
      output += `\nData: ${JSON.stringify(entry.data, null, 2)}`;
    }
    
    if (entry.error) {
      output += `\nError: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\nStack: ${entry.error.stack}`;
      }
    }
    
    return output;
  }

  /**
   * Write log entry
   */
  private writeLog(level: LogLevel, levelName: string, message: string, data?: any, error?: Error, context?: any): void {
    if (level > this.logLevel) {
      return;
    }

    const entry = this.createLogEntry(levelName, message, data, error, context);

    if (this.enableConsole) {
      const output = this.formatConsoleOutput(entry);
      
      switch (level) {
        case LogLevel.ERROR:
          console.error(output);
          break;
        case LogLevel.WARN:
          console.warn(output);
          break;
        case LogLevel.INFO:
          console.info(output);
          break;
        case LogLevel.DEBUG:
          console.debug(output);
          break;
      }
    }

    // Enhanced file logging for authentication events
    if (this.enableFile && (context?.eventType || context?.category === 'auth')) {
      this.writeAuthLogToFile(entry);
    }
  }

  /**
   * Write authentication logs to file
   */
  private writeAuthLogToFile(entry: LogEntry): void {
    // In a production environment, this would write to a file
    // For now, we'll use console with special formatting
    console.log(`[AUTH-LOG] ${JSON.stringify(entry)}`);
  }

  /**
   * Log error message
   */
  public error(message: string, data?: any, error?: Error, context?: any): void {
    this.writeLog(LogLevel.ERROR, 'error', message, data, error, context);
  }

  /**
   * Log warning message
   */
  public warn(message: string, data?: any, context?: any): void {
    this.writeLog(LogLevel.WARN, 'warn', message, data, undefined, context);
  }

  /**
   * Log info message
   */
  public info(message: string, data?: any, context?: any): void {
    this.writeLog(LogLevel.INFO, 'info', message, data, undefined, context);
  }

  /**
   * Log debug message
   */
  public debug(message: string, data?: any, context?: any): void {
    this.writeLog(LogLevel.DEBUG, 'debug', message, data, undefined, context);
  }

  /**
   * Log authentication events
   */
  public logAuthEvent(eventType: AuthEventType, message: string, context: any = {}): void {
    this.info(`Auth Event: ${eventType} - ${message}`, context, {
      eventType,
      category: 'auth',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log security events
   */
  public logSecurityEvent(eventType: string, severity: 'low' | 'medium' | 'high' | 'critical', message: string, context: any = {}): void {
    this.warn(`Security Event: ${eventType} - ${message}`, context, {
      eventType,
      category: 'security',
      severity,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Authentication-specific logging methods
   */
  public loginSuccess(userId: string, method: string, context: any = {}): void {
    this.logAuthEvent(AuthEventType.LOGIN_SUCCESS, `User ${userId} logged in via ${method}`, {
      userId,
      authMethod: method,
      ...context
    });
  }

  public loginFailure(reason: string, context: any = {}): void {
    this.logAuthEvent(AuthEventType.LOGIN_FAILURE, `Login failed: ${reason}`, {
      reason,
      ...context
    });
  }

  public logout(userId: string, context: any = {}): void {
    this.logAuthEvent(AuthEventType.LOGOUT, `User ${userId} logged out`, {
      userId,
      ...context
    });
  }

  public registration(userId: string, method: string, context: any = {}): void {
    this.logAuthEvent(AuthEventType.REGISTRATION, `New user ${userId} registered via ${method}`, {
      userId,
      authMethod: method,
      ...context
    });
  }

  public walletConnected(userId: string, walletAddress: string, walletType: string, context: any = {}): void {
    this.logAuthEvent(AuthEventType.WALLET_CONNECTED, `Wallet connected for user ${userId}`, {
      userId,
      walletAddress,
      walletType,
      ...context
    });
  }

  public sessionCreated(userId: string, sessionId: string, context: any = {}): void {
    this.logAuthEvent(AuthEventType.SESSION_CREATED, `Session created for user ${userId}`, {
      userId,
      sessionId,
      ...context
    });
  }

  public rateLimitExceeded(endpoint: string, context: any = {}): void {
    this.logSecurityEvent('rate_limit_exceeded', 'medium', `Rate limit exceeded for ${endpoint}`, {
      endpoint,
      ...context
    });
  }

  public suspiciousActivity(reason: string, context: any = {}): void {
    this.logSecurityEvent('suspicious_activity', 'high', `Suspicious activity detected: ${reason}`, {
      reason,
      ...context
    });
  }

  /**
   * Set log level
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get current log level
   */
  public getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Set service name
   */
  public setServiceName(name: string): void {
    this.serviceName = name;
  }
}

// Create default logger instance
export const logger = Logger.getInstance();

// Create authentication-specific logger
export const authLogger = Logger.getInstance('naffles-auth', LogLevel.INFO, true, true);

// Create security logger
export const securityLogger = Logger.getInstance('naffles-security', LogLevel.INFO, true, true);

// Export logger class for custom instances
export { Logger };

// Make logger available globally
if (typeof global !== 'undefined') {
  (global as any).logger = logger;
  (global as any).authLogger = authLogger;
  (global as any).securityLogger = securityLogger;
}