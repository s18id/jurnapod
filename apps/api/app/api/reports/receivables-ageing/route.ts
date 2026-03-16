// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { listUserOutletIds, userHasOutletAccess } from "../../../../src/lib/auth";
import { requireAccessForOutletQuery, withAuth } from "../../../../src/lib/auth-guard";
import { getReceivablesAgeingReport } from "../../../../src/lib/reports";
import { getCompany } from "../../../../src/lib/companies";
import { errorResponse, successResponse } from "../../../../src/lib/response";

const querySchema = z.object({
  outlet_id: z.coerce.number().int().positive().optional(),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  format: z.enum(["json", "csv"]).default("json")
});

function csvEscape(value: string | number | null): string {
  if (value == null) {
    return "";
  }

  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
}

function toCsv(report: Awaited<ReturnType<typeof getReceivablesAgeingReport>>): string {
  const header = [
    "invoice_id",
    "invoice_no",
    "outlet_id",
    "outlet_name",
    "invoice_date",
    "due_date",
    "days_overdue",
    "age_bucket",
    "outstanding_amount"
  ];

  const rows = report.invoices.map((invoice) => [
    invoice.invoice_id,
    invoice.invoice_no,
    invoice.outlet_id,
    invoice.outlet_name,
    invoice.invoice_date,
    invoice.due_date,
    invoice.days_overdue,
    invoice.age_bucket,
    invoice.outstanding_amount
  ]);

  const lines = [header, ...rows].map((row) => row.map((value) => csvEscape(value)).join(","));
  return `${lines.join("\n")}\n`;
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const parsed = querySchema.parse({
        outlet_id: url.searchParams.get("outlet_id") ?? undefined,
        as_of_date: url.searchParams.get("as_of_date") ?? undefined,
        format: url.searchParams.get("format") ?? undefined
      });

      const asOfDate = parsed.as_of_date ?? new Date().toISOString().slice(0, 10);

      // Get company timezone for date boundary conversion
      const company = await getCompany(auth.companyId);
      const timezone = company.timezone ?? 'UTC';

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

      const report = await getReceivablesAgeingReport({
        companyId: auth.companyId,
        outletIds,
        asOfDate
      });

      if (parsed.format === "csv") {
        const body = toCsv(report);
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="receivables-ageing-${asOfDate}.csv"`
          }
        });
      }

      return successResponse({
        filters: {
          outlet_ids: outletIds,
          as_of_date: asOfDate
        },
        buckets: report.buckets,
        total_outstanding: report.total_outstanding,
        invoices: report.invoices
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /reports/receivables-ageing failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Receivables ageing report failed", 500);
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
