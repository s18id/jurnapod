// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createIntegrationTestContext,
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
  "inventory item groups: create, update parent, delete hierarchy",
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

      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginRes.status, 200, "login should return 200");
      const loginBody = await loginRes.json();
      const token = loginBody.data?.access_token;
      assert.ok(token, "should have access_token");

      const createParentResponse = await fetch(`${baseUrl}/api/inventory/item-groups`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: `Test Parent Group ${runId}`,
          code: `PARENT-${runId}`,
          is_active: true
        })
      });

      assert.equal(createParentResponse.status, 201, "create parent group should return 201");
      const parentGroup = await createParentResponse.json();
      assert.ok(parentGroup.data, "response should have data");
      assert.ok(parentGroup.data.id, "parent group should have id");
      assert.equal(parentGroup.data.name, `Test Parent Group ${runId}`);
      assert.equal(parentGroup.data.parent_id, null);

      const createChildResponse = await fetch(`${baseUrl}/api/inventory/item-groups`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: `Test Child Group ${runId}`,
          code: `CHILD-${runId}`,
          parent_id: parentGroup.data.id,
          is_active: true
        })
      });

      assert.equal(createChildResponse.status, 201, "create child group should return 201");
      const childGroup = await createChildResponse.json();
      assert.ok(childGroup.data, "response should have data");
      assert.equal(childGroup.data.parent_id, parentGroup.data.id);

      const selfParentResponse = await fetch(`${baseUrl}/api/inventory/item-groups/${parentGroup.data.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          parent_id: parentGroup.data.id
        })
      });

      assert.equal(selfParentResponse.status, 409, "self-parent should return 409");

      const childDescendantResponse = await fetch(`${baseUrl}/api/inventory/item-groups/${parentGroup.data.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          parent_id: childGroup.data.id
        })
      });

      assert.equal(childDescendantResponse.status, 409, "descendant parent should return 409");

      const getParentResponse = await fetch(`${baseUrl}/api/inventory/item-groups/${parentGroup.data.id}`, {
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(getParentResponse.status, 200, "get parent group should return 200");
      const parentGroupAfter = await getParentResponse.json();
      assert.equal(parentGroupAfter.data.parent_id, null, "parent_id should still be null");

      const deleteWithChildResponse = await fetch(`${baseUrl}/api/inventory/item-groups/${parentGroup.data.id}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(deleteWithChildResponse.status, 409, "delete parent with child should return 409");

      const deleteChildResponse = await fetch(`${baseUrl}/api/inventory/item-groups/${childGroup.data.id}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(deleteChildResponse.status, 200, "delete child should return 200");

      const deleteParentResponse = await fetch(`${baseUrl}/api/inventory/item-groups/${parentGroup.data.id}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(deleteParentResponse.status, 200, "delete parent after child should return 200");
    } finally {
      await context.stop();
    }
  }
);
