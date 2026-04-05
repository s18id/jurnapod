// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Core types for SubledgerBalanceProvider reconciliation infrastructure.
 *
 * Canonical sign rule: debit = positive, credit = negative
 */

/**
 * Branded type for signed amounts following debit-positive convention.
 * Use this type to clearly distinguish raw numeric amounts from signed values.
 */
export type SignedAmount = number & { readonly __brand: "SignedAmount_DebitPositive" };

/**
 * Breakdown of debit and credit components.
 * Both components are always >= 0; sign is encoded in signedNetAmount.
 */
export interface SignedAmountBreakdown {
  /** Sum of all debit amounts (always >= 0) */
  debitAmount: number;
  /** Sum of all credit amounts (always >= 0) */
  creditAmount: number;
  /** Net signed amount: debitAmount - creditAmount (debit-positive) */
  signedNetAmount: SignedAmount;
}

/**
 * Source types for reconciliation drilldown lines.
 */
export type ReconciliationSourceType =
  | "JOURNAL_ENTRY"   // From journal_batches
  | "JOURNAL_LINE"    // From journal_lines
  | "SUBLEDGER_TX"    // Direct subledger transaction (e.g., bank tx without GL)
  | "ADJUSTMENT"      // Manual adjustment
  | "OPENING_BALANCE"; // Opening balance entry

/**
 * Individual line in a reconciliation drilldown.
 */
export interface ReconciliationDrilldownLine {
  sourceType: ReconciliationSourceType;
  sourceId: string;
  postedAtEpochMs: number;
  description?: string;
  /** Always >= 0 */
  debitAmount: number;
  /** Always >= 0 */
  creditAmount: number;
  /** Signed impact: debit - credit (debit-positive) */
  signedImpact: SignedAmount;
  /** Running balance after this line (optional) */
  runningSignedBalance?: SignedAmount;
  /** Optional dimensional breakdown (outlet_id, account_id, etc.) */
  dimensions?: Readonly<Record<string, string | number>>;
}

/**
 * Full drilldown result for a subledger reconciliation period.
 */
export interface ReconciliationDrilldown {
  subledgerType: SubledgerTypeCode;
  accountId?: number;
  periodStartEpochMs: number;
  periodEndEpochMs: number;
  openingSignedBalance: SignedAmount;
  movementsSignedNet: SignedAmount;
  closingSignedBalance: SignedAmount;
  lines: readonly ReconciliationDrilldownLine[];
}

/**
 * Standard subledger types.
 */
export enum SubledgerType {
  CASH = "CASH",
  INVENTORY = "INVENTORY",
  RECEIVABLES = "RECEIVABLES",
  PAYABLES = "PAYABLES",
}

/**
 * Subledger type code - either a standard type or a custom one.
 */
export type SubledgerTypeCode = SubledgerType | `CUSTOM:${string}`;

/**
 * Query parameters for subledger balance retrieval.
 */
export interface SubledgerBalanceQuery {
  companyId: number;
  outletId?: number;
  /** Point-in-time balance as of this epoch ms */
  asOfEpochMs: number;
  /** Optional fiscal year filter */
  fiscalYearId?: number;
  /** Optional period filter (takes precedence over date range if both provided) */
  periodId?: number;
  /** Optional specific account (if omitted, aggregates all accounts of this subledger type) */
  accountId?: number;
  /** Include detailed drilldown (default: false) */
  includeDrilldown?: boolean;
  /** Limit drilldown lines (default: 1000) */
  drilldownLimit?: number;
}

/**
 * Result of subledger balance query.
 */
export interface SubledgerBalanceResult {
  companyId: number;
  outletId?: number;
  subledgerType: SubledgerTypeCode;
  asOfEpochMs: number;
  accountId?: number;
  signedBalance: SignedAmount;
  breakdown: SignedAmountBreakdown;
  /** Sync version for cache invalidation */
  dataVersion?: number;
  /** Detailed drilldown (only present if includeDrilldown=true) */
  drilldown?: ReconciliationDrilldown;
}

/**
 * Interface for subledger balance providers.
 * Each provider handles a specific subledger type (CASH, INVENTORY, etc.).
 */
export interface SubledgerBalanceProvider {
  /** The subledger type this provider handles */
  readonly subledgerType: SubledgerTypeCode;

  /**
   * Get the balance for this subledger.
   * @throws Error if provider is not ready (e.g., missing configuration)
   */
  getBalance(query: SubledgerBalanceQuery): Promise<SubledgerBalanceResult>;

  /**
   * Optional readiness check.
   * Implement if the provider needs to validate dependencies before use.
   */
  checkReadiness?(): Promise<void>;
}
