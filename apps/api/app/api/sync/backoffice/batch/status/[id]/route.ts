// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "@/lib/auth-guard";
import { successResponse, errorResponse } from "@/lib/response";
import { getDbPool } from "@/lib/db";
import { z } from "zod";

export const GET = withAuth(
  async (request, auth) => {
    try {
      const { searchParams } = new URL(request.url);
      const jobId = searchParams.get("id");

      if (!jobId) {
        return errorResponse("VALIDATION_ERROR", "Job ID is required", 400);
      }

      const dbPool = getDbPool();

      const [rows] = await dbPool.execute(
        `SELECT 
          id,
          company_id,
          document_type as job_type,
          tier,
          sync_status as status,
          scheduled_at,
          started_at,
          completed_at,
          retry_count,
          max_retries,
          error_message,
          payload_hash as payload,
          result_hash as result
        FROM backoffice_sync_queue
        WHERE id = ? AND company_id = ?`,
        [jobId, auth.companyId]
      );

      const jobs = rows as any[];

      if (!jobs || jobs.length === 0) {
        return errorResponse("NOT_FOUND", "Job not found", 404);
      }

      const job = jobs[0];

      return successResponse({
        job_id: job.id,
        job_type: job.job_type,
        status: job.status,
        scheduled_at: job.scheduled_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        progress: calculateProgress(job),
        retry_count: job.retry_count,
        max_retries: job.max_retries,
        error_message: job.error_message,
        payload: job.payload ? JSON.parse(job.payload) : null,
        result: job.result ? JSON.parse(job.result) : null
      });

    } catch (error) {
      console.error("Batch job status error:", error);

      if (error instanceof z.ZodError) {
        return errorResponse("VALIDATION_ERROR", "Invalid request parameters", 400);
      }

      return errorResponse(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Failed to get job status",
        500
      );
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN"]
    })
  ]
);

function calculateProgress(job: any): number {
  if (job.status === "COMPLETED") return 100;
  if (job.status === "FAILED") return 0;
  if (job.status === "PROCESSING") return 50;
  if (job.status === "PENDING") return 0;
  return 0;
}
