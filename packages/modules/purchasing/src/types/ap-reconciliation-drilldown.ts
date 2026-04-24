// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Reconciliation Drilldown types for purchasing module.
 */

import type { DrilldownCategory } from "@jurnapod/shared";

export interface GLDetailLine {
  journalLineId: number;
  journalBatchId: number;
  journalNumber: string;
  effectiveDate: string;
  description: string;
  accountId: number;
  accountCode: string;
  accountName: string;
  debit: string | null;
  credit: string | null;
  sourceType: string | null;
  sourceId: number | null;
  postedAt: string;
}

export interface APDetailLine {
  id: number;
  type: "purchase_invoice" | "purchase_credit" | "ap_payment";
  reference: string;
  date: string;
  dueDate: string | null;
  supplierId: number | null;
  supplierName: string | null;
  currencyCode: string;
  originalAmount: string;
  baseAmount: string;
  openAmount: string;
  status: string;
  matched: boolean;
  glJournalLineId: number | null;
}

export interface DrilldownLineItem {
  id: string;
  category: DrilldownCategory;
  apTransactionId: number | null;
  apTransactionType: "purchase_invoice" | "ap_payment" | "purchase_credit" | null;
  apTransactionRef: string | null;
  apDate: string | null;
  apAmountOriginal: string | null;
  apAmountBase: string | null;
  apCurrency: string | null;
  glJournalLineId: number | null;
  glJournalNumber: string | null;
  glEffectiveDate: string | null;
  glDescription: string | null;
  glAmount: string | null;
  glDebitCredit: "debit" | "credit" | null;
  matched: boolean;
  matchId: string | null;
  difference: string;
  suggestedAction: string | null;
}

export interface DrilldownCategorySummary {
  category: DrilldownCategory;
  totalDifference: string;
  itemCount: number;
  items: DrilldownLineItem[];
}

export interface GLDetailResult {
  lines: GLDetailLine[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}

export interface APDetailResult {
  lines: APDetailLine[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  totalOpenBase: string;
}

export interface DrilldownResult {
  asOfDate: string;
  configuredAccountIds: number[];
  currency: string;
  apSubledgerBalance: string;
  glControlBalance: string;
  variance: string;
  categories: DrilldownCategorySummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface GetGLDetailParams {
  companyId: number;
  accountIds: number[];
  asOfDate: string;
  timezone: string;
  cursor?: string;
  limit?: number;
}

export interface GetAPDetailParams {
  companyId: number;
  asOfDate: string;
  cursor?: string;
  limit?: number;
}

export interface GetAPReconciliationDrilldownParams {
  companyId: number;
  asOfDate: string;
  cursor?: string;
  limit?: number;
}

export interface BuildDrilldownAttributionParams {
  glLines: GLDetailLine[];
  apLines: APDetailLine[];
  tolerance?: bigint;
}

export interface GenerateDrilldownCSVParams {
  drilldown: DrilldownResult;
}
