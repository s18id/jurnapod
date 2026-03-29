// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Example API integration for POS sync endpoints
 * This shows how to integrate the modular POS sync with an Express/Hono app
 */

import { PosSyncModule } from "./pos-sync-module.js";
import { syncModuleRegistry } from "@jurnapod/sync-core";
import type { DbConn } from "@jurnapod/db";

// Mock database adapter (replace with actual implementation)
// Uses type assertion since DbConn has private fields that prevent direct implementation
const createMockDbConn = (): DbConn => {
  const mock: Partial<DbConn> = {
    pool: {} as any,
    kysely: {} as any,
    query: async <T = any>(_sql: string, _params?: any[]): Promise<T | null> => null,
    queryAll: async <T = any>(_sql: string, _params?: any[]): Promise<T[]> => [],
    queryOne: async <T = any>(sql: string, params?: any[]): Promise<T | null> => {
      const results = await mock.queryAll!(<any>sql, params);
      return results[0] || null;
    },
    querySingle: async <T = any>(sql: string, params?: any[]): Promise<T | null> => {
      return mock.queryOne!(<any>sql, params);
    },
    execute: async (_sql: string, _params?: any[]) => ({ affectedRows: 0, insertId: 0 }),
    beginTransaction: async () => {},
    begin: async () => {},
    commit: async () => {},
    rollback: async () => {},
    startTransaction: () => { return {} as any; },
    withTransaction: async <T>(_sql: string, _params?: any[]) => ({}) as T,
    getConnection: async () => ({} as any),
  };
  return mock as DbConn;
};

/**
 * Initialize POS sync module and register with API
 */
export async function initializePosSyncAPI() {
  // Create database connection (replace with actual implementation)
  const database = createMockDbConn();

  // Initialize sync module registry
  await syncModuleRegistry.initialize({
    database,
    logger: console,
    config: {
      enableAuditLogging: true,
      defaultRetryAttempts: 3
    }
  });

  // Create and register POS sync module
  const posModule = new PosSyncModule({
    module_id: "pos",
    client_type: "POS",
    enabled: true
  });

  // Register the module
  syncModuleRegistry.register(posModule);

  // Get endpoints for registration
  const endpoints = posModule.endpoints;
  
  console.log(`Registered POS sync module with ${endpoints.length} endpoints:`);
  endpoints.forEach(endpoint => {
    const fullPath = `/api/sync/${posModule.moduleId}${endpoint.config.path}`;
    console.log(`  ${endpoint.config.method} ${fullPath}`);
  });

  return {
    module: posModule,
    endpoints,
    registry: syncModuleRegistry
  };
}

/**
 * Example Express/Hono route registration
 */
export function registerPosSyncRoutes(app: any, posModule: PosSyncModule) {
  // Register each endpoint
  posModule.endpoints.forEach(endpoint => {
    const fullPath = `/api/sync/${posModule.moduleId}${endpoint.config.path}`;
    const method = endpoint.config.method.toLowerCase();

    app[method](fullPath, async (req: any, res: any) => {
      try {
        // Extract authentication context (implement based on your auth system)
        const authContext = extractAuthContext(req);
        
        // Create sync context
        const syncContext = {
          company_id: authContext.company_id,
          outlet_id: authContext.outlet_id,
          user_id: authContext.user_id,
          client_type: "POS" as const,
          request_id: crypto.randomUUID(),
          timestamp: new Date().toISOString()
        };

        // Call the endpoint handler
        const response = await endpoint.handler(req, syncContext);

        // Send response
        res.json(response);

      } catch (error) {
        console.error(`POS sync error on ${fullPath}:`, error);
        res.status(500).json({
          success: false,
          timestamp: new Date().toISOString(),
          has_more: false,
          error_message: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    });

    console.log(`Registered route: ${method.toUpperCase()} ${fullPath}`);
  });
}

/**
 * Extract authentication context from request
 * (Replace with your actual authentication logic)
 */
function extractAuthContext(req: any) {
  // Mock implementation - replace with actual auth token validation
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    throw new Error('Authorization header required');
  }

  // Mock decoded token (replace with actual JWT verification)
  return {
    company_id: 1,
    outlet_id: 1,
    user_id: 1,
    roles: ['CASHIER']
  };
}

/**
 * Example usage with Express
 */
export async function exampleExpressIntegration() {
  // This would be in your main API server file
  const express = require('express');
  const app = express();

  // Initialize POS sync
  const { module: posModule } = await initializePosSyncAPI();

  // Register routes
  registerPosSyncRoutes(app, posModule);

  // The following endpoints would now be available:
  // GET /api/sync/pos/realtime     - Real-time data (active orders, table status)
  // GET /api/sync/pos/operational  - Operational data (tables, reservations)
  // GET /api/sync/pos/master       - Master data (items, prices, tax rates)
  // GET /api/sync/pos/admin        - Admin data (outlet config, permissions)

  return app;
}

/**
 * Example API responses for documentation
 */
export const exampleResponses = {
  realtime: {
    success: true,
    timestamp: "2026-03-16T02:45:00.000Z",
    data_version: 1234,
    has_more: false,
    tier: "REALTIME",
    data: {
      active_orders: [
        {
          order_id: "550e8400-e29b-41d4-a716-446655440001",
          table_id: 5,
          order_status: "OPEN",
          paid_amount: 0,
          total_amount: 45.50,
          guest_count: 2,
          updated_at: "2026-03-16T02:40:00.000Z"
        }
      ],
      table_status_updates: [
        {
          table_id: 5,
          status: "OCCUPIED",
          current_order_id: "550e8400-e29b-41d4-a716-446655440001",
          updated_at: "2026-03-16T02:40:00.000Z"
        }
      ]
    }
  },

  operational: {
    success: true,
    timestamp: "2026-03-16T02:45:00.000Z",
    data_version: 1234,
    has_more: false,
    tier: "OPERATIONAL",
    data: {
      tables: [
        {
          table_id: 1,
          code: "T01",
          name: "Table 1",
          zone: "Main Dining",
          capacity: 4,
          status: "AVAILABLE",
          updated_at: "2026-03-16T01:00:00.000Z"
        }
      ],
      reservations: [
        {
          reservation_id: 123,
          table_id: 3,
          customer_name: "John Doe",
          customer_phone: "+1234567890",
          guest_count: 2,
          reservation_at: "2026-03-16T19:00:00.000Z",
          duration_minutes: 90,
          status: "CONFIRMED",
          notes: null,
          linked_order_id: null,
          updated_at: "2026-03-16T01:30:00.000Z"
        }
      ]
    }
  },

  master: {
    success: true,
    timestamp: "2026-03-16T02:45:00.000Z",
    data_version: 1234,
    has_more: false,
    tier: "MASTER",
    data: {
      data_version: 1234,
      items: [
        {
          id: 101,
          sku: "BURGER001",
          name: "Classic Burger",
          type: "PRODUCT",
          item_group_id: 10,
          is_active: true,
          updated_at: "2026-03-15T10:00:00.000Z"
        }
      ],
      item_groups: [
        {
          id: 10,
          parent_id: null,
          code: "MAIN",
          name: "Main Dishes",
          is_active: true,
          updated_at: "2026-03-15T09:00:00.000Z"
        }
      ],
      prices: [
        {
          id: 201,
          item_id: 101,
          outlet_id: 1,
          price: 12.99,
          is_active: true,
          updated_at: "2026-03-15T10:00:00.000Z"
        }
      ],
      tax_rates: [
        {
          id: 1,
          code: "GST",
          name: "Goods and Services Tax",
          rate_percent: 10.0,
          is_inclusive: true,
          is_active: true
        }
      ],
      default_tax_rate_ids: [1],
      payment_methods: [
        {
          code: "CASH",
          label: "Cash",
          is_active: true,
          account_id: 1001
        },
        {
          code: "CARD",
          label: "Credit/Debit Card", 
          is_active: true,
          account_id: 1002
        }
      ]
    }
  }
};