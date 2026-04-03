// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// =============================================================================
// THIN ADAPTER - API Cost Tracking
// =============================================================================
// This file is a thin adapter that re-exports cost tracking functionality
// from @jurnapod/modules-inventory-costing package.
//
// All actual implementation logic has been moved to the costing package.
// This adapter exists to maintain API compatibility with existing code.
//
// DO NOT add new implementation logic here - delegate to the costing package.
// =============================================================================

import type { KyselySchema } from "@/lib/db";

// Re-export all public API from costing package
export {
  // Core costing functions
  getCompanyCostingMethod,
  calculateCost,
  createCostLayer,
  getItemCostLayers,
  getItemCostSummary,
  deductWithCost,
  // Extended auditability functions
  getItemCostLayersWithConsumption,
  getItemCostSummaryExtended,
  // Strategy factory
  getCostingStrategy,
  // Error classes
  CostTrackingError,
  InsufficientInventoryError,
  InvalidCostingMethodError,
  // Money helpers
  toMinorUnits,
  fromMinorUnits,
} from "@jurnapod/modules-inventory-costing";

export type {
  CostingMethod,
  CostLayer,
  CostCalculationInput,
  CostCalculationResult,
  ConsumedLayer,
  ItemCostSummary,
  DeductionInput,
  DeductionResult,
  ItemCostResult,
  CostLayerWithConsumption,
  ItemCostSummaryExtended,
} from "@jurnapod/modules-inventory-costing";
