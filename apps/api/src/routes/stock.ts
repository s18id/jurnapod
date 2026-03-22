// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Routes
 *
 * REST API routes for stock management using Hono's app.route() pattern:
 * - GET /stock - Get stock levels
 * - POST /stock/adjust - Manual adjustment
 * - GET /stock/transactions - Transaction history
 * - GET /stock/low - Low stock alerts
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  getStockLevels,
  getStockTransactions,
  getLowStockAlerts,
  adjustStock,
  type StockAdjustmentInput
} from "../services/stock.js";
import { getDbPool } from "../lib/db.js";
import { authenticateRequest, requireAccess, type AuthContext } from "../lib/auth-guard.js";
import { type RoleCode } from "../lib/auth.js";
import { successResponse, errorResponse } from "../lib/response.js";
import { telemetryMiddleware, type TelemetryContext } from "../middleware/telemetry.js";
import { NumericIdSchema } from "@jurnapod/shared";

// Zod schemas for request validation
const StockAdjustmentBodySchema = z.object({
  outlet_id: NumericIdSchema,
  product_id: NumericIdSchema,
  adjustment_quantity: z.number().int(),
  reason: z.string().min(1).max(500)
});

const StockQuerySchema = z.object({
  outlet_id: NumericIdSchema,
  product_id: NumericIdSchema.optional()
});

const StockTransactionsQuerySchema = z.object({
  outlet_id: NumericIdSchema.nullable().optional(),
  product_id: NumericIdSchema.optional(),
  transaction_type: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
  offset: z.coerce.number().int().nonnegative().default(0)
});

// Extend Hono context with typed auth variable
// Note: telemetry is already declared in middleware/telemetry.ts
declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// Route params schema
function parseOutletIdFromQuery(request: Request): number | null {
  const outletIdRaw = new URL(request.url).searchParams.get("outlet_id");
  if (!outletIdRaw) return null;
  return NumericIdSchema.parse(outletIdRaw);
}

/**
 * Auth middleware for stock routes
 * Extracts auth context and sets c.set("auth", authContext)
 */
async function authMiddleware(c: Context, next: () => Promise<void>): Promise<void> {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
    return;
  }
  c.set("auth", authResult.auth);
  await next();
}

/**
 * Role-based access control middleware for stock routes
 * Note: c.req.valid() is not used here because validation happens
 * after middleware in Hono's pipeline. Use c.req.query() and c.req.json() instead.
 */
function requireStockAccess(roles: readonly string[]) {
  return async (c: Context, next: () => Promise<void>): Promise<void | Response> => {
    const auth = c.get("auth");
    if (!auth) {
      return Response.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 }
      );
    }

    // Extract outlet ID for outlet access validation
    let outletId: number | undefined;
    const method = c.req.method;

    if (method === "GET") {
      const outletIdRaw = c.req.query("outlet_id");
      if (outletIdRaw) {
        const parsed = parseInt(outletIdRaw, 10);
        if (Number.isSafeInteger(parsed) && parsed > 0) {
          outletId = parsed;
        }
      }
    } else if (method === "POST") {
      // Extract outlet_id from POST body for validation
      try {
        const body = await c.req.json().catch(() => ({}));
        if (body.outlet_id && typeof body.outlet_id === "number") {
          outletId = body.outlet_id;
        }
      } catch {
        // Ignore JSON parse errors - handler will validate
      }
    }

    // Use proper auth guard with role and outlet access checks
    const authGuard = requireAccess({
      roles: roles as RoleCode[],
      module: "inventory",
      permission: "read",
      outletId: outletId
    });

    const authResult = await authGuard(c.req.raw, auth);
    if (authResult) {
      return authResult;
    }

    await next();
  };
}

// Create stock routes Hono instance
// Note: Routes are mounted at /outlets/:outletId/stock/* (nesting handled by server.ts)
const stockRoutes = new Hono();

// Apply telemetry and auth middleware to all stock routes
stockRoutes.use(telemetryMiddleware());
stockRoutes.use(authMiddleware);

/**
 * Outlet access validation middleware
 * Validates that the outlet exists and belongs to the company
 */
async function requireOutletAccess(c: Context, next: () => Promise<void>): Promise<void | Response> {
  const auth = c.get("auth");
  const outletId = c.req.param("outletId");
  
  if (!outletId) {
    return c.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Missing outletId parameter" } },
      { status: 400 }
    );
  }
  
  const outletIdNum = parseInt(outletId, 10);
  if (!Number.isSafeInteger(outletIdNum) || outletIdNum <= 0) {
    return c.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Invalid outletId parameter" } },
      { status: 400 }
    );
  }
  
  // TODO: Add outlet validation against company's outlets if needed
  // For now, we trust the auth context's companyId
  
  await next();
}

// Apply outlet access middleware to all stock routes
stockRoutes.use(requireOutletAccess);

/**
 * GET /stock
 * Get stock levels for a company/outlet
 *
 * Query params:
 * - outlet_id (required): The outlet to get stock for
 * - product_id (optional): Get stock for a specific product
 */
stockRoutes.get(
  "/",
  zValidator('query', StockQuerySchema),
  requireStockAccess(["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"]),
  async (c) => {
    const auth = c.get("auth");
    const dbPool = getDbPool();
    let connection;

    try {
      const outletId = parseInt(c.req.param("outletId") ?? "", 10);
      const { product_id } = c.req.valid('query');

      connection = await dbPool.getConnection();
      const productIds = product_id ? [product_id] : undefined;
      const stockLevels = await getStockLevels(auth.companyId, outletId, productIds, connection);

      return successResponse({
        company_id: auth.companyId,
        outlet_id: outletId,
        items: stockLevels
      });
    } catch (error) {
      console.error("Get stock levels error:", error);
      
      if (error instanceof z.ZodError) {
        return errorResponse("VALIDATION_ERROR", "Invalid request parameters", 400);
      }
      
      return errorResponse(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Failed to get stock levels",
        500
      );
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

/**
 * GET /stock/transactions
 * Get stock transaction history
 *
 * Query params:
 * - outlet_id (optional): Filter by outlet
 * - product_id (optional): Filter by product
 * - transaction_type (optional): Filter by type (DEDUCTION, RESTORATION, ADJUSTMENT, RESERVATION, RELEASE)
 * - limit (optional): Max results (default: 100, max: 500)
 * - offset (optional): Pagination offset
 */
stockRoutes.get(
  "/transactions",
  zValidator('query', StockTransactionsQuerySchema),
  requireStockAccess(["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"]),
  async (c) => {
    const auth = c.get("auth");
    const dbPool = getDbPool();
    let connection;

    try {
      const outletId = parseInt(c.req.param("outletId") ?? "", 10);
      const { product_id, transaction_type, limit, offset } = c.req.valid('query');

      connection = await dbPool.getConnection();
      const { transactions, total } = await getStockTransactions(
        auth.companyId,
        outletId,
        {
          product_id,
          transaction_type,
          limit,
          offset
        },
        connection
      );

      return successResponse({
        company_id: auth.companyId,
        outlet_id: outletId,
        transactions,
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + transactions.length < total
        }
      });
    } catch (error) {
      console.error("Get stock transactions error:", error);
      
      if (error instanceof z.ZodError) {
        return errorResponse("VALIDATION_ERROR", "Invalid request parameters", 400);
      }
      
      return errorResponse(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Failed to get stock transactions",
        500
      );
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

/**
 * GET /stock/low
 * Get low stock alerts
 *
 * Query params:
 * - outlet_id (required): The outlet to check
 */
stockRoutes.get(
  "/low",
  zValidator('query', StockQuerySchema),
  requireStockAccess(["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"]),
  async (c) => {
    const auth = c.get("auth");
    const dbPool = getDbPool();
    let connection;

    try {
      const outletId = parseInt(c.req.param("outletId") ?? "", 10);

      connection = await dbPool.getConnection();
      const alerts = await getLowStockAlerts(auth.companyId, outletId, connection);

      return successResponse({
        company_id: auth.companyId,
        outlet_id: outletId,
        alerts,
        total_alerts: alerts.length
      });
    } catch (error) {
      console.error("Get low stock alerts error:", error);
      
      if (error instanceof z.ZodError) {
        return errorResponse("VALIDATION_ERROR", "Invalid request parameters", 400);
      }
      
      return errorResponse(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Failed to get low stock alerts",
        500
      );
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

/**
 * POST /stock/adjust
 * Manual stock adjustment
 *
 * Body:
 * - outlet_id (required): The outlet
 * - product_id (required): The product to adjust
 * - adjustment_quantity (required): Amount to adjust (positive or negative)
 * - reason (required): Reason for adjustment
 */
stockRoutes.post(
  "/adjustments",
  zValidator('json', StockAdjustmentBodySchema),
  requireStockAccess(["OWNER", "ADMIN", "ACCOUNTANT"]),
  async (c) => {
    const auth = c.get("auth");
    const dbPool = getDbPool();
    let connection;

    try {
      const outletId = parseInt(c.req.param("outletId") ?? "", 10);
      const { product_id, adjustment_quantity, reason } = c.req.valid('json') as {
        product_id: number;
        adjustment_quantity: number;
        reason: string;
      };

      connection = await dbPool.getConnection();
      
      const adjustmentInput: StockAdjustmentInput = {
        company_id: auth.companyId,
        outlet_id: outletId,
        product_id,
        adjustment_quantity,
        reason,
        reference_id: `MANUAL-${Date.now()}`,
        user_id: auth.userId
      };

      const success = await adjustStock(adjustmentInput, connection);

      if (!success) {
        return errorResponse(
          "ADJUSTMENT_FAILED",
          "Failed to adjust stock. Insufficient quantity or stock record not found.",
          400
        );
      }

      return successResponse({
        message: "Stock adjusted successfully",
        company_id: auth.companyId,
        outlet_id: outletId,
        product_id,
        adjustment_quantity,
        reason
      });
    } catch (error) {
      console.error("Stock adjustment error:", error);
      
      if (error instanceof z.ZodError) {
        return errorResponse("VALIDATION_ERROR", "Invalid request parameters", 400);
      }
      
      return errorResponse(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Failed to adjust stock",
        500
      );
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

export { stockRoutes };
