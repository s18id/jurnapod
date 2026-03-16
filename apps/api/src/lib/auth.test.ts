// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { buildPermissionMask, checkUserAccess } from "./auth";
import { closeDbPool, getDbPool } from "./db";
import type { RowDataPacket } from "mysql2";

loadEnvIfPresent();

test(
  "checkUserAccess unit coverage",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const emailPrefix = `acl-unit-${runId}`;
    const moduleName = `acl_test_${runId}`;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    const createdUserIds: number[] = [];
    const createdOutletIds: number[] = [];
    const createdCompanyIds: number[] = [];

    let companyId = 0;
    let outletAId = 0;
    let outletBId = 0;
    let globalOwnerUserId = 0;
    let outletAdminUserId = 0;
    let superAdminUserId = 0;
    let inactiveUserId = 0;
    let deletedCompanyUserId = 0;
    let deletedCompanyId = 0;

    let ownerRoleId = 0;
    let adminRoleId = 0;
    let cashierRoleId = 0;
    let superAdminRoleId = 0;

    try {
      const [ownerRows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.id, u.company_id, u.password_hash, o.id AS outlet_id
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

      assert.ok(ownerRows.length > 0, "Owner fixture not found; run database seed first");
      const owner = ownerRows[0] as {
        company_id: number;
        password_hash: string;
        outlet_id: number;
      };
      companyId = Number(owner.company_id);
      const ownerPasswordHash = String(owner.password_hash);

      const [roleRows] = await pool.execute(
        `SELECT id, code FROM roles
         WHERE code IN ('OWNER', 'COMPANY_ADMIN', 'ADMIN', 'CASHIER', 'SUPER_ADMIN')`
      );

      for (const row of roleRows as Array<{ id: number; code: string }>) {
        if (row.code === "OWNER") {
          ownerRoleId = Number(row.id);
        } else if (row.code === "ADMIN") {
          adminRoleId = Number(row.id);
        } else if (row.code === "CASHIER") {
          cashierRoleId = Number(row.id);
        } else if (row.code === "SUPER_ADMIN") {
          superAdminRoleId = Number(row.id);
        }
      }

      assert.ok(ownerRoleId, "OWNER role fixture not found");
      assert.ok(adminRoleId, "ADMIN role fixture not found");
      assert.ok(cashierRoleId, "CASHIER role fixture not found");
      assert.ok(superAdminRoleId, "SUPER_ADMIN role fixture not found");

      const outletACode = `ACL-A-${runId}`.slice(0, 32).toUpperCase();
      const outletBCode = `ACL-B-${runId}`.slice(0, 32).toUpperCase();

      const [outletAResult] = await pool.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, outletACode, `ACL Outlet A ${runId}`]
      );
      outletAId = Number((outletAResult as { insertId: number }).insertId);
      createdOutletIds.push(outletAId);

      const [outletBResult] = await pool.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, outletBCode, `ACL Outlet B ${runId}`]
      );
      outletBId = Number((outletBResult as { insertId: number }).insertId);
      createdOutletIds.push(outletBId);

      const [globalOwnerInsert] = await pool.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, ?, 1)`,
        [companyId, `${emailPrefix}-owner@example.com`, ownerPasswordHash]
      );
      globalOwnerUserId = Number((globalOwnerInsert as { insertId: number }).insertId);
      createdUserIds.push(globalOwnerUserId);
      await pool.execute(`INSERT INTO user_role_assignments (user_id, role_id, outlet_id) VALUES (?, ?, ?)`, [
        globalOwnerUserId,
        ownerRoleId,
        null
      ]);

      const [outletAdminInsert] = await pool.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, ?, 1)`,
        [companyId, `${emailPrefix}-admin@example.com`, ownerPasswordHash]
      );
      outletAdminUserId = Number((outletAdminInsert as { insertId: number }).insertId);
      createdUserIds.push(outletAdminUserId);
      await pool.execute(
        `INSERT INTO user_role_assignments (user_id, outlet_id, role_id)
         VALUES (?, ?, ?)`,
        [outletAdminUserId, outletAId, adminRoleId]
      );

      const [superAdminInsert] = await pool.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, ?, 1)`,
        [companyId, `${emailPrefix}-superadmin@example.com`, ownerPasswordHash]
      );
      superAdminUserId = Number((superAdminInsert as { insertId: number }).insertId);
      createdUserIds.push(superAdminUserId);
      await pool.execute(`INSERT INTO user_role_assignments (user_id, role_id, outlet_id) VALUES (?, ?, ?)`, [
        superAdminUserId,
        superAdminRoleId,
        null
      ]);

      const [inactiveInsert] = await pool.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, ?, 0)`,
        [companyId, `${emailPrefix}-inactive@example.com`, ownerPasswordHash]
      );
      inactiveUserId = Number((inactiveInsert as { insertId: number }).insertId);
      createdUserIds.push(inactiveUserId);
      await pool.execute(`INSERT INTO user_role_assignments (user_id, role_id, outlet_id) VALUES (?, ?, ?)`, [
        inactiveUserId,
        ownerRoleId,
        null
      ]);

      const deletedCompanyCode = `ACL-DEL-${runId}`.slice(0, 32).toUpperCase();
      const [deletedCompanyInsert] = await pool.execute(
        `INSERT INTO companies (code, name)
         VALUES (?, ?)`,
        [deletedCompanyCode, `ACL Deleted Company ${runId}`]
      );
      deletedCompanyId = Number((deletedCompanyInsert as { insertId: number }).insertId);
      createdCompanyIds.push(deletedCompanyId);
      await pool.execute(`UPDATE companies SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`, [
        deletedCompanyId
      ]);

      const [deletedCompanyUserInsert] = await pool.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, ?, 1)`,
        [deletedCompanyId, `${emailPrefix}-deleted@example.com`, ownerPasswordHash]
      );
      deletedCompanyUserId = Number((deletedCompanyUserInsert as { insertId: number }).insertId);
      createdUserIds.push(deletedCompanyUserId);
      await pool.execute(`INSERT INTO user_role_assignments (user_id, role_id, outlet_id) VALUES (?, ?, ?)`, [
        deletedCompanyUserId,
        ownerRoleId,
        null
      ]);

      const permissionMask = buildPermissionMask({ canCreate: true, canRead: true });
      await pool.execute(
        `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
         VALUES (?, ?, ?, ?)`,
        [companyId, ownerRoleId, moduleName, permissionMask]
      );

      const globalRoleAccess = await checkUserAccess({
        userId: globalOwnerUserId,
        companyId,
        allowedRoles: ["OWNER", "COMPANY_ADMIN"]
      });
      assert.equal(globalRoleAccess?.hasRole, true, "Global OWNER should have hasRole=true");
      assert.equal(
        globalRoleAccess?.hasGlobalRole,
        true,
        "Global OWNER should have hasGlobalRole=true"
      );

      const outletRoleAccess = await checkUserAccess({
        userId: outletAdminUserId,
        companyId,
        allowedRoles: ["ADMIN", "CASHIER"],
        outletId: outletAId
      });
      assert.equal(outletRoleAccess?.hasRole, true, "Outlet ADMIN should have hasRole=true");
      assert.equal(
        outletRoleAccess?.hasOutletAccess,
        true,
        "Outlet ADMIN should have hasOutletAccess=true for assigned outlet"
      );

      const outletRoleCompanyWide = await checkUserAccess({
        userId: outletAdminUserId,
        companyId,
        allowedRoles: ["ADMIN"]
      });
      assert.equal(
        outletRoleCompanyWide?.hasRole,
        true,
        "Outlet ADMIN should have hasRole=true without outletId"
      );

      const outletRoleWrongOutlet = await checkUserAccess({
        userId: outletAdminUserId,
        companyId,
        allowedRoles: ["ADMIN"],
        outletId: outletBId
      });
      assert.equal(
        outletRoleWrongOutlet?.hasRole,
        false,
        "Outlet ADMIN should not have hasRole=true for unassigned outlet"
      );
      assert.equal(
        outletRoleWrongOutlet?.hasOutletAccess,
        false,
        "Outlet ADMIN should not have outlet access to unassigned outlet"
      );

      const globalRoleOutletAccess = await checkUserAccess({
        userId: globalOwnerUserId,
        companyId,
        allowedRoles: ["OWNER"],
        outletId: outletBId
      });
      assert.equal(
        globalRoleOutletAccess?.hasRole,
        true,
        "Global OWNER should have hasRole=true for outlet checks"
      );
      assert.equal(
        globalRoleOutletAccess?.hasGlobalRole,
        true,
        "Global OWNER should have hasGlobalRole=true for outlet checks"
      );

      const moduleCreateAccess = await checkUserAccess({
        userId: globalOwnerUserId,
        companyId,
        module: moduleName,
        permission: "create"
      });
      assert.equal(
        moduleCreateAccess?.hasPermission,
        true,
        "Module create permission should be granted"
      );

      const moduleReadAccess = await checkUserAccess({
        userId: globalOwnerUserId,
        companyId,
        module: moduleName,
        permission: "read"
      });
      assert.equal(moduleReadAccess?.hasPermission, true, "Module read permission should be granted");

      const moduleUpdateAccess = await checkUserAccess({
        userId: globalOwnerUserId,
        companyId,
        module: moduleName,
        permission: "update"
      });
      assert.equal(
        moduleUpdateAccess?.hasPermission,
        false,
        "Module update permission should be denied"
      );

      const moduleDeleteAccess = await checkUserAccess({
        userId: globalOwnerUserId,
        companyId,
        module: moduleName,
        permission: "delete"
      });
      assert.equal(
        moduleDeleteAccess?.hasPermission,
        false,
        "Module delete permission should be denied"
      );

      const superAdminAccess = await checkUserAccess({
        userId: superAdminUserId,
        companyId,
        module: moduleName,
        permission: "delete"
      });
      assert.equal(superAdminAccess?.isSuperAdmin, true, "SUPER_ADMIN should set isSuperAdmin=true");
      assert.equal(
        superAdminAccess?.hasPermission,
        false,
        "SUPER_ADMIN should not require module permission to be true"
      );

      const inactiveAccess = await checkUserAccess({
        userId: inactiveUserId,
        companyId,
        allowedRoles: ["OWNER"]
      });
      assert.equal(inactiveAccess, null, "Inactive user should return null access");

      const deletedCompanyAccess = await checkUserAccess({
        userId: deletedCompanyUserId,
        companyId: deletedCompanyId,
        allowedRoles: ["OWNER"]
      });
      assert.equal(deletedCompanyAccess, null, "Deleted company should return null access");
    } finally {
      if (companyId && moduleName) {
        await pool.execute(
          `DELETE FROM module_roles WHERE company_id = ? AND module = ?`,
          [companyId, moduleName]
        );
      }

      if (createdUserIds.length > 0) {
        const userPlaceholders = createdUserIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM user_role_assignments WHERE user_id IN (${userPlaceholders})`,
          createdUserIds
        );
        await pool.execute(`DELETE FROM users WHERE id IN (${userPlaceholders})`, createdUserIds);
      }

      if (createdOutletIds.length > 0) {
        const outletPlaceholders = createdOutletIds.map(() => "?").join(", ");
        await pool.execute(`DELETE FROM outlets WHERE id IN (${outletPlaceholders})`, createdOutletIds);
      }

      if (createdCompanyIds.length > 0) {
        const companyPlaceholders = createdCompanyIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM companies WHERE id IN (${companyPlaceholders})`,
          createdCompanyIds
        );
      }
    }
  }
);

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
