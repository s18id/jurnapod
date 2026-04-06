// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { canManageCompanyDefaults } from "./permissions";
import {
  createTestCompanyMinimal,
  createTestUser,
  createTestOutletMinimal,
  setupUserPermission,
  getRoleIdByCode,
  assignUserGlobalRole,
  assignUserOutletRole,
  setModulePermission,
  cleanupTestFixtures,
  resetFixtureRegistry,
} from "../test-fixtures";
import { closeDbPool } from "../db";
import { MODULE_PERMISSION_BITS, buildPermissionMask } from "@jurnapod/auth";

describe("canManageCompanyDefaults", { concurrency: false }, () => {
  before(async () => {
    resetFixtureRegistry();
  });

  after(async () => {
    await cleanupTestFixtures();
    await closeDbPool();
  });

  test("returns true when user has permission", async () => {
    const company = await createTestCompanyMinimal();
    const user = await createTestUser(company.id);

    await setupUserPermission({
      userId: user.id,
      companyId: company.id,
      roleCode: "OWNER",
      module: "inventory",
      permission: "create",
    });

    const result = await canManageCompanyDefaults(
      user.id,
      company.id,
      "inventory",
      "create"
    );

    assert.strictEqual(result, true);
  });

  test("returns false when user lacks permission bit", async () => {
    const company = await createTestCompanyMinimal();
    const user = await createTestUser(company.id);
    const ownerRoleId = await getRoleIdByCode("OWNER");

    // Assign OWNER role globally
    await assignUserGlobalRole(user.id, ownerRoleId);

    // Set module permission with only READ (not CREATE)
    await setModulePermission(
      company.id,
      ownerRoleId,
      "inventory",
      MODULE_PERMISSION_BITS.read
    );

    const result = await canManageCompanyDefaults(
      user.id,
      company.id,
      "inventory",
      "create"
    );

    assert.strictEqual(result, false);
  });

  test("returns false when user has only outlet-scoped role assignment", async () => {
    const company = await createTestCompanyMinimal();
    const user = await createTestUser(company.id);
    const outlet = await createTestOutletMinimal(company.id);
    const ownerRoleId = await getRoleIdByCode("OWNER");

    // Assign OWNER role to outlet (outlet_id = outlet.id), NOT globally
    // This means ura.outlet_id IS NOT NULL, so the query won't match
    await assignUserOutletRole(user.id, ownerRoleId, outlet.id);

    // Set module permission with CREATE
    await setModulePermission(
      company.id,
      ownerRoleId,
      "inventory",
      MODULE_PERMISSION_BITS.create
    );

    // User should return false because the assignment has outlet_id = <outlet_id>
    // and the query requires ura.outlet_id IS NULL
    const result = await canManageCompanyDefaults(
      user.id,
      company.id,
      "inventory",
      "create"
    );

    assert.strictEqual(result, false);
  });

  test("returns false when module does not match", async () => {
    const company = await createTestCompanyMinimal();
    const user = await createTestUser(company.id);
    const ownerRoleId = await getRoleIdByCode("OWNER");

    await assignUserGlobalRole(user.id, ownerRoleId);

    // Set permission for SALES module, not INVENTORY
    await setModulePermission(
      company.id,
      ownerRoleId,
      "sales",
      MODULE_PERMISSION_BITS.create
    );

    const result = await canManageCompanyDefaults(
      user.id,
      company.id,
      "inventory",
      "create"
    );

    assert.strictEqual(result, false);
  });

  test("returns false when user has non-global role (ADMIN)", async () => {
    const company = await createTestCompanyMinimal();
    const user = await createTestUser(company.id);
    const adminRoleId = await getRoleIdByCode("ADMIN");

    // Assign ADMIN role globally (but ADMIN is NOT global in the roles table)
    await assignUserGlobalRole(user.id, adminRoleId);

    await setModulePermission(
      company.id,
      adminRoleId,
      "inventory",
      MODULE_PERMISSION_BITS.create
    );

    const result = await canManageCompanyDefaults(
      user.id,
      company.id,
      "inventory",
      "create"
    );

    assert.strictEqual(result, false);
  });

  test("returns true with multiple permission bits set", async () => {
    const company = await createTestCompanyMinimal();
    const user = await createTestUser(company.id);
    const ownerRoleId = await getRoleIdByCode("OWNER");

    await assignUserGlobalRole(user.id, ownerRoleId);

    // Set multiple permissions (create + read + update + delete = 15)
    const fullMask = buildPermissionMask({
      canCreate: true,
      canRead: true,
      canUpdate: true,
      canDelete: true,
    });
    await setModulePermission(company.id, ownerRoleId, "inventory", fullMask);

    // Should work for any of the permission bits
    const resultCreate = await canManageCompanyDefaults(
      user.id,
      company.id,
      "inventory",
      "create"
    );
    const resultRead = await canManageCompanyDefaults(
      user.id,
      company.id,
      "inventory",
      "read"
    );
    const resultUpdate = await canManageCompanyDefaults(
      user.id,
      company.id,
      "inventory",
      "update"
    );
    const resultDelete = await canManageCompanyDefaults(
      user.id,
      company.id,
      "inventory",
      "delete"
    );

    assert.strictEqual(resultCreate, true);
    assert.strictEqual(resultRead, true);
    assert.strictEqual(resultUpdate, true);
    assert.strictEqual(resultDelete, true);
  });

  test("returns false when user belongs to different company", async () => {
    const runId = Date.now().toString(36);
    const company1 = await createTestCompanyMinimal({ code: `TEST-E1-${runId}` });
    const company2 = await createTestCompanyMinimal({ code: `TEST-E2-${runId}` });
    const user = await createTestUser(company1.id);

    await setupUserPermission({
      userId: user.id,
      companyId: company2.id, // Permission set for company2
      roleCode: "OWNER",
      module: `custom-module-${runId}`, // Truly unique module
      permission: "create",
    });

    // Check permission for company1 (where user actually belongs)
    // Should return false because permission is set for company2
    const result = await canManageCompanyDefaults(
      user.id,
      company1.id,
      `custom-module-${runId}`,
      "create"
    );

    assert.strictEqual(result, false);
  });
});
