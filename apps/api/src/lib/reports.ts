// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reports Library - API Adapter
 * 
 * This module provides backward compatibility for the API routes.
 * Report query and service logic has been moved to @jurnapod/modules-reporting.
 * 
 * This adapter re-exports from the reporting package to maintain
 * the same import paths for existing API route code.
 */

// Re-export all report services from the modules-reporting package
export {
  listPosTransactions,
  listDailySalesSummary,
  listPosPaymentsSummary,
  listJournalBatches,
  getTrialBalance,
  getGeneralLedgerDetail,
  getProfitLoss,
  getReceivablesAgeingReport,
  getTrialBalanceWorksheet,
} from "@jurnapod/modules-reporting";

// Re-export filter and result types for backward compatibility
export type {
  PosTransactionFilter,
  JournalFilter,
  TrialBalanceFilter,
  GeneralLedgerFilter,
  ProfitLossFilter,
  WorksheetFilter,
  ReceivablesAgeingFilter,
  PosTransactionsResult,
  JournalsResult,
  TrialBalanceResultRow,
  GeneralLedgerAccountDetail,
  ProfitLossResult,
  WorksheetResultRow,
  ReceivablesAgeingResult,
} from "@jurnapod/modules-reporting";