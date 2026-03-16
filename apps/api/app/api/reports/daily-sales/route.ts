// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { checkUserAccess, listUserOutletIds, userHasOutletAccess } from "../../../../src/lib/auth";
import { requireAccessForOutletQuery, withAuth } from "../../../../src/lib/auth-guard";
import { listDailySalesSummary } from "../../../../src/lib/reports";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import { getCompany } from "../../../../src/lib/companies";

const elevatedRoles = ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"] as const;

async function isCashierOnly(auth: { userId: number; companyId: number }): Promise<boolean> {
  const elevatedAccess = await checkUserAccess({
    userId: auth.userId,
    companyId: auth.companyId,
    allowedRoles: elevatedRoles
  });
  if (elevatedAccess?.hasRole) {
    return false;
  }

  const cashierAccess = await checkUserAccess({
    userId: auth.userId,
    companyId: auth.companyId,
    allowedRoles: ["CASHIER"]
  });
  return cashierAccess?.hasRole ?? false;
}

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
          return errorResponse("FORBIDDEN", "Forbidden", 403);
        }
        outletIds = [parsed.outlet_id];
      } else {
        outletIds = await listUserOutletIds(auth.userId, auth.companyId);
      }

      const cashierOnly = await isCashierOnly(auth);

      // Get company timezone for date boundary conversion
      const company = await getCompany(auth.companyId);
      const timezone = company.timezone ?? 'UTC';

      const rows = await listDailySalesSummary({
        companyId: auth.companyId,
        outletIds,
        dateFrom,
        dateTo,
        status: parsed.status,
        userId: cashierOnly ? auth.userId : undefined,
        timezone
      });

       return successResponse({
         filters: {
           outlet_ids: outletIds,
           date_from: dateFrom,
           date_to: dateTo,
           status: parsed.status,
           user_id: cashierOnly ? auth.userId : null
          },
          rows
        });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /reports/daily-sales failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Daily sales report failed", 500);
    }
  },
  [
    requireAccessForOutletQuery({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"],
      module: "reports",
      permission: "read"
    })
  ]
);
