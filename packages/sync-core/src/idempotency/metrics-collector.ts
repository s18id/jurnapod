// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Idempotency Metrics Collector
 * 
 * Tracks metrics for sync idempotency operations:
 * - Duplicate attempt counts (global and per-tenant)
 * - Dedupe hit rate
 * - Retry counts by error class
 * - Stale-queue age
 * - Sync completion latency
 * - Per-tenant OK/DUPLICATE/ERROR tracking with percentile latencies
 * 
 * Per-tenant tracking (Story 52-9):
 * Uses Map<company_id, TenantMetrics> to track per-company state.
 * Latency arrays are maintained for p50/p95 percentile computation.
 */

import type { ErrorClassification } from "./sync-idempotency.js";

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Per-Tenant Tracking Types (Story 52-9)
// ============================================================================

/**
 * Per-tenant latency arrays for percentile computation
 */
export interface TenantLatencyData {
  ok: number[];
  duplicate: number[];
  error: number[];
}

/**
 * Per-tenant metrics snapshot
 */
export interface TenantMetrics {
  /** Total requests for this tenant */
  totalRequests: number;
  /** OK result count */
  okCount: number;
  /** DUPLICATE result count */
  duplicateCount: number;
  /** ERROR result count */
  errorCount: number;
  /** Duplicate rate (0-1) over current window */
  duplicateRate: number;
  /** Error rate (0-1) over current window */
  errorRate: number;
  /** Latency arrays for percentile computation */
  latencies: TenantLatencyData;
}

/**
 * Compute Nth percentile using nearest-rank method.
 * Simple and sufficient for operational health metrics.
 * The array is sorted internally — callers may pass unsorted input.
 */
function getPercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }
  if (values.length === 1) {
    return values[0];
  }

  // Guard against invalid percentile bounds
  const p = Math.max(0, Math.min(100, percentile));

  // Sort a copy of the input (never mutate the original)
  const sorted = [...values].sort((a, b) => a - b);

  // Nearest-rank: index = ceil(p/100 * N) - 1 (0-based)
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

/**
 * Compute p50 and p95 from a latency array
 */
export function getLatencyPercentiles(latencies: number[]): { p50: number; p95: number } {
  return {
    p50: getPercentile(latencies, 50),
    p95: getPercentile(latencies, 95),
  };
}

/**
 * Create an empty TenantMetrics for a new tenant
 */
function createEmptyTenantMetrics(): TenantMetrics {
  return {
    totalRequests: 0,
    okCount: 0,
    duplicateCount: 0,
    errorCount: 0,
    duplicateRate: 0,
    errorRate: 0,
    latencies: { ok: [], duplicate: [], error: [] },
  };
}

// ============================================================================
// Collector
// ============================================================================

/**
 * Sync idempotency metrics collector
 * 
 * Tracks both global aggregate metrics and per-tenant metrics.
 * Per-tenant metrics are used for per-company alert evaluation.
 */
export class SyncIdempotencyMetricsCollector {
  private metrics: SyncIdempotencyMetrics;
  private batchStartTime: number | null = null;
  private queueItems: Array<{ enqueued_at: number; client_tx_id: string }> = [];
  
  /** Per-tenant metrics state (Story 52-9) */
  private readonly tenantMetrics: Map<number, TenantMetrics> = new Map();

  constructor() {
    this.metrics = { ...DEFAULT_SYNC_IDEMPOTENCY_METRICS };
  }

  /**
   * Reset all metrics (global and per-tenant)
   */
  reset(): void {
    this.metrics = { ...DEFAULT_SYNC_IDEMPOTENCY_METRICS };
    this.batchStartTime = null;
    this.queueItems = [];
    this.tenantMetrics.clear();
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

  // ========================================================================
  // Global Aggregate Tracking
  // ========================================================================

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

  // ========================================================================
  // Per-Tenant & Result Tracking (Story 52-9)
  // ========================================================================

  /**
   * Get or create tenant metrics for a company
   */
  private getOrCreateTenantMetrics(companyId: number): TenantMetrics {
    let tm = this.tenantMetrics.get(companyId);
    if (!tm) {
      tm = createEmptyTenantMetrics();
      this.tenantMetrics.set(companyId, tm);
    }
    return tm;
  }

  /**
   * Record multiple operation results at once — per-tenant aware (Story 52-9)
   * 
   * Tracks OK, DUPLICATE, and ERROR results per company.
   * Maintains latency arrays for percentile computation.
   * Also updates global aggregate counts for backward compatibility.
   * 
   * @param companyId - Company ID for per-tenant tracking
   * @param results - Array of operation results
   */
  recordResults(companyId: number, results: SyncOperationResult[]): void {
    // Early return for empty arrays — prevents creating orphan tenant entries
    if (results.length === 0) return;

    const tm = this.getOrCreateTenantMetrics(companyId);

    for (const result of results) {
      // Global aggregate tracking
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

      // Per-tenant tracking
      tm.totalRequests++;
      const clampedLatency = Math.max(0, result.latency_ms);
      const MAX_LATENCY_SAMPLES = 1000;
      switch (result.result) {
        case "OK":
          tm.okCount++;
          tm.latencies.ok.push(clampedLatency);
          if (tm.latencies.ok.length > MAX_LATENCY_SAMPLES) tm.latencies.ok.shift();
          break;
        case "DUPLICATE":
          tm.duplicateCount++;
          tm.latencies.duplicate.push(clampedLatency);
          if (tm.latencies.duplicate.length > MAX_LATENCY_SAMPLES) tm.latencies.duplicate.shift();
          break;
        case "ERROR":
        case "CONFLICT":
          tm.errorCount++;
          tm.latencies.error.push(clampedLatency);
          if (tm.latencies.error.length > MAX_LATENCY_SAMPLES) tm.latencies.error.shift();
          break;
      }
    }

    // Recalculate rates
    this.recalculateTenantRates(tm);
  }

  /**
   * Recalculate tenant rates from current counts
   */
  private recalculateTenantRates(tm: TenantMetrics): void {
    if (tm.totalRequests > 0) {
      tm.duplicateRate = tm.duplicateCount / tm.totalRequests;
      tm.errorRate = tm.errorCount / tm.totalRequests;
    }
  }

  /**
   * Get per-tenant metrics snapshot for a company (deep copy)
   */
  getTenantMetrics(companyId: number): TenantMetrics | undefined {
    const tm = this.tenantMetrics.get(companyId);
    if (!tm) return undefined;
    return {
      ...tm,
      latencies: {
        ok: [...tm.latencies.ok],
        duplicate: [...tm.latencies.duplicate],
        error: [...tm.latencies.error],
      },
    };
  }

  /**
   * Compute p50 and p95 latency for a specific tenant and result type.
   * Returns 0 for both if no data is available.
   */
  getTenantLatencyPercentiles(
    companyId: number,
    resultType: "ok" | "duplicate" | "error"
  ): { p50: number; p95: number } {
    const tm = this.tenantMetrics.get(companyId);
    if (!tm) return { p50: 0, p95: 0 };

    const latencies = tm.latencies[resultType] ?? [];
    return getLatencyPercentiles(latencies);
  }

  // ========================================================================
  // Alert Conditions (Story 52-9 — thresholds updated)
  // ========================================================================

  /**
   * Get alert conditions for anomaly detection (global aggregate)
   * 
   * Thresholds (Story 52-9):
   * - Dedupe rate > 5% of total requests
   * - Error rate > 1% of total requests
   * - Stale queue > 5 minutes
   * - High latency > 30s
   */
  getAlertConditions(): Array<{ alert: string; value: number; threshold: number }> {
    const alerts: Array<{ alert: string; value: number; threshold: number }> = [];

    // High dedupe rate (potential replay storm) — threshold: 5% (Story 52-9)
    const totalProcessed = this.metrics.total_transactions;
    const dedupeRate = totalProcessed > 0
      ? this.metrics.duplicate_submissions / totalProcessed
      : 0;
    if (dedupeRate > 0.05) { // > 5%
      alerts.push({
        alert: "HIGH_DEDUPE_RATE",
        value: dedupeRate,
        threshold: 0.05,
      });
    }

    // High error rate — threshold: 1% (Story 52-9)
    const totalErrors = this.metrics.retryable_errors + this.metrics.non_retryable_errors;
    const errorRate = totalProcessed > 0
      ? totalErrors / totalProcessed
      : 0;
    if (errorRate > 0.01) { // > 1%
      alerts.push({
        alert: "HIGH_ERROR_RATE",
        value: errorRate,
        threshold: 0.01,
      });
    }

    // High retry rate (retryable errors as fraction of all errors)
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
   * Get alert conditions for a specific tenant (per-company)
   * 
   * Evaluates per-tenant thresholds (Story 52-9):
   * - Duplicate rate > 5%
   * - Error rate > 1%
   */
  getTenantAlertConditions(companyId: number): Array<{ alert: string; value: number; threshold: number }> {
    const alerts: Array<{ alert: string; value: number; threshold: number }> = [];
    const tm = this.tenantMetrics.get(companyId);
    if (!tm || tm.totalRequests === 0) return alerts;

    // Per-tenant duplicate rate > 5%
    if (tm.duplicateRate > 0.05) {
      alerts.push({
        alert: "TENANT_HIGH_DEDUPE_RATE",
        value: tm.duplicateRate,
        threshold: 0.05,
      });
    }

    // Per-tenant error rate > 1%
    if (tm.errorRate > 0.01) {
      alerts.push({
        alert: "TENANT_HIGH_ERROR_RATE",
        value: tm.errorRate,
        threshold: 0.01,
      });
    }

    return alerts;
  }

  /**
   * Log metrics summary with alert conditions
   */
  logMetrics(): void {
    console.info("[SyncIdempotencyMetrics]", this.getSummary());
    
    const alerts = this.getAlertConditions();
    for (const { alert, value, threshold } of alerts) {
      console.warn(`[SyncIdempotencyMetrics] ALERT: ${alert}`, { value, threshold });
    }

    // Log per-tenant alerts
    for (const companyId of this.tenantMetrics.keys()) {
      const tenantAlerts = this.getTenantAlertConditions(companyId);
      for (const { alert, value, threshold } of tenantAlerts) {
        console.warn(`[SyncIdempotencyMetrics] TENANT ALERT (company=${companyId}): ${alert}`, {
          value, threshold,
        });
      }
    }
  }
}

/**
 * Singleton instance
 */
export const syncIdempotencyMetricsCollector = new SyncIdempotencyMetricsCollector();
