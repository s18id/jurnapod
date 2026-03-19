// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z, ZodError } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  releaseTable,
  TableOccupancyConflictError,
  TableOccupancyNotFoundError
} from "@/lib/table-occupancy";

/**
 * Schema for release table request body
 */
const ReleaseTableRequestSchema = z.object({
  notes: z.string().max(500).optional(),
  expectedVersion: z.number().int().min(1)
});

/**
 * POST /api/dinein/tables/[tableId]/release
 * 
 * Releases a table after service completion.
 * Marks session as COMPLETED and resets occupancy to AVAILABLE.
 */
export const POST = withAuth(
  async (request, auth) => {
    try {
      // Extract tableId from URL
      const url = new URL(request.url);
      const pathSegments = url.pathname.split("/");
      const tablesIndex = pathSegments.indexOf("tables");
      const tableIdRaw = pathSegments[tablesIndex + 1];
      const tableId = NumericIdSchema.parse(tableIdRaw);

      // Parse request body
      const body = await request.json();
      const input = ReleaseTableRequestSchema.parse(body);

      // Get outletId from query parameter
      const outletIdRaw = url.searchParams.get("outletId");
      if (!outletIdRaw) {
        return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);
      }
      const outletId = NumericIdSchema.parse(outletIdRaw);

      // Release the table
      const result = await releaseTable({
        companyId: BigInt(auth.companyId),
        outletId: BigInt(outletId),
        tableId: BigInt(tableId),
        notes: input.notes ?? null,
        expectedVersion: input.expectedVersion,
        updatedBy: auth.userId?.toString() ?? "system"
      });

      // Return success response
      return successResponse({
        success: true,
        tableId: tableId.toString(),
        occupancy: {
          statusId: result.occupancy.statusId,
          statusLabel: "Available",
          version: result.newVersion,
          guestCount: null
        }
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return errorResponse("INVALID_REQUEST", `Invalid request data: ${details}`, 400);
      }

      if (error instanceof TableOccupancyNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      if (error instanceof TableOccupancyConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      console.error("POST /api/dinein/tables/:tableId/release failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to release table", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
      module: "pos",
      permission: "update"
    })
  ]
);
