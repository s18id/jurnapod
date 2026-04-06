// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import {test, afterAll} from 'vitest';
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.js";
import { closeDbPool, getDb } from "../../src/lib/db";
import {
  listCompanyModules,
  getModuleIdByCode,
  updateCompanyModule,
  isModuleEnabled,
  ModuleNotFoundError
} from "../../src/lib/settings-modules";
import { sql } from "kysely";

loadEnvIfPresent();

test(
  "@slow settings-modules - listCompanyModules returns modules for company",
  { concurrent: false, timeout: 120000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;

    try {
      // Get company ID from fixtures
      const companyRows = await sql`
        SELECT c.id
         FROM companies c
         INNER JOIN users u ON u.company_id = c.id
         INNER JOIN user_role_assignments ura ON ura.user_id = u.id
         WHERE c.code = ${companyCode}
           AND u.email = ${ownerEmail}
           AND u.is_active = 1
           AND ura.outlet_id IS NULL
         LIMIT 1
      `.execute(db);

      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      // List modules for company
      const modules = await listCompanyModules(companyId);

      assert.ok(Array.isArray(modules), "Should return an array");
      assert.ok(modules.length > 0, "Should return at least one module");

      // Verify module structure
      for (const mod of modules) {
        assert.ok(typeof mod.code === "string", "Module should have code");
        assert.ok(typeof mod.name === "string", "Module should have name");
        assert.ok(typeof mod.enabled === "boolean", "Module should have enabled boolean");
        assert.ok(mod.config_json === null || typeof mod.config_json === "string",
          "config_json should be null or string");
      }

      console.log("✅ listCompanyModules test passed");
    } finally {
      // Cleanup not needed - read only operation
    }
  }
);

test(
  "@slow settings-modules - getModuleIdByCode returns correct ID or null",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();

    // Test with valid module code
    const validModule = await getModuleIdByCode("platform");
    assert.ok(validModule !== null, "Should return ID for valid module code");
    assert.ok(typeof validModule === "number", "Should return a number");
    assert.ok(validModule > 0, "Should return positive ID");

    // Test with invalid module code
    const invalidModule = await getModuleIdByCode("nonexistent_module_xyz");
    assert.strictEqual(invalidModule, null, "Should return null for invalid module code");

    console.log("✅ getModuleIdByCode test passed");
  }
);

test(
  "@slow settings-modules - updateCompanyModule creates new record",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let moduleId = 0;

    try {
      // Get company ID from fixtures
      const companyRows = await sql`
        SELECT c.id
         FROM companies c
         INNER JOIN users u ON u.company_id = c.id
         INNER JOIN user_role_assignments ura ON ura.user_id = u.id
         WHERE c.code = ${companyCode}
           AND u.email = ${ownerEmail}
           AND u.is_active = 1
           AND ura.outlet_id IS NULL
         LIMIT 1
      `.execute(db);

      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      // Get a module ID to use
      const moduleRows = await sql`
        SELECT id FROM modules WHERE code = 'pos' LIMIT 1
      `.execute(db);
      assert.ok(moduleRows.rows.length > 0, "POS module should exist");
      moduleId = Number((moduleRows.rows[0] as { id: number }).id);

      // Create test company module record
      const testConfig = JSON.stringify({ test_key: `value_${runId}` });

      await updateCompanyModule(companyId, "pos", true, testConfig);

      // Verify the record was created/updated
      const rows = await sql`
        SELECT enabled, config_json FROM company_modules
         WHERE company_id = ${companyId} AND module_id = ${moduleId}
      `.execute(db);

      assert.ok(rows.rows.length > 0, "Company module record should exist");
      assert.strictEqual(Boolean((rows.rows[0] as { enabled: number }).enabled), true, "Module should be enabled");
      assert.strictEqual((rows.rows[0] as { config_json: string }).config_json, testConfig, "Config should match");

      console.log("✅ updateCompanyModule create test passed");
    } finally {
      // Cleanup - reset to original state
      if (companyId > 0 && moduleId > 0) {
        await sql`
          UPDATE company_modules SET enabled = 1, config_json = '{"payment_methods":["CASH"]}'
           WHERE company_id = ${companyId} AND module_id = ${moduleId}
        `.execute(db);
      }
    }
  }
);

test(
  "@slow settings-modules - updateCompanyModule updates existing record",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let moduleId = 0;
    let originalConfig: string | null = null;

    try {
      // Get company ID from fixtures
      const companyRows = await sql`
        SELECT c.id
         FROM companies c
         INNER JOIN users u ON u.company_id = c.id
         INNER JOIN user_role_assignments ura ON ura.user_id = u.id
         WHERE c.code = ${companyCode}
           AND u.email = ${ownerEmail}
           AND u.is_active = 1
           AND ura.outlet_id IS NULL
         LIMIT 1
      `.execute(db);

      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      // Get a module ID to use
      const moduleRows = await sql`
        SELECT id FROM modules WHERE code = 'pos' LIMIT 1
      `.execute(db);
      assert.ok(moduleRows.rows.length > 0, "POS module should exist");
      moduleId = Number((moduleRows.rows[0] as { id: number }).id);

      // Capture original config
      const originalRows = await sql`
        SELECT config_json FROM company_modules
         WHERE company_id = ${companyId} AND module_id = ${moduleId}
      `.execute(db);
      if (originalRows.rows.length > 0) {
        originalConfig = (originalRows.rows[0] as { config_json: string }).config_json;
      }

      // First update - enable false
      const newConfig = JSON.stringify({ updated: true, runId });
      await updateCompanyModule(companyId, "pos", false, newConfig);

      // Verify first update
      const firstUpdate = await sql`
        SELECT enabled, config_json FROM company_modules
         WHERE company_id = ${companyId} AND module_id = ${moduleId}
      `.execute(db);

      assert.ok(firstUpdate.rows.length > 0, "Record should exist after first update");
      assert.strictEqual(
        Boolean((firstUpdate.rows[0] as { enabled: number }).enabled),
        false,
        "Module should be disabled after first update"
      );

      // Second update - enable true with different config
      await updateCompanyModule(companyId, "pos", true, JSON.stringify({ runId }));

      // Verify second update
      const secondUpdate = await sql`
        SELECT enabled, config_json FROM company_modules
         WHERE company_id = ${companyId} AND module_id = ${moduleId}
      `.execute(db);

      assert.ok(secondUpdate.rows.length > 0, "Record should exist after second update");
      assert.strictEqual(
        Boolean((secondUpdate.rows[0] as { enabled: number }).enabled),
        true,
        "Module should be enabled after second update"
      );

      console.log("✅ updateCompanyModule update test passed");
    } finally {
      // Cleanup - restore original state
      if (companyId > 0 && moduleId > 0) {
        await sql`
          UPDATE company_modules SET enabled = 1, config_json = ${originalConfig ?? '{"payment_methods":["CASH"]}'}
           WHERE company_id = ${companyId} AND module_id = ${moduleId}
        `.execute(db);
      }
    }
  }
);

test(
  "@slow settings-modules - isModuleEnabled returns correct boolean",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let moduleId = 0;
    let originalEnabled = true;

    try {
      // Get company ID from fixtures
      const companyRows = await sql`
        SELECT c.id
         FROM companies c
         INNER JOIN users u ON u.company_id = c.id
         INNER JOIN user_role_assignments ura ON ura.user_id = u.id
         WHERE c.code = ${companyCode}
           AND u.email = ${ownerEmail}
           AND u.is_active = 1
           AND ura.outlet_id IS NULL
         LIMIT 1
      `.execute(db);

      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      // Get a module ID to use
      const moduleRows = await sql`
        SELECT id FROM modules WHERE code = 'pos' LIMIT 1
      `.execute(db);
      assert.ok(moduleRows.rows.length > 0, "POS module should exist");
      moduleId = Number((moduleRows.rows[0] as { id: number }).id);

      // Capture original enabled state
      const originalRows = await sql`
        SELECT enabled FROM company_modules
         WHERE company_id = ${companyId} AND module_id = ${moduleId}
      `.execute(db);
      if (originalRows.rows.length > 0) {
        originalEnabled = Boolean((originalRows.rows[0] as { enabled: number }).enabled);
      }

      // Initially check if enabled
      const initialState = await isModuleEnabled(companyId, "pos");
      assert.strictEqual(initialState, originalEnabled, "Initial state should match original");

      // Disable the module
      await sql`
        UPDATE company_modules SET enabled = 0
         WHERE company_id = ${companyId} AND module_id = ${moduleId}
      `.execute(db);

      const disabledState = await isModuleEnabled(companyId, "pos");
      assert.strictEqual(disabledState, false, "Should return false when disabled");

      // Enable the module
      await sql`
        UPDATE company_modules SET enabled = 1
         WHERE company_id = ${companyId} AND module_id = ${moduleId}
      `.execute(db);

      const enabledState = await isModuleEnabled(companyId, "pos");
      assert.strictEqual(enabledState, true, "Should return true when enabled");

      // Test non-existent module
      const nonexistentState = await isModuleEnabled(companyId, "nonexistent_module_xyz");
      assert.strictEqual(nonexistentState, false, "Should return false for nonexistent module");

      console.log("✅ isModuleEnabled test passed");
    } finally {
      // Cleanup - restore original state
      if (companyId > 0 && moduleId > 0) {
        await sql`
          UPDATE company_modules SET enabled = ${originalEnabled ? 1 : 0}
           WHERE company_id = ${companyId} AND module_id = ${moduleId}
        `.execute(db);
      }
    }
  }
);

test(
  "settings-modules - ModuleNotFoundError thrown when module doesn't exist",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;

    try {
      // Get company ID from fixtures
      const companyRows = await sql`
        SELECT c.id
         FROM companies c
         INNER JOIN users u ON u.company_id = c.id
         INNER JOIN user_role_assignments ura ON ura.user_id = u.id
         WHERE c.code = ${companyCode}
           AND u.email = ${ownerEmail}
           AND u.is_active = 1
           AND ura.outlet_id IS NULL
         LIMIT 1
      `.execute(db);

      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      // Attempt to update a non-existent module
      try {
        await updateCompanyModule(companyId, "nonexistent_module_xyz", true, null);
        assert.fail("Should have thrown ModuleNotFoundError");
      } catch (error) {
        assert.ok(error instanceof ModuleNotFoundError, "Error should be ModuleNotFoundError");
        assert.ok(
          error.message.includes("nonexistent_module_xyz"),
          "Error message should include module code"
        );
      }

      console.log("✅ ModuleNotFoundError test passed");
    } finally {
      // No cleanup needed
    }
  }
);

// Close database pool after all tests
afterAll(async () => {
  await closeDbPool();
});
