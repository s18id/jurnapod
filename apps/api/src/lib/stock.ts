// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Service
 *
 * Core stock operations with database transaction support.
 * All methods enforce company_id and outlet_id scoping.
 */

import { getDb, type KyselySchema } from "@/lib/db";
import { sql } from "kysely";
import { withTransaction, type Transaction } from "@jurnapod/db";
import { createCostLayer, calculateCost } from "@/lib/cost-tracking";
import type { CostCalculationResult } from "@/lib/cost-tracking";

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

export interface StockDeductResult {
  itemId: number;
  quantity: number;
  transactionId: number;
  unitCost: number;
  totalCost: number;
  costResult: CostCalculationResult;
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

interface StockRow {
  product_id: number;
  outlet_id: number | null;
  quantity: string;
  reserved_quantity: string;
  available_quantity: string;
  updated_at: Date;
}

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  track_stock: number;
  low_stock_threshold: string | null;
}

interface CostSummaryRow {
  current_avg_cost: string | null;
}

interface PriceRow {
  price: string | null;
}

/**
 * Resolve unit cost for inbound stock movements.
 * Priority:
 * 1. inventory_item_costs.current_avg_cost
 * 2. latest item_prices.price
 * 3. throw if not found (fail-closed)
 */
async function resolveInboundUnitCost(
  db: KyselySchema,
  companyId: number,
  itemId: number
): Promise<number> {
  // Try inventory_item_costs first
  const costRows = await sql<CostSummaryRow>`
    SELECT current_avg_cost
    FROM inventory_item_costs
    WHERE company_id = ${companyId} AND item_id = ${itemId}
  `.execute(db);

  const avgCost = costRows.rows[0]?.current_avg_cost;
  if (avgCost !== null && avgCost !== undefined && Number(avgCost) > 0) {
    return Number(avgCost);
  }

  // Fallback to item_prices
  const priceRows = await sql<PriceRow>`
    SELECT price
    FROM item_prices
    WHERE company_id = ${companyId} AND item_id = ${itemId}
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `.execute(db);

  const price = priceRows.rows[0]?.price;
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
  db?: KyselySchema
): Promise<StockCheckResult[]> {
  const database = db ?? getDb();

  const results: StockCheckResult[] = [];

  for (const item of items) {
    const rows = await sql<StockRow>`
      SELECT product_id, available_quantity
      FROM inventory_stock
      WHERE company_id = ${company_id}
        AND product_id = ${item.product_id}
        AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
      ORDER BY outlet_id IS NULL ASC
      LIMIT 1
    `.execute(database);

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
export async function hasSufficientStock(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  db?: KyselySchema
): Promise<boolean> {
  const results = await checkAvailability(company_id, outlet_id, items, db);
  return results.every(r => r.available);
}

/**
 * Get stock conflicts for items that cannot be fulfilled
 */
export async function getStockConflicts(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  db?: KyselySchema
): Promise<Array<{ product_id: number; requested: number; available: number }>> {
  const results = await checkAvailability(company_id, outlet_id, items, db);
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
  db?: KyselySchema
): Promise<boolean> {
  const database = db ?? getDb();

  return withTransaction(database, async (trx) => {
    for (const item of items) {
      // Verify stock exists and has sufficient quantity (with lock)
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
        return false;
      }

      const stock = stockRows.rows[0];
      if (Number(stock.quantity) < item.quantity) {
        return false;
      }

      // Deduct stock - reduce both quantity and available_quantity
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
        return false;
      }

      // Record transaction
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
        ) VALUES (${company_id}, ${outlet_id}, ${TransactionType.SALE}, 'SALE', ${reference_id}, ${item.product_id}, ${-item.quantity}, CURRENT_TIMESTAMP)
      `.execute(trx);
    }

    return true;
  });
}

/**
 * Deduct stock permanently with cost consumption (after transaction completion)
 * Reduces quantity and available_quantity, consumes cost layers, and returns cost details.
 * 
 * This is the outbound costing primitive for COGS integration.
 * Uses the company's costing method (AVG/FIFO/LIFO) to determine costs.
 * 
 * @returns Array of cost details per item for COGS posting
 * @throws Error if any item fails (fail-closed behavior)
 */
export async function deductStockWithCost(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  reference_id: string,
  user_id: number,
  db?: KyselySchema
): Promise<StockDeductResult[]> {
  const database = db ?? getDb();
  const results: StockDeductResult[] = [];

  return withTransaction(database, async (trx) => {
    for (const item of items) {
      // Verify stock exists and has sufficient quantity (with lock)
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

      // Record inventory transaction FIRST (capture insertId for cost tracking)
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
        ) VALUES (${company_id}, ${outlet_id}, ${TransactionType.SALE}, 'SALE', ${reference_id}, ${item.product_id}, ${-item.quantity}, CURRENT_TIMESTAMP)
      `.execute(trx);
      const transactionId = Number(txResult.insertId);

      // Consume cost using the company's costing method
      const costResult = await calculateCost(
        {
          companyId: company_id,
          itemId: item.product_id,
          quantity: item.quantity,
          transactionId: transactionId, // Required for FIFO/LIFO consumption tracking
        },
        trx as unknown as KyselySchema
      );

      // Deduct stock - reduce both quantity and available_quantity
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

      // Calculate weighted average unit cost from consumed layers
      const unitCost = costResult.totalCost / item.quantity;

      results.push({
        itemId: item.product_id,
        quantity: item.quantity,
        transactionId: transactionId,
        unitCost: unitCost,
        totalCost: costResult.totalCost,
        costResult: costResult,
      });
    }

    return results;
  });
}

/**
 * Deduct stock for a sale and post COGS using method-correct costs.
 * Combines stock deduction, cost consumption, and COGS journal posting in one atomic operation.
 * 
 * This closes AC7 gap: ensures sales/invoice posting uses FIFO/LIFO/AVG correctly (not legacy average fallback).
 * 
 * @param input - Sale details including items to deduct and COGS posting parameters
 * @param connection - Optional existing transaction connection
 * @returns Stock deduction results with COGS posting result
 * @throws Error if stock deduction or COGS posting fails (fail-closed)
 */
export interface DeductStockForSaleInput {
  company_id: number;
  outlet_id: number;
  items: StockItem[];
  reference_id: string;
  user_id: number;
  sale_id: string;
  sale_date: Date;
  cogs_enabled: boolean;
}

export interface DeductStockForSaleResult {
  stockResults: StockDeductResult[];
  cogsResult: {
    success: boolean;
    journalBatchId?: number;
    totalCogs: number;
    errors?: string[];
  } | null;
}

export async function deductStockForSaleWithCogs(
  input: DeductStockForSaleInput,
  db?: KyselySchema
): Promise<DeductStockForSaleResult> {
  const { company_id, outlet_id, items, reference_id, user_id, sale_id, sale_date, cogs_enabled } = input;
  
  const database = db ?? getDb();
  
  return withTransaction(database, async (trx) => {
    // First, deduct stock with cost consumption (method-correct via deductStockWithCost)
    const stockResults = await deductStockWithCost(
      company_id,
      outlet_id,
      items,
      reference_id,
      user_id,
      trx as unknown as KyselySchema
    );
    
    // If COGS is not enabled, commit and return stock results only
    if (!cogs_enabled || stockResults.length === 0) {
      return {
        stockResults,
        cogsResult: null
      };
    }
    
    // Build COGS items from consumed costs (no recalculation - uses method-correct costs)
    const cogsItems = stockResults.map((result) => ({
      itemId: result.itemId,
      quantity: result.quantity,
      unitCost: result.unitCost,
      totalCost: result.totalCost
    }));
    
    // Import postCogsForSale dynamically to avoid circular dependency
    const { postCogsForSale } = await import("@/lib/cogs-posting.js");
    
    // Post COGS with pre-computed costs
    const cogsResult = await postCogsForSale(
      {
        saleId: sale_id,
        companyId: company_id,
        outletId: outlet_id,
        items: cogsItems,
        saleDate: sale_date,
        postedBy: user_id
      },
      trx as unknown as KyselySchema
    );
    
    if (!cogsResult.success) {
      throw new Error(
        `COGS posting failed for sale ${sale_id}: ${(cogsResult.errors ?? []).join(", ")}`
      );
    }
    
    // Link inventory transactions to COGS journal batch
    if (cogsResult.journalBatchId) {
      const inventoryTransactionIds = stockResults.map((r) => r.transactionId);
      await sql`
        UPDATE inventory_transactions 
        SET journal_batch_id = ${cogsResult.journalBatchId}
        WHERE id IN (${sql.join(inventoryTransactionIds.map(id => sql`${id}`), sql`, `)})
      `.execute(trx);
    }
    
    return {
      stockResults,
      cogsResult: {
        success: cogsResult.success,
        journalBatchId: cogsResult.journalBatchId,
        totalCogs: cogsResult.totalCogs
      }
    };
  });
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
  db?: KyselySchema
): Promise<boolean> {
  const database = db ?? getDb();

  return withTransaction(database, async (trx) => {
    for (const item of items) {
      // Update stock - increase both quantity and available_quantity
      const updateResult = await sql`
        UPDATE inventory_stock
        SET quantity = quantity + ${item.quantity},
            available_quantity = available_quantity + ${item.quantity},
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = ${company_id}
          AND product_id = ${item.product_id}
          AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
      `.execute(trx);

      if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
        // Stock record doesn't exist, create it
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
        `.execute(trx);
      }

      // Record transaction
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
        ) VALUES (${company_id}, ${outlet_id}, ${TransactionType.REFUND}, 'REFUND', ${reference_id}, ${item.product_id}, ${item.quantity}, CURRENT_TIMESTAMP)
      `.execute(trx);

      // Create cost layer for inbound movement
      const unitCost = await resolveInboundUnitCost(trx as unknown as KyselySchema, company_id, item.product_id);
      await createCostLayer(
        {
          companyId: company_id,
          itemId: item.product_id,
          transactionId: Number(txResult.insertId),
          unitCost,
          quantity: item.quantity,
        },
        trx as unknown as KyselySchema
      );
    }

    return true;
  });
}

/**
 * Adjust stock quantity manually (for inventory counts, damage, etc.)
 * Records the adjustment in transactions
 */
export async function adjustStock(
  input: StockAdjustmentInput,
  db?: KyselySchema
): Promise<boolean> {
  const { company_id, outlet_id, product_id, adjustment_quantity, reason, reference_id, user_id } = input;
  const database = db ?? getDb();

  return withTransaction(database, async (trx) => {
    // Get current stock
    const stockRows = await sql<StockRow>`
      SELECT quantity, reserved_quantity, available_quantity
      FROM inventory_stock
      WHERE company_id = ${company_id}
        AND product_id = ${product_id}
        AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
      ORDER BY outlet_id IS NULL ASC
      LIMIT 1
      FOR UPDATE
    `.execute(trx);

    let currentQty = 0;
    let currentReserved = 0;

    if (stockRows.rows.length > 0) {
      currentQty = Number(stockRows.rows[0].quantity);
      currentReserved = Number(stockRows.rows[0].reserved_quantity);
    }

    const newQty = currentQty + adjustment_quantity;
    const newAvailable = newQty - currentReserved;

    if (newQty < 0) {
      return false;
    }

    if (stockRows.rows.length > 0) {
      // Update existing stock
      const updateResult = await sql`
        UPDATE inventory_stock
        SET quantity = ${newQty},
            available_quantity = ${newAvailable},
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = ${company_id}
          AND product_id = ${product_id}
          AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
      `.execute(trx);

      if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
        return false;
      }
    } else {
      // Create new stock record
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
      `.execute(trx);
    }

    // Record adjustment transaction
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
      ) VALUES (${company_id}, ${outlet_id}, ${TransactionType.ADJUSTMENT}, 'ADJUSTMENT', ${reference_id ?? `ADJ-${Date.now()}`}, ${product_id}, ${adjustment_quantity}, CURRENT_TIMESTAMP)
    `.execute(trx);

    // Create cost layer for positive inbound adjustments only
    if (adjustment_quantity > 0) {
      const unitCost = await resolveInboundUnitCost(trx as unknown as KyselySchema, company_id, product_id);
      await createCostLayer(
        {
          companyId: company_id,
          itemId: product_id,
          transactionId: Number(txResult.insertId),
          unitCost,
          quantity: adjustment_quantity,
        },
        trx as unknown as KyselySchema
      );
    }

    return true;
  });
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
  db?: KyselySchema
): Promise<StockReservationResult> {
  const conflicts: Array<{ product_id: number; requested: number; available: number }> = [];
  const database = db ?? getDb();

  // Check availability first
  const availability = await checkAvailability(company_id, outlet_id, items, database);

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

  return withTransaction(database, async (trx) => {
    for (const item of items) {
      // Reserve stock atomically
      const updateResult = await sql`
        UPDATE inventory_stock
        SET reserved_quantity = reserved_quantity + ${item.quantity},
            available_quantity = available_quantity - ${item.quantity},
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = ${company_id}
          AND product_id = ${item.product_id}
          AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
          AND available_quantity >= ${item.quantity}
      `.execute(trx);

      if (!updateResult.numAffectedRows || updateResult.numAffectedRows === BigInt(0)) {
        return {
          success: false,
          conflicts: [{ product_id: item.product_id, requested: item.quantity, available: 0 }]
        };
      }

      // Record reservation
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
        ) VALUES (${company_id}, ${outlet_id}, ${TransactionType.RESERVATION}, 'RESERVATION', ${reference_id}, ${item.product_id}, ${item.quantity}, CURRENT_TIMESTAMP)
      `.execute(trx);
    }

    return { success: true, reserved: true };
  });
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
  db?: KyselySchema
): Promise<boolean> {
  const database = db ?? getDb();

  return withTransaction(database, async (trx) => {
    for (const item of items) {
      // Get current reserved quantity
      const stockRows = await sql<StockRow>`
        SELECT reserved_quantity
        FROM inventory_stock
        WHERE company_id = ${company_id}
          AND product_id = ${item.product_id}
          AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
        ORDER BY outlet_id IS NULL ASC
        LIMIT 1
        FOR UPDATE
      `.execute(trx);

      if (stockRows.rows.length === 0) {
        continue; // No stock record, nothing to release
      }

      const currentReserved = Number(stockRows.rows[0].reserved_quantity);
      const releaseQty = Math.min(item.quantity, currentReserved);

      if (releaseQty <= 0) {
        continue;
      }

      // Release stock
      const updateResult = await sql`
        UPDATE inventory_stock
        SET reserved_quantity = reserved_quantity - ${releaseQty},
            available_quantity = available_quantity + ${releaseQty},
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = ${company_id}
          AND product_id = ${item.product_id}
          AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
          AND reserved_quantity >= ${releaseQty}
      `.execute(trx);

      if (updateResult.numAffectedRows && updateResult.numAffectedRows > BigInt(0)) {
        // Record release
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
          ) VALUES (${company_id}, ${outlet_id}, ${TransactionType.RELEASE}, 'RELEASE', ${reference_id}, ${item.product_id}, ${releaseQty}, CURRENT_TIMESTAMP)
        `.execute(trx);
      }
    }

    return true;
  });
}

/**
 * Get current stock levels for a company/outlet
 */
export async function getStockLevels(
  company_id: number,
  outlet_id: number,
  product_ids?: number[],
  db?: KyselySchema
): Promise<StockLevel[]> {
  const database = db ?? getDb();

  let query = sql`
    SELECT product_id, outlet_id, quantity, reserved_quantity, available_quantity, updated_at
    FROM inventory_stock
    WHERE company_id = ${company_id} AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
  `;

  if (product_ids && product_ids.length > 0) {
    query = sql`${query} AND product_id IN (${sql.join(product_ids.map(id => sql`${id}`), sql`, `)})`;
  }

  query = sql`${query} ORDER BY product_id`;

  const result = await sql<StockRow>`${query}`.execute(database);

  return result.rows.map((row) => ({
    product_id: row.product_id,
    outlet_id: row.outlet_id,
    quantity: Number(row.quantity),
    reserved_quantity: Number(row.reserved_quantity),
    available_quantity: Number(row.available_quantity),
    updated_at: row.updated_at.toISOString()
  }));
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
  db?: KyselySchema
): Promise<{ transactions: StockTransaction[]; total: number }> {
  const database = db ?? getDb();
  const { product_id, transaction_type, since, limit = 100, offset = 0 } = options;

  // Build WHERE clause using sql.join
  const conditions: ReturnType<typeof sql>[] = [];
  conditions.push(sql`company_id = ${company_id}`);
  
  if (outlet_id !== null) {
    conditions.push(sql`(outlet_id = ${outlet_id} OR outlet_id IS NULL)`);
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

  // Get total count
  const countResult = await sql<{ total: string }>`
    SELECT COUNT(*) as total FROM inventory_transactions WHERE ${whereClause}
  `.execute(database);
  const total = Number(countResult.rows[0]?.total ?? 0);

  // Get transactions
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
  `.execute(database);

  const transactions: StockTransaction[] = rows.rows.map((row) => ({
    transaction_id: row.transaction_id,
    company_id: row.company_id,
    outlet_id: row.outlet_id,
    transaction_type: row.transaction_type,
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    product_id: row.product_id ?? 0,
    quantity_delta: Number(row.quantity_delta),
    created_at: row.created_at.toISOString()
  }));

  return { transactions, total };
}

interface LowStockAlertRow {
  product_id: number;
  sku: string;
  name: string;
  quantity: string;
  available_quantity: string;
  low_stock_threshold: string | null;
}

/**
 * Get low stock alerts for products below their threshold
 */
export async function getLowStockAlerts(
  company_id: number,
  outlet_id: number,
  db?: KyselySchema
): Promise<LowStockAlert[]> {
  const database = db ?? getDb();

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
    WHERE i.company_id = ${company_id}
      AND i.track_stock = 1
      AND i.low_stock_threshold IS NOT NULL
      AND (s.outlet_id = ${outlet_id} OR s.outlet_id IS NULL)
      AND s.available_quantity <= i.low_stock_threshold
  `.execute(database);

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
export async function getProductStock(
  company_id: number,
  outlet_id: number,
  product_id: number,
  db?: KyselySchema
): Promise<StockLevel | null> {
  const levels = await getStockLevels(company_id, outlet_id, [product_id], db);
  return levels[0] ?? null;
}
