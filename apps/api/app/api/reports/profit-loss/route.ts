// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { listUserOutletIds, userHasOutletAccess } from "../../../../src/lib/auth";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import { getProfitLoss } from "../../../../src/lib/reports";

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

      const defaults = getDefaultDateRange();
      const dateFrom = parsed.date_from ?? defaults.dateFrom;
      const dateTo = parsed.date_to ?? defaults.dateTo;
      const roundDecimals = parsed.round ?? 2;

      let outletIds: number[];
      if (typeof parsed.outlet_id === "number") {
        const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
        if (!hasAccess) {
          return Response.json({ ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } }, { status: 403 });
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

      return Response.json(
        {
          ok: true,
          filters: {
            outlet_ids: outletIds,
            date_from: dateFrom,
            date_to: dateTo,
            round: roundDecimals
          },
          totals: roundedTotals,
          rows: roundedRows
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json({ ok: false, error: { code: "INVALID_REQUEST", message: "Invalid request" } }, { status: 400 });
      }

      console.error("GET /reports/profit-loss failed", error);
      return Response.json(
        { ok: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Profit loss report failed" } },
        { status: 500 }
      );
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
