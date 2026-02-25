import { z } from "zod";
import { listUserOutletIds, userHasOutletAccess } from "../../../../src/lib/auth";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import { getTrialBalanceWorksheet } from "../../../../src/lib/reports";

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

      const rows = await getTrialBalanceWorksheet({
        companyId: auth.companyId,
        outletIds,
        dateFrom,
        dateTo,
        includeUnassignedOutlet: typeof parsed.outlet_id !== "number"
      });

      const summary = rows.reduce(
        (acc, row) => ({
          opening_debit: acc.opening_debit + (row.opening_debit ?? 0),
          opening_credit: acc.opening_credit + (row.opening_credit ?? 0),
          period_debit: acc.period_debit + (row.period_debit ?? 0),
          period_credit: acc.period_credit + (row.period_credit ?? 0),
          ending_debit: acc.ending_debit + (row.ending_debit ?? 0),
          ending_credit: acc.ending_credit + (row.ending_credit ?? 0),
          total_debit: acc.total_debit + (row.total_debit ?? 0),
          total_credit: acc.total_credit + (row.total_credit ?? 0),
          balance: acc.balance + (row.balance ?? 0),
          bs_debit: acc.bs_debit + (row.bs_debit ?? 0),
          bs_credit: acc.bs_credit + (row.bs_credit ?? 0),
          pl_debit: acc.pl_debit + (row.pl_debit ?? 0),
          pl_credit: acc.pl_credit + (row.pl_credit ?? 0)
        }),
        {
          opening_debit: 0,
          opening_credit: 0,
          period_debit: 0,
          period_credit: 0,
          ending_debit: 0,
          ending_credit: 0,
          total_debit: 0,
          total_credit: 0,
          balance: 0,
          bs_debit: 0,
          bs_credit: 0,
          pl_debit: 0,
          pl_credit: 0
        }
      );
      const roundedSummary = {
        opening_debit: roundTo(summary.opening_debit, roundDecimals),
        opening_credit: roundTo(summary.opening_credit, roundDecimals),
        period_debit: roundTo(summary.period_debit, roundDecimals),
        period_credit: roundTo(summary.period_credit, roundDecimals),
        ending_debit: roundTo(summary.ending_debit, roundDecimals),
        ending_credit: roundTo(summary.ending_credit, roundDecimals),
        total_debit: roundTo(summary.total_debit, roundDecimals),
        total_credit: roundTo(summary.total_credit, roundDecimals),
        balance: roundTo(summary.balance, roundDecimals),
        bs_debit: roundTo(summary.bs_debit, roundDecimals),
        bs_credit: roundTo(summary.bs_credit, roundDecimals),
        pl_debit: roundTo(summary.pl_debit, roundDecimals),
        pl_credit: roundTo(summary.pl_credit, roundDecimals)
      };

      const roundedRows = rows.map((row) => ({
        ...row,
        opening_debit: roundTo(row.opening_debit ?? 0, roundDecimals),
        opening_credit: roundTo(row.opening_credit ?? 0, roundDecimals),
        period_debit: roundTo(row.period_debit ?? 0, roundDecimals),
        period_credit: roundTo(row.period_credit ?? 0, roundDecimals),
        ending_balance: roundTo(row.ending_balance ?? 0, roundDecimals),
        ending_debit: roundTo(row.ending_debit ?? 0, roundDecimals),
        ending_credit: roundTo(row.ending_credit ?? 0, roundDecimals),
        total_debit: roundTo(row.total_debit ?? 0, roundDecimals),
        total_credit: roundTo(row.total_credit ?? 0, roundDecimals),
        balance: roundTo(row.balance ?? 0, roundDecimals),
        bs_debit: roundTo(row.bs_debit ?? 0, roundDecimals),
        bs_credit: roundTo(row.bs_credit ?? 0, roundDecimals),
        pl_debit: roundTo(row.pl_debit ?? 0, roundDecimals),
        pl_credit: roundTo(row.pl_credit ?? 0, roundDecimals)
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
          summary: roundedSummary,
          rows: roundedRows
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json({ ok: false, error: { code: "INVALID_REQUEST", message: "Invalid request" } }, { status: 400 });
      }

      console.error("GET /reports/worksheet failed", error);
      return Response.json(
        { ok: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Worksheet report failed" } },
        { status: 500 }
      );
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
