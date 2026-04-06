// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Routes Tests
 *
 * Tests for sync API routes (health and check-duplicate) with DB pool cleanup.
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { sql } from "kysely";
import {
  loadEnvIfPresent,
  readEnv,
  getFreePort,
  startApiServer,
  waitForHealthcheck,
  stopApiServerSafely,
  loginOwner,
} from "../../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDb } from "../../lib/db";
import { buildLoginThrottleKeys } from "../../lib/auth-throttle";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
const TEST_OWNER_PASSWORD = readEnv("JP_OWNER_PASSWORD", null) ?? "password";

describe("Sync Routes", { concurrency: false }, () => {
  let db: ReturnType<typeof getDb>;
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;
  let baseUrl = "";
  let accessToken = "";
  let apiServer: ReturnType<typeof startApiServer> | null = null;

  async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        console.warn(`[sync.test] timeout waiting for ${label} after ${ms}ms`);
        resolve(null);
      }, ms);
    });

    const result = await Promise.race([promise, timeoutPromise]);
    if (timer) {
      clearTimeout(timer);
    }
    return result as T | null;
  }

  before(async () => {
    db = getDb();

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

    assert.ok(userRows.rows.length > 0, `Owner fixture not found; run database seed first. Looking for company=${TEST_COMPANY_CODE}, email=${TEST_OWNER_EMAIL}`);
    testUserId = Number(userRows.rows[0].user_id);
    testCompanyId = Number(userRows.rows[0].company_id);

    // Get outlet ID from outlets table
    const outletRows = await sql<{ id: number }>`
      SELECT id FROM outlets WHERE company_id = ${testCompanyId} AND code = ${TEST_OUTLET_CODE} LIMIT 1
    `.execute(db);
    assert.ok(outletRows.rows.length > 0, `Outlet ${TEST_OUTLET_CODE} not found`);
    testOutletId = Number(outletRows.rows[0].id);

    const port = await getFreePort();
    apiServer = startApiServer(port);
    baseUrl = `http://127.0.0.1:${port}`;
    await waitForHealthcheck(baseUrl, apiServer.childProcess, apiServer.serverLogs);

    accessToken = await loginOwner(
      baseUrl,
      TEST_COMPANY_CODE,
      TEST_OWNER_EMAIL,
      TEST_OWNER_PASSWORD,
    );
  });

  after(async () => {
    if (apiServer) {
      await withTimeout(stopApiServerSafely(apiServer.childProcess), 12000, "stopApiServerSafely");

      apiServer = null;
    }

    // Close HTTP keep-alive sockets opened by fetch() during integration tests.
    // Without this, node:test can wait indefinitely for active undici handles.
    try {
      // @ts-expect-error undici types may not be present in this workspace
      const { getGlobalDispatcher } = await import("undici");
      await withTimeout(getGlobalDispatcher().close(), 5000, "undici global dispatcher close");
    } catch {
      // ignore if undici API is unavailable in this runtime
    }

    await withTimeout(closeDbPool(), 10000, "closeDbPool");

    // Final safety net: release lingering active handles that can keep node:test alive.
    // This is test-only cleanup and does not affect production code paths.
    // @ts-expect-error Node internal API used for diagnostics/cleanup in tests.
    const activeHandles: unknown[] = typeof process._getActiveHandles === "function"
      // @ts-expect-error Node internal API used for diagnostics/cleanup in tests.
      ? process._getActiveHandles()
      : [];

    for (const handle of activeHandles) {
      if (handle === process.stdin || handle === process.stdout || handle === process.stderr) {
        continue;
      }

      const maybeHandle = handle as {
        close?: () => void;
        destroy?: () => void;
        unref?: () => void;
        constructor?: { name?: string };
      };

      try {
        if (typeof maybeHandle.unref === "function") {
          maybeHandle.unref();
        }

        if (typeof maybeHandle.close === "function") {
          maybeHandle.close();
        }

        if (typeof maybeHandle.destroy === "function") {
          maybeHandle.destroy();
        }
      } catch {
        // ignore cleanup errors in test teardown
      }
    }
  });

  describe("Auth Throttle Functions (used by sync)", () => {
    test("buildLoginThrottleKeys generates correct key structure for sync scenarios", () => {
      const keys = buildLoginThrottleKeys({
        companyCode: TEST_COMPANY_CODE,
        email: TEST_OWNER_EMAIL,
        ipAddress: "192.168.1.100"
      });

      assert.equal(keys.length, 2);
      assert.equal(keys[0].scope, "primary");
      assert.equal(keys[1].scope, "ip");
      assert.ok(keys[0].hash.length > 0);
      assert.ok(keys[1].hash.length > 0);
    });

    test("buildLoginThrottleKeys handles null ipAddress", () => {
      const keys = buildLoginThrottleKeys({
        companyCode: TEST_COMPANY_CODE,
        email: TEST_OWNER_EMAIL,
        ipAddress: null
      });

      assert.equal(keys.length, 2);
      assert.ok(keys[1].raw.includes("unknown"));
    });
  });

  describe("Check-Duplicate Route Logic", () => {
    test("check-duplicate query returns nothing for non-existent transaction", async () => {
      const nonExistentClientTxId = crypto.randomUUID();

      const rows = await sql<{ id: number; created_at: Date }>`
        SELECT id, created_at
         FROM pos_transactions
         WHERE company_id = ${testCompanyId} AND client_tx_id = ${nonExistentClientTxId}
         LIMIT 1
      `.execute(db);

      assert.equal(rows.rows.length, 0, "Should not find non-existent transaction");
    });

    test("check-duplicate query finds existing transaction by client_tx_id", async () => {
      const clientTxId = crypto.randomUUID();

      // Create a test transaction
      const insertResult = await sql`
        INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)
      `.execute(db);

      const transactionId = Number(insertResult.insertId);

      try {
        // Verify duplicate check finds it
        const rows = await sql<{ id: number; created_at: Date }>`
          SELECT id, created_at
           FROM pos_transactions
           WHERE company_id = ${testCompanyId} AND client_tx_id = ${clientTxId}
           LIMIT 1
        `.execute(db);

        assert.equal(rows.rows.length, 1, "Should find the transaction");
        assert.equal(rows.rows[0].id, transactionId);
        assert.ok(rows.rows[0].created_at);
      } finally {
        // Cleanup
        await sql`DELETE FROM pos_transactions WHERE id = ${transactionId}`.execute(db);
      }
    });

    test("check-duplicate is scoped to company (tenant isolation)", async () => {
      const clientTxId = crypto.randomUUID();

      // Create a transaction
      const insertResult = await sql`
        INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)
      `.execute(db);

      const transactionId = Number(insertResult.insertId);

      try {
        // Query with different company_id should not find it
        const wrongCompanyRows = await sql<{ id: number; created_at: Date }>`
          SELECT id, created_at
           FROM pos_transactions
           WHERE company_id = ${testCompanyId + 99999} AND client_tx_id = ${clientTxId}
           LIMIT 1
        `.execute(db);

        assert.equal(wrongCompanyRows.rows.length, 0, "Should not find transaction from different company");

        // Query with correct company_id should find it
        const correctRows = await sql<{ id: number; created_at: Date }>`
          SELECT id, created_at
           FROM pos_transactions
           WHERE company_id = ${testCompanyId} AND client_tx_id = ${clientTxId}
           LIMIT 1
        `.execute(db);

        assert.equal(correctRows.rows.length, 1, "Should find transaction with correct company_id");
      } finally {
        // Cleanup
        await sql`DELETE FROM pos_transactions WHERE id = ${transactionId}`.execute(db);
      }
    });

    test("unique constraint enforces company_id + client_tx_id uniqueness", async () => {
      const clientTxId = crypto.randomUUID();

      // Create first transaction
      const insertResult = await sql`
        INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)
      `.execute(db);

      const transactionId = Number(insertResult.insertId);

      try {
        // Attempt to insert duplicate should fail
        await assert.rejects(
          async () => {
            await sql`
              INSERT INTO pos_transactions (
                company_id, outlet_id, cashier_user_id, client_tx_id,
                status, service_type, trx_at, opened_at,
                discount_percent, discount_fixed, discount_code
              ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)
            `.execute(db);
          },
          (error: unknown) => {
            const mysqlError = error as { code?: string; errno?: number };
            return mysqlError.code === "ER_DUP_ENTRY" || mysqlError.errno === 1062;
          }
        );
      } finally {
        // Cleanup
        await sql`DELETE FROM pos_transactions WHERE id = ${transactionId}`.execute(db);
      }
    });

    test("same client_tx_id allowed for different companies", async () => {
      const clientTxId = crypto.randomUUID();

      // Create first transaction for current company
      const insertResult1 = await sql`
        INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)
      `.execute(db);

      const transactionId1 = Number(insertResult1.insertId);

      try {
        // Verify the unique constraint includes company_id and client_tx_id
        const constraintRows = await sql<{ COLUMN_NAME: string; SEQ_IN_INDEX: number }>`
          SELECT COLUMN_NAME, SEQ_IN_INDEX
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'pos_transactions'
             AND INDEX_NAME LIKE '%client_tx%'
           ORDER BY SEQ_IN_INDEX
        `.execute(db);

        assert.ok(constraintRows.rows.length >= 2, "Should have at least 2 columns in unique index");
        const columnNames = constraintRows.rows.map((r) => r.COLUMN_NAME);
        assert.ok(columnNames.includes("company_id"), "Unique index should include company_id");
        assert.ok(columnNames.includes("client_tx_id"), "Unique index should include client_tx_id");
      } finally {
        // Cleanup
        await sql`DELETE FROM pos_transactions WHERE id = ${transactionId1}`.execute(db);
      }
    });

    test("check-duplicate endpoint is read-only (preflight-only semantics)", async () => {
      const clientTxId = crypto.randomUUID();

      // Insert a transaction first
      const insertResult = await sql`
        INSERT INTO pos_transactions (
          company_id, outlet_id, cashier_user_id, client_tx_id,
          status, service_type, trx_at, opened_at,
          discount_percent, discount_fixed, discount_code
        ) VALUES (${testCompanyId}, ${testOutletId}, ${testUserId}, ${clientTxId}, 'COMPLETED', 'TAKEAWAY', NOW(), NOW(), 0, 0, NULL)
      `.execute(db);

      const transactionId = Number(insertResult.insertId);
      const initialUpdatedAt = await sql`SELECT updated_at FROM pos_transactions WHERE id = ${transactionId}`.execute(db);

      try {
        const response = await fetch(`${baseUrl}/api/sync/check-duplicate`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            company_id: testCompanyId,
            client_tx_id: clientTxId,
          }),
        });

        assert.equal(response.status, 200);
        const body = await response.json() as { is_duplicate: boolean; existing_id?: number };
        assert.equal(body.is_duplicate, true);
        assert.equal(body.existing_id, transactionId);

        // Verify state was NOT modified by the read operation
        const afterCheckUpdatedAt = await sql`SELECT updated_at FROM pos_transactions WHERE id = ${transactionId}`.execute(db);
        const initialTime = new Date((initialUpdatedAt.rows[0] as { updated_at: Date }).updated_at).getTime();
        const afterCheckTime = new Date((afterCheckUpdatedAt.rows[0] as { updated_at: Date }).updated_at).getTime();

        // Timestamps should be exactly the same (no update occurred)
        assert.equal(afterCheckTime, initialTime, "Read operation should not modify updated_at timestamp");

        // Count should remain exactly 1 (no duplicate created)
        const countResult = await sql`SELECT COUNT(*) as cnt FROM pos_transactions WHERE company_id = ${testCompanyId} AND client_tx_id = ${clientTxId}`.execute(db);
        const count = Number((countResult.rows[0] as { cnt: number }).cnt);
        assert.equal(count, 1, "Read operation should not create duplicate entry");
      } finally {
        // Cleanup
        await sql`DELETE FROM pos_transactions WHERE id = ${transactionId}`.execute(db);
      }
    });
  });

  describe("Sync Pull Route Integration", { concurrency: false }, () => {
    // Note: These tests verify the canonical runtime path for /api/sync/pull
    // They complement the module-level tests in pos-sync-module.integration.test.ts

    test("GET /api/sync/pull returns data_version in response (sync contract)", async () => {
      const response = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${testOutletId}&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }
      );

      assert.equal(response.status, 200, "Should return 200 OK");

      const body = await response.json() as { success: boolean; data?: { data_version: number } };
      assert.equal(body.success, true, "Response should indicate success");
      assert.ok(body.data, "Response should have data object");
      assert.ok(typeof body.data!.data_version === "number", "data_version should be a number");
      assert.ok(body.data!.data_version >= 0, "data_version should be non-negative");
    });

    test("GET /api/sync/pull respects since_version parameter (incremental sync)", async () => {
      // First, get current data_version
      const fullSyncResponse = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${testOutletId}&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }
      );

      assert.equal(fullSyncResponse.status, 200);
      const fullBody = await fullSyncResponse.json() as { success: boolean; data?: { data_version: number } };
      const fullSyncVersion = fullBody.data!.data_version;

      // Now call with since_version = fullSyncVersion (should return same or higher)
      const incrementalResponse = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${testOutletId}&since_version=${fullSyncVersion}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }
      );

      assert.equal(incrementalResponse.status, 200);
      const incrementalBody = await incrementalResponse.json() as { success: boolean; data?: { data_version: number } };
      assert.ok(
        incrementalBody.data!.data_version >= fullSyncVersion,
        "Subsequent sync version should be >= previous version"
      );
    });

    test("GET /api/sync/pull returns variants array in payload", async () => {
      const response = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${testOutletId}&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }
      );

      assert.equal(response.status, 200);
      const body = await response.json() as {
        success: boolean;
        data?: {
          variants: Array<{
            id: number;
            item_id: number;
            sku: string;
            variant_name: string;
            price: number;
            stock_quantity: number;
            barcode: string | null;
            is_active: boolean;
            attributes: Record<string, string>;
          }>;
        };
      };

      assert.ok(Array.isArray(body.data!.variants), "variants should be an array");
      // Variants may be empty in test DB, but structure should be correct
      for (const variant of body.data!.variants) {
        assert.ok(typeof variant.id === "number", "variant.id should be a number");
        assert.ok(typeof variant.item_id === "number", "variant.item_id should be a number");
        assert.ok(typeof variant.sku === "string", "variant.sku should be a string");
        assert.ok(typeof variant.variant_name === "string", "variant.variant_name should be a string");
        assert.ok(typeof variant.price === "number", "variant.price should be a number");
        assert.ok(typeof variant.stock_quantity === "number", "variant.stock_quantity should be a number");
        assert.ok(typeof variant.is_active === "boolean", "variant.is_active should be a boolean");
        assert.ok(typeof variant.attributes === "object", "variant.attributes should be an object");
      }
    });

    test("GET /api/sync/pull returns variant_prices array in payload", async () => {
      const response = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${testOutletId}&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }
      );

      assert.equal(response.status, 200);
      const body = await response.json() as {
        success: boolean;
        data?: {
          variant_prices: Array<{
            id: number;
            item_id: number;
            variant_id: number | null;
            outlet_id: number;
            price: number;
            is_active: boolean;
          }>;
        };
      };

      assert.ok(Array.isArray(body.data!.variant_prices), "variant_prices should be an array");
      for (const vp of body.data!.variant_prices) {
        assert.ok(typeof vp.id === "number", "variant_prices[].id should be a number");
        assert.ok(typeof vp.item_id === "number", "variant_prices[].item_id should be a number");
        assert.ok(typeof vp.outlet_id === "number", "variant_prices[].outlet_id should be a number");
        assert.ok(typeof vp.price === "number", "variant_prices[].price should be a number");
        assert.ok(typeof vp.is_active === "boolean", "variant_prices[].is_active should be a boolean");
      }
    });

    test("GET /api/sync/pull thumbnail_url is null (thumbnails fetched separately)", async () => {
      // Per canonical sync contract, thumbnails are NOT included in pull payload
      // They are fetched via separate endpoint/flow
      const response = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${testOutletId}&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }
      );

      assert.equal(response.status, 200);
      const body = await response.json() as {
        success: boolean;
        data?: {
          items: Array<{ thumbnail_url: string | null }>;
        };
      };

      // Verify thumbnail_url is null in items (canonical behavior)
      for (const item of body.data!.items) {
        assert.ok(
          item.thumbnail_url === null,
          "Item thumbnail_url should be null (thumbnails fetched separately)"
        );
      }
    });

    test("GET /api/sync/pull returns created variants and variant_prices for requested outlet", async () => {
      // Use test fixtures library to create item + variant
      const { createTestItem, createTestVariant } = await import("../../lib/test-fixtures.js");

      const testItem = await createTestItem(testCompanyId, {
        sku: `SYNC-TEST-${Date.now().toString(36)}`,
        name: `Sync Test Item ${Date.now().toString(36)}`,
      });

      const testVariant = await createTestVariant(testItem.id);

      // Create variant price for requested outlet (using item_prices table with variant_id)
      const vpInsert = await sql`
        INSERT INTO item_prices (company_id, item_id, variant_id, outlet_id, price, is_active)
        VALUES (${testCompanyId}, ${testItem.id}, ${testVariant.id}, ${testOutletId}, 15000, 1)
      `.execute(db);
      const testVariantPriceId = Number(vpInsert.insertId);

      try {
        // Pull sync and verify our created data is returned
        const response = await fetch(
          `${baseUrl}/api/sync/pull?outlet_id=${testOutletId}&since_version=0`,
          {
            headers: {
              authorization: `Bearer ${accessToken}`,
            },
          }
        );

        assert.equal(response.status, 200);
        const body = await response.json() as {
          success: boolean;
          data?: {
            variants: Array<{ id: number; item_id: number; sku: string }>;
            variant_prices: Array<{ id: number; item_id: number; variant_id: number | null; outlet_id: number; price: number }>;
          };
        };

        assert.ok(Array.isArray(body.data!.variants), "variants should be an array");
        assert.ok(Array.isArray(body.data!.variant_prices), "variant_prices should be an array");

        // Verify our created variant is in the response
        const ourVariant = body.data!.variants.find((v) => v.id === testVariant.id);
        assert.ok(ourVariant, `Created variant ${testVariant.id} should be in response`);
        assert.equal(ourVariant!.item_id, testItem.id, "Variant should belong to our item");

        // Verify our created variant price is in the response
        const ourVariantPrice = body.data!.variant_prices.find((vp) => vp.id === testVariantPriceId);
        assert.ok(ourVariantPrice, `Created variant price ${testVariantPriceId} should be in response`);
        assert.equal(ourVariantPrice!.item_id, testItem.id, "Variant price should belong to our item");
        assert.equal(ourVariantPrice!.variant_id, testVariant.id, "Variant price should belong to our variant");
        assert.equal(ourVariantPrice!.outlet_id, testOutletId, "Variant price should belong to requested outlet");
        assert.equal(ourVariantPrice!.price, 15000, "Variant price should have correct price");
      } finally {
        // Cleanup variant price
        await sql`DELETE FROM item_prices WHERE id = ${testVariantPriceId}`.execute(db);
      }
    });

    test("GET /api/sync/pull excludes variant_prices from other outlets (outlet scoping)", async () => {
      // Find or create a second outlet to prove exclusion deterministically
      let createdOutletId: number | null = null;
      const otherOutletRows = await sql`SELECT id FROM outlets WHERE company_id = ${testCompanyId} AND id != ${testOutletId} LIMIT 1`.execute(db);
      let otherOutletId: number;
      if (otherOutletRows.rows.length > 0) {
        otherOutletId = Number((otherOutletRows.rows[0] as { id: number }).id);
      } else {
        const { createTestOutletMinimal } = await import("../../lib/test-fixtures.js");
        const createdOutlet = await createTestOutletMinimal(testCompanyId);
        otherOutletId = createdOutlet.id;
        createdOutletId = createdOutlet.id;
      }

      // Use test fixtures library to create item + variant for other outlet
      const { createTestItem, createTestVariant } = await import("../../lib/test-fixtures.js");

      const testItem = await createTestItem(testCompanyId, {
        sku: `SYNC-OTHER-${Date.now().toString(36)}`,
        name: `Sync Other Outlet Item ${Date.now().toString(36)}`,
      });

      const testVariant = await createTestVariant(testItem.id);

      // Create variant price for OTHER outlet (not the requested one)
      const vpInsert = await sql`
        INSERT INTO item_prices (company_id, item_id, variant_id, outlet_id, price, is_active)
        VALUES (${testCompanyId}, ${testItem.id}, ${testVariant.id}, ${otherOutletId}, 20000, 1)
      `.execute(db);
      const otherOutletVariantPriceId = Number(vpInsert.insertId);

      try {
        // Pull sync for the REQUESTED outlet (not otherOutletId)
        const response = await fetch(
          `${baseUrl}/api/sync/pull?outlet_id=${testOutletId}&since_version=0`,
          {
            headers: {
              authorization: `Bearer ${accessToken}`,
            },
          }
        );

        assert.equal(response.status, 200);
        const body = await response.json() as {
          success: boolean;
          data?: {
            variant_prices: Array<{ id: number; outlet_id: number }>;
          };
        };

        // Verify the variant price from other outlet is NOT in the response
        const otherOutletVp = body.data!.variant_prices.find((vp) => vp.id === otherOutletVariantPriceId);
        assert.ok(
          otherOutletVp === undefined,
          `Variant price ${otherOutletVariantPriceId} from other outlet ${otherOutletId} should be excluded`
        );

        // Verify all returned variant_prices belong to the requested outlet
        for (const vp of body.data!.variant_prices) {
          assert.equal(
            vp.outlet_id,
            testOutletId,
            `All variant_prices should belong to requested outlet ${testOutletId}, but found outlet ${vp.outlet_id}`
          );
        }
      } finally {
        // Cleanup variant price
        await sql`DELETE FROM item_prices WHERE id = ${otherOutletVariantPriceId}`.execute(db);
        if (createdOutletId !== null) {
          await sql`DELETE FROM outlets WHERE id = ${createdOutletId}`.execute(db);
        }
      }
    });

    test("GET /api/sync/pull incremental sync gates change-based sections but preserves always-present arrays", async () => {
      // First pull to get baseline version
      const firstResponse = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${testOutletId}&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }
      );

      assert.equal(firstResponse.status, 200);
      const firstBody = await firstResponse.json() as {
        success: boolean;
        data?: {
          data_version: number;
          items: unknown[];
          item_groups: unknown[];
          prices: unknown[];
          variant_prices: unknown[];
          config: unknown;
          tables: unknown[];
          reservations: unknown[];
          variants: unknown[];
          open_orders: unknown[];
          open_order_lines: unknown[];
          order_updates: unknown[];
          orders_cursor: number | null;
        };
      };

      const sinceVersion = firstBody.data!.data_version;

      // Second pull with since_version should return same version (no changes)
      const secondResponse = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${testOutletId}&since_version=${sinceVersion}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }
      );

      assert.equal(secondResponse.status, 200);
      const secondBody = await secondResponse.json() as {
        success: boolean;
        data?: {
          data_version: number;
          items: unknown[];
          item_groups: unknown[];
          prices: unknown[];
          variant_prices: unknown[];
          config: unknown;
          tables: unknown[];
          reservations: unknown[];
          variants: unknown[];
          open_orders: unknown[];
          open_order_lines: unknown[];
          order_updates: unknown[];
          orders_cursor: number | null;
        };
      };

      // Version should be >= sinceVersion (canonical contract)
      assert.ok(
        secondBody.data!.data_version >= sinceVersion,
        `data_version ${secondBody.data!.data_version} should be >= since_version ${sinceVersion}`
      );

      // Change-gated sections (items, item_groups) should be empty arrays when no changes occurred
      // Per runtime behavior, these sections are gated by changes since version
      assert.ok(
        Array.isArray(secondBody.data!.items) && secondBody.data!.items.length === 0,
        "items should be empty array for incremental sync with no changes"
      );
      assert.ok(
        Array.isArray(secondBody.data!.item_groups) && secondBody.data!.item_groups.length === 0,
        "item_groups should be empty array for incremental sync with no changes"
      );

      // Required always-present sections should remain arrays (even if empty)
      assert.ok(Array.isArray(secondBody.data!.prices), "prices should always be an array");
      assert.ok(Array.isArray(secondBody.data!.variant_prices), "variant_prices should always be an array");
      assert.ok(Array.isArray(secondBody.data!.tables), "tables should always be an array");
      assert.ok(Array.isArray(secondBody.data!.reservations), "reservations should always be an array");
      assert.ok(Array.isArray(secondBody.data!.variants), "variants should always be an array");
      assert.ok(Array.isArray(secondBody.data!.open_orders), "open_orders should always be an array");
      assert.ok(Array.isArray(secondBody.data!.open_order_lines), "open_order_lines should always be an array");
      assert.ok(Array.isArray(secondBody.data!.order_updates), "order_updates should always be an array");
    });

    test("GET /api/sync/pull enforces outlet scoping (tables scoped to outlet)", async () => {
      const response = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${testOutletId}&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }
      );

      assert.equal(response.status, 200);
      const body = await response.json() as {
        success: boolean;
        data?: {
          tables: Array<{ table_id: number; code: string }>;
        };
      };

      assert.ok(Array.isArray(body.data!.tables), "tables should be an array");

      for (const table of body.data!.tables) {
        const tableRows = await sql<{ outlet_id: number }>`
          SELECT outlet_id
          FROM outlet_tables
          WHERE id = ${table.table_id}
          LIMIT 1
        `.execute(db);

        assert.equal(tableRows.rows.length, 1, "Table should exist in outlet_tables");
        assert.equal(
          Number(tableRows.rows[0].outlet_id),
          testOutletId,
          "Returned table must belong to requested outlet"
        );
      }
    });

    test("GET /api/sync/pull returns all required payload sections", async () => {
      const response = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${testOutletId}&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }
      );

      assert.equal(response.status, 200);
      const body = await response.json() as {
        success: boolean;
        data?: Record<string, unknown>;
      };

      // Verify all required sections per SyncPullPayloadSchema
      const requiredSections = [
        "data_version",
        "items",
        "item_groups",
        "prices",
        "variant_prices",
        "config",
        "tables",
        "reservations",
        "variants",
        "open_orders",
        "open_order_lines",
        "order_updates",
        "orders_cursor",
      ];

      for (const section of requiredSections) {
        assert.ok(
          section in body.data!,
          `Payload should contain '${section}' section`
        );
      }
    });

    test("GET /api/sync/pull rejects request without outlet_id", async () => {
      const response = await fetch(`${baseUrl}/api/sync/pull`, {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Should return 400 Bad Request
      assert.equal(response.status, 400, "Should return 400 for missing outlet_id");
    });

    test("GET /api/sync/pull rejects request without authentication", async () => {
      const response = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${testOutletId}&since_version=0`
      );

      // Should return 401 Unauthorized
      assert.equal(response.status, 401, "Should return 401 without auth");
    });
  });

  describe("Sync Module Health Check", () => {
    test("checkSyncModuleHealth function exists and returns expected structure", async () => {
      const { checkSyncModuleHealth } = await import("../../lib/sync-modules");

      const health = await checkSyncModuleHealth();

      assert.ok(typeof health.healthy === "boolean", "Should return healthy boolean");
      assert.ok(typeof health.modules === "object", "Should return modules object");
      assert.ok("batchProcessor" in health, "Should return batchProcessor status");
    });
  });
});

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
