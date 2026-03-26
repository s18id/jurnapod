// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Report Telemetry Module
 * 
 * Provides telemetry for report endpoints:
 * - Latency histogram tracking per report type
 * - Error classification and counting
 * - Dataset size bucketing
 * - Structured logging for report operations
 */

import type { Context } from "hono";
import { logWithTelemetry } from "../middleware/telemetry";

/**
 * Report types that have SLO targets
 */
export type ReportType = 
  | "trial_balance" 
  | "general_ledger" 
  | "profit_loss" 
  | "worksheet" 
  | "pos_transactions"
  | "journals"
  | "daily_sales"
  | "pos_payments"
  | "receivables_ageing"
  | "other";

/**
 * Error classification for report failures
 */
export type ReportErrorClass = "timeout" | "validation" | "system" | "auth";

/**
 * Dataset size buckets based on row count
 */
export type DatasetSizeBucket = "small" | "medium" | "large" | "xlarge";

/**
 * Report telemetry data
 */
export interface ReportTelemetryData {
  reportType: ReportType;
  companyId: number;
  datasetSizeBucket: DatasetSizeBucket;
  errorClass?: ReportErrorClass;
  latencyMs: number;
  rowCount?: number;
  retryCount?: number;
}

/**
 * Dataset size thresholds (row count)
 */
export const DATASET_SIZE_THRESHOLDS = {
  small: 100,      // <= 100 rows
  medium: 500,     // 101-500 rows
  large: 2000,     // 501-2000 rows
  xlarge: Infinity // > 2000 rows
} as const;

/**
 * Report SLO latency target (5 seconds in ms)
 */
export const REPORT_SLO_LATENCY_MS = 5000;

/**
 * Query timeout default (30 seconds in ms)
 */
export const QUERY_TIMEOUT_MS = 30000;

/**
 * Determine dataset size bucket based on row count
 */
export function getDatasetSizeBucket(rowCount: number): DatasetSizeBucket {
  if (rowCount <= DATASET_SIZE_THRESHOLDS.small) return "small";
  if (rowCount <= DATASET_SIZE_THRESHOLDS.medium) return "medium";
  if (rowCount <= DATASET_SIZE_THRESHOLDS.large) return "large";
  return "xlarge";
}

/**
 * Classify error for report failure
 */
export function classifyReportError(error: unknown): ReportErrorClass {
  if (error instanceof QueryTimeoutError) return "timeout";
  if (error instanceof ValidationError) return "validation";
  if (error instanceof AuthError) return "auth";
  return "system";
}

/**
 * Custom error for query timeout
 */
export class QueryTimeoutError extends Error {
  readonly name = "QueryTimeoutError";
  constructor(message = "Query execution exceeded timeout threshold") {
    super(message);
  }
}

/**
 * Custom error for validation failures
 */
export class ValidationError extends Error {
  readonly name = "ValidationError";
  constructor(message: string) {
    super(message);
  }
}

/**
 * Custom error for auth failures
 */
export class AuthError extends Error {
  readonly name = "AuthError";
  constructor(message = "Authentication required") {
    super(message);
  }
}

/**
 * Execute a promise with a timeout
 */
export async function withQueryTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = QUERY_TIMEOUT_MS
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new QueryTimeoutError()), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Emit report telemetry metrics (structured log based)
 */
export function emitReportMetrics(
  c: Context | null,
  data: ReportTelemetryData
): void {
  const {
    reportType,
    companyId,
    datasetSizeBucket,
    latencyMs,
    rowCount,
    errorClass,
    retryCount
  } = data;

  // Determine if SLO is met
  const sloOk = latencyMs < REPORT_SLO_LATENCY_MS;

  // Log based on outcome (only if context available)
  if (c) {
    if (errorClass) {
      logWithTelemetry(c, "error", "Report request failed", {
        latency_ms: latencyMs,
        error_class: errorClass,
        company_id: companyId,
        flow_name: reportType,
      });
    } else {
      logWithTelemetry(c, "info", "Report request completed", {
        latency_ms: latencyMs,
        company_id: companyId,
        flow_name: reportType,
        status: sloOk ? 200 : 200, // Still 200 but flag slo_ok=false
      });
    }
  }

  // Log structured metrics for dashboards (always available)
  console.log(JSON.stringify({
    type: "report_metrics",
    timestamp: new Date().toISOString(),
    report_type: reportType,
    company_id: companyId,
    dataset_size_bucket: datasetSizeBucket,
    latency_ms: latencyMs,
    row_count: rowCount,
    error_class: errorClass ?? null,
    retry_count: retryCount ?? 0,
    slo_ok: sloOk
  }));
}

/**
 * Middleware to track report telemetry
 */
export function withReportTelemetry(reportType: ReportType) {
  return async (c: Context, next: () => Promise<void>): Promise<void> => {
    const startTime = Date.now();

    // Store report type in context for later use
    const ctx = c.get("telemetry");
    if (ctx) {
      ctx.flowName = reportType;
    }

    await next();

    // After response, telemetry is recorded by the route handler
  };
}

/**
 * Get report type from path
 */
export function getReportTypeFromPath(path: string): ReportType {
  if (path.includes("trial-balance")) return "trial_balance";
  if (path.includes("general-ledger")) return "general_ledger";
  if (path.includes("profit-loss")) return "profit_loss";
  if (path.includes("worksheet")) return "worksheet";
  return "other";
}

/**
 * Log report structured info for alerting
 */
export function logReportStructured(
  c: Context,
  level: "info" | "warn" | "error",
  message: string,
  extra?: Partial<{
    report_type: string;
    latency_ms: number;
    row_count: number;
    error_class: string;
    company_id: number;
  }>
): void {
  logWithTelemetry(c, level, message, {
    flow_name: extra?.report_type,
    latency_ms: extra?.latency_ms,
    company_id: extra?.company_id,
    error_class: extra?.error_class,
  });
}
