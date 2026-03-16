// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "@/lib/auth-guard";
import { successResponse, errorResponse } from "@/lib/response";
import { getDbPool } from "@/lib/db";
import { z } from "zod";

const ListJobsQuerySchema = z.object({
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
  type: z.enum(["SALES_REPORT", "AUDIT_CLEANUP", "RECONCILIATION", "ANALYTICS_SYNC"]).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0)
});

export const GET = withAuth(
  async (request, auth) => {
    try {
      const { searchParams } = new URL(request.url);

      const query = ListJobsQuerySchema.parse({
        status: searchParams.get("status") || undefined,
        type: searchParams.get("type") || undefined,
        limit: searchParams.get("limit") || 20,
        offset: searchParams.get("offset") || 0
      });

      const dbPool = getDbPool();

      const conditions: string[] = ["company_id = ?"];
      const params: any[] = [auth.companyId];

      if (query.status) {
        conditions.push("sync_status = ?");
        params.push(query.status);
      }

      if (query.type) {
        conditions.push("document_type = ?");
        params.push(query.type);
      }

      const whereClause = conditions.join(" AND ");

      const [countRows] = await dbPool.execute(
        `SELECT COUNT(*) as total FROM backoffice_sync_queue WHERE ${whereClause}`,
        params
      );

      const [rows] = await dbPool.execute(
        `SELECT 
          id,
          document_type as job_type,
          tier,
          sync_status as status,
          scheduled_at,
          started_at,
          completed_at,
          retry_count,
          max_retries,
          error_message
        FROM backoffice_sync_queue
        WHERE ${whereClause}
        ORDER BY scheduled_at DESC
        LIMIT ? OFFSET ?`,
        [...params, query.limit, query.offset]
      );

      const jobs = (rows as any[]).map(job => ({
        job_id: job.id,
        job_type: job.job_type,
        status: job.status,
        scheduled_at: job.scheduled_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        retry_count: job.retry_count,
        max_retries: job.max_retries,
        error_message: job.error_message
      }));

      const total = (countRows as any[])[0]?.total || 0;

      return successResponse({
        jobs,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          has_more: query.offset + jobs.length < total
        }
      });

    } catch (error) {
      console.error("Batch jobs list error:", error);

      if (error instanceof z.ZodError) {
        return errorResponse("VALIDATION_ERROR", "Invalid query parameters", 400);
      }

      return errorResponse(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Failed to list jobs",
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
