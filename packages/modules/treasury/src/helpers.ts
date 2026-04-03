// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Pure helper functions for cash-bank transactions.
 *
 * Extracted from apps/api/src/lib/cash-bank.ts (Story 25.2)
 * No external dependencies - these are pure utility functions.
 */

import type { CashBankType, AccountClass } from "./types.js";
import { CashBankValidationError } from "./errors.js";

const MONEY_SCALE = 100;

/**
 * Convert a decimal money value to minor units (cents).
 * E.g., 100.50 -> 10050
 */
export function toMinorUnits(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

/**
 * Normalize a money value by converting to minor units and back.
 * Ensures consistent precision.
 */
export function normalizeMoney(value: number): number {
  return toMinorUnits(value) / MONEY_SCALE;
}

/**
 * Check if a type name indicates a cash or bank account.
 */
export function isCashBankTypeName(typeName: string | null): boolean {
  const value = (typeName ?? "").toLowerCase();
  return value.includes("kas") || value.includes("cash") || value.includes("bank");
}

/**
 * Classify an account as CASH or BANK based on its type name.
 * Returns null if the account cannot be classified as either.
 */
export function classifyCashBankAccount(typeName: string | null): AccountClass | null {
  const value = (typeName ?? "").toLowerCase();
  const hasCash = value.includes("kas") || value.includes("cash");
  const hasBank = value.includes("bank");

  if (hasCash && !hasBank) {
    return "CASH";
  }
  if (hasBank && !hasCash) {
    return "BANK";
  }

  return null;
}

/**
 * Validate that source and destination accounts match the transaction type requirements.
 * - TOP_UP: source must be CASH, destination must be BANK
 * - WITHDRAWAL: source must be BANK, destination must be CASH
 * - MUTATION/FOREX: no direction restrictions
 *
 * @throws CashBankValidationError if direction requirements are not met
 */
export function validateDirectionByTransactionType(
  transactionType: CashBankType,
  sourceTypeName: string | null,
  destinationTypeName: string | null
): void {
  if (transactionType === "TOP_UP") {
    const sourceClass = classifyCashBankAccount(sourceTypeName);
    const destClass = classifyCashBankAccount(destinationTypeName);
    if (sourceClass !== "CASH" || destClass !== "BANK") {
      throw new CashBankValidationError("TOP_UP requires source cash and destination bank accounts");
    }
  } else if (transactionType === "WITHDRAWAL") {
    const sourceClass = classifyCashBankAccount(sourceTypeName);
    const destClass = classifyCashBankAccount(destinationTypeName);
    if (sourceClass !== "BANK" || destClass !== "CASH") {
      throw new CashBankValidationError("WITHDRAWAL requires source bank and destination cash accounts");
    }
  }
}
