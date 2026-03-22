// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, UpdateReservationStatusSchemaV2 } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  getReservation,
  updateReservationStatus,
  ReservationNotFoundError,
  InvalidStatusTransitionError,
  ReservationConflictError,
  ReservationValidationError
} from "@/lib/reservations";
import { getDbPool } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

interface TableInfoRow extends RowDataPacket {
  code: string;
  name: string;
}

/**
 * GET /api/dinein/reservations/:reservationId
 *
 * Get a single reservation by ID with full details.
 * Requires authentication and outlet-specific access.
 *
 * Path Parameters:
 * - reservationId (required) - Reservation ID from URL path
 *
 * Query Parameters:
 * - outletId (required) - Outlet ID
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      // Extract reservationId from URL path
      const url = new URL(request.url);
      const pathParts = url.pathname.split("/");
      const reservationIdRaw = pathParts[pathParts.length - 1];

      if (!reservationIdRaw) {
        return errorResponse("MISSING_RESERVATION_ID", "reservationId path parameter is required", 400);
      }

      const reservationId = NumericIdSchema.parse(reservationIdRaw);

      // Extract outletId from query parameters
      const outletIdRaw = url.searchParams.get("outletId");

      if (!outletIdRaw) {
        return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);
      }

      const outletId = NumericIdSchema.parse(outletIdRaw);

      // Get reservation with tenant isolation
      const reservation = await getReservation(
        BigInt(reservationId),
        BigInt(auth.companyId),
        BigInt(outletId)
      );

      if (!reservation) {
        return errorResponse("NOT_FOUND", "Reservation not found", 404);
      }

      // Fetch table info if tableId is present
      let tableCode: string | null = null;
      let tableName: string | null = null;

      if (reservation.tableId) {
        const pool = getDbPool();
        const [rows] = await pool.execute<TableInfoRow[]>(
          `SELECT code, name FROM outlet_tables 
           WHERE id = ? AND company_id = ? AND outlet_id = ? 
           LIMIT 1`,
          [reservation.tableId, auth.companyId, outletId]
        );

        if (rows.length > 0) {
          tableCode = rows[0].code;
          tableName = rows[0].name;
        }
      }

      // Transform to response format with string IDs
      const response = {
        id: reservation.id.toString(),
        reservationCode: reservation.reservationCode,
        statusId: reservation.statusId,
        partySize: reservation.partySize,
        customerName: reservation.customerName,
        customerPhone: reservation.customerPhone,
        customerEmail: reservation.customerEmail,
        reservationTime: reservation.reservationTime.toISOString(),
        durationMinutes: reservation.durationMinutes,
        tableId: reservation.tableId?.toString() ?? null,
        tableCode,
        tableName,
        notes: reservation.notes,
        cancellationReason: reservation.cancellationReason,
        createdAt: reservation.createdAt.toISOString(),
        updatedAt: reservation.updatedAt.toISOString(),
        createdBy: reservation.createdBy,
        updatedBy: reservation.updatedBy,
      };

      return successResponse(response);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid reservationId or outletId format", 400);
      }

      if (error instanceof ReservationNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      console.error("GET /api/dinein/reservations/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch reservation", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
      module: "pos",
      permission: "read",
    }),
  ]
);

/**
 * PATCH /api/dinein/reservations/:reservationId
 *
 * Updates a reservation, primarily for status changes.
 * Handles status transitions and associated side effects.
 *
 * Status Transitions:
 * - PENDING (1) → CONFIRMED (2): Hold table
 * - PENDING (1) → CANCELLED (5): Record cancellation reason
 * - CONFIRMED (2) → CHECKED_IN (3): Seat guests, create service session
 * - CONFIRMED (2) → NO_SHOW (4): Release table after grace period
 * - CONFIRMED (2) → CANCELLED (5): Release table
 * - CHECKED_IN (3) → COMPLETED (6): Finalize after session closed
 */
export const PATCH = withAuth(
  async (request, auth) => {
    // Parse request body
    let body;
    try {
      const text = await request.text();
      if (text.trim()) {
        body = JSON.parse(text);
      } else {
        return errorResponse("INVALID_REQUEST", "Request body is required", 400);
      }
    } catch (parseError) {
      return errorResponse("INVALID_REQUEST", "Invalid JSON in request body", 400);
    }

    try {
      // Extract reservationId from URL path
      const url = new URL(request.url);
      const pathParts = url.pathname.split("/");
      const reservationIdRaw = pathParts[pathParts.length - 1];

      if (!reservationIdRaw) {
        return errorResponse("MISSING_RESERVATION_ID", "reservationId path parameter is required", 400);
      }

      const reservationId = NumericIdSchema.parse(reservationIdRaw);

      // Extract outletId from query parameters
      const outletIdRaw = url.searchParams.get("outletId");

      if (!outletIdRaw) {
        return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);
      }

      const outletId = NumericIdSchema.parse(outletIdRaw);

      // Validate request body
      const input = UpdateReservationStatusSchemaV2.parse(body);

      // First, check if reservation exists and get current state
      const existingReservation = await getReservation(
        BigInt(reservationId),
        BigInt(auth.companyId),
        BigInt(outletId)
      );

      if (!existingReservation) {
        return errorResponse("NOT_FOUND", "Reservation not found", 404);
      }

      // Update the reservation status
      const updatedReservation = await updateReservationStatus(
        BigInt(reservationId),
        BigInt(auth.companyId),
        BigInt(outletId),
        {
          statusId: input.statusId,
          tableId: input.tableId ? BigInt(input.tableId) : undefined,
          cancellationReason: input.cancellationReason,
          notes: input.notes,
          updatedBy: auth.userId?.toString() ?? "system"
        }
      );

      // Return updated reservation details
      return successResponse({
        id: updatedReservation.id.toString(),
        reservationCode: updatedReservation.reservationCode,
        statusId: updatedReservation.statusId,
        previousStatusId: existingReservation.statusId,
        partySize: updatedReservation.partySize,
        customerName: updatedReservation.customerName,
        reservationTime: updatedReservation.reservationTime.toISOString(),
        message: "Reservation updated successfully"
      });

    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return errorResponse("INVALID_REQUEST", `Invalid request data: ${details}`, 400);
      }

      if (error instanceof ReservationNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      if (error instanceof InvalidStatusTransitionError) {
        return errorResponse("INVALID_TRANSITION", error.message, 400);
      }

      if (error instanceof ReservationConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      if (error instanceof ReservationValidationError) {
        return errorResponse("VALIDATION_ERROR", error.message, 400);
      }

      console.error("PATCH /api/dinein/reservations/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update reservation", 500);
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
