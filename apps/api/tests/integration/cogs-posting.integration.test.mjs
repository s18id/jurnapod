// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createIntegrationTestContext,
  loginOwner,
  readEnv,
  TEST_TIMEOUT_MS
} from "./integration-harness.mjs";

const testContext = createIntegrationTestContext();
let baseUrl = "";
let db;

test.before(async () => {
  await testContext.start();
  baseUrl = testContext.baseUrl;
  db = testContext.db;
});

test.after(async () => {
  await testContext.stop();
});

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function ensureOpenFiscalYear(companyId, userId) {
  const [rows] = await db.execute(
    `SELECT id
     FROM fiscal_years
     WHERE company_id = ? AND status = 'OPEN'
     LIMIT 1`,
    [companyId]
  );

  if (rows.length > 0) {
    return;
  }

  const year = new Date().getUTCFullYear();
  await db.execute(
    `INSERT INTO fiscal_years (
       company_id,
       code,
       name,
       start_date,
       end_date,
       status,
       created_by_user_id,
       updated_by_user_id
     ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    [companyId, `FY-${year}`, `FY ${year}`, `${year}-01-01`, `${year}-12-31`, userId, userId]
  );
}

async function getAccountTypeId(name) {
  const [rows] = await db.execute(
    `SELECT id
     FROM account_types
     WHERE UPPER(name) = ?
     LIMIT 1`,
    [name.toUpperCase()]
  );

  if (rows.length > 0) {
    return Number(rows[0].id);
  }

  const [insertResult] = await db.execute(
    `INSERT INTO account_types (company_id, name, category, normal_balance, report_group, is_active)
     VALUES (1, ?, ?, ?, ?, 1)`,
    [
      name.toUpperCase(),
      name.toUpperCase(),
      name.toUpperCase() === "ASSET" || name.toUpperCase() === "EXPENSE" ? "D" : "C",
      name.toUpperCase() === "EXPENSE" || name.toUpperCase() === "REVENUE" ? "PL" : "NRC"
    ]
  );
  return Number(insertResult.insertId);
}

async function createAccount(companyId, code, name, accountTypeName, normalBalance = "D") {
  const accountTypeId = await getAccountTypeId(accountTypeName);
  const [result] = await db.execute(
    `INSERT INTO accounts (company_id, code, name, account_type_id, normal_balance, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [companyId, code, name, accountTypeId, normalBalance]
  );
  return Number(result.insertId);
}

async function ensureInvoicePostingMappings(companyId, outletId, runId) {
  const [rows] = await db.execute(
    `SELECT mapping_key
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND mapping_key IN ('AR', 'SALES_REVENUE')`,
    [companyId, outletId]
  );
  const existing = new Set(rows.map((row) => String(row.mapping_key)));

  const createdAccountIds = [];
  const createdMappings = [];

  if (!existing.has("AR")) {
    const arAccountId = await createAccount(companyId, `AR-${runId}`.slice(0, 32), `AR ${runId}`, "ASSET", "D");
    createdAccountIds.push(arAccountId);
    await db.execute(
      `INSERT INTO outlet_account_mappings (company_id, outlet_id, mapping_key, account_id)
       VALUES (?, ?, 'AR', ?)`,
      [companyId, outletId, arAccountId]
    );
    createdMappings.push("AR");
  }

  if (!existing.has("SALES_REVENUE")) {
    const revenueAccountId = await createAccount(
      companyId,
      `SR-${runId}`.slice(0, 32),
      `Sales Revenue ${runId}`,
      "REVENUE",
      "C"
    );
    createdAccountIds.push(revenueAccountId);
    await db.execute(
      `INSERT INTO outlet_account_mappings (company_id, outlet_id, mapping_key, account_id)
       VALUES (?, ?, 'SALES_REVENUE', ?)`,
      [companyId, outletId, revenueAccountId]
    );
    createdMappings.push("SALES_REVENUE");
  }

  return { createdAccountIds, createdMappings };
}

async function ensureInventoryModuleCogsEnabled(companyId, userId) {
  const [moduleRows] = await db.execute(`SELECT id FROM modules WHERE code = 'inventory' LIMIT 1`);
  if (moduleRows.length === 0) {
    throw new Error("inventory module definition not found");
  }
  const moduleId = Number(moduleRows[0].id);

  await db.execute(
    `INSERT INTO company_modules (
       company_id,
       module_id,
       enabled,
       config_json,
       created_by_user_id,
       updated_by_user_id
     ) VALUES (?, ?, 1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       enabled = VALUES(enabled),
       config_json = VALUES(config_json),
       updated_by_user_id = VALUES(updated_by_user_id),
       updated_at = CURRENT_TIMESTAMP`,
    [companyId, moduleId, '{"cogs_enabled":1}', userId, userId]
  );
}

test(
  "COGS integration: posting invoice creates balanced COGS journal",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    const createdItemIds = [];
    const createdInvoiceIds = [];
    const createdPriceItemIds = [];
    const createdAccountIds = [];
    let companyId = null;
    let outletId = null;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const invoiceDate = new Date().toISOString().slice(0, 10);

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, o.id AS outlet_id
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

      const owner = ownerRows[0];
      assert.ok(owner, "owner fixture must exist");
      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);
      const ownerUserId = Number(owner.id);

      await ensureOpenFiscalYear(companyId, ownerUserId);
      await ensureInventoryModuleCogsEnabled(companyId, ownerUserId);

      const { createdAccountIds: mappingAccounts } = await ensureInvoicePostingMappings(companyId, outletId, runId);
      createdAccountIds.push(...mappingAccounts);

      const cogsAccountId = await createAccount(
        companyId,
        `CG-${runId}`.slice(0, 32),
        `COGS ${runId}`,
        "EXPENSE",
        "D"
      );
      const inventoryAccountId = await createAccount(
        companyId,
        `INV-${runId}`.slice(0, 32),
        `Inventory ${runId}`,
        "ASSET",
        "D"
      );
      createdAccountIds.push(cogsAccountId, inventoryAccountId);

      await db.execute(
        `INSERT INTO company_account_mappings (company_id, mapping_key, account_id)
         VALUES (?, 'COGS_DEFAULT', ?), (?, 'INVENTORY_ASSET_DEFAULT', ?)
         ON DUPLICATE KEY UPDATE account_id = VALUES(account_id), updated_at = CURRENT_TIMESTAMP`,
        [companyId, cogsAccountId, companyId, inventoryAccountId]
      );

      const [itemInsert] = await db.execute(
        `INSERT INTO items (
           company_id,
           sku,
           name,
           item_type,
           track_stock,
           cogs_account_id,
           inventory_asset_account_id,
           is_active
         ) VALUES (?, ?, ?, 'PRODUCT', 1, ?, ?, 1)`,
        [companyId, `COGS-${runId}`.toUpperCase(), `COGS Item ${runId}`, cogsAccountId, inventoryAccountId]
      );
      const itemId = Number(itemInsert.insertId);
      createdItemIds.push(itemId);

      await db.execute(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active)
         VALUES (?, NULL, ?, 15.00, 1)
         ON DUPLICATE KEY UPDATE price = VALUES(price), is_active = 1`,
        [companyId, itemId]
      );
      createdPriceItemIds.push(itemId);

      const token = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);
      const authHeaders = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      };

      const createInvoiceRes = await requestJson("/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_date: invoiceDate,
          tax_amount: 0,
          lines: [
            {
              line_type: "PRODUCT",
              item_id: itemId,
              description: "COGS integration line",
              qty: 2,
              unit_price: 30
            }
          ]
        })
      });

      assert.equal(createInvoiceRes.response.status, 201);
      const invoiceId = Number(createInvoiceRes.payload.data.id);
      createdInvoiceIds.push(invoiceId);

      const postInvoiceRes = await requestJson(`/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(postInvoiceRes.response.status, 200);

      const [batchRows] = await db.execute(
        `SELECT DISTINCT jb.id
         FROM journal_batches jb
         INNER JOIN journal_lines jl ON jl.journal_batch_id = jb.id
         WHERE jb.company_id = ?
           AND jb.doc_type = 'COGS'
           AND jl.description LIKE ?
         ORDER BY jb.id DESC
         LIMIT 1`,
        [companyId, `%sale INV-${invoiceId}%`]
      );
      assert.equal(batchRows.length, 1);
      const cogsBatchId = Number(batchRows[0].id);

      const [lineRows] = await db.execute(
        `SELECT debit, credit, line_date
          FROM journal_lines
          WHERE company_id = ?
            AND journal_batch_id = ?`,
        [companyId, cogsBatchId]
      );
      assert.ok(lineRows.length >= 2);

      const totalDebit = lineRows.reduce((sum, row) => sum + Number(row.debit), 0);
      const totalCredit = lineRows.reduce((sum, row) => sum + Number(row.credit), 0);
      assert.equal(totalDebit, totalCredit);
      assert.ok(totalDebit > 0);
      assert.ok(lineRows.every((row) => String(row.line_date).slice(0, 10) === invoiceDate));
    } finally {
      if (createdInvoiceIds.length > 0) {
        await db.execute(
          `DELETE FROM sales_invoice_lines WHERE invoice_id IN (${createdInvoiceIds.map(() => "?").join(",")})`,
          createdInvoiceIds
        );
        await db.execute(
          `DELETE FROM sales_invoices WHERE id IN (${createdInvoiceIds.map(() => "?").join(",")})`,
          createdInvoiceIds
        );
      }

      if (createdPriceItemIds.length > 0) {
        await db.execute(
          `DELETE FROM item_prices WHERE item_id IN (${createdPriceItemIds.map(() => "?").join(",")})`,
          createdPriceItemIds
        );
      }

      if (createdItemIds.length > 0) {
        await db.execute(
          `DELETE FROM items WHERE id IN (${createdItemIds.map(() => "?").join(",")})`,
          createdItemIds
        );
      }

      if (createdAccountIds.length > 0 && companyId != null) {
        await db.execute(
          `DELETE FROM journal_lines WHERE account_id IN (${createdAccountIds.map(() => "?").join(",")})`,
          createdAccountIds
        );
        await db.execute(
          `DELETE FROM company_account_mappings WHERE company_id = ? AND account_id IN (${createdAccountIds.map(() => "?").join(",")})`,
          [companyId, ...createdAccountIds]
        );
        await db.execute(
          `DELETE FROM outlet_account_mappings WHERE company_id = ? AND account_id IN (${createdAccountIds.map(() => "?").join(",")})`,
          [companyId, ...createdAccountIds]
        );
        await db.execute(
          `DELETE FROM accounts WHERE company_id = ? AND id IN (${createdAccountIds.map(() => "?").join(",")})`,
          [companyId, ...createdAccountIds]
        );
      }

      if (companyId != null && createdInvoiceIds.length > 0) {
        const placeholders = createdInvoiceIds.map(() => "?").join(",");
        const [batchRows] = await db.execute(
          `SELECT id
           FROM journal_batches
           WHERE company_id = ?
             AND doc_type = 'COGS'
             AND doc_id IN (${placeholders})`,
          [companyId, ...createdInvoiceIds]
        );
        const batchIds = batchRows.map((row) => Number(row.id));

        if (batchIds.length > 0) {
          await db.execute(
            `DELETE FROM journal_lines
             WHERE journal_batch_id IN (${batchIds.map(() => "?").join(",")})`,
            batchIds
          );
          await db.execute(
            `DELETE FROM journal_batches
             WHERE id IN (${batchIds.map(() => "?").join(",")})`,
            batchIds
          );
        }
      }
    }
  }
);

test(
  "COGS integration: item account ids must belong to authenticated company",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const token = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

    const [ownerRows] = await db.execute(
      `SELECT u.company_id
       FROM users u
       INNER JOIN companies c ON c.id = u.company_id
       WHERE c.code = ?
         AND u.email = ?
       LIMIT 1`,
      [companyCode, ownerEmail]
    );
    const companyId = Number(ownerRows[0].company_id);

    const [foreignRows] = await db.execute(
      `SELECT a.id
       FROM accounts a
       WHERE a.company_id <> ?
       LIMIT 1`,
      [companyId]
    );

    if (foreignRows.length === 0) {
      return;
    }

    const foreignAccountId = Number(foreignRows[0].id);
    const runId = Date.now().toString(36);

    const createItemRes = await requestJson("/api/inventory/items", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: `Cross Company Item ${runId}`,
        sku: `XCOMP-${runId}`.toUpperCase(),
        type: "PRODUCT",
        cogs_account_id: foreignAccountId
      })
    });

    assert.equal(createItemRes.response.status, 404);
  }
);
