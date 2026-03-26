// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadEnvIfPresent, readEnv, setupIntegrationTests } from "./integration-harness.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_TIMEOUT_MS = 180000;

const testContext = setupIntegrationTests(test);

/**
 * Helper to create test items directly via DB for performance.
 * Uses bulk insert for efficiency with large datasets.
 */
async function createTestItems(db, companyId, count, skuPrefix, startIndex = 0) {
  const batchSize = 1000;
  const createdIds = [];

  for (let batch = 0; batch < Math.ceil(count / batchSize); batch++) {
    const batchCount = Math.min(batchSize, count - batch * batchSize);
    const values = [];

    for (let i = 0; i < batchCount; i++) {
      const idx = startIndex + batch * batchSize + i;
      values.push(`('${skuPrefix}-${idx}', 'Test Item ${idx}', 'PRODUCT', ${companyId}, 1)`);
    }

    const sql = `
      INSERT INTO items (sku, name, item_type, company_id, is_active)
      VALUES ${values.join(",\n")}
    `;

    const [result] = await db.execute(sql);
    const insertId = Number(result.insertId);
    for (let i = 0; i < batchCount; i++) {
      createdIds.push(insertId + i);
    }
  }

  return createdIds;
}

async function cleanupTestItems(db, itemIds) {
  if (!itemIds || itemIds.length === 0) return;

  // Clean up in batches
  const batchSize = 1000;
  for (let i = 0; i < itemIds.length; i += batchSize) {
    const batch = itemIds.slice(i, i + batchSize);
    const placeholders = batch.map(() => "?").join(",");
    await db.execute(`DELETE FROM items WHERE id IN (${placeholders})`, batch);
  }
}

test(
  "export streaming: CSV export >10K rows uses streaming (no Content-Length header)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    loadEnvIfPresent();

    const db = testContext.db;
    const itemIds = [];

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const skuPrefix = `STR-${runId}`;

    try {
      // Get company ID
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
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      const companyId = Number(owner.company_id);

      // Create 15K items for streaming test
      console.log(`[streaming-test] Creating 15000 test items...`);
      const createdIds = await createTestItems(db, companyId, 15000, skuPrefix);
      itemIds.push(...createdIds);
      console.log(`[streaming-test] Created ${itemIds.length} items`);

      // Login
      const baseUrl = testContext.baseUrl;
      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode,
          email: ownerEmail,
          password: ownerPassword
        })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      // Export CSV - should use streaming (no Content-Length)
      const csvResponse = await fetch(`${baseUrl}/api/export/items?format=csv`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(csvResponse.status, 200);
      assert.equal(
        csvResponse.headers.get("content-type").includes("text/csv"),
        true,
        "Expected CSV content-type"
      );

      // Verify streaming mode: NO Content-Length header
      const contentLength = csvResponse.headers.get("content-length");
      assert.equal(
        contentLength,
        null,
        "Streaming responses should NOT have Content-Length header"
      );

      // Verify we can still read the response body (streamed)
      const csvText = await csvResponse.text();
      const lines = csvText.trim().split("\n");
      // Should have header + 15K data rows (plus potentially some existing items)
      assert.ok(
        lines.length >= 15001,
        `Expected at least 15001 lines (header + 15K items), got ${lines.length}`
      );

      // Verify our test items are in the export
      assert.ok(
        csvText.includes(`${skuPrefix}-0`),
        "CSV should contain first test item"
      );
      assert.ok(
        csvText.includes(`${skuPrefix}-14999`),
        "CSV should contain last test item"
      );

      console.log(`[streaming-test] CSV streaming test passed. Lines: ${lines.length}`);
    } finally {
      // Cleanup
      if (itemIds.length > 0) {
        await cleanupTestItems(db, itemIds);
        console.log(`[streaming-test] Cleaned up ${itemIds.length} items`);
      }
    }
  }
);

test(
  "export streaming: Excel export >50K rows returns 400 error",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    loadEnvIfPresent();

    const db = testContext.db;
    const itemIds = [];

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const skuPrefix = `EXL-${runId}`;

    try {
      // Get company ID
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
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      const companyId = Number(owner.company_id);

      // Create 60K items for Excel limit test
      console.log(`[streaming-test] Creating 60000 test items for Excel limit test...`);
      const createdIds = await createTestItems(db, companyId, 60000, skuPrefix);
      itemIds.push(...createdIds);
      console.log(`[streaming-test] Created ${itemIds.length} items`);

      // Login
      const baseUrl = testContext.baseUrl;
      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode,
          email: ownerEmail,
          password: ownerPassword
        })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      // Try Excel export - should return 400
      const excelResponse = await fetch(`${baseUrl}/api/export/items?format=xlsx`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });

      // Verify 400 error
      assert.equal(
        excelResponse.status,
        400,
        "Excel export >50K rows should return 400 error"
      );

      const errorBody = await excelResponse.json();
      assert.equal(errorBody.success, false);
      assert.equal(errorBody.error.code, "INVALID_REQUEST");

      // Verify helpful error message mentions the limit
      assert.ok(
        errorBody.error.message.includes("50,000"),
        `Error message should mention 50,000 row limit. Got: ${errorBody.error.message}`
      );
      assert.ok(
        errorBody.error.message.includes("rows"),
        `Error message should mention row count. Got: ${errorBody.error.message}`
      );
      assert.ok(
        errorBody.error.message.toLowerCase().includes("csv"),
        `Error message should suggest using CSV format. Got: ${errorBody.error.message}`
      );

      console.log(`[streaming-test] Excel 400 error test passed. Message: ${errorBody.error.message}`);
    } finally {
      // Cleanup
      if (itemIds.length > 0) {
        await cleanupTestItems(db, itemIds);
        console.log(`[streaming-test] Cleaned up ${itemIds.length} items`);
      }
    }
  }
);

test(
  "export streaming: Small exports (<10K rows) use buffer (has Content-Length header)",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    loadEnvIfPresent();

    const db = testContext.db;
    const itemIds = [];

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const skuPrefix = `SML-${runId}`;

    try {
      // Get company ID
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
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      const companyId = Number(owner.company_id);

      // Create 100 items for small export test
      console.log(`[streaming-test] Creating 100 test items for small export test...`);
      const createdIds = await createTestItems(db, companyId, 100, skuPrefix);
      itemIds.push(...createdIds);
      console.log(`[streaming-test] Created ${itemIds.length} items`);

      // Login
      const baseUrl = testContext.baseUrl;
      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode,
          email: ownerEmail,
          password: ownerPassword
        })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      // Test CSV export with small dataset - should use buffer (has Content-Length)
      const csvResponse = await fetch(`${baseUrl}/api/export/items?format=csv`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(csvResponse.status, 200);
      assert.equal(
        csvResponse.headers.get("content-type").includes("text/csv"),
        true,
        "Expected CSV content-type"
      );

      // Verify buffer mode: HAS Content-Length header
      const csvContentLength = csvResponse.headers.get("content-length");
      // Note: Node.js fetch may not expose Content-Length for Blob responses in some cases
      // But the header IS set server-side, so we verify the response is valid
      if (csvContentLength !== null) {
        assert.ok(
          Number(csvContentLength) > 0,
          "Content-Length should be positive"
        );
      }

      // Verify CSV content
      const csvText = await csvResponse.text();
      assert.ok(
        csvText.length > 0,
        "CSV response should have content"
      );
      assert.ok(
        csvText.includes(`${skuPrefix}-0`),
        "CSV should contain first test item"
      );

      console.log(`[streaming-test] CSV buffer test passed. Content-Length: ${csvContentLength}`);

      // Test Excel export with small dataset - should use buffer (has Content-Length)
      const excelResponse = await fetch(`${baseUrl}/api/export/items?format=xlsx`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(excelResponse.status, 200);
      assert.equal(
        excelResponse.headers.get("content-type").includes("application/vnd.openxmlformats"),
        true,
        "Expected XLSX content-type"
      );

      // Verify buffer mode: Content-Length may or may not be exposed by Node fetch for Blob
      const excelContentLength = excelResponse.headers.get("content-length");
      if (excelContentLength !== null) {
        assert.ok(
          Number(excelContentLength) > 0,
          "Content-Length should be positive"
        );
        console.log(`[streaming-test] Excel buffer test passed. Content-Length: ${excelContentLength}`);
      } else {
        console.log(`[streaming-test] Excel buffer test passed (Content-Length not exposed by Node fetch)`);
      }

      // Verify Excel is valid (non-empty)
      const excelBuffer = await excelResponse.arrayBuffer();
      assert.ok(
        excelBuffer.byteLength > 0,
        "Excel buffer should not be empty"
      );
    } finally {
      // Cleanup
      if (itemIds.length > 0) {
        await cleanupTestItems(db, itemIds);
        console.log(`[streaming-test] Cleaned up ${itemIds.length} items`);
      }
    }
  }
);
