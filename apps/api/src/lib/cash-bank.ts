// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// =============================================================================
// Thin re-export shim
// =============================================================================
// All domain logic has been extracted to @jurnapod/modules-treasury.
// This file exists solely to maintain backward compatibility for:
//   1. Existing API tests that import from this module
//   2. Any ad-hoc internal callers during the migration window
//
// Route handlers now use createCashBankService() from ./treasury-adapter.js
// and do NOT call any function from this file directly.
// =============================================================================

// Re-export domain types for compatibility
export type { CashBankTransaction } from "@jurnapod/modules-treasury";
export type { CashBankType, CashBankStatus } from "@jurnapod/modules-treasury";

// Re-export errors for compatibility
export {
  CashBankValidationError,
  CashBankStatusError,
  CashBankNotFoundError,
  CashBankForbiddenError
} from "@jurnapod/modules-treasury";

// Re-export pure helpers for test compatibility
export { buildCashBankJournalLines } from "@jurnapod/modules-treasury";
export { normalizeMoney, toMinorUnits } from "@jurnapod/modules-treasury";
export { isCashBankTypeName, classifyCashBankAccount } from "@jurnapod/modules-treasury";
export { validateDirectionByTransactionType } from "@jurnapod/modules-treasury";

// Import for __cashBankTestables (named imports required for shorthand)
import {
  buildCashBankJournalLines,
  isCashBankTypeName,
  classifyCashBankAccount,
  validateDirectionByTransactionType
} from "@jurnapod/modules-treasury";

// Backward-compatible testables — all functions delegate to treasury package
export const __cashBankTestables = {
  buildCashBankJournalLines,
  isCashBankTypeName,
  classifyCashBankAccount,
  validateDirectionByTransactionType
};
