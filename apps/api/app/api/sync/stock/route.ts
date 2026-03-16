// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "../../../../src/lib/auth-guard";
import { successResponse, errorResponse } from "../../../../src/lib/response";
import { getDbPool } from "../../../../src/lib/db";
import { NumericIdSchema } from "@jurnapod/shared";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";

// Query parameter validation
const StockSyncQuerySchema = z.object({
  outlet_id: z.coerce.number().int().positive(),
  since: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

// Stock item response schema
const StockItemSchema = z.object({
  product_id: z.number(),
  outlet_id: z.number().nullable(),
  quantity: z.number(),
  reserved_quantity: z.number(),
  available_quantity: z.number(),
  updated_at: z.string().datetime()
});

// Sync response schema
const StockSyncResponseSchema = z.object({
  items: z.array(StockItemSchema),
  has_more: z.boolean(),
  next_cursor: z.string().optional(),
  sync_timestamp: z.string().datetime()
});

interface StockRow extends RowDataPacket {
  product_id: number;
  outlet_id: number | null;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  updated_at: string;
}

function parseOutletIdForGuard(request: Request): number {
  const outletIdRaw = new URL(request.url).searchParams.get("outlet_id");
  return NumericIdSchema.parse(outletIdRaw);
}

function encodeCursor(data: { last_updated_at: string; last_product_id: number }): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

function decodeCursor(cursor: string): { last_updated_at: string; last_product_id: number } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded);
    if (typeof parsed.last_updated_at === "string" && typeof parsed.last_product_id === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export const GET = withAuth(
  async (request, auth) => {
    const dbPool = getDbPool();
    let connection;

    try {
      // Parse and validate query parameters
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams.entries());
      const { outlet_id, since, cursor, limit } = StockSyncQuerySchema.parse(queryParams);

      connection = await dbPool.getConnection();
      const syncTimestamp = new Date().toISOString();

      // Build query based on cursor or since parameter
      let whereClause = "s.company_id = ? AND (s.outlet_id = ? OR s.outlet_id IS NULL)";
      const params: (number | string)[] = [auth.companyId, outlet_id];

      if (cursor) {
        const cursorData = decodeCursor(cursor);
        if (!cursorData) {
          return errorResponse("INVALID_CURSOR", "Invalid cursor format", 400);
        }
        whereClause += " AND (s.updated_at > ? OR (s.updated_at = ? AND s.product_id > ?))";
        params.push(cursorData.last_updated_at, cursorData.last_updated_at, cursorData.last_product_id);
      } else if (since) {
        whereClause += " AND s.updated_at > ?";
        params.push(since);
      }

      // Query stock data with pagination
      const [rows] = await connection.execute<StockRow[]>(
        `SELECT 
          s.product_id,
          s.outlet_id,
          s.quantity,
          s.reserved_quantity,
          s.available_quantity,
          s.updated_at
        FROM inventory_stock s
        JOIN products p ON p.id = s.product_id
        WHERE ${whereClause}
          AND p.track_stock = 1
          AND p.is_active = 1
        ORDER BY s.updated_at ASC, s.product_id ASC
        LIMIT ?`,
        [...params, limit + 1] // Fetch one extra to determine has_more
      );

      const stockItems: StockRow[] = rows;
      const hasMore = stockItems.length > limit;
      const items = hasMore ? stockItems.slice(0, limit) : stockItems;

      // Build response
      const response: z.infer<typeof StockSyncResponseSchema> = {
        items: items.map(item => ({
          product_id: item.product_id,
          outlet_id: item.outlet_id,
          quantity: Number(item.quantity),
          reserved_quantity: Number(item.reserved_quantity),
          available_quantity: Number(item.available_quantity),
          updated_at: item.updated_at
        })),
        has_more: hasMore,
        sync_timestamp: syncTimestamp
      };

      // Add next_cursor if there are more results
      if (hasMore && items.length > 0) {
        const lastItem = items[items.length - 1];
        response.next_cursor = encodeCursor({
          last_updated_at: lastItem.updated_at,
          last_product_id: lastItem.product_id
        });
      }

      // Validate response
      const validatedResponse = StockSyncResponseSchema.parse(response);
      return successResponse(validatedResponse);

    } catch (error) {
      console.error("Stock sync error:", error);

      if (error instanceof z.ZodError) {
        return errorResponse("VALIDATION_ERROR", "Invalid request parameters", 400);
      }

      return errorResponse(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Internal server error",
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
      outletId: (request) => parseOutletIdForGuard(request)
    })
  ]
);

// For tests
export { StockSyncQuerySchema, StockSyncResponseSchema, encodeCursor, decodeCursor };
