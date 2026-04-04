// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Journal Metrics Collector
 * 
 * Tracks metrics for journal posting operations:
 * - journal_post_success_total{domain}: Successful journal postings by domain
 * - journal_post_failure_total{domain, reason}: Failed journal postings by domain and reason
 * - gl_imbalance_detected_total{}: GL imbalance alerts when debit != credit
 * - journal_missing_alert_total{}: Missing journal entry alerts
 */

import { Counter, register } from "prom-client";

/**
 * Journal domains - aligned with JOURNAL_DOMAINS in telemetry
 */
export const JOURNAL_DOMAINS = [
  "sales",
  "inventory",
  "accounting",
  "treasury",
  "fixed_assets",
] as const;

export type JournalDomain = (typeof JOURNAL_DOMAINS)[number];

/**
 * Journal failure reasons - aligned with JOURNAL_FAILURE_REASONS in telemetry
 */
export const JOURNAL_FAILURE_REASONS = [
  "validation_error",
  "gl_imbalance",
  "posting_error",
  "missing_reference",
  "internal_error",
] as const;

export type JournalFailureReason = (typeof JOURNAL_FAILURE_REASONS)[number];

/**
 * Journal metrics collector class
 */
export class JournalMetricsCollector {
  private readonly postSuccessCounter: Counter<string>;
  private readonly postFailureCounter: Counter<string>;
  private readonly glImbalanceCounter: Counter<string>;
  private readonly missingJournalCounter: Counter<string>;

  constructor() {
    // Journal posting success counter - by company_id and domain
    this.postSuccessCounter = new Counter({
      name: "journal_post_success_total",
      help: "Total successful journal postings by company and domain",
      labelNames: ["company_id", "domain"],
    });

    // Journal posting failure counter - by company_id, domain and reason
    this.postFailureCounter = new Counter({
      name: "journal_post_failure_total",
      help: "Total failed journal postings by company, domain and reason",
      labelNames: ["company_id", "domain", "reason"],
    });

    // GL imbalance counter - labeled by company_id for tenant isolation
    // Domain IDs (company_id) are numbers in business/domain, but Prometheus labels are strings.
    // Explicit string conversion with comment for clarity at call sites.
    this.glImbalanceCounter = new Counter({
      name: "gl_imbalance_detected_total",
      help: "Total GL imbalance alerts when debit != credit detected",
      labelNames: ["company_id"],
    });

    // Missing journal counter - no labels
    this.missingJournalCounter = new Counter({
      name: "journal_missing_alert_total",
      help: "Total missing journal entry alerts when posting completed but no journal created",
    });
  }

  /**
   * Get the metrics registry
   */
  getRegistry() {
    return register;
  }

  /**
   * Record a successful journal posting
   * @param companyId - Company ID (will be converted to string for Prometheus label)
   */
  recordPostSuccess(companyId: number, domain: JournalDomain): void {
    // Prometheus labels must be strings - explicit conversion
    this.postSuccessCounter.inc({ company_id: String(companyId), domain });
  }

  /**
   * Record a failed journal posting
   * @param companyId - Company ID (will be converted to string for Prometheus label)
   */
  recordPostFailure(companyId: number, domain: JournalDomain, reason: JournalFailureReason): void {
    // Prometheus labels must be strings - explicit conversion
    this.postFailureCounter.inc({ company_id: String(companyId), domain, reason });
  }

  /**
   * Record a GL imbalance detection
   * @param companyId - Company ID (will be converted to string for Prometheus label)
   */
  recordGlImbalance(companyId: number): void {
    // Domain IDs are numbers in business/domain, but Prometheus labels are strings.
    // Explicit string conversion as per Story 30.7 requirements.
    this.glImbalanceCounter.inc({ company_id: String(companyId) });
  }

  /**
   * Record a missing journal alert
   */
  recordMissingJournal(): void {
    this.missingJournalCounter.inc();
  }

  /**
   * Record posting result based on outcome
   * Convenience method to record both success and failure in one call
   * @param companyId - Company ID (will be converted to string for Prometheus label)
   */
  recordPostResult(
    companyId: number,
    domain: JournalDomain,
    success: boolean,
    reason?: JournalFailureReason
  ): void {
    if (success) {
      this.recordPostSuccess(companyId, domain);
    } else if (reason) {
      this.recordPostFailure(companyId, domain, reason);
    }
  }
}

/**
 * Global singleton instance
 */
export const journalMetrics = new JournalMetricsCollector();