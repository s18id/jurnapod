// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadEnvIfPresent,
  readEnv
} from "../../tests/integration/integration-harness.mjs";
import { getDb, closeDbPool } from "./db";
import { createPayment, DatabaseConflictError, PaymentAllocationError } from "./sales";
import { createAccount } from "./accounts.js";
import { sql } from "kysely";
import { randomUUID } from "node:crypto";

loadEnvIfPresent();

test(
  "Payment idempotency behavior tests",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    let accountAId = 0;
    let accountBId = 0;
    let invoiceId = 0;
    let paymentId = 0;

    const createdAccountIds: number[] = [];
    const createdInvoiceIds: number[] = [];
    const createdPaymentIds: number[] = [];

    try {
      // Find existing company/outlet/user - global owner has outlet_id = NULL
      const ownerRows = await sql`
        SELECT u.id AS user_id, u.company_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_role_assignments ura ON ura.user_id = u.id
         WHERE c.code = ${companyCode}
           AND u.email = ${ownerEmail}
           AND u.is_active = 1
           AND ura.outlet_id IS NULL
         LIMIT 1
       `.execute(db);

      assert.ok(ownerRows.rows.length > 0, "Owner fixture not found; run database seed first");
      userId = Number((ownerRows.rows[0] as { user_id: number }).user_id);
      companyId = Number((ownerRows.rows[0] as { company_id: number }).company_id);

      // Get outlet ID from outlets table
      const outletRows = await sql`
        SELECT id FROM outlets WHERE company_id = ${companyId} AND code = ${outletCode} LIMIT 1
      `.execute(db);
      assert.ok(outletRows.rows.length > 0, "Outlet not found");
      outletId = Number((outletRows.rows[0] as { id: number }).id);

      // Create two payable accounts for split tests
      const accountA = await createAccount({
        company_id: companyId,
        code: `PAY-${runId}-A`,
        name: `Payable Account A ${runId}`,
        is_group: false,
        is_payable: true,
        is_active: true
      });
      accountAId = accountA.id;
      createdAccountIds.push(accountAId);

      const accountB = await createAccount({
        company_id: companyId,
        code: `PAY-${runId}-B`,
        name: `Payable Account B ${runId}`,
        is_group: false,
        is_payable: true,
        is_active: true
      });
      accountBId = accountB.id;
      createdAccountIds.push(accountBId);

      // Create an invoice (POSTED status required for payment)
      const invoiceResult = await sql`
        INSERT INTO sales_invoices (
          company_id, outlet_id, invoice_no, invoice_date,
          subtotal, tax_amount, grand_total, paid_total, status, payment_status
        ) VALUES (${companyId}, ${outletId}, ${`INV-${runId}`}, CURDATE(), 10000, 0, 10000, 0, 'POSTED', 'UNPAID')
      `.execute(db);
      invoiceId = Number(invoiceResult.insertId);
      createdInvoiceIds.push(invoiceId);

      // Create invoice line
      await sql`
        INSERT INTO sales_invoice_lines (
          invoice_id, company_id, outlet_id, line_no,
          description, qty, unit_price, line_total
        ) VALUES (${invoiceId}, ${companyId}, ${outletId}, 1, 'Test Service', 1, 10000, 10000)
      `.execute(db);

      // ============================================
      // Test A: Same client_ref + equivalent timestamp => idempotent success
      // ============================================
      const clientRef = randomUUID();
      
      // First create with milliseconds
      const payment1 = await createPayment(
        companyId,
        {
          outlet_id: outletId,
          invoice_id: invoiceId,
          client_ref: clientRef,
          payment_at: "2026-03-10T10:00:00.123Z",
          method: "CASH",
          amount: 10000,
          splits: [
            { account_id: accountAId, amount: 6000 },
            { account_id: accountBId, amount: 4000 }
          ]
        },
        { userId }
      );
      
      paymentId = payment1.id;
      createdPaymentIds.push(paymentId);

      // Verify payment created correctly
      assert.strictEqual(payment1.amount, 10000, "Payment amount should match");
      assert.ok(payment1.splits, "Payment should have splits");
      assert.strictEqual(payment1.splits!.length, 2, "Payment should have 2 splits");

      // Retry with same client_ref but different millisecond precision
      const payment2 = await createPayment(
        companyId,
        {
          outlet_id: outletId,
          invoice_id: invoiceId,
          client_ref: clientRef,
          payment_at: "2026-03-10T10:00:00.000Z", // Different ms precision
          method: "CASH",
          amount: 10000,
          splits: [
            { account_id: accountAId, amount: 6000 },
            { account_id: accountBId, amount: 4000 }
          ]
        },
        { userId }
      );

      // Should return same payment (idempotent)
      assert.strictEqual(payment2.id, payment1.id, "Idempotent retry should return same payment");
      assert.strictEqual(payment2.amount, payment1.amount, "Amount should match");

      // ============================================
      // Test B: Same client_ref + payload mismatch => conflict
      // ============================================
      const clientRefB = randomUUID();
      
      // First create
      const paymentB1 = await createPayment(
        companyId,
        {
          outlet_id: outletId,
          invoice_id: invoiceId,
          client_ref: clientRefB,
          payment_at: "2026-03-10T10:00:00Z",
          method: "CASH",
          amount: 10000,
          splits: [
            { account_id: accountAId, amount: 6000 },
            { account_id: accountBId, amount: 4000 }
          ]
        },
        { userId }
      );
      createdPaymentIds.push(paymentB1.id);

      // Retry with different amount
      await assert.rejects(
        async () => {
          await createPayment(
            companyId,
            {
              outlet_id: outletId,
              invoice_id: invoiceId,
              client_ref: clientRefB,
              payment_at: "2026-03-10T10:00:00Z",
              method: "CASH",
              amount: 9999, // Different amount
              splits: [
                { account_id: accountAId, amount: 5999 },
                { account_id: accountBId, amount: 4000 }
              ]
            },
            { userId }
          );
        },
        (err: Error) => {
          assert.ok(err instanceof DatabaseConflictError, "Should throw DatabaseConflictError");
          assert.ok(err.message.includes("Idempotency conflict"), "Error should mention idempotency conflict");
          return true;
        }
      );

      // ============================================
      // Test C: Non-split payment idempotency
      // ============================================
      const clientRefC = randomUUID();
      
      // First create non-split payment
      const paymentC1 = await createPayment(
        companyId,
        {
          outlet_id: outletId,
          invoice_id: invoiceId,
          client_ref: clientRefC,
          payment_at: "2026-03-10T10:00:00.500Z",
          method: "CASH",
          account_id: accountAId,
          amount: 5000
        },
        { userId }
      );
      
      createdPaymentIds.push(paymentC1.id);

      // Retry with second-precision timestamp
      const paymentC2 = await createPayment(
        companyId,
        {
          outlet_id: outletId,
          invoice_id: invoiceId,
          client_ref: clientRefC,
          payment_at: "2026-03-10T10:00:00Z", // No milliseconds
          method: "CASH",
          account_id: accountAId,
          amount: 5000
        },
        { userId }
      );

      // Should return same payment
      assert.strictEqual(paymentC2.id, paymentC1.id, "Non-split idempotent retry should return same payment");

    } finally {
      // Cleanup in reverse dependency order
      if (createdPaymentIds.length > 0) {
        await sql`DELETE FROM sales_payment_splits WHERE payment_id IN (${sql.join(createdPaymentIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
        await sql`DELETE FROM sales_payments WHERE id IN (${sql.join(createdPaymentIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
      }

      if (createdInvoiceIds.length > 0) {
        await sql`DELETE FROM sales_invoice_lines WHERE invoice_id IN (${sql.join(createdInvoiceIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
        await sql`DELETE FROM sales_invoices WHERE id IN (${sql.join(createdInvoiceIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
      }

      if (createdAccountIds.length > 0) {
        await sql`DELETE FROM accounts WHERE id IN (${sql.join(createdAccountIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
      }
    }
  }
);

test(
  "Service precision validation - non-split payments",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let outletId = 0;
    let userId = 0;
    let accountId = 0;
    let invoiceId = 0;

    const createdAccountIds: number[] = [];
    const createdInvoiceIds: number[] = [];
    const createdPaymentIds: number[] = [];

    try {
      // Find existing company/outlet/user - global owner has outlet_id = NULL
      const ownerRows = await sql`
        SELECT u.id AS user_id, u.company_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_role_assignments ura ON ura.user_id = u.id
         WHERE c.code = ${companyCode}
           AND u.email = ${ownerEmail}
           AND u.is_active = 1
           AND ura.outlet_id IS NULL
         LIMIT 1
       `.execute(db);

      assert.ok(ownerRows.rows.length > 0, "Owner fixture not found");
      userId = Number((ownerRows.rows[0] as { user_id: number }).user_id);
      companyId = Number((ownerRows.rows[0] as { company_id: number }).company_id);

      // Get outlet ID from outlets table
      const outletRows = await sql`
        SELECT id FROM outlets WHERE company_id = ${companyId} AND code = ${outletCode} LIMIT 1
      `.execute(db);
      assert.ok(outletRows.rows.length > 0, "Outlet not found");
      outletId = Number((outletRows.rows[0] as { id: number }).id);

      // Create payable account
      const account = await createAccount({
        company_id: companyId,
        code: `PAY-${runId}`,
        name: `Payable Account ${runId}`,
        is_group: false,
        is_payable: true,
        is_active: true
      });
      accountId = account.id;
      createdAccountIds.push(accountId);

      // Create an invoice
      const invoiceResult = await sql`
        INSERT INTO sales_invoices (
          company_id, outlet_id, invoice_no, invoice_date,
          subtotal, tax_amount, grand_total, paid_total, status, payment_status
        ) VALUES (${companyId}, ${outletId}, ${`INV-${runId}`}, CURDATE(), 10000, 0, 10000, 0, 'POSTED', 'UNPAID')
      `.execute(db);
      invoiceId = Number(invoiceResult.insertId);
      createdInvoiceIds.push(invoiceId);

      // Create invoice line
      await sql`
        INSERT INTO sales_invoice_lines (
          invoice_id, company_id, outlet_id, line_no,
          description, qty, unit_price, line_total
        ) VALUES (${invoiceId}, ${companyId}, ${outletId}, 1, 'Test Service', 1, 10000, 10000)
      `.execute(db);

      // Test: Non-split payment with >2 decimals should fail
      await assert.rejects(
        async () => {
          await createPayment(
            companyId,
            {
              outlet_id: outletId,
              invoice_id: invoiceId,
              payment_at: "2026-03-10T10:00:00Z",
              method: "CASH",
              account_id: accountId,
              amount: 100.123 // More than 2 decimals
            },
            { userId }
          );
        },
        (err: Error) => {
          assert.ok(err instanceof PaymentAllocationError, "Should throw PaymentAllocationError");
          assert.ok(err.message.includes("2 decimal places"), "Error should mention decimal places");
          return true;
        }
      );

      // Test: Non-split payment with exactly 2 decimals should succeed
      const payment = await createPayment(
        companyId,
        {
          outlet_id: outletId,
          invoice_id: invoiceId,
          payment_at: "2026-03-10T10:00:00Z",
          method: "CASH",
          account_id: accountId,
          amount: 100.99
        },
        { userId }
      );

      createdPaymentIds.push(payment.id);
      assert.strictEqual(payment.amount, 100.99, "Payment amount should match");

    } finally {
      // Cleanup
      if (createdPaymentIds.length > 0) {
        await sql`DELETE FROM sales_payment_splits WHERE payment_id IN (${sql.join(createdPaymentIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
        await sql`DELETE FROM sales_payments WHERE id IN (${sql.join(createdPaymentIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
      }

      if (createdInvoiceIds.length > 0) {
        await sql`DELETE FROM sales_invoice_lines WHERE invoice_id IN (${sql.join(createdInvoiceIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
        await sql`DELETE FROM sales_invoices WHERE id IN (${sql.join(createdInvoiceIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
      }

      if (createdAccountIds.length > 0) {
        await sql`DELETE FROM accounts WHERE id IN (${sql.join(createdAccountIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
      }
    }
  }
);

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
