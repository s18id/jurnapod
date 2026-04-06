// @ts-nocheck
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Phase 4: Sales payments ACL integration tests - tenant isolation and role-based access
// Run with: npm --prefix apps/api run test:integration -- tests/integration/sales-payments.acl.integration.test.mjs

import assert from "node:assert/strict";
import { test, describe, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  setupIntegrationTests,
  loginUser,
  readEnv,
  TEST_TIMEOUT_MS
} from "../../tests/integration/integration-harness.js";

const testContext = setupIntegrationTests();

async function apiRequest(baseUrl, token, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: token ? `Bearer ${token}` : undefined,
      ...(options.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function ensureOpenFiscalYear(db, companyId, userId) {
  const [rows] = await db.execute(
    `SELECT id FROM fiscal_years WHERE company_id = ? AND status = 'OPEN' LIMIT 1`,
    [companyId]
  );
  if (rows.length > 0) {
    return;
  }

  const year = new Date().getUTCFullYear();
  await db.execute(
    `INSERT INTO fiscal_years (
       company_id, code, name, start_date, end_date, status, created_by_user_id, updated_by_user_id
     ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    [companyId, `FY-${year}`, `FY ${year}`, `${year}-01-01`, `${year}-12-31`, userId, userId]
  );
}

async function createTestItem(db, companyId, outletId, code, name) {
  const [result] = await db.execute(
    `INSERT INTO items (company_id, sku, name, item_type, is_active)
     VALUES (?, ?, ?, 'PRODUCT', 1)`,
    [companyId, code, name]
  );
  return Number(result.insertId);
}

async function createInvoiceAndPayment(db, baseUrl, token, companyId, outletId, itemId, options = {}) {
  const { amount = 100000, paymentAmount = null, includeTax = false, accountId } = options;
  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error("createInvoiceAndPayment requires valid accountId");
  }
  
  const invoicePayload = {
    outlet_id: outletId,
    invoice_date: new Date().toISOString().slice(0, 10),
    tax_amount: 0,
    lines: [
      {
        line_type: "PRODUCT",
        item_id: itemId,
        description: "Test Item",
        qty: 1,
        unit_price: amount
      }
    ]
  };

  const invoiceRes = await apiRequest(baseUrl, token, "/api/sales/invoices", {
    method: "POST",
    body: JSON.stringify(invoicePayload)
  });

  if (invoiceRes.status !== 201) {
    throw new Error(`Failed to create invoice: ${JSON.stringify(invoiceRes.body)}`);
  }

  const invoiceId = Number(invoiceRes.body.data.id);

  // Post the invoice first
  const postInvoiceRes = await apiRequest(baseUrl, token, `/api/sales/invoices/${invoiceId}/post`, {
    method: "POST"
  });

  if (postInvoiceRes.status !== 200) {
    throw new Error(`Failed to post invoice: ${JSON.stringify(postInvoiceRes.body)}`);
  }

  // Now create payment
  const paymentPayload = {
    outlet_id: outletId,
    invoice_id: invoiceId,
    payment_at: new Date().toISOString(),
    account_id: accountId,
    method: "CASH",
    amount: paymentAmount ?? amount,
    ...(paymentAmount && paymentAmount !== amount ? { actual_amount_idr: paymentAmount } : {})
  };

  const paymentRes = await apiRequest(baseUrl, token, "/api/sales/payments", {
    method: "POST",
    body: JSON.stringify(paymentPayload)
  });

  if (paymentRes.status !== 201) {
    throw new Error(`Failed to create payment: ${JSON.stringify(paymentRes.body)}`);
  }

  return {
    invoiceId,
    paymentId: Number(paymentRes.body.data.id)
  };
}

test(
  "@slow sales payments ACL: tenant isolation and role-based post access",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    const { db, baseUrl } = testContext;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);

    const createdUserIds = [];
    const createdOutletIds = [];
    const createdItemIds = [];
    const createdInvoiceIds = [];
    const createdPaymentIds = [];
    const createdCompanyIds = [];
    const createdMappingAccountIds = [];

    let companyAId = null;
    let ownerToken = null;

    try {
      // ========================================
      // Setup: Get Company A owner info
      // ========================================
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, u.password_hash, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN outlets o ON o.company_id = u.company_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
           AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );
      const owner = ownerRows[0];
      if (!owner) {
        throw new Error("owner fixture not found");
      }

      companyAId = Number(owner.company_id);
      const ownerUserId = Number(owner.id);
      const ownerOutletId = Number(owner.outlet_id);
      const ownerPasswordHash = String(owner.password_hash);

      await ensureOpenFiscalYear(db, companyAId, ownerUserId);

      // Ensure required account mappings exist for posting invoices
      const requiredMappingKeys = ["AR", "SALES_REVENUE"];
      const [existingMappingRows] = await db.execute(
        `SELECT mapping_key, account_id
         FROM outlet_account_mappings
         WHERE company_id = ?
           AND outlet_id = ?
           AND mapping_key IN ('AR', 'SALES_REVENUE')`,
        [companyAId, ownerOutletId]
      );

      const existingKeys = new Set(existingMappingRows.map((r) => String(r.mapping_key)));
      const createdMappingAccountIds = [];

      for (const mappingKey of requiredMappingKeys) {
        if (existingKeys.has(mappingKey)) {
          continue;
        }

        const accountCode = `IT${mappingKey.replaceAll("_", "")}${Date.now().toString(36).toUpperCase()}`.slice(0, 32);
        const [accountInsert] = await db.execute(
          `INSERT INTO accounts (company_id, code, name, is_active)
           VALUES (?, ?, ?, 1)`,
          [companyAId, accountCode, `IT ${mappingKey} ${runId}`]
        );
        const accountId = Number(accountInsert.insertId);
        createdMappingAccountIds.push(accountId);

        await db.execute(
          `INSERT INTO outlet_account_mappings (company_id, outlet_id, mapping_key, account_id)
           VALUES (?, ?, ?, ?)`,
          [companyAId, ownerOutletId, mappingKey, accountId]
        );
      }

      // Ensure ACCOUNTANT role has update permission on sales module
      const [accountantRoleRow] = await db.execute(
        `SELECT id FROM roles WHERE code = 'ACCOUNTANT' LIMIT 1`
      );
      const accountantRoleIdForPerm = Number(accountantRoleRow[0]?.id);
      if (accountantRoleIdForPerm) {
        await db.execute(
          `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
           VALUES (?, ?, 'sales', 7)
           ON DUPLICATE KEY UPDATE permission_mask = 7`,
          [companyAId, accountantRoleIdForPerm]
        );
      }

      // Also ensure payment method mappings exist for outlet (needed for payments)
      const paymentMethods = ["CASH", "QRIS", "CARD"];
      for (const method of paymentMethods) {
        const [pmExisting] = await db.execute(
          `SELECT 1 FROM outlet_payment_method_mappings 
           WHERE company_id = ? AND outlet_id = ? AND method_code = ?`,
          [companyAId, ownerOutletId, method]
        );
        if (pmExisting.length === 0) {
          // Create an account for this payment method if needed
          let paymentAccountId = 0;
          const [pmAccountRows] = await db.execute(
            `SELECT account_id FROM outlet_account_mappings 
             WHERE company_id = ? AND outlet_id = ? AND mapping_key = ?`,
            [companyAId, ownerOutletId, method]
          );
          if (pmAccountRows.length > 0) {
            paymentAccountId = Number(pmAccountRows[0].account_id);
          } else {
            // Use any existing account
            const [anyAccountRows] = await db.execute(
              `SELECT id FROM accounts WHERE company_id = ? AND is_active = 1 LIMIT 1`,
              [companyAId]
            );
            if (anyAccountRows.length > 0) {
              paymentAccountId = Number(anyAccountRows[0].id);
            }
          }
          if (paymentAccountId > 0) {
            await db.execute(
              `INSERT INTO outlet_payment_method_mappings (company_id, outlet_id, method_code, account_id)
               VALUES (?, ?, ?, ?)`,
              [companyAId, ownerOutletId, method, paymentAccountId]
            );
          }
        }
      }

      // Get ACCOUNTANT and CASHIER role IDs
      const [roleRows] = await db.execute(
        `SELECT id, code FROM roles WHERE code IN ('ACCOUNTANT', 'CASHIER', 'OWNER')`
      );
      const roleIdByCode = new Map(roleRows.map((row) => [row.code, Number(row.id)]));
      const accountantRoleId = roleIdByCode.get("ACCOUNTANT");
      const cashierRoleId = roleIdByCode.get("CASHIER");

      assert.ok(accountantRoleId, "ACCOUNTANT role not found");
      assert.ok(cashierRoleId, "CASHIER role not found");

      // Create test item
      const itemId = await createTestItem(db, companyAId, ownerOutletId, `ITEM-${runId}`, `Test Item ${runId}`);
      createdItemIds.push(itemId);

      // Get or create a valid payable account for payments
      let validAccountId = 0;
      const [existingAccountRows] = await db.execute(
        `SELECT id FROM accounts WHERE company_id = ? AND is_active = 1 AND is_payable = 1 LIMIT 1`,
        [companyAId]
      );
      
      if (existingAccountRows.length > 0) {
        validAccountId = Number(existingAccountRows[0].id);
      } else {
        // Create a payable account for the test
        const [accountInsert] = await db.execute(
          `INSERT INTO accounts (company_id, code, name, is_active, is_payable)
           VALUES (?, ?, ?, 1, 1)`,
          [companyAId, `ITPAY${Date.now().toString(36).toUpperCase()}`.slice(0, 32), `Test Payment Account ${runId}`]
        );
        validAccountId = Number(accountInsert.insertId);
        createdMappingAccountIds.push(validAccountId);
      }
      
      assert.ok(validAccountId > 0, "No payable account found for fixture company");

      // ========================================
      // Setup: Create COMPANY B user for cross-company test
      // ========================================
      const companyBCode = `JP-B-${runId}`.slice(0, 10).toUpperCase();
      const companyBEmail = `sales-owner-b-${runId}@example.com`;

      const [companyBRows] = await db.execute(
        `INSERT INTO companies (code, name) VALUES (?, ?)`,
        [companyBCode, `Test Company B ${runId}`]
      );
      const companyBId = Number(companyBRows.insertId);
      createdCompanyIds.push(companyBId);

      const [outletBRows] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
        [companyBId, `SALES-OUTLET-B-${runId}`, "Outlet B"]
      );
      const outletBId = Number(outletBRows.insertId);
      createdOutletIds.push(outletBId);

      const [userBRows] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active) VALUES (?, ?, ?, 1)`,
        [companyBId, companyBEmail, ownerPasswordHash]
      );
      const userBId = Number(userBRows.insertId);
      createdUserIds.push(userBId);

      // Get OWNER role
      const ownerRoleId = roleIdByCode.get("OWNER");
      await db.execute(
        `INSERT INTO user_role_assignments (user_id, role_id, outlet_id, company_id)
         SELECT ?, r.id, ?, o.company_id
         FROM roles r
         CROSS JOIN outlets o
         WHERE r.code = 'OWNER'
           AND o.id = ?
         LIMIT 1`,
        [userBId, outletBId, outletBId]
      );

      // ========================================
      // Setup: Create ACCOUNTANT user for role test
      // ========================================
      const accountantEmail = `sales-accountant-${runId}@example.com`;
      const [accountantRows] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active) VALUES (?, ?, ?, 1)`,
        [companyAId, accountantEmail, ownerPasswordHash]
      );
      const accountantUserId = Number(accountantRows.insertId);
      createdUserIds.push(accountantUserId);

      await db.execute(
        `INSERT INTO user_role_assignments (user_id, role_id, outlet_id, company_id) VALUES (?, ?, ?, ?)`,
        [accountantUserId, accountantRoleId, ownerOutletId, companyAId]
      );

      // ========================================
      // Setup: Create CASHIER user for role test
      // ========================================
      const cashierEmail = `sales-cashier-${runId}@example.com`;
      const [cashierRows] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active) VALUES (?, ?, ?, 1)`,
        [companyAId, cashierEmail, ownerPasswordHash]
      );
      const cashierUserId = Number(cashierRows.insertId);
      createdUserIds.push(cashierUserId);

      await db.execute(
        `INSERT INTO user_role_assignments (user_id, role_id, outlet_id, company_id) VALUES (?, ?, ?, ?)`,
        [cashierUserId, cashierRoleId, ownerOutletId, companyAId]
      );

      // ========================================
      // Login
      // ========================================
      ownerToken = await loginUser(baseUrl, companyCode, ownerEmail, ownerPassword);
      const accountantToken = await loginUser(baseUrl, companyCode, accountantEmail, ownerPassword);
      const cashierToken = await loginUser(baseUrl, companyCode, cashierEmail, ownerPassword);
      const companyBToken = await loginUser(baseUrl, companyBCode, companyBEmail, ownerPassword);

      // ========================================
      // Test 1: Owner can create and post payment
      // ========================================
      const { invoiceId, paymentId } = await createInvoiceAndPayment(
        db, baseUrl, ownerToken, companyAId, ownerOutletId, itemId, { amount: 100000, accountId: validAccountId }
      );
      createdInvoiceIds.push(invoiceId);
      createdPaymentIds.push(paymentId);

      // Post the payment
      const postRes = await apiRequest(baseUrl, ownerToken, `/api/sales/payments/${paymentId}/post`, {
        method: "POST"
      });
      assert.equal(postRes.status, 200, `Owner post should succeed: ${JSON.stringify(postRes.body)}`);
      assert.equal(postRes.body.data.status, "POSTED");

      // ========================================
      // Test 2: ACCOUNTANT can post payment
      // ========================================
      const { invoiceId: invId2, paymentId: payId2 } = await createInvoiceAndPayment(
        db, baseUrl, ownerToken, companyAId, ownerOutletId, itemId, { amount: 200000, accountId: validAccountId }
      );
      createdInvoiceIds.push(invId2);
      createdPaymentIds.push(payId2);

      const accountantPostRes = await apiRequest(baseUrl, accountantToken, `/api/sales/payments/${payId2}/post`, {
        method: "POST"
      });
      assert.equal(
        accountantPostRes.status,
        200,
        `Accountant post should succeed: ${JSON.stringify(accountantPostRes.body)}`
      );

      // ========================================
      // Test 3: CASHIER cannot post payment
      // ========================================
      const { invoiceId: invId3, paymentId: payId3 } = await createInvoiceAndPayment(
        db, baseUrl, ownerToken, companyAId, ownerOutletId, itemId, { amount: 300000, accountId: validAccountId }
      );
      createdInvoiceIds.push(invId3);
      createdPaymentIds.push(payId3);

      const cashierPostRes = await apiRequest(baseUrl, cashierToken, `/api/sales/payments/${payId3}/post`, {
        method: "POST"
      });
      assert.equal(
        cashierPostRes.status,
        403,
        `Cashier post should fail with 403: ${JSON.stringify(cashierPostRes.body)}`
      );

      // ========================================
      // Test 4: Cross-company: Company B cannot post Company A payment
      // ========================================
      const { invoiceId: invId4, paymentId: payId4 } = await createInvoiceAndPayment(
        db, baseUrl, ownerToken, companyAId, ownerOutletId, itemId, { amount: 400000, accountId: validAccountId }
      );
      createdInvoiceIds.push(invId4);
      createdPaymentIds.push(payId4);

      const crossCompanyPostRes = await apiRequest(
        baseUrl,
        companyBToken,
        `/api/sales/payments/${payId4}/post`,
        { method: "POST" }
      );
      assert.equal(
        crossCompanyPostRes.status,
        403,
        `Cross-company post should be 403: ${JSON.stringify(crossCompanyPostRes.body)}`
      );

      // ========================================
      // Test 5: Unauthenticated request is rejected
      // ========================================
      const unauthPostRes = await apiRequest(baseUrl, null, `/api/sales/payments/${paymentId}/post`, {
        method: "POST"
      });
      assert.equal(
        unauthPostRes.status,
        401,
        `Unauthenticated post should fail with 401: ${JSON.stringify(unauthPostRes.body)}`
      );

    } finally {
      // ========================================
      // Cleanup
      // ========================================
      // Note: journal_lines and journal_batches are immutable (protected by triggers)
      // and cannot be deleted directly. Payments and invoices are deleted below.
      // The journal entries will remain but this is acceptable for test cleanup.

      // Delete payments
      if (createdPaymentIds.length > 0) {
        const payPlaceholders = createdPaymentIds.map(() => "?").join(", ");
        await db.execute(
          `DELETE FROM sales_payments WHERE id IN (${payPlaceholders})`,
          createdPaymentIds
        );
      }

      // Delete invoices
      if (createdInvoiceIds.length > 0) {
        const invPlaceholders = createdInvoiceIds.map(() => "?").join(", ");
        
        // Delete invoice lines first
        await db.execute(
          `DELETE FROM sales_invoice_lines WHERE invoice_id IN (${invPlaceholders})`,
          createdInvoiceIds
        );
        
        // Delete invoices
        await db.execute(
          `DELETE FROM sales_invoices WHERE id IN (${invPlaceholders})`,
          createdInvoiceIds
        );
      }

      // Delete test items (must be after invoices are deleted due to FK)
      if (createdItemIds.length > 0) {
        // First delete any related invoice lines that might reference these items
        // (defensive cleanup in case invoice creation partially succeeded)
        await db.execute(
          `DELETE FROM sales_invoice_lines WHERE item_id IN (${createdItemIds.map(() => "?").join(", ")})`,
          createdItemIds
        );
        
        const itemPlaceholders = createdItemIds.map(() => "?").join(", ");
        await db.execute(
          `DELETE FROM items WHERE id IN (${itemPlaceholders})`,
          createdItemIds
        );
      }

      // Delete test users
      for (const userId of createdUserIds) {
        await db.execute(`DELETE FROM user_role_assignments WHERE user_id = ?`, [userId]);
        await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);
      }

      // Delete test outlets
      for (const outletId of createdOutletIds) {
        await db.execute(`DELETE FROM outlets WHERE id = ?`, [outletId]);
      }

      // Delete mapping accounts created during test setup
      if (createdMappingAccountIds.length > 0 && companyAId) {
        // First delete the mappings
        await db.execute(
          `DELETE FROM outlet_account_mappings WHERE company_id = ? AND account_id IN (${createdMappingAccountIds.map(() => "?").join(", ")})`,
          [companyAId, ...createdMappingAccountIds]
        );
        // Then delete the accounts
        await db.execute(
          `DELETE FROM accounts WHERE company_id = ? AND id IN (${createdMappingAccountIds.map(() => "?").join(", ")})`,
          [companyAId, ...createdMappingAccountIds]
        );
      }

      // Delete test companies
      for (const companyId of createdCompanyIds) {
        await db.execute(`DELETE FROM companies WHERE id = ?`, [companyId]);
      }

      if (createdCompanyIds.length > 0) {
        const placeholders = createdCompanyIds.map(() => "?").join(", ");
        const [companyCountRows] = await db.execute(
          `SELECT COUNT(*) AS c FROM companies WHERE id IN (${placeholders})`,
          createdCompanyIds
        );
        assert.equal(Number(companyCountRows[0].c), 0, "companies cleanup leak detected");
      }
    }
  }
);
