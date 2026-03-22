// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Validation Middleware
 *
 * Middleware for validating stock availability before processing requests.
 * Designed to work with Hono-based API routes.
 */

import { z } from "zod";
import type { Context } from "hono";
import { checkAvailability, getStockConflicts, type StockItem } from "../services/stock.js";

// Schema for stock validation in request body
export const StockValidationBodySchema = z.object({
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    quantity: z.number().positive()
  })).min(1)
});

export interface StockValidationConfig {
  /** Extract company_id from request context */
  getCompanyId: (ctx: Context) => number;
  /** Extract outlet_id from request context */
  getOutletId: (ctx: Context) => number;
  /** Extract items from request (default: body.items) */
  getItems?: (ctx: Context) => StockItem[];
  /** Allow the request to proceed even if stock check fails (just attach conflicts to context) */
  allowInsufficient?: boolean;
  /** Custom error message */
  errorMessage?: string;
}

export interface StockValidationResult {
  available: boolean;
  conflicts: Array<{
    product_id: number;
    requested: number;
    available: number;
  }>;
  items: StockItem[];
}

// Extend Hono context type
declare module "hono" {
  interface ContextVariableMap {
    stockValidation?: StockValidationResult;
  }
}

/**
 * Middleware factory for stock availability validation
 *
 * Example usage with Hono:
 * ```typescript
 * import { Hono } from "hono";
 * import { validateStockAvailability } from "../middleware/stock";
 *
 * const app = new Hono();
 *
 * app.post('/sales',
 *   validateStockAvailability({
 *     getCompanyId: (c) => c.get('auth').companyId,
 *     getOutletId: (c) => c.req.query('outlet_id')
 *   }),
 *   async (c) => {
 *     // Handler
 *   }
 * );
 * ```
 */
export function validateStockAvailability(config: StockValidationConfig) {
  return async (ctx: Context, next: () => Promise<void>): Promise<Response | void> => {
    try {
      // Extract values from context
      const companyId = config.getCompanyId(ctx);
      const outletId = config.getOutletId(ctx);
      
      // Get items from context or body
      let items: StockItem[];
      if (config.getItems) {
        items = config.getItems(ctx);
      } else {
        // Try to parse from body
        const body = await ctx.req.json().catch(() => ({}));
        items = body.items;
      }

      // Validate required parameters
      if (!companyId || typeof companyId !== "number") {
        return ctx.json({
          success: false,
          error: {
            code: "MISSING_COMPANY_ID",
            message: "Company ID is required for stock validation"
          }
        }, 400);
      }

      if (!outletId || typeof outletId !== "number") {
        return ctx.json({
          success: false,
          error: {
            code: "MISSING_OUTLET_ID",
            message: "Outlet ID is required for stock validation"
          }
        }, 400);
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        return ctx.json({
          success: false,
          error: {
            code: "MISSING_ITEMS",
            message: "Items array is required for stock validation"
          }
        }, 400);
      }

      // Validate item structure
      const validationResult = StockValidationBodySchema.safeParse({ items });
      if (!validationResult.success) {
        return ctx.json({
          success: false,
          error: {
            code: "INVALID_ITEMS_FORMAT",
            message: "Items must have product_id and quantity",
            details: validationResult.error.errors
          }
        }, 400);
      }

      // Check stock availability
      const stockItems: StockItem[] = items.map((item: StockItem) => ({
        product_id: item.product_id,
        quantity: item.quantity
      }));

      const availability = await checkAvailability(companyId, outletId, stockItems);
      const conflicts = availability
        .filter((a: { available: boolean }) => !a.available)
        .map((a: { product_id: number; requested_quantity: number; available_quantity: number }) => ({
          product_id: a.product_id,
          requested: a.requested_quantity,
          available: a.available_quantity
        }));

      const result: StockValidationResult = {
        available: conflicts.length === 0,
        conflicts,
        items: stockItems
      };

      // Attach result to context for downstream use
      ctx.set("stockValidation", result);

      // If insufficient stock and not allowing it, return 409 Conflict
      if (!result.available && !config.allowInsufficient) {
        return ctx.json({
          success: false,
          error: {
            code: "INSUFFICIENT_STOCK",
            message: config.errorMessage ?? "Insufficient stock for one or more items",
            conflicts: result.conflicts
          }
        }, 409);
      }

      await next();
    } catch (error) {
      console.error("Stock validation middleware error:", error);
      return ctx.json({
        success: false,
        error: {
          code: "STOCK_VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "Failed to validate stock availability"
        }
      }, 500);
    }
  };
}

/**
 * Standalone function to check stock for specific items
 * Returns conflicts if any
 */
export async function requireStockForItems(
  companyId: number,
  outletId: number,
  items: StockItem[]
): Promise<{ valid: boolean; conflicts?: Array<{ product_id: number; requested: number; available: number }> }> {
  const conflicts = await getStockConflicts(companyId, outletId, items);
  return {
    valid: conflicts.length === 0,
    conflicts: conflicts.length > 0 ? conflicts : undefined
  };
}

/**
 * Create a stock validation error response
 */
export function createStockConflictResponse(
  conflicts: Array<{ product_id: number; requested: number; available: number }>,
  message?: string
) {
  return {
    success: false,
    error: {
      code: "INSUFFICIENT_STOCK",
      message: message ?? "Insufficient stock for one or more items",
      conflicts
    }
  };
}
