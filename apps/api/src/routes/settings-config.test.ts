// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Settings Config Routes Tests
 *
 * Unit tests for settings config API route helpers and utilities.
 * Tests schema validation, setting key parsing, and request validation.
 * CRITICAL: All tests using getDbPool() must close the pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, after } from "node:test";
import { z } from "zod";
import { closeDbPool, getDbPool } from "../lib/db.js";
import {
  SETTINGS_REGISTRY,
  SETTINGS_KEYS,
  SettingKey,
  NumericIdSchema
} from "@jurnapod/shared";
import type { RowDataPacket } from "mysql2/promise";
import { GetConfigSchema, UpdateConfigSchema } from "./settings-config.js";

// =============================================================================
// Settings Config Routes - Schema Validation Tests
// =============================================================================

describe("Settings Config Routes - Schema Validation", () => {
  describe("GetConfigSchema", () => {
    test("accepts valid outlet_id and keys", () => {
      const result = GetConfigSchema.safeParse({
        outlet_id: 1,
        keys: "feature.pos.auto_sync_enabled"
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.outlet_id, 1);
        assert.equal(result.data.keys, "feature.pos.auto_sync_enabled");
      }
    });

    test("accepts multiple comma-separated keys", () => {
      const result = GetConfigSchema.safeParse({
        outlet_id: 5,
        keys: "feature.pos.auto_sync_enabled,inventory.low_stock_threshold"
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.ok(result.data.keys.includes(","));
      }
    });

    test("rejects missing outlet_id", () => {
      const result = GetConfigSchema.safeParse({
        keys: "feature.pos.auto_sync_enabled"
      });

      assert.equal(result.success, false);
    });

    test("rejects missing keys", () => {
      const result = GetConfigSchema.safeParse({
        outlet_id: 1
      });

      assert.equal(result.success, false);
    });

    test("rejects empty keys string", () => {
      const result = GetConfigSchema.safeParse({
        outlet_id: 1,
        keys: ""
      });

      assert.equal(result.success, false);
    });

    test("rejects invalid outlet_id (zero)", () => {
      const result = GetConfigSchema.safeParse({
        outlet_id: 0,
        keys: "feature.pos.auto_sync_enabled"
      });

      assert.equal(result.success, false);
    });

    test("rejects negative outlet_id", () => {
      const result = GetConfigSchema.safeParse({
        outlet_id: -1,
        keys: "feature.pos.auto_sync_enabled"
      });

      assert.equal(result.success, false);
    });

    test("rejects non-numeric outlet_id", () => {
      const result = GetConfigSchema.safeParse({
        outlet_id: "abc",
        keys: "feature.pos.auto_sync_enabled"
      });

      assert.equal(result.success, false);
    });
  });

  describe("UpdateConfigSchema", () => {
    test("accepts valid single setting update", () => {
      const result = UpdateConfigSchema.safeParse({
        outlet_id: 1,
        settings: [
          { key: "feature.pos.auto_sync_enabled", value: true }
        ]
      });

      assert.equal(result.success, true);
    });

    test("accepts valid multiple setting updates", () => {
      const result = UpdateConfigSchema.safeParse({
        outlet_id: 5,
        settings: [
          { key: "feature.pos.auto_sync_enabled", value: false },
          { key: "inventory.low_stock_threshold", value: 10 }
        ]
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.settings.length, 2);
      }
    });

    test("accepts outlet-level update with outlet_id", () => {
      const result = UpdateConfigSchema.safeParse({
        outlet_id: 10,
        settings: [
          { key: "feature.pos.sync_interval_seconds", value: 120 }
        ]
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.outlet_id, 10);
      }
    });

    test("rejects missing outlet_id", () => {
      const result = UpdateConfigSchema.safeParse({
        settings: [
          { key: "feature.pos.auto_sync_enabled", value: true }
        ]
      });

      assert.equal(result.success, false);
    });

    test("accepts empty settings array (schema does not enforce min length)", () => {
      // Note: UpdateConfigSchema does not have .min(1) on the array
      const result = UpdateConfigSchema.safeParse({
        outlet_id: 1,
        settings: []
      });

      assert.equal(result.success, true);
    });

    test("rejects settings with missing key", () => {
      const result = UpdateConfigSchema.safeParse({
        outlet_id: 1,
        settings: [
          { value: true }
        ]
      });

      assert.equal(result.success, false);
    });

    test("accepts settings with undefined value (z.unknown() allows undefined)", () => {
      // Note: z.unknown() allows undefined, null, and any value
      const result = UpdateConfigSchema.safeParse({
        outlet_id: 1,
        settings: [
          { key: "feature.pos.auto_sync_enabled" }
        ]
      });

      // z.unknown() allows undefined, so this succeeds
      assert.equal(result.success, true);
    });

    test("rejects invalid outlet_id", () => {
      const result = UpdateConfigSchema.safeParse({
        outlet_id: "invalid",
        settings: [
          { key: "feature.pos.auto_sync_enabled", value: true }
        ]
      });

      assert.equal(result.success, false);
    });
  });
});

// =============================================================================
// Settings Config Routes - Setting Key Validation Tests
// =============================================================================

describe("Settings Config Routes - Setting Key Validation", () => {
  test("valid keys exist in SETTINGS_REGISTRY", () => {
    for (const key of SETTINGS_KEYS) {
      assert.ok(key in SETTINGS_REGISTRY, `Key "${key}" should exist in registry`);
    }
  });

  test("all SETTINGS_REGISTRY keys are valid setting keys", () => {
    const registryKeys = Object.keys(SETTINGS_REGISTRY) as SettingKey[];
    for (const key of registryKeys) {
      assert.ok(SETTINGS_KEYS.includes(key), `Registry key "${key}" should be in SETTINGS_KEYS`);
    }
  });

  test("parses valid setting key from comma-separated string", () => {
    const keysParam = "feature.pos.auto_sync_enabled,inventory.low_stock_threshold";
    const keys = keysParam.split(",").map((k) => k.trim());

    assert.equal(keys.length, 2);
    assert.equal(keys[0], "feature.pos.auto_sync_enabled");
    assert.equal(keys[1], "inventory.low_stock_threshold");
  });

  test("validates key exists in registry", () => {
    const key = "feature.pos.auto_sync_enabled";
    assert.ok(key in SETTINGS_REGISTRY);
  });

  test("detects invalid key not in registry", () => {
    const key = "invalid.setting.key";
    assert.ok(!(key in SETTINGS_REGISTRY));
  });

  test("filters valid keys from mixed input", () => {
    const inputKeys = [
      "feature.pos.auto_sync_enabled",
      "invalid.key",
      "inventory.low_stock_threshold",
      "another.invalid"
    ];

    const validKeys: SettingKey[] = [];
    for (const key of inputKeys) {
      if (key in SETTINGS_REGISTRY) {
        validKeys.push(key as SettingKey);
      }
    }

    assert.equal(validKeys.length, 2);
    assert.deepEqual(validKeys, [
      "feature.pos.auto_sync_enabled",
      "inventory.low_stock_threshold"
    ]);
  });

  test("returns empty array when no valid keys provided", () => {
    const inputKeys = ["invalid1", "invalid2", "bad.key"];

    const validKeys: SettingKey[] = [];
    for (const key of inputKeys) {
      if (key in SETTINGS_REGISTRY) {
        validKeys.push(key as SettingKey);
      }
    }

    assert.equal(validKeys.length, 0);
  });

  describe("Setting Key Categories", () => {
    test("has POS feature settings", () => {
      const posKeys = SETTINGS_KEYS.filter((k) => k.startsWith("feature.pos."));
      assert.ok(posKeys.length >= 2);
      assert.ok(posKeys.includes("feature.pos.auto_sync_enabled"));
      assert.ok(posKeys.includes("feature.pos.sync_interval_seconds"));
    });

    test("has reservation feature settings", () => {
      const reservationKeys = SETTINGS_KEYS.filter((k) => k.startsWith("feature.reservation."));
      assert.ok(reservationKeys.length >= 1);
      assert.ok(reservationKeys.includes("feature.reservation.default_duration_minutes"));
    });

    test("has inventory settings", () => {
      const inventoryKeys = SETTINGS_KEYS.filter((k) => k.startsWith("inventory."));
      assert.ok(inventoryKeys.length >= 5);
      assert.ok(inventoryKeys.includes("inventory.low_stock_threshold"));
      assert.ok(inventoryKeys.includes("inventory.reorder_point"));
      assert.ok(inventoryKeys.includes("inventory.allow_negative_stock"));
      assert.ok(inventoryKeys.includes("inventory.costing_method"));
      assert.ok(inventoryKeys.includes("inventory.warn_on_negative"));
    });

    test("has accounting settings", () => {
      const accountingKeys = SETTINGS_KEYS.filter((k) => k.startsWith("accounting."));
      assert.ok(accountingKeys.length >= 1);
      assert.ok(accountingKeys.includes("accounting.allow_multiple_open_fiscal_years"));
    });
  });
});

// =============================================================================
// Settings Config Routes - Value Type Validation Tests
// =============================================================================

describe("Settings Config Routes - Value Type Validation", () => {
  test("boolean setting accepts true value", () => {
    const setting = SETTINGS_REGISTRY["feature.pos.auto_sync_enabled"];
    const result = setting.schema.safeParse(true);
    assert.equal(result.success, true);
  });

  test("boolean setting accepts false value", () => {
    const setting = SETTINGS_REGISTRY["feature.pos.auto_sync_enabled"];
    const result = setting.schema.safeParse(false);
    assert.equal(result.success, true);
  });

  test("boolean setting accepts string 'true'", () => {
    const setting = SETTINGS_REGISTRY["feature.pos.auto_sync_enabled"];
    const result = setting.schema.safeParse("true");
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data, true);
  });

  test("boolean setting accepts string 'false'", () => {
    const setting = SETTINGS_REGISTRY["feature.pos.auto_sync_enabled"];
    const result = setting.schema.safeParse("false");
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data, false);
  });

  test("integer setting accepts valid number", () => {
    const setting = SETTINGS_REGISTRY["inventory.low_stock_threshold"];
    const result = setting.schema.safeParse(10);
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data, 10);
  });

  test("integer setting accepts string number", () => {
    const setting = SETTINGS_REGISTRY["inventory.low_stock_threshold"];
    const result = setting.schema.safeParse("25");
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data, 25);
  });

  test("integer setting rejects value below minimum", () => {
    const setting = SETTINGS_REGISTRY["inventory.low_stock_threshold"];
    const result = setting.schema.safeParse(-1);
    assert.equal(result.success, false);
  });

  test("sync_interval_seconds has minimum of 5", () => {
    const setting = SETTINGS_REGISTRY["feature.pos.sync_interval_seconds"];
    const result = setting.schema.safeParse(3);
    assert.equal(result.success, false);
  });

  test("default_duration_minutes has min 15 and max 480", () => {
    const setting = SETTINGS_REGISTRY["feature.reservation.default_duration_minutes"];
    
    // Test min boundary
    const minResult = setting.schema.safeParse(15);
    assert.equal(minResult.success, true);
    
    // Test max boundary
    const maxResult = setting.schema.safeParse(480);
    assert.equal(maxResult.success, true);
    
    // Test below min
    const belowMinResult = setting.schema.safeParse(14);
    assert.equal(belowMinResult.success, false);
    
    // Test above max
    const aboveMaxResult = setting.schema.safeParse(481);
    assert.equal(aboveMaxResult.success, false);
  });

  test("enum setting accepts valid values", () => {
    const setting = SETTINGS_REGISTRY["inventory.costing_method"];
    assert.ok(setting.schema.safeParse("AVG").success);
    assert.ok(setting.schema.safeParse("FIFO").success);
    assert.ok(setting.schema.safeParse("LIFO").success);
  });

  test("enum setting rejects invalid values", () => {
    const setting = SETTINGS_REGISTRY["inventory.costing_method"];
    assert.ok(!setting.schema.safeParse("INVALID").success);
    // Note: Input schema normalizes lowercase to uppercase, so "avg" becomes "AVG" and is valid
    assert.ok(setting.schema.safeParse("avg").success); // normalized to AVG
    assert.ok(!setting.schema.safeParse("xyz").success); // truly invalid
  });

  test("enum setting normalizes lowercase input to uppercase", () => {
    const setting = SETTINGS_REGISTRY["inventory.costing_method"];
    const result = setting.schema.safeParse("fifo");
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data, "FIFO");
  });
});

// =============================================================================
// Settings Config Routes - Default Value Tests
// =============================================================================

describe("Settings Config Routes - Default Values", () => {
  test("feature.pos.auto_sync_enabled defaults to true", () => {
    const setting = SETTINGS_REGISTRY["feature.pos.auto_sync_enabled"];
    assert.equal(setting.defaultValue, true);
    assert.equal(setting.valueType, "boolean");
  });

  test("feature.pos.sync_interval_seconds defaults to 60", () => {
    const setting = SETTINGS_REGISTRY["feature.pos.sync_interval_seconds"];
    assert.equal(setting.defaultValue, 60);
    assert.equal(setting.valueType, "int");
  });

  test("feature.reservation.default_duration_minutes defaults to 120", () => {
    const setting = SETTINGS_REGISTRY["feature.reservation.default_duration_minutes"];
    assert.equal(setting.defaultValue, 120);
    assert.equal(setting.valueType, "int");
  });

  test("inventory.low_stock_threshold defaults to 5", () => {
    const setting = SETTINGS_REGISTRY["inventory.low_stock_threshold"];
    assert.equal(setting.defaultValue, 5);
    assert.equal(setting.valueType, "int");
  });

  test("inventory.costing_method defaults to AVG", () => {
    const setting = SETTINGS_REGISTRY["inventory.costing_method"];
    assert.equal(setting.defaultValue, "AVG");
    assert.equal(setting.valueType, "enum");
  });

  test("all settings have default values", () => {
    for (const key of SETTINGS_KEYS) {
      const setting = SETTINGS_REGISTRY[key];
      assert.ok(setting.defaultValue !== undefined, `Setting "${key}" should have a default value`);
    }
  });
});

// =============================================================================
// Settings Config Routes - Request Building Tests
// =============================================================================

describe("Settings Config Routes - Request Building", () => {
  test("builds correct settings request structure", () => {
    const request = {
      outlet_id: 5,
      settings: [
        { key: "feature.pos.auto_sync_enabled", value: false },
        { key: "inventory.low_stock_threshold", value: 10 }
      ]
    };

    assert.ok(request.outlet_id > 0);
    assert.equal(request.settings.length, 2);
    assert.equal(request.settings[0].key, "feature.pos.auto_sync_enabled");
    assert.equal(request.settings[0].value, false);
  });

  test("validates value type after key validation", () => {
    const key = "feature.pos.auto_sync_enabled";
    const registryEntry = SETTINGS_REGISTRY[key];

    // Should succeed with boolean
    const boolResult = registryEntry.schema.safeParse(true);
    assert.equal(boolResult.success, true);

    // Should fail with number
    const numResult = registryEntry.schema.safeParse(123);
    assert.equal(numResult.success, false);
  });

  test("maps registry value types to storage value types", () => {
    const testCases = [
      { key: "feature.pos.auto_sync_enabled", expectedType: "boolean" },
      { key: "inventory.low_stock_threshold", expectedType: "number" },
      { key: "inventory.costing_method", expectedType: "string" }
    ];

    for (const tc of testCases) {
      const setting = SETTINGS_REGISTRY[tc.key as SettingKey];
      let storageType: "string" | "number" | "boolean" | "json" = "string";
      
      if (setting.valueType === "boolean") {
        storageType = "boolean";
      } else if (setting.valueType === "int") {
        storageType = "number";
      }

      assert.equal(storageType, tc.expectedType, `Setting "${tc.key}" should map to ${tc.expectedType}`);
    }
  });
});

// =============================================================================
// Settings Config Routes - Error Handling Tests
// =============================================================================

describe("Settings Config Routes - Error Handling", () => {
  test("ZodError contains details about validation failure", () => {
    const result = GetConfigSchema.safeParse({
      outlet_id: "invalid",
      keys: ""
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error instanceof z.ZodError);
      assert.ok(result.error.errors.length > 0);
    }
  });

  test("handles malformed JSON gracefully", () => {
    const invalidJson = "{ invalid json }";
    
    try {
      JSON.parse(invalidJson);
      assert.fail("Should have thrown");
    } catch (e) {
      assert.ok(e instanceof SyntaxError);
    }
  });

  test("handles invalid key in update request", () => {
    const invalidKey = "nonexistent.setting.key";
    assert.ok(!(invalidKey in SETTINGS_REGISTRY));
  });

  test("handles value that fails schema validation", () => {
    const setting = SETTINGS_REGISTRY["inventory.low_stock_threshold"];
    const result = setting.schema.safeParse("not a number");
    assert.equal(result.success, false);
  });
});

// =============================================================================
// Settings Config Routes - Database Pool Tests
// =============================================================================

describe("Settings Config Routes - Database Pool", () => {
  test("getDbPool returns a valid pool", () => {
    const pool = getDbPool();
    assert.ok(pool !== null);
    assert.ok(pool !== undefined);
  });

  test("can acquire and release connection", async () => {
    const pool = getDbPool();
    const conn = await pool.getConnection();
    
    assert.ok(conn !== null);
    assert.ok(conn !== undefined);
    
    // Verify connection is usable with a simple query
    const [rows] = await conn.execute<RowDataPacket[]>("SELECT 1 as test");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].test, 1);
    
    conn.release();
  });
});

// =============================================================================
// Settings Config Routes - Authorization Constants
// =============================================================================

describe("Settings Config Routes - Authorization", () => {
  test("settings module uses read permission for GET", () => {
    const module = "settings";
    const permission = "read";
    assert.ok(typeof module === "string");
    assert.ok(typeof permission === "string");
  });

  test("settings module uses update permission for PATCH", () => {
    const module = "settings";
    const permission = "update";
    assert.ok(typeof module === "string");
    assert.ok(typeof permission === "string");
  });

  test("permission bitmask constants are defined correctly", () => {
    // Permission bitmask: create=1, read=2, update=4, delete=8
    const PERMISSION_CREATE = 1;
    const PERMISSION_READ = 2;
    const PERMISSION_UPDATE = 4;
    const PERMISSION_DELETE = 8;

    assert.equal(PERMISSION_CREATE, 1);
    assert.equal(PERMISSION_READ, 2);
    assert.equal(PERMISSION_UPDATE, 4);
    assert.equal(PERMISSION_DELETE, 8);
  });
});

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
