// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDbPool,
  loadEnvIfPresent,
  readEnv
} from "../../tests/integration/integration-harness.mjs";
import { closeDbPool } from "./db";
import { createPayment, DatabaseConflictError, PaymentAllocationError } from "./sales";
import type { RowDataPacket } from "mysql2";
import { randomUUID } from "node:crypto";

loadEnvIfPresent();

test(
  "Payment idempotency behavior tests",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = createDbPool();
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
      // Find existing company/outlet/user
      const [ownerRows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.id AS user_id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
           AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(ownerRows.length > 0, "Owner fixture not found; run database seed first");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      // Create two payable accounts for split tests
      const [accountAResult] = await pool.execute(
        `INSERT INTO accounts (company_id, code, name, is_payable)
         VALUES (?, ?, ?, 1)`,
        [companyId, `PAY-${runId}-A`, `Payable Account A ${runId}`]
      );
      accountAId = Number((accountAResult as { insertId: number }).insertId);
      createdAccountIds.push(accountAId);

      const [accountBResult] = await pool.execute(
        `INSERT INTO accounts (company_id, code, name, is_payable)
         VALUES (?, ?, ?, 1)`,
        [companyId, `PAY-${runId}-B`, `Payable Account B ${runId}`]
      );
      accountBId = Number((accountBResult as { insertId: number }).insertId);
      createdAccountIds.push(accountBId);

      // Create an invoice (POSTED status required for payment)
      const [invoiceResult] = await pool.execute(
        `INSERT INTO sales_invoices (
          company_id, outlet_id, invoice_no, invoice_date,
          subtotal, tax_amount, grand_total, paid_total, status, payment_status
        ) VALUES (?, ?, ?, CURDATE(), ?, 0, ?, 0, 'POSTED', 'UNPAID')`,
        [companyId, outletId, `INV-${runId}`, 10000, 10000]
      );
      invoiceId = Number((invoiceResult as { insertId: number }).insertId);
      createdInvoiceIds.push(invoiceId);

      // Create invoice line
      await pool.execute(
        `INSERT INTO sales_invoice_lines (
          invoice_id, company_id, outlet_id, line_no,
          description, qty, unit_price, line_total
        ) VALUES (?, ?, ?, 1, 'Test Service', 1, 10000, 10000)`,
        [invoiceId, companyId, outletId]
      );

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
        const placeholders = createdPaymentIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM sales_payment_splits WHERE payment_id IN (${placeholders})`,
          createdPaymentIds
        );
        await pool.execute(
          `DELETE FROM sales_payments WHERE id IN (${placeholders})`,
          createdPaymentIds
        );
      }

      if (createdInvoiceIds.length > 0) {
        const placeholders = createdInvoiceIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM sales_invoice_lines WHERE invoice_id IN (${placeholders})`,
          createdInvoiceIds
        );
        await pool.execute(
          `DELETE FROM sales_invoices WHERE id IN (${placeholders})`,
          createdInvoiceIds
        );
      }

      if (createdAccountIds.length > 0) {
        const placeholders = createdAccountIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM accounts WHERE id IN (${placeholders})`,
          createdAccountIds
        );
      }
    }
  }
);

test(
  "Service precision validation - non-split payments",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = createDbPool();
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
      // Find existing company/outlet/user
      const [ownerRows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.id AS user_id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
           AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);
      outletId = Number(ownerRows[0].outlet_id);
      userId = Number(ownerRows[0].user_id);

      // Create payable account
      const [accountResult] = await pool.execute(
        `INSERT INTO accounts (company_id, code, name, is_payable)
         VALUES (?, ?, ?, 1)`,
        [companyId, `PAY-${runId}`, `Payable Account ${runId}`]
      );
      accountId = Number((accountResult as { insertId: number }).insertId);
      createdAccountIds.push(accountId);

      // Create an invoice
      const [invoiceResult] = await pool.execute(
        `INSERT INTO sales_invoices (
          company_id, outlet_id, invoice_no, invoice_date,
          subtotal, tax_amount, grand_total, paid_total, status, payment_status
        ) VALUES (?, ?, ?, CURDATE(), ?, 0, ?, 0, 'POSTED', 'UNPAID')`,
        [companyId, outletId, `INV-${runId}`, 10000, 10000]
      );
      invoiceId = Number((invoiceResult as { insertId: number }).insertId);
      createdInvoiceIds.push(invoiceId);

      // Create invoice line
      await pool.execute(
        `INSERT INTO sales_invoice_lines (
          invoice_id, company_id, outlet_id, line_no,
          description, qty, unit_price, line_total
        ) VALUES (?, ?, ?, 1, 'Test Service', 1, 10000, 10000)`,
        [invoiceId, companyId, outletId]
      );

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
          return true
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
        const placeholders = createdPaymentIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM sales_payment_splits WHERE payment_id IN (${placeholders})`,
          createdPaymentIds
        );
        await pool.execute(
          `DELETE FROM sales_payments WHERE id IN (${placeholders})`,
          createdPaymentIds
        );
      }

      if (createdInvoiceIds.length > 0) {
        const placeholders = createdInvoiceIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM sales_invoice_lines WHERE invoice_id IN (${placeholders})`,
          createdInvoiceIds
        );
        await pool.execute(
          `DELETE FROM sales_invoices WHERE id IN (${placeholders})`,
          createdInvoiceIds
        );
      }

      if (createdAccountIds.length > 0) {
        const placeholders = createdAccountIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM accounts WHERE id IN (${placeholders})`,
          createdAccountIds
        );
      }
    }
  }
);

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
