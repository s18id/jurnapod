// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { listUserOutletIds, userHasOutletAccess } from "../../../../src/lib/auth";
import { requireRoleForOutletQuery, withAuth } from "../../../../src/lib/auth-guard";
import { resolveDefaultFiscalYearDateRange, FiscalYearSelectionError } from "../../../../src/lib/fiscal-years";
import { getProfitLoss } from "../../../../src/lib/reports";
import { errorResponse, successResponse } from "../../../../src/lib/response";

const querySchema = z.object({
  outlet_id: z.coerce.number().int().positive().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  round: z.coerce.number().int().min(0).max(6).optional()
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

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const parsed = querySchema.parse({
        outlet_id: url.searchParams.get("outlet_id") ?? undefined,
        date_from: url.searchParams.get("date_from") ?? undefined,
        date_to: url.searchParams.get("date_to") ?? undefined,
        round: url.searchParams.get("round") ?? undefined
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

      const report = await getProfitLoss({
        companyId: auth.companyId,
        outletIds,
        dateFrom,
        dateTo,
        includeUnassignedOutlet: typeof parsed.outlet_id !== "number"
      });

      const roundedTotals = {
        total_debit: roundTo(report.totals.total_debit ?? 0, roundDecimals),
        total_credit: roundTo(report.totals.total_credit ?? 0, roundDecimals),
        net: roundTo(report.totals.net ?? 0, roundDecimals)
      };

      const roundedRows = report.rows.map((row) => ({
        ...row,
        total_debit: roundTo(row.total_debit ?? 0, roundDecimals),
        total_credit: roundTo(row.total_credit ?? 0, roundDecimals),
        net: roundTo(row.net ?? 0, roundDecimals)
      }));

      return successResponse({
        filters: {
          outlet_ids: outletIds,
          date_from: dateFrom,
          date_to: dateTo,
          round: roundDecimals
        },
        totals: roundedTotals,
        rows: roundedRows
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof FiscalYearSelectionError) {
        return errorResponse("FISCAL_YEAR_REQUIRED", error.message, 400);
      }

      console.error("GET /reports/profit-loss failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Profit loss report failed", 500);
    }
  },
  [requireRoleForOutletQuery(["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"])]
);
