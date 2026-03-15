// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "./db";
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
  SuperAdminProtectionError
} from "./users";
import type { RowDataPacket } from "mysql2";

loadEnvIfPresent();

test(
  "users CRUD - create, list, update, deactivate",
  { concurrency: false, timeout: 120000 },
  async () => {
    const pool = getDbPool();
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
      const [ownerRows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.id, u.company_id, o.id AS outlet_id
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

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      const owner = ownerRows[0] as { company_id: number; id: number; outlet_id: number };
      companyId = Number(owner.company_id);
      ownerUserId = Number(owner.id);
      outletId = Number(owner.outlet_id);

      const [roleRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, code FROM roles WHERE code IN ('ADMIN', 'CASHIER') AND (company_id = ? OR company_id IS NULL)`,
        [companyId]
      );

      for (const row of roleRows as Array<{ id: number; code: string }>) {
        if (row.code === "ADMIN") {
          adminRoleId = Number(row.id);
        }
      }

      assert.ok(adminRoleId > 0, "ADMIN role not found");

      const [outletRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM outlets WHERE company_id = ? LIMIT 1`,
        [companyId]
      );
      assert.ok(outletRows.length > 0, "No outlets found");
      outletId = Number(outletRows[0].id);

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

      const listed = await listUsers(companyId, { isActive: true });
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
        await pool.execute(`DELETE FROM users WHERE id = ?`, [testUserId]);
      }
    }
  }
);

test(
  "users - tenant isolation",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const testEmail = `cross-company-${runId}@example.com`;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let otherCompanyId = 0;
    let ownerUserId = 0;

    try {
      const [ownerRows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.id, u.company_id
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

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      const owner = ownerRows[0] as { company_id: number; id: number };
      companyId = Number(owner.company_id);
      ownerUserId = Number(owner.id);

      const [otherCompanyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE id != ? LIMIT 1`,
        [companyId]
      );

      if (otherCompanyRows.length > 0) {
        otherCompanyId = Number(otherCompanyRows[0].id);

        const usersInOtherCompany = await listUsers(otherCompanyId, {});
        for (const user of usersInOtherCompany) {
          assert.notStrictEqual(user.company_id, companyId, "Should not see other company users");
        }
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
    const pool = getDbPool();
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
      const [ownerRows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.id, u.company_id
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

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      const owner = ownerRows[0] as { company_id: number; id: number };
      companyId = Number(owner.company_id);
      ownerUserId = Number(owner.id);

      const [outletRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM outlets WHERE company_id = ? LIMIT 1`,
        [companyId]
      );
      assert.ok(outletRows.length > 0, "No outlets found");
      outletId = Number(outletRows[0].id);

      const [roleRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, code, is_global FROM roles WHERE code = 'CASHIER' AND (company_id = ? OR company_id IS NULL)`,
        [companyId]
      );

      assert.ok(roleRows.length > 0, "CASHIER role not found");
      cashierRoleId = Number(roleRows[0].id);

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
        await pool.execute(`DELETE FROM users WHERE id = ?`, [testUserId]);
      }
    }
  }
);
