// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { getDbPool } from "@/lib/db";

export const GET = withAuth(
  async (request, auth) => {
    try {
      const { searchParams } = new URL(request.url);
      const scheduled_export_id = searchParams.get("scheduled_export_id");
      const limit = parseInt(searchParams.get("limit") || "50", 10);
      const offset = parseInt(searchParams.get("offset") || "0", 10);

      const dbPool = getDbPool();
      
      let whereClause = "WHERE company_id = ?";
      const params: any[] = [auth.companyId];

      if (scheduled_export_id) {
        whereClause += " AND scheduled_export_id = ?";
        params.push(parseInt(scheduled_export_id, 10));
      }

      const [countResult] = await dbPool.execute(
        `SELECT COUNT(*) as total FROM export_files ${whereClause}`,
        params
      );

      const [files] = await dbPool.execute(
        `SELECT id, scheduled_export_id, file_name, file_size, storage_provider, expires_at, download_count, last_downloaded_at, created_at
         FROM export_files ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const filesList = (files as any[]).map(f => ({
        id: f.id,
        scheduled_export_id: f.scheduled_export_id,
        file_name: f.file_name,
        file_size: f.file_size,
        storage_provider: f.storage_provider,
        expires_at: f.expires_at,
        download_count: f.download_count,
        last_downloaded_at: f.last_downloaded_at,
        created_at: f.created_at
      }));

      return successResponse({
        files: filesList,
        total: (countResult as any[])[0]?.total || 0,
        limit,
        offset
      });
    } catch (error) {
      console.error("GET /backoffice/exports/files failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch export files", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
    })
  ]
);
