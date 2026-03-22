// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reconciliation Metrics Collector
 * 
 * Tracks metrics for reconciliation operations:
 * - Missing journal counts
 * - Unbalanced batch counts
 * - Orphan batch counts
 * - Reconciliation latency
 */

export type ReconciliationFindingType = "MISSING_JOURNAL" | "UNBALANCED" | "ORPHAN";

/**
 * Reconciliation metrics
 */
export interface ReconciliationMetrics {
  /** Total reconciliation runs */
  total_runs: number;
  
  /** Last reconciliation timestamp */
  last_run_at: string | null;
  
  /** Last reconciliation latency in ms */
  last_latency_ms: number;
  
  /** Current missing journal count */
  missing_journal_count: number;
  
  /** Current unbalanced batch count */
  unbalanced_batch_count: number;
  
  /** Current orphan batch count */
  orphan_batch_count: number;
  
  /** Total missing journals across all runs */
  total_missing_journal_findings: number;
  
  /** Total unbalanced findings across all runs */
  total_unbalanced_findings: number;
  
  /** Total orphan findings across all runs */
  total_orphan_findings: number;
  
  /** SLO: Last reconciliation latency < 5 minutes */
  slo_latency_ok: boolean;
}

/**
 * Default empty metrics
 */
export const DEFAULT_RECONCILIATION_METRICS: ReconciliationMetrics = {
  total_runs: 0,
  last_run_at: null,
  last_latency_ms: 0,
  missing_journal_count: 0,
  unbalanced_batch_count: 0,
  orphan_batch_count: 0,
  total_missing_journal_findings: 0,
  total_unbalanced_findings: 0,
  total_orphan_findings: 0,
  slo_latency_ok: true,
};

/**
 * Reconciliation result for metrics
 */
export interface ReconciliationResultForMetrics {
  companyId: number;
  outletId?: number;
  ranAt: string;
  counts: {
    missingJournal: number;
    unbalanced: number;
    orphan: number;
  };
  status: "PASS" | "FAIL";
}

/**
 * SLO threshold for reconciliation latency (5 minutes)
 */
export const RECONCILIATION_SLO_LATENCY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Reconciliation metrics collector
 */
export class ReconciliationMetricsCollector {
  private metrics: ReconciliationMetrics;
  private readonly companyMetrics: Map<number, ReconciliationMetrics> = new Map();

  constructor() {
    this.metrics = { ...DEFAULT_RECONCILIATION_METRICS };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = { ...DEFAULT_RECONCILIATION_METRICS };
    this.companyMetrics.clear();
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): ReconciliationMetrics {
    return { ...this.metrics };
  }

  /**
   * Get metrics for specific company
   */
  getCompanyMetrics(companyId: number): ReconciliationMetrics | null {
    return this.companyMetrics.get(companyId) ?? null;
  }

  /**
   * Get all company metrics
   */
  getAllCompanyMetrics(): Map<number, ReconciliationMetrics> {
    return new Map(this.companyMetrics);
  }

  /**
   * Record a reconciliation run result
   */
  recordReconciliation(result: ReconciliationResultForMetrics, latencyMs: number): void {
    const { counts, status } = result;

    // Update global metrics
    this.metrics.total_runs++;
    this.metrics.last_run_at = result.ranAt;
    this.metrics.last_latency_ms = latencyMs;
    this.metrics.missing_journal_count = counts.missingJournal;
    this.metrics.unbalanced_batch_count = counts.unbalanced;
    this.metrics.orphan_batch_count = counts.orphan;
    this.metrics.total_missing_journal_findings += counts.missingJournal;
    this.metrics.total_unbalanced_findings += counts.unbalanced;
    this.metrics.total_orphan_findings += counts.orphan;
    this.metrics.slo_latency_ok = latencyMs < RECONCILIATION_SLO_LATENCY_MS;

    // Update company-specific metrics
    const companyMetrics = this.companyMetrics.get(result.companyId) ?? {
      ...DEFAULT_RECONCILIATION_METRICS
    };
    companyMetrics.total_runs++;
    companyMetrics.last_run_at = result.ranAt;
    companyMetrics.last_latency_ms = latencyMs;
    companyMetrics.missing_journal_count = counts.missingJournal;
    companyMetrics.unbalanced_batch_count = counts.unbalanced;
    companyMetrics.orphan_batch_count = counts.orphan;
    companyMetrics.total_missing_journal_findings += counts.missingJournal;
    companyMetrics.total_unbalanced_findings += counts.unbalanced;
    companyMetrics.total_orphan_findings += counts.orphan;
    companyMetrics.slo_latency_ok = latencyMs < RECONCILIATION_SLO_LATENCY_MS;
    this.companyMetrics.set(result.companyId, companyMetrics);
  }

  /**
   * Get metrics summary for logging
   */
  getSummary(): Record<string, unknown> {
    return {
      total_runs: this.metrics.total_runs,
      last_run_at: this.metrics.last_run_at,
      last_latency_ms: this.metrics.last_latency_ms,
      missing_journal_count: this.metrics.missing_journal_count,
      unbalanced_batch_count: this.metrics.unbalanced_batch_count,
      orphan_batch_count: this.metrics.orphan_batch_count,
      slo_latency_ok: this.metrics.slo_latency_ok,
    };
  }

  /**
   * Get alert-worthy metrics (for alerting rules)
   */
  getAlertMetrics(): {
    missingJournalCount: number;
    unbalancedCount: number;
    orphanCount: number;
    sloLatencyOk: boolean;
    hasFindings: boolean;
  } {
    return {
      missingJournalCount: this.metrics.missing_journal_count,
      unbalancedCount: this.metrics.unbalanced_batch_count,
      orphanCount: this.metrics.orphan_batch_count,
      sloLatencyOk: this.metrics.slo_latency_ok,
      hasFindings:
        this.metrics.missing_journal_count > 0 ||
        this.metrics.unbalanced_batch_count > 0 ||
        this.metrics.orphan_batch_count > 0,
    };
  }
}

/**
 * Global singleton instance
 */
export const reconciliationMetricsCollector = new ReconciliationMetricsCollector();
