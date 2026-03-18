// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "@/lib/auth-guard";
import { successResponse, errorResponse } from "@/lib/response";
import { getVariantsForSync } from "@/lib/item-variants";
import { NumericIdSchema } from "@jurnapod/shared";
import { z } from "zod";

// Query parameter validation
const VariantsSyncQuerySchema = z.object({
  outlet_id: z.coerce.number().int().positive().optional()
});

function parseOutletIdForGuard(request: Request): number | undefined {
  const outletIdRaw = new URL(request.url).searchParams.get("outlet_id");
  if (!outletIdRaw) return undefined;
  return NumericIdSchema.parse(outletIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      // Parse and validate query parameters
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      const { outlet_id } = VariantsSyncQuerySchema.parse(queryParams);

      // Get variants for sync
      const variants = await getVariantsForSync(auth.companyId, outlet_id);

      return successResponse({
        variants,
        count: variants.length,
        synced_at: new Date().toISOString()
      });

    } catch (error) {
      console.error("Variants sync error:", error);
      
      if (error instanceof z.ZodError) {
        return errorResponse("VALIDATION_ERROR", "Invalid request parameters", 400);
      }

      return errorResponse(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      outletId: (request) => parseOutletIdForGuard(request)
    })
  ]
);