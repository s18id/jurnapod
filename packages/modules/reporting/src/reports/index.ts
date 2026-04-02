// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reports Module
 * 
 * Report query and service implementations.
 * 
 * FINANCIAL REPORTS (journal-sourced):
 * =====================================
 * - Trial Balance
 * - General Ledger
 * - Profit & Loss
 * - Worksheet
 * 
 * These derive data from journal_batches and journal_lines tables.
 * See ../contracts/index.ts for journal source-of-truth documentation.
 * 
 * OPERATIONAL REPORTS (transaction-sourced):
 * =========================================
 * - POS Transactions
 * - Daily Sales
 * - POS Payments
 * - Receivables Ageing
 * 
 * USAGE:
 * ------
 * ```typescript
 * import {
 *   listPosTransactions,
 *   listDailySalesSummary,
 *   listPosPaymentsSummary,
 *   listJournalBatches,
 *   getTrialBalance,
 *   getGeneralLedgerDetail,
 *   getProfitLoss,
 *   getReceivablesAgeingReport,
 *   getTrialBalanceWorksheet,
 * } from "@jurnapod/modules-reporting/reports";
 * ```
 */

// Types
export * from "./types.js";

// Helpers
export * from "./helpers.js";

// Services
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
} from "./services.js";