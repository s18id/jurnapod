// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { listUserOutletIds, userHasOutletAccess } from "../../../../src/lib/auth";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import { getGeneralLedgerDetail } from "../../../../src/lib/reports";

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
        account_id: url.searchParams.get("account_id") ?? undefined,
        date_from: url.searchParams.get("date_from") ?? undefined,
        date_to: url.searchParams.get("date_to") ?? undefined,
        round: url.searchParams.get("round") ?? undefined,
        line_limit: url.searchParams.get("line_limit") ?? undefined,
        line_offset: url.searchParams.get("line_offset") ?? undefined
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

      const rows = await getGeneralLedgerDetail({
        companyId: auth.companyId,
        outletIds,
        dateFrom,
        dateTo,
        includeUnassignedOutlet: typeof parsed.outlet_id !== "number",
        accountId: parsed.account_id,
        lineLimit: parsed.account_id ? (parsed.line_limit ?? 200) : undefined,
        lineOffset: parsed.account_id ? parsed.line_offset ?? 0 : undefined
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

      return Response.json(
        {
          ok: true,
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
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json({ ok: false, error: { code: "INVALID_REQUEST", message: "Invalid request" } }, { status: 400 });
      }

      console.error("GET /reports/general-ledger failed", error);
      return Response.json(
        { ok: false, error: { code: "INTERNAL_SERVER_ERROR", message: "General ledger report failed" } },
        { status: 500 }
      );
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
