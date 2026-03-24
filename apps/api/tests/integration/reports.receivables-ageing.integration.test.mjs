// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  loginOwner,
  readEnv,
  setupIntegrationTests,
  TEST_TIMEOUT_MS
} from "./integration-harness.mjs";

const testContext = setupIntegrationTests(test);

function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function createAndPostInvoice(baseUrl, accessToken, payload) {
  const createResponse = await fetch(`${baseUrl}/api/sales/invoices`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const createBody = await createResponse.json();
  assert.equal(createResponse.status, 201, JSON.stringify(createBody));

  const invoiceId = createBody.data.id;
  const postResponse = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}/post`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
  const postBody = await postResponse.json();
  assert.equal(postResponse.status, 200, JSON.stringify(postBody));

  return createBody.data;
}

test(
  "reports integration: receivables ageing returns correct buckets and csv export",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    const db = testContext.db;
    const baseUrl = testContext.baseUrl;
    const createdInvoiceNos = [];
    const createdInvoiceIds = [];
    let createdOutletId = 0;
    let companyId = 0;
    const createdMappingAccountIds = [];

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.company_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
         LIMIT 1`,
        [companyCode, ownerEmail]
      );
      const owner = ownerRows[0];
      if (!owner) {
        throw new Error("owner fixture not found; run migrations and seeds before integration tests");
      }

      companyId = Number(owner.company_id);
      const [outletInsert] = await db.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `ITAR${Date.now().toString(36).toUpperCase()}`.slice(0, 32), "IT Receivables Outlet"]
      );
      const outletId = Number(outletInsert.insertId);
      createdOutletId = outletId;

      const [sourceOutletRows] = await db.execute(
        `SELECT id
         FROM outlets
         WHERE company_id = ?
           AND code = ?
         LIMIT 1`,
        [companyId, outletCode]
      );
      const sourceOutletId = Number(sourceOutletRows[0]?.id ?? 0);
      if (!sourceOutletId) {
        throw new Error("source outlet fixture not found for account mapping copy");
      }

      await db.execute(
        `INSERT INTO outlet_account_mappings (company_id, outlet_id, mapping_key, account_id)
         SELECT company_id, ?, mapping_key, account_id
         FROM outlet_account_mappings
         WHERE company_id = ?
           AND outlet_id = ?`,
        [outletId, companyId, sourceOutletId]
      );

      const requiredMappingKeys = ["AR", "SALES_REVENUE"];
      const [existingMappingRows] = await db.execute(
        `SELECT mapping_key, account_id
         FROM outlet_account_mappings
         WHERE company_id = ?
           AND outlet_id = ?
           AND mapping_key IN ('AR', 'SALES_REVENUE')`,
        [companyId, outletId]
      );

      const existingKeys = new Set(existingMappingRows.map((r) => String(r.mapping_key)));
      const createdMappingAccountIds = [];
      const mappingRunId = randomUUID().slice(0, 8);

      for (const mappingKey of requiredMappingKeys) {
        if (existingKeys.has(mappingKey)) {
          continue;
        }

        const accountCode = `IT${mappingKey.replaceAll("_", "")}${Date.now().toString(36).toUpperCase()}`.slice(0, 32);
        const [accountInsert] = await db.execute(
          `INSERT INTO accounts (company_id, code, name, is_active)
           VALUES (?, ?, ?, 1)`,
          [companyId, accountCode, `IT ${mappingKey} ${mappingRunId}`]
        );
        const accountId = Number(accountInsert.insertId);
        createdMappingAccountIds.push(accountId);

        await db.execute(
          `INSERT INTO outlet_account_mappings (company_id, outlet_id, mapping_key, account_id)
           VALUES (?, ?, ?, ?)`,
          [companyId, outletId, mappingKey, accountId]
        );
      }

      const [fiscalRows] = await db.execute(
        `SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
         FROM fiscal_years
         WHERE company_id = ?
           AND status = 'OPEN'
         ORDER BY start_date DESC
         LIMIT 1`,
        [companyId]
      );
      const fiscal = fiscalRows[0];
      if (!fiscal) {
        throw new Error("open fiscal year not found");
      }

      const asOfDate = String(fiscal.end_date);

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

      const runId = randomUUID().slice(0, 8);

      const currentInvoice = await createAndPostInvoice(baseUrl, accessToken, {
        outlet_id: outletId,
        invoice_no: `IT-RPT-AR-CUR-${runId}`,
        invoice_date: addDays(asOfDate, -5),
        due_date: addDays(asOfDate, 5),
        tax_amount: 0,
        lines: [{ description: "Current bucket", qty: 1, unit_price: 100 }]
      });

      const oneThirtyInvoice = await createAndPostInvoice(baseUrl, accessToken, {
        outlet_id: outletId,
        invoice_no: `IT-RPT-AR-130-${runId}`,
        invoice_date: addDays(asOfDate, -20),
        due_date: addDays(asOfDate, -10),
        tax_amount: 0,
        lines: [{ description: "1-30 bucket", qty: 1, unit_price: 200 }]
      });

      const fallbackInvoice = await createAndPostInvoice(baseUrl, accessToken, {
        outlet_id: outletId,
        invoice_no: `IT-RPT-AR-3160-${runId}`,
        invoice_date: addDays(asOfDate, -40),
        due_date: addDays(asOfDate, -40),
        tax_amount: 0,
        lines: [{ description: "31-60 bucket fallback", qty: 1, unit_price: 300 }]
      });

      const overNinetyInvoice = await createAndPostInvoice(baseUrl, accessToken, {
        outlet_id: outletId,
        invoice_no: `IT-RPT-AR-90P-${runId}`,
        invoice_date: addDays(asOfDate, -95),
        due_date: addDays(asOfDate, -95),
        tax_amount: 0,
        lines: [{ description: "Over 90 bucket", qty: 1, unit_price: 400 }]
      });

      const paidInvoice = await createAndPostInvoice(baseUrl, accessToken, {
        outlet_id: outletId,
        invoice_no: `IT-RPT-AR-PAID-${runId}`,
        invoice_date: addDays(asOfDate, -10),
        due_date: addDays(asOfDate, -10),
        tax_amount: 0,
        lines: [{ description: "Fully paid exclusion", qty: 1, unit_price: 500 }]
      });

      createdInvoiceNos.push(
        currentInvoice.invoice_no,
        oneThirtyInvoice.invoice_no,
        fallbackInvoice.invoice_no,
        overNinetyInvoice.invoice_no,
        paidInvoice.invoice_no
      );
      createdInvoiceIds.push(
        currentInvoice.id,
        oneThirtyInvoice.id,
        fallbackInvoice.id,
        overNinetyInvoice.id,
        paidInvoice.id
      );

      const draftInvoiceNo = `IT-RPT-AR-DRF-${runId}`;
      createdInvoiceNos.push(draftInvoiceNo);
      const draftCreateResponse = await fetch(`${baseUrl}/api/sales/invoices`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: draftInvoiceNo,
          invoice_date: addDays(asOfDate, -1),
          due_date: addDays(asOfDate, -1),
          tax_amount: 0,
          lines: [{ description: "Draft exclusion", qty: 1, unit_price: 999 }]
        })
      });
      const draftBody = await draftCreateResponse.json();
      assert.equal(draftCreateResponse.status, 201, JSON.stringify(draftBody));
      createdInvoiceIds.push(Number(draftBody.data.id));

      await db.execute(
        `UPDATE sales_invoices
         SET due_date = NULL
         WHERE company_id = ?
           AND id = ?`,
        [companyId, fallbackInvoice.id]
      );

      await db.execute(
        `UPDATE sales_invoices
         SET paid_total = 150,
             payment_status = 'PARTIAL'
         WHERE company_id = ?
           AND id = ?`,
        [companyId, overNinetyInvoice.id]
      );

      await db.execute(
        `UPDATE sales_invoices
         SET paid_total = grand_total,
             payment_status = 'PAID'
         WHERE company_id = ?
           AND id = ?`,
        [companyId, paidInvoice.id]
      );

      const reportResponse = await fetch(
        `${baseUrl}/api/reports/receivables-ageing?outlet_id=${outletId}&as_of_date=${asOfDate}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(reportResponse.status, 200);
      const reportBody = await reportResponse.json();
      assert.equal(reportBody.success, true);

      const data = reportBody.data;
      assert.equal(data.buckets.current, 100);
      assert.equal(data.buckets["1_30_days"], 200);
      assert.equal(data.buckets["31_60_days"], 300);
      assert.equal(data.buckets["61_90_days"], 0);
      assert.equal(data.buckets.over_90_days, 250);
      assert.equal(data.total_outstanding, 850);
      assert.equal(data.invoices.length, 4);

      const fallbackRow = data.invoices.find((row) => row.invoice_id === fallbackInvoice.id);
      assert.ok(fallbackRow);
      assert.equal(fallbackRow.due_date, null);
      assert.equal(fallbackRow.age_bucket, "31_60_days");

      assert.equal(data.invoices.some((row) => row.invoice_id === paidInvoice.id), false);

      const csvResponse = await fetch(
        `${baseUrl}/api/reports/receivables-ageing?outlet_id=${outletId}&as_of_date=${asOfDate}&format=csv`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(csvResponse.status, 200);
      assert.equal(csvResponse.headers.get("content-type")?.includes("text/csv"), true);
      const csvText = await csvResponse.text();
      assert.equal(csvText.includes("invoice_id,invoice_no"), true);
      assert.equal(csvText.includes(currentInvoice.invoice_no), true);
    } finally {
      // Note: journal_lines are immutable (enforced by trigger) - cannot delete
      // journal_batches cannot be deleted due to FK constraint with journal_lines
      // Test data will remain as immutable records

      if (createdInvoiceIds.length > 0) {
        const placeholders = createdInvoiceIds.map(() => "?").join(", ");
        await db.execute(
          `DELETE FROM sales_payments
           WHERE invoice_id IN (${placeholders})`,
          createdInvoiceIds
        );

        await db.execute(
          `DELETE FROM sales_credit_note_lines
           WHERE credit_note_id IN (
             SELECT id FROM sales_credit_notes WHERE invoice_id IN (${placeholders})
           )`,
          createdInvoiceIds
        );

        await db.execute(
          `DELETE FROM sales_credit_notes
           WHERE invoice_id IN (${placeholders})`,
          createdInvoiceIds
        );

        await db.execute(
          `DELETE FROM sales_invoice_taxes
           WHERE sales_invoice_id IN (${placeholders})`,
          createdInvoiceIds
        );

        await db.execute(
          `DELETE FROM sales_invoice_lines
           WHERE invoice_id IN (${placeholders})`,
          createdInvoiceIds
        );

        const invoiceNoPlaceholders = createdInvoiceNos.map(() => "?").join(", ");
        await db.execute(
          `DELETE FROM sales_invoices
           WHERE invoice_no IN (${invoiceNoPlaceholders})`,
          createdInvoiceNos
        );
      }

      if (createdOutletId > 0) {
        if (companyId > 0) {
          await db.execute(
            `DELETE FROM sales_invoice_taxes
             WHERE company_id = ?
               AND outlet_id = ?`,
            [companyId, createdOutletId]
          );

          await db.execute(
            `DELETE FROM sales_invoice_lines
             WHERE company_id = ?
               AND outlet_id = ?`,
            [companyId, createdOutletId]
          );

          await db.execute(
            `DELETE FROM sales_payments
             WHERE company_id = ?
               AND outlet_id = ?`,
            [companyId, createdOutletId]
          );

          await db.execute(
            `DELETE FROM sales_invoices
             WHERE company_id = ?
               AND outlet_id = ?`,
            [companyId, createdOutletId]
          );

          await db.execute(
            `DELETE FROM outlet_account_mappings
             WHERE company_id = ?
               AND outlet_id = ?`,
            [companyId, createdOutletId]
          );

          if (createdMappingAccountIds.length > 0) {
            const accountPlaceholders = createdMappingAccountIds.map(() => "?").join(", ");
            await db.execute(
              `DELETE FROM accounts
               WHERE company_id = ?
                 AND id IN (${accountPlaceholders})`,
              [companyId, ...createdMappingAccountIds]
            );
          }
        }

        await db.execute("DELETE FROM outlets WHERE id = ?", [createdOutletId]);
      }
    }
  }
);
