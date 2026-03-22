// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { listUserOutletIds, userHasOutletAccess } from "../../../../src/lib/auth";
import { requireAccessForOutletQuery, withAuth } from "../../../../src/lib/auth-guard";
import { resolveDefaultFiscalYearDateRange, FiscalYearSelectionError } from "../../../../src/lib/fiscal-years";
import { getGeneralLedgerDetail } from "../../../../src/lib/reports";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import { getCompany } from "../../../../src/lib/companies";
import {
  withQueryTimeout,
  QueryTimeoutError,
  getDatasetSizeBucket,
  classifyReportError,
  emitReportMetrics,
  QUERY_TIMEOUT_MS,
  type ReportType,
} from "../../../../src/lib/report-telemetry";
import type { Context } from "hono";

const REPORT_TYPE: ReportType = "general_ledger";

const querySchema = z.object({
  outlet_id: z.coerce.number().int().positive().optional(),
  account_id: z.coerce.number().int().positive().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  round: z.coerce.number().int().min(0).max(6).optional(),
  line_limit: z.coerce.number().int().min(1).max(500).optional(),
  line_offset: z.coerce.number().int().min(0).optional()
});

function getDefaultDateRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);
  fromDate.setDate(now.getDate() - 30);
  const from = fromDate.toISOString().slice(0, 10);
  return { dateFrom: from, dateTo: to };
}

async function resolveDateRange(
  companyId: number,
  parsed: { date_from?: string; date_to?: string }
): Promise<{ dateFrom: string; dateTo: string }> {
  if (parsed.date_from || parsed.date_to) {
    const defaults = getDefaultDateRange();
    return {
      dateFrom: parsed.date_from ?? defaults.dateFrom,
      dateTo: parsed.date_to ?? defaults.dateTo
    };
  }

  return resolveDefaultFiscalYearDateRange(companyId);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Count total lines in general ledger result
 */
function countTotalLines(rows: Awaited<ReturnType<typeof getGeneralLedgerDetail>>): number {
  return rows.reduce((sum, row) => sum + row.lines.length, 0);
}

/**
 * Handle report error with proper telemetry
 */
function handleReportError(c: Context | null, error: unknown, startTime: number, companyId: number) {
  const errorClass = classifyReportError(error);
  const latencyMs = Date.now() - startTime;

  // Emit telemetry for error
  const bucket = getDatasetSizeBucket(0); // Unknown at error time
  emitReportMetrics(c, {
    reportType: REPORT_TYPE,
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

  // Log internal error without leaking details
  console.error("GET /reports/general-ledger failed:", error);
  return errorResponse("INTERNAL_SERVER_ERROR", "General ledger report failed", 500);
}

export const GET = withAuth(
  async (request, auth) => {
    const startTime = Date.now();

    try {
      const url = new URL(request.url);
      const parsed = querySchema.parse({
        outlet_id: url.searchParams.get("outlet_id") ?? undefined,
        account_id: url.searchParams.get("account_id") ?? undefined,
        date_from: url.searchParams.get("date_from") ?? undefined,
        date_to: url.searchParams.get("date_to") ?? undefined,
        round: url.searchParams.get("round") ?? undefined,
        line_limit: url.searchParams.get("line_limit") ?? undefined,
        line_offset: url.searchParams.get("line_offset") ?? undefined
      });

      const { dateFrom, dateTo } = await resolveDateRange(auth.companyId, parsed);
      const roundDecimals = parsed.round ?? 2;

      let outletIds: number[];
      if (typeof parsed.outlet_id === "number") {
        const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
        if (!hasAccess) {
          return errorResponse("FORBIDDEN", "Forbidden", 403);
        }
        outletIds = [parsed.outlet_id];
      } else {
        outletIds = await listUserOutletIds(auth.userId, auth.companyId);
      }

      // Get company timezone for date boundary conversion
      const company = await getCompany(auth.companyId);
      const timezone = company.timezone ?? 'UTC';

      // Execute with timeout
      const rows = await withQueryTimeout(
        getGeneralLedgerDetail({
          companyId: auth.companyId,
          outletIds,
          dateFrom,
          dateTo,
          includeUnassignedOutlet: typeof parsed.outlet_id !== "number",
          accountId: parsed.account_id,
          lineLimit: parsed.account_id ? (parsed.line_limit ?? 200) : undefined,
          lineOffset: parsed.account_id ? parsed.line_offset ?? 0 : undefined,
          timezone
        }),
        QUERY_TIMEOUT_MS
      );

      // Count total lines for dataset size bucket
      const totalLines = countTotalLines(rows);
      const latencyMs = Date.now() - startTime;
      const bucket = getDatasetSizeBucket(totalLines);

      // Emit success telemetry
      emitReportMetrics(null, {
        reportType: REPORT_TYPE,
        companyId: auth.companyId,
        datasetSizeBucket: bucket,
        latencyMs,
        rowCount: rows.length,
      });

      const roundedRows = rows.map((row) => ({
        ...row,
        opening_debit: roundTo(row.opening_debit ?? 0, roundDecimals),
        opening_credit: roundTo(row.opening_credit ?? 0, roundDecimals),
        period_debit: roundTo(row.period_debit ?? 0, roundDecimals),
        period_credit: roundTo(row.period_credit ?? 0, roundDecimals),
        opening_balance: roundTo(row.opening_balance ?? 0, roundDecimals),
        ending_balance: roundTo(row.ending_balance ?? 0, roundDecimals),
        lines: row.lines.map((line) => ({
          ...line,
          debit: roundTo(line.debit ?? 0, roundDecimals),
          credit: roundTo(line.credit ?? 0, roundDecimals),
          balance: roundTo(line.balance ?? 0, roundDecimals)
        }))
      }));

      return successResponse({
        filters: {
          outlet_ids: outletIds,
          account_id: parsed.account_id ?? null,
          date_from: dateFrom,
          date_to: dateTo,
          round: roundDecimals,
          line_limit: parsed.account_id ? (parsed.line_limit ?? 200) : null,
          line_offset: parsed.account_id ? parsed.line_offset ?? 0 : null
        },
        rows: roundedRows
      });
    } catch (error) {
      return handleReportError(null, error, startTime, auth.companyId);
    }
  },
  [
    requireAccessForOutletQuery({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "reports",
      permission: "read"
    })
  ]
);
