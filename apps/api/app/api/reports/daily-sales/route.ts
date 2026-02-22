import { z } from "zod";
import { listUserOutletIds, userHasOutletAccess } from "../../../../src/lib/auth";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import { listDailySalesSummary } from "../../../../src/lib/reports";

const querySchema = z.object({
  outlet_id: z.coerce.number().int().positive().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["COMPLETED", "VOID", "REFUND"]).default("COMPLETED")
});

function getDefaultDateRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);
  fromDate.setDate(now.getDate() - 30);
  const from = fromDate.toISOString().slice(0, 10);
  return { dateFrom: from, dateTo: to };
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const parsed = querySchema.parse({
        outlet_id: url.searchParams.get("outlet_id") ?? undefined,
        date_from: url.searchParams.get("date_from") ?? undefined,
        date_to: url.searchParams.get("date_to") ?? undefined,
        status: url.searchParams.get("status") ?? undefined
      });

      const defaults = getDefaultDateRange();
      const dateFrom = parsed.date_from ?? defaults.dateFrom;
      const dateTo = parsed.date_to ?? defaults.dateTo;

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

      const rows = await listDailySalesSummary({
        companyId: auth.companyId,
        outletIds,
        dateFrom,
        dateTo,
        status: parsed.status
      });

      return Response.json(
        {
          ok: true,
          filters: {
            outlet_ids: outletIds,
            date_from: dateFrom,
            date_to: dateTo,
            status: parsed.status
          },
          rows
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json({ ok: false, error: { code: "INVALID_REQUEST", message: "Invalid request" } }, { status: 400 });
      }

      console.error("GET /reports/daily-sales failed", error);
      return Response.json(
        { ok: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Daily sales report failed" } },
        { status: 500 }
      );
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
