// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ListReservationsQuerySchemaV2, NumericIdSchema, CreateReservationSchemaV2 } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { listReservationsV2, createReservationV2 } from "@/lib/reservations";

/**
 * GET /api/dinein/reservations
 *
 * List reservations with filtering and pagination for an outlet.
 * Requires authentication and outlet-specific access.
 *
 * Query Parameters:
 * - outletId (required) - Outlet ID
 * - limit (optional, default 20, max 100)
 * - offset (optional, default 0)
 * - statusId (optional) - Filter by reservation status
 * - tableId (optional) - Filter by table ID
 * - customerName (optional) - Partial match search on customer name
 * - fromDate (optional) - ISO 8601 datetime for reservation time range start
 * - toDate (optional) - ISO 8601 datetime for reservation time range end
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

      // Parse and validate query parameters using Zod schema
      const queryParams = {
        limit: url.searchParams.get("limit")
          ? parseInt(url.searchParams.get("limit")!, 10)
          : undefined,
        offset: url.searchParams.get("offset")
          ? parseInt(url.searchParams.get("offset")!, 10)
          : undefined,
        statusId: url.searchParams.get("statusId")
          ? parseInt(url.searchParams.get("statusId")!, 10)
          : undefined,
        tableId: url.searchParams.get("tableId") || undefined,
        customerName: url.searchParams.get("customerName") || undefined,
        fromDate: url.searchParams.get("fromDate") || undefined,
        toDate: url.searchParams.get("toDate") || undefined,
      };

      const validatedQuery = ListReservationsQuerySchemaV2.parse(queryParams);

      // Call listReservationsV2 with company and outlet scoping
      const { reservations, total } = await listReservationsV2({
        companyId: BigInt(auth.companyId),
        outletId: BigInt(outletId),
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        statusId: validatedQuery.statusId,
        tableId: validatedQuery.tableId ? BigInt(validatedQuery.tableId) : undefined,
        customerName: validatedQuery.customerName,
        fromDate: validatedQuery.fromDate ? new Date(validatedQuery.fromDate) : undefined,
        toDate: validatedQuery.toDate ? new Date(validatedQuery.toDate) : undefined,
      });

      // Transform to response format with string IDs
      const response = {
        reservations: reservations.map((reservation) => ({
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
          tableCode: reservation.tableCode,
          tableName: reservation.tableName,
          notes: reservation.notes,
          createdAt: reservation.createdAt.toISOString(),
          updatedAt: reservation.updatedAt.toISOString(),
        })),
        pagination: {
          total,
          limit: validatedQuery.limit,
          offset: validatedQuery.offset,
          hasMore: total > validatedQuery.offset + reservations.length,
        },
      };

      return successResponse(response);
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
        return errorResponse("INVALID_REQUEST", `Invalid request parameters: ${details}`, 400);
      }

      console.error("GET /api/dinein/reservations failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch reservations", 500);
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
 * POST /api/dinein/reservations
 *
 * Creates a new reservation with PENDING status.
 * Generates unique reservation_code per outlet.
 */
export const POST = withAuth(
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
      // Validate request body
      const input = CreateReservationSchemaV2.parse(body);

      // Get outletId from query parameter (required)
      const url = new URL(request.url);
      const outletIdRaw = url.searchParams.get("outletId");

      if (!outletIdRaw) {
        return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);
      }

      const outletId = NumericIdSchema.parse(outletIdRaw);

      // Create the reservation
      const reservation = await createReservationV2({
        companyId: BigInt(auth.companyId),
        outletId: BigInt(outletId),
        partySize: input.partySize,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        reservationTime: new Date(input.reservationTime),
        durationMinutes: input.durationMinutes,
        tableId: input.tableId ? BigInt(input.tableId) : undefined,
        notes: input.notes,
        createdBy: auth.userId?.toString() ?? "system"
      });

      // Return 201 Created with reservation details
      return successResponse({
        id: reservation.id.toString(),
        reservationCode: reservation.reservationCode,
        statusId: reservation.statusId,
        partySize: reservation.partySize,
        customerName: reservation.customerName,
        reservationTime: reservation.reservationTime.toISOString(),
        message: "Reservation created successfully"
      }, 201);

    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return errorResponse("INVALID_REQUEST", `Invalid request data: ${details}`, 400);
      }

      console.error("POST /api/dinein/reservations failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create reservation", 500);
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
