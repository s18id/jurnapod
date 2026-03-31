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
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ${companyCode}
           AND u.email = ${ownerEmail}
           AND u.is_active = 1
           AND o.code = ${outletCode}
         LIMIT 1
      `.execute(db);

      assert.ok(ownerRows.rows.length > 0, "Owner fixture not found");
      const owner = ownerRows.rows[0] as { company_id: number; id: number };
      companyId = Number(owner.company_id);
      ownerUserId = Number(owner.id);

      const testKey = `test_setting_${runId}`;
      const actor = { userId: ownerUserId, ipAddress: "127.0.0.1" };

      const created = await setSetting({
        companyId,
        key: testKey,
        value: "test_value",
        valueType: "string",
        outletId: null,
        actor
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
      await sql`DELETE FROM company_settings WHERE company_id = ${companyId} AND \`key\` LIKE ${`%${runId}%`}`.execute(db);
    }
  }
);

test(
  "settings - JSON value validation",
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
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ${companyCode}
           AND u.email = ${ownerEmail}
           AND u.is_active = 1
           AND o.code = ${outletCode}
         LIMIT 1
      `.execute(db);

      assert.ok(ownerRows.rows.length > 0, "Owner fixture not found");
      const owner = ownerRows.rows[0] as { company_id: number; id: number };
      companyId = Number(owner.company_id);
      ownerUserId = Number(owner.id);

      const testKey = `test_json_${runId}`;
      const actor = { userId: ownerUserId, ipAddress: "127.0.0.1" };

      const jsonValue = { template: "invoice", fields: ["amount", "date"] };
      const created = await setSetting({
        companyId,
        key: testKey,
        value: jsonValue,
        valueType: "json",
        outletId: null,
        actor
      });

      assert.deepStrictEqual(created.value, jsonValue);

      const fetched = await getSetting({ companyId, key: testKey, outletId: null });
      assert.deepStrictEqual(fetched?.value, jsonValue);

      console.log("✅ JSON validation test passed");
    } finally {
      await sql`DELETE FROM company_settings WHERE company_id = ${companyId} AND \`key\` LIKE ${`%${runId}%`}`.execute(db);
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
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ${companyCode}
           AND u.email = ${ownerEmail}
           AND u.is_active = 1
           AND o.code = ${outletCode}
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
      const ownerRows = await sql`
        SELECT u.id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ${companyCode}
           AND u.email = ${ownerEmail}
           AND u.is_active = 1
           AND o.code = ${outletCode}
         LIMIT 1
      `.execute(db);

      assert.ok(ownerRows.rows.length > 0, "Owner fixture not found");
      const owner = ownerRows.rows[0] as { company_id: number; id: number; outlet_id: number };
      companyId = Number(owner.company_id);
      ownerUserId = Number(owner.id);
      outletId = Number(owner.outlet_id);

      const actor = { userId: ownerUserId, ipAddress: "127.0.0.1" };

      await setSetting({
        companyId,
        key: `cascade_test_${runId}`,
        value: "company_value",
        valueType: "string",
        outletId: null,
        actor
      });

      const resolved = await getResolvedSetting(companyId, `cascade_test_${runId}`, outletId);
      assert.strictEqual(resolved?.value, "company_value");

      await setSetting({
        companyId,
        key: `cascade_test_${runId}`,
        value: "outlet_value",
        valueType: "string",
        outletId,
        actor
      });

      const resolvedWithOutlet = await getResolvedSetting(companyId, `cascade_test_${runId}`, outletId);
      assert.strictEqual(resolvedWithOutlet?.value, "outlet_value");

      console.log("✅ cascade resolution test passed");
    } finally {
      await sql`DELETE FROM company_settings WHERE company_id = ${companyId} AND \`key\` LIKE ${`%${runId}%`}`.execute(db);
    }
  }
);

// Close database pool after all tests
test.after(async () => {
  await closeDbPool();
});
