// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { 
  SyncEndpoint, 
  SyncHandler, 
  AuthConfig, 
  SyncRequest,
  SyncResponse,
  SyncContext
} from "@jurnapod/sync-core";
import { z } from "zod";

// Request validation schemas
const PosRealtimeSyncParamsSchema = z.object({
  company_id: z.coerce.number().int().positive(),
  outlet_id: z.coerce.number().int().positive()
});

const PosOperationalSyncParamsSchema = z.object({
  company_id: z.coerce.number().int().positive(),
  outlet_id: z.coerce.number().int().positive(),
  since_version: z.coerce.number().int().nonnegative().optional()
});

const PosMasterSyncParamsSchema = z.object({
  company_id: z.coerce.number().int().positive(),
  outlet_id: z.coerce.number().int().positive(),
  since_version: z.coerce.number().int().nonnegative().optional()
});

const PosAdminSyncParamsSchema = z.object({
  company_id: z.coerce.number().int().positive(),
  outlet_id: z.coerce.number().int().positive()
});

// Auth configuration for POS endpoints
const posAuthConfig: AuthConfig = {
  required: true,
  roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
  outlet_scoped: true
};

/**
 * Create sync handler factory
 */
export function createPosSyncHandler(handleSyncFn: (request: SyncRequest) => Promise<SyncResponse>): SyncHandler {
  return async (request: SyncRequest, context: SyncContext): Promise<SyncResponse> => {
    return await handleSyncFn(request);
  };
}

/**
 * Create POS sync endpoints
 */
export function createPosSyncEndpoints(
  handleSync: (request: SyncRequest) => Promise<SyncResponse>
): SyncEndpoint[] {
  const syncHandler = createPosSyncHandler(handleSync);

  return [
    // REALTIME tier endpoint
    {
      config: {
        path: "/realtime",
        method: "GET",
        auth_required: true,
        rate_limit: {
          requests: 120,  // 120 requests per minute for realtime
          window_ms: 60_000
        }
      },
      handler: async (request, context) => {
        // Validate query parameters
        const params = PosRealtimeSyncParamsSchema.parse({
          company_id: context.company_id,
          outlet_id: context.outlet_id
        });

        const syncRequest: SyncRequest = {
          operation: "PULL",
          limit: 50, // Reasonable limit for realtime data
          context: {
            ...context,
            company_id: params.company_id,
            outlet_id: params.outlet_id
          }
        };

        return await syncHandler(syncRequest, context);
      },
      auth: posAuthConfig
    },

    // OPERATIONAL tier endpoint  
    {
      config: {
        path: "/operational",
        method: "GET", 
        auth_required: true,
        rate_limit: {
          requests: 60, // 60 requests per minute for operational
          window_ms: 60_000
        }
      },
      handler: async (request, context) => {
        // Extract since_version from query params
        const rawSinceVersion = (request as any).query?.since_version;
        
        const params = PosOperationalSyncParamsSchema.parse({
          company_id: context.company_id,
          outlet_id: context.outlet_id,
          since_version: rawSinceVersion
        });

        const syncRequest: SyncRequest = {
          operation: "PULL",
          limit: 100, // Reasonable limit for operational data
          since_version: params.since_version,
          context: {
            ...context,
            company_id: params.company_id,
            outlet_id: params.outlet_id
          }
        };

        return await syncHandler(syncRequest, context);
      },
      auth: posAuthConfig
    },

    // MASTER tier endpoint
    {
      config: {
        path: "/master",
        method: "GET",
        auth_required: true,
        rate_limit: {
          requests: 30, // 30 requests per minute for master data
          window_ms: 60_000
        }
      },
      handler: async (request, context) => {
        const rawSinceVersion = (request as any).query?.since_version;
        
        const params = PosMasterSyncParamsSchema.parse({
          company_id: context.company_id,
          outlet_id: context.outlet_id,
          since_version: rawSinceVersion
        });

        const syncRequest: SyncRequest = {
          operation: "PULL",
          limit: 1000, // Higher limit for master data
          since_version: params.since_version,
          context: {
            ...context,
            company_id: params.company_id,
            outlet_id: params.outlet_id
          }
        };

        return await syncHandler(syncRequest, context);
      },
      auth: posAuthConfig
    },

    // ADMIN tier endpoint
    {
      config: {
        path: "/admin",
        method: "GET",
        auth_required: true,
        rate_limit: {
          requests: 10, // 10 requests per minute for admin data
          window_ms: 60_000
        }
      },
      handler: async (request, context) => {
        const params = PosAdminSyncParamsSchema.parse({
          company_id: context.company_id,
          outlet_id: context.outlet_id
        });

        const syncRequest: SyncRequest = {
          operation: "PULL",
          limit: 50, // Lower limit for admin data
          context: {
            ...context,
            company_id: params.company_id,
            outlet_id: params.outlet_id
          }
        };

        return await syncHandler(syncRequest, context);
      },
      auth: posAuthConfig
    }
  ];
}