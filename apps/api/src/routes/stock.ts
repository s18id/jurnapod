// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Routes
 *
 * REST API routes for stock management:
 * - GET /api/v1/stock - Get stock levels
 * - POST /api/v1/stock/adjust - Manual adjustment
 * - GET /api/v1/stock/transactions - Transaction history
 * - GET /api/v1/stock/low - Low stock alerts
 */

import { z } from "zod";
import {
  getStockLevels,
  getStockTransactions,
  getLowStockAlerts,
  adjustStock,
  type StockAdjustmentInput
} from "../services/stock.js";
import { getDbPool } from "../lib/db.js";
import { withAuth, requireAccess } from "../lib/auth-guard.js";
import { successResponse, errorResponse } from "../lib/response.js";
import { NumericIdSchema } from "@jurnapod/shared";

// Route params schema
const StockAdjustmentBodySchema = z.object({
  outlet_id: z.coerce.number().int().positive(),
  product_id: z.coerce.number().int().positive(),
  adjustment_quantity: z.number().int(),
  reason: z.string().min(1).max(500)
});

function parseOutletIdFromQuery(request: Request): number {
  const outletIdRaw = new URL(request.url).searchParams.get("outlet_id");
  return NumericIdSchema.parse(outletIdRaw);
}

/**
 * GET /api/v1/stock
 * Get stock levels for a company/outlet
 *
 * Query params:
 * - outlet_id (required): The outlet to get stock for
 * - product_id (optional): Get stock for a specific product
 */
export const GET = withAuth(
  async (request, auth) => {
    const dbPool = getDbPool();
    let connection;

    try {
      const url = new URL(request.url);
      const outletIdRaw = url.searchParams.get("outlet_id");
      const productIdRaw = url.searchParams.get("product_id");

      const outletId = outletIdRaw ? parseInt(outletIdRaw, 10) : null;
      if (!outletId || isNaN(outletId)) {
        return errorResponse("BAD_REQUEST", "outlet_id is required", 400);
      }

      const productIds = productIdRaw ? [parseInt(productIdRaw, 10)] : undefined;

      connection = await dbPool.getConnection();
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
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      outletId: (request) => parseOutletIdFromQuery(request)
    })
  ]
);

/**
 * GET /api/v1/stock/transactions
 * Get stock transaction history
 *
 * Query params:
 * - outlet_id (optional): Filter by outlet
 * - product_id (optional): Filter by product
 * - transaction_type (optional): Filter by type (DEDUCTION, RESTORATION, ADJUSTMENT, RESERVATION, RELEASE)
 * - limit (optional): Max results (default: 100, max: 500)
 * - offset (optional): Pagination offset
 */
export const GET_transactions = withAuth(
  async (request, auth) => {
    const dbPool = getDbPool();
    let connection;

    try {
      const url = new URL(request.url);
      const outletIdRaw = url.searchParams.get("outlet_id");
      const productIdRaw = url.searchParams.get("product_id");
      const transactionType = url.searchParams.get("transaction_type");
      const limitRaw = url.searchParams.get("limit");
      const offsetRaw = url.searchParams.get("offset");

      const outletId = outletIdRaw ? parseInt(outletIdRaw, 10) : null;
      const productId = productIdRaw ? parseInt(productIdRaw, 10) : undefined;
      const limit = limitRaw ? parseInt(limitRaw, 10) : 100;
      const offset = offsetRaw ? parseInt(offsetRaw, 10) : 0;
      
      // Parse transaction type to number
      const transactionTypeNum = transactionType ? parseInt(transactionType, 10) : undefined;

      connection = await dbPool.getConnection();
      const { transactions, total } = await getStockTransactions(
        auth.companyId,
        outletId,
        {
          product_id: productId,
          transaction_type: transactionTypeNum,
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
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      outletId: (request) => {
        const outletIdRaw = new URL(request.url).searchParams.get("outlet_id");
        return outletIdRaw ? parseInt(outletIdRaw, 10) : undefined;
      }
    })
  ]
);

/**
 * GET /api/v1/stock/low
 * Get low stock alerts
 *
 * Query params:
 * - outlet_id (required): The outlet to check
 */
export const GET_low = withAuth(
  async (request, auth) => {
    const dbPool = getDbPool();
    let connection;

    try {
      const url = new URL(request.url);
      const outletIdRaw = url.searchParams.get("outlet_id");

      const outletId = outletIdRaw ? parseInt(outletIdRaw, 10) : null;
      if (!outletId || isNaN(outletId)) {
        return errorResponse("BAD_REQUEST", "outlet_id is required", 400);
      }

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
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      outletId: (request) => parseOutletIdFromQuery(request)
    })
  ]
);

/**
 * POST /api/v1/stock/adjust
 * Manual stock adjustment
 *
 * Body:
 * - outlet_id (required): The outlet
 * - product_id (required): The product to adjust
 * - adjustment_quantity (required): Amount to adjust (positive or negative)
 * - reason (required): Reason for adjustment
 */
export const POST_adjust = withAuth(
  async (request, auth) => {
    const dbPool = getDbPool();
    let connection;

    try {
      const body = await request.json();
      
      // Validate body
      const parseResult = StockAdjustmentBodySchema.safeParse(body);
      if (!parseResult.success) {
        return errorResponse(
          "VALIDATION_ERROR",
          "Invalid request body",
          400
        );
      }

      const { outlet_id, product_id, adjustment_quantity, reason } = parseResult.data;

      connection = await dbPool.getConnection();
      
      const adjustmentInput: StockAdjustmentInput = {
        company_id: auth.companyId,
        outlet_id,
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
        outlet_id,
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
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT"],
      outletId: async (request) => {
        const body = await request.clone().json();
        return body.outlet_id;
      }
    })
  ]
);
