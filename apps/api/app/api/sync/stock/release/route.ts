// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "../../../../../src/lib/auth-guard";
import { successResponse, errorResponse } from "../../../../../src/lib/response";
import { getDbPool } from "../../../../../src/lib/db";
import { z } from "zod";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

// Request schema for stock release
const StockReleaseRequestSchema = z.object({
  client_tx_id: z.string().uuid(),
  company_id: z.coerce.number().int().positive(),
  outlet_id: z.coerce.number().int().positive(),
  items: z.array(z.object({
    item_id: z.coerce.number().int().positive(),
    quantity: z.number().positive()
  })).min(1)
});

interface StockRow extends RowDataPacket {
  product_id: number;
  quantity: number;
  reserved_quantity: number;
}

/**
 * POST /api/v1/sync/stock/release
 * Release reserved stock (for voids/refunds)
 */
export const POST = withAuth(
  async (request: Request, auth: { userId: number; companyId: number }) => {
    const dbPool = getDbPool();
    let connection;

    try {
      const body = await request.json();
      const { client_tx_id, company_id, outlet_id, items } = StockReleaseRequestSchema.parse(body);

      // Verify company and outlet match auth
      if (company_id !== auth.companyId) {
        return errorResponse("FORBIDDEN", "Company ID mismatch", 403);
      }

      connection = await dbPool.getConnection();

      // Release stock atomically
      await connection.beginTransaction();

      try {
        for (const item of items) {
          // Get current stock to verify there's enough reserved
          const [rows] = await connection.execute<StockRow[]>(
            `SELECT product_id, quantity, reserved_quantity
             FROM inventory_stock
             WHERE company_id = ?
               AND product_id = ?
               AND (outlet_id = ? OR outlet_id IS NULL)
             ORDER BY outlet_id IS NULL ASC
             LIMIT 1
             FOR UPDATE`,
            [company_id, item.item_id, outlet_id]
          );

          const stock = rows[0];

          if (!stock) {
            // Product doesn't exist in inventory, skip
            console.warn(`Stock release: Product ${item.item_id} not found in inventory`);
            continue;
          }

          // Calculate how much we can actually release (can't release more than reserved)
          const releaseQty = Math.min(item.quantity, Number(stock.reserved_quantity));

          if (releaseQty <= 0) {
            // Nothing to release
            continue;
          }

          // Update stock: decrease reserved_quantity, increase available_quantity
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE inventory_stock
             SET reserved_quantity = reserved_quantity - ?,
                 available_quantity = available_quantity + ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE company_id = ?
               AND product_id = ?
               AND (outlet_id = ? OR outlet_id IS NULL)
               AND reserved_quantity >= ?`,
            [
              releaseQty,
              releaseQty,
              company_id,
              item.item_id,
              outlet_id,
              releaseQty
            ]
          );

          // Check if update succeeded
          if (result.affectedRows === 0) {
            await connection.rollback();
            return errorResponse(
              "STOCK_RELEASE_FAILED",
              `Failed to release stock for item ${item.item_id}`,
              500
            );
          }
        }

        // Record release for audit
        await connection.execute(
          `INSERT INTO inventory_transactions (
            company_id,
            outlet_id,
            transaction_type,
            reference_type,
            reference_id,
            product_id,
            quantity_delta,
            created_at
          ) VALUES (?, ?, 4, 'RELEASE', ?, ?, ?, CURRENT_TIMESTAMP)`,
          [company_id, outlet_id, client_tx_id, items[0].item_id, items[0].quantity]
        );

        await connection.commit();

        return successResponse({
          released: true,
          client_tx_id,
          items_released: items.length
        });

      } catch (error) {
        await connection.rollback();
        throw error;
      }

    } catch (error) {
      console.error("Stock release error:", error);

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
      outletId: async (request: Request) => {
        const body = await request.clone().json();
        return body.outlet_id;
      }
    })
  ]
);
