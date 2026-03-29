// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { 
  SyncEndpoint, 
  SyncHandler, 
  AuthConfig, 
  SyncRequest,
  SyncResponse,
  SyncContext,
  SyncEndpointType
} from "@jurnapod/sync-core";
import { z } from "zod";

// Request validation schemas for backoffice
const BackofficeRealtimeSyncParamsSchema = z.object({
  company_id: z.coerce.number().int().positive()
});

const BackofficeOperationalSyncParamsSchema = z.object({
  company_id: z.coerce.number().int().positive(),
  since_version: z.coerce.number().int().nonnegative().optional(),
  outlet_id: z.coerce.number().int().positive().optional() // Optional outlet filter
});

const BackofficeMasterSyncParamsSchema = z.object({
  company_id: z.coerce.number().int().positive(),
  since_version: z.coerce.number().int().nonnegative().optional()
});

const BackofficeAdminSyncParamsSchema = z.object({
  company_id: z.coerce.number().int().positive()
});

const BackofficeAnalyticsSyncParamsSchema = z.object({
  company_id: z.coerce.number().int().positive(),
  report_type: z.enum(['SALES', 'FINANCIAL', 'AUDIT']).optional(),
  period_start: z.string().datetime().optional(),
  period_end: z.string().datetime().optional()
});

// Auth configuration for backoffice endpoints (more restrictive than POS)
const backofficeAuthConfig: AuthConfig = {
  required: true,
  roles: ["OWNER", "ADMIN", "ACCOUNTANT"], // No CASHIER for backoffice
  outlet_scoped: false // Company-level access
};

const backofficeAnalyticsAuthConfig: AuthConfig = {
  required: true,
  roles: ["OWNER", "ADMIN"], // Even more restrictive for analytics
  outlet_scoped: false
};

/**
 * Create sync handler factory for backoffice
 */
export function createBackofficeSyncHandler(handleSyncFn: (request: SyncRequest) => Promise<SyncResponse>): SyncHandler {
  return async (request: SyncRequest, context: SyncContext): Promise<SyncResponse> => {
    return await handleSyncFn(request);
  };
}

/**
 * Create backoffice sync endpoints
 */
export function createBackofficeSyncEndpoints(
  handleSync: (request: SyncRequest) => Promise<SyncResponse>
): SyncEndpoint[] {
  const syncHandler = createBackofficeSyncHandler(handleSync);

  return [
    // REALTIME tier endpoint - Dashboard data
    {
      type: "REALTIME" as SyncEndpointType,
      supportsBatch: false,
      config: {
        path: "/realtime",
        method: "GET",
        auth_required: true,
        rate_limit: {
          requests: 30,  // Lower rate for dashboard updates
          window_ms: 60_000
        }
      },
      handler: async (request, context) => {
        const syncRequest: SyncRequest = {
          operation: "PULL",
          limit: 100,
          context: {
            ...context,
            company_id: context.company_id
          }
        };

        return await syncHandler(syncRequest, context);
      },
      auth: backofficeAuthConfig
    },

    // OPERATIONAL tier endpoint - Recent business activity
    {
      type: "OPERATIONAL" as SyncEndpointType,
      supportsBatch: false,
      config: {
        path: "/operational",
        method: "GET",
        auth_required: true,
        rate_limit: {
          requests: 60,
          window_ms: 60_000
        }
      },
      handler: async (request, context) => {
        const syncRequest: SyncRequest = {
          operation: "PULL",
          limit: 200,
          context: {
            ...context,
            company_id: context.company_id
          }
        };

        return await syncHandler(syncRequest, context);
      },
      auth: backofficeAuthConfig
    },

    // MASTER tier endpoint - Comprehensive catalog
    {
      type: "MASTER" as SyncEndpointType,
      supportsBatch: false,
      config: {
        path: "/master",
        method: "GET",
        auth_required: true,
        rate_limit: {
          requests: 30,
          window_ms: 60_000
        }
      },
      handler: async (request, context) => {
        const syncRequest: SyncRequest = {
          operation: "PULL",
          limit: 2000,
          context: {
            ...context,
            company_id: context.company_id
          }
        };

        return await syncHandler(syncRequest, context);
      },
      auth: backofficeAuthConfig
    },

    // ADMIN tier endpoint - System administration
    {
      type: "ADMIN" as SyncEndpointType,
      supportsBatch: false,
      config: {
        path: "/admin",
        method: "GET",
        auth_required: true,
        rate_limit: {
          requests: 20,
          window_ms: 60_000
        }
      },
      handler: async (request, context) => {
        const syncRequest: SyncRequest = {
          operation: "PULL",
          limit: 500,
          context: {
            ...context,
            company_id: context.company_id
          }
        };

        return await syncHandler(syncRequest, context);
      },
      auth: backofficeAuthConfig
    },

    // ANALYTICS tier endpoint - Reports and business intelligence
    {
      type: "ANALYTICS" as SyncEndpointType,
      supportsBatch: false,
      config: {
        path: "/analytics",
        method: "GET",
        auth_required: true,
        rate_limit: {
          requests: 10,
          window_ms: 60_000
        }
      },
      handler: async (request, context) => {
        const syncRequest: SyncRequest = {
          operation: "PULL",
          limit: 1000,
          context: {
            ...context,
            company_id: context.company_id
          }
        };

        return await syncHandler(syncRequest, context);
      },
      auth: backofficeAnalyticsAuthConfig
    }
  ];
}