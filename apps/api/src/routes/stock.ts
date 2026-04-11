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
import type { Context, Handler } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { createRoute, type OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import {
  getStockLevels,
  getStockTransactions,
  getLowStockAlerts,
  adjustStock,
  type StockAdjustmentInput
} from "../lib/stock.js";
import { authenticateRequest, requireAccess, type AuthContext } from "../lib/auth-guard.js";
import { type RoleCode } from "../lib/auth.js";
import { successResponse, errorResponse } from "../lib/response.js";
import { telemetryMiddleware } from "../middleware/telemetry.js";
import { NumericIdSchema } from "@jurnapod/shared";

// Zod schemas for request validation
// Note: outlet_id comes from path parameter (:outletId), not body/query
const StockAdjustmentBodySchema = z.object({
  product_id: NumericIdSchema,
  adjustment_quantity: z.number().int(),
  reason: z.string().min(1).max(500)
});

const StockQuerySchema = z.object({
  product_id: NumericIdSchema.optional()
});

const StockTransactionsQuerySchema = z.object({
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

// Route params schema - outlet_id now comes from path parameter (:outletId)

/**
 * Auth middleware for stock routes
 * Extracts auth context and sets c.set("auth", authContext)
 */
async function authMiddleware(c: Context, next: () => Promise<void>): Promise<void | Response> {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
}

/**
 * Role-based access control middleware for stock routes
 * Note: outlet_id now comes from path parameter (:outletId)
 */
function requireStockAccess(roles: readonly string[], permission: "read" | "create" = "read") {
  return async (c: Context, next: () => Promise<void>): Promise<void | Response> => {
    const auth = c.get("auth");
    if (!auth) {
      return Response.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 }
      );
    }

    // Extract outlet ID from path parameter
    const outletIdParam = c.req.param("outletId");
    let outletId: number | undefined;
    
    if (outletIdParam) {
      const parsed = parseInt(outletIdParam, 10);
      if (Number.isSafeInteger(parsed) && parsed > 0) {
        outletId = parsed;
      }
    }

    // Use proper auth guard with role and outlet access checks
    const authGuard = requireAccess({
      roles: roles as RoleCode[],
      module: "inventory",
      resource: "stock",
      permission: permission,
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
  void c.get("auth"); // Validate auth is set
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
 * Path params:
 * - outletId (required): The outlet to get stock for (from URL path)
 * Query params:
 * - product_id (optional): Get stock for a specific product
 */
stockRoutes.get(
  "/",
  zValidator('query', StockQuerySchema),
  requireStockAccess(["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"]),
  async (c) => {
    const auth = c.get("auth");

    try {
      const outletId = parseInt(c.req.param("outletId") ?? "", 10);
      const { product_id } = c.req.valid('query');

      const productIds = product_id ? [product_id] : undefined;
      const stockLevels = await getStockLevels(auth.companyId, outletId, productIds);

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
    }
  }
);

/**
 * GET /stock/transactions
 * Get stock transaction history
 *
 * Path params:
 * - outletId (required): The outlet to get transactions for (from URL path)
 * Query params:
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

    try {
      const outletId = parseInt(c.req.param("outletId") ?? "", 10);
      const { product_id, transaction_type, limit, offset } = c.req.valid('query');

      const { transactions, total } = await getStockTransactions(
        auth.companyId,
        outletId,
        {
          product_id,
          transaction_type,
          limit,
          offset
        }
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
    }
  }
);

/**
 * GET /stock/low
 * Get low stock alerts
 *
 * Path params:
 * - outletId (required): The outlet to check (from URL path)
 */
stockRoutes.get(
  "/low",
  zValidator('query', StockQuerySchema),
  requireStockAccess(["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"]),
  async (c) => {
    const auth = c.get("auth");

    try {
      const outletId = parseInt(c.req.param("outletId") ?? "", 10);

      const alerts = await getLowStockAlerts(auth.companyId, outletId);

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
    }
  }
);

/**
 * POST /stock/adjustments
 * Manual stock adjustment
 *
 * Path params:
 * - outletId (required): The outlet to adjust stock for (from URL path)
 * Body:
 * - product_id (required): The product to adjust
 * - adjustment_quantity (required): Amount to adjust (positive or negative)
 * - reason (required): Reason for adjustment
 */
stockRoutes.post(
  "/adjustments",
  zValidator('json', StockAdjustmentBodySchema),
  requireStockAccess(["OWNER", "ADMIN", "ACCOUNTANT"], "create"),
  async (c) => {
    const auth = c.get("auth");

    try {
      const outletId = parseInt(c.req.param("outletId") ?? "", 10);
      const { product_id, adjustment_quantity, reason } = c.req.valid('json') as {
        product_id: number;
        adjustment_quantity: number;
        reason: string;
      };

      const adjustmentInput: StockAdjustmentInput = {
        company_id: auth.companyId,
        outlet_id: outletId,
        product_id,
        adjustment_quantity,
        reason,
        reference_id: `MANUAL-${Date.now()}`,
        user_id: auth.userId
      };

      const success = await adjustStock(adjustmentInput);

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
    }
  }
);

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

type OpenAPIHonoInterface = {
  openapi: OpenAPIHonoType["openapi"];
};

const StockLevelResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    company_id: z.number(),
    outlet_id: z.number(),
    items: z.array(z.unknown())
  })
}).openapi("StockLevelResponse");

const StockTransactionsResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    company_id: z.number(),
    outlet_id: z.number(),
    transactions: z.array(z.unknown()),
    pagination: z.object({
      total: z.number(),
      limit: z.number(),
      offset: z.number(),
      has_more: z.boolean()
    })
  })
}).openapi("StockTransactionsResponse");

const StockAlertsResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    company_id: z.number(),
    outlet_id: z.number(),
    alerts: z.array(z.unknown()),
    total_alerts: z.number()
  })
}).openapi("StockAlertsResponse");

const StockAdjustmentResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    message: z.string(),
    company_id: z.number(),
    outlet_id: z.number(),
    product_id: z.number(),
    adjustment_quantity: z.number(),
    reason: z.string()
  })
}).openapi("StockAdjustmentResponse");

const ErrorResponseSchema = z.object({
  success: z.boolean(),
  error: z.object({
    code: z.string(),
    message: z.string()
  })
}).openapi("ErrorResponse");

export const registerStockRoutes = (app: OpenAPIHonoInterface): void => {
  // GET /stock - Get stock levels
  app.openapi(
    createRoute({
      method: "get",
      path: "/stock",
      tags: ["Stock"],
      summary: "Get stock levels",
      description: "Get stock levels for a company/outlet",
      security: [{ BearerAuth: [] }],
      request: {
        query: z.object({
          product_id: NumericIdSchema.optional()
        })
      },
      responses: {
        200: { content: { "application/json": { schema: StockLevelResponseSchema } }, description: "Stock levels retrieved" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any): Promise<any> => {
      try {
        const auth = c.get("auth");
        const outletId = parseInt(c.req.param("outletId") ?? "", 10);
        const { product_id } = c.req.valid('query');

        const productIds = product_id ? [product_id] : undefined;
        const stockLevels = await getStockLevels(auth.companyId, outletId, productIds);

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
        return errorResponse("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to get stock levels", 500);
      }
    }
  ) as unknown as Handler;

  // GET /stock/transactions - Get stock transaction history
  app.openapi(
    createRoute({
      method: "get",
      path: "/stock/transactions",
      tags: ["Stock"],
      summary: "Get stock transactions",
      description: "Get stock transaction history",
      security: [{ BearerAuth: [] }],
      request: {
        query: z.object({
          product_id: NumericIdSchema.optional(),
          transaction_type: z.coerce.number().int().optional(),
          limit: z.coerce.number().int().positive().max(500).default(100),
          offset: z.coerce.number().int().nonnegative().default(0)
        })
      },
      responses: {
        200: { content: { "application/json": { schema: StockTransactionsResponseSchema } }, description: "Transactions retrieved" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any): Promise<any> => {
      try {
        const auth = c.get("auth");
        const outletId = parseInt(c.req.param("outletId") ?? "", 10);
        const { product_id, transaction_type, limit, offset } = c.req.valid('query');

        const { transactions, total } = await getStockTransactions(auth.companyId, outletId, {
          product_id,
          transaction_type,
          limit,
          offset
        });

        return successResponse({
          company_id: auth.companyId,
          outlet_id: outletId,
          transactions,
          pagination: { total, limit, offset, has_more: offset + transactions.length < total }
        });
      } catch (error) {
        console.error("Get stock transactions error:", error);
        if (error instanceof z.ZodError) {
          return errorResponse("VALIDATION_ERROR", "Invalid request parameters", 400);
        }
        return errorResponse("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to get stock transactions", 500);
      }
    }
  ) as unknown as Handler;

  // GET /stock/low - Get low stock alerts
  app.openapi(
    createRoute({
      method: "get",
      path: "/stock/low",
      tags: ["Stock"],
      summary: "Get low stock alerts",
      description: "Get low stock alerts for an outlet",
      security: [{ BearerAuth: [] }],
      responses: {
        200: { content: { "application/json": { schema: StockAlertsResponseSchema } }, description: "Alerts retrieved" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any): Promise<any> => {
      try {
        const auth = c.get("auth");
        const outletId = parseInt(c.req.param("outletId") ?? "", 10);
        const alerts = await getLowStockAlerts(auth.companyId, outletId);
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
        return errorResponse("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to get low stock alerts", 500);
      }
    }
  ) as unknown as Handler;

  // POST /stock/adjustments - Manual stock adjustment
  app.openapi(
    createRoute({
      method: "post",
      path: "/stock/adjustments",
      tags: ["Stock"],
      summary: "Adjust stock",
      description: "Manual stock adjustment",
      security: [{ BearerAuth: [] }],
      request: {
        body: {
          content: {
            "application/json": { schema: StockAdjustmentBodySchema }
          }
        }
      },
      responses: {
        200: { content: { "application/json": { schema: StockAdjustmentResponseSchema } }, description: "Stock adjusted" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any): Promise<any> => {
      try {
        const auth = c.get("auth");
        const outletId = parseInt(c.req.param("outletId") ?? "", 10);
        const { product_id, adjustment_quantity, reason } = c.req.valid('json');

        const adjustmentInput: StockAdjustmentInput = {
          company_id: auth.companyId,
          outlet_id: outletId,
          product_id,
          adjustment_quantity,
          reason,
          reference_id: `MANUAL-${Date.now()}`,
          user_id: auth.userId
        };

        const success = await adjustStock(adjustmentInput);

        if (!success) {
          return errorResponse("ADJUSTMENT_FAILED", "Failed to adjust stock. Insufficient quantity or stock record not found.", 400);
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
        return errorResponse("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to adjust stock", 500);
      }
    }
  ) as unknown as Handler;
};

export { stockRoutes };
