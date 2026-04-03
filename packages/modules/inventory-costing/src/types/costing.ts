// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Costing Types
 * 
 * Core types for cost tracking across AVG/FIFO/LIFO methods.
 * These types are database-agnostic and define the costing contract.
 */

// -----------------------------------------------------------------------------
// Costing Method
// -----------------------------------------------------------------------------

export type CostingMethod = "AVG" | "FIFO" | "LIFO";

// -----------------------------------------------------------------------------
// Cost Layer
// -----------------------------------------------------------------------------

/**
 * Represents a cost transaction layer in inventory.
 * A layer tracks the cost and quantity of inventory acquired in a single transaction.
 */
export interface CostLayer {
  id: number;
  companyId: number;
  itemId: number;
  transactionId: number;
  unitCost: number;
  originalQty: number;
  remainingQty: number;
  acquiredAt: Date;
}

// -----------------------------------------------------------------------------
// Cost Calculation
// -----------------------------------------------------------------------------

/**
 * Input for cost calculation (consumption/deduction)
 */
export interface CostCalculationInput {
  companyId: number;
  itemId: number;
  quantity: number;
  transactionId?: number; // Required for FIFO/LIFO to record consumption
}

/**
 * A consumed layer as part of cost calculation
 */
export interface ConsumedLayer {
  layerId: number;
  consumedQty: number;
  unitCost: number;
}

/**
 * Result of cost calculation
 */
export interface CostCalculationResult {
  totalCost: number;
  consumedLayers: ConsumedLayer[];
}

// -----------------------------------------------------------------------------
// Cost Summary
// -----------------------------------------------------------------------------

/**
 * Summary of cost state for an item
 */
export interface ItemCostSummary {
  companyId: number;
  itemId: number;
  costingMethod: CostingMethod;
  currentAvgCost: number | null;
  totalLayersQty: number;
  totalLayersCost: number;
}

// -----------------------------------------------------------------------------
// DeductWithCost Contract
// -----------------------------------------------------------------------------

/**
 * Input item for deductWithCost.
 * 
 * stockTxId is the pre-created inventory transaction ID for the deduction.
 * This follows the pre-created transaction pattern where the caller creates
 * the transaction first, then passes the ID to be linked with cost calculations.
 */
export interface DeductionInput {
  itemId: number;
  qty: number;
  stockTxId: number;
}

/**
 * Individual item cost result from deduction
 */
export interface ItemCostResult {
  itemId: number;
  qty: number;
  unitCost: number;
  totalCost: number;
  stockTxId: number;
}

/**
 * Result of deductWithCost operation
 */
export interface DeductionResult {
  stockTxIds: number[];
  itemCosts: ItemCostResult[];
}

// -----------------------------------------------------------------------------
// Extended Types (for auditability)
// -----------------------------------------------------------------------------

/**
 * Extended cost layer with consumption history for auditability
 */
export interface CostLayerWithConsumption extends CostLayer {
  reference?: string | null;
  consumedBy?: Array<{
    transactionId: number;
    quantity: number;
    consumedAt: string;
  }>;
}

/**
 * Extended cost summary with method-specific breakdown
 */
export interface ItemCostSummaryExtended extends ItemCostSummary {
  lastUpdated: string;
  methodSpecific?: {
    avg?: {
      weightedAverage: number;
      totalValue: number;
    };
    fifo?: {
      oldestLayerCost: number;
      layerCount: number;
    };
    lifo?: {
      newestLayerCost: number;
      layerCount: number;
    };
  };
}

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

export class CostTrackingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostTrackingError";
  }
}

export class InsufficientInventoryError extends CostTrackingError {
  constructor(needed: number, available: number) {
    super(`Insufficient inventory: need ${needed}, have ${available}`);
    this.name = "InsufficientInventoryError";
  }
}

export class InvalidCostingMethodError extends CostTrackingError {
  constructor(method: string) {
    super(`Invalid costing method: ${method}`);
    this.name = "InvalidCostingMethodError";
  }
}

// -----------------------------------------------------------------------------
// Money Helpers
// -----------------------------------------------------------------------------

export const MONEY_PRECISION = 4; // 4 decimal places for unit costs
export const MONEY_MULTIPLIER = 10 ** MONEY_PRECISION;

export function toMinorUnits(value: number): number {
  return Math.round(value * MONEY_MULTIPLIER);
}

export function fromMinorUnits(value: number): number {
  return value / MONEY_MULTIPLIER;
}
