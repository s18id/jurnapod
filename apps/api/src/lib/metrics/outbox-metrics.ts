// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Outbox Health Metrics Collector
 * 
 * Tracks metrics for outbox queue health:
 * - outbox_lag_items{company_id, outlet_id}: Count of pending items in outbox
 * - outbox_retry_depth{company_id, outlet_id}: Max retry count for any item
 * - outbox_failure_total{company_id, outlet_id, reason}: Failure count by reason
 * - client_tx_id_duplicates_total{company_id, outlet_id}: Duplicates detected and suppressed
 * 
 * Note: Domain IDs (company_id, outlet_id) are numbers in business/domain, but 
 * Prometheus labels are strings. Explicit string conversion is used at call sites.
 */

import { Counter, Gauge, register } from "prom-client";

/**
 * Outbox failure reasons - aligned with OUTBOX_FAILURE_REASONS in telemetry
 */
export const OUTBOX_FAILURE_REASONS = [
  "network_error",
  "timeout",
  "validation_error",
  "conflict",
  "internal_error",
] as const;

export type OutboxFailureReason = (typeof OUTBOX_FAILURE_REASONS)[number];

/**
 * Outbox metrics collector class
 */
export class OutboxMetricsCollector {
  private readonly outboxLagItems: Gauge<string>;
  private readonly outboxRetryDepth: Gauge<string>;
  private readonly outboxFailures: Counter<string>;
  private readonly clientTxIdDuplicates: Counter<string>;

  constructor() {
    // Outbox lag items gauge - count of pending items per company/outlet
    // company_id added for tenant isolation per Story 30.7
    this.outboxLagItems = new Gauge({
      name: "outbox_lag_items",
      help: "Count of pending items in outbox per company/outlet",
      labelNames: ["company_id", "outlet_id"],
    });

    // Outbox retry depth gauge - max retry count for any item per company/outlet
    // company_id added for tenant isolation per Story 30.7
    this.outboxRetryDepth = new Gauge({
      name: "outbox_retry_depth",
      help: "Max retry count for any outbox item per company/outlet",
      labelNames: ["company_id", "outlet_id"],
    });

    // Outbox failures counter - failures by reason per company/outlet
    // company_id added for tenant isolation per Story 30.7
    this.outboxFailures = new Counter({
      name: "outbox_failure_total",
      help: "Total outbox failures by reason per company/outlet",
      labelNames: ["company_id", "outlet_id", "reason"],
    });

    // Client TX ID duplicates counter - per company/outlet
    // company_id added for tenant isolation per Story 30.7
    this.clientTxIdDuplicates = new Counter({
      name: "client_tx_id_duplicates_total",
      help: "Total duplicate client_tx_id events detected and suppressed per company/outlet",
      labelNames: ["company_id", "outlet_id"],
    });
  }

  /**
   * Get the metrics registry
   */
  getRegistry() {
    return register;
  }

  /**
   * Record a duplicate client_tx_id detection
   * @param companyId - Company ID (will be converted to string for Prometheus label)
   * @param outletId - Outlet ID (will be converted to string for Prometheus label)
   */
  recordDuplicate(companyId: number, outletId: number): void {
    // Domain IDs are numbers in business/domain, but Prometheus labels are strings.
    // Explicit string conversion as per Story 30.7 requirements.
    this.clientTxIdDuplicates.inc({ company_id: String(companyId), outlet_id: String(outletId) });
  }

  /**
   * Record an outbox failure
   * @param companyId - Company ID (will be converted to string for Prometheus label)
   * @param outletId - Outlet ID (will be converted to string for Prometheus label)
   * @param reason - Failure reason
   */
  recordFailure(companyId: number, outletId: number, reason: OutboxFailureReason): void {
    // Domain IDs are numbers in business/domain, but Prometheus labels are strings.
    // Explicit string conversion as per Story 30.7 requirements.
    this.outboxFailures.inc({ company_id: String(companyId), outlet_id: String(outletId), reason });
  }

  /**
   * Set the outbox lag items count for an outlet
   * @param companyId - Company ID (will be converted to string for Prometheus label)
   * @param outletId - Outlet ID (will be converted to string for Prometheus label)
   * @param count - Lag items count
   */
  setLagItems(companyId: number, outletId: number, count: number): void {
    // Domain IDs are numbers in business/domain, but Prometheus labels are strings.
    // Explicit string conversion as per Story 30.7 requirements.
    this.outboxLagItems.set({ company_id: String(companyId), outlet_id: String(outletId) }, count);
  }

  /**
   * Set the max retry depth for an outlet
   * @param companyId - Company ID (will be converted to string for Prometheus label)
   * @param outletId - Outlet ID (will be converted to string for Prometheus label)
   * @param depth - Max retry depth
   */
  setRetryDepth(companyId: number, outletId: number, depth: number): void {
    // Domain IDs are numbers in business/domain, but Prometheus labels are strings.
    // Explicit string conversion as per Story 30.7 requirements.
    this.outboxRetryDepth.set({ company_id: String(companyId), outlet_id: String(outletId) }, depth);
  }

  /**
   * Increment lag items (for when items are added to outbox)
   * @param companyId - Company ID (will be converted to string for Prometheus label)
   * @param outletId - Outlet ID (will be converted to string for Prometheus label)
   */
  incLagItems(companyId: number, outletId: number): void {
    // Domain IDs are numbers in business/domain, but Prometheus labels are strings.
    // Explicit string conversion as per Story 30.7 requirements.
    this.outboxLagItems.inc({ company_id: String(companyId), outlet_id: String(outletId) });
  }

  /**
   * Decrement lag items (for when items are successfully synced)
   * @param companyId - Company ID (will be converted to string for Prometheus label)
   * @param outletId - Outlet ID (will be converted to string for Prometheus label)
   */
  decLagItems(companyId: number, outletId: number): void {
    // Domain IDs are numbers in business/domain, but Prometheus labels are strings.
    // Explicit string conversion as per Story 30.7 requirements.
    this.outboxLagItems.dec({ company_id: String(companyId), outlet_id: String(outletId) });
  }
}

/**
 * Global singleton instance
 */
export const outboxMetrics = new OutboxMetricsCollector();