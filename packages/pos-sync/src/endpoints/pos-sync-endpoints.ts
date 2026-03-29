// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { 
  SyncEndpoint, 
  SyncHandler, 
  SyncEndpointType,
  AuthConfig, 
  SyncRequest,
  SyncResponse,
  SyncContext
} from "@jurnapod/sync-core";
import { z } from "zod";
import type { PushSyncParams, PushSyncResult } from "../push/index.js";

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
  handleSync: (request: SyncRequest) => Promise<SyncResponse>,
  handlePushSync: (params: PushSyncParams) => Promise<PushSyncResult>
): SyncEndpoint[] {
  const syncHandler = createPosSyncHandler(handleSync);

  // Push request validation schema
  const PushSyncRequestSchema = z.object({
    transactions: z.array(z.any()).default([]),
    active_orders: z.array(z.any()).default([]),
    order_updates: z.array(z.any()).default([]),
    item_cancellations: z.array(z.any()).default([]),
    variant_sales: z.array(z.any()).default([]),
    variant_stock_adjustments: z.array(z.any()).default([])
  });

  return [
    // REALTIME tier endpoint
    {
      type: "REALTIME" as SyncEndpointType,
      supportsBatch: false,
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
      type: "OPERATIONAL" as SyncEndpointType,
      supportsBatch: false,
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
      type: "MASTER" as SyncEndpointType,
      supportsBatch: false,
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
      type: "ADMIN" as SyncEndpointType,
      supportsBatch: false,
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
    },

    // PUSH endpoint (REALTIME tier, batch capable)
    {
      type: "REALTIME" as SyncEndpointType,
      supportsBatch: true,
      config: {
        path: "/push",
        method: "POST",
        auth_required: true,
        rate_limit: {
          requests: 120, // 120 requests per minute for push
          window_ms: 60_000
        }
      },
      handler: async (request, context) => {
        try {
          // Validate and extract push params from request body
          // Use type casting since SyncRequest doesn't have body but runtime has access to HTTP request
          const rawBody = (request as any).body ?? {};
          const pushData = PushSyncRequestSchema.parse(rawBody);

          const pushParams = {
            companyId: context.company_id,
            outletId: context.outlet_id ?? 0,
            transactions: pushData.transactions,
            activeOrders: pushData.active_orders,
            orderUpdates: pushData.order_updates,
            itemCancellations: pushData.item_cancellations,
            variantSales: pushData.variant_sales,
            variantStockAdjustments: pushData.variant_stock_adjustments,
          };

          // The module's handlePushSync wrapper adds db internally
          const result = await (handlePushSync as any)(pushParams);

          // Transform PushSyncResult into SyncResponse
          const hasErrors = result.results.some((r: any) => r.result === "ERROR") ||
            result.orderUpdateResults.some((r: any) => r.result === "ERROR") ||
            result.itemCancellationResults.some((r: any) => r.result === "ERROR") ||
            result.variantSaleResults?.some((r: any) => r.result === "ERROR") ||
            result.variantStockAdjustmentResults?.some((r: any) => r.result === "ERROR");

          return {
            success: !hasErrors,
            timestamp: new Date().toISOString(),
            has_more: false,
            error_message: hasErrors ? "Some push operations failed" : undefined
          };
        } catch (error) {
          return {
            success: false,
            timestamp: new Date().toISOString(),
            has_more: false,
            error_message: error instanceof Error ? error.message : "Push sync failed"
          };
        }
      },
      auth: posAuthConfig
    }
  ];
}