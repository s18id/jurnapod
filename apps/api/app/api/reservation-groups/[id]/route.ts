// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "@/lib/auth-guard";
import { getReservationGroup } from "@/lib/reservation-groups";
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