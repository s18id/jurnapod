// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Trial Balance Module
 *
 * Provides trial balance reporting with validation:
 * - Lists all GL accounts with debit/credit balances for a period
 * - Validates that SUM(debits) == SUM(credits)
 * - Calculates variance vs prior period
 * - Calculates variance vs subledger balances
 * - Pre-close checklist with all items that must pass
 */

export {
  TrialBalanceService,
  type TrialBalanceServiceConfig,
  type TrialBalanceQuery,
  type TrialBalanceAccountRow,
  type PriorPeriodBalance,
  type PeriodVariance,
  type SubledgerVariance,
  type TrialBalanceEntry,
  type TrialBalanceGlImbalanceResult,
  type PreCloseCheckItem,
  type PreCloseValidationResult,
  type TrialBalanceResult,
} from "./service.js";
