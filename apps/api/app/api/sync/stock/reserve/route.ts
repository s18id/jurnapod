// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "../../../../../src/lib/auth-guard";
import { successResponse, errorResponse } from "../../../../../src/lib/response";
import { getDbPool } from "../../../../../src/lib/db";
import { z } from "zod";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

// Request schema for stock reservation
const StockReservationRequestSchema = z.object({
  client_tx_id: z.string().uuid(),
  company_id: z.coerce.number().int().positive(),
  outlet_id: z.coerce.number().int().positive(),
  items: z.array(z.object({
    item_id: z.coerce.number().int().positive(),
    quantity: z.number().positive()
  })).min(1)
});

// Conflict item interface
interface StockConflict {
  item_id: number;
  requested: number;
  available: number;
}

interface StockRow extends RowDataPacket {
  product_id: number;
  available_quantity: number;
  reserved_quantity: number;
}

/**
 * POST /api/v1/sync/stock/reserve
 * Reserve stock for a POS transaction
 * Returns 409 if insufficient stock
 */
export const POST = withAuth(
  async (request: Request, auth: { userId: number; companyId: number }) => {
    const dbPool = getDbPool();
    let connection;

    try {
      const body = await request.json();
      const { client_tx_id, company_id, outlet_id, items } = StockReservationRequestSchema.parse(body);

      // Verify company and outlet match auth
      if (company_id !== auth.companyId) {
        return errorResponse("FORBIDDEN", "Company ID mismatch", 403);
      }

      connection = await dbPool.getConnection();

      // Check stock availability for all items
      const conflicts: StockConflict[] = [];
      const reservations: Array<{ product_id: number; quantity: number }> = [];

      for (const item of items) {
        // Get stock for this product at this outlet (or company-wide)
        const [rows] = await connection.execute<StockRow[]>(
          `SELECT product_id, available_quantity, reserved_quantity
           FROM inventory_stock
           WHERE company_id = ?
             AND product_id = ?
             AND (outlet_id = ? OR outlet_id IS NULL)
           ORDER BY outlet_id IS NULL ASC
           LIMIT 1`,
          [company_id, item.item_id, outlet_id]
        );

        const stock = rows[0];

        if (!stock || stock.available_quantity < item.quantity) {
          conflicts.push({
            item_id: item.item_id,
            requested: item.quantity,
            available: stock ? Number(stock.available_quantity) : 0
          });
        } else {
          reservations.push({
            product_id: item.item_id,
            quantity: item.quantity
          });
        }
      }

      // If any conflicts, return 409 with details
      if (conflicts.length > 0) {
        // Create custom response with conflicts in body
        return Response.json(
          {
            success: false,
            error: {
              code: "STOCK_CONFLICT",
              message: "Insufficient stock for one or more items",
              conflicts
            }
          },
          { status: 409 }
        );
      }

      // Reserve stock atomically
      await connection.beginTransaction();

      try {
        for (const reservation of reservations) {
          // Update stock: increase reserved_quantity, decrease available_quantity
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE inventory_stock
             SET reserved_quantity = reserved_quantity + ?,
                 available_quantity = available_quantity - ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE company_id = ?
               AND product_id = ?
               AND (outlet_id = ? OR outlet_id IS NULL)
               AND available_quantity >= ?`,
            [
              reservation.quantity,
              reservation.quantity,
              company_id,
              reservation.product_id,
              outlet_id,
              reservation.quantity
            ]
          );

          // Check if update succeeded (race condition check)
          if (result.affectedRows === 0) {
            await connection.rollback();
            return Response.json(
              {
                success: false,
                error: {
                  code: "STOCK_CONFLICT",
                  message: "Stock changed during reservation",
                  item_id: reservation.product_id
                }
              },
              { status: 409 }
            );
          }
        }

        // Record reservation for idempotency
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
          ) VALUES (?, ?, 3, 'RESERVATION', ?, ?, ?, CURRENT_TIMESTAMP)`,
          [company_id, outlet_id, client_tx_id, reservations[0].product_id, reservations[0].quantity]
        );

        await connection.commit();

        return successResponse({
          reserved: true,
          client_tx_id,
          items_reserved: reservations.length
        });

      } catch (error) {
        await connection.rollback();
        throw error;
      }

    } catch (error) {
      console.error("Stock reservation error:", error);

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
