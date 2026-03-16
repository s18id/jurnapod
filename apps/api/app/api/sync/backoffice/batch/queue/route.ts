// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "@/lib/auth-guard";
import { successResponse, errorResponse } from "@/lib/response";
import { getDbPool } from "@/lib/db";
import { z } from "zod";

const QueueBatchJobSchema = z.object({
  job_type: z.enum(['SALES_REPORT', 'AUDIT_CLEANUP', 'RECONCILIATION', 'ANALYTICS_SYNC']),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  payload: z.record(z.any()).optional(),
  scheduled_at: z.string().datetime().optional(),
  max_retries: z.number().int().positive().max(10).default(3)
});

export const POST = withAuth(
  async (request, auth) => {
    try {
      // Parse request body
      const body = await request.json();
      const { job_type, priority, payload, scheduled_at, max_retries } = QueueBatchJobSchema.parse(body);

      const dbPool = getDbPool();
      const jobId = crypto.randomUUID();
      const scheduledTime = scheduled_at ? new Date(scheduled_at) : new Date();

      // Insert job into queue
      await dbPool.execute(
        `INSERT INTO backoffice_sync_queue 
         (id, company_id, document_type, tier, sync_status, scheduled_at, retry_count, max_retries, payload_hash) 
         VALUES (?, ?, ?, 'ANALYTICS', 'PENDING', ?, 0, ?, ?)`,
        [jobId, auth.companyId, job_type, scheduledTime, max_retries, JSON.stringify(payload || {})]
      );

      return successResponse({
        job_id: jobId,
        status: 'QUEUED',
        message: `Batch job ${job_type} queued successfully`,
        scheduled_at: scheduledTime.toISOString()
      });

    } catch (error) {
      console.error("Batch job queue error:", error);
      
      if (error instanceof z.ZodError) {
        return errorResponse("VALIDATION_ERROR", "Invalid job parameters", 400);
      }

      return errorResponse(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Failed to queue batch job",
        500
      );
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN"] // Only admins can queue batch jobs
    })
  ]
);