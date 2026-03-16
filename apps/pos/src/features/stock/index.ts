// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stock Feature
 * 
 * Client-side stock validation and management for POS.
 * All operations work offline using local IndexedDB.
 */

export { useStockValidation } from "./useStockValidation.js";
export type {
  UseStockValidationOptions,
  UseStockValidationReturn,
  StockValidationError
} from "./useStockValidation.js";
