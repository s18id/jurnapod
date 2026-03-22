// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Prometheus Metrics Configuration for Critical Flows
 * 
 * Defines metrics patterns, histogram buckets, and label schemas
 * for monitoring critical flows.
 */

import type { CriticalFlowName } from "./slo.js";

/**
 * Cardinality-safe labels allowed in metrics
 * These are low-cardinality identifiers that do not contain PII
 */
export const SAFE_METRIC_LABELS = [
  "company_id",
  "outlet_id",
  "flow_name",
  "status",
  "error_class",
] as const;

export type SafeMetricLabel = (typeof SAFE_METRIC_LABELS)[number];

/**
 * High-cardinality labels that are FORBIDDEN in metrics
 * These contain PII or would cause cardinality explosion
 */
export const FORBIDDEN_METRIC_LABELS = [
  "user_id",
  "transaction_id",
  "item_id",
  "customer_id",
  "email",
  "name",
  "card_number",
  "phone",
  "address",
] as const;

export type ForbiddenMetricLabel = (typeof FORBIDDEN_METRIC_LABELS)[number];

/**
 * Error classification for metrics
 */
export const ERROR_CLASSES = [
  "timeout",
  "validation",
  "duplicate",
  "not_found",
  "unauthorized",
  "internal",
  "network",
] as const;

export type ErrorClass = (typeof ERROR_CLASSES)[number];

/**
 * Request status for metrics
 */
export const REQUEST_STATUSES = ["success", "error", "timeout"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * Histogram bucket configuration for latency metrics (in seconds)
 * Aligned to SLO targets: 1s for POS, 5s for reports, 30s for sync
 */
export const LATENCY_BUCKETS = {
  // POS payment capture: target < 1s
  pos: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  // Sync completion: target < 30s
  sync: [0.1, 0.5, 1, 5, 10, 20, 30, 60],
  // Reports: target < 5s
  reports: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  // GL posting: target < 5s
  posting: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
} as const;

/**
 * Metric name patterns for each flow
 */
export const METRIC_PATTERNS: Record<CriticalFlowName, { latency: string; errors: string; counter: string }> = {
  payment_capture: {
    latency: "payment_capture_latency_seconds",
    errors: "payment_capture_errors_total",
    counter: "payment_capture_total",
  },
  offline_local_commit: {
    latency: "offline_local_commit_latency_seconds",
    errors: "offline_local_commit_errors_total",
    counter: "offline_local_commit_total",
  },
  sync_replay_idempotency: {
    latency: "sync_replay_idempotency_latency_seconds",
    errors: "sync_replay_idempotency_errors_total",
    counter: "sync_replay_duplicates_total",
  },
  pos_to_gl_posting: {
    latency: "pos_to_gl_posting_latency_seconds",
    errors: "pos_to_gl_posting_errors_total",
    counter: "pos_to_gl_posting_total",
  },
  trial_balance: {
    latency: "trial_balance_latency_seconds",
    errors: "trial_balance_errors_total",
    counter: "trial_balance_total",
  },
  general_ledger: {
    latency: "general_ledger_latency_seconds",
    errors: "general_ledger_errors_total",
    counter: "general_ledger_total",
  },
};

/**
 * Validate that a label name is safe to use in metrics
 */
export function isLabelSafe(labelName: string): boolean {
  if (FORBIDDEN_METRIC_LABELS.includes(labelName as ForbiddenMetricLabel)) {
    return false;
  }
  if (!SAFE_METRIC_LABELS.includes(labelName as SafeMetricLabel)) {
    return false;
  }
  return true;
}

/**
 * Validate label names contain no PII patterns
 */
export function validateNoPII(labelValue: string): boolean {
  // Check for common PII patterns
  const piiPatterns = [
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, // email
    /^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/, // credit card
    /^\+?[\d\s-]{10,}$/, // phone
    /^\d{6}$/, // postal code
  ];

  return !piiPatterns.some((pattern) => pattern.test(labelValue));
}
