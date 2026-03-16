// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { getDbPool } from "@/lib/db";
import { readFileSync, existsSync } from "fs";
import { extname } from "path";

function getFileId(url: URL): number | null {
  const parts = url.pathname.split('/');
  const idPart = parts.find((p, i) => parts[i-1] === 'files' && !isNaN(parseInt(p, 10)));
  return idPart ? parseInt(idPart, 10) : null;
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const id = getFileId(new URL(request.url));
      
      if (!id) {
        return errorResponse("INVALID_REQUEST", "Invalid file ID", 400);
      }

      const dbPool = getDbPool();

      const [files] = await dbPool.execute(
        `SELECT id, company_id, file_name, file_path, storage_provider, expires_at
         FROM export_files 
         WHERE id = ? AND company_id = ?`,
        [id, auth.companyId]
      );

      const fileList = files as any[];
      
      if (!fileList || fileList.length === 0) {
        return errorResponse("NOT_FOUND", "Export file not found", 404);
      }

      const file = fileList[0];

      if (file.expires_at && new Date(file.expires_at) < new Date()) {
        return errorResponse("EXPIRED", "Export file has expired", 410);
      }

      if (!existsSync(file.file_path)) {
        return errorResponse("NOT_FOUND", "Export file not found on disk", 404);
      }

      const content = readFileSync(file.file_path);
      const mimeType = getMimeType(file.file_name);

      await dbPool.execute(
        `UPDATE export_files SET download_count = download_count + 1, last_downloaded_at = NOW() WHERE id = ?`,
        [id]
      );

      return new Response(content, {
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `attachment; filename="${file.file_name}"`
        }
      });
    } catch (error) {
      console.error("GET /backoffice/exports/files/[id]/download failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to download export file", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
    })
  ]
);

function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}
