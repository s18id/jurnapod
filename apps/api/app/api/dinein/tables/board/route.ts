// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { getTableBoard } from "@/lib/table-occupancy";

/**
 * GET /api/dinein/tables/board
 * 
 * Returns all tables with their current occupancy status for an outlet.
 * Requires authentication and outlet-specific access.
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      // Extract outletId from query parameters
      const url = new URL(request.url);
      const outletIdRaw = url.searchParams.get("outletId");
      
      if (!outletIdRaw) {
        return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);
      }

      const outletId = NumericIdSchema.parse(outletIdRaw);

      // Get table board data
      const tables = await getTableBoard(BigInt(auth.companyId), BigInt(outletId));

      // Transform to response format
      const response = {
        tables: tables.map(table => ({
          tableId: table.tableId.toString(),
          tableCode: table.tableCode,
          tableName: table.tableName,
          capacity: table.capacity,
          zone: table.zone,
          occupancyStatusId: table.occupancyStatusId,
          availableNow: table.availableNow,
          currentSessionId: table.currentSessionId?.toString() ?? null,
          currentReservationId: table.currentReservationId?.toString() ?? null,
          nextReservationStartAt: table.nextReservationStartAt?.toISOString() ?? null,
          guestCount: table.guestCount,
          version: table.version,
          updatedAt: table.updatedAt.toISOString()
        }))
      };

      return successResponse(response);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid outletId format", 400);
      }

      console.error("GET /api/dinein/tables/board failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch table board", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
      module: "pos",
      permission: "read"
    })
  ]
);
