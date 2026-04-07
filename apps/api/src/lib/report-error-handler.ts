// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Report Error Handler
 *
 * Consolidates telemetry wrapping and error handling for report endpoints.
 * Reduces repetition across route handlers.
 */

import { z } from "zod";
import {
  withQueryTimeout,
  QueryTimeoutError,
  getDatasetSizeBucket,
  classifyReportError,
  emitReportMetrics,
  QUERY_TIMEOUT_MS,
  type ReportType,
} from "@/lib/report-telemetry";
import { FiscalYearSelectionError } from "@/lib/fiscal-years";
import { errorResponse } from "@/lib/response";

/**
 * Execute a report query with timeout and telemetry.
 */
export async function executeReport<T>(
  reportType: ReportType,
  companyId: number,
  queryFn: () => Promise<T>,
  _options: { startTime: number; rowCount?: (result: T) => number } = { startTime: Date.now() }
): Promise<T> {
  const result = await withQueryTimeout(queryFn(), QUERY_TIMEOUT_MS);
  return result;
}

/**
 * Emit success telemetry for a report.
 */
export function emitReportSuccess(
  reportType: ReportType,
  companyId: number,
  startTime: number,
  rowCount: number
): void {
  const latencyMs = Date.now() - startTime;
  const bucket = getDatasetSizeBucket(rowCount);
  emitReportMetrics(null, {
    reportType,
    companyId,
    datasetSizeBucket: bucket,
    latencyMs,
    rowCount,
  });
}

/**
 * Handle report errors and return appropriate HTTP response.
 */
export function handleReportError(
  error: unknown,
  startTime: number,
  companyId: number,
  reportType: string
): Response {
  const errorClass = classifyReportError(error);
  const latencyMs = Date.now() - startTime;

  const bucket = getDatasetSizeBucket(0);
  emitReportMetrics(null, {
    reportType: reportType as ReportType,
    companyId,
    datasetSizeBucket: bucket,
    latencyMs,
    errorClass,
  });

  if (error instanceof QueryTimeoutError) {
    return errorResponse(
      "TIMEOUT",
      "Report generation timed out. Please try a smaller date range.",
      504
    );
  }

  if (error instanceof z.ZodError) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid request parameters: " + error.errors.map(e => e.message).join(", "),
      400
    );
  }

  if (error instanceof FiscalYearSelectionError) {
    return errorResponse("FISCAL_YEAR_REQUIRED", error.message, 400);
  }

  if (error instanceof Error && error.message === "Forbidden") {
    return errorResponse("FORBIDDEN", "Forbidden", 403);
  }

  console.error(`GET /reports/${reportType} failed:`, error);
  return errorResponse("INTERNAL_SERVER_ERROR", `${reportType} report failed`, 500);
}
