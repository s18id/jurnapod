// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getExportScheduler, getExportScheduler as getBatchProcessor } from "@/lib/sync-modules";
import { withAuth, requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";

function getExportId(url: URL): number | null {
  const parts = url.pathname.split('/');
  const idPart = parts.find((p, i) => parts[i-1] === 'scheduled' && !isNaN(parseInt(p, 10)));
  return idPart ? parseInt(idPart, 10) : null;
}

export const POST = withAuth(
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

      const filters = exportConfig.filters ? (typeof exportConfig.filters === 'string' ? JSON.parse(exportConfig.filters) : exportConfig.filters) : {};
      const scheduleConfig = typeof exportConfig.schedule_config === 'string' ? JSON.parse(exportConfig.schedule_config) : exportConfig.schedule_config;
      const recipients = typeof exportConfig.recipients === 'string' ? JSON.parse(exportConfig.recipients) : exportConfig.recipients;

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const payload = {
        exportId: exportConfig.id,
        reportType: exportConfig.report_type,
        exportFormat: exportConfig.export_format,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        filters,
        recipients,
        deliveryMethod: exportConfig.delivery_method,
        webhookUrl: exportConfig.webhook_url
      };

      const dbPool = (await import("@/lib/db")).getDbPool();
      const jobId = crypto.randomUUID();

      await dbPool.execute(`
        INSERT INTO backoffice_sync_queue (
          id, company_id, document_type, tier, sync_status, scheduled_at, retry_count, max_retries, payload_hash
        ) VALUES (?, ?, 'SCHEDULED_EXPORT', 'ANALYTICS', 'PENDING', NOW(), 0, 3, ?)
      `, [jobId, auth.companyId, JSON.stringify(payload)]);

      return successResponse({ 
        message: "Export job queued",
        job_id: jobId,
        export_id: id
      });
    } catch (error) {
      console.error("POST /backoffice/exports/scheduled/[id]/run failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to trigger export", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN"]
    })
  ]
);
