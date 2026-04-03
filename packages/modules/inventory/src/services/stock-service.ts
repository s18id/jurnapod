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
import type { KyselySchema } from "@jurnapod/db";
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
  StockAdjustmentInput
} from "../interfaces/stock-service.js";
import {
  InventoryConflictError,
  InventoryReferenceError,
  InventoryForbiddenError
} from "../errors.js";

// Re-export error classes for API compatibility
export { InventoryConflictError, InventoryReferenceError, InventoryForbiddenError };

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

// Transaction helper
async function withExecutorTransaction<T>(
  db: KyselySchema,
  callback: (executor: KyselySchema) => Promise<T>
): Promise<T> {
  if (db.isTransaction) {
    return callback(db);
  }
  return db.transaction().execute(async (trx) => callback(trx as unknown as KyselySchema));
}

// Cost summary row type for resolveInboundUnitCost
interface CostSummaryRow {
  current_avg_cost: string | null;
}

// Price row type for resolveInboundUnitCost
interface PriceRow {
  price: string | null;
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

  throw new Error(
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
          AND (outlet_id = ${outletId} OR outlet_id IS NULL)
        ORDER BY outlet_id IS NULL ASC
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
        const stockRows = await sql<StockRow>`
          SELECT quantity, available_quantity
          FROM inventory_stock
          WHERE company_id = ${companyId}
            AND product_id = ${item.product_id}
            AND (outlet_id = ${outletId} OR outlet_id IS NULL)
          ORDER BY outlet_id IS NULL ASC
          LIMIT 1
          FOR UPDATE
        `.execute(trx);

        if (stockRows.rows.length === 0) {
          return false;
        }

        const stock = stockRows.rows[0];
        if (Number(stock.quantity) < item.quantity) {
          return false;
        }

        const updateResult = await sql`
          UPDATE inventory_stock
          SET quantity = quantity - ${item.quantity},
              available_quantity = available_quantity - ${item.quantity},
              updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ${companyId}
            AND product_id = ${item.product_id}
            AND (outlet_id = ${outletId} OR outlet_id IS NULL)
            AND quantity >= ${item.quantity}
        `.execute(trx);

        if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
          return false;
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
            AND (outlet_id = ${outletId} OR outlet_id IS NULL)
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
            AND (outlet_id = ${outletId} OR outlet_id IS NULL)
          ORDER BY outlet_id IS NULL ASC
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
            AND (outlet_id = ${outletId} OR outlet_id IS NULL)
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
      WHERE company_id = ${companyId} AND (outlet_id = ${outletId} OR outlet_id IS NULL)
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
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)
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
      conditions.push(sql`(outlet_id = ${outletId} OR outlet_id IS NULL)`);
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
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
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
        AND (s.outlet_id = ${outletId} OR s.outlet_id IS NULL)
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
        const stockRows = await sql<StockRow>`
          SELECT quantity, available_quantity
          FROM inventory_stock
          WHERE company_id = ${company_id}
            AND product_id = ${item.product_id}
            AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
          ORDER BY outlet_id IS NULL ASC
          LIMIT 1
          FOR UPDATE
        `.execute(trx);

        if (stockRows.rows.length === 0) {
          throw new Error(`Stock not found for product ${item.product_id} in company ${company_id}`);
        }

        const stock = stockRows.rows[0];
        if (Number(stock.quantity) < item.quantity) {
          throw new Error(
            `Insufficient stock for product ${item.product_id}: ` +
            `requested ${item.quantity}, available ${stock.quantity}`
          );
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

      // Phase 2: Update stock quantities
      for (const item of items) {
        const updateResult = await sql`
          UPDATE inventory_stock
          SET quantity = quantity - ${item.quantity},
              available_quantity = available_quantity - ${item.quantity},
              updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ${company_id}
            AND product_id = ${item.product_id}
            AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
            AND quantity >= ${item.quantity}
        `.execute(trx);

        if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
          throw new Error(`Stock deduction failed for product ${item.product_id}: concurrent modification detected`);
        }
      }

      // Phase 3: Delegate cost calculation to costing package using stockTxId pattern
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

      // Phase 4: Build results matching existing StockDeductResult interface
      // Map stockTxIds back to their corresponding items using the order
      const results: StockDeductResult[] = [];
      for (let i = 0; i < stockTxItems.length; i++) {
        const stockTxItem = stockTxItems[i];
        const costItem = deductionResult.itemCosts.find(c => c.stockTxId === stockTxItem.stockTxId);

        if (!costItem) {
          throw new Error(`Cost calculation missing for item ${stockTxItem.itemId}`);
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
        // Update inventory_stock: add to quantity and available_quantity
        const updateResult = await sql`
          UPDATE inventory_stock
          SET quantity = quantity + ${item.quantity},
              available_quantity = available_quantity + ${item.quantity},
              updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ${company_id}
            AND product_id = ${item.product_id}
            AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
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

    return withExecutorTransaction(db, async (executor) => {
      // Lock the inventory_stock row with FOR UPDATE
      const stockRows = await sql<StockRow>`
        SELECT quantity, reserved_quantity, available_quantity
        FROM inventory_stock
        WHERE company_id = ${company_id}
          AND product_id = ${product_id}
          AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
        ORDER BY outlet_id IS NULL ASC
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
        return false; // Stock cannot go negative
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
            AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
        `.execute(executor);

        if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
          return false;
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
