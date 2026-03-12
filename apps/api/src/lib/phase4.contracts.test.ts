// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Phase 4 contract regression tests: verify shared schemas stay aligned with implementation
// Run with: node --test --import tsx apps/api/src/lib/phase4.contracts.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  TaxRateSchema,
  TaxRateCreateRequestSchema,
  CashBankTransactionSchema,
  CashBankTransactionCreateRequestSchema,
  SalesPaymentSchema,
  SalesPaymentCreateRequestSchema,
  SalesPaymentUpdateRequestSchema
} from "@jurnapod/shared";

describe("Phase 4 contracts: TaxRateSchema", () => {
  test("accepts account_id as null (decoupled tax liability)", () => {
    const input = {
      id: 1,
      company_id: 10,
      code: "VAT",
      name: "Value Added Tax",
      rate_percent: 10,
      account_id: null,
      is_inclusive: false,
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z"
    };
    const parsed = TaxRateSchema.parse(input);
    assert.equal(parsed.account_id, null);
  });

  test("accepts account_id as positive numeric id", () => {
    const input = {
      id: 2,
      company_id: 10,
      code: "VAT_INCL",
      name: "VAT Inclusive",
      rate_percent: 11,
      account_id: 42,
      is_inclusive: true,
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z"
    };
    const parsed = TaxRateSchema.parse(input);
    assert.equal(parsed.account_id, 42);
  });

  test("rejects negative account_id", () => {
    assert.throws(() => {
      TaxRateSchema.parse({
        id: 3,
        company_id: 10,
        code: "BAD",
        name: "Bad Tax",
        rate_percent: 5,
        account_id: -1,
        is_inclusive: false,
        is_active: true,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z"
      });
    });
  });
});

describe("Phase 4 contracts: TaxRateCreateRequestSchema", () => {
  test("accepts optional account_id (nullable)", () => {
    const withNull = TaxRateCreateRequestSchema.parse({
      code: "VAT1",
      name: "VAT One",
      rate_percent: 10,
      account_id: null
    });
    assert.equal(withNull.account_id, null);

    const withId = TaxRateCreateRequestSchema.parse({
      code: "VAT2",
      name: "VAT Two",
      rate_percent: 10,
      account_id: 55
    });
    assert.equal(withId.account_id, 55);
  });

  test("accepts missing account_id (undefined)", () => {
    const parsed = TaxRateCreateRequestSchema.parse({
      code: "VAT3",
      name: "VAT Three",
      rate_percent: 10
    });
    assert.equal(parsed.account_id, undefined);
  });
});

describe("Phase 4 contracts: CashBankTransactionSchema", () => {
  test("accepts MUTATION type", () => {
    const input = {
      id: 1,
      company_id: 10,
      outlet_id: null,
      transaction_type: "MUTATION",
      transaction_date: "2026-03-12",
      reference: null,
      description: "Transfer between accounts",
      source_account_id: 100,
      destination_account_id: 200,
      amount: 500000,
      currency_code: "IDR",
      exchange_rate: null,
      base_amount: null,
      fx_gain_loss: null,
      fx_account_id: null,
      status: "DRAFT",
      posted_at: null,
      created_by_user_id: null,
      created_at: "2026-03-12T00:00:00.000Z",
      updated_at: "2026-03-12T00:00:00.000Z"
    };
    const parsed = CashBankTransactionSchema.parse(input);
    assert.equal(parsed.transaction_type, "MUTATION");
  });

  test("accepts FOREX type with exchange_rate and fx fields", () => {
    const input = {
      id: 2,
      company_id: 10,
      outlet_id: null,
      transaction_type: "FOREX",
      transaction_date: "2026-03-12",
      reference: null,
      description: "Exchange USD to IDR",
      source_account_id: 100,
      destination_account_id: 200,
      amount: 100,
      currency_code: "USD",
      exchange_rate: 16500,
      base_amount: 1650000,
      fx_gain_loss: 0,
      fx_account_id: 300,
      fx_account_name: null,
      status: "DRAFT",
      posted_at: null,
      created_by_user_id: null,
      created_at: "2026-03-12T00:00:00.000Z",
      updated_at: "2026-03-12T00:00:00.000Z"
    };
    const parsed = CashBankTransactionSchema.parse(input);
    assert.equal(parsed.transaction_type, "FOREX");
    assert.equal(parsed.exchange_rate, 16500);
    assert.equal(parsed.base_amount, 1650000);
    assert.equal(parsed.fx_gain_loss, 0);
    assert.equal(parsed.fx_account_id, 300);
  });

  test("accepts nullable fx_account_id (non-FOREX)", () => {
    const input = {
      id: 3,
      company_id: 10,
      outlet_id: null,
      transaction_type: "MUTATION",
      transaction_date: "2026-03-12",
      reference: null,
      description: "Simple mutation",
      source_account_id: 100,
      destination_account_id: 200,
      amount: 100000,
      currency_code: "IDR",
      exchange_rate: null,
      base_amount: null,
      fx_gain_loss: null,
      fx_account_id: null,
      status: "DRAFT",
      posted_at: null,
      created_by_user_id: null,
      created_at: "2026-03-12T00:00:00.000Z",
      updated_at: "2026-03-12T00:00:00.000Z"
    };
    const parsed = CashBankTransactionSchema.parse(input);
    assert.equal(parsed.fx_account_id, null);
  });

  test("accepts TOP_UP and WITHDRAWAL types", () => {
    const topUp = CashBankTransactionSchema.parse({
      id: 4,
      company_id: 10,
      outlet_id: null,
      transaction_type: "TOP_UP",
      transaction_date: "2026-03-12",
      reference: null,
      description: "Cash to bank",
      source_account_id: 100,
      destination_account_id: 200,
      amount: 1000000,
      currency_code: "IDR",
      exchange_rate: null,
      base_amount: null,
      fx_gain_loss: null,
      fx_account_id: null,
      status: "DRAFT",
      posted_at: null,
      created_by_user_id: null,
      created_at: "2026-03-12T00:00:00.000Z",
      updated_at: "2026-03-12T00:00:00.000Z"
    });
    assert.equal(topUp.transaction_type, "TOP_UP");

    const withdrawal = CashBankTransactionSchema.parse({
      id: 5,
      company_id: 10,
      outlet_id: null,
      transaction_type: "WITHDRAWAL",
      transaction_date: "2026-03-12",
      reference: null,
      description: "Bank to cash",
      source_account_id: 200,
      destination_account_id: 100,
      amount: 500000,
      currency_code: "IDR",
      exchange_rate: null,
      base_amount: null,
      fx_gain_loss: null,
      fx_account_id: null,
      status: "DRAFT",
      posted_at: null,
      created_by_user_id: null,
      created_at: "2026-03-12T00:00:00.000Z",
      updated_at: "2026-03-12T00:00:00.000Z"
    });
    assert.equal(withdrawal.transaction_type, "WITHDRAWAL");
  });
});

describe("Phase 4 contracts: CashBankTransactionCreateRequestSchema", () => {
  test("enforces source != destination", () => {
    assert.throws(() => {
      CashBankTransactionCreateRequestSchema.parse({
        transaction_type: "MUTATION",
        transaction_date: "2026-03-12",
        description: "Invalid",
        source_account_id: 100,
        destination_account_id: 100,
        amount: 100000
      });
    });
  });

  test("requires exchange_rate for FOREX type", () => {
    assert.throws(() => {
      CashBankTransactionCreateRequestSchema.parse({
        transaction_type: "FOREX",
        transaction_date: "2026-03-12",
        description: "Missing rate",
        source_account_id: 100,
        destination_account_id: 200,
        amount: 100,
        currency_code: "USD"
      });
    });
  });
});

describe("Phase 4 contracts: SalesPaymentSchema", () => {
  test("accepts payment variance fields", () => {
    const input = {
      id: 1,
      company_id: 10,
      outlet_id: 5,
      invoice_id: 100,
      payment_no: "PAY-001",
      payment_at: "2026-03-12T10:00:00.000Z",
      account_id: 200,
      method: "CASH",
      status: "DRAFT",
      amount: 1100000,
      actual_amount_idr: 1100000,
      invoice_amount_idr: 1000000,
      payment_amount_idr: 1100000,
      payment_delta_idr: 100000,
      created_at: "2026-03-12T10:00:00.000Z",
      updated_at: "2026-03-12T10:00:00.000Z"
    };
    const parsed = SalesPaymentSchema.parse(input);
    assert.equal(parsed.payment_amount_idr, 1100000);
    assert.equal(parsed.invoice_amount_idr, 1000000);
    assert.equal(parsed.payment_delta_idr, 100000);
  });

  test("accepts nullable variance fields (missing = undefined)", () => {
    const input = {
      id: 2,
      company_id: 10,
      outlet_id: 5,
      invoice_id: 100,
      payment_no: "PAY-002",
      payment_at: "2026-03-12T10:00:00.000Z",
      account_id: 200,
      method: "CASH",
      status: "DRAFT",
      amount: 1000000,
      created_at: "2026-03-12T10:00:00.000Z",
      updated_at: "2026-03-12T10:00:00.000Z"
    };
    const parsed = SalesPaymentSchema.parse(input);
    assert.equal(parsed.payment_amount_idr, undefined);
    assert.equal(parsed.invoice_amount_idr, undefined);
    assert.equal(parsed.payment_delta_idr, undefined);
  });

  test("accepts null actual_amount_idr for backward compatibility", () => {
    const input = {
      id: 3,
      company_id: 10,
      outlet_id: 5,
      invoice_id: 100,
      payment_no: "PAY-003",
      payment_at: "2026-03-12T10:00:00.000Z",
      account_id: 200,
      method: "CASH",
      status: "DRAFT",
      amount: 1000000,
      actual_amount_idr: null,
      created_at: "2026-03-12T10:00:00.000Z",
      updated_at: "2026-03-12T10:00:00.000Z"
    };
    const parsed = SalesPaymentSchema.parse(input);
    assert.equal(parsed.actual_amount_idr, null);
  });
});

describe("Phase 4 contracts: SalesPaymentCreateRequestSchema", () => {
  test("accepts actual_amount_idr for FOREX variance", () => {
    const parsed = SalesPaymentCreateRequestSchema.parse({
      outlet_id: 5,
      invoice_id: 100,
      payment_at: "2026-03-12T10:00:00.000Z",
      account_id: 200,
      amount: 1000000,
      actual_amount_idr: 1050000
    });
    assert.equal(parsed.actual_amount_idr, 1050000);
    assert.equal(parsed.amount, 1000000);
  });

  test("when splits provided, actual_amount_idr must equal amount", () => {
    assert.throws(() => {
      SalesPaymentCreateRequestSchema.parse({
        outlet_id: 5,
        invoice_id: 100,
        payment_at: "2026-03-12T10:00:00.000Z",
        account_id: 200,
        amount: 1000000,
        actual_amount_idr: 1100000,
        splits: [
          { account_id: 200, amount: 1000000 }
        ]
      });
    });
  });

  test("when splits provided with exact match, actual_amount_idr can equal amount", () => {
    const parsed = SalesPaymentCreateRequestSchema.parse({
      outlet_id: 5,
      invoice_id: 100,
      payment_at: "2026-03-12T10:00:00.000Z",
      account_id: 200,
      amount: 1000000,
      actual_amount_idr: 1000000,
      splits: [
        { account_id: 200, amount: 1000000 }
      ]
    });
    assert.equal(parsed.splits?.length, 1);
    assert.equal(parsed.splits?.[0].amount, 1000000);
  });

  test("rejects negative actual_amount_idr", () => {
    assert.throws(() => {
      SalesPaymentCreateRequestSchema.parse({
        outlet_id: 5,
        invoice_id: 100,
        payment_at: "2026-03-12T10:00:00.000Z",
        account_id: 200,
        amount: 1000000,
        actual_amount_idr: -50000
      });
    });
  });
});

describe("Phase 4 contracts: SalesPaymentUpdateRequestSchema", () => {
  test("accepts actual_amount_idr in update", () => {
    const parsed = SalesPaymentUpdateRequestSchema.parse({
      actual_amount_idr: 1050000
    });
    assert.equal(parsed.actual_amount_idr, 1050000);
  });

  test("when splits provided with amount, validates cent-exact", () => {
    assert.throws(() => {
      SalesPaymentUpdateRequestSchema.parse({
        amount: 1000000,
        splits: [
          { account_id: 200, amount: 999999.99 }
        ]
      });
    });
  });
});
