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
export type { StockItem, StockCheckResult, StockReservationResult, StockTransaction, StockLevel, LowStockAlert, StockDeductResult, StockAdjustmentInput } from "@jurnapod/modules-inventory";

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
import type { StockItem, StockCheckResult, StockReservationResult, StockTransaction, StockLevel, LowStockAlert, StockDeductResult, StockAdjustmentInput } from "@jurnapod/modules-inventory";

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
): Promise<boolean> {
  const database = db ?? getDb();
  const service = getStockService(database);
  return service.adjustStock(input, database);
}
