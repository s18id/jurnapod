// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * POS Performance Monitor
 * 
 * Monitors and validates POS performance metrics against SLO targets:
 * - Payment capture p95 < 1s
 * - Payment capture p99 < 2s
 * - Offline commit p95 < 100ms
 * - Sync success rate > 99%
 */

import type { PosOfflineDb } from "@jurnapod/offline-db/dexie";

export interface PerformanceThresholds {
  paymentCaptureP95: number; // ms
  paymentCaptureP99: number; // ms
  offlineCommitP95: number; // ms
  syncSuccessRate: number; // percent
  queueDrainTime: number; // ms
}

export interface AlertThreshold {
  metric: string;
  threshold: number;
  durationSeconds: number;
  severity: "warning" | "critical";
}

export const DEFAULT_PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  paymentCaptureP95: 1000, // 1 second
  paymentCaptureP99: 2000, // 2 seconds
  offlineCommitP95: 100, // 100ms
  syncSuccessRate: 99, // 99%
  queueDrainTime: 30000 // 30 seconds
};

export const DEFAULT_ALERT_THRESHOLDS: AlertThreshold[] = [
  {
    metric: "payment_capture_p95",
    threshold: 1200, // 1.2s (20% buffer over 1s target)
    durationSeconds: 300, // 5 min
    severity: "warning"
  },
  {
    metric: "payment_capture_p99",
    threshold: 2500, // 2.5s (25% buffer over 2s target)
    durationSeconds: 120, // 2 min
    severity: "warning"
  },
  {
    metric: "offline_commit_p95",
    threshold: 200, // 200ms (100% buffer over 100ms target)
    durationSeconds: 60, // 1 min
    severity: "warning"
  },
  {
    metric: "sync_success_rate",
    threshold: 95, // 95% (below this is bad)
    durationSeconds: 900, // 15 min
    severity: "warning"
  },
  {
    metric: "queue_depth",
    threshold: 500, // 500 pending transactions
    durationSeconds: 0, // immediate
    severity: "warning"
  }
];

export interface ViolationRecord {
  metric: string;
  threshold: number;
  actualValue: number;
  startedAt: number;
  severity: "warning" | "critical";
}

export interface PerformanceSnapshot {
  timestamp: number;
  paymentCaptureP50: number;
  paymentCaptureP95: number;
  paymentCaptureP99: number;
  offlineCommitP50: number;
  offlineCommitP95: number;
  syncSuccessRate: number;
  queueDepth: number;
  oldestPendingMs: number | null;
}

export class PerformanceMonitor {
  private thresholds: PerformanceThresholds;
  private alertThresholds: AlertThreshold[];
  private violations: Map<string, ViolationRecord> = new Map();
  private history: PerformanceSnapshot[] = [];
  private readonly MAX_HISTORY_SIZE = 1440; // 24 hours at 1-minute resolution

  // Latency storage for percentile calculation
  private paymentCaptureLatencies: number[] = [];
  private offlineCommitLatencies: number[] = [];
  private readonly MAX_LATENCY_SAMPLES = 10000;

  constructor(
    thresholds: PerformanceThresholds = DEFAULT_PERFORMANCE_THRESHOLDS,
    alertThresholds: AlertThreshold[] = DEFAULT_ALERT_THRESHOLDS
  ) {
    this.thresholds = thresholds;
    this.alertThresholds = alertThresholds;
  }

  /**
   * Record a latency measurement
   */
  recordLatency(
    metric: "payment_capture" | "offline_local_commit",
    latencyMs: number,
    success: boolean
  ): void {
    // Store latency for percentile calculation
    if (metric === "payment_capture") {
      this.paymentCaptureLatencies.push(latencyMs);
      if (this.paymentCaptureLatencies.length > this.MAX_LATENCY_SAMPLES) {
        this.paymentCaptureLatencies.shift();
      }
    } else {
      this.offlineCommitLatencies.push(latencyMs);
      if (this.offlineCommitLatencies.length > this.MAX_LATENCY_SAMPLES) {
        this.offlineCommitLatencies.shift();
      }
    }

    // Check for violations after recording
    this.checkViolations();
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Get current latency percentiles for payment capture
   */
  private getPaymentCapturePercentiles(): { p50: number; p95: number; p99: number } {
    const sorted = [...this.paymentCaptureLatencies].sort((a, b) => a - b);
    return {
      p50: this.calculatePercentile(sorted, 50),
      p95: this.calculatePercentile(sorted, 95),
      p99: this.calculatePercentile(sorted, 99)
    };
  }

  /**
   * Get current latency percentiles for offline commit
   */
  private getOfflineCommitPercentiles(): { p50: number; p95: number; p99: number } {
    const sorted = [...this.offlineCommitLatencies].sort((a, b) => a - b);
    return {
      p50: this.calculatePercentile(sorted, 50),
      p95: this.calculatePercentile(sorted, 95),
      p99: this.calculatePercentile(sorted, 99)
    };
  }

  /**
   * Check current state and update violations
   */
  checkViolations(): void {
    const now = Date.now();
    const paymentPercentiles = this.getPaymentCapturePercentiles();
    const commitPercentiles = this.getOfflineCommitPercentiles();

    // Create current snapshot from live data
    const currentSnapshot: PerformanceSnapshot = {
      timestamp: now,
      paymentCaptureP50: paymentPercentiles.p50,
      paymentCaptureP95: paymentPercentiles.p95,
      paymentCaptureP99: paymentPercentiles.p99,
      offlineCommitP50: commitPercentiles.p50,
      offlineCommitP95: commitPercentiles.p95,
      syncSuccessRate: 100, // Default - would be calculated from actual sync data
      queueDepth: 0, // Default - would be calculated from queue state
      oldestPendingMs: null
    };

    for (const alert of this.alertThresholds) {
      const isViolated = this.isMetricViolated(alert.metric, alert.threshold, currentSnapshot);

      if (isViolated) {
        const existing = this.violations.get(alert.metric);
        if (!existing) {
          // Start new violation
          this.violations.set(alert.metric, {
            metric: alert.metric,
            threshold: alert.threshold,
            actualValue: this.getMetricValue(alert.metric, currentSnapshot),
            startedAt: now,
            severity: alert.severity
          });
        }
      } else {
        // Clear violation if it exists
        this.violations.delete(alert.metric);
      }
    }
  }

  /**
   * Check if a specific metric is currently violated
   */
  private isMetricViolated(metric: string, threshold: number, snapshot: PerformanceSnapshot): boolean {
    const value = this.getMetricValue(metric, snapshot);
    switch (metric) {
      case "payment_capture_p95":
        return snapshot.paymentCaptureP95 > threshold;
      case "payment_capture_p99":
        return snapshot.paymentCaptureP99 > threshold;
      case "offline_commit_p95":
        return snapshot.offlineCommitP95 > threshold;
      case "sync_success_rate":
        return value < threshold; // Lower is worse for success rate
      case "queue_depth":
        return snapshot.queueDepth > threshold;
      default:
        return false;
    }
  }

  /**
   * Get the numeric value of a metric from a snapshot
   */
  private getMetricValue(metric: string, snapshot: PerformanceSnapshot): number {
    switch (metric) {
      case "payment_capture_p95":
        return snapshot.paymentCaptureP95;
      case "payment_capture_p99":
        return snapshot.paymentCaptureP99;
      case "offline_commit_p95":
        return snapshot.offlineCommitP95;
      case "sync_success_rate":
        return snapshot.syncSuccessRate;
      case "queue_depth":
        return snapshot.queueDepth;
      default:
        return 0;
    }
  }

  /**
   * Get active violations
   */
  getActiveViolations(): ViolationRecord[] {
    return Array.from(this.violations.values());
  }

  /**
   * Check if there are any active violations
   */
  hasActiveViolations(): boolean {
    return this.violations.size > 0;
  }

  /**
   * Check if a specific metric is in violation
   */
  isInViolation(metric: string): boolean {
    return this.violations.has(metric);
  }

  /**
   * Get violation duration in seconds
   */
  getViolationDuration(metric: string): number | null {
    const violation = this.violations.get(metric);
    if (!violation) return null;
    return (Date.now() - violation.startedAt) / 1000;
  }

  /**
   * Get the latest performance snapshot
   */
  getLatestSnapshot(): PerformanceSnapshot | null {
    if (this.history.length === 0) return null;
    return this.history[this.history.length - 1];
  }

  /**
   * Add a performance snapshot
   */
  addSnapshot(snapshot: PerformanceSnapshot): void {
    this.history.push(snapshot);
    if (this.history.length > this.MAX_HISTORY_SIZE) {
      this.history.shift();
    }
    this.checkViolations();
  }

  /**
   * Get performance history
   */
  getHistory(limit?: number): PerformanceSnapshot[] {
    if (limit === undefined) return [...this.history];
    return this.history.slice(-limit);
  }

  /**
   * Validate current performance against thresholds
   */
  validatePerformance(snapshot: PerformanceSnapshot): {
    valid: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    if (snapshot.paymentCaptureP95 > this.thresholds.paymentCaptureP95) {
      violations.push(
        `payment_capture p95 (${snapshot.paymentCaptureP95}ms) exceeds threshold (${this.thresholds.paymentCaptureP95}ms)`
      );
    }

    if (snapshot.paymentCaptureP99 > this.thresholds.paymentCaptureP99) {
      violations.push(
        `payment_capture p99 (${snapshot.paymentCaptureP99}ms) exceeds threshold (${this.thresholds.paymentCaptureP99}ms)`
      );
    }

    if (snapshot.offlineCommitP95 > this.thresholds.offlineCommitP95) {
      violations.push(
        `offline_commit p95 (${snapshot.offlineCommitP95}ms) exceeds threshold (${this.thresholds.offlineCommitP95}ms)`
      );
    }

    if (snapshot.syncSuccessRate < this.thresholds.syncSuccessRate) {
      violations.push(
        `sync_success_rate (${snapshot.syncSuccessRate}%) below threshold (${this.thresholds.syncSuccessRate}%)`
      );
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Get SLO compliance summary
   */
  getSLOCompliance(): {
    paymentCaptureCompliance: boolean;
    offlineCommitCompliance: boolean;
    syncSuccessCompliance: boolean;
    overallCompliance: boolean;
  } {
    const latest = this.getLatestSnapshot();
    if (!latest) {
      return {
        paymentCaptureCompliance: true,
        offlineCommitCompliance: true,
        syncSuccessCompliance: true,
        overallCompliance: true
      };
    }

    const paymentCaptureCompliance =
      latest.paymentCaptureP95 <= this.thresholds.paymentCaptureP95 &&
      latest.paymentCaptureP99 <= this.thresholds.paymentCaptureP99;

    const offlineCommitCompliance =
      latest.offlineCommitP95 <= this.thresholds.offlineCommitP95;

    const syncSuccessCompliance =
      latest.syncSuccessRate >= this.thresholds.syncSuccessRate;

    return {
      paymentCaptureCompliance,
      offlineCommitCompliance,
      syncSuccessCompliance,
      overallCompliance:
        paymentCaptureCompliance && offlineCommitCompliance && syncSuccessCompliance
    };
  }

  /**
   * Reset all monitoring state
   */
  reset(): void {
    this.violations.clear();
    this.history = [];
    this.paymentCaptureLatencies = [];
    this.offlineCommitLatencies = [];
  }
}

// Singleton for global performance monitoring
let globalPerformanceMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!globalPerformanceMonitor) {
    globalPerformanceMonitor = new PerformanceMonitor();
  }
  return globalPerformanceMonitor;
}
