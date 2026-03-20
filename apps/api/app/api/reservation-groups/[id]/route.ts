// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "@/lib/auth-guard";
import { getReservationGroup, deleteReservationGroupSafe } from "@/lib/reservation-groups";
import { errorResponse, successResponse } from "@/lib/response";

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