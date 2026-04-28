// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * SubledgerBalanceProvider interface and canonical sign convention helpers.
 *
 * Canonical sign rule: debit = positive, credit = negative
 *
 * This module provides:
 * - The SubledgerBalanceProvider interface
 * - Helper functions for working with SignedAmount (debit-positive)
 */

// Re-export types and values from types.js
export * from "./types.js";

import type {
  SignedAmount,
  SignedAmountBreakdown,
  SignedAmount as SignedAmountType,
  ReconciliationDrilldownLine,
} from "./types.js";

/**
 * Create a SignedAmount from a numeric value.
 * Use this constructor to ensure type safety for signed amounts.
 *
 * @param value - The numeric value (positive for debit, negative for credit)
 * @returns SignedAmount with debit-positive convention
 */
export function makeSignedAmount(value: number): SignedAmount {
  return value as SignedAmount;
}

/**
 * Convert debit/credit components to a signed net amount.
 * Debit amounts are positive, credit amounts are negative.
 *
 * @param debitAmount - Sum of debit amounts (>= 0)
 * @param creditAmount - Sum of credit amounts (>= 0)
 * @returns SignedAmountBreakdown with debit-positive net
 */
export function toSignedAmountBreakdown(
  debitAmount: number,
  creditAmount: number
): SignedAmountBreakdown {
  const signedNet = (debitAmount - creditAmount) as SignedAmount;
  return {
    debitAmount: Math.max(0, debitAmount),
    creditAmount: Math.max(0, creditAmount),
    signedNetAmount: signedNet,
  };
}

/**
 * Convert a raw numeric amount to a SignedAmount with debit-positive convention.
 *
 * @param amount - Raw amount (positive = debit, negative = credit)
 * @returns SignedAmount
 */
export function toSignedAmount(amount: number): SignedAmount {
  return amount as SignedAmount;
}

/**
 * Extract the numeric value from a SignedAmount.
 * Use when you need the raw number for calculations.
 */
export function fromSignedAmount(sa: SignedAmount): number {
  return sa as number;
}

/**
 * Add two signed amounts.
 * Both must follow debit-positive convention.
 */
export function addSignedAmounts(a: SignedAmount, b: SignedAmount): SignedAmount {
  return (fromSignedAmount(a) + fromSignedAmount(b)) as SignedAmount;
}

/**
 * Negate a signed amount (flip debit to credit and vice versa).
 */
export function negateSignedAmount(a: SignedAmount): SignedAmount {
  return (-fromSignedAmount(a)) as SignedAmount;
}

/**
 * Create a drilldown line from a journal line.
 * Maps journal_lines to ReconciliationDrilldownLine format.
 */
export function mapJournalLineToDrilldown(
  journalLine: {
    id: number;
    account_id: number;
    debit: number;
    credit: number;
    description: string;
    line_date: Date;
    outlet_id: number | null;
  },
  accountId?: number
): ReconciliationDrilldownLine {
  const debitAmount = Number(journalLine.debit) || 0;
  const creditAmount = Number(journalLine.credit) || 0;
  const signedImpact = (debitAmount - creditAmount) as SignedAmount;

  return {
    sourceType: "JOURNAL_LINE",
    sourceId: String(journalLine.id),
    postedAtEpochMs: journalLine.line_date.getTime(),
    description: journalLine.description,
    debitAmount,
    creditAmount,
    signedImpact,
    dimensions: accountId !== undefined
      ? Object.freeze({ account_id: accountId, ...(journalLine.outlet_id != null && { outlet_id: journalLine.outlet_id }) })
      : Object.freeze({ ...(journalLine.outlet_id != null && { outlet_id: journalLine.outlet_id }) }),
  };
}

/**
 * Create a zero-value SignedAmountBreakdown.
 * Useful for initialization or when no transactions exist.
 */
export function zeroBreakdown(): SignedAmountBreakdown {
  return {
    debitAmount: 0,
    creditAmount: 0,
    signedNetAmount: makeSignedAmount(0),
  };
}

/**
 * Create a zero-value SignedAmount.
 */
export function zeroSignedAmount(): SignedAmount {
  return makeSignedAmount(0);
}
