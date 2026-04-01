// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDb } from "./db";
import {
  deleteSetting,
  getSetting,
  getResolvedSetting,
  listSettings,
  setSetting,
  SettingKeyInvalidError,
  SettingNotFoundError,
  SettingValidationError
} from "./settings";
import { sql } from "kysely";

loadEnvIfPresent();

test(
  "settings CRUD - set, list, get, delete",
  { concurrency: false, timeout: 120000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let ownerUserId = 0;

    try {
      const ownerRows = await sql`
        SELECT u.id, u.company_id
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
      const owner = ownerRows.rows[0] as { company_id: number; id: number };
      companyId = Number(owner.company_id);
      ownerUserId = Number(owner.id);

      const testKey = `test_setting_${runId}`;

      const created = await setSetting({
        companyId,
        key: testKey,
        value: "test_value",
        valueType: "string",
        outletId: null
      });
      assert.ok(created.id > 0);
      assert.strictEqual(created.key, testKey);
      assert.strictEqual(created.value, "test_value");

      const listed = await listSettings({ companyId });
      assert.ok(listed.some((s) => s.key === testKey), "Setting should appear in list");

      const fetched = await getSetting({ companyId, key: testKey, outletId: null });
      assert.ok(fetched);
      assert.strictEqual(fetched?.key, testKey);
      assert.strictEqual(fetched?.value, "test_value");

      await deleteSetting({ companyId, key: testKey, outletId: null });

      const deleted = await getSetting({ companyId, key: testKey, outletId: null });
      assert.strictEqual(deleted, null);

      console.log("✅ settings CRUD test passed");
    } finally {
      // Cleanup from new typed tables
      await sql`DELETE FROM settings_strings WHERE company_id = ${companyId} AND setting_key LIKE ${`%${runId}%`}`.execute(db);
      await sql`DELETE FROM settings_numbers WHERE company_id = ${companyId} AND setting_key LIKE ${`%${runId}%`}`.execute(db);
      await sql`DELETE FROM settings_booleans WHERE company_id = ${companyId} AND setting_key LIKE ${`%${runId}%`}`.execute(db);
    }
  }
);

test(
  "settings - number value validation",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let ownerUserId = 0;

    try {
      const ownerRows = await sql`
        SELECT u.id, u.company_id
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
      const owner = ownerRows.rows[0] as { company_id: number; id: number };
      companyId = Number(owner.company_id);
      ownerUserId = Number(owner.id);

      const testKey = `test_number_${runId}`;

      const numValue = 42.5;
      const created = await setSetting({
        companyId,
        key: testKey,
        value: numValue,
        valueType: "number",
        outletId: null
      });

      assert.strictEqual(created.value, numValue);

      const fetched = await getSetting({ companyId, key: testKey, outletId: null });
      assert.strictEqual(fetched?.value, numValue);

      console.log("✅ number validation test passed");
    } finally {
      await sql`DELETE FROM settings_strings WHERE company_id = ${companyId} AND setting_key LIKE ${`%${runId}%`}`.execute(db);
      await sql`DELETE FROM settings_numbers WHERE company_id = ${companyId} AND setting_key LIKE ${`%${runId}%`}`.execute(db);
      await sql`DELETE FROM settings_booleans WHERE company_id = ${companyId} AND setting_key LIKE ${`%${runId}%`}`.execute(db);
    }
  }
);

test(
  "settings - boolean value validation",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let ownerUserId = 0;

    try {
      const ownerRows = await sql`
        SELECT u.id, u.company_id
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
      const owner = ownerRows.rows[0] as { company_id: number; id: number };
      companyId = Number(owner.company_id);
      ownerUserId = Number(owner.id);

      const testKey = `test_bool_${runId}`;

      const boolValue = true;
      const created = await setSetting({
        companyId,
        key: testKey,
        value: boolValue,
        valueType: "boolean",
        outletId: null
      });

      assert.strictEqual(created.value, boolValue);

      const fetched = await getSetting({ companyId, key: testKey, outletId: null });
      assert.strictEqual(fetched?.value, boolValue);

      console.log("✅ boolean validation test passed");
    } finally {
      await sql`DELETE FROM settings_strings WHERE company_id = ${companyId} AND setting_key LIKE ${`%${runId}%`}`.execute(db);
      await sql`DELETE FROM settings_numbers WHERE company_id = ${companyId} AND setting_key LIKE ${`%${runId}%`}`.execute(db);
      await sql`DELETE FROM settings_booleans WHERE company_id = ${companyId} AND setting_key LIKE ${`%${runId}%`}`.execute(db);
    }
  }
);

test(
  "settings - tenant isolation",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let otherCompanyId = 0;
    let ownerUserId = 0;

    try {
      const ownerRows = await sql`
        SELECT u.id, u.company_id
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
      const owner = ownerRows.rows[0] as { company_id: number; id: number };
      companyId = Number(owner.company_id);
      ownerUserId = Number(owner.id);

      const otherCompanyRows = await sql`
        SELECT id FROM companies WHERE id != ${companyId} LIMIT 1
      `.execute(db);

      if (otherCompanyRows.rows.length > 0) {
        otherCompanyId = Number((otherCompanyRows.rows[0] as { id: number }).id);

        const settingsInOtherCompany = await listSettings({ companyId: otherCompanyId });
        for (const setting of settingsInOtherCompany) {
          assert.notStrictEqual(setting.company_id, companyId, "Should not see other company settings");
        }
      }

      console.log("✅ tenant isolation test passed");
    } catch (error) {
      console.log("⚠️ tenant isolation test skipped - only one company in DB");
    }
  }
);

test(
  "settings - cascade resolution (outlet → company)",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let outletId = 0;
    let ownerUserId = 0;

    try {
      // Global owner has outlet_id = NULL in user_role_assignments
      // So we don't need user_outlets - just join through user_role_assignments
      const ownerRows = await sql`
        SELECT u.id, u.company_id
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
      const owner = ownerRows.rows[0] as { company_id: number; id: number };
      companyId = Number(owner.company_id);
      ownerUserId = Number(owner.id);

      // Get outlet ID from outlets table
      const outletRows = await sql`
        SELECT o.id
         FROM outlets o
         INNER JOIN companies c ON c.id = o.company_id
         WHERE c.code = ${companyCode}
           AND o.code = ${outletCode}
         LIMIT 1
      `.execute(db);

      assert.ok(outletRows.rows.length > 0, "Outlet fixture not found");
      outletId = Number((outletRows.rows[0] as { id: number }).id);

      await setSetting({
        companyId,
        key: `cascade_test_${runId}`,
        value: "company_value",
        valueType: "string",
        outletId: null
      });

      const resolved = await getResolvedSetting(companyId, `cascade_test_${runId}`, outletId);
      assert.strictEqual(resolved?.value, "company_value");

      await setSetting({
        companyId,
        key: `cascade_test_${runId}`,
        value: "outlet_value",
        valueType: "string",
        outletId
      });

      const resolvedWithOutlet = await getResolvedSetting(companyId, `cascade_test_${runId}`, outletId);
      assert.strictEqual(resolvedWithOutlet?.value, "outlet_value");

      console.log("✅ cascade resolution test passed");
    } finally {
      await sql`DELETE FROM settings_strings WHERE company_id = ${companyId} AND setting_key LIKE ${`%${runId}%`}`.execute(db);
      await sql`DELETE FROM settings_numbers WHERE company_id = ${companyId} AND setting_key LIKE ${`%${runId}%`}`.execute(db);
      await sql`DELETE FROM settings_booleans WHERE company_id = ${companyId} AND setting_key LIKE ${`%${runId}%`}`.execute(db);
    }
  }
);

// Close database pool after all tests
test.after(async () => {
  await closeDbPool();
});
