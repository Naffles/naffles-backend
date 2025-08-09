/**
 * Performance monitoring utilities for authentication system
 */

import { logger } from './logger';

export interface PerformanceMetrics {
  operation: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  metadata?: any;
}

/**
 * Performance monitor class
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics: number = 1000; // Keep last 1000 metrics

  private constructor() {}

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start timing an operation
   */
  public startTimer(operation: string): () => void {
    const startTime = process.hrtime.bigint();
    
    return (success: boolean = true, metadata?: any) => {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      
      this.recordMetric({
        operation,
        duration,
        timestamp: new Date(),
        success,
        metadata
      });
    };
  }

  /**
   * Record a performance metric
   */
  private recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Keep only the last N metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log slow operations
    if (metric.duration > 1000) { // Log operations taking more than 1 second
      logger.warn(`Slow operation detected: ${metric.operation}`, {
        duration: metric.duration,
        success: metric.success,
        metadata: metric.metadata
      });
    }

    // Log very slow operations as errors
    if (metric.duration > 5000) { // Log operations taking more than 5 seconds
      logger.error(`Very slow operation: ${metric.operation}`, {
        duration: metric.duration,
        success: metric.success,
        metadata: metric.metadata
      });
    }
  }

  /**
   * Get performance statistics
   */
  public getStats(operation?: string): any {
    const filteredMetrics = operation 
      ? this.metrics.filter(m => m.operation === operation)
      : this.metrics;

    if (filteredMetrics.length === 0) {
      return null;
    }

    const durations = filteredMetrics.map(m => m.duration);
    const successCount = filteredMetrics.filter(m => m.success).length;
    
    return {
      operation: operation || 'all',
      totalOperations: filteredMetrics.length,
      successRate: (successCount / filteredMetrics.length) * 100,
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      medianDuration: this.calculateMedian(durations),
      p95Duration: this.calculatePercentile(durations, 95),
      p99Duration: this.calculatePercentile(durations, 99)
    };
  }

  /**
   * Calculate median
   */
  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 
      ? sorted[mid] 
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Clear metrics
   */
  public clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get recent slow operations
   */
  public getSlowOperations(threshold: number = 1000, limit: number = 10): PerformanceMetrics[] {
    return this.metrics
      .filter(m => m.duration > threshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }
}

/**
 * Performance decorator for async functions
 */
export function measurePerformance(operation: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const monitor = PerformanceMonitor.getInstance();
      const endTimer = monitor.startTimer(`${target.constructor.name}.${operation}`);
      
      try {
        const result = await method.apply(this, args);
        endTimer(true, { args: args.length });
        return result;
      } catch (error) {
        endTimer(false, { error: error.message, args: args.length });
        throw error;
      }
    };
  };
}

/**
 * Middleware to measure request performance
 */
export function performanceMiddleware(req: any, res: any, next: any) {
  const monitor = PerformanceMonitor.getInstance();
  const endTimer = monitor.startTimer(`${req.method} ${req.path}`);
  
  // Override res.end to capture when response is sent
  const originalEnd = res.end;
  res.end = function (...args: any[]) {
    endTimer(res.statusCode < 400, {
      statusCode: res.statusCode,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    originalEnd.apply(res, args);
  };
  
  next();
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();