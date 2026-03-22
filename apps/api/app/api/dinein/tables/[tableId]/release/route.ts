// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z, ZodError } from "zod";
import { NumericIdSchema, TableOccupancyStatus } from "@jurnapod/shared";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { getDbPool } from "@/lib/db";
import {
  releaseTable,
  TableNotOccupiedError,
  TableOccupancyConflictError,
  TableOccupancyNotFoundError,
  TableNotFoundError,
  verifyTableExists,
  getTableOccupancy,
  type TableOccupancyState
} from "@/lib/table-occupancy";

/**
 * Schema for release table request body
 */
const ReleaseTableRequestSchema = z.object({
  notes: z.string().max(500).optional(),
  expectedVersion: z.number().int().min(1).optional()
});

/**
 * POST /api/dinein/tables/[tableId]/release
 * 
 * Releases a table after service completion.
 * Marks session as COMPLETED and resets occupancy to AVAILABLE.
 */
export const POST = withAuth(
  async (request, auth) => {
    // Extract raw parameters early so they're available in catch block
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/");
    const tablesIndex = pathSegments.indexOf("tables");
    const tableIdRaw = pathSegments[tablesIndex + 1];

    // Get outletId from query parameter
    const outletIdRaw = url.searchParams.get("outletId");

    try {
      // Parse IDs inside try so ZodError is caught and returns 400
      const tableId = NumericIdSchema.parse(tableIdRaw);
      if (!outletIdRaw) {
        return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);
      }
      const outletId = NumericIdSchema.parse(outletIdRaw);

      // Parse request body (supports empty body for header-only requests)
      let body = {};
      try {
        const text = await request.text();
        if (text.trim()) {
          body = JSON.parse(text);
        }
      } catch (parseError) {
        return errorResponse("INVALID_REQUEST", "Invalid JSON in request body", 400);
      }
      const input = ReleaseTableRequestSchema.parse(body);

      // Extract expectedVersion from header (takes precedence over body)
      const headerVersion = request.headers.get('X-Expected-Version');
      const expectedVersion = headerVersion ? parseInt(headerVersion, 10) : input.expectedVersion;

      // Validate expectedVersion is defined
      if (expectedVersion === undefined || isNaN(expectedVersion)) {
        return errorResponse("MISSING_VERSION", "expectedVersion is required (provide in body or X-Expected-Version header)", 400);
      }

      // Verify table exists before proceeding
      const pool = getDbPool();
      const connection = await pool.getConnection();
      try {
        const tableExists = await verifyTableExists(
          connection,
          BigInt(auth.companyId),
          BigInt(outletId),
          BigInt(tableId)
        );
        if (!tableExists) {
          return errorResponse("NOT_FOUND", "Table not found", 404);
        }
      } finally {
        connection.release();
      }

      // Release the table
      const result = await releaseTable({
        companyId: BigInt(auth.companyId),
        outletId: BigInt(outletId),
        tableId: BigInt(tableId),
        notes: input.notes ?? null,
        expectedVersion,
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

      if (error instanceof TableNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      if (error instanceof TableOccupancyNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      if (error instanceof TableOccupancyConflictError) {
        return Response.json(
          {
            error: "CONFLICT",
            message: error.message,
            currentState: formatCurrentState(error.currentState)
          },
          { status: 409 }
        );
      }

      if (error instanceof TableNotOccupiedError) {
        // Fetch current state for the error response (use raw values with fallback)
        const currentState = await getTableOccupancy(
          BigInt(auth.companyId),
          BigInt(outletIdRaw ?? 0),
          BigInt(tableIdRaw ?? 0)
        );
        return Response.json(
          {
            error: "NOT_OCCUPIED",
            message: error.message,
            currentState: currentState ? formatCurrentState(currentState) : null
          },
          { status: 409 }
        );
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

function formatCurrentState(state: TableOccupancyState) {
  return {
    tableId: state.tableId.toString(),
    statusId: state.statusId,
    statusLabel: getStatusLabel(state.statusId),
    version: state.version,
    guestCount: state.guestCount,
    serviceSessionId: state.serviceSessionId?.toString() ?? null,
    reservationId: state.reservationId?.toString() ?? null,
    occupiedAt: state.occupiedAt?.toISOString() ?? null,
    reservedUntil: state.reservedUntil?.toISOString() ?? null,
    notes: state.notes
  };
}
