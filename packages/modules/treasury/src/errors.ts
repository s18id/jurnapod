// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Error classes for cash-bank transactions.
 *
 * Extracted from apps/api/src/lib/cash-bank.ts (Story 25.2)
 */

export class CashBankValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashBankValidationError";
  }
}

export class CashBankStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashBankStatusError";
  }
}

export class CashBankNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashBankNotFoundError";
  }
}

export class CashBankForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashBankForbiddenError";
  }
}
