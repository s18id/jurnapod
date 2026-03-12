// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { __cashBankTestables, CashBankValidationError } from "./cash-bank";

const { buildCashBankJournalLines, classifyCashBankAccount, validateDirectionByTransactionType } = __cashBankTestables;

function sums(lines: Array<{ debit: number; credit: number }>) {
  return lines.reduce(
    (acc, line) => ({
      debit: Number((acc.debit + line.debit).toFixed(2)),
      credit: Number((acc.credit + line.credit).toFixed(2))
    }),
    { debit: 0, credit: 0 }
  );
}

describe("cash-bank journal mapping", () => {
  test("balances for mutation-like types", () => {
    for (const type of ["MUTATION", "TOP_UP", "WITHDRAWAL"] as const) {
      const lines = buildCashBankJournalLines({
        transactionType: type,
        sourceAccountId: 10,
        destinationAccountId: 20,
        amount: 125.25,
        baseAmount: null,
        fxAccountId: null,
        referenceLabel: "CBT"
      });
      const total = sums(lines);
      assert.equal(total.debit, 125.25);
      assert.equal(total.credit, 125.25);
    }
  });

  test("FOREX diff > 0 credits fx account", () => {
    const lines = buildCashBankJournalLines({
      transactionType: "FOREX",
      sourceAccountId: 10,
      destinationAccountId: 20,
      amount: 100,
      baseAmount: 110,
      fxAccountId: 30,
      referenceLabel: "CBT"
    });
    const fxLine = lines.find((line) => line.account_id === 30);
    assert.ok(fxLine);
    assert.equal(fxLine?.debit, 0);
    assert.equal(fxLine?.credit, 10);
    const total = sums(lines);
    assert.equal(total.debit, total.credit);
  });

  test("FOREX diff < 0 debits fx account", () => {
    const lines = buildCashBankJournalLines({
      transactionType: "FOREX",
      sourceAccountId: 10,
      destinationAccountId: 20,
      amount: 120,
      baseAmount: 100,
      fxAccountId: 30,
      referenceLabel: "CBT"
    });
    const fxLine = lines.find((line) => line.account_id === 30);
    assert.ok(fxLine);
    assert.equal(fxLine?.debit, 20);
    assert.equal(fxLine?.credit, 0);
    const total = sums(lines);
    assert.equal(total.debit, total.credit);
  });

  test("rejects missing fx account when forex has diff", () => {
    assert.throws(
      () =>
        buildCashBankJournalLines({
          transactionType: "FOREX",
          sourceAccountId: 10,
          destinationAccountId: 20,
          amount: 100,
          baseAmount: 110,
          fxAccountId: null,
          referenceLabel: "CBT"
        }),
      CashBankValidationError
    );
  });
});

describe("cash-bank account classification", () => {
  test("classifies cash accounts", () => {
    assert.equal(classifyCashBankAccount("Cash"), "CASH");
    assert.equal(classifyCashBankAccount("CASH"), "CASH");
    assert.equal(classifyCashBankAccount("Kas"), "CASH");
    assert.equal(classifyCashBankAccount("KAS"), "CASH");
    assert.equal(classifyCashBankAccount("Kas Kecil"), "CASH");
  });

  test("classifies bank accounts", () => {
    assert.equal(classifyCashBankAccount("Bank"), "BANK");
    assert.equal(classifyCashBankAccount("BANK"), "BANK");
    assert.equal(classifyCashBankAccount("Bank Central Asia"), "BANK");
  });

  test("returns null for non-cash/bank accounts", () => {
    assert.equal(classifyCashBankAccount("Accounts Receivable"), null);
    assert.equal(classifyCashBankAccount("Revenue"), null);
    assert.equal(classifyCashBankAccount(null), null);
    assert.equal(classifyCashBankAccount(""), null);
  });

  test("returns null for ambiguous (contains both cash and bank)", () => {
    assert.equal(classifyCashBankAccount("Cash and Bank"), null);
  });
});

describe("cash-bank directional validation", () => {
  test("TOP_UP passes with cash source and bank destination", () => {
    validateDirectionByTransactionType("TOP_UP", "Cash", "Bank");
    validateDirectionByTransactionType("TOP_UP", "Kas", "Bank BCA");
  });

  test("TOP_UP throws when source is not cash", () => {
    assert.throws(
      () => validateDirectionByTransactionType("TOP_UP", "Bank", "Bank"),
      CashBankValidationError
    );
    assert.throws(
      () => validateDirectionByTransactionType("TOP_UP", "Revenue", "Bank"),
      CashBankValidationError
    );
  });

  test("TOP_UP throws when destination is not bank", () => {
    assert.throws(
      () => validateDirectionByTransactionType("TOP_UP", "Cash", "Cash"),
      CashBankValidationError
    );
    assert.throws(
      () => validateDirectionByTransactionType("TOP_UP", "Cash", "Revenue"),
      CashBankValidationError
    );
  });

  test("WITHDRAWAL passes with bank source and cash destination", () => {
    validateDirectionByTransactionType("WITHDRAWAL", "Bank", "Cash");
    validateDirectionByTransactionType("WITHDRAWAL", "Bank BCA", "Kas");
  });

  test("WITHDRAWAL throws when source is not bank", () => {
    assert.throws(
      () => validateDirectionByTransactionType("WITHDRAWAL", "Cash", "Cash"),
      CashBankValidationError
    );
  });

  test("WITHDRAWAL throws when destination is not cash", () => {
    assert.throws(
      () => validateDirectionByTransactionType("WITHDRAWAL", "Bank", "Bank"),
      CashBankValidationError
    );
  });

  test("MUTATION has no direction constraint", () => {
    validateDirectionByTransactionType("MUTATION", "Cash", "Bank");
    validateDirectionByTransactionType("MUTATION", "Bank", "Cash");
    validateDirectionByTransactionType("MUTATION", "Cash", "Cash");
    validateDirectionByTransactionType("MUTATION", "Bank", "Bank");
  });

  test("FOREX has no direction constraint", () => {
    validateDirectionByTransactionType("FOREX", "Cash", "Bank");
    validateDirectionByTransactionType("FOREX", "Bank", "Cash");
  });
});
