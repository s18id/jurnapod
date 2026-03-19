// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z, ZodError } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  seatTable,
  TableOccupancyConflictError,
  ensureTableOccupancy
} from "@/lib/table-occupancy";

/**
 * Schema for seat table request body
 */
const SeatTableRequestSchema = z.object({
  guestCount: z.number().int().positive().max(50),
  guestName: z.string().max(255).optional(),
  reservationId: NumericIdSchema.optional(),
  notes: z.string().max(500).optional(),
  expectedVersion: z.number().int().min(1)
});

/**
 * POST /api/dinein/tables/[tableId]/seat
 * 
 * Seats guests at a table.
 * Creates a service session and updates occupancy to OCCUPIED.
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
      const input = SeatTableRequestSchema.parse(body);

      // Get outletId from query parameter
      const outletIdRaw = url.searchParams.get("outletId");
      if (!outletIdRaw) {
        return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);
      }
      const outletId = NumericIdSchema.parse(outletIdRaw);

      // Ensure occupancy record exists
      await ensureTableOccupancy(
        BigInt(auth.companyId),
        BigInt(outletId),
        BigInt(tableId),
        auth.userId?.toString() ?? "system"
      );

      // Seat the guests
      const result = await seatTable({
        companyId: BigInt(auth.companyId),
        outletId: BigInt(outletId),
        tableId: BigInt(tableId),
        guestCount: input.guestCount,
        guestName: input.guestName ?? null,
        reservationId: input.reservationId ? BigInt(input.reservationId) : null,
        notes: input.notes ?? null,
        expectedVersion: input.expectedVersion,
        createdBy: auth.userId?.toString() ?? "system"
      });

      // Return success response
      return successResponse({
        success: true,
        sessionId: result.sessionId.toString(),
        occupancy: {
          tableId: result.occupancy.tableId.toString(),
          statusId: result.occupancy.statusId,
          statusLabel: "Occupied",
          version: result.occupancy.version,
          guestCount: result.occupancy.guestCount
        }
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return errorResponse("INVALID_REQUEST", `Invalid request data: ${details}`, 400);
      }

      if (error instanceof TableOccupancyConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      console.error("POST /api/dinein/tables/:tableId/seat failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to seat guests", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
      module: "pos",
      permission: "create"
    })
  ]
);
