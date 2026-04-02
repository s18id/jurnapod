// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Service
 * 
 * Core stock operations with database transaction support.
 * - Basic stock operations delegate to @jurnapod/modules-inventory
 * - Cost-dependent operations (deductStockWithCost, restoreStock, adjustStock, 
 *   deductStockForSaleWithCogs) are implemented here since they depend on
 *   cost-tracking which is API-internal.
 */

import { getDb, type KyselySchema } from "@/lib/db";
import { sql } from "kysely";
import { createCostLayer, calculateCost } from "@/lib/cost-tracking";
import type { CostCalculationResult } from "@/lib/cost-tracking";

// Transaction type constants
export const TransactionType = {
  SALE: 1,
  REFUND: 2,
  RESERVATION: 3,
  RELEASE: 4,
  ADJUSTMENT: 5,
  RECEIPT: 6,
  TRANSFER: 7
} as const;

export type TransactionTypeValue = typeof TransactionType[keyof typeof TransactionType];

// Types (some from modules-inventory, some defined here for cost-tracking dependent operations)
export type { StockItem, StockCheckResult, StockReservationResult, StockTransaction, StockLevel, LowStockAlert } from "@jurnapod/modules-inventory";

// Types for cost-tracking dependent operations (defined here since modules-inventory doesn't have them)
export interface StockDeductResult {
  itemId: number;
  quantity: number;
  transactionId: number;
  unitCost: number;
  totalCost: number;
  costResult: CostCalculationResult;
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

// Re-export error classes from modules-inventory
export { InventoryConflictError, InventoryReferenceError, InventoryForbiddenError } from "@jurnapod/modules-inventory";

// Import service from modules-inventory for basic operations
import { getStockService } from "@jurnapod/modules-inventory";
import type { StockItem, StockCheckResult, StockReservationResult, StockTransaction, StockLevel, LowStockAlert } from "@jurnapod/modules-inventory";

async function withExecutorTransaction<T>(
  db: KyselySchema,
  callback: (executor: KyselySchema) => Promise<T>
): Promise<T> {
  if (db.isTransaction) {
    return callback(db);
  }
  return db.transaction().execute(async (trx) => callback(trx as unknown as KyselySchema));
}

interface StockRow {
  product_id: number;
  outlet_id: number | null;
  quantity: string;
  reserved_quantity: string;
  available_quantity: string;
  updated_at: Date;
}

interface CostSummaryRow {
  current_avg_cost: string | null;
}

interface PriceRow {
  price: string | null;
}

/**
 * Resolve unit cost for inbound stock movements.
 */
async function resolveInboundUnitCost(
  db: KyselySchema,
  companyId: number,
  itemId: number
): Promise<number> {
  const costRows = await sql<CostSummaryRow>`
    SELECT current_avg_cost
    FROM inventory_item_costs
    WHERE company_id = ${companyId} AND item_id = ${itemId}
  `.execute(db);

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
  `.execute(db);

  const price = priceRows.rows[0]?.price;
  if (price !== null && price !== undefined && Number(price) > 0) {
    return Number(price);
  }

  throw new Error(
    `Unable to determine unit cost for item ${itemId}. No cost history or pricing data available.`
  );
}

// ============================================================================
// BASIC STOCK OPERATIONS - Delegate to modules-inventory
// ============================================================================

/**
 * Check stock availability for multiple items
 */
export async function checkAvailability(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  db?: KyselySchema
): Promise<StockCheckResult[]> {
  const database = db ?? getDb();
  const service = getStockService(database);
  return service.checkAvailability(company_id, outlet_id, items);
}

/**
 * Check if all items have sufficient stock
 */
export async function hasSufficientStock(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  db?: KyselySchema
): Promise<boolean> {
  const database = db ?? getDb();
  const service = getStockService(database);
  return service.hasSufficientStock(company_id, outlet_id, items);
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
  const database = db ?? getDb();
  const service = getStockService(database);
  return service.getStockConflicts(company_id, outlet_id, items);
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
  const service = getStockService(database);
  return service.getStockLevels(company_id, outlet_id, product_ids);
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
  const service = getStockService(database);
  return service.getStockTransactions(company_id, outlet_id, options);
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
  const service = getStockService(database);
  return service.getLowStockAlerts(company_id, outlet_id);
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
  const database = db ?? getDb();
  const service = getStockService(database);
  return service.getProductStock(company_id, outlet_id, product_id);
}

// ============================================================================
// RESERVATION OPERATIONS - Delegate to modules-inventory
// ============================================================================

/**
 * Reserve stock for pending transactions
 */
export async function reserveStock(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  reference_id: string,
  db?: KyselySchema
): Promise<StockReservationResult> {
  const database = db ?? getDb();
  const service = getStockService(database);
  return service.reserveStock(company_id, outlet_id, items, reference_id);
}

/**
 * Release reserved stock
 */
export async function releaseStock(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  reference_id: string,
  db?: KyselySchema
): Promise<boolean> {
  const database = db ?? getDb();
  const service = getStockService(database);
  return service.releaseStock(company_id, outlet_id, items, reference_id);
}

// ============================================================================
// BASIC DEDUCT/RESTOCK - Delegate to modules-inventory (no cost tracking)
// ============================================================================

/**
 * Deduct stock permanently (after transaction completion)
 * Note: This version doesn't do cost tracking. Use deductStockWithCost for COGS.
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
  const service = getStockService(database);
  return service.deductStock(company_id, outlet_id, items, reference_id, user_id);
}

// ============================================================================
// COST-DEPENDENT OPERATIONS - Implemented here (depend on cost-tracking)
// ============================================================================

/**
 * Deduct stock permanently with cost consumption (after transaction completion)
 * Reduces quantity and available_quantity, consumes cost layers, and returns cost details.
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

  return withExecutorTransaction(database, async (trx) => {
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
        ) VALUES (${company_id}, ${outlet_id}, ${TransactionType.SALE}, 'SALE', ${reference_id}, ${item.product_id}, ${-item.quantity}, CURRENT_TIMESTAMP)
      `.execute(trx);
      const transactionId = Number(txResult.insertId);

      const costResult = await calculateCost(
        {
          companyId: company_id,
          itemId: item.product_id,
          quantity: item.quantity,
          transactionId: transactionId,
        },
        trx as unknown as KyselySchema
      );

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
 */
export async function deductStockForSaleWithCogs(
  input: DeductStockForSaleInput,
  db?: KyselySchema
): Promise<DeductStockForSaleResult> {
  const { company_id, outlet_id, items, reference_id, user_id, sale_id, sale_date, cogs_enabled } = input;
  
  const database = db ?? getDb();
  
  return withExecutorTransaction(database, async (trx) => {
    const stockResults = await deductStockWithCost(
      company_id,
      outlet_id,
      items,
      reference_id,
      user_id,
      trx as unknown as KyselySchema
    );
    
    if (!cogs_enabled || stockResults.length === 0) {
      return {
        stockResults,
        cogsResult: null
      };
    }
    
    const cogsItems = stockResults.map((result) => ({
      itemId: result.itemId,
      quantity: result.quantity,
      unitCost: result.unitCost,
      totalCost: result.totalCost
    }));
    
    const { postCogsForSale } = await import("@/lib/cogs-posting.js");
    
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

  return withExecutorTransaction(database, async (trx) => {
    for (const item of items) {
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
 * Adjust stock quantity manually
 */
export async function adjustStock(
  input: StockAdjustmentInput,
  db?: KyselySchema
): Promise<boolean> {
  const { company_id, outlet_id, product_id, adjustment_quantity, reason, reference_id, user_id } = input;
  const database = db ?? getDb();

  return withExecutorTransaction(database, async (trx) => {
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
