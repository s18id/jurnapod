// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { successResponse, errorResponse } from "../../../../src/lib/response";
import { checkSyncModuleHealth } from "../../../../src/lib/sync-modules";

export const GET = async (request: Request) => {
  try {
    const healthStatus = await checkSyncModuleHealth();
    
    if (!healthStatus.healthy) {
      return Response.json({
        success: false,
        error: {
          code: "SYNC_UNHEALTHY",
          message: "One or more sync modules are unhealthy",
          modules: healthStatus.modules
        }
      }, { status: 503 });
    }

    return successResponse({
      status: "healthy",
      modules: healthStatus.modules,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Sync health check error:", error);
    return errorResponse(
      "HEALTH_CHECK_ERROR",
      "Failed to check sync module health",
      500
    );
  }
};