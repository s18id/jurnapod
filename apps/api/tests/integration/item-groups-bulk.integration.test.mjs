// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createIntegrationTestContext,
  dbConfigFromEnv,
  readEnv
} from "./integration-harness.mjs";

const TEST_TIMEOUT_MS = 180000;

function readEnvValue(name, fallback = null) {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    if (fallback != null) {
      return fallback;
    }
    throw new Error(`${name} is required for integration test`);
  }
  return value;
}

test(
  "inventory item groups: bulk create",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async (t) => {
    const context = createIntegrationTestContext(t);
    await t.mock.method(context, "start");
    await t.mock.method(context, "stop");
    
    await context.start();
    const { baseUrl, db } = context;

    const companyCode = readEnvValue("JP_COMPANY_CODE", "JP");
    const outletCode = readEnvValue("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnvValue("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnvValue("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);

    let createdGroupIds = [];

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.company_id, o.id AS outlet_id
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
      if (!owner) {
        throw new Error("owner fixture not found; run `npm run db:migrate && npm run db:seed`");
      }

      const [ownerRoleRows] = await db.execute(`SELECT id, is_global FROM roles WHERE code = 'OWNER' LIMIT 1`);
      if (!ownerRoleRows[0]) {
        throw new Error("OWNER role not found");
      }

      if (Number(ownerRoleRows[0].is_global) !== 1) {
        await db.execute("UPDATE roles SET is_global = 1 WHERE id = ?", [Number(ownerRoleRows[0].id)]);
      }

      const [ownerRoleAssignmentRows] = await db.execute(
        `SELECT 1
         FROM user_role_assignments ura
         INNER JOIN users u ON u.id = ura.user_id
         INNER JOIN roles r ON r.id = ura.role_id
         INNER JOIN companies c ON c.id = u.company_id
         WHERE u.email = ? AND c.code = ? AND r.code = 'OWNER'
         LIMIT 1`,
        [ownerEmail, companyCode]
      );
      if (!ownerRoleAssignmentRows[0]) {
        await db.execute(
          `INSERT INTO user_role_assignments (user_id, role_id)
           SELECT u.id, r.id FROM users u
           INNER JOIN roles r ON r.code = 'OWNER'
           INNER JOIN companies c ON c.id = u.company_id
           WHERE u.email = ? AND c.code = ? LIMIT 1`,
          [ownerEmail, companyCode]
        );
      }

      await db.execute(
        `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
         SELECT c.id, r.id, 'inventory', 15
         FROM companies c
         CROSS JOIN roles r
         WHERE c.code = ? AND r.code IN ('OWNER', 'COMPANY_ADMIN')
         ON DUPLICATE KEY UPDATE permission_mask = 15`,
        [companyCode]
      );

      await db.execute(`SET FOREIGN_KEY_CHECKS = 0`);
      await db.execute(
        `DELETE FROM item_groups WHERE code LIKE 'BULK-%' OR code LIKE 'CYCLE-%'`
      );
      await db.execute(`SET FOREIGN_KEY_CHECKS = 1`);

      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginRes.status, 200, "login should return 200");
      const loginBody = await loginRes.json();
      const token = loginBody.data?.access_token;
      assert.ok(token, "should have access_token");

      const bulkCreateResponse = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          rows: [
            { code: `BULK-P-${runId}`, name: `Bulk Parent ${runId}`, is_active: true },
            { code: `BULK-C-${runId}`, name: `Bulk Child ${runId}`, parent_code: `BULK-P-${runId}`, is_active: true }
          ]
        })
      });

      assert.equal(bulkCreateResponse.status, 201, "bulk create should return 201");
      const bulkResult = await bulkCreateResponse.json();
      assert.ok(bulkResult.data, "response should have data");
      assert.equal(bulkResult.data.created_count, 2, "should create 2 groups");
      assert.equal(bulkResult.data.groups.length, 2, "should return 2 groups");

      const parentGroup = bulkResult.data.groups.find((g) => g.code === `BULK-P-${runId}`);
      const childGroup = bulkResult.data.groups.find((g) => g.code === `BULK-C-${runId}`);
      assert.ok(parentGroup, "parent group should be in result");
      assert.ok(childGroup, "child group should be in result");
      assert.equal(childGroup.parent_id, parentGroup.id, "child should have parent_id pointing to parent");

      createdGroupIds.push(bulkResult.data.groups[0].id, bulkResult.data.groups[1].id);

      const duplicateResponse = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          rows: [
            { code: `BULK-P-${runId}`, name: `Duplicate Parent ${runId}`, is_active: true }
          ]
        })
      });

      assert.equal(duplicateResponse.status, 409, "duplicate code should return 409");

      const unknownParentResponse = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          rows: [
            { code: `BULK-CHILD-${runId}`, name: `Child with unknown parent ${runId}`, parent_code: "NONEXISTENT", is_active: true }
          ]
        })
      });

      assert.equal(unknownParentResponse.status, 409, "unknown parent code should return 409");

      const cycleResponse = await fetch(`${baseUrl}/api/inventory/item-groups/bulk`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          rows: [
            { code: `CYCLE-A-${runId}`, name: `Cycle A ${runId}`, parent_code: `CYCLE-B-${runId}`, is_active: true },
            { code: `CYCLE-B-${runId}`, name: `Cycle B ${runId}`, parent_code: `CYCLE-A-${runId}`, is_active: true }
          ]
        })
      });

      assert.equal(cycleResponse.status, 409, "cycle should return 409");

      const listResponse = await fetch(`${baseUrl}/api/inventory/item-groups`, {
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(listResponse.status, 200, "list should return 200");
      const listResult = await listResponse.json();
      const newGroups = listResult.data.filter((g) => g.code?.startsWith(`BULK-`));
      assert.equal(newGroups.length, 2, "should have 2 groups in list");
    } finally {
      if (createdGroupIds.length > 0) {
        const reverseOrder = [...createdGroupIds].reverse();
        for (const id of reverseOrder) {
          await db.execute(`DELETE FROM item_groups WHERE id = ?`, [id]);
        }
      }
      await context.stop();
    }
  }
);
