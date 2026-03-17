// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Service
 *
 * Core stock operations with database transaction support.
 * All methods enforce company_id and outlet_id scoping.
 */

import { getDbPool } from "@/lib/db";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { createCostLayer } from "@/lib/cost-tracking";

/**
 * Transaction Type Constants
 * Using TINYINT values for compact storage and fast indexing
 */
export const TransactionType = {
  SALE: 1,        // Stock reduction from completed sale
  REFUND: 2,      // Stock increase from void/refund
  RESERVATION: 3, // Temporary stock hold during checkout
  RELEASE: 4,     // Cancel reservation
  ADJUSTMENT: 5,  // Manual inventory adjustment
  RECEIPT: 6,     // Stock received from supplier
  TRANSFER: 7     // Inter-outlet stock transfer
} as const;

export type TransactionTypeValue = typeof TransactionType[keyof typeof TransactionType];

export interface StockItem {
  product_id: number;
  quantity: number;
}

export interface StockCheckResult {
  product_id: number;
  available: boolean;
  requested_quantity: number;
  available_quantity: number;
}

export interface StockReservationResult {
  success: boolean;
  reserved?: boolean;
  conflicts?: Array<{
    product_id: number;
    requested: number;
    available: number;
  }>;
}

export interface StockAdjustmentInput {
  company_id: number;
  outlet_id: number | null;
  product_id: number;
  adjustment_quantity: number;
  reason: string;
  reference_id?: string;
  user_id: number;
}

export interface StockTransaction {
  transaction_id: number;
  company_id: number;
  outlet_id: number | null;
  transaction_type: number;
  reference_type: string | null;
  reference_id: string | null;
  product_id: number;
  quantity_delta: number;
  created_at: string;
}

export interface StockLevel {
  product_id: number;
  outlet_id: number | null;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  updated_at: string;
}

export interface LowStockAlert {
  product_id: number;
  sku: string;
  name: string;
  quantity: number;
  available_quantity: number;
  low_stock_threshold: number;
}

interface StockRow extends RowDataPacket {
  product_id: number;
  outlet_id: number | null;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  updated_at: string;
}

interface ProductRow extends RowDataPacket {
  id: number;
  sku: string;
  name: string;
  track_stock: number;
  low_stock_threshold: number | null;
}

interface CostSummaryRow extends RowDataPacket {
  current_avg_cost: number | null;
}

interface PriceRow extends RowDataPacket {
  price: number | null;
}

/**
 * Resolve unit cost for inbound stock movements.
 * Priority:
 * 1. inventory_item_costs.current_avg_cost
 * 2. latest item_prices.price
 * 3. throw if not found (fail-closed)
 */
async function resolveInboundUnitCost(
  conn: PoolConnection,
  companyId: number,
  itemId: number
): Promise<number> {
  // Try inventory_item_costs first
  const [costRows] = await conn.execute<CostSummaryRow[]>(
    `SELECT current_avg_cost
     FROM inventory_item_costs
     WHERE company_id = ? AND item_id = ?`,
    [companyId, itemId]
  );

  const avgCost = costRows[0]?.current_avg_cost;
  if (avgCost !== null && avgCost !== undefined && Number(avgCost) > 0) {
    return Number(avgCost);
  }

  // Fallback to item_prices
  const [priceRows] = await conn.execute<PriceRow[]>(
    `SELECT price
     FROM item_prices
     WHERE company_id = ? AND item_id = ?
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [companyId, itemId]
  );

  const price = priceRows[0]?.price;
  if (price !== null && price !== undefined && Number(price) > 0) {
    return Number(price);
  }

  throw new Error(
    `Unable to determine unit cost for item ${itemId}. No cost history or pricing data available.`
  );
}

/**
 * Check stock availability for multiple items
 * Uses atomic SELECT to verify availability without locking
 */
export async function checkAvailability(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  connection?: PoolConnection
): Promise<StockCheckResult[]> {
  const dbPool = getDbPool();
  const conn = connection ?? await dbPool.getConnection();
  const shouldRelease = !connection;

  try {
    const results: StockCheckResult[] = [];

    for (const item of items) {
      const [rows] = await conn.execute<StockRow[]>(
        `SELECT product_id, available_quantity
         FROM inventory_stock
         WHERE company_id = ?
           AND product_id = ?
           AND (outlet_id = ? OR outlet_id IS NULL)
         ORDER BY outlet_id IS NULL ASC
         LIMIT 1`,
        [company_id, item.product_id, outlet_id]
      );

      const stock = rows[0];
      const availableQty = stock ? Number(stock.available_quantity) : 0;

      results.push({
        product_id: item.product_id,
        available: availableQty >= item.quantity,
        requested_quantity: item.quantity,
        available_quantity: availableQty
      });
    }

    return results;
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

/**
 * Check if all items have sufficient stock
 * Returns true only if ALL items are available
 */
export async function hasSufficientStock(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  connection?: PoolConnection
): Promise<boolean> {
  const results = await checkAvailability(company_id, outlet_id, items, connection);
  return results.every(r => r.available);
}

/**
 * Get stock conflicts for items that cannot be fulfilled
 */
export async function getStockConflicts(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  connection?: PoolConnection
): Promise<Array<{ product_id: number; requested: number; available: number }>> {
  const results = await checkAvailability(company_id, outlet_id, items, connection);
  return results
    .filter(r => !r.available)
    .map(r => ({
      product_id: r.product_id,
      requested: r.requested_quantity,
      available: r.available_quantity
    }));
}

/**
 * Deduct stock permanently (after transaction completion)
 * Reduces quantity and available_quantity
 */
export async function deductStock(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  reference_id: string,
  user_id: number,
  connection?: PoolConnection
): Promise<boolean> {
  const dbPool = getDbPool();
  const conn = connection ?? await dbPool.getConnection();
  const shouldRelease = !connection;

  try {
    if (!connection) {
      await conn.beginTransaction();
    }

    try {
      for (const item of items) {
        // Verify stock exists and has sufficient quantity
        const [stockRows] = await conn.execute<StockRow[]>(
          `SELECT quantity, available_quantity
           FROM inventory_stock
           WHERE company_id = ?
             AND product_id = ?
             AND (outlet_id = ? OR outlet_id IS NULL)
           ORDER BY outlet_id IS NULL ASC
           LIMIT 1
           FOR UPDATE`,
          [company_id, item.product_id, outlet_id]
        );

        if (stockRows.length === 0) {
          if (!connection) await conn.rollback();
          return false;
        }

        const stock = stockRows[0];
        if (Number(stock.quantity) < item.quantity) {
          if (!connection) await conn.rollback();
          return false;
        }

        // Deduct stock - reduce both quantity and available_quantity
        const [updateResult] = await conn.execute<ResultSetHeader>(
          `UPDATE inventory_stock
           SET quantity = quantity - ?,
               available_quantity = available_quantity - ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE company_id = ?
             AND product_id = ?
             AND (outlet_id = ? OR outlet_id IS NULL)
             AND quantity >= ?`,
          [
            item.quantity,
            item.quantity,
            company_id,
            item.product_id,
            outlet_id,
            item.quantity
          ]
        );

        if (updateResult.affectedRows === 0) {
          if (!connection) await conn.rollback();
          return false;
        }

        // Record transaction
        await conn.execute(
          `INSERT INTO inventory_transactions (
            company_id,
            outlet_id,
            transaction_type,
            reference_type,
            reference_id,
            product_id,
            quantity_delta,
            created_at
          ) VALUES (?, ?, ?, 'SALE', ?, ?, ?, CURRENT_TIMESTAMP)`,
          [company_id, outlet_id, TransactionType.SALE, reference_id, item.product_id, -item.quantity]
        );
      }

      if (!connection) {
        await conn.commit();
      }

      return true;
    } catch (error) {
      if (!connection) await conn.rollback();
      throw error;
    }
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

/**
 * Restore stock (for voids/refunds)
 * Increases quantity and available_quantity
 */
export async function restoreStock(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  reference_id: string,
  user_id: number,
  connection?: PoolConnection
): Promise<boolean> {
  const dbPool = getDbPool();
  const conn = connection ?? await dbPool.getConnection();
  const shouldRelease = !connection;

  try {
    if (!connection) {
      await conn.beginTransaction();
    }

    try {
      for (const item of items) {
        // Update stock - increase both quantity and available_quantity
        const [updateResult] = await conn.execute<ResultSetHeader>(
          `UPDATE inventory_stock
           SET quantity = quantity + ?,
               available_quantity = available_quantity + ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE company_id = ?
             AND product_id = ?
             AND (outlet_id = ? OR outlet_id IS NULL)`,
          [
            item.quantity,
            item.quantity,
            company_id,
            item.product_id,
            outlet_id
          ]
        );

        if (updateResult.affectedRows === 0) {
          // Stock record doesn't exist, create it
          await conn.execute(
            `INSERT INTO inventory_stock (
              company_id,
              outlet_id,
              product_id,
              quantity,
              reserved_quantity,
              available_quantity,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [company_id, outlet_id, item.product_id, item.quantity, item.quantity]
          );
        }

        // Record transaction
        const [txResult] = await conn.execute<ResultSetHeader>(
          `INSERT INTO inventory_transactions (
            company_id,
            outlet_id,
            transaction_type,
            reference_type,
            reference_id,
            product_id,
            quantity_delta,
            created_at
          ) VALUES (?, ?, ?, 'REFUND', ?, ?, ?, CURRENT_TIMESTAMP)`,
          [company_id, outlet_id, TransactionType.REFUND, reference_id, item.product_id, item.quantity]
        );

        // Create cost layer for inbound movement
        const unitCost = await resolveInboundUnitCost(conn, company_id, item.product_id);
        await createCostLayer(
          {
            companyId: company_id,
            itemId: item.product_id,
            transactionId: txResult.insertId,
            unitCost,
            quantity: item.quantity,
          },
          conn
        );
      }

      if (!connection) {
        await conn.commit();
      }

      return true;
    } catch (error) {
      if (!connection) await conn.rollback();
      throw error;
    }
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

/**
 * Adjust stock quantity manually (for inventory counts, damage, etc.)
 * Records the adjustment in transactions
 */
export async function adjustStock(
  input: StockAdjustmentInput,
  connection?: PoolConnection
): Promise<boolean> {
  const { company_id, outlet_id, product_id, adjustment_quantity, reason, reference_id, user_id } = input;

  const dbPool = getDbPool();
  const conn = connection ?? await dbPool.getConnection();
  const shouldRelease = !connection;

  try {
    if (!connection) {
      await conn.beginTransaction();
    }

    try {
      // Get current stock
      const [stockRows] = await conn.execute<StockRow[]>(
        `SELECT quantity, reserved_quantity, available_quantity
         FROM inventory_stock
         WHERE company_id = ?
           AND product_id = ?
           AND (outlet_id = ? OR outlet_id IS NULL)
         ORDER BY outlet_id IS NULL ASC
         LIMIT 1
         FOR UPDATE`,
        [company_id, product_id, outlet_id]
      );

      let currentQty = 0;
      let currentReserved = 0;

      if (stockRows.length > 0) {
        currentQty = Number(stockRows[0].quantity);
        currentReserved = Number(stockRows[0].reserved_quantity);
      }

      const newQty = currentQty + adjustment_quantity;
      const newAvailable = newQty - currentReserved;

      if (newQty < 0) {
        if (!connection) await conn.rollback();
        return false;
      }

      if (stockRows.length > 0) {
        // Update existing stock
        const [updateResult] = await conn.execute<ResultSetHeader>(
          `UPDATE inventory_stock
           SET quantity = ?,
               available_quantity = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE company_id = ?
             AND product_id = ?
             AND (outlet_id = ? OR outlet_id IS NULL)`,
          [newQty, newAvailable, company_id, product_id, outlet_id]
        );

        if (updateResult.affectedRows === 0) {
          if (!connection) await conn.rollback();
          return false;
        }
      } else {
        // Create new stock record
        await conn.execute(
          `INSERT INTO inventory_stock (
            company_id,
            outlet_id,
            product_id,
            quantity,
            reserved_quantity,
            available_quantity,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [company_id, outlet_id, product_id, newQty, newAvailable]
        );
      }

      // Record adjustment transaction
      const [txResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO inventory_transactions (
          company_id,
          outlet_id,
          transaction_type,
          reference_type,
          reference_id,
          product_id,
          quantity_delta,
          created_at
        ) VALUES (?, ?, ?, 'ADJUSTMENT', ?, ?, ?, CURRENT_TIMESTAMP)`,
        [company_id, outlet_id, TransactionType.ADJUSTMENT, reference_id ?? `ADJ-${Date.now()}`, product_id, adjustment_quantity]
      );

      // Create cost layer for positive inbound adjustments only
      if (adjustment_quantity > 0) {
        const unitCost = await resolveInboundUnitCost(conn, company_id, product_id);
        await createCostLayer(
          {
            companyId: company_id,
            itemId: product_id,
            transactionId: txResult.insertId,
            unitCost,
            quantity: adjustment_quantity,
          },
          conn
        );
      }

      if (!connection) {
        await conn.commit();
      }

      return true;
    } catch (error) {
      if (!connection) await conn.rollback();
      throw error;
    }
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

/**
 * Reserve stock for pending transactions
 * Reduces available_quantity but keeps quantity unchanged
 */
export async function reserveStock(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  reference_id: string,
  connection?: PoolConnection
): Promise<StockReservationResult> {
  const conflicts: Array<{ product_id: number; requested: number; available: number }> = [];

  // Check availability first
  const availability = await checkAvailability(company_id, outlet_id, items, connection);

  for (const check of availability) {
    if (!check.available) {
      conflicts.push({
        product_id: check.product_id,
        requested: check.requested_quantity,
        available: check.available_quantity
      });
    }
  }

  if (conflicts.length > 0) {
    return { success: false, conflicts };
  }

  const dbPool = getDbPool();
  const conn = connection ?? await dbPool.getConnection();
  const shouldRelease = !connection;

  try {
    if (!connection) {
      await conn.beginTransaction();
    }

    try {
      for (const item of items) {
        // Reserve stock atomically
        const [updateResult] = await conn.execute<ResultSetHeader>(
          `UPDATE inventory_stock
           SET reserved_quantity = reserved_quantity + ?,
               available_quantity = available_quantity - ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE company_id = ?
             AND product_id = ?
             AND (outlet_id = ? OR outlet_id IS NULL)
             AND available_quantity >= ?`,
          [
            item.quantity,
            item.quantity,
            company_id,
            item.product_id,
            outlet_id,
            item.quantity
          ]
        );

        if (updateResult.affectedRows === 0) {
          if (!connection) await conn.rollback();
          return {
            success: false,
            conflicts: [{ product_id: item.product_id, requested: item.quantity, available: 0 }]
          };
        }

        // Record reservation
        await conn.execute(
          `INSERT INTO inventory_transactions (
            company_id,
            outlet_id,
            transaction_type,
            reference_type,
            reference_id,
            product_id,
            quantity_delta,
            created_at
          ) VALUES (?, ?, ?, 'RESERVATION', ?, ?, ?, CURRENT_TIMESTAMP)`,
          [company_id, outlet_id, TransactionType.RESERVATION, reference_id, item.product_id, item.quantity]
        );
      }

      if (!connection) {
        await conn.commit();
      }

      return { success: true, reserved: true };
    } catch (error) {
      if (!connection) await conn.rollback();
      throw error;
    }
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

/**
 * Release reserved stock
 * Increases available_quantity but keeps quantity unchanged
 */
export async function releaseStock(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  reference_id: string,
  connection?: PoolConnection
): Promise<boolean> {
  const dbPool = getDbPool();
  const conn = connection ?? await dbPool.getConnection();
  const shouldRelease = !connection;

  try {
    if (!connection) {
      await conn.beginTransaction();
    }

    try {
      for (const item of items) {
        // Get current reserved quantity
        const [stockRows] = await conn.execute<StockRow[]>(
          `SELECT reserved_quantity
           FROM inventory_stock
           WHERE company_id = ?
             AND product_id = ?
             AND (outlet_id = ? OR outlet_id IS NULL)
           ORDER BY outlet_id IS NULL ASC
           LIMIT 1
           FOR UPDATE`,
          [company_id, item.product_id, outlet_id]
        );

        if (stockRows.length === 0) {
          continue; // No stock record, nothing to release
        }

        const currentReserved = Number(stockRows[0].reserved_quantity);
        const releaseQty = Math.min(item.quantity, currentReserved);

        if (releaseQty <= 0) {
          continue;
        }

        // Release stock
        const [updateResult] = await conn.execute<ResultSetHeader>(
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
            item.product_id,
            outlet_id,
            releaseQty
          ]
        );

        if (updateResult.affectedRows > 0) {
          // Record release
          await conn.execute(
            `INSERT INTO inventory_transactions (
              company_id,
              outlet_id,
              transaction_type,
              reference_type,
              reference_id,
              product_id,
              quantity_delta,
              created_at
            ) VALUES (?, ?, ?, 'RELEASE', ?, ?, ?, CURRENT_TIMESTAMP)`,
            [company_id, outlet_id, TransactionType.RELEASE, reference_id, item.product_id, releaseQty]
          );
        }
      }

      if (!connection) {
        await conn.commit();
      }

      return true;
    } catch (error) {
      if (!connection) await conn.rollback();
      throw error;
    }
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

/**
 * Get current stock levels for a company/outlet
 */
export async function getStockLevels(
  company_id: number,
  outlet_id: number,
  product_ids?: number[],
  connection?: PoolConnection
): Promise<StockLevel[]> {
  const dbPool = getDbPool();
  const conn = connection ?? await dbPool.getConnection();
  const shouldRelease = !connection;

  try {
    let query = `
      SELECT product_id, outlet_id, quantity, reserved_quantity, available_quantity, updated_at
      FROM inventory_stock
      WHERE company_id = ? AND (outlet_id = ? OR outlet_id IS NULL)
    `;
    const params: (number | number[])[] = [company_id, outlet_id];

    if (product_ids && product_ids.length > 0) {
      const placeholders = product_ids.map(() => '?').join(',');
      query += ` AND product_id IN (${placeholders})`;
      params.push(...product_ids);
    }

    query += ` ORDER BY product_id`;

    const [rows] = await conn.execute<StockRow[]>(query, params);

    return rows.map(row => ({
      product_id: row.product_id,
      outlet_id: row.outlet_id,
      quantity: Number(row.quantity),
      reserved_quantity: Number(row.reserved_quantity),
      available_quantity: Number(row.available_quantity),
      updated_at: row.updated_at
    }));
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

/**
 * Get stock transaction history
 */
export async function getStockTransactions(
  company_id: number,
  outlet_id: number | null,
  options: {
    product_id?: number;
    transaction_type?: number;
    since?: string;
    limit?: number;
    offset?: number;
  } = {},
  connection?: PoolConnection
): Promise<{ transactions: StockTransaction[]; total: number }> {
  const dbPool = getDbPool();
  const conn = connection ?? await dbPool.getConnection();
  const shouldRelease = !connection;

  try {
    const { product_id, transaction_type, since, limit = 100, offset = 0 } = options;

    let whereClause = "WHERE company_id = ?";
    const params: (number | string)[] = [company_id];

    if (outlet_id !== null) {
      whereClause += " AND (outlet_id = ? OR outlet_id IS NULL)";
      params.push(outlet_id);
    }

    if (product_id !== undefined) {
      whereClause += " AND product_id = ?";
      params.push(product_id);
    }

    if (transaction_type) {
      whereClause += " AND transaction_type = ?";
      params.push(transaction_type);
    }

    if (since) {
      whereClause += " AND created_at > ?";
      params.push(since);
    }

    // Get total count
    const [countRows] = await conn.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM inventory_transactions ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    // Get transactions
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT
        id as transaction_id,
        company_id,
        outlet_id,
        transaction_type,
        reference_type,
        reference_id,
        product_id,
        quantity_delta,
        created_at
      FROM inventory_transactions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const transactions: StockTransaction[] = rows.map(row => ({
      transaction_id: row.transaction_id,
      company_id: row.company_id,
      outlet_id: row.outlet_id,
      transaction_type: row.transaction_type,
      reference_type: row.reference_type,
      reference_id: row.reference_id,
      product_id: row.product_id,
      quantity_delta: Number(row.quantity_delta),
      created_at: row.created_at
    }));

    return { transactions, total };
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

/**
 * Get low stock alerts for products below their threshold
 */
export async function getLowStockAlerts(
  company_id: number,
  outlet_id: number,
  connection?: PoolConnection
): Promise<LowStockAlert[]> {
  const dbPool = getDbPool();
  const conn = connection ?? await dbPool.getConnection();
  const shouldRelease = !connection;

  try {
    const [rows] = await conn.execute<ProductRow[]>(
      `SELECT
        i.id as product_id,
        i.sku,
        i.name,
        s.quantity,
        s.available_quantity,
        i.low_stock_threshold
      FROM items i
      JOIN inventory_stock s ON s.product_id = i.id
      WHERE i.company_id = ?
        AND i.track_stock = 1
        AND i.low_stock_threshold IS NOT NULL
        AND (s.outlet_id = ? OR s.outlet_id IS NULL)
        AND s.available_quantity <= i.low_stock_threshold`,
      [company_id, outlet_id]
    );

    return rows.map(row => ({
      product_id: row.product_id,
      sku: row.sku,
      name: row.name,
      quantity: Number(row.quantity),
      available_quantity: Number(row.available_quantity),
      low_stock_threshold: Number(row.low_stock_threshold)
    }));
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

/**
 * Get a single product's stock level
 */
export async function getProductStock(
  company_id: number,
  outlet_id: number,
  product_id: number,
  connection?: PoolConnection
): Promise<StockLevel | null> {
  const levels = await getStockLevels(company_id, outlet_id, [product_id], connection);
  return levels[0] ?? null;
}
