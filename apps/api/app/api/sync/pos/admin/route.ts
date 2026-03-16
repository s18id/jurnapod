// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "../../../../../src/lib/auth-guard";
import { successResponse, errorResponse } from "../../../../../src/lib/response";
import { PosSyncModule } from "@jurnapod/pos-sync";
import { syncModuleRegistry } from "@jurnapod/sync-core";
import { NumericIdSchema } from "@jurnapod/shared";
import { z } from "zod";

// Query parameter validation
const AdminSyncQuerySchema = z.object({
  outlet_id: z.coerce.number().int().positive()
});

function parseOutletIdForGuard(request: Request): number {
  const outletIdRaw = new URL(request.url).searchParams.get("outlet_id");
  return NumericIdSchema.parse(outletIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      // Parse and validate query parameters
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      const { outlet_id } = AdminSyncQuerySchema.parse(queryParams);

      // Get POS sync module
      const posModule = syncModuleRegistry.getModule("pos") as PosSyncModule | undefined;
      if (!posModule) {
        return errorResponse("MODULE_NOT_FOUND", "POS sync module not initialized", 503);
      }

      // Create sync context
      const syncContext = {
        company_id: auth.companyId,
        outlet_id: outlet_id,
        user_id: auth.userId,
        client_type: "POS" as const,
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      };

      // Create sync request
      const syncRequest = {
        tier: "ADMIN" as const,
        operation: "PULL" as const,
        limit: 50,
        context: syncContext
      };

      // Handle sync request
      const response = await posModule.handleSync(syncRequest);

      if (!response.success) {
        return errorResponse("SYNC_ERROR", response.error_message || "Sync failed", 500);
      }

      return successResponse(response);

    } catch (error) {
      console.error("POS admin sync error:", error);
      
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
      roles: ["OWNER", "ADMIN", "ACCOUNTANT"], // More restrictive for admin data
      outletId: (request) => parseOutletIdForGuard(request)
    })
  ]
);