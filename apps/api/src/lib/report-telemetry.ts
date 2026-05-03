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
 * 
 * NOTE: Core type definitions and helpers have been moved to @jurnapod/modules-reporting.
 * This module provides Hono-specific middleware and context bindings.
 */

import type { Context } from "hono";
import { logWithTelemetry } from "../middleware/telemetry";
import { nowUTC } from "@/lib/date-helpers";

// Re-export from modules-reporting for convenience
export type {
  ReportType,
  ReportErrorClass,
  DatasetSizeBucket,
  ReportTelemetryData,
} from "@jurnapod/modules-reporting";

export {
  DATASET_SIZE_THRESHOLDS,
  REPORT_SLO_LATENCY_MS,
  QUERY_TIMEOUT_MS,
  getDatasetSizeBucket,
  classifyReportError,
  QueryTimeoutError,
  ValidationError,
  AuthError,
  withQueryTimeout,
} from "@jurnapod/modules-reporting";

import { 
  REPORT_SLO_LATENCY_MS,
  type ReportType,
  type ReportTelemetryData,
} from "@jurnapod/modules-reporting";

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
    timestamp: nowUTC(),
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
