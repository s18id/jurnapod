// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "../../../../../src/lib/auth-guard";
import { successResponse, errorResponse } from "../../../../../src/lib/response";
import { BackofficeSyncModule } from "@jurnapod/backoffice-sync";
import { syncModuleRegistry } from "@jurnapod/sync-core";
import { z } from "zod";

export const GET = withAuth(
  async (request, auth) => {
    try {
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
        tier: "ADMIN" as const,
        operation: "PULL" as const,
        limit: 500,
        context: syncContext
      };

      // Handle sync request
      const response = await backofficeModule.handleSync(syncRequest);

      if (!response.success) {
        return errorResponse("SYNC_ERROR", response.error_message || "Sync failed", 500);
      }

      return successResponse(response);

    } catch (error) {
      console.error("Backoffice admin sync error:", error);
      
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
      roles: ["OWNER", "ADMIN", "ACCOUNTANT"] // Admin/Accountant can view admin data
    })
  ]
);