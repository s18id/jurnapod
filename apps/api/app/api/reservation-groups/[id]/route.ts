// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ReservationGroupUpdateRequestSchema } from "@jurnapod/shared";
import { withAuth, requireAccess } from "@/lib/auth-guard";
import { getReservationGroup, deleteReservationGroupSafe, updateReservationGroup } from "@/lib/reservation-groups";
import { errorResponse, successResponse } from "@/lib/response";
import { ZodError } from "zod";

/**
 * GET /api/reservation-groups/[id]
 * 
 * Gets reservation group details including all linked reservations.
 * 
 * @example
 * GET /api/reservation-groups/123
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      const groupIdStr = pathParts[pathParts.length - 1];
      const groupId = Number(groupIdStr);

      if (!Number.isInteger(groupId) || groupId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid group ID", 400);
      }

      const group = await getReservationGroup({
        companyId: auth.companyId,
        groupId
      });

      if (!group) {
        return errorResponse("NOT_FOUND", "Reservation group not found", 404);
      }

      return successResponse(group);

    } catch (error) {
      console.error("GET /api/reservation-groups/[id] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to get reservation group", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      module: "pos",
      permission: "read"
    })
  ]
);

/**
 * DELETE /api/reservation-groups/[id]
 * 
 * Cancels all linked reservations and deletes the reservation group.
 * Linked reservations are set to CANCELLED status before the group is deleted.
 * 
 * Safety checks:
 * - Group must exist and belong to user's company
 * - All reservations in group must be in BOOKED or CONFIRMED status
 *   (ARRIVED/SEATED/COMPLETED/CANCELLED/NO_SHOW cannot be cancelled)
 * 
 * @example
 * DELETE /api/reservation-groups/123
 */
export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      const groupIdStr = pathParts[pathParts.length - 1];
      const groupId = Number(groupIdStr);

      if (!Number.isInteger(groupId) || groupId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid group ID", 400);
      }

      const result = await deleteReservationGroupSafe({
        companyId: auth.companyId,
        groupId
      });

      return successResponse({
        deleted: result.deleted,
        ungrouped_count: result.ungroupedCount
      });

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          return errorResponse("NOT_FOUND", "Reservation group not found", 404);
        }
        if (
          error.message.includes("already started") ||
          error.message.includes("BOOKED or CONFIRMED")
        ) {
          return errorResponse(
            "CONFLICT",
            error.message,
            409
          );
        }
      }
      console.error("DELETE /api/reservation-groups/[id] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to cancel reservation group", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      module: "pos",
      permission: "delete"
    })
  ]
);

/**
 * PATCH /api/reservation-groups/[id]
 * 
 * Update an existing reservation group.
 * Supports partial updates - only provide fields you want to change.
 * 
 * Request Body:
 * - customer_name: string (optional)
 * - customer_phone: string (optional)
 * - guest_count: number (optional)
 * - reservation_at: ISO 8601 datetime string (optional)
 * - duration_minutes: number (optional)
 * - notes: string (optional)
 * - table_ids: number[] (optional, if provided replaces all tables)
 * 
 * Response:
 * - success: true
 * - data: { group_id, reservation_ids, updated_tables, removed_tables }
 * 
 * Errors:
 * - 400: Invalid input, insufficient capacity
 * - 404: Group not found
 * - 409: Conflict detected (time change creates overlap, reservations started)
 * - 500: Server error
 */
export const PATCH = withAuth(
  async (request, auth) => {
    try {
      // 1. Parse request body
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

      // 2. Extract group ID from URL
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      const groupIdStr = pathParts[pathParts.length - 1];
      const groupId = Number(groupIdStr);

      if (!Number.isInteger(groupId) || groupId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid group ID", 400);
      }

      // 3. Extract outlet_id from query params for tenant isolation
      const outletIdParam = url.searchParams.get("outlet_id");
      if (!outletIdParam) {
        return errorResponse("INVALID_REQUEST", "outlet_id query parameter is required", 400);
      }
      const outletId = Number(outletIdParam);
      if (!Number.isSafeInteger(outletId) || outletId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid outlet_id", 400);
      }

      // 4. Validate request body with Zod
      const validated = ReservationGroupUpdateRequestSchema.parse(body);

      // 5. Call business logic
      const result = await updateReservationGroup({
        companyId: auth.companyId,
        outletId,
        groupId,
        updates: validated
      });

      // 5. Return success
      return successResponse({
        group_id: result.groupId,
        reservation_ids: result.reservationIds,
        updated_tables: result.updatedTables,
        removed_tables: result.removedTables
      });

    } catch (error) {
      // 6. Error handling
      if (error instanceof ZodError) {
        const details = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return errorResponse("INVALID_REQUEST", `Validation failed: ${details}`, 400);
      }

      if (error instanceof Error) {
        const msg = error.message;

        // Not found
        if (msg.includes("not found") || msg.includes("access denied")) {
          return errorResponse("NOT_FOUND", msg, 404);
        }

        // Validation errors (400) - input/validation issues
        if (
          msg.includes("Insufficient capacity") ||
          msg.includes("requires at least") ||
          msg.includes("more than 10") ||
          msg.includes("data integrity violation")
        ) {
          return errorResponse("INVALID_REQUEST", msg, 400);
        }

        // Conflicts (409) - timing/state conflicts
        if (
          msg.includes("not available") ||
          msg.includes("conflict detected") ||
          msg.includes("have started")
        ) {
          return errorResponse("CONFLICT", msg, 409);
        }
      }

      console.error("PATCH /api/reservation-groups/[id] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update reservation group", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      module: "pos",
      permission: "update"
    })
  ]
);