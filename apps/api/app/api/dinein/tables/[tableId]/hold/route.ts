// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z, ZodError } from "zod";
import { NumericIdSchema, TableOccupancyStatus } from "@jurnapod/shared";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  holdTable,
  TableOccupancyConflictError,
  TableNotAvailableError,
  ensureTableOccupancy
} from "@/lib/table-occupancy";

/**
 * Schema for hold table request body
 */
const HoldTableRequestSchema = z.object({
  heldUntil: z.coerce.date(),
  reservationId: NumericIdSchema.optional(),
  notes: z.string().max(500).optional(),
  expectedVersion: z.number().int().min(1)
});

/**
 * POST /api/dinein/tables/[tableId]/hold
 * 
 * Holds a table for reservation.
 * Changes occupancy status to RESERVED.
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
      const input = HoldTableRequestSchema.parse(body);

      // Get outletId from query parameter or use auth context
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

      // Hold the table
      const result = await holdTable({
        companyId: BigInt(auth.companyId),
        outletId: BigInt(outletId),
        tableId: BigInt(tableId),
        heldUntil: input.heldUntil,
        reservationId: input.reservationId ? BigInt(input.reservationId) : null,
        notes: input.notes ?? null,
        expectedVersion: input.expectedVersion,
        createdBy: auth.userId?.toString() ?? "system"
      });

      // Return success response
      return successResponse({
        success: true,
        tableId: tableId.toString(),
        occupancy: {
          statusId: result.occupancy.statusId,
          statusLabel: getStatusLabel(result.occupancy.statusId),
          version: result.newVersion,
          reservedUntil: result.occupancy.reservedUntil?.toISOString() ?? null,
          reservationId: result.occupancy.reservationId?.toString() ?? null
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

      if (error instanceof TableNotAvailableError) {
        return errorResponse("NOT_AVAILABLE", error.message, 409);
      }

      console.error("POST /api/dinein/tables/:tableId/hold failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to hold table", 500);
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

function getStatusLabel(statusId: number): string {
  switch (statusId) {
    case TableOccupancyStatus.AVAILABLE:
      return "Available";
    case TableOccupancyStatus.OCCUPIED:
      return "Occupied";
    case TableOccupancyStatus.RESERVED:
      return "Reserved";
    case TableOccupancyStatus.CLEANING:
      return "Cleaning";
    case TableOccupancyStatus.OUT_OF_SERVICE:
      return "Out of Service";
    default:
      return "Unknown";
  }
}
