// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for journal builder.
 */

import { test } from "vitest";
import assert from "node:assert";
import { buildCashBankJournalLines, type BuildJournalLinesInput } from "../../src/journal-builder.ts";
import { CashBankValidationError } from "../../src/errors.ts";

const baseInput: BuildJournalLinesInput = {
  transactionType: "MUTATION",
  sourceAccountId: 1,
  destinationAccountId: 2,
  amount: 1000,
  baseAmount: null,
  fxAccountId: null,
  referenceLabel: "Test"
};

test("buildCashBankJournalLines rejects non-positive amount", () => {
  assert.throws(() => {
    buildCashBankJournalLines({ ...baseInput, amount: 0 });
  }, CashBankValidationError);
  
  assert.throws(() => {
    buildCashBankJournalLines({ ...baseInput, amount: -100 });
  }, CashBankValidationError);
});

test("buildCashBankJournalLines creates balanced lines for MUTATION", () => {
  const lines = buildCashBankJournalLines({ ...baseInput, transactionType: "MUTATION" });
  
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0].account_id, 2); // destination
  assert.strictEqual(lines[0].debit, 1000);
  assert.strictEqual(lines[0].credit, 0);
  assert.strictEqual(lines[1].account_id, 1); // source
  assert.strictEqual(lines[1].debit, 0);
  assert.strictEqual(lines[1].credit, 1000);
  
  // Verify balance
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  assert.strictEqual(totalDebit, totalCredit);
});

test("buildCashBankJournalLines creates balanced lines for TOP_UP", () => {
  const lines = buildCashBankJournalLines({ ...baseInput, transactionType: "TOP_UP" });
  
  assert.strictEqual(lines.length, 2);
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  assert.strictEqual(totalDebit, totalCredit);
});

test("buildCashBankJournalLines creates balanced lines for WITHDRAWAL", () => {
  const lines = buildCashBankJournalLines({ ...baseInput, transactionType: "WITHDRAWAL" });
  
  assert.strictEqual(lines.length, 2);
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  assert.strictEqual(totalDebit, totalCredit);
});

test("buildCashBankJournalLines creates 2 lines for FOREX with no gain/loss", () => {
  const lines = buildCashBankJournalLines({
    ...baseInput,
    transactionType: "FOREX",
    amount: 1000,
    baseAmount: 1000, // no difference
    fxAccountId: 3
  });
  
  assert.strictEqual(lines.length, 2);
});

test("buildCashBankJournalLines creates 3 lines for FOREX with gain", () => {
  const lines = buildCashBankJournalLines({
    ...baseInput,
    transactionType: "FOREX",
    amount: 1000,
    baseAmount: 1100, // 100 gain
    fxAccountId: 3
  });
  
  assert.strictEqual(lines.length, 3);
  // Destination gets base amount
  assert.strictEqual(lines[0].debit, 1100);
  // Source gives original amount
  assert.strictEqual(lines[1].credit, 1000);
  // FX account gets gain (credit)
  assert.strictEqual(lines[2].account_id, 3);
  assert.strictEqual(lines[2].credit, 100);
  assert.strictEqual(lines[2].debit, 0);
});

test("buildCashBankJournalLines creates 3 lines for FOREX with loss", () => {
  const lines = buildCashBankJournalLines({
    ...baseInput,
    transactionType: "FOREX",
    amount: 1000,
    baseAmount: 900, // 100 loss
    fxAccountId: 3
  });
  
  assert.strictEqual(lines.length, 3);
  // FX account gets loss (debit)
  assert.strictEqual(lines[2].account_id, 3);
  assert.strictEqual(lines[2].debit, 100);
  assert.strictEqual(lines[2].credit, 0);
});

test("buildCashBankJournalLines rejects FOREX with gain/loss but no fx_account_id", () => {
  assert.throws(() => {
    buildCashBankJournalLines({
      ...baseInput,
      transactionType: "FOREX",
      amount: 1000,
      baseAmount: 1100, // would have gain
      fxAccountId: null
    });
  }, CashBankValidationError);
});

test("buildCashBankJournalLines always produces balanced journals", () => {
  const testCases: BuildJournalLinesInput[] = [
    { ...baseInput, transactionType: "MUTATION", amount: 100.01 },
    { ...baseInput, transactionType: "TOP_UP", amount: 999.99 },
    { ...baseInput, transactionType: "FOREX", amount: 1000, baseAmount: 1050.50, fxAccountId: 3 },
    { ...baseInput, transactionType: "FOREX", amount: 1000, baseAmount: 949.50, fxAccountId: 3 },
  ];
  
  for (const testCase of testCases) {
    const lines = buildCashBankJournalLines(testCase);
    const totalDebit = lines.reduce((sum, l) => sum + l.debit * 100, 0); // use minor units
    const totalCredit = lines.reduce((sum, l) => sum + l.credit * 100, 0);
    assert.strictEqual(totalDebit, totalCredit, 
      `Unbalanced journal for ${testCase.transactionType}`);
  }
});
