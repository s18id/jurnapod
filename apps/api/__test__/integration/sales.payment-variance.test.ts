// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Unit tests for payment variance functionality
// Run with: node --test --import tsx apps/api/src/lib/sales.payment-variance.test.ts

import assert from "node:assert/strict";
import {test, describe, afterAll} from 'vitest';
import { ACCOUNT_MAPPING_TYPE_ID_BY_CODE } from "@jurnapod/shared";
import {
  __salesPostingTestables,
  PAYMENT_VARIANCE_GAIN_MISSING_MESSAGE,
  PAYMENT_VARIANCE_LOSS_MISSING_MESSAGE
} from "../../src/lib/sales-posting";
import { closeDbPool, getDb } from "../../src/lib/db";
import { createCompanyBasic } from "../../src/lib/companies";

const { readCompanyPaymentVarianceAccounts, PaymentVarianceConfigError } = __salesPostingTestables;
const createdCompanyIds: number[] = [];

async function setupVarianceFixture(options: {
  withGain?: boolean;
  withLoss?: boolean;
  gainMappingKey?: string;
  lossMappingKey?: string;
  gainAccountId?: number | null;
  lossAccountId?: number | null;
}): Promise<{ companyId: number }> {
  const db = getDb();
  const runId = Date.now().toString(36);
  const company = await createCompanyBasic({
    code: `PV-${runId}`,
    name: `Payment Variance ${runId}`
  });
  createdCompanyIds.push(company.id);

  const gainAccountId = options.gainAccountId === undefined
    ? Number((await db.insertInto("accounts").values({
      company_id: company.id,
      code: `GAIN-${runId}`,
      name: `Gain ${runId}`
    }).executeTakeFirst()).insertId)
    : options.gainAccountId;

  const lossAccountId = options.lossAccountId === undefined
    ? Number((await db.insertInto("accounts").values({
      company_id: company.id,
      code: `LOSS-${runId}`,
      name: `Loss ${runId}`
    }).executeTakeFirst()).insertId)
    : options.lossAccountId;

  if (options.withGain) {
    await db.insertInto("account_mappings").values({
      company_id: company.id,
      outlet_id: null,
      mapping_type_id: ACCOUNT_MAPPING_TYPE_ID_BY_CODE.PAYMENT_VARIANCE_GAIN,
      mapping_key: options.gainMappingKey ?? "PAYMENT_VARIANCE_GAIN",
      account_id: Number(gainAccountId)
    }).execute();
  }

  if (options.withLoss) {
    await db.insertInto("account_mappings").values({
      company_id: company.id,
      outlet_id: null,
      mapping_type_id: ACCOUNT_MAPPING_TYPE_ID_BY_CODE.PAYMENT_VARIANCE_LOSS,
      mapping_key: options.lossMappingKey ?? "PAYMENT_VARIANCE_LOSS",
      account_id: Number(lossAccountId)
    }).execute();
  }

  return { companyId: company.id };
}

afterAll(async () => {
  const db = getDb();
  for (const companyId of createdCompanyIds) {
    await db.deleteFrom("account_mappings").where("company_id", "=", companyId).execute();
    await db.deleteFrom("accounts").where("company_id", "=", companyId).execute();
    await db.deleteFrom("companies").where("id", "=", companyId).execute();
  }
  await closeDbPool();
});

describe("readCompanyPaymentVarianceAccounts", () => {
  test("supports id-based mapping type resolution", async () => {
    const { companyId } = await setupVarianceFixture({
      withGain: true,
      withLoss: true,
      gainMappingKey: "UNUSED_GAIN_KEY",
      lossMappingKey: "UNUSED_LOSS_KEY"
    });

    const result = await readCompanyPaymentVarianceAccounts(getDb(), companyId);
    assert.ok(result.gain !== null);
    assert.ok(result.loss !== null);
  });

  test("returns both gain and loss accounts when configured", async () => {
    const { companyId } = await setupVarianceFixture({
      withGain: true,
      withLoss: true
    });

    const result = await readCompanyPaymentVarianceAccounts(getDb(), companyId);
    assert.ok(result.gain !== null);
    assert.ok(result.loss !== null);
  });

  test("returns null for gain when not configured", async () => {
    const { companyId } = await setupVarianceFixture({
      withGain: false,
      withLoss: true
    });

    const result = await readCompanyPaymentVarianceAccounts(getDb(), companyId);
    assert.equal(result.gain, null);
    assert.ok(result.loss !== null);
  });

  test("returns null for loss when not configured", async () => {
    const { companyId } = await setupVarianceFixture({
      withGain: true,
      withLoss: false
    });

    const result = await readCompanyPaymentVarianceAccounts(getDb(), companyId);
    assert.ok(result.gain !== null);
    assert.equal(result.loss, null);
  });

  test("returns null for both when not configured", async () => {
    const { companyId } = await setupVarianceFixture({
      withGain: false,
      withLoss: false
    });

    const result = await readCompanyPaymentVarianceAccounts(getDb(), companyId);
    assert.equal(result.gain, null);
    assert.equal(result.loss, null);
  });

  test("mapping_type_id takes precedence over invalid mapping_key", async () => {
    const { companyId } = await setupVarianceFixture({
      withGain: true,
      withLoss: false,
      gainMappingKey: "INVALID_GAIN_KEY"
    });

    const result = await readCompanyPaymentVarianceAccounts(getDb(), companyId);
    assert.ok(result.gain !== null);
    assert.equal(result.loss, null);
  });
});

describe("PaymentVarianceConfigError", () => {
  test("creates error with gain message", () => {
    const error = new PaymentVarianceConfigError(PAYMENT_VARIANCE_GAIN_MISSING_MESSAGE);
    assert.equal(error.message, PAYMENT_VARIANCE_GAIN_MISSING_MESSAGE);
    assert.equal(error.name, "PaymentVarianceConfigError");
  });

  test("creates error with loss message", () => {
    const error = new PaymentVarianceConfigError(PAYMENT_VARIANCE_LOSS_MISSING_MESSAGE);
    assert.equal(error.message, PAYMENT_VARIANCE_LOSS_MISSING_MESSAGE);
    assert.equal(error.name, "PaymentVarianceConfigError");
  });
});

describe("Payment variance calculation logic", () => {
  test("exact settlement produces zero variance", () => {
    const paymentAmount = 1000000;
    const outstanding = 1000000;
    const invoiceAmountApplied = Math.min(paymentAmount, outstanding);
    const delta = paymentAmount - invoiceAmountApplied;
    
    assert.equal(invoiceAmountApplied, 1000000);
    assert.equal(delta, 0);
  });

  test("overpayment produces positive variance (gain)", () => {
    const paymentAmount = 1050000;
    const outstanding = 1000000;
    const invoiceAmountApplied = Math.min(paymentAmount, outstanding);
    const delta = paymentAmount - invoiceAmountApplied;
    
    assert.equal(invoiceAmountApplied, 1000000);
    assert.equal(delta, 50000);
  });

  test("underpayment produces zero variance (partial settlement)", () => {
    const paymentAmount = 950000;
    const outstanding = 1000000;
    const invoiceAmountApplied = Math.min(paymentAmount, outstanding);
    const delta = paymentAmount - invoiceAmountApplied;
    
    assert.equal(invoiceAmountApplied, 950000);
    assert.equal(delta, 0); // delta is 0 because we cap at outstanding
  });

  test("partial payment produces no variance (delta stays 0)", () => {
    const paymentAmount = 500000;
    const outstanding = 1000000;
    const invoiceAmountApplied = Math.min(paymentAmount, outstanding);
    const delta = paymentAmount - invoiceAmountApplied;
    
    assert.equal(invoiceAmountApplied, 500000);
    assert.equal(delta, 0);
  });

  test("newPaidTotal calculation for exact payment", () => {
    const grandTotal = 1000000;
    const paidTotal = 0;
    const invoiceAmountApplied = 1000000;
    const newPaidTotal = Math.min(grandTotal, paidTotal + invoiceAmountApplied);
    const newPaymentStatus = newPaidTotal >= grandTotal ? "PAID" : newPaidTotal > 0 ? "PARTIAL" : "UNPAID";
    
    assert.equal(newPaidTotal, 1000000);
    assert.equal(newPaymentStatus, "PAID");
  });

  test("newPaidTotal calculation for partial payment", () => {
    const grandTotal = 1000000;
    const paidTotal = 0;
    const invoiceAmountApplied = 500000;
    const newPaidTotal = Math.min(grandTotal, paidTotal + invoiceAmountApplied);
    const newPaymentStatus = newPaidTotal >= grandTotal ? "PAID" : newPaidTotal > 0 ? "PARTIAL" : "UNPAID";
    
    assert.equal(newPaidTotal, 500000);
    assert.equal(newPaymentStatus, "PARTIAL");
  });

  test("newPaidTotal calculation for overpayment (capped)", () => {
    const grandTotal = 1000000;
    const paidTotal = 0;
    const invoiceAmountApplied = 1000000; // even with overpayment, we only apply up to outstanding
    const newPaidTotal = Math.min(grandTotal, paidTotal + invoiceAmountApplied);
    const newPaymentStatus = newPaidTotal >= grandTotal ? "PAID" : newPaidTotal > 0 ? "PARTIAL" : "UNPAID";
    
    assert.equal(newPaidTotal, 1000000);
    assert.equal(newPaymentStatus, "PAID");
  });
});

describe("Multi-payment sequence variance calculation", () => {
  test("partial payment followed by exact payment produces zero total variance", () => {
    // First payment: partial
    const invoiceGrandTotal = 1000000;
    let paidTotal = 0;
    
    const payment1Amount = 400000;
    const outstanding1 = invoiceGrandTotal - paidTotal;
    const invoiceAmountApplied1 = Math.min(payment1Amount, outstanding1);
    const delta1 = payment1Amount - invoiceAmountApplied1;
    
    assert.equal(invoiceAmountApplied1, 400000);
    assert.equal(delta1, 0);
    
    paidTotal += invoiceAmountApplied1;
    
    // Second payment: exact remaining
    const payment2Amount = 600000;
    const outstanding2 = invoiceGrandTotal - paidTotal;
    const invoiceAmountApplied2 = Math.min(payment2Amount, outstanding2);
    const delta2 = payment2Amount - invoiceAmountApplied2;
    
    assert.equal(invoiceAmountApplied2, 600000);
    assert.equal(delta2, 0);
  });

  test("partial payment followed by overpayment produces gain only on final payment", () => {
    const invoiceGrandTotal = 1000000;
    let paidTotal = 0;
    
    // First payment: partial
    const payment1Amount = 400000;
    const outstanding1 = invoiceGrandTotal - paidTotal;
    const invoiceAmountApplied1 = Math.min(payment1Amount, outstanding1);
    const delta1 = payment1Amount - invoiceAmountApplied1;
    
    assert.equal(invoiceAmountApplied1, 400000);
    assert.equal(delta1, 0); // partial payment - no variance
    
    paidTotal += invoiceAmountApplied1;
    
    // Second payment: overpayment
    const payment2Amount = 650000;
    const outstanding2 = invoiceGrandTotal - paidTotal;
    const invoiceAmountApplied2 = Math.min(payment2Amount, outstanding2);
    const delta2 = payment2Amount - invoiceAmountApplied2;
    
    assert.equal(invoiceAmountApplied2, 600000); // capped at outstanding
    assert.equal(delta2, 50000); // gain!
  });

  test("multiple partial payments then final exact payment - no variance", () => {
    const invoiceGrandTotal = 1000000;
    let paidTotal = 0;
    
    // Payment 1: 250000
    paidTotal += Math.min(250000, invoiceGrandTotal - paidTotal);
    // Payment 2: 300000
    paidTotal += Math.min(300000, invoiceGrandTotal - paidTotal);
    // Payment 3: 450000 (exact remaining)
    const payment3Amount = 450000;
    const outstanding3 = invoiceGrandTotal - paidTotal;
    const invoiceAmountApplied3 = Math.min(payment3Amount, outstanding3);
    const delta3 = payment3Amount - invoiceAmountApplied3;
    
    assert.equal(paidTotal, 550000);
    assert.equal(invoiceAmountApplied3, 450000);
    assert.equal(delta3, 0);
  });
});

describe("Rounding boundary tests", () => {
  test("0.01 IDR overpayment produces 0.01 gain", () => {
    const paymentAmount = 1000000.01;
    const outstanding = 1000000;
    const invoiceAmountApplied = Math.min(paymentAmount, outstanding);
    const delta = paymentAmount - invoiceAmountApplied;
    
    assert.equal(invoiceAmountApplied, 1000000);
    // Use minor units for exact comparison
    assert.equal(Math.round(delta * 100), 1);
  });

  test("0.01 IDR underpayment (partial) produces zero variance", () => {
    const paymentAmount = 999999.99;
    const outstanding = 1000000;
    const invoiceAmountApplied = Math.min(paymentAmount, outstanding);
    const delta = paymentAmount - invoiceAmountApplied;
    
    assert.equal(invoiceAmountApplied, 999999.99);
    assert.equal(delta, 0); // capped by min
  });

  test("exact amount with decimal places", () => {
    const paymentAmount = 1234567.89;
    const outstanding = 1234567.89;
    const invoiceAmountApplied = Math.min(paymentAmount, outstanding);
    const delta = paymentAmount - invoiceAmountApplied;
    
    assert.equal(invoiceAmountApplied, 1234567.89);
    assert.equal(delta, 0);
  });
});
