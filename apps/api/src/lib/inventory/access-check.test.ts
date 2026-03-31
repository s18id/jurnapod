// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDb } from "../db";
import { checkItemAccess } from "./access-check";
import { sql } from "kysely";

loadEnvIfPresent();

test(
  "inventory/access-check - Access granted for item matching company",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let testItemId = 0;

    try {
      // Get company ID from fixtures
      const companyResult = await sql`SELECT c.id
         FROM companies c
         INNER JOIN users u ON u.company_id = c.id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ${companyCode}
           AND u.email = ${ownerEmail}
           AND u.is_active = 1
           AND o.code = ${outletCode}
         LIMIT 1`.execute(db);

      assert.ok(companyResult.rows.length > 0, "Company fixture not found");
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      // Get an existing item from this company
      const itemResult = await sql`SELECT id FROM items 
         WHERE company_id = ${companyId}
         LIMIT 1`.execute(db);

      assert.ok(itemResult.rows.length > 0, "Item fixture not found for company");
      testItemId = Number((itemResult.rows[0] as { id: number }).id);

      // Test access with correct company
      const result = await checkItemAccess(testItemId, companyId);
      assert.strictEqual(result.hasAccess, true, "Should have access to item in matching company");
      assert.strictEqual(result.reason, undefined, "Should not have a reason when access granted");

      console.log("✅ Access granted test passed");
    } finally {
      // No cleanup needed
    }
  }
);

test(
  "inventory/access-check - Access denied with not_found for non-existent item",
  { concurrency: false, timeout: 60000 },
  async () => {
    // Use a very high non-existent ID
    const nonExistentItemId = 999999999;

    const result = await checkItemAccess(nonExistentItemId, 1);

    assert.strictEqual(result.hasAccess, false, "Should deny access for non-existent item");
    assert.strictEqual(result.reason, "not_found", "Reason should be not_found");

    console.log("✅ Item not found test passed");
  }
);

test(
  "inventory/access-check - Access denied with not_found for item in different company",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let testItemId = 0;

    try {
      // Get company ID
      const companyResult = await sql`SELECT c.id
         FROM companies c
         INNER JOIN users u ON u.company_id = c.id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ${companyCode}
           AND u.email = ${ownerEmail}
           AND u.is_active = 1
           AND o.code = ${outletCode}
         LIMIT 1`.execute(db);

      assert.ok(companyResult.rows.length > 0, "Company fixture not found");
      companyId = Number((companyResult.rows[0] as { id: number }).id);

      // Get an item from this company
      const itemResult = await sql`SELECT id FROM items 
         WHERE company_id = ${companyId}
         LIMIT 1`.execute(db);

      assert.ok(itemResult.rows.length > 0, "Item fixture not found for company");
      testItemId = Number((itemResult.rows[0] as { id: number }).id);

      // Try to access with wrong company ID
      const wrongCompanyId = companyId + 999;
      const result = await checkItemAccess(testItemId, wrongCompanyId);

      assert.strictEqual(result.hasAccess, false, "Should deny access for wrong company");
      assert.strictEqual(result.reason, "not_found", "Reason should be not_found");

      console.log("✅ Wrong company test passed");
    } finally {
      // No cleanup needed
    }
  }
);

// Close database pool after all tests
test.after(async () => {
  await closeDbPool();
});
