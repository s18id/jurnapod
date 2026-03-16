// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { getExportScheduler } from "@/lib/sync-modules";
import { withAuth, requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";

const updateScheduledExportSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  report_type: z.enum(["SALES", "FINANCIAL", "INVENTORY", "AUDIT", "POS_TRANSACTIONS", "JOURNAL"]).optional(),
  export_format: z.enum(["CSV", "XLSX", "JSON"]).optional(),
  schedule_type: z.enum(["DAILY", "WEEKLY", "MONTHLY", "ONCE"]).optional(),
  schedule_config: z.object({
    hour: z.number().int().min(0).max(23).optional(),
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional()
  }).optional(),
  filters: z.record(z.any()).optional(),
  recipients: z.array(z.object({
    email: z.string().email(),
    type: z.enum(["TO", "CC", "BCC"])
  })).optional(),
  delivery_method: z.enum(["EMAIL", "DOWNLOAD", "WEBHOOK"]).optional(),
  webhook_url: z.string().url().optional(),
  is_active: z.boolean().optional()
});

function getExportId(url: URL): number | null {
  const parts = url.pathname.split('/');
  const idPart = parts.find((p, i) => parts[i-1] === 'scheduled' && !isNaN(parseInt(p, 10)));
  return idPart ? parseInt(idPart, 10) : null;
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const id = getExportId(new URL(request.url));
      
      if (!id) {
        return errorResponse("INVALID_REQUEST", "Invalid export ID", 400);
      }

      const scheduler = getExportScheduler();
      if (!scheduler) {
        return errorResponse("SERVICE_UNAVAILABLE", "Export scheduler not available", 503);
      }

      const exportConfig = await scheduler.getScheduledExport(auth.companyId, id);
      if (!exportConfig) {
        return errorResponse("NOT_FOUND", "Scheduled export not found", 404);
      }

      return successResponse({
        id: exportConfig.id,
        name: exportConfig.name,
        report_type: exportConfig.report_type,
        export_format: exportConfig.export_format,
        schedule_type: exportConfig.schedule_type,
        schedule_config: typeof exportConfig.schedule_config === 'string' ? JSON.parse(exportConfig.schedule_config) : exportConfig.schedule_config,
        filters: exportConfig.filters ? (typeof exportConfig.filters === 'string' ? JSON.parse(exportConfig.filters) : exportConfig.filters) : null,
        recipients: typeof exportConfig.recipients === 'string' ? JSON.parse(exportConfig.recipients) : exportConfig.recipients,
        delivery_method: exportConfig.delivery_method,
        webhook_url: exportConfig.webhook_url,
        is_active: exportConfig.is_active,
        last_run_at: exportConfig.last_run_at,
        next_run_at: exportConfig.next_run_at,
        created_at: exportConfig.created_at
      });
    } catch (error) {
      console.error("GET /backoffice/exports/scheduled/[id] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch scheduled export", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
    })
  ]
);

export const PUT = withAuth(
  async (request, auth) => {
    try {
      const id = getExportId(new URL(request.url));
      
      if (!id) {
        return errorResponse("INVALID_REQUEST", "Invalid export ID", 400);
      }

      const body = await request.json();
      const parsed = updateScheduledExportSchema.parse(body);

      const scheduler = getExportScheduler();
      if (!scheduler) {
        return errorResponse("SERVICE_UNAVAILABLE", "Export scheduler not available", 503);
      }

      const existing = await scheduler.getScheduledExport(auth.companyId, id);
      if (!existing) {
        return errorResponse("NOT_FOUND", "Scheduled export not found", 404);
      }

      await scheduler.updateScheduledExport(auth.companyId, id, parsed);

      return successResponse({ message: "Scheduled export updated" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", error.errors[0].message, 400);
      }
      console.error("PUT /backoffice/exports/scheduled/[id] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update scheduled export", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN"]
    })
  ]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const id = getExportId(new URL(request.url));
      
      if (!id) {
        return errorResponse("INVALID_REQUEST", "Invalid export ID", 400);
      }

      const scheduler = getExportScheduler();
      if (!scheduler) {
        return errorResponse("SERVICE_UNAVAILABLE", "Export scheduler not available", 503);
      }

      const existing = await scheduler.getScheduledExport(auth.companyId, id);
      if (!existing) {
        return errorResponse("NOT_FOUND", "Scheduled export not found", 404);
      }

      await scheduler.deleteScheduledExport(auth.companyId, id);

      return successResponse({ message: "Scheduled export deleted" });
    } catch (error) {
      console.error("DELETE /backoffice/exports/scheduled/[id] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete scheduled export", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN"]
    })
  ]
);
