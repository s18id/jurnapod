// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * POS Telemetry Service
 * 
 * Provides telemetry collection for POS-specific metrics including:
 * - Payment capture latency histograms
 * - Queue depth monitoring
 * - Offline commit success rates
 * - Recovery attempt tracking
 * 
 * INTEGRATION WITH @jurnapod/telemetry:
 * This service is designed to integrate with the @jurnapod/telemetry package:
 * - Uses SAFE_METRIC_LABELS: company_id, outlet_id, flow_name, status, error_class
 * - Uses CriticalFlowName: payment_capture, offline_local_commit, sync_replay_idempotency
 * - Follows SLO_CONFIG patterns: p95 < 1s for payment_capture, success_rate >= 99.9%
 * 
 * For production, this service should forward metrics to the shared telemetry package
 * which handles Prometheus metrics, OpenTelemetry traces, and alerting.
 */

import type { PosOfflineDb } from "@jurnapod/offline-db/dexie";

// Critical flow names from SLO configuration (aligned with @jurnapod/telemetry)
export type TelemetryFlowName =
  | "payment_capture"
  | "offline_local_commit"
  | "sync_replay_idempotency"
  | "checkout_cart"
  | "checkout_payment"
  | "checkout_commit"
  | "checkout_sync";

export interface TelemetryLatencyRecord {
  flow_name: TelemetryFlowName;
  latency_ms: number;
  company_id: number;
  outlet_id: number;
  success: boolean;
  error_class?: string;
  timestamp: number;
}

export interface TelemetryQueueDepthRecord {
  company_id: number;
  outlet_id: number;
  pending_count: number;
  failed_count: number;
  oldest_pending_ms: number | null;
  timestamp: number;
}

export interface TelemetryCommitRecord {
  flow_name: "offline_local_commit";
  success: boolean;
  company_id: number;
  outlet_id: number;
  error_class?: string;
  timestamp: number;
}

export interface TelemetryRecoveryRecord {
  attempt_type: "startup" | "sync" | "manual";
  transactions_recovered: number;
  duplicates_prevented: number;
  duration_ms: number;
  success: boolean;
  timestamp: number;
}

export interface TelemetryMetrics {
  // Latency histogram data (for percentiles calculation)
  latencies: Map<TelemetryFlowName, number[]>;
  // Success/failure counts
  successes: Map<TelemetryFlowName, number>;
  failures: Map<TelemetryFlowName, number>;
  // Queue metrics
  queue_depths: TelemetryQueueDepthRecord[];
  // Recovery metrics
  recovery_attempts: TelemetryRecoveryRecord[];
}

/**
 * POS Telemetry Service
 * 
 * Collects and aggregates telemetry data for POS operations.
 * In production, this would integrate with the telemetry package.
 */
export class PosTelemetryService {
  private readonly MAX_LATENCY_SAMPLES = 1000;
  private latencies: Map<TelemetryFlowName, number[]> = new Map();
  private successes: Map<TelemetryFlowName, number> = new Map();
  private failures: Map<TelemetryFlowName, number> = new Map();
  private queueDepths: TelemetryQueueDepthRecord[] = [];
  private recoveryAttempts: TelemetryRecoveryRecord[] = [];

  constructor() {
    // Initialize maps
    const flowNames: TelemetryFlowName[] = [
      "payment_capture",
      "offline_local_commit",
      "checkout_cart",
      "checkout_payment",
      "checkout_commit",
      "checkout_sync"
    ];
    for (const flow of flowNames) {
      this.latencies.set(flow, []);
      this.successes.set(flow, 0);
      this.failures.set(flow, 0);
    }
  }

  /**
   * Record a latency measurement
   */
  recordLatency(record: TelemetryLatencyRecord): void {
    const samples = this.latencies.get(record.flow_name);
    if (!samples) return;

    samples.push(record.latency_ms);
    if (samples.length > this.MAX_LATENCY_SAMPLES) {
      samples.shift();
    }

    if (record.success) {
      this.successes.set(record.flow_name, (this.successes.get(record.flow_name) ?? 0) + 1);
    } else {
      this.failures.set(record.flow_name, (this.failures.get(record.flow_name) ?? 0) + 1);
    }
  }

  /**
   * Record a commit attempt
   */
  recordCommit(record: TelemetryCommitRecord): void {
    const flowName: TelemetryFlowName = "offline_local_commit";
    if (record.success) {
      this.successes.set(flowName, (this.successes.get(flowName) ?? 0) + 1);
    } else {
      this.failures.set(flowName, (this.failures.get(flowName) ?? 0) + 1);
    }
  }

  /**
   * Record queue depth snapshot
   */
  recordQueueDepth(record: TelemetryQueueDepthRecord): void {
    this.queueDepths.push(record);
    // Keep last 100 samples
    if (this.queueDepths.length > 100) {
      this.queueDepths.shift();
    }
  }

  /**
   * Record a recovery attempt
   */
  recordRecoveryAttempt(record: TelemetryRecoveryRecord): void {
    this.recoveryAttempts.push(record);
    // Keep last 100 samples
    if (this.recoveryAttempts.length > 100) {
      this.recoveryAttempts.shift();
    }
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
   * Get latency percentiles for a flow
   */
  getLatencyPercentiles(flowName: TelemetryFlowName): { p50: number; p95: number; p99: number } {
    const samples = this.latencies.get(flowName) ?? [];
    if (samples.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    return {
      p50: this.calculatePercentile(sorted, 50),
      p95: this.calculatePercentile(sorted, 95),
      p99: this.calculatePercentile(sorted, 99)
    };
  }

  /**
   * Get success rate for a flow
   */
  getSuccessRate(flowName: TelemetryFlowName): number {
    const success = this.successes.get(flowName) ?? 0;
    const failure = this.failures.get(flowName) ?? 0;
    const total = success + failure;
    if (total === 0) return 100;
    return (success / total) * 100;
  }

  /**
   * Get current queue depth
   */
  getLatestQueueDepth(): TelemetryQueueDepthRecord | null {
    if (this.queueDepths.length === 0) return null;
    return this.queueDepths[this.queueDepths.length - 1];
  }

  /**
   * Get average queue depth over recent samples
   */
  getAverageQueueDepth(): { pending: number; failed: number } {
    if (this.queueDepths.length === 0) {
      return { pending: 0, failed: 0 };
    }
    const sum = this.queueDepths.reduce(
      (acc, record) => ({
        pending: acc.pending + record.pending_count,
        failed: acc.failed + record.failed_count
      }),
      { pending: 0, failed: 0 }
    );
    return {
      pending: sum.pending / this.queueDepths.length,
      failed: sum.failed / this.queueDepths.length
    };
  }

  /**
   * Get all metrics summary
   */
  getMetrics(): TelemetryMetrics {
    return {
      latencies: new Map(this.latencies),
      successes: new Map(this.successes),
      failures: new Map(this.failures),
      queue_depths: [...this.queueDepths],
      recovery_attempts: [...this.recoveryAttempts]
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    for (const flowName of this.latencies.keys()) {
      this.latencies.set(flowName, []);
      this.successes.set(flowName, 0);
      this.failures.set(flowName, 0);
    }
    this.queueDepths = [];
    this.recoveryAttempts = [];
  }
}

// Singleton instance for global telemetry collection
let globalTelemetryService: PosTelemetryService | null = null;

export function getPosTelemetryService(): PosTelemetryService {
  if (!globalTelemetryService) {
    globalTelemetryService = new PosTelemetryService();
  }
  return globalTelemetryService;
}

/**
 * Create a scoped telemetry service for a specific outlet
 */
export function createScopedTelemetryService(
  companyId: number,
  outletId: number
): ScopedPosTelemetryService {
  return new ScopedPosTelemetryService(companyId, outletId, getPosTelemetryService());
}

/**
 * Scoped telemetry service that automatically adds company/outlet context
 */
export class ScopedPosTelemetryService {
  constructor(
    private companyId: number,
    private outletId: number,
    private delegate: PosTelemetryService
  ) {}

  recordLatency(flowName: TelemetryFlowName, latencyMs: number, success: boolean, errorClass?: string): void {
    this.delegate.recordLatency({
      flow_name: flowName,
      latency_ms: latencyMs,
      company_id: this.companyId,
      outlet_id: this.outletId,
      success,
      error_class: errorClass,
      timestamp: Date.now()
    });
  }

  recordCommit(success: boolean, errorClass?: string): void {
    this.delegate.recordCommit({
      flow_name: "offline_local_commit",
      success,
      company_id: this.companyId,
      outlet_id: this.outletId,
      error_class: errorClass,
      timestamp: Date.now()
    });
  }

  recordQueueDepth(pendingCount: number, failedCount: number, oldestPendingMs: number | null): void {
    this.delegate.recordQueueDepth({
      company_id: this.companyId,
      outlet_id: this.outletId,
      pending_count: pendingCount,
      failed_count: failedCount,
      oldest_pending_ms: oldestPendingMs,
      timestamp: Date.now()
    });
  }

  recordRecoveryAttempt(
    attemptType: "startup" | "sync" | "manual",
    transactionsRecovered: number,
    duplicatesPrevented: number,
    durationMs: number,
    success: boolean
  ): void {
    this.delegate.recordRecoveryAttempt({
      attempt_type: attemptType,
      transactions_recovered: transactionsRecovered,
      duplicates_prevented: duplicatesPrevented,
      duration_ms: durationMs,
      success,
      timestamp: Date.now()
    });
  }
}

/**
 * Performance instrumentation wrapper for checkout flow
 */
export async function withTelemetry<T>(
  flowName: TelemetryFlowName,
  companyId: number,
  outletId: number,
  operation: () => Promise<T>
): Promise<T> {
  const telemetry = createScopedTelemetryService(companyId, outletId);
  const startTime = performance.now();

  try {
    const result = await operation();
    const latencyMs = performance.now() - startTime;
    telemetry.recordLatency(flowName, latencyMs, true);
    return result;
  } catch (error) {
    const latencyMs = performance.now() - startTime;
    const errorClass = error instanceof Error ? error.name : "UnknownError";
    telemetry.recordLatency(flowName, latencyMs, false, errorClass);
    throw error;
  }
}

/**
 * Commit telemetry wrapper with success/failure tracking
 */
export async function withCommitTelemetry<T>(
  companyId: number,
  outletId: number,
  operation: () => Promise<T>
): Promise<T> {
  const telemetry = createScopedTelemetryService(companyId, outletId);
  const startTime = performance.now();

  try {
    const result = await operation();
    const latencyMs = performance.now() - startTime;
    telemetry.recordLatency("offline_local_commit", latencyMs, true);
    telemetry.recordCommit(true);
    return result;
  } catch (error) {
    const latencyMs = performance.now() - startTime;
    const errorClass = error instanceof Error ? error.name : "UnknownError";
    telemetry.recordLatency("offline_local_commit", latencyMs, false, errorClass);
    telemetry.recordCommit(false, errorClass);
    throw error;
  }
}
