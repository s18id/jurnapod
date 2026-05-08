// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Service
 * 
 * Core stock operations with database transaction support.
 * - Basic stock operations delegate to @jurnapod/modules-inventory
 * - Cost-dependent operations (deductStockWithCost, restoreStock, adjustStock)
 *   delegate to @jurnapod/modules-inventory via getStockService()
 * - deductStockForSaleWithCogs stays in API (composes stock + COGS posting)
 */

import { getDb, type KyselySchema } from "@/lib/db";
import { sql } from "kysely";
import { withTransactionRetry } from "@jurnapod/db";

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

// Types (re-exported from modules-inventory)
export type { StockItem, StockCheckResult, StockReservationResult, StockTransaction, StockLevel, LowStockAlert, StockDeductResult, StockAdjustmentInput, StockAdjustmentResult } from "@jurnapod/modules-inventory";

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
export { InventoryConflictError, InventoryReferenceError, InventoryForbiddenError, InsufficientStockError } from "@jurnapod/modules-inventory";

// Import service from modules-inventory for basic operations
import { getStockService } from "@jurnapod/modules-inventory";
import type { StockItem, StockCheckResult, StockReservationResult, StockTransaction, StockLevel, LowStockAlert, StockDeductResult, StockAdjustmentInput, StockAdjustmentResult } from "@jurnapod/modules-inventory";

const STANDARD_VARIANCE_ACCOUNT_SETTING_KEY = "inventory.standard_variance_account_id";

async function postStockAdjustmentVariance(input: StockAdjustmentInput, result: StockAdjustmentResult, db: KyselySchema): Promise<void> {
    if (!result.success || !result.transactionId || result.totalCost <= 0) return;

    const settingRow = await sql<{ setting_value: string | null }>`
      SELECT setting_value
      FROM settings_strings
      WHERE company_id = ${input.company_id}
        AND outlet_id IS NULL
        AND setting_key = ${STANDARD_VARIANCE_ACCOUNT_SETTING_KEY}
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `.execute(db);
    const varianceAccountId = Number((settingRow.rows[0] as { setting_value?: string | null } | undefined)?.setting_value ?? 0);
    if (!Number.isSafeInteger(varianceAccountId) || varianceAccountId <= 0) return;

    const itemRow = await sql<{ inventory_asset_account_id: number | null }>`
      SELECT inventory_asset_account_id
      FROM items
      WHERE company_id = ${input.company_id} AND id = ${input.product_id}
      LIMIT 1
    `.execute(db);
    const inventoryAccountId = Number((itemRow.rows[0] as { inventory_asset_account_id?: number | null } | undefined)?.inventory_asset_account_id ?? 0);
    if (!Number.isSafeInteger(inventoryAccountId) || inventoryAccountId <= 0) return;

    const amount = result.totalCost.toFixed(4);
    const batch = await sql`
      INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
      VALUES (${input.company_id}, ${input.outlet_id ?? null}, 'STOCK_ADJUSTMENT', ${result.transactionId}, NOW())
    `.execute(db);
    const batchId = batch.insertId;

    if (input.adjustment_quantity > 0) {
      await sql`
        INSERT INTO journal_lines (journal_batch_id, company_id, outlet_id, account_id, debit, credit, description, line_date, created_at, updated_at)
        VALUES
          (${batchId}, ${input.company_id}, ${input.outlet_id ?? null}, ${inventoryAccountId}, ${amount}, 0, ${`Stock adjustment gain ${input.reference_id ?? result.transactionId}`}, CURDATE(), NOW(), NOW()),
          (${batchId}, ${input.company_id}, ${input.outlet_id ?? null}, ${varianceAccountId}, 0, ${amount}, ${`Stock adjustment variance ${input.reason}`}, CURDATE(), NOW(), NOW())
      `.execute(db);
    } else {
      await sql`
        INSERT INTO journal_lines (journal_batch_id, company_id, outlet_id, account_id, debit, credit, description, line_date, created_at, updated_at)
        VALUES
          (${batchId}, ${input.company_id}, ${input.outlet_id ?? null}, ${varianceAccountId}, ${amount}, 0, ${`Stock adjustment variance ${input.reason}`}, CURDATE(), NOW(), NOW()),
          (${batchId}, ${input.company_id}, ${input.outlet_id ?? null}, ${inventoryAccountId}, 0, ${amount}, ${`Stock adjustment loss ${input.reference_id ?? result.transactionId}`}, CURDATE(), NOW(), NOW())
      `.execute(db);
    }

    await sql`
      UPDATE inventory_transactions
      SET journal_batch_id = ${batchId}
      WHERE id = ${result.transactionId} AND company_id = ${input.company_id}
    `.execute(db);
}

async function withExecutorTransaction<T>(
  db: KyselySchema,
  callback: (executor: KyselySchema) => Promise<T>
): Promise<T> {
  if (db.isTransaction) {
    return callback(db);
  }
  return withTransactionRetry(db, async (trx) => callback(trx as unknown as KyselySchema));
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

/**
 * Transfer stock atomically between outlets.
 */
export async function transferStock(
  company_id: number,
  from_outlet_id: number,
  to_outlet_id: number,
  items: StockItem[],
  reference_id: string,
  user_id: number,
  db?: KyselySchema
): Promise<boolean> {
  const database = db ?? getDb();
  const service = getStockService(database);
  return service.transferStock(company_id, from_outlet_id, to_outlet_id, items, reference_id, user_id);
}

// ============================================================================
// COST-DEPENDENT OPERATIONS - Delegate to modules-inventory
// deductStockForSaleWithCogs stays in API (composes stock + COGS posting)
// ============================================================================

/**
 * Deduct stock permanently with cost consumption (after transaction completion)
 * Reduces quantity and available_quantity, consumes cost layers, and returns cost details.
 * 
 * Delegates cost calculation to @jurnapod/modules-inventory-costing package using the
 * deductWithCost contract (stockTxId pattern from 24-2).
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
  const service = getStockService(database);
  return service.deductStockWithCost(
    { company_id, outlet_id, items, reference_id, user_id },
    database
  );
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
    
    const { postCogsForSale } = await import("@jurnapod/modules-accounting/posting/cogs");
    
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
  const service = getStockService(database);
  return service.restoreStock(
    { company_id, outlet_id, items, reference_id, user_id },
    database
  );
}

/**
 * Adjust stock quantity manually
 */
export async function adjustStock(
  input: StockAdjustmentInput,
  db?: KyselySchema
): Promise<StockAdjustmentResult> {
  const database = db ?? getDb();
  const service = getStockService(database);

  return withExecutorTransaction(database, async (executor) => {
    const result = await service.adjustStock(input, executor);
    await postStockAdjustmentVariance(input, result, executor);
    return result;
  });
}
