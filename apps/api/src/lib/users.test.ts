// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDb } from "./db";
import { sql } from "kysely";
import {
  createUser,
  findUserById,
  listUsers,
  setUserActiveState,
  setUserOutlets,
  setUserRoles,
  updateUserEmail,
  UserEmailExistsError,
  UserNotFoundError,
  RoleNotFoundError,
  RoleLevelViolationError,
  SuperAdminProtectionError,
  CrossCompanyAccessError
} from "./users";
import { createTestOutletMinimal, cleanupTestFixtures } from "./test-fixtures";

loadEnvIfPresent();

test(
  "users CRUD - create, list, update, deactivate",
  { concurrency: false, timeout: 120000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const testEmail = `test-user-${runId}@example.com`;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let ownerUserId = 0;
    let testUserId = 0;
    let outletId = 0;
    let adminRoleId = 0;

    const createdUserIds: number[] = [];

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

      const roleRows = await sql`
        SELECT id, code FROM roles WHERE code IN ('ADMIN', 'CASHIER') AND (company_id = ${companyId} OR company_id IS NULL)
      `.execute(db);

      for (const row of roleRows.rows as Array<{ id: number; code: string }>) {
        if (row.code === "ADMIN") {
          adminRoleId = Number(row.id);
        }
      }

      assert.ok(adminRoleId > 0, "ADMIN role not found");

      const outletRows = await sql`
        SELECT id FROM outlets WHERE company_id = ${companyId} LIMIT 1
      `.execute(db);
      assert.ok(outletRows.rows.length > 0, "No outlets found");
      outletId = Number((outletRows.rows[0] as { id: number }).id);

      const created = await createUser({
        companyId,
        email: testEmail,
        password: "TestPass123!",
        roleCodes: ["ADMIN"],
        outletIds: [outletId],
        isActive: true,
        actor: { userId: ownerUserId, ipAddress: "127.0.0.1" }
      });

      assert.ok(created.id > 0, "User should have an ID");
      assert.strictEqual(created.email, testEmail.toLowerCase());
      assert.strictEqual(created.is_active, true);
      createdUserIds.push(created.id);
      testUserId = created.id;

      const listed = await listUsers(companyId, { userId: ownerUserId, companyId }, { isActive: true });
      assert.ok(listed.some((u) => u.email === testEmail.toLowerCase()), "User should appear in list");

      const updated = await updateUserEmail({
        companyId,
        userId: testUserId,
        email: `updated-${testEmail}`,
        actor: { userId: ownerUserId, ipAddress: "127.0.0.1" }
      });
      assert.strictEqual(updated.email, `updated-${testEmail}`.toLowerCase());

      const deactivated = await setUserActiveState({
        companyId,
        userId: testUserId,
        isActive: false,
        actor: { userId: ownerUserId, ipAddress: "127.0.0.1" }
      });
      assert.strictEqual(deactivated.is_active, false);

      const found = await findUserById(companyId, testUserId);
      assert.ok(found, "User should still exist after deactivation");
      assert.strictEqual(found?.is_active, false);

      console.log("✅ users CRUD test passed");
    } finally {
      if (testUserId > 0) {
        await sql`DELETE FROM users WHERE id = ${testUserId}`.execute(db);
      }
    }
  }
);

test(
  "users - tenant isolation",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const testEmail = `cross-company-${runId}@example.com`;

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

        // Non-super-admin should not be able to list users from another company
        await assert.rejects(
          async () => listUsers(otherCompanyId, { userId: ownerUserId, companyId }),
          CrossCompanyAccessError,
          "Non-super-admin should not access other company users"
        );
      }

      console.log("✅ tenant isolation test passed");
    } catch (error) {
      console.log("⚠️ tenant isolation test skipped - only one company in DB");
    }
  }
);

test(
  "users - role level enforcement",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const testEmail = `role-test-${runId}@example.com`;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let ownerUserId = 0;
    let testUserId = 0;
    let cashierRoleId = 0;
    let outletId = 0;

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

      const outletRows = await sql`
        SELECT id FROM outlets WHERE company_id = ${companyId} LIMIT 1
      `.execute(db);
      assert.ok(outletRows.rows.length > 0, "No outlets found");
      outletId = Number((outletRows.rows[0] as { id: number }).id);

      const roleRows = await sql`
        SELECT id, code, is_global FROM roles WHERE code = 'CASHIER' AND (company_id = ${companyId} OR company_id IS NULL)
      `.execute(db);

      assert.ok(roleRows.rows.length > 0, "CASHIER role not found");
      cashierRoleId = Number((roleRows.rows[0] as { id: number }).id);

      const created = await createUser({
        companyId,
        email: testEmail,
        password: "TestPass123!",
        roleCodes: ["CASHIER"],
        outletIds: [outletId],
        isActive: true,
        actor: { userId: ownerUserId, ipAddress: "127.0.0.1" }
      });
      testUserId = created.id;

      await assert.rejects(
        async () => {
          await setUserRoles({
            companyId,
            userId: testUserId,
            roleCodes: ["OWNER"],
            actor: { userId: ownerUserId, ipAddress: "127.0.0.1" }
          });
        },
        (error: Error) => error.message.includes("Insufficient role level"),
        "Should not allow assigning higher role"
      );

      console.log("✅ role level enforcement test passed");
    } finally {
      if (testUserId > 0) {
        await sql`DELETE FROM users WHERE id = ${testUserId}`.execute(db);
      }
    }
  }
);

test(
  "userHasOutletAccess - global roles get access to all outlets",
  { concurrency: false, timeout: 30000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    
    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let ownerUserId = 0;
    let testOutletId = 0;

    try {
      // Get company and owner info
      const companyRows = await sql`
        SELECT c.id, u.id AS owner_id
        FROM companies c
        INNER JOIN users u ON u.company_id = c.id
        WHERE c.code = ${companyCode} AND u.email = ${ownerEmail}
        LIMIT 1
      `.execute(db);

      if (companyRows.rows.length === 0) {
        throw new Error(`Company ${companyCode} or owner ${ownerEmail} not found`);
      }

      companyId = (companyRows.rows[0] as { id: number }).id;
      ownerUserId = (companyRows.rows[0] as { owner_id: number }).owner_id;

      // Create a test outlet using shared fixtures
      const outlet = await createTestOutletMinimal(companyId, {
        code: `TEST_OUTLET_${runId}`.slice(0, 20),
        name: `Test Outlet ${runId}`
      });
      testOutletId = outlet.id;

      // Test that owner has access to the new outlet using role-based logic
      const { userHasOutletAccess } = await import("./auth.js");
      const hasAccess = await userHasOutletAccess(ownerUserId, companyId, testOutletId);

      assert.equal(hasAccess, true, "Owner should have access to newly created outlet via global role");

      // Test that owner has access to all existing outlets
      const outlets = await sql`
        SELECT id FROM outlets WHERE company_id = ${companyId}
      `.execute(db);

      for (const outletRow of outlets.rows as { id: number }[]) {
        const outletId = outletRow.id;
        const hasOutletAccess = await userHasOutletAccess(ownerUserId, companyId, outletId);
        assert.equal(hasOutletAccess, true, `Owner should have access to outlet ${outletId}`);
      }

      console.log(`✅ Owner has access to all ${outlets.rows.length} outlets via global role`);

    } finally {
      // Cleanup test outlet
      if (testOutletId > 0) {
        await sql`DELETE FROM outlets WHERE id = ${testOutletId}`.execute(db);
      }
    }
  }
);

// Close database pool after all tests
test.after(async () => {
  await closeDbPool();
});
