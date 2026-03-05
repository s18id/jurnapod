// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { AuditLogQuerySchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../src/lib/response";
import { queryAuditLogs } from "../../../src/lib/audit-logs";

/**
 * GET /api/audit-logs
 * Query audit log entries with filters
 * 
 * Query params:
 * - company_id (required): Company ID
 * - entity_type (optional): Entity type filter
 * - entity_id (optional): Entity ID filter
 * - user_id (optional): User ID filter
 * - action (optional): Action filter
 * - from_date (optional): Start date (ISO datetime)
 * - to_date (optional): End date (ISO datetime)
 * - limit (optional): Results limit (default 100, max 1000)
 * - offset (optional): Results offset (default 0)
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      
      const query = AuditLogQuerySchema.parse({
        company_id: parseInt(url.searchParams.get("company_id") || String(auth.companyId)),
        entity_type: url.searchParams.get("entity_type") || undefined,
        entity_id: url.searchParams.get("entity_id") || undefined,
        user_id: url.searchParams.get("user_id") ? parseInt(url.searchParams.get("user_id")!) : undefined,
        action: url.searchParams.get("action") || undefined,
        from_date: url.searchParams.get("from_date") || undefined,
        to_date: url.searchParams.get("to_date") || undefined,
        limit: url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : 100,
        offset: url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!) : 0
      });

      // Verify company_id matches authenticated user
      if (query.company_id !== auth.companyId) {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }

      const result = await queryAuditLogs(query);

      return successResponse(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
      }

      console.error("GET /api/audit-logs failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"])]
);
