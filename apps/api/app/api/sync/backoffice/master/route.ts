// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "../../../../../src/lib/auth-guard";
import { successResponse, errorResponse } from "../../../../../src/lib/response";
import { BackofficeSyncModule } from "@jurnapod/backoffice-sync";
import { syncModuleRegistry } from "@jurnapod/sync-core";
import { z } from "zod";

const MasterSyncQuerySchema = z.object({
  since_version: z.coerce.number().int().nonnegative().optional()
});

export const GET = withAuth(
  async (request, auth) => {
    try {
      // Parse query parameters
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      const { since_version } = MasterSyncQuerySchema.parse(queryParams);

      // Get backoffice sync module
      const backofficeModule = syncModuleRegistry.getModule("backoffice") as BackofficeSyncModule | undefined;
      if (!backofficeModule) {
        return errorResponse("MODULE_NOT_FOUND", "Backoffice sync module not initialized", 503);
      }

      // Create sync context
      const syncContext = {
        company_id: auth.companyId,
        user_id: auth.userId,
        client_type: "BACKOFFICE" as const,
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      };

      // Create sync request
      const syncRequest = {
        tier: "MASTER" as const,
        operation: "PULL" as const,
        limit: 2000, // Higher limit for comprehensive data
        since_version: since_version,
        context: syncContext
      };

      // Handle sync request
      const response = await backofficeModule.handleSync(syncRequest);

      if (!response.success) {
        return errorResponse("SYNC_ERROR", response.error_message || "Sync failed", 500);
      }

      return successResponse(response);

    } catch (error) {
      console.error("Backoffice master sync error:", error);
      
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
      roles: ["OWNER", "ADMIN", "ACCOUNTANT"]
    })
  ]
);