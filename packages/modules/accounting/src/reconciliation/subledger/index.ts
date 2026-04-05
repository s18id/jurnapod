// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Subledger reconciliation providers.
 *
 * This module provides:
 * - SubledgerBalanceProvider interface for querying subledger balances
 * - SignedAmount helpers with debit-positive convention
 * - CASH subledger implementation
 *
 * @example
 * import { CashSubledgerProvider } from './subledger/cash-provider.js';
 *
 * const cashProvider = new CashSubledgerProvider({ db });
 * const result = await cashProvider.getBalance({
 *   companyId: 1,
 *   asOfEpochMs: Date.now(),
 *   includeDrilldown: true
 * });
 */

// Re-export types
export {
  type SignedAmount,
  type SignedAmountBreakdown,
  type ReconciliationSourceType,
  type ReconciliationDrilldownLine,
  type ReconciliationDrilldown,
  SubledgerType,
  type SubledgerTypeCode,
  type SubledgerBalanceQuery,
  type SubledgerBalanceResult,
  SubledgerBalanceProvider,
} from "./types.js";

// Re-export provider interface and helpers
export {
  makeSignedAmount,
  toSignedAmountBreakdown,
  toSignedAmount,
  fromSignedAmount,
  addSignedAmounts,
  negateSignedAmount,
  mapJournalLineToDrilldown,
  zeroBreakdown,
  zeroSignedAmount,
} from "./provider.js";

// Re-export CASH provider
export { CashSubledgerProvider, type CashSubledgerDbClient, type CashSubledgerProviderOptions } from "./cash-provider.js";
