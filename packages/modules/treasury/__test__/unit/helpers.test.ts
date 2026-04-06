// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for treasury helpers.
 */

import { test } from "vitest";
import assert from "node:assert";
import { 
  toMinorUnits, 
  normalizeMoney, 
  isCashBankTypeName, 
  classifyCashBankAccount,
  validateDirectionByTransactionType
} from "../../src/helpers.ts";
import { CashBankValidationError } from "../../src/errors.ts";

test("toMinorUnits rounds correctly", () => {
  assert.strictEqual(toMinorUnits(10.005), 1001);
  assert.strictEqual(toMinorUnits(10.004), 1000);
  assert.strictEqual(toMinorUnits(10), 1000);
});

test("normalizeMoney returns clean decimal", () => {
  assert.strictEqual(normalizeMoney(10.005), 10.01);
  assert.strictEqual(normalizeMoney(10.004), 10);
  assert.strictEqual(normalizeMoney(10), 10);
});

test("isCashBankTypeName detects cash/bank accounts", () => {
  assert.strictEqual(isCashBankTypeName("Kas Kecil"), true);
  assert.strictEqual(isCashBankTypeName("Bank BCA"), true);
  assert.strictEqual(isCashBankTypeName("Cash on Hand"), true);
  assert.strictEqual(isCashBankTypeName("Accounts Receivable"), false);
  assert.strictEqual(isCashBankTypeName(null), false);
});

test("classifyCashBankAccount categorizes correctly", () => {
  assert.strictEqual(classifyCashBankAccount("Kas Kecil"), "CASH");
  assert.strictEqual(classifyCashBankAccount("Bank BCA"), "BANK");
  assert.strictEqual(classifyCashBankAccount("Cash on Hand"), "CASH");
  assert.strictEqual(classifyCashBankAccount("Bank and Cash"), null); // ambiguous
  assert.strictEqual(classifyCashBankAccount("Accounts Receivable"), null);
});

test("validateDirectionByTransactionType validates TOP_UP", () => {
  // Valid: cash to bank
  assert.doesNotThrow(() => {
    validateDirectionByTransactionType("TOP_UP", "Kas Kecil", "Bank BCA");
  });
  
  // Invalid: bank to cash
  assert.throws(() => {
    validateDirectionByTransactionType("TOP_UP", "Bank BCA", "Kas Kecil");
  }, CashBankValidationError);
});

test("validateDirectionByTransactionType validates WITHDRAWAL", () => {
  // Valid: bank to cash
  assert.doesNotThrow(() => {
    validateDirectionByTransactionType("WITHDRAWAL", "Bank BCA", "Kas Kecil");
  });
  
  // Invalid: cash to bank
  assert.throws(() => {
    validateDirectionByTransactionType("WITHDRAWAL", "Kas Kecil", "Bank BCA");
  }, CashBankValidationError);
});

test("validateDirectionByTransactionType allows any for MUTATION", () => {
  assert.doesNotThrow(() => {
    validateDirectionByTransactionType("MUTATION", "Bank BCA", "Kas Kecil");
    validateDirectionByTransactionType("MUTATION", "Kas Kecil", "Kas Besar");
    validateDirectionByTransactionType("MUTATION", "Bank BCA", "Kas Kecil");
  });
});

test("validateDirectionByTransactionType allows any for FOREX", () => {
  assert.doesNotThrow(() => {
    validateDirectionByTransactionType("FOREX", "Bank BCA", "Kas Kecil");
    validateDirectionByTransactionType("FOREX", "Kas Kecil", "Bank BCA");
  });
});
