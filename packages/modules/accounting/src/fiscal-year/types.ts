// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Fiscal Year Domain Types
 * 
 * Type definitions for fiscal year close procedure and status reporting.
 */

import type { FiscalYear, FiscalYearStatus } from "@jurnapod/shared";

/**
 * Status values for fiscal year close request lifecycle
 */
export const FISCAL_YEAR_CLOSE_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED"
} as const;

export type FiscalYearCloseStatus = (typeof FISCAL_YEAR_CLOSE_STATUS)[keyof typeof FISCAL_YEAR_CLOSE_STATUS];

export interface CloseFiscalYearResult {
  success: boolean;
  fiscalYearId: number;
  closeRequestId: string;
  status: FiscalYearCloseStatus;
  previousStatus: string;
  newStatus: string;
  resultJson?: Record<string, unknown>;
  failureCode?: string;
  failureMessage?: string;
}

/**
 * Context for close fiscal year operation
 */
export interface CloseFiscalYearContext {
  companyId: number;
  requestedByUserId: number;
  requestedAtEpochMs: number;
  reason?: string;
}

/**
 * Represents a single closing entry line
 */
export interface ClosingEntryLine {
  accountId: number;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

/**
 * Represents a preview of closing entries
 */
export interface ClosePreviewResult {
  fiscalYearId: number;
  fiscalYearCode: string;
  fiscalYearName: string;
  startDate: string;
  endDate: string;
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  retainedEarningsAccountId: number;
  retainedEarningsAccountCode: string;
  closingEntries: ClosingEntryLine[];
  entryDate: string;
  description: string;
}

/**
 * Represents period status within a fiscal year
 */
export interface PeriodStatus {
  periodId: number | null;
  periodCode: string | null;
  startDate: string;
  endDate: string;
  status: "OPEN" | "ADJUSTED" | "CLOSED";
  hasTransactions: boolean;
}

/**
 * Represents the status of a fiscal year including period information
 */
export interface FiscalYearStatusResult {
  fiscalYearId: number;
  fiscalYearCode: string;
  fiscalYearName: string;
  status: FiscalYearStatus;
  startDate: string;
  endDate: string;
  periods: PeriodStatus[];
  closeRequestId: string | null;
  closeRequestStatus: FiscalYearCloseStatus | null;
  canClose: boolean;
  cannotCloseReason: string | null;
}
