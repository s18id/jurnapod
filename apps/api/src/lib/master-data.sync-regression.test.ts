// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Pull Master Data Regression Tests
 *
 * Tests for lib/sync/master-data.ts — the extracted and Kysely-migrated
 * sync pull helpers. Verifies payload shape, timestamp formats, and data
 * correctness after migration from lib/master-data.ts.
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "./db";
import { buildSyncPullPayload } from "./sync/master-data";
import { listActiveReservations } from "./sync/master-data";
import { listItems } from "./sync/master-data";
import { listItemGroups } from "./sync/master-data";
import { listOutletTables } from "./sync/master-data";
import { getCompanyDataVersion } from "./sync/master-data";
import type { RowDataPacket } from "mysql2";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";

describe("Sync Pull Master Data — Regression Suite", { concurrency: false }, () => {
  let companyId = 0;
  let outletId = 0;

  test("setup: resolve test company and outlet fixtures", async () => {
    const pool = getDbPool();
    const [companyRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM companies WHERE code = ? LIMIT 1`,
      [TEST_COMPANY_CODE]
    );
    assert.ok(companyRows.length > 0, "Company fixture not found");
    companyId = Number(companyRows[0].id);

    const [outletRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM outlets WHERE company_id = ? AND code = ? LIMIT 1`,
      [companyId, TEST_OUTLET_CODE]
    );
    assert.ok(outletRows.length > 0, "Outlet fixture not found");
    outletId = Number(outletRows[0].id);
  });

  // --------------------------------------------------------------------------
  // buildSyncPullPayload — payload structure
  // --------------------------------------------------------------------------

  describe("buildSyncPullPayload — payload structure", () => {
    test("returns all required payload sections", async () => {
      const payload = await buildSyncPullPayload(companyId, outletId, 0);

      const requiredSections = [
        "data_version",
        "items",
        "item_groups",
        "prices",
        "config",
        "open_orders",
        "open_order_lines",
        "order_updates",
        "orders_cursor",
        "tables",
        "reservations",
        "variants"
      ] as const;

      for (const section of requiredSections) {
        assert.ok(
          section in payload,
          `Payload must contain section: ${section}`
        );
      }
    });

    test("data_version is a non-negative number", async () => {
      const payload = await buildSyncPullPayload(companyId, outletId, 0);
      assert.strictEqual(
        typeof payload.data_version,
        "number",
        "data_version must be a number"
      );
      assert.ok(
        payload.data_version >= 0,
        "data_version must be non-negative"
      );
    });

    test("items array entries have required fields", async () => {
      const payload = await buildSyncPullPayload(companyId, outletId, 0);
      if (payload.items.length === 0) {
        assert.ok(true, "No items in payload — skip field check");
        return;
      }

      const item = payload.items[0]!;
      assert.ok("id" in item, "item.id must exist");
      assert.ok("name" in item, "item.name must exist");
      assert.ok("type" in item, "item.type must exist");
      assert.ok("is_active" in item, "item.is_active must exist");
      assert.ok("updated_at" in item, "item.updated_at must exist");
    });

    test("item_groups array entries have required fields", async () => {
      const payload = await buildSyncPullPayload(companyId, outletId, 0);
      if (payload.item_groups.length === 0) {
        assert.ok(true, "No item_groups in payload — skip field check");
        return;
      }

      const group = payload.item_groups[0]!;
      assert.ok("id" in group, "group.id must exist");
      assert.ok("name" in group, "group.name must exist");
      assert.ok("is_active" in group, "group.is_active must exist");
      assert.ok("updated_at" in group, "group.updated_at must exist");
    });

    test("prices array entries have required fields", async () => {
      const payload = await buildSyncPullPayload(companyId, outletId, 0);
      if (payload.prices.length === 0) {
        assert.ok(true, "No prices in payload — skip field check");
        return;
      }

      const price = payload.prices[0]!;
      assert.ok("id" in price, "price.id must exist");
      assert.ok("item_id" in price, "price.item_id must exist");
      assert.ok("price" in price, "price.price must exist");
      assert.ok("is_active" in price, "price.is_active must exist");
      assert.ok("updated_at" in price, "price.updated_at must exist");
    });

    test("config has required tax and payment_methods fields", async () => {
      const payload = await buildSyncPullPayload(companyId, outletId, 0);
      const { config } = payload;

      assert.ok("tax" in config, "config.tax must exist");
      assert.ok("tax_rates" in config, "config.tax_rates must exist");
      assert.ok("default_tax_rate_ids" in config, "config.default_tax_rate_ids must exist");
      assert.ok("payment_methods" in config, "config.payment_methods must exist");
      assert.ok(Array.isArray(config.payment_methods), "payment_methods must be an array");
    });

    test("orders_cursor is a number", async () => {
      const payload = await buildSyncPullPayload(companyId, outletId, 0);
      assert.strictEqual(
        typeof payload.orders_cursor,
        "number",
        "orders_cursor must be a number"
      );
      assert.ok(
        payload.orders_cursor >= 0,
        "orders_cursor must be non-negative"
      );
    });

    test("tables array entries have required fields", async () => {
      const payload = await buildSyncPullPayload(companyId, outletId, 0);
      if (payload.tables.length === 0) {
        assert.ok(true, "No tables in payload — skip field check");
        return;
      }

      const table = payload.tables[0]!;
      assert.ok("table_id" in table, "table.table_id must exist");
      assert.ok("code" in table, "table.code must exist");
      assert.ok("status" in table, "table.status must exist");
      assert.ok("updated_at" in table, "table.updated_at must exist");
    });
  });

  // --------------------------------------------------------------------------
  // buildSyncPullPayload — timestamp format regression
  // --------------------------------------------------------------------------

  describe("buildSyncPullPayload — timestamp format regression", () => {
    test("reservation_at in reservations is a non-empty string (not RFC3339 ISO)", async () => {
      const payload = await buildSyncPullPayload(companyId, outletId, 0);
      if (payload.reservations.length === 0) {
        assert.ok(true, "No reservations in payload — skip reservation_at check");
        return;
      }

      const reservation = payload.reservations[0]!;
      assert.strictEqual(
        typeof reservation.reservation_at,
        "string",
        "reservation_at must be a string"
      );
      assert.ok(
        (reservation.reservation_at as string).length > 0,
        "reservation_at must be non-empty"
      );
      // Original format is MySQL DATETIME string: 'YYYY-MM-DD HH:mm:ss'
      // NOT ISO 8601 / RFC3339
      assert.match(
        reservation.reservation_at as string,
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        "reservation_at must be MySQL DATETIME format (YYYY-MM-DD HH:mm:ss)"
      );
    });

    test("updated_at in reservations is a string", async () => {
      const payload = await buildSyncPullPayload(companyId, outletId, 0);
      if (payload.reservations.length === 0) {
        assert.ok(true, "No reservations in payload — skip updated_at check");
        return;
      }

      const reservation = payload.reservations[0]!;
      assert.strictEqual(
        typeof reservation.updated_at,
        "string",
        "reservation.updated_at must be a string"
      );
      assert.ok(
        reservation.updated_at.length > 0,
        "reservation.updated_at must be non-empty"
      );
    });

    test("updated_at in items is a string", async () => {
      const payload = await buildSyncPullPayload(companyId, outletId, 0);
      if (payload.items.length === 0) {
        assert.ok(true, "No items in payload — skip updated_at check");
        return;
      }

      const item = payload.items[0]!;
      assert.strictEqual(
        typeof item.updated_at,
        "string",
        "item.updated_at must be a string"
      );
    });
  });

  // --------------------------------------------------------------------------
  // buildSyncPullPayload — "no changes" branch
  // --------------------------------------------------------------------------

  describe("buildSyncPullPayload — no-changes branch (version gating)", () => {
    test("when currentVersion <= sinceVersion, returns empty items/prices/groups but still returns tables/reservations/variants", async () => {
      // Use a very high sinceVersion to trigger the no-changes branch
      const payload = await buildSyncPullPayload(companyId, outletId, 999999999);

      assert.deepStrictEqual(
        payload.items,
        [],
        "items must be empty in no-changes branch"
      );
      assert.deepStrictEqual(
        payload.item_groups,
        [],
        "item_groups must be empty in no-changes branch"
      );
      assert.deepStrictEqual(
        payload.prices,
        [],
        "prices must be empty in no-changes branch"
      );

      // tables, reservations, variants should still be populated
      assert.ok(
        Array.isArray(payload.tables),
        "tables must still be an array in no-changes branch"
      );
      assert.ok(
        Array.isArray(payload.reservations),
        "reservations must still be an array in no-changes branch"
      );
      assert.ok(
        Array.isArray(payload.variants),
        "variants must still be an array in no-changes branch"
      );
    });
  });

  // --------------------------------------------------------------------------
  // Individual helper functions
  // --------------------------------------------------------------------------

  describe("listActiveReservations — reservation_at format", () => {
    test("returns reservation_at as MySQL DATETIME string", async () => {
      const reservations = await listActiveReservations(companyId, outletId);
      if (reservations.length === 0) {
        assert.ok(true, "No reservations in test outlet — skip");
        return;
      }

      const r = reservations[0]!;
      assert.strictEqual(
        typeof r.reservation_at,
        "string",
        "reservation_at must be string"
      );
      assert.match(
        r.reservation_at,
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        "reservation_at must be MySQL DATETIME format"
      );
    });

    test("returns all required fields", async () => {
      const reservations = await listActiveReservations(companyId, outletId);
      if (reservations.length === 0) {
        assert.ok(true, "No reservations in test outlet — skip");
        return;
      }

      const r = reservations[0]!;
      assert.ok("reservation_id" in r, "reservation_id must exist");
      assert.ok("customer_name" in r, "customer_name must exist");
      assert.ok("guest_count" in r, "guest_count must exist");
      assert.ok("status" in r, "status must exist");
      assert.ok("updated_at" in r, "updated_at must exist");
    });
  });

  describe("listItems — return shape", () => {
    test("returns items with all required fields", async () => {
      const items = await listItems(companyId, { isActive: true });
      if (items.length === 0) {
        assert.ok(true, "No items in test company — skip");
        return;
      }

      const item = items[0]!;
      assert.ok("id" in item, "id must exist");
      assert.ok("name" in item, "name must exist");
      assert.ok("type" in item, "type must exist");
      assert.ok("is_active" in item, "is_active must exist");
      assert.strictEqual(typeof item.is_active, "boolean", "is_active must be boolean");
      assert.ok("updated_at" in item, "updated_at must exist");
      assert.strictEqual(typeof item.updated_at, "string", "updated_at must be string");
    });
  });

  describe("listItemGroups — return shape", () => {
    test("returns groups with all required fields", async () => {
      const groups = await listItemGroups(companyId);
      if (groups.length === 0) {
        assert.ok(true, "No item groups in test company — skip");
        return;
      }

      const g = groups[0]!;
      assert.ok("id" in g, "id must exist");
      assert.ok("name" in g, "name must exist");
      assert.ok("is_active" in g, "is_active must exist");
      assert.strictEqual(typeof g.is_active, "boolean", "is_active must be boolean");
      assert.ok("updated_at" in g, "updated_at must exist");
      assert.strictEqual(typeof g.updated_at, "string", "updated_at must be string");
    });
  });

  describe("listOutletTables — return shape", () => {
    test("returns tables with all required fields", async () => {
      const tables = await listOutletTables(companyId, outletId);

      // table_id must be present (mapped from id)
      assert.ok(
        tables.every((t) => "table_id" in t),
        "table_id must exist on all table entries"
      );
      assert.ok(
        tables.every((t) => "code" in t),
        "code must exist on all table entries"
      );
      assert.ok(
        tables.every((t) => "status" in t),
        "status must exist on all table entries"
      );
    });
  });

  describe("getCompanyDataVersion — return shape", () => {
    test("returns a non-negative number", async () => {
      const version = await getCompanyDataVersion(companyId);
      assert.strictEqual(typeof version, "number", "version must be a number");
      assert.ok(version >= 0, "version must be non-negative");
    });
  });
});

test.after(async () => {
  await closeDbPool();
});
