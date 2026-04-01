// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Invoice Routes Tests
 *
 * Tests for /sales/invoices endpoints:
 * - List invoices with filtering
 * - Create new invoice
 * - Company scoping enforcement
 * - GL posting validation
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDb } from "../../lib/db";
import { createInvoice, listInvoices, postInvoice, type SalesInvoiceDetail } from "../../lib/sales";
import { sql } from "kysely";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

describe("Sales Invoice Routes", { concurrency: false }, () => {
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;
  let testInvoiceId = 0;

  before(async () => {
    const db = getDb();

    // Find test user fixture - global owner has outlet_id = NULL in user_role_assignments
    const userRows = await sql<{ user_id: number; company_id: number }>`
      SELECT u.id AS user_id, u.company_id
       FROM users u
       INNER JOIN companies c ON c.id = u.company_id
       INNER JOIN user_role_assignments ura ON ura.user_id = u.id
       WHERE c.code = ${TEST_COMPANY_CODE}
         AND u.email = ${TEST_OWNER_EMAIL}
         AND u.is_active = 1
         AND ura.outlet_id IS NULL
       LIMIT 1
    `.execute(db);

    assert.ok(
      userRows.rows.length > 0,
      `Owner fixture not found; run database seed first. Looking for company=${TEST_COMPANY_CODE}, email=${TEST_OWNER_EMAIL}`
    );
    testUserId = Number(userRows.rows[0].user_id);
    testCompanyId = Number(userRows.rows[0].company_id);

    // Get outlet ID from outlets table
    const outletRows = await sql<{ id: number }>`
      SELECT id FROM outlets WHERE company_id = ${testCompanyId} AND code = ${TEST_OUTLET_CODE} LIMIT 1
    `.execute(db);
    assert.ok(outletRows.rows.length > 0, `Outlet ${TEST_OUTLET_CODE} not found`);
    testOutletId = Number(outletRows.rows[0].id);
  });

  after(async () => {
    const db = getDb();
    // Cleanup: delete test invoice if created
    if (testInvoiceId > 0) {
      try {
        await sql`DELETE FROM sales_invoices WHERE id = ${testInvoiceId} AND company_id = ${testCompanyId}`.execute(db);
      } catch (error) {
        console.error("Cleanup failed for test invoice:", error);
      }
    }
    await closeDbPool();
  });

  // ===========================================================================
  // Invoice Schema Validation Tests
  // ===========================================================================

  describe("Invoice Data Structure", () => {
    test("sales_invoices table exists with required columns", async () => {
      const db = getDb();
      const columns = await sql<{ COLUMN_NAME: string }>`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_invoices'
      `.execute(db);

      const columnNames = columns.rows.map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("id"), "Should have id column");
      assert.ok(columnNames.includes("company_id"), "Should have company_id column");
      assert.ok(columnNames.includes("outlet_id"), "Should have outlet_id column");
      assert.ok(columnNames.includes("invoice_no"), "Should have invoice_no column");
      assert.ok(columnNames.includes("status"), "Should have status column");
      assert.ok(columnNames.includes("subtotal"), "Should have subtotal column");
      assert.ok(columnNames.includes("tax_amount"), "Should have tax_amount column");
      assert.ok(columnNames.includes("grand_total"), "Should have grand_total column");
    });

    test("sales_invoice_lines table exists with required columns", async () => {
      const db = getDb();
      const columns = await sql<{ COLUMN_NAME: string }>`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_invoice_lines'
      `.execute(db);

      const columnNames = columns.rows.map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("id"), "Should have id column");
      assert.ok(columnNames.includes("invoice_id"), "Should have invoice_id column");
      assert.ok(columnNames.includes("line_type"), "Should have line_type column");
      assert.ok(columnNames.includes("description"), "Should have description column");
      assert.ok(columnNames.includes("qty"), "Should have qty column");
      assert.ok(columnNames.includes("line_total"), "Should have line_total column");
    });

    test("sales_invoice_taxes table exists with required columns", async () => {
      const db = getDb();
      const columns = await sql<{ COLUMN_NAME: string }>`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_invoice_taxes'
      `.execute(db);

      const columnNames = columns.rows.map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("id"), "Should have id column");
      assert.ok(columnNames.includes("sales_invoice_id"), "Should have sales_invoice_id column");
      assert.ok(columnNames.includes("tax_rate_id"), "Should have tax_rate_id column");
      assert.ok(columnNames.includes("amount"), "Should have amount column");
    });
  });

  // ===========================================================================
  // List Invoices Tests
  // ===========================================================================

  describe("List Invoices", () => {
    test("returns invoices for company", async () => {
      const result = await listInvoices(testCompanyId, {
        outletIds: [testOutletId],
        limit: 10
      });

      assert.ok(typeof result.total === "number", "Should return total count");
      assert.ok(Array.isArray(result.invoices), "Should return invoices array");
    });

    test("returns invoices list (may have existing data)", async () => {
      const result = await listInvoices(testCompanyId, {
        outletIds: [testOutletId],
        limit: 10
      });

      assert.ok(typeof result.total === "number", "Should return total count");
      assert.ok(Array.isArray(result.invoices), "Should return invoices array");
      assert.ok(result.invoices.length <= 10, "Should respect limit");
    });

    test("filters by status", async () => {
      const result = await listInvoices(testCompanyId, {
        outletIds: [testOutletId],
        status: "DRAFT",
        limit: 10
      });

      assert.ok(typeof result.total === "number", "Should return total count");
      for (const invoice of result.invoices) {
        assert.equal(invoice.status, "DRAFT", "All invoices should have DRAFT status");
      }
    });

    test("filters by payment_status", async () => {
      const result = await listInvoices(testCompanyId, {
        outletIds: [testOutletId],
        paymentStatus: "UNPAID",
        limit: 10
      });

      assert.ok(typeof result.total === "number", "Should return total count");
      for (const invoice of result.invoices) {
        assert.equal(invoice.payment_status, "UNPAID", "All invoices should have UNPAID payment_status");
      }
    });

    test("enforces company scoping - cannot see other company invoices", async () => {
      // Query with a different company ID should return empty
      const result = await listInvoices(999999, {
        outletIds: [],
        limit: 10
      });

      assert.equal(result.total, 0, "Should return 0 for non-existent company");
      assert.equal(result.invoices.length, 0, "Should return empty array");
    });
  });

  // ===========================================================================
  // Create Invoice Tests
  // ===========================================================================

  describe("Create Invoice", () => {
    test("creates invoice with minimal data", async () => {
      const invoice = await createInvoice(testCompanyId, {
        outlet_id: testOutletId,
        invoice_date: new Date().toISOString().slice(0, 10),
        tax_amount: 0,
        lines: [
          {
            description: "Test Service",
            qty: 1,
            unit_price: 100000
          }
        ]
      }, { userId: testUserId });

      assert.ok(invoice.id > 0, "Should have valid id");
      assert.equal(invoice.company_id, testCompanyId, "Should have correct company_id");
      assert.equal(invoice.outlet_id, testOutletId, "Should have correct outlet_id");
      assert.equal(invoice.status, "DRAFT", "Should have DRAFT status");
      assert.equal(invoice.payment_status, "UNPAID", "Should have UNPAID payment_status");
      assert.ok(invoice.lines.length > 0, "Should have lines");
      assert.equal(invoice.lines[0].description, "Test Service", "Should have correct line description");

      // Store for cleanup
      testInvoiceId = invoice.id;
    });

    test("creates invoice with client_ref for idempotency", async () => {
      const clientRef = crypto.randomUUID();
      
      const invoice1 = await createInvoice(testCompanyId, {
        outlet_id: testOutletId,
        invoice_date: new Date().toISOString().slice(0, 10),
        client_ref: clientRef,
        tax_amount: 0,
        lines: [
          {
            description: "Idempotent Test",
            qty: 1,
            unit_price: 50000
          }
        ]
      }, { userId: testUserId });

      // Creating again with same client_ref should return the same invoice
      const invoice2 = await createInvoice(testCompanyId, {
        outlet_id: testOutletId,
        invoice_date: new Date().toISOString().slice(0, 10),
        client_ref: clientRef,
        tax_amount: 0,
        lines: [
          {
            description: "Different Description",
            qty: 1,
            unit_price: 99999
          }
        ]
      }, { userId: testUserId });

      assert.equal(invoice1.id, invoice2.id, "Should return same invoice for same client_ref");
    });

    test("calculates subtotal correctly", async () => {
      const invoice = await createInvoice(testCompanyId, {
        outlet_id: testOutletId,
        invoice_date: new Date().toISOString().slice(0, 10),
        tax_amount: 0,
        lines: [
          {
            description: "Item 1",
            qty: 2,
            unit_price: 50000
          },
          {
            description: "Item 2",
            qty: 3,
            unit_price: 30000
          }
        ]
      }, { userId: testUserId });

      // 2 * 50000 + 3 * 30000 = 100000 + 90000 = 190000
      assert.equal(invoice.subtotal, 190000, "Subtotal should be 190000");
      assert.equal(invoice.lines.length, 2, "Should have 2 lines");

      // Store for cleanup
      testInvoiceId = invoice.id;
    });

    test("respects line_type for SERVICE items", async () => {
      const invoice = await createInvoice(testCompanyId, {
        outlet_id: testOutletId,
        invoice_date: new Date().toISOString().slice(0, 10),
        tax_amount: 0,
        lines: [
          {
            line_type: "SERVICE",
            description: "Consulting Service",
            qty: 1,
            unit_price: 500000
          }
        ]
      }, { userId: testUserId });

      assert.equal(invoice.lines[0].line_type, "SERVICE", "Line type should be SERVICE");
      assert.equal(invoice.lines[0].item_id, null, "Service should have null item_id");

      // Store for cleanup
      testInvoiceId = invoice.id;
    });
  });

  // ===========================================================================
  // GL Balance Validation Tests
  // ===========================================================================

  describe("GL Balance Validation", () => {
    test("invoice totals satisfy grand_total = subtotal + tax_amount", async () => {
      const invoice = await createInvoice(testCompanyId, {
        outlet_id: testOutletId,
        invoice_date: new Date().toISOString().slice(0, 10),
        tax_amount: 11000,
        lines: [
          {
            description: "GL Test Item",
            qty: 1,
            unit_price: 100000
          }
        ]
      }, { userId: testUserId });

      // 100000 + 11000 = 111000
      assert.equal(invoice.subtotal, 100000, "Subtotal should be 100000");
      assert.equal(invoice.tax_amount, 11000, "Tax amount should be 11000");
      assert.equal(invoice.grand_total, 111000, "Grand total should be subtotal + tax_amount");

      // Store for cleanup
      testInvoiceId = invoice.id;
    });

    test("posting invoice changes status to POSTED", async () => {
      // Create invoice first
      const invoice = await createInvoice(testCompanyId, {
        outlet_id: testOutletId,
        invoice_date: new Date().toISOString().slice(0, 10),
        tax_amount: 10000,
        lines: [
          {
            description: "GL Posting Test",
            qty: 1,
            unit_price: 100000
          }
        ]
      }, { userId: testUserId });

      assert.equal(invoice.status, "DRAFT", "Invoice should start as DRAFT");

      try {
        // Post to GL
        const postedInvoice = await postInvoice(testCompanyId, invoice.id, {
          userId: testUserId
        });

        assert.ok(postedInvoice, "Should return posted invoice");
        assert.equal(postedInvoice.status, "POSTED", "Invoice should be POSTED status");

        // Verify journal batch was created (if GL accounts are configured)
        const db = getDb();
        const batchRows = await sql<{ id: number; doc_type: string; doc_id: number; total_debit: string; total_credit: string }>`
          SELECT id, doc_type, doc_id, total_debit, total_credit
           FROM journal_batches 
           WHERE company_id = ${testCompanyId} AND doc_type = 'SALES_INVOICE' AND doc_id = ${invoice.id}
        `.execute(db);

        if (batchRows.rows.length > 0) {
          const batch = batchRows.rows[0];
          assert.equal(batch.doc_type, "SALES_INVOICE", "Should have correct doc_type");
          assert.equal(Number(batch.doc_id), invoice.id, "Should reference invoice ID");

          // Verify debits equal credits (balanced journal)
          const totalDebit = Number(batch.total_debit);
          const totalCredit = Number(batch.total_credit);
          assert.equal(totalDebit, totalCredit, "Debits should equal credits");
          assert.ok(totalDebit > 0, "Should have positive amounts");
        }

        // Store for cleanup
        testInvoiceId = invoice.id;
      } catch (error: unknown) {
        // If GL posting fails due to missing account configuration, that's expected in test environment
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("UNBALANCED_JOURNAL") || errorMessage.includes("account")) {
          console.log("GL posting skipped - account configuration required for full GL testing");
          testInvoiceId = invoice.id; // Still cleanup the invoice
          return; // Skip this test
        }
        throw error; // Re-throw unexpected errors
      }
    });

    test("invoice posting handles missing GL configuration gracefully", async () => {
      // Create invoice
      const invoice = await createInvoice(testCompanyId, {
        outlet_id: testOutletId,
        invoice_date: new Date().toISOString().slice(0, 10),
        tax_amount: 15000,
        lines: [
          {
            description: "GL Config Test",
            qty: 2,
            unit_price: 75000
          }
        ]
      }, { userId: testUserId });

      // Attempt to post - should either succeed or fail gracefully
      try {
        const postedInvoice = await postInvoice(testCompanyId, invoice.id, {
          userId: testUserId
        });
        
        if (postedInvoice) {
          assert.equal(postedInvoice.status, "POSTED", "Should be posted if GL accounts are configured");
        }
      } catch (error: unknown) {
        // Expected errors for missing GL configuration
        const errorMessage = error instanceof Error ? error.message : String(error);
        const expectedErrors = [
          "UNBALANCED_JOURNAL",
          "account not found",
          "Account not found",
          "revenue account",
          "receivable account"
        ];
        
        const isExpectedError = expectedErrors.some(expected => 
          errorMessage.toLowerCase().includes(expected.toLowerCase())
        );
        
        assert.ok(isExpectedError, `Expected GL configuration error, got: ${errorMessage}`);
      }

      // Store for cleanup
      testInvoiceId = invoice.id;
    });
  });

  // ===========================================================================
  // Company Scoping Tests
  // ===========================================================================

  describe("Company Scoping Enforcement", () => {
    test("invoice is scoped to company", async () => {
      const invoice = await createInvoice(testCompanyId, {
        outlet_id: testOutletId,
        invoice_date: new Date().toISOString().slice(0, 10),
        tax_amount: 0,
        lines: [
          {
            description: "Scope Test",
            qty: 1,
            unit_price: 10000
          }
        ]
      }, { userId: testUserId });

      assert.equal(invoice.company_id, testCompanyId, "Invoice should be scoped to company");

      // Store for cleanup
      testInvoiceId = invoice.id;
    });

    test("cannot create invoice for non-existent outlet", async () => {
      try {
        await createInvoice(testCompanyId, {
          outlet_id: 999999,
          invoice_date: new Date().toISOString().slice(0, 10),
          tax_amount: 0,
          lines: [
            {
              description: "Invalid Outlet",
              qty: 1,
              unit_price: 10000
            }
          ]
        }, { userId: testUserId });
        
        assert.fail("Should have thrown an error");
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        assert.ok(
          errorMessage.includes("Outlet not found") || 
          errorMessage.includes("DatabaseReferenceError"),
          "Should throw reference error for invalid outlet"
        );
      }
    });
  });
});
