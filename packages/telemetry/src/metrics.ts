// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Prometheus Metrics Configuration for Critical Flows
 * 
 * Defines metrics patterns, histogram buckets, label schemas,
 * and metric registry for monitoring critical flows.
 */

import { z } from "zod";
import type { CriticalFlowName } from "./slo.js";

// ============================================================================
// LABEL DEFINITIONS
// ============================================================================

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

// ============================================================================
// HISTOGRAM BUCKETS
// ============================================================================

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
  // Sync SLO-aligned buckets (p50 < 200ms, p95 < 500ms, p99 < 2s)
  syncSlo: [0.05, 0.1, 0.2, 0.5, 1, 2, 5],
} as const;

// ============================================================================
// METRIC PATTERNS
// ============================================================================

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

// ============================================================================
// SYNC METRICS SCHEMA (Story 30.1)
// ============================================================================

/**
 * Sync metrics labels
 */
export const SYNC_METRIC_LABELS = ["outlet_id", "status"] as const;
export type SyncMetricLabel = (typeof SYNC_METRIC_LABELS)[number];

/**
 * Sync status values
 */
export const SYNC_STATUSES = ["success", "error", "timeout"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/**
 * Outbox failure reasons
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
 * Journal domain values
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
 * Journal failure reasons
 */
export const JOURNAL_FAILURE_REASONS = [
  "validation_error",
  "gl_imbalance",
  "posting_error",
  "missing_reference",
  "internal_error",
] as const;
export type JournalFailureReason = (typeof JOURNAL_FAILURE_REASONS)[number];

// ============================================================================
// METRIC NAME CONSTANTS (Story 30.1)
// ============================================================================

/**
 * Sync metric names
 */
export const SYNC_METRIC_NAMES = {
  PUSH_LATENCY_MS: "sync_push_latency_ms",
  PUSH_TOTAL: "sync_push_total",
  PULL_LATENCY_MS: "sync_pull_latency_ms",
  PULL_TOTAL: "sync_pull_total",
  DUPLICATES_TOTAL: "client_tx_id_duplicates_total",
  CONFLICTS_TOTAL: "sync_conflicts_total",
} as const;

/**
 * Outbox metric names
 */
export const OUTBOX_METRIC_NAMES = {
  LAG_ITEMS: "outbox_lag_items",
  RETRY_DEPTH: "outbox_retry_depth",
  FAILURE_TOTAL: "outbox_failure_total",
} as const;

/**
 * Journal metric names
 */
export const JOURNAL_METRIC_NAMES = {
  POST_SUCCESS_TOTAL: "journal_post_success_total",
  POST_FAILURE_TOTAL: "journal_post_failure_total",
  GL_IMBALANCE_TOTAL: "gl_imbalance_detected_total",
  MISSING_ALERT_TOTAL: "journal_missing_alert_total",
} as const;

// ============================================================================
// SLO CONFIGURATION SCHEMA (YAML loading)
// ============================================================================

/**
 * Sync latency SLO schema
 */
export const SyncLatencySLOschema = z.object({
  p50_threshold_ms: z.number().positive(),
  p95_threshold_ms: z.number().positive(),
  p99_threshold_ms: z.number().positive(),
});

/**
 * Sync SLO schema
 */
export const SyncSLOschema = z.object({
  latency: SyncLatencySLOschema,
  success_rate_threshold: z.number().min(0).max(1),
  duplicate_rate_threshold: z.number().min(0).max(1),
});

/**
 * Outbox SLO schema
 */
export const OutboxSLOschema = z.object({
  lag_warning_threshold: z.number().positive().int(),
  lag_critical_threshold: z.number().positive().int(),
  retry_depth_warning: z.number().nonnegative().int(),
  retry_depth_critical: z.number().nonnegative().int(),
  failure_rate_threshold: z.number().min(0).max(1),
});

/**
 * Journal SLO schema
 */
export const JournalSLOschema = z.object({
  posting_success_rate_threshold: z.number().min(0).max(1),
  gl_balance_check_enabled: z.boolean(),
});

/**
 * Complete SLO configuration schema
 */
export const SLO_CONFIG_SCHEMA = z.object({
  sync: SyncSLOschema,
  outbox: OutboxSLOschema,
  journal: JournalSLOschema,
});

export type SLOConfig = z.infer<typeof SLO_CONFIG_SCHEMA>;
export type SyncSLO = z.infer<typeof SyncSLOschema>;
export type OutboxSLO = z.infer<typeof OutboxSLOschema>;
export type JournalSLO = z.infer<typeof JournalSLOschema>;

/**
 * Default SLO configuration (used when YAML file is not available)
 */
export const DEFAULT_SLO_CONFIG: SLOConfig = {
  sync: {
    latency: {
      p50_threshold_ms: 200,
      p95_threshold_ms: 500,
      p99_threshold_ms: 2000,
    },
    success_rate_threshold: 0.995,
    duplicate_rate_threshold: 0.001,
  },
  outbox: {
    lag_warning_threshold: 50,
    lag_critical_threshold: 100,
    retry_depth_warning: 2,
    retry_depth_critical: 5,
    failure_rate_threshold: 0.005,
  },
  journal: {
    posting_success_rate_threshold: 0.999,
    gl_balance_check_enabled: true,
  },
};

// ============================================================================
// LABEL VALIDATION
// ============================================================================

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

// ============================================================================
// METRICS REGISTRY TYPES
// ============================================================================

/**
 * Sync metrics labels interface
 */
export interface SyncPushLabels {
  outlet_id: string;
  status: SyncStatus;
}

export interface SyncPullLabels {
  outlet_id: string;
  status: SyncStatus;
}

export interface ClientTxDuplicateLabels {
  outlet_id: string;
}

export interface OutboxLagLabels {
  outlet_id: string;
}

export interface OutboxRetryDepthLabels {
  outlet_id: string;
}

export interface OutboxFailureLabels {
  outlet_id: string;
  reason: OutboxFailureReason;
}

export interface JournalPostSuccessLabels {
  domain: JournalDomain;
}

export interface JournalPostFailureLabels {
  domain: JournalDomain;
  reason: JournalFailureReason;
}
