// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { buildPermissionMask } from "@jurnapod/auth";
import { checkUserAccess } from "./auth";
import { closeDbPool, getDb } from "./db";
import { createTestCompanyMinimal, createTestOutletMinimal, cleanupTestFixtures } from "./test-fixtures";

loadEnvIfPresent();

test(
  "checkUserAccess unit coverage",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
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
      // Find owner fixture user
      const ownerRows = await db
        .selectFrom("users as u")
        .innerJoin("companies as c", "c.id", "u.company_id")
        .innerJoin("user_outlets as uo", "uo.user_id", "u.id")
        .innerJoin("outlets as o", "o.id", "uo.outlet_id")
        .where("c.code", "=", companyCode)
        .where("u.email", "=", ownerEmail)
        .where("u.is_active", "=", 1)
        .where("o.code", "=", outletCode)
        .select(["u.id", "u.company_id", "u.password_hash", "o.id as outlet_id"])
        .limit(1)
        .execute();

      assert.ok(ownerRows.length > 0, "Owner fixture not found; run database seed first");
      const owner = ownerRows[0];
      companyId = Number(owner.company_id);
      const ownerPasswordHash = String(owner.password_hash);

      // Get role IDs
      const roleRows = await db
        .selectFrom("roles")
        .where("code", "in", ["OWNER", "COMPANY_ADMIN", "ADMIN", "CASHIER", "SUPER_ADMIN"])
        .select(["id", "code"])
        .execute();

      for (const row of roleRows) {
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

      const outletA = await createTestOutletMinimal(companyId, {
        code: outletACode,
        name: `ACL Outlet A ${runId}`
      });
      outletAId = outletA.id;
      createdOutletIds.push(outletAId);

      const outletB = await createTestOutletMinimal(companyId, {
        code: outletBCode,
        name: `ACL Outlet B ${runId}`
      });
      outletBId = outletB.id;
      createdOutletIds.push(outletBId);

      // Create global owner user
      const globalOwnerInsert = await db
        .insertInto("users")
        .values({
          company_id: companyId,
          email: `${emailPrefix}-owner@example.com`,
          password_hash: ownerPasswordHash,
          is_active: 1
        })
        .returningAll()
        .executeTakeFirst();
      
      globalOwnerUserId = Number(globalOwnerInsert!.id);
      createdUserIds.push(globalOwnerUserId);
      
      await db
        .insertInto("user_role_assignments")
        .values({
          company_id: companyId,
          user_id: globalOwnerUserId,
          role_id: ownerRoleId,
          outlet_id: null
        })
        .execute();

      // Create outlet admin user
      const outletAdminInsert = await db
        .insertInto("users")
        .values({
          company_id: companyId,
          email: `${emailPrefix}-admin@example.com`,
          password_hash: ownerPasswordHash,
          is_active: 1
        })
        .returningAll()
        .executeTakeFirst();
      
      outletAdminUserId = Number(outletAdminInsert!.id);
      createdUserIds.push(outletAdminUserId);
      
      await db
        .insertInto("user_role_assignments")
        .values({
          company_id: companyId,
          user_id: outletAdminUserId,
          outlet_id: outletAId,
          role_id: adminRoleId
        })
        .execute();

      // Create super admin user
      const superAdminInsert = await db
        .insertInto("users")
        .values({
          company_id: companyId,
          email: `${emailPrefix}-superadmin@example.com`,
          password_hash: ownerPasswordHash,
          is_active: 1
        })
        .returningAll()
        .executeTakeFirst();
      
      superAdminUserId = Number(superAdminInsert!.id);
      createdUserIds.push(superAdminUserId);
      
      await db
        .insertInto("user_role_assignments")
        .values({
          company_id: companyId,
          user_id: superAdminUserId,
          role_id: superAdminRoleId,
          outlet_id: null
        })
        .execute();

      // Create inactive user
      const inactiveInsert = await db
        .insertInto("users")
        .values({
          company_id: companyId,
          email: `${emailPrefix}-inactive@example.com`,
          password_hash: ownerPasswordHash,
          is_active: 0
        })
        .returningAll()
        .executeTakeFirst();
      
      inactiveUserId = Number(inactiveInsert!.id);
      createdUserIds.push(inactiveUserId);
      
      await db
        .insertInto("user_role_assignments")
        .values({
          company_id: companyId,
          user_id: inactiveUserId,
          role_id: ownerRoleId,
          outlet_id: null
        })
        .execute();

      // Create deleted company and its user
      const deletedCompanyCode = `ACL-DEL-${runId}`.slice(0, 32).toUpperCase();
      const deletedCompany = await createTestCompanyMinimal({
        code: deletedCompanyCode,
        name: `ACL Deleted Company ${runId}`
      });
      deletedCompanyId = deletedCompany.id;
      createdCompanyIds.push(deletedCompanyId);
      
      await db
        .updateTable("companies")
        .set({ deleted_at: new Date() })
        .where("id", "=", deletedCompanyId)
        .execute();

      const deletedCompanyUserInsert = await db
        .insertInto("users")
        .values({
          company_id: deletedCompanyId,
          email: `${emailPrefix}-deleted@example.com`,
          password_hash: ownerPasswordHash,
          is_active: 1
        })
        .returningAll()
        .executeTakeFirst();
      
      deletedCompanyUserId = Number(deletedCompanyUserInsert!.id);
      createdUserIds.push(deletedCompanyUserId);
      
      await db
        .insertInto("user_role_assignments")
        .values({
          company_id: deletedCompanyId,
          user_id: deletedCompanyUserId,
          role_id: ownerRoleId,
          outlet_id: null
        })
        .execute();

      // Create module role permission
      const permissionMask = buildPermissionMask({ canCreate: true, canRead: true });
      await db
        .insertInto("module_roles")
        .values({
          company_id: companyId,
          role_id: ownerRoleId,
          module: moduleName,
          permission_mask: permissionMask
        })
        .execute();

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
        await db
          .deleteFrom("module_roles")
          .where("company_id", "=", companyId)
          .where("module", "=", moduleName)
          .execute();
      }

      if (createdUserIds.length > 0) {
        await db
          .deleteFrom("user_role_assignments")
          .where("user_id", "in", createdUserIds)
          .execute();
        await db
          .deleteFrom("users")
          .where("id", "in", createdUserIds)
          .execute();
      }

      if (createdOutletIds.length > 0) {
        await db
          .deleteFrom("outlets")
          .where("id", "in", createdOutletIds)
          .execute();
      }

      if (createdCompanyIds.length > 0) {
        await db
          .deleteFrom("companies")
          .where("id", "in", createdCompanyIds)
          .execute();
      }
    }
  }
);

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
