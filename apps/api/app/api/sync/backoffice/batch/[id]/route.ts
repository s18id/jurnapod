// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "@/lib/auth-guard";
import { successResponse, errorResponse } from "@/lib/response";
import { getDbPool } from "@/lib/db";
import { z } from "zod";

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const { searchParams } = new URL(request.url);
      const jobId = searchParams.get("id");

      if (!jobId) {
        return errorResponse("VALIDATION_ERROR", "Job ID is required", 400);
      }

      const dbPool = getDbPool();

      const [rows] = await dbPool.execute(
        `SELECT id, sync_status as status FROM backoffice_sync_queue 
         WHERE id = ? AND company_id = ?`,
        [jobId, auth.companyId]
      );

      const jobs = rows as any[];

      if (!jobs || jobs.length === 0) {
        return errorResponse("NOT_FOUND", "Job not found", 404);
      }

      const job = jobs[0];

      if (job.status !== "PENDING") {
        return errorResponse(
          "INVALID_OPERATION",
          `Cannot cancel job with status '${job.status}'. Only PENDING jobs can be cancelled.`,
          400
        );
      }

      await dbPool.execute(
        `UPDATE backoffice_sync_queue SET sync_status = 'CANCELLED' 
         WHERE id = ? AND company_id = ?`,
        [jobId, auth.companyId]
      );

      return successResponse({
        job_id: jobId,
        status: "CANCELLED",
        message: "Job cancelled successfully"
      });

    } catch (error) {
      console.error("Batch job cancel error:", error);

      if (error instanceof z.ZodError) {
        return errorResponse("VALIDATION_ERROR", "Invalid request parameters", 400);
      }

      return errorResponse(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Failed to cancel job",
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
