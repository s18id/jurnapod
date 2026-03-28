// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "./db";
import {
  listCompanyModules,
  getModuleIdByCode,
  updateCompanyModule,
  isModuleEnabled,
  ModuleNotFoundError
} from "./settings-modules";
import type { RowDataPacket } from "mysql2";

loadEnvIfPresent();

test(
  "settings-modules - listCompanyModules returns modules for company",
  { concurrency: false, timeout: 120000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;

    try {
      // Get company ID from fixtures
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT c.id
         FROM companies c
         INNER JOIN users u ON u.company_id = c.id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
           AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number((companyRows[0] as { id: number }).id);

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
  "settings-modules - getModuleIdByCode returns correct ID or null",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();

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
  "settings-modules - updateCompanyModule creates new record",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let moduleId = 0;

    try {
      // Get company ID from fixtures
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT c.id
         FROM companies c
         INNER JOIN users u ON u.company_id = c.id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
           AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number((companyRows[0] as { id: number }).id);

      // Get a module ID to use
      const [moduleRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM modules WHERE code = 'pos' LIMIT 1`
      );
      assert.ok(moduleRows.length > 0, "POS module should exist");
      moduleId = Number((moduleRows[0] as { id: number }).id);

      // Create test company module record
      const testConfig = JSON.stringify({ test_key: `value_${runId}` });

      await updateCompanyModule(companyId, "pos", true, testConfig);

      // Verify the record was created/updated
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT enabled, config_json FROM company_modules
         WHERE company_id = ? AND module_id = ?`,
        [companyId, moduleId]
      );

      assert.ok(rows.length > 0, "Company module record should exist");
      assert.strictEqual(Boolean((rows[0] as { enabled: number }).enabled), true, "Module should be enabled");
      assert.strictEqual((rows[0] as { config_json: string }).config_json, testConfig, "Config should match");

      console.log("✅ updateCompanyModule create test passed");
    } finally {
      // Cleanup - reset to original state
      if (companyId > 0 && moduleId > 0) {
        await pool.execute(
          `UPDATE company_modules SET enabled = 1, config_json = '{"payment_methods":["CASH"]}'
           WHERE company_id = ? AND module_id = ?`,
          [companyId, moduleId]
        );
      }
    }
  }
);

test(
  "settings-modules - updateCompanyModule updates existing record",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let moduleId = 0;
    let originalConfig: string | null = null;

    try {
      // Get company ID from fixtures
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT c.id
         FROM companies c
         INNER JOIN users u ON u.company_id = c.id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
           AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number((companyRows[0] as { id: number }).id);

      // Get a module ID to use
      const [moduleRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM modules WHERE code = 'pos' LIMIT 1`
      );
      assert.ok(moduleRows.length > 0, "POS module should exist");
      moduleId = Number((moduleRows[0] as { id: number }).id);

      // Capture original config
      const [originalRows] = await pool.execute<RowDataPacket[]>(
        `SELECT config_json FROM company_modules
         WHERE company_id = ? AND module_id = ?`,
        [companyId, moduleId]
      );
      if (originalRows.length > 0) {
        originalConfig = (originalRows[0] as { config_json: string }).config_json;
      }

      // First update - enable false
      const newConfig = JSON.stringify({ updated: true, runId });
      await updateCompanyModule(companyId, "pos", false, newConfig);

      // Verify first update
      const [firstUpdate] = await pool.execute<RowDataPacket[]>(
        `SELECT enabled, config_json FROM company_modules
         WHERE company_id = ? AND module_id = ?`,
        [companyId, moduleId]
      );

      assert.ok(firstUpdate.length > 0, "Record should exist after first update");
      assert.strictEqual(
        Boolean((firstUpdate[0] as { enabled: number }).enabled),
        false,
        "Module should be disabled after first update"
      );

      // Second update - enable true with different config
      await updateCompanyModule(companyId, "pos", true, JSON.stringify({ runId }));

      // Verify second update
      const [secondUpdate] = await pool.execute<RowDataPacket[]>(
        `SELECT enabled, config_json FROM company_modules
         WHERE company_id = ? AND module_id = ?`,
        [companyId, moduleId]
      );

      assert.ok(secondUpdate.length > 0, "Record should exist after second update");
      assert.strictEqual(
        Boolean((secondUpdate[0] as { enabled: number }).enabled),
        true,
        "Module should be enabled after second update"
      );

      console.log("✅ updateCompanyModule update test passed");
    } finally {
      // Cleanup - restore original state
      if (companyId > 0 && moduleId > 0) {
        await pool.execute(
          `UPDATE company_modules SET enabled = 1, config_json = ?
           WHERE company_id = ? AND module_id = ?`,
          [originalConfig ?? '{"payment_methods":["CASH"]}', companyId, moduleId]
        );
      }
    }
  }
);

test(
  "settings-modules - isModuleEnabled returns correct boolean",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;
    let moduleId = 0;
    let originalEnabled = true;

    try {
      // Get company ID from fixtures
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT c.id
         FROM companies c
         INNER JOIN users u ON u.company_id = c.id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
           AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number((companyRows[0] as { id: number }).id);

      // Get a module ID to use
      const [moduleRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM modules WHERE code = 'pos' LIMIT 1`
      );
      assert.ok(moduleRows.length > 0, "POS module should exist");
      moduleId = Number((moduleRows[0] as { id: number }).id);

      // Capture original enabled state
      const [originalRows] = await pool.execute<RowDataPacket[]>(
        `SELECT enabled FROM company_modules
         WHERE company_id = ? AND module_id = ?`,
        [companyId, moduleId]
      );
      if (originalRows.length > 0) {
        originalEnabled = Boolean((originalRows[0] as { enabled: number }).enabled);
      }

      // Initially check if enabled
      const initialState = await isModuleEnabled(companyId, "pos");
      assert.strictEqual(initialState, originalEnabled, "Initial state should match original");

      // Disable the module
      await pool.execute(
        `UPDATE company_modules SET enabled = 0
         WHERE company_id = ? AND module_id = ?`,
        [companyId, moduleId]
      );

      const disabledState = await isModuleEnabled(companyId, "pos");
      assert.strictEqual(disabledState, false, "Should return false when disabled");

      // Enable the module
      await pool.execute(
        `UPDATE company_modules SET enabled = 1
         WHERE company_id = ? AND module_id = ?`,
        [companyId, moduleId]
      );

      const enabledState = await isModuleEnabled(companyId, "pos");
      assert.strictEqual(enabledState, true, "Should return true when enabled");

      // Test non-existent module
      const nonexistentState = await isModuleEnabled(companyId, "nonexistent_module_xyz");
      assert.strictEqual(nonexistentState, false, "Should return false for nonexistent module");

      console.log("✅ isModuleEnabled test passed");
    } finally {
      // Cleanup - restore original state
      if (companyId > 0 && moduleId > 0) {
        await pool.execute(
          `UPDATE company_modules SET enabled = ?
           WHERE company_id = ? AND module_id = ?`,
          [originalEnabled ? 1 : 0, companyId, moduleId]
        );
      }
    }
  }
);

test(
  "settings-modules - ModuleNotFoundError thrown when module doesn't exist",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";

    let companyId = 0;

    try {
      // Get company ID from fixtures
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT c.id
         FROM companies c
         INNER JOIN users u ON u.company_id = c.id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
           AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number((companyRows[0] as { id: number }).id);

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
test.after(async () => {
  await closeDbPool();
});
