// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { listItemPrices } from "../../../../../src/lib/master-data";
import { errorResponse, successResponse } from "../../../../../src/lib/response";

function parseOutletId(request: Request): number {
  const outletIdRaw = new URL(request.url).searchParams.get("outlet_id");
  return NumericIdSchema.parse(outletIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const outletId = parseOutletId(request);
      const prices = await listItemPrices(auth.companyId, {
        outletId,
        isActive: true
      });

      return successResponse(prices);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/inventory/item-prices/active failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Item prices request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      module: "inventory",
      permission: "read",
      outletId: (request) => parseOutletId(request)
    })
  ]
);
