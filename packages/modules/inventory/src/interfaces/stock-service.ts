// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock service interface for inventory module.
 * All methods require company_id scoping; outlet_id where applicable.
 * 
 * Note: Cost-dependent operations (deductStockWithCost, deductStockForSaleWithCogs,
 * restoreStock, adjustStock) are implemented in the API layer since they depend
 * on cost-tracking which is API-internal.
 */

import type { MutationAuditActor } from "./shared.js";

export type StockTransactionType = 
  | "SALE" 
  | "REFUND" 
  | "RESERVATION" 
  | "RELEASE" 
  | "ADJUSTMENT" 
  | "RECEIPT" 
  | "TRANSFER";

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

export interface StockService {
  /**
   * Check stock availability for multiple items.
   */
  checkAvailability(
    companyId: number,
    outletId: number,
    items: StockItem[]
  ): Promise<StockCheckResult[]>;

  /**
   * Check if all items have sufficient stock.
   */
  hasSufficientStock(
    companyId: number,
    outletId: number,
    items: StockItem[]
  ): Promise<boolean>;

  /**
   * Get stock conflicts for items that cannot be fulfilled.
   */
  getStockConflicts(
    companyId: number,
    outletId: number,
    items: StockItem[]
  ): Promise<Array<{ product_id: number; requested: number; available: number }>>;

  /**
   * Deduct stock permanently (after transaction completion).
   * Note: This is basic deduction without cost tracking.
   * Use the API's deductStockWithCost for COGS-enabled operations.
   */
  deductStock(
    companyId: number,
    outletId: number,
    items: StockItem[],
    referenceId: string,
    userId: number
  ): Promise<boolean>;

  /**
   * Reserve stock for pending transactions.
   */
  reserveStock(
    companyId: number,
    outletId: number,
    items: StockItem[],
    referenceId: string
  ): Promise<StockReservationResult>;

  /**
   * Release reserved stock.
   */
  releaseStock(
    companyId: number,
    outletId: number,
    items: StockItem[],
    referenceId: string
  ): Promise<boolean>;

  /**
   * Get current stock levels for a company/outlet.
   */
  getStockLevels(
    companyId: number,
    outletId: number,
    productIds?: number[]
  ): Promise<StockLevel[]>;

  /**
   * Get stock transaction history.
   */
  getStockTransactions(
    companyId: number,
    outletId: number | null,
    options?: {
      product_id?: number;
      transaction_type?: number;
      since?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ transactions: StockTransaction[]; total: number }>;

  /**
   * Get low stock alerts for products below their threshold.
   */
  getLowStockAlerts(companyId: number, outletId: number): Promise<LowStockAlert[]>;

  /**
   * Get a single product's stock level.
   */
  getProductStock(
    companyId: number,
    outletId: number,
    productId: number
  ): Promise<StockLevel | null>;
}
