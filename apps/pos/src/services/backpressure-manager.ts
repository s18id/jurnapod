// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * POS Backpressure Manager
 * 
 * Handles graceful degradation when approaching storage limits:
 * - Queue depth monitoring and limits
 * - Storage quota monitoring
 * - Clear operator messaging
 * - Safe retry paths
 */

import type { PosOfflineDb } from "@jurnapod/offline-db/dexie";
import { posDb } from "@jurnapod/offline-db/dexie";

export interface QueueLimits {
  maxPendingTransactions: number;
  warnAtPercent: number;
  alertAtPercent: number;
  storageWarnPercent: number;
  storageAlertPercent: number;
}

export const DEFAULT_QUEUE_LIMITS: QueueLimits = {
  maxPendingTransactions: 1000,
  warnAtPercent: 80, // 80% of max
  alertAtPercent: 95, // 95% of max
  storageWarnPercent: 80,
  storageAlertPercent: 95
};

export type BackpressureLevel = "normal" | "warning" | "critical" | "read_only";

export interface BackpressureStatus {
  level: BackpressureLevel;
  queueDepth: number;
  maxQueueDepth: number;
  queueUtilizationPercent: number;
  storageUtilizationPercent: number | null;
  oldestPendingMs: number | null;
  canAcceptNewTransactions: boolean;
  messages: string[];
}

export interface BackpressureMetrics {
  queueDepth: number;
  failedCount: number;
  oldestPendingMs: number | null;
  storageEstimate: number | null;
}

export class BackpressureManager {
  private limits: QueueLimits;
  private lastStatus: BackpressureStatus | null = null;

  constructor(limits: QueueLimits = DEFAULT_QUEUE_LIMITS) {
    this.limits = limits;
  }

  /**
   * Get current backpressure status
   */
  async getStatus(db: PosOfflineDb = posDb): Promise<BackpressureStatus> {
    const metrics = await this.collectMetrics(db);
    return this.calculateStatus(metrics);
  }

  /**
   * Collect current backpressure metrics
   */
  async collectMetrics(db: PosOfflineDb): Promise<BackpressureMetrics> {
    const [pendingJobs, failedJobs, oldestJob] = await Promise.all([
      this.getPendingCount(db),
      this.getFailedCount(db),
      this.getOldestPendingJob(db)
    ]);

    return {
      queueDepth: pendingJobs + failedJobs,
      failedCount: failedJobs,
      oldestPendingMs: oldestJob,
      storageEstimate: await this.estimateStorageUsage(db)
    };
  }

  /**
   * Check if new transactions can be accepted
   */
  async canAcceptTransaction(db: PosOfflineDb = posDb): Promise<{
    canAccept: boolean;
    reason?: string;
  }> {
    const status = await this.getStatus(db);

    if (!status.canAcceptNewTransactions) {
      return {
        canAccept: false,
        reason: status.messages.join("; ")
      };
    }

    // Additional check for immediate queue limit
    if (status.queueDepth >= this.limits.maxPendingTransactions) {
      return {
        canAccept: false,
        reason: `Queue limit reached (${status.queueDepth}/${this.limits.maxPendingTransactions})`
      };
    }

    return { canAccept: true };
  }

  /**
   * Calculate backpressure status from metrics
   */
  private calculateStatus(metrics: BackpressureMetrics): BackpressureStatus {
    const messages: string[] = [];
    let level: BackpressureLevel = "normal";
    let canAccept = true;

    const queueUtilization =
      (metrics.queueDepth / this.limits.maxPendingTransactions) * 100;

    // Determine backpressure level
    if (queueUtilization >= this.limits.alertAtPercent) {
      level = "critical";
      canAccept = false;
      messages.push(
        `CRITICAL: Queue at ${queueUtilization.toFixed(1)}% capacity (${metrics.queueDepth}/${this.limits.maxPendingTransactions})`
      );
    } else if (queueUtilization >= this.limits.warnAtPercent) {
      level = "warning";
      messages.push(
        `WARNING: Queue at ${queueUtilization.toFixed(1)}% capacity (${metrics.queueDepth}/${this.limits.maxPendingTransactions})`
      );
    }

    // Check storage pressure
    if (metrics.storageEstimate !== null) {
      const storagePercent = (metrics.storageEstimate / this.getStorageQuota()) * 100;
      if (storagePercent >= this.limits.storageAlertPercent) {
        level = "read_only";
        canAccept = false;
        messages.push(
          `CRITICAL: Storage at ${storagePercent.toFixed(1)}% - read-only mode active`
        );
      } else if (storagePercent >= this.limits.storageWarnPercent) {
        if (level === "normal") level = "warning";
        messages.push(
          `WARNING: Storage at ${storagePercent.toFixed(1)}% utilization`
        );
      }
    }

    // Check for stale pending transactions
    if (metrics.oldestPendingMs !== null) {
      const oldestMinutes = metrics.oldestPendingMs / 60000;
      if (oldestMinutes > 60) {
        messages.push(
          `WARNING: Oldest pending transaction is ${oldestMinutes.toFixed(0)} minutes old`
        );
      }
    }

    // Check for high failure rate
    if (metrics.failedCount > 0) {
      const failPercent =
        (metrics.failedCount / Math.max(1, metrics.queueDepth)) * 100;
      if (failPercent > 10) {
        messages.push(
          `WARNING: ${failPercent.toFixed(1)}% of queued transactions have failed`
        );
      }
    }

    const status: BackpressureStatus = {
      level,
      queueDepth: metrics.queueDepth,
      maxQueueDepth: this.limits.maxPendingTransactions,
      queueUtilizationPercent: queueUtilization,
      storageUtilizationPercent: metrics.storageEstimate !== null
        ? (metrics.storageEstimate / this.getStorageQuota()) * 100
        : null,
      oldestPendingMs: metrics.oldestPendingMs,
      canAcceptNewTransactions: canAccept,
      messages
    };

    this.lastStatus = status;
    return status;
  }

  /**
   * Get count of pending outbox jobs
   */
  private async getPendingCount(db: PosOfflineDb): Promise<number> {
    return await db.outbox_jobs.where("status").equals("PENDING").count();
  }

  /**
   * Get count of failed outbox jobs
   */
  private async getFailedCount(db: PosOfflineDb): Promise<number> {
    return await db.outbox_jobs.where("status").equals("FAILED").count();
  }

  /**
   * Get the oldest pending job's age in milliseconds
   */
  private async getOldestPendingJob(db: PosOfflineDb): Promise<number | null> {
    const jobs = await db.outbox_jobs
      .where("status")
      .anyOf("PENDING", "FAILED")
      .sortBy("created_at");

    if (jobs.length === 0) return null;

    const oldest = jobs[0];
    const createdAt = Date.parse(oldest.created_at);
    if (isNaN(createdAt)) return null;

    return Date.now() - createdAt;
  }

  /**
   * Estimate IndexedDB storage usage (in bytes)
   * This is an approximation since IndexedDB doesn't provide direct storage metrics
   */
  private async estimateStorageUsage(db: PosOfflineDb): Promise<number | null> {
    try {
      if ("estimate" in db) {
        // Dexie exposes storage estimate
        const estimate = await (db as unknown as { estimate?: () => Promise<{ usage?: number }> }).estimate?.();
        return estimate?.usage ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get storage quota (approximate for IndexedDB: 50MB - 1GB depending on browser)
   */
  private getStorageQuota(): number {
    // Conservative estimate of 50MB for IndexedDB
    return 50 * 1024 * 1024;
  }

  /**
   * Get the last calculated status
   */
  getLastStatus(): BackpressureStatus | null {
    return this.lastStatus;
  }

  /**
   * Update queue limits
   */
  updateLimits(limits: Partial<QueueLimits>): void {
    this.limits = {
      ...this.limits,
      ...limits
    };
  }

  /**
   * Get recommended action based on current backpressure
   */
  getRecommendedAction(): {
    action: "none" | "force_sync" | "clear_completed" | "wait";
    description: string;
  } {
    if (!this.lastStatus) {
      return { action: "none", description: "No backpressure data available" };
    }

    switch (this.lastStatus.level) {
      case "critical":
      case "read_only":
        return {
          action: "force_sync",
          description: "Force sync immediately to reduce queue depth"
        };
      case "warning":
        return {
          action: "clear_completed",
          description: "Clear completed sync records to free storage"
        };
      case "normal":
      default:
        if (this.lastStatus.queueDepth > this.limits.maxPendingTransactions * 0.5) {
          return {
            action: "force_sync",
            description: "Queue growing, consider proactive sync"
          };
        }
        return { action: "none", description: "Operating normally" };
    }
  }
}

/**
 * Exponential backoff calculator for retry logic
 */
export class BackoffCalculator {
  private readonly baseMs: number;
  private readonly maxMs: number;
  private readonly multiplier: number;

  constructor(baseMs = 2000, maxMs = 60000, multiplier = 2) {
    this.baseMs = baseMs;
    this.maxMs = maxMs;
    this.multiplier = multiplier;
  }

  /**
   * Calculate backoff delay for a given attempt number
   * Returns delay in milliseconds
   */
  getDelay(attemptNumber: number): number {
    if (attemptNumber <= 0) return this.baseMs;

    const delay = this.baseMs * Math.pow(this.multiplier, attemptNumber - 1);
    const jitter = Math.random() * 0.1 * delay; // 10% jitter
    return Math.min(delay + jitter, this.maxMs);
  }

  /**
   * Get backoff sequence for display purposes
   */
  getSequence(maxAttempts = 5): number[] {
    const sequence: number[] = [];
    for (let i = 1; i <= maxAttempts; i++) {
      sequence.push(this.getDelay(i));
    }
    return sequence;
  }

  /**
   * Reset state (if using instance for tracking attempts)
   */
  reset(): void {
    // No-op for pure function implementation
  }
}

// Singleton for global backpressure management
let globalBackpressureManager: BackpressureManager | null = null;

export function getBackpressureManager(): BackpressureManager {
  if (!globalBackpressureManager) {
    globalBackpressureManager = new BackpressureManager();
  }
  return globalBackpressureManager;
}
