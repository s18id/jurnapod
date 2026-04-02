// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Modules Reporting Package
 * 
 * Provides reporting infrastructure including:
 * - Report classification taxonomy (financial, operational, audit, etc.)
 * - Report contracts (types, filters, telemetry)
 * - Report service interfaces for dependency injection
 * - Report query services (extracted from API)
 * 
 * JOURNAL SOURCE-OF-TRUTH:
 * ========================
 * Financial reports (trial_balance, general_ledger, profit_loss, worksheet, 
 * balance_sheet, journals) derive data from journal_batches and journal_lines tables.
 * 
 * See ./contracts/index.ts for complete documentation on journal SoT assumptions.
 * 
 * USAGE:
 * ------
 * Classification and interfaces:
 * ```typescript
 * import { 
 *   ReportType,
 *   REPORT_CLASSIFICATIONS,
 *   isJournalSourcedReport,
 *   withQueryTimeout,
 *   ReportServiceInterface,
 * } from "@jurnapod/modules-reporting";
 * ```
 * 
 * Report services:
 * ```typescript
 * import {
 *   listPosTransactions,
 *   getTrialBalance,
 *   getProfitLoss,
 *   // ... etc
 * } from "@jurnapod/modules-reporting/reports";
 * ```
 */

// Classification exports
export * from "./classification/index.js";

// Contract exports
export * from "./contracts/index.js";

// Interface exports
export * from "./interfaces/index.js";

// Report services exports (re-exported from ./reports)
export * from "./reports/index.js";
