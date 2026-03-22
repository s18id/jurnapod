// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Idempotency Metrics Collector
 * 
 * Tracks metrics for sync idempotency operations:
 * - Duplicate attempt counts
 * - Dedupe hit rate
 * - Retry counts by error class
 * - Stale-queue age
 * - Sync completion latency
 */

import type { ErrorClassification } from "./sync-idempotency.js";

/**
 * Metric types for sync idempotency
 */
export interface SyncIdempotencyMetrics {
  /** Total sync push requests received */
  total_requests: number;
  
  /** Total transactions processed */
  total_transactions: number;
  
  /** Duplicate submissions detected */
  duplicate_submissions: number;
  
  /** Successful deduplications (returned cached) */
  dedupe_hits: number;
  
  /** Dedupe hit rate (0-1) */
  dedupe_hit_rate: number;
  
  /** Retryable errors encountered */
  retryable_errors: number;
  
  /** Non-retryable errors encountered */
  non_retryable_errors: number;
  
  /** Retries performed by error class */
  retries_by_class: Record<ErrorClassification, number>;
  
  /** Sync completion latency in ms */
  sync_completion_latency_ms: number;
  
  /** Queue drain time in ms */
  queue_drain_time_ms: number;
  
  /** Oldest queue item age in ms */
  oldest_queue_item_age_ms: number;
  
  /** Average batch processing time in ms */
  avg_batch_processing_time_ms: number;
}

/**
 * Default empty metrics
 */
export const DEFAULT_SYNC_IDEMPOTENCY_METRICS: SyncIdempotencyMetrics = {
  total_requests: 0,
  total_transactions: 0,
  duplicate_submissions: 0,
  dedupe_hits: 0,
  dedupe_hit_rate: 0,
  retryable_errors: 0,
  non_retryable_errors: 0,
  retries_by_class: {
    TRANSIENT: 0,
    BUSINESS_LOGIC: 0,
    IDEMPOTENCY: 0,
    SYSTEM: 0,
    VALIDATION: 0,
    CONFLICT: 0,
  },
  sync_completion_latency_ms: 0,
  queue_drain_time_ms: 0,
  oldest_queue_item_age_ms: 0,
  avg_batch_processing_time_ms: 0,
};

/**
 * Sync operation result for metrics
 */
export interface SyncOperationResult {
  client_tx_id: string;
  result: "OK" | "DUPLICATE" | "ERROR" | "CONFLICT";
  latency_ms: number;
  error_classification?: ErrorClassification;
  is_retry?: boolean;
}

/**
 * Sync batch metrics
 */
export interface SyncBatchMetrics {
  batch_id: string;
  transaction_count: number;
  start_time: number;
  end_time: number;
  duration_ms: number;
  results: SyncOperationResult[];
  oldest_item_age_ms: number;
}

/**
 * Sync idempotency metrics collector
 */
export class SyncIdempotencyMetricsCollector {
  private metrics: SyncIdempotencyMetrics;
  private batchStartTime: number | null = null;
  private queueItems: Array<{ enqueued_at: number; client_tx_id: string }> = [];

  constructor() {
    this.metrics = { ...DEFAULT_SYNC_IDEMPOTENCY_METRICS };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = { ...DEFAULT_SYNC_IDEMPOTENCY_METRICS };
    this.batchStartTime = null;
    this.queueItems = [];
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): SyncIdempotencyMetrics {
    return { ...this.metrics };
  }

  /**
   * Get metrics summary for logging
   */
  getSummary(): Record<string, unknown> {
    return {
      total_requests: this.metrics.total_requests,
      total_transactions: this.metrics.total_transactions,
      duplicate_submissions: this.metrics.duplicate_submissions,
      dedupe_hit_rate: this.metrics.dedupe_hit_rate.toFixed(4),
      retryable_errors: this.metrics.retryable_errors,
      non_retryable_errors: this.metrics.non_retryable_errors,
      sync_completion_latency_ms: this.metrics.sync_completion_latency_ms,
      queue_drain_time_ms: this.metrics.queue_drain_time_ms,
      oldest_queue_item_age_ms: this.metrics.oldest_queue_item_age_ms,
    };
  }

  /**
   * Record a sync request received
   */
  recordRequest(transactionCount: number = 1): void {
    this.metrics.total_requests++;
    this.metrics.total_transactions += transactionCount;
  }

  /**
   * Record a duplicate submission attempt
   */
  recordDuplicateSubmission(): void {
    this.metrics.duplicate_submissions++;
  }

  /**
   * Record a successful deduplication (cache hit)
   */
  recordDedupeHit(): void {
    this.metrics.dedupe_hits++;
    this.metrics.dedupe_hit_rate = this.metrics.total_transactions > 0
      ? this.metrics.dedupe_hits / this.metrics.total_transactions
      : 0;
  }

  /**
   * Record an error by classification
   */
  recordError(errorClassification: ErrorClassification, isRetryable: boolean): void {
    if (isRetryable) {
      this.metrics.retryable_errors++;
    } else {
      this.metrics.non_retryable_errors++;
    }
    this.metrics.retries_by_class[errorClassification]++;
  }

  /**
   * Record sync completion latency
   */
  recordSyncCompletionLatency(latencyMs: number): void {
    this.metrics.sync_completion_latency_ms = latencyMs;
  }

  /**
   * Record queue drain time
   */
  recordQueueDrainTime(drainTimeMs: number): void {
    this.metrics.queue_drain_time_ms = drainTimeMs;
  }

  /**
   * Record oldest queue item age
   */
  recordOldestQueueItemAge(ageMs: number): void {
    this.metrics.oldest_queue_item_age_ms = ageMs;
  }

  /**
   * Calculate and record average batch processing time
   */
  recordBatchProcessingTime(durationMs: number, batchCount: number): void {
    if (batchCount > 0) {
      const current = this.metrics.avg_batch_processing_time_ms;
      const n = batchCount;
      // Incremental average
      this.metrics.avg_batch_processing_time_ms = current + (durationMs - current) / n;
    }
  }

  /**
   * Start batch processing timer
   */
  startBatch(): void {
    this.batchStartTime = Date.now();
  }

  /**
   * End batch processing and record metrics
   */
  endBatch(resultCount: number): void {
    if (this.batchStartTime !== null) {
      const duration = Date.now() - this.batchStartTime;
      this.recordBatchProcessingTime(duration, resultCount);
      this.batchStartTime = null;
    }
  }

  /**
   * Add item to queue tracking
   */
  enqueueItem(clientTxId: string): void {
    this.queueItems.push({ enqueued_at: Date.now(), client_tx_id: clientTxId });
  }

  /**
   * Remove item from queue tracking
   */
  dequeueItem(clientTxId: string): void {
    const index = this.queueItems.findIndex(item => item.client_tx_id === clientTxId);
    if (index !== -1) {
      this.queueItems.splice(index, 1);
    }
  }

  /**
   * Calculate and update oldest queue item age
   */
  updateOldestQueueItemAge(): void {
    if (this.queueItems.length === 0) {
      this.recordOldestQueueItemAge(0);
      return;
    }

    const now = Date.now();
    const oldestAge = this.queueItems.reduce(
      (min, item) => Math.min(min, now - item.enqueued_at),
      Infinity
    );
    this.recordOldestQueueItemAge(oldestAge);
  }

  /**
   * Record multiple operation results at once
   */
  recordResults(results: SyncOperationResult[]): void {
    for (const result of results) {
      switch (result.result) {
        case "DUPLICATE":
          this.recordDuplicateSubmission();
          this.recordDedupeHit();
          break;
        case "ERROR":
          if (result.error_classification) {
            this.recordError(
              result.error_classification,
              result.error_classification === "TRANSIENT"
            );
          }
          break;
      }
    }
  }

  /**
   * Get alert conditions for anomaly detection
   */
  getAlertConditions(): Array<{ alert: string; value: number; threshold: number }> {
    const alerts: Array<{ alert: string; value: number; threshold: number }> = [];

    // High dedupe rate (potential replay storm)
    if (this.metrics.dedupe_hit_rate > 0.1) { // > 10%
      alerts.push({
        alert: "HIGH_DEDUPE_RATE",
        value: this.metrics.dedupe_hit_rate,
        threshold: 0.1,
      });
    }

    // High retry rate
    const totalErrors = this.metrics.retryable_errors + this.metrics.non_retryable_errors;
    const retryRate = totalErrors > 0 
      ? this.metrics.retryable_errors / totalErrors 
      : 0;
    if (retryRate > 0.5) { // > 50% of errors are retries
      alerts.push({
        alert: "HIGH_RETRY_RATE",
        value: retryRate,
        threshold: 0.5,
      });
    }

    // Stuck queue (oldest item > 5 minutes)
    if (this.metrics.oldest_queue_item_age_ms > 5 * 60 * 1000) {
      alerts.push({
        alert: "STALE_QUEUE",
        value: this.metrics.oldest_queue_item_age_ms,
        threshold: 5 * 60 * 1000,
      });
    }

    // High latency
    if (this.metrics.sync_completion_latency_ms > 30000) { // > 30s
      alerts.push({
        alert: "HIGH_SYNC_LATENCY",
        value: this.metrics.sync_completion_latency_ms,
        threshold: 30000,
      });
    }

    return alerts;
  }

  /**
   * Log metrics summary
   */
  logMetrics(): void {
    console.info("[SyncIdempotencyMetrics]", this.getSummary());
    
    const alerts = this.getAlertConditions();
    for (const { alert, value, threshold } of alerts) {
      console.warn(`[SyncIdempotencyMetrics] ALERT: ${alert}`, {
        value,
        threshold,
      });
    }
  }
}

/**
 * Singleton instance
 */
export const syncIdempotencyMetricsCollector = new SyncIdempotencyMetricsCollector();
