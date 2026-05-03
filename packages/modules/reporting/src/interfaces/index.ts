// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Report Service Interfaces Module
 * 
 * Provides:
 * - Report service interface definitions
 * - Timeout helper functions
 * - Telemetry utilities
 */

import type { ReportType } from "../classification/index.js";
import { nowUTC } from "@jurnapod/shared";
import type {
  BaseReportFilter,
  ReportResult,
  ReportTelemetryData
} from "../contracts/index.js";
import {
  QueryTimeoutError,
  REPORT_SLO_LATENCY_MS,
  QUERY_TIMEOUT_MS,
} from "../contracts/index.js";

/**
 * Report service interface for dependency injection
 * 
 * Implementations should:
 * - Use journal data for financial reports (see contracts/index.ts for journal SoT rules)
 * - Apply proper outlet scoping and date filtering
 * - Return telemetry data alongside results
 */
export interface ReportServiceInterface {
  /**
   * Execute a report and return results with telemetry
   */
  executeReport<T>(
    reportType: ReportType,
    filter: BaseReportFilter
  ): Promise<ReportResult<T>>;

  /**
   * Get the list of supported report types
   */
  getSupportedReports(): ReportType[];
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
 * Check if latency meets SLO target
 */
export function isSloOk(latencyMs: number): boolean {
  return latencyMs < REPORT_SLO_LATENCY_MS;
}

/**
 * Get timeout value for a specific report type
 * 
 * Financial reports with complex joins may need longer timeouts
 */
export function getTimeoutForReportType(reportType: ReportType): number {
  // Journal-sourced reports with complex aggregations get extra time
  const JOURNAL_SOURCED_COMPLEX = new Set<ReportType>([
    "general_ledger",
    "trial_balance",
    "worksheet",
    "balance_sheet",
  ]);
  
  if (JOURNAL_SOURCED_COMPLEX.has(reportType)) {
    return QUERY_TIMEOUT_MS * 1.5; // 45 seconds for complex reports
  }
  
  return QUERY_TIMEOUT_MS; // Default 30 seconds
}

/**
 * Report metrics emitter function type
 */
export type ReportMetricsEmitter = (data: ReportTelemetryData) => void;

/**
 * Create a metrics emitter that logs to console
 */
export function createConsoleReportMetricsEmitter(): ReportMetricsEmitter {
  return (data: ReportTelemetryData): void => {
    const sloOk = data.latencyMs < REPORT_SLO_LATENCY_MS;
    console.log(JSON.stringify({
      type: "report_metrics",
      timestamp: nowUTC(),
      report_type: data.reportType,
      company_id: data.companyId,
      dataset_size_bucket: data.datasetSizeBucket,
      latency_ms: data.latencyMs,
      row_count: data.rowCount ?? null,
      error_class: data.errorClass ?? null,
      retry_count: data.retryCount ?? 0,
      slo_ok: sloOk
    }));
  };
}
