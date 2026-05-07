// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Service Implementation
 * 
 * Core stock operations with database transaction support.
 * All methods enforce company_id and outlet_id scoping.
 * 
 * Note: Cost-dependent operations (deductStockWithCost, restoreStock, adjustStock,
 * deductStockForSaleWithCogs) are implemented in the API layer since they depend
 * on cost-tracking which is API-internal.
 */

import { sql } from "kysely";
import { withTransactionRetry, type KyselySchema } from "@jurnapod/db";
import { toUtcIso } from "@jurnapod/shared";
import { getInventoryDb } from "../db.js";
import { createCostLayer, deductWithCost } from "@jurnapod/modules-inventory-costing";
import type { DeductionResult, ItemCostResult } from "@jurnapod/modules-inventory-costing";
import type {
  StockService,
  StockItem,
  StockCheckResult,
  StockReservationResult,
  StockTransaction,
  StockLevel,
  LowStockAlert,
  StockDeductResult,
  DeductStockInput,
  RestoreStockInput,
  StockAdjustmentInput,
  PosStockDeductResult,
  ResolveAndDeductInput
} from "../interfaces/stock-service.js";
import {
  InventoryConflictError,
  InventoryReferenceError,
  InventoryForbiddenError,
  InsufficientStockError
} from "../errors.js";

// Re-export error classes for API compatibility
export { InventoryConflictError, InventoryReferenceError, InventoryForbiddenError, InsufficientStockError };

// Transaction type constants
const TRANSACTION_TYPE = {
  SALE: 1,
  REFUND: 2,
  RESERVATION: 3,
  RELEASE: 4,
  ADJUSTMENT: 5,
  RECEIPT: 6,
  TRANSFER: 7
} as const;

// Row type definitions
interface StockRow {
  product_id: number;
  outlet_id: number | null;
  quantity: string;
  reserved_quantity: string;
  available_quantity: string;
  updated_at: Date;
}

interface InventoryTransactionRow {
  transaction_id: number;
  company_id: number;
  outlet_id: number | null;
  transaction_type: number;
  reference_type: string | null;
  reference_id: string | null;
  product_id: number | null;
  quantity_delta: string;
  created_at: Date;
}

interface LowStockAlertRow {
  product_id: number;
  sku: string;
  name: string;
  quantity: string;
  available_quantity: string;
  low_stock_threshold: string | null;
}

// Transaction helper with deadlock retry
async function withExecutorTransaction<T>(
  db: KyselySchema,
  callback: (executor: KyselySchema) => Promise<T>
): Promise<T> {
  if (db.isTransaction) {
    return callback(db);
  }
  return withTransactionRetry(db, async (trx) => callback(trx as unknown as KyselySchema));
}

// Cost summary row type for resolveInboundUnitCost
interface CostSummaryRow {
  current_avg_cost: string | null;
}

// Price row type for resolveInboundUnitCost
interface PriceRow {
  price: string | null;
}

async function ensureStockTrackedItem(
  executor: KyselySchema,
  companyId: number,
  itemId: number,
  operation: string
): Promise<void> {
  const itemRows = await sql<{ item_type: string; track_stock: number | string | null }>`
    SELECT item_type, track_stock
    FROM items
    WHERE company_id = ${companyId}
      AND id = ${itemId}
    LIMIT 1
  `.execute(executor);

  const item = itemRows.rows[0];
  if (!item) {
    throw new InventoryReferenceError(`Item ${itemId} not found for company ${companyId}`);
  }

  const trackStock = Number(item.track_stock ?? 0);
  const itemType = String(item.item_type ?? "").toUpperCase();
  if (trackStock !== 1 || itemType === "SERVICE" || itemType === "RECIPE") {
    throw new InventoryForbiddenError(
      `${operation} not allowed for non-stock-tracked item ${itemId} (type: ${itemType || "UNKNOWN"})`
    );
  }
}

// Resolves unit cost for inbound stock movements
async function resolveInboundUnitCost(
  executor: KyselySchema,
  companyId: number,
  itemId: number
): Promise<number> {
  const costRows = await sql<CostSummaryRow>`
    SELECT current_avg_cost
    FROM inventory_item_costs
    WHERE company_id = ${companyId} AND item_id = ${itemId}
  `.execute(executor);

  const avgCost = costRows.rows[0]?.current_avg_cost;
  if (avgCost !== null && avgCost !== undefined && Number(avgCost) > 0) {
    return Number(avgCost);
  }

  const priceRows = await sql<PriceRow>`
    SELECT price
    FROM item_prices
    WHERE company_id = ${companyId} AND item_id = ${itemId}
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `.execute(executor);

  const price = priceRows.rows[0]?.price;
  if (price !== null && price !== undefined && Number(price) > 0) {
    return Number(price);
  }

  throw new InventoryReferenceError(
    `Unable to determine unit cost for item ${itemId}. No cost history or pricing data available.`
  );
}

// Stock Service Implementation
export class StockServiceImpl implements StockService {
  constructor(private readonly db: KyselySchema) {}

  /**
   * Check stock availability for multiple items
   * Uses atomic SELECT to verify availability without locking
   */
  async checkAvailability(
    companyId: number,
    outletId: number,
    items: StockItem[]
  ): Promise<StockCheckResult[]> {
    const results: StockCheckResult[] = [];

    for (const item of items) {
      const rows = await sql<StockRow>`
        SELECT product_id, available_quantity
          FROM inventory_stock
          WHERE company_id = ${companyId}
            AND product_id = ${item.product_id}
            AND outlet_id = ${outletId}
          LIMIT 1
      `.execute(this.db);

      const stock = rows.rows[0];
      const availableQty = stock ? Number(stock.available_quantity) : 0;

      results.push({
        product_id: item.product_id,
        available: availableQty >= item.quantity,
        requested_quantity: item.quantity,
        available_quantity: availableQty
      });
    }

    return results;
  }

  /**
   * Check if all items have sufficient stock
   * Returns true only if ALL items are available
   */
  async hasSufficientStock(
    companyId: number,
    outletId: number,
    items: StockItem[]
  ): Promise<boolean> {
    const results = await this.checkAvailability(companyId, outletId, items);
    return results.every(r => r.available);
  }

  /**
   * Get stock conflicts for items that cannot be fulfilled
   */
  async getStockConflicts(
    companyId: number,
    outletId: number,
    items: StockItem[]
  ): Promise<Array<{ product_id: number; requested: number; available: number }>> {
    const results = await this.checkAvailability(companyId, outletId, items);
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
  async deductStock(
    companyId: number,
    outletId: number,
    items: StockItem[],
    referenceId: string,
    userId: number
  ): Promise<boolean> {
    return withExecutorTransaction(this.db, async (trx) => {
      for (const item of items) {
        await ensureStockTrackedItem(trx, companyId, item.product_id, "Stock deduction");

        const stockRows = await sql<StockRow>`
          SELECT quantity, available_quantity
          FROM inventory_stock
          WHERE company_id = ${companyId}
            AND product_id = ${item.product_id}
            AND outlet_id = ${outletId}
          LIMIT 1
          FOR UPDATE
        `.execute(trx);

        if (stockRows.rows.length === 0) {
          throw new InventoryReferenceError(
            `Stock not found for product ${item.product_id} at outlet ${outletId}`
          );
        }

        const stock = stockRows.rows[0];
        const available = Number(stock.available_quantity);
        if (available < item.quantity) {
          const shortfall = item.quantity - available;
          throw new InsufficientStockError(
            `Insufficient stock for product ${item.product_id}: requested ${item.quantity}, available ${available}, shortfall ${shortfall}`
          );
        }

        const updateResult = await sql`
          UPDATE inventory_stock
          SET quantity = quantity - ${item.quantity},
              available_quantity = available_quantity - ${item.quantity},
              updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ${companyId}
            AND product_id = ${item.product_id}
            AND outlet_id = ${outletId}
            AND available_quantity >= ${item.quantity}
        `.execute(trx);

        if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
          throw new InventoryConflictError(
            `Stock deduction failed for product ${item.product_id}: concurrent modification detected`
          );
        }

        await sql`
          INSERT INTO inventory_transactions (
            company_id,
            outlet_id,
            transaction_type,
            reference_type,
            reference_id,
            product_id,
            quantity_delta,
            created_at
          ) VALUES (${companyId}, ${outletId}, ${TRANSACTION_TYPE.SALE}, 'SALE', ${referenceId}, ${item.product_id}, ${-item.quantity}, CURRENT_TIMESTAMP)
        `.execute(trx);
      }

      return true;
    });
  }

  /**
   * Reserve stock for pending transactions
   * Reduces available_quantity but keeps quantity unchanged
   */
  async reserveStock(
    companyId: number,
    outletId: number,
    items: StockItem[],
    referenceId: string
  ): Promise<StockReservationResult> {
    const conflicts: Array<{ product_id: number; requested: number; available: number }> = [];

    const availability = await this.checkAvailability(companyId, outletId, items);

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

    return withExecutorTransaction(this.db, async (trx) => {
      for (const item of items) {
        const updateResult = await sql`
          UPDATE inventory_stock
          SET reserved_quantity = reserved_quantity + ${item.quantity},
              available_quantity = available_quantity - ${item.quantity},
              updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ${companyId}
            AND product_id = ${item.product_id}
            AND outlet_id = ${outletId}
            AND available_quantity >= ${item.quantity}
        `.execute(trx);

        if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
          return {
            success: false,
            conflicts: [{ product_id: item.product_id, requested: item.quantity, available: 0 }]
          };
        }

        await sql`
          INSERT INTO inventory_transactions (
            company_id,
            outlet_id,
            transaction_type,
            reference_type,
            reference_id,
            product_id,
            quantity_delta,
            created_at
          ) VALUES (${companyId}, ${outletId}, ${TRANSACTION_TYPE.RESERVATION}, 'RESERVATION', ${referenceId}, ${item.product_id}, ${item.quantity}, CURRENT_TIMESTAMP)
        `.execute(trx);
      }

      return { success: true, reserved: true };
    });
  }

  /**
   * Release reserved stock
   * Increases available_quantity but keeps quantity unchanged
   */
  async releaseStock(
    companyId: number,
    outletId: number,
    items: StockItem[],
    referenceId: string
  ): Promise<boolean> {
    return withExecutorTransaction(this.db, async (trx) => {
      for (const item of items) {
        const stockRows = await sql<StockRow>`
          SELECT reserved_quantity
          FROM inventory_stock
          WHERE company_id = ${companyId}
            AND product_id = ${item.product_id}
            AND outlet_id = ${outletId}
          LIMIT 1
          FOR UPDATE
        `.execute(trx);

        if (stockRows.rows.length === 0) {
          continue;
        }

        const currentReserved = Number(stockRows.rows[0].reserved_quantity);
        const releaseQty = Math.min(item.quantity, currentReserved);

        if (releaseQty <= 0) {
          continue;
        }

        const updateResult = await sql`
          UPDATE inventory_stock
          SET reserved_quantity = reserved_quantity - ${releaseQty},
              available_quantity = available_quantity + ${releaseQty},
              updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ${companyId}
            AND product_id = ${item.product_id}
            AND outlet_id = ${outletId}
            AND reserved_quantity >= ${releaseQty}
        `.execute(trx);

        if (updateResult.numAffectedRows && updateResult.numAffectedRows > BigInt(0)) {
          await sql`
            INSERT INTO inventory_transactions (
              company_id,
              outlet_id,
              transaction_type,
              reference_type,
              reference_id,
              product_id,
              quantity_delta,
              created_at
            ) VALUES (${companyId}, ${outletId}, ${TRANSACTION_TYPE.RELEASE}, 'RELEASE', ${referenceId}, ${item.product_id}, ${releaseQty}, CURRENT_TIMESTAMP)
          `.execute(trx);
        }
      }

      return true;
    });
  }

  /**
   * Get current stock levels for a company/outlet
   */
  async getStockLevels(
    companyId: number,
    outletId: number,
    productIds?: number[]
  ): Promise<StockLevel[]> {
    let query = sql`
      SELECT product_id, outlet_id, quantity, reserved_quantity, available_quantity, updated_at
      FROM inventory_stock
      WHERE company_id = ${companyId} AND outlet_id = ${outletId}
    `;

    if (productIds && productIds.length > 0) {
      query = sql`${query} AND product_id IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`;
    }

    query = sql`${query} ORDER BY product_id`;

    const result = await sql<StockRow>`${query}`.execute(this.db);

    return result.rows.map((row) => ({
      product_id: row.product_id,
      outlet_id: row.outlet_id,
      quantity: Number(row.quantity),
      reserved_quantity: Number(row.reserved_quantity),
      available_quantity: Number(row.available_quantity),
      updated_at: toUtcIso.dateLike(row.updated_at) as string
    }));
  }

  /**
   * Get stock transaction history
   */
  async getStockTransactions(
    companyId: number,
    outletId: number | null,
    options: {
      product_id?: number;
      transaction_type?: number;
      since?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ transactions: StockTransaction[]; total: number }> {
    const { product_id, transaction_type, since, limit = 100, offset = 0 } = options;

    const conditions: ReturnType<typeof sql>[] = [];
    conditions.push(sql`company_id = ${companyId}`);

    if (outletId !== null) {
      conditions.push(sql`outlet_id = ${outletId}`);
    }
    if (product_id !== undefined) {
      conditions.push(sql`product_id = ${product_id}`);
    }
    if (transaction_type) {
      conditions.push(sql`transaction_type = ${transaction_type}`);
    }
    if (since) {
      conditions.push(sql`created_at > ${since}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const countResult = await sql<{ total: string }>`
      SELECT COUNT(*) as total FROM inventory_transactions WHERE ${whereClause}
    `.execute(this.db);
    const total = Number(countResult.rows[0]?.total ?? 0);

    const rows = await sql<InventoryTransactionRow>`
      SELECT
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
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `.execute(this.db);

    const transactions: StockTransaction[] = rows.rows.map((row) => ({
      transaction_id: row.transaction_id,
      company_id: row.company_id,
      outlet_id: row.outlet_id,
      transaction_type: row.transaction_type,
      reference_type: row.reference_type,
      reference_id: row.reference_id,
      product_id: row.product_id ?? 0,
      quantity_delta: Number(row.quantity_delta),
      created_at: toUtcIso.dateLike(row.created_at) as string
    }));

    return { transactions, total };
  }

  /**
   * Get low stock alerts for products below their threshold
   */
  async getLowStockAlerts(companyId: number, outletId: number): Promise<LowStockAlert[]> {
    const rows = await sql<LowStockAlertRow>`
      SELECT
        i.id as product_id,
        i.sku,
        i.name,
        s.quantity,
        s.available_quantity,
        i.low_stock_threshold
      FROM items i
      JOIN inventory_stock s ON s.product_id = i.id
      WHERE i.company_id = ${companyId}
        AND i.track_stock = 1
        AND i.low_stock_threshold IS NOT NULL
        AND s.outlet_id = ${outletId}
        AND s.available_quantity <= i.low_stock_threshold
    `.execute(this.db);

    return rows.rows.map((row) => ({
      product_id: row.product_id,
      sku: row.sku,
      name: row.name,
      quantity: Number(row.quantity),
      available_quantity: Number(row.available_quantity),
      low_stock_threshold: Number(row.low_stock_threshold)
    }));
  }

  /**
   * Get a single product's stock level
   */
  async getProductStock(
    companyId: number,
    outletId: number,
    productId: number
  ): Promise<StockLevel | null> {
    const levels = await this.getStockLevels(companyId, outletId, [productId]);
    return levels[0] ?? null;
  }

  // ---------------------------------------------------------------------------
  // Cost-dependent operations (stubs - implementation in 26.2/26.3)
  // ---------------------------------------------------------------------------

  /**
   * Deduct stock with cost layer consumption.
   * Consumes cost layers via deductWithCost and records COGS.
   * Atomically locks stock rows, creates inventory_transactions, updates stock,
   * then delegates cost calculation to the costing package.
   */
  async deductStockWithCost(
    input: DeductStockInput,
    db: KyselySchema
  ): Promise<StockDeductResult[]> {
    const { company_id, outlet_id, items, reference_id, user_id } = input;

    return withExecutorTransaction(db, async (trx) => {
      // Phase 1: Validate stock and create inventory transactions (pre-created stockTxIds)
      const stockTxItems: Array<{ itemId: number; qty: number; stockTxId: number; quantity: number }> = [];

      for (const item of items) {
        await ensureStockTrackedItem(trx, company_id, item.product_id, "Stock deduction");

        const stockRows = await sql<StockRow>`
          SELECT quantity, available_quantity
          FROM inventory_stock
          WHERE company_id = ${company_id}
            AND product_id = ${item.product_id}
            AND outlet_id = ${outlet_id}
          LIMIT 1
          FOR UPDATE
        `.execute(trx);

        if (stockRows.rows.length === 0) {
          throw new InventoryReferenceError(`Stock not found for product ${item.product_id} in company ${company_id}`);
        }

        const stock = stockRows.rows[0];
        const available = Number(stock.available_quantity);
        if (available < item.quantity) {
          const shortfall = item.quantity - available;
          throw new InsufficientStockError(
            `Insufficient stock for product ${item.product_id}: requested ${item.quantity}, available ${available}, shortfall ${shortfall}`
          );
        }

        const updateResult = await sql`
          UPDATE inventory_stock
          SET quantity = quantity - ${item.quantity},
              available_quantity = available_quantity - ${item.quantity},
              updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ${company_id}
            AND product_id = ${item.product_id}
            AND outlet_id = ${outlet_id}
            AND available_quantity >= ${item.quantity}
        `.execute(trx);

        if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
          throw new InventoryConflictError(`Stock deduction failed for product ${item.product_id}: concurrent modification detected`);
        }

        const txResult = await sql`
          INSERT INTO inventory_transactions (
            company_id,
            outlet_id,
            transaction_type,
            reference_type,
            reference_id,
            product_id,
            quantity_delta,
            created_at
          ) VALUES (${company_id}, ${outlet_id}, ${TRANSACTION_TYPE.SALE}, 'SALE', ${reference_id}, ${item.product_id}, ${-item.quantity}, CURRENT_TIMESTAMP)
        `.execute(trx);
        const transactionId = Number(txResult.insertId);

        stockTxItems.push({
          itemId: item.product_id,
          qty: item.quantity,
          stockTxId: transactionId,
          quantity: item.quantity
        });
      }

      // Phase 2: Delegate cost calculation to costing package using stockTxId pattern
      const deductionInput = stockTxItems.map(i => ({
        itemId: i.itemId,
        qty: i.qty,
        stockTxId: i.stockTxId
      }));

      const deductionResult: DeductionResult = await deductWithCost(
        company_id,
        deductionInput,
        trx
      );

      // Phase 3: Build results matching existing StockDeductResult interface
      // Map stockTxIds back to their corresponding items using the order
      const results: StockDeductResult[] = [];
      for (let i = 0; i < stockTxItems.length; i++) {
        const stockTxItem = stockTxItems[i];
        const costItem = deductionResult.itemCosts.find(c => c.stockTxId === stockTxItem.stockTxId);

        if (!costItem) {
          throw new InventoryReferenceError(`Cost calculation missing for item ${stockTxItem.itemId}`);
        }

        results.push({
          itemId: stockTxItem.itemId,
          quantity: stockTxItem.quantity,
          transactionId: stockTxItem.stockTxId,
          unitCost: costItem.unitCost,
          totalCost: costItem.totalCost,
          costResult: costItem,
        });
      }

      return results;
    });
  }

  async restoreStock(
    input: RestoreStockInput,
    db: KyselySchema
  ): Promise<boolean> {
    const { company_id, outlet_id, items, reference_id } = input;

    return withExecutorTransaction(db, async (executor) => {
      for (const item of items) {
        await ensureStockTrackedItem(executor, company_id, item.product_id, "Stock restore");

        // Update inventory_stock: add to quantity and available_quantity
        const updateResult = await sql`
          UPDATE inventory_stock
          SET quantity = quantity + ${item.quantity},
              available_quantity = available_quantity + ${item.quantity},
              updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ${company_id}
            AND product_id = ${item.product_id}
            AND outlet_id = ${outlet_id}
        `.execute(executor);

        if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
          // Insert new inventory_stock row if it doesn't exist
          await sql`
            INSERT INTO inventory_stock (
              company_id,
              outlet_id,
              product_id,
              quantity,
              reserved_quantity,
              available_quantity,
              created_at,
              updated_at
            ) VALUES (${company_id}, ${outlet_id}, ${item.product_id}, ${item.quantity}, 0, ${item.quantity}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `.execute(executor);
        }

        // Insert inventory_transactions record
        const txResult = await sql`
          INSERT INTO inventory_transactions (
            company_id,
            outlet_id,
            transaction_type,
            reference_type,
            reference_id,
            product_id,
            quantity_delta,
            created_at
          ) VALUES (${company_id}, ${outlet_id}, ${TRANSACTION_TYPE.REFUND}, 'REFUND', ${reference_id}, ${item.product_id}, ${item.quantity}, CURRENT_TIMESTAMP)
        `.execute(executor);

        // Resolve unit cost and create cost layer
        const unitCost = await resolveInboundUnitCost(executor, company_id, item.product_id);
        await createCostLayer(
          {
            companyId: company_id,
            itemId: item.product_id,
            transactionId: Number(txResult.insertId),
            unitCost,
            quantity: item.quantity,
          },
          executor
        );
      }

      return true;
    });
  }

  async adjustStock(
    input: StockAdjustmentInput,
    db: KyselySchema
  ): Promise<boolean> {
    const { company_id, outlet_id, product_id, adjustment_quantity, reference_id } = input;

    if (adjustment_quantity === 0) {
      return true;
    }

    return withExecutorTransaction(db, async (executor) => {
      await ensureStockTrackedItem(executor, company_id, product_id, "Stock adjustment");

      // Lock the inventory_stock row with FOR UPDATE
      const stockRows = await sql<StockRow>`
        SELECT quantity, reserved_quantity, available_quantity
        FROM inventory_stock
          WHERE company_id = ${company_id}
            AND product_id = ${product_id}
            AND outlet_id = ${outlet_id}
        LIMIT 1
        FOR UPDATE
      `.execute(executor);

      let currentQty = 0;
      let currentReserved = 0;

      if (stockRows.rows.length > 0) {
        currentQty = Number(stockRows.rows[0].quantity);
        currentReserved = Number(stockRows.rows[0].reserved_quantity);
      }

      const newQty = currentQty + adjustment_quantity;
      const newAvailable = newQty - currentReserved;

      if (newQty < 0) {
        const shortfall = Math.abs(newQty);
        throw new InsufficientStockError(
          `Insufficient stock for product ${product_id}: requested ${Math.abs(adjustment_quantity)}, available ${currentQty}, shortfall ${shortfall}`
        );
      }

      if (newAvailable < 0) {
        throw new InventoryConflictError(
          `Cannot adjust stock for product ${product_id}: reserved quantity (${currentReserved}) would exceed available stock`
        );
      }

      if (stockRows.rows.length > 0) {
        // Update existing stock row
        const updateResult = await sql`
          UPDATE inventory_stock
          SET quantity = ${newQty},
              available_quantity = ${newAvailable},
              updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ${company_id}
            AND product_id = ${product_id}
            AND outlet_id = ${outlet_id}
        `.execute(executor);

        if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
          throw new InventoryConflictError(
            `Stock adjustment failed for product ${product_id}: concurrent modification detected`
          );
        }
      } else {
        // Insert new stock row if it doesn't exist
        await sql`
          INSERT INTO inventory_stock (
            company_id,
            outlet_id,
            product_id,
            quantity,
            reserved_quantity,
            available_quantity,
            created_at,
            updated_at
          ) VALUES (${company_id}, ${outlet_id}, ${product_id}, ${newQty}, 0, ${newAvailable}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `.execute(executor);
      }

      // Insert inventory_transactions record
      const txResult = await sql`
        INSERT INTO inventory_transactions (
          company_id,
          outlet_id,
          transaction_type,
          reference_type,
          reference_id,
          product_id,
          quantity_delta,
          created_at
        ) VALUES (${company_id}, ${outlet_id}, ${TRANSACTION_TYPE.ADJUSTMENT}, 'ADJUSTMENT', ${reference_id ?? `ADJ-${Date.now()}`}, ${product_id}, ${adjustment_quantity}, CURRENT_TIMESTAMP)
      `.execute(executor);

      // For positive adjustments, create inbound cost layer
      if (adjustment_quantity > 0) {
        const unitCost = await resolveInboundUnitCost(executor, company_id, product_id);
        await createCostLayer(
          {
            companyId: company_id,
            itemId: product_id,
            transactionId: Number(txResult.insertId),
            unitCost,
            quantity: adjustment_quantity,
          },
          executor
        );
      }

      return true;
    });
  }

  /**
   * Resolve and deduct stock for a POS transaction.
   * Handles both variant-based and regular item stock deduction.
   */
  async resolveAndDeductForPosTransaction(
    input: ResolveAndDeductInput,
    db: KyselySchema
  ): Promise<PosStockDeductResult[]> {
    const { companyId, outletId, items, referenceId, userId } = input;

    // Separate variant items from regular items
    const variantItems = items.filter(item => item.variantId !== undefined);
    const regularItems = items.filter(item => item.variantId === undefined);

    const results: PosStockDeductResult[] = [];

    return withExecutorTransaction(db, async (trx) => {
      // Process variant items
      for (const item of variantItems) {
        const variantId = item.variantId!;

        // Resolve item_id from variant
        const variantRows = await sql<{ item_id: number }>`
          SELECT item_id FROM item_variants 
          WHERE id = ${variantId} AND company_id = ${companyId} AND is_active = TRUE
          LIMIT 1
        `.execute(trx);

        if (variantRows.rows.length === 0) {
          throw new InventoryReferenceError(`Variant ${variantId} not found or inactive`);
        }

        const resolvedItemId = variantRows.rows[0].item_id;

        // Check variant stock via inventory_stock first
        const stockRows = await sql<StockRow>`
          SELECT quantity, available_quantity 
          FROM inventory_stock 
          WHERE company_id = ${companyId} AND variant_id = ${variantId} AND outlet_id = ${outletId}
          LIMIT 1
          FOR UPDATE
        `.execute(trx);

        if (stockRows.rows.length > 0) {
          // Use inventory_stock variant tracking
          const currentAvailable = Number(stockRows.rows[0].available_quantity);
          if (currentAvailable < item.quantity) {
            throw new InventoryConflictError(`Insufficient stock for variant ${variantId}: ${currentAvailable} < ${item.quantity}`);
          }

          // Update inventory_stock for variant
          const updateResult = await sql`
            UPDATE inventory_stock 
            SET quantity = quantity - ${item.quantity}, 
                available_quantity = available_quantity - ${item.quantity}, 
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = ${companyId}
              AND variant_id = ${variantId}
              AND outlet_id = ${outletId}
              AND available_quantity >= ${item.quantity}
          `.execute(trx);

          if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
            throw new InventoryConflictError(
              `Stock deduction failed for variant ${variantId}: concurrent modification detected`
            );
          }

          // Also update item_variants.stock_quantity as source of truth
          await sql`
            UPDATE item_variants SET stock_quantity = stock_quantity - ${item.quantity} 
            WHERE id = ${variantId} AND company_id = ${companyId}
          `.execute(trx);

          // Insert inventory_transactions for variant
          const txResult = await sql`
            INSERT INTO inventory_transactions (
              company_id, outlet_id, transaction_type, reference_type, reference_id,
              product_id, variant_id, quantity_delta, created_at
            ) VALUES (${companyId}, ${outletId}, ${TRANSACTION_TYPE.SALE}, 'SALE', ${referenceId}, ${resolvedItemId}, ${variantId}, ${-item.quantity}, CURRENT_TIMESTAMP)
          `.execute(trx);

          // For variant items, use zero cost since they don't go through cost layers
          results.push({
            variantId,
            itemId: resolvedItemId,
            quantity: item.quantity,
            stockTxId: Number(txResult.insertId),
            unitCost: 0,
            totalCost: 0
          });
        } else {
          // Fallback: use item_variants.stock_quantity directly
          const variantStockRows = await sql<{ stock_quantity: string }>`
            SELECT stock_quantity FROM item_variants
            WHERE id = ${variantId} AND company_id = ${companyId} AND is_active = TRUE
            FOR UPDATE
          `.execute(trx);

          if (variantStockRows.rows.length === 0) {
            throw new InventoryReferenceError(`Variant ${variantId} not found or inactive`);
          }

          const currentStock = Number(variantStockRows.rows[0].stock_quantity);
          if (currentStock < item.quantity) {
            throw new InventoryConflictError(`Insufficient stock for variant ${variantId}: ${currentStock} < ${item.quantity}`);
          }

          await sql`
            UPDATE item_variants
            SET stock_quantity = stock_quantity - ${item.quantity}
            WHERE id = ${variantId} AND company_id = ${companyId}
          `.execute(trx);

          // Insert inventory_transactions
          const txResult = await sql`
            INSERT INTO inventory_transactions (
              company_id, outlet_id, transaction_type, reference_type, reference_id,
              product_id, variant_id, quantity_delta, created_at
            ) VALUES (${companyId}, ${outletId}, ${TRANSACTION_TYPE.SALE}, 'SALE', ${referenceId}, ${resolvedItemId}, ${variantId}, ${-item.quantity}, CURRENT_TIMESTAMP)
          `.execute(trx);

          results.push({
            variantId,
            itemId: resolvedItemId,
            quantity: item.quantity,
            stockTxId: Number(txResult.insertId),
            unitCost: 0,
            totalCost: 0
          });
        }
      }

      // Process regular items - filter for track_stock items only
      if (regularItems.length > 0) {
        const trackStockItemIds = regularItems.filter(item => item.trackStock).map(item => item.itemId);

        if (trackStockItemIds.length > 0) {
          // Get items that have track_stock = 1
          const trackedRows = await sql<{ id: number }>`
            SELECT id FROM items
            WHERE company_id = ${companyId}
              AND id IN (${sql.join(trackStockItemIds.map(id => sql`${id}`), sql`, `)})
              AND track_stock = 1
          `.execute(trx);

          const trackedItemIds = new Set(trackedRows.rows.map(row => row.id));

          // Build stock items for tracked items only
          const stockItems: StockItem[] = regularItems
            .filter(item => item.trackStock && trackedItemIds.has(item.itemId))
            .map(item => ({
              product_id: item.itemId,
              quantity: item.quantity
            }));

          if (stockItems.length > 0) {
            // Lock and validate stock rows
            const stockTxItems: Array<{ itemId: number; qty: number; stockTxId: number; quantity: number }> = [];

            for (const item of stockItems) {
              const stockRows = await sql<StockRow>`
                SELECT quantity, available_quantity
                FROM inventory_stock
                WHERE company_id = ${companyId}
                  AND product_id = ${item.product_id}
                  AND outlet_id = ${outletId}
                LIMIT 1
                FOR UPDATE
              `.execute(trx);

              if (stockRows.rows.length === 0) {
                throw new InventoryReferenceError(`Stock not found for product ${item.product_id} in company ${companyId}`);
              }

              const stock = stockRows.rows[0];
              const available = Number(stock.available_quantity);
              if (available < item.quantity) {
                const shortfall = item.quantity - available;
                throw new InsufficientStockError(
                  `Insufficient stock for product ${item.product_id}: requested ${item.quantity}, available ${available}, shortfall ${shortfall}`
                );
              }

              const updateResult = await sql`
                UPDATE inventory_stock
                SET quantity = quantity - ${item.quantity},
                    available_quantity = available_quantity - ${item.quantity},
                    updated_at = CURRENT_TIMESTAMP
                WHERE company_id = ${companyId}
                  AND product_id = ${item.product_id}
                  AND outlet_id = ${outletId}
                  AND available_quantity >= ${item.quantity}
              `.execute(trx);

              if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
                throw new InventoryConflictError(`Stock deduction failed for product ${item.product_id}: concurrent modification detected`);
              }

              // Insert inventory_transactions
              const txResult = await sql`
                INSERT INTO inventory_transactions (
                  company_id, outlet_id, transaction_type, reference_type, reference_id,
                  product_id, quantity_delta, created_at
                ) VALUES (${companyId}, ${outletId}, ${TRANSACTION_TYPE.SALE}, 'SALE', ${referenceId}, ${item.product_id}, ${-item.quantity}, CURRENT_TIMESTAMP)
              `.execute(trx);

              stockTxItems.push({
                itemId: item.product_id,
                qty: item.quantity,
                stockTxId: Number(txResult.insertId),
                quantity: item.quantity
              });
            }

            // Delegate cost calculation to costing package
            const deductionInput = stockTxItems.map(i => ({
              itemId: i.itemId,
              qty: i.qty,
              stockTxId: i.stockTxId
            }));

            const deductionResult: DeductionResult = await deductWithCost(
              companyId,
              deductionInput,
              trx
            );

            // Build results
            for (let i = 0; i < stockTxItems.length; i++) {
              const stockTxItem = stockTxItems[i];
              const costItem = deductionResult.itemCosts.find(c => c.stockTxId === stockTxItem.stockTxId);

              if (!costItem) {
                throw new InventoryReferenceError(`Cost calculation missing for item ${stockTxItem.itemId}`);
              }

              results.push({
                variantId: 0, // 0 indicates no variant
                itemId: stockTxItem.itemId,
                quantity: stockTxItem.quantity,
                stockTxId: stockTxItem.stockTxId,
                unitCost: costItem.unitCost,
                totalCost: costItem.totalCost
              });
            }
          }
        }
      }

      return results;
    });
  }

  async transferStock(
    companyId: number,
    fromOutletId: number,
    toOutletId: number,
    items: StockItem[],
    referenceId: string,
    userId: number
  ): Promise<boolean> {
    void userId;
    if (fromOutletId === toOutletId) {
      return true;
    }

    return withExecutorTransaction(this.db, async (trx) => {
      const existingTransferRows = await sql<{ total: string }>`
        SELECT COUNT(*) AS total
        FROM inventory_transactions
        WHERE company_id = ${companyId}
          AND reference_id = ${referenceId}
          AND transaction_type = ${TRANSACTION_TYPE.TRANSFER}
          AND reference_type = 'TRANSFER_OUT'
      `.execute(trx);

      if (Number(existingTransferRows.rows[0]?.total ?? 0) > 0) {
        return true;
      }

      for (const item of items) {
        await ensureStockTrackedItem(trx, companyId, item.product_id, "Stock transfer");

        const sourceRows = await sql<StockRow>`
          SELECT quantity, reserved_quantity, available_quantity
          FROM inventory_stock
          WHERE company_id = ${companyId}
            AND product_id = ${item.product_id}
            AND outlet_id = ${fromOutletId}
          LIMIT 1
          FOR UPDATE
        `.execute(trx);

        if (sourceRows.rows.length === 0) {
          throw new InventoryReferenceError(`Source stock not found for product ${item.product_id} at outlet ${fromOutletId}`);
        }

        const sourceAvailable = Number(sourceRows.rows[0].available_quantity);
        if (sourceAvailable < item.quantity) {
          const shortfall = item.quantity - sourceAvailable;
          throw new InsufficientStockError(
            `Insufficient stock for product ${item.product_id}: requested ${item.quantity}, available ${sourceAvailable}, shortfall ${shortfall}`
          );
        }

        const sourceUpdate = await sql`
          UPDATE inventory_stock
          SET quantity = quantity - ${item.quantity},
              available_quantity = available_quantity - ${item.quantity},
              updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ${companyId}
            AND product_id = ${item.product_id}
            AND outlet_id = ${fromOutletId}
            AND available_quantity >= ${item.quantity}
        `.execute(trx);

        if (!sourceUpdate.numAffectedRows || sourceUpdate.numAffectedRows === BigInt(0)) {
          throw new InventoryConflictError(`Stock transfer failed while deducting source for product ${item.product_id}`);
        }

        const destinationRows = await sql<StockRow>`
          SELECT quantity, reserved_quantity
          FROM inventory_stock
          WHERE company_id = ${companyId}
            AND product_id = ${item.product_id}
            AND outlet_id = ${toOutletId}
          LIMIT 1
          FOR UPDATE
        `.execute(trx);

        if (destinationRows.rows.length > 0) {
          await sql`
            UPDATE inventory_stock
            SET quantity = quantity + ${item.quantity},
                available_quantity = available_quantity + ${item.quantity},
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = ${companyId}
              AND product_id = ${item.product_id}
              AND outlet_id = ${toOutletId}
          `.execute(trx);
        } else {
          await sql`
            INSERT INTO inventory_stock (
              company_id,
              outlet_id,
              product_id,
              quantity,
              reserved_quantity,
              available_quantity,
              created_at,
              updated_at
            ) VALUES (
              ${companyId},
              ${toOutletId},
              ${item.product_id},
              ${item.quantity},
              0,
              ${item.quantity},
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
          `.execute(trx);
        }

        await sql`
          INSERT INTO inventory_transactions (
            company_id,
            outlet_id,
            transaction_type,
            reference_type,
            reference_id,
            product_id,
            quantity_delta,
            created_at
          ) VALUES
          (${companyId}, ${fromOutletId}, ${TRANSACTION_TYPE.TRANSFER}, 'TRANSFER_OUT', ${referenceId}, ${item.product_id}, ${-item.quantity}, CURRENT_TIMESTAMP),
          (${companyId}, ${toOutletId}, ${TRANSACTION_TYPE.TRANSFER}, 'TRANSFER_IN', ${referenceId}, ${item.product_id}, ${item.quantity}, CURRENT_TIMESTAMP)
        `.execute(trx);
      }

      return true;
    });
  }
}

// Default singleton instance
let stockServiceInstance: StockServiceImpl | null = null;
let stockServiceDb: KyselySchema | undefined = undefined;

export function getStockService(db?: KyselySchema): StockServiceImpl {
  const database = db ?? getInventoryDb();
  if (!stockServiceInstance || stockServiceDb !== database) {
    stockServiceInstance = new StockServiceImpl(database);
    stockServiceDb = database;
  }
  return stockServiceInstance;
}
