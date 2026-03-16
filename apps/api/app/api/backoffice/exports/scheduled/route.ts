// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { getExportScheduler } from "@/lib/sync-modules";
import { getDbPool } from "@/lib/db";
import { requireAccessForOutletQuery, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";

const createScheduledExportSchema = z.object({
  name: z.string().min(1).max(255),
  report_type: z.enum(["SALES", "FINANCIAL", "INVENTORY", "AUDIT", "POS_TRANSACTIONS", "JOURNAL"]),
  export_format: z.enum(["CSV", "XLSX", "JSON"]).default("CSV"),
  schedule_type: z.enum(["DAILY", "WEEKLY", "MONTHLY", "ONCE"]),
  schedule_config: z.object({
    hour: z.number().int().min(0).max(23).default(0),
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    runAt: z.string().optional()
  }),
  filters: z.record(z.any()).optional(),
  recipients: z.array(z.object({
    email: z.string().email(),
    type: z.enum(["TO", "CC", "BCC"])
  })).min(1),
  delivery_method: z.enum(["EMAIL", "DOWNLOAD", "WEBHOOK"]).default("EMAIL"),
  webhook_url: z.string().url().optional()
});

export const GET = withAuth(
  async (request, auth) => {
    try {
      const scheduler = getExportScheduler();
      if (!scheduler) {
        return errorResponse("SERVICE_UNAVAILABLE", "Export scheduler not available", 503);
      }

      const exports = await scheduler.getScheduledExports(auth.companyId);

      return successResponse({
        exports: exports.map((e: any) => ({
          id: e.id,
          name: e.name,
          report_type: e.report_type,
          export_format: e.export_format,
          schedule_type: e.schedule_type,
          schedule_config: typeof e.schedule_config === 'string' ? JSON.parse(e.schedule_config) : e.schedule_config,
          recipients: typeof e.recipients === 'string' ? JSON.parse(e.recipients) : e.recipients,
          delivery_method: e.delivery_method,
          webhook_url: e.webhook_url,
          is_active: e.is_active,
          last_run_at: e.last_run_at,
          next_run_at: e.next_run_at,
          created_at: e.created_at
        }))
      });
    } catch (error) {
      console.error("GET /backoffice/exports/scheduled failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch scheduled exports", 500);
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

export const POST = withAuth(
  async (request, auth) => {
    try {
      const body = await request.json();
      const parsed = createScheduledExportSchema.parse(body);

      const scheduler = getExportScheduler();
      if (!scheduler) {
        return errorResponse("SERVICE_UNAVAILABLE", "Export scheduler not available", 503);
      }

      const exportId = await scheduler.createScheduledExport({
        company_id: auth.companyId,
        name: parsed.name,
        report_type: parsed.report_type,
        export_format: parsed.export_format,
        schedule_type: parsed.schedule_type,
        schedule_config: parsed.schedule_config,
        filters: parsed.filters,
        recipients: parsed.recipients,
        delivery_method: parsed.delivery_method,
        webhook_url: parsed.webhook_url,
        created_by_user_id: auth.userId
      });

      return successResponse({ id: exportId }, 201);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", error.errors[0].message, 400);
      }
      console.error("POST /backoffice/exports/scheduled failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create scheduled export", 500);
    }
  },
  [
    requireAccessForOutletQuery({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN"],
      module: "reports",
      permission: "create"
    })
  ]
);
