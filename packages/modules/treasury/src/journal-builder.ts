// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Journal line builder for cash-bank transactions.
 *
 * Extracted from apps/api/src/lib/cash-bank.ts buildCashBankJournalLines (Story 25.3)
 * No external dependencies - pure function that generates balanced journal lines.
 */

import type { JournalLine } from "@jurnapod/shared";
import type { CashBankType } from "./types.js";
import { normalizeMoney, toMinorUnits } from "./helpers.js";
import { CashBankValidationError } from "./errors.js";

/**
 * Input for building cash-bank journal lines.
 */
export interface BuildJournalLinesInput {
  transactionType: CashBankType;
  sourceAccountId: number;
  destinationAccountId: number;
  amount: number;
  baseAmount: number | null;
  fxAccountId: number | null;
  referenceLabel: string;
}

/**
 * Build journal lines for a cash-bank transaction.
 *
 * For MUTATION, TOP_UP, WITHDRAWAL: creates simple debit/credit pair.
 * For FOREX: calculates gain/loss and adds third line to fx account.
 *
 * @throws CashBankValidationError if amount is not positive or journal is unbalanced
 */
export function buildCashBankJournalLines(input: BuildJournalLinesInput): JournalLine[] {
  if (input.amount <= 0) {
    throw new CashBankValidationError("amount must be positive");
  }

  if (input.transactionType !== "FOREX") {
    return [
      {
        account_id: input.destinationAccountId,
        debit: normalizeMoney(input.amount),
        credit: 0,
        description: `${input.referenceLabel} debit destination`
      },
      {
        account_id: input.sourceAccountId,
        debit: 0,
        credit: normalizeMoney(input.amount),
        description: `${input.referenceLabel} credit source`
      }
    ];
  }

  const forexBaseAmount = input.baseAmount ?? normalizeMoney(input.amount);
  const diff = normalizeMoney(forexBaseAmount - input.amount);
  const lines: JournalLine[] = [
    {
      account_id: input.destinationAccountId,
      debit: normalizeMoney(forexBaseAmount),
      credit: 0,
      description: `${input.referenceLabel} debit destination`
    },
    {
      account_id: input.sourceAccountId,
      debit: 0,
      credit: normalizeMoney(input.amount),
      description: `${input.referenceLabel} credit source`
    }
  ];

  if (diff !== 0) {
    if (!input.fxAccountId) {
      throw new CashBankValidationError("fx_account_id is required when FOREX has gain/loss");
    }

    if (diff > 0) {
      lines.push({
        account_id: input.fxAccountId,
        debit: 0,
        credit: normalizeMoney(diff),
        description: `${input.referenceLabel} forex gain`
      });
    } else {
      lines.push({
        account_id: input.fxAccountId,
        debit: normalizeMoney(Math.abs(diff)),
        credit: 0,
        description: `${input.referenceLabel} forex loss`
      });
    }
  }

  // Validate balance
  const debitMinor = lines.reduce((sum, line) => sum + toMinorUnits(line.debit), 0);
  const creditMinor = lines.reduce((sum, line) => sum + toMinorUnits(line.credit), 0);
  if (debitMinor !== creditMinor) {
    throw new CashBankValidationError("Cash/bank journal lines are not balanced");
  }

  return lines;
}
