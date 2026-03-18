// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { requireAccess, withAuth } from "@/lib/auth-guard";
import { getItemVariants } from "@/lib/item-variants";
import { errorResponse, successResponse } from "@/lib/response";

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const itemIdRaw = url.pathname.split("/").slice(-2)[0];
      const itemId = parseInt(itemIdRaw, 10);

      if (isNaN(itemId) || itemId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
      }

      const variants = await getItemVariants(auth.companyId, itemId);
      return successResponse(variants);
    } catch (error) {
      console.error("GET /api/inventory/items/[itemId]/variants failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to list variants", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "read" })]
);