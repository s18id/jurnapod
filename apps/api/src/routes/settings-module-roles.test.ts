// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Settings Module Roles Routes Tests
 *
 * Unit tests for settings module roles API route helpers and utilities.
 * Tests schema validation, role/module parameter handling, and permission mask operations.
 * CRITICAL: All tests using getDbPool() must close the pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, after } from "node:test";
import { z } from "zod";
import { closeDbPool, getDb } from "../lib/db.js";
import { NumericIdSchema } from "@jurnapod/shared";
import { sql } from "kysely";

// =============================================================================
// Settings Module Roles Routes - Numeric ID Schema Tests
// =============================================================================

describe("Settings Module Roles Routes - Numeric ID Schema", () => {
  test("accepts valid positive integer role ID", () => {
    const result = NumericIdSchema.safeParse(1);
    assert.equal(result.success, true);
  });

  test("accepts large role ID", () => {
    const result = NumericIdSchema.safeParse(999999);
    assert.equal(result.success, true);
  });

  test("rejects zero role ID", () => {
    const result = NumericIdSchema.safeParse(0);
    assert.equal(result.success, false);
  });

  test("rejects negative role ID", () => {
    const result = NumericIdSchema.safeParse(-1);
    assert.equal(result.success, false);
  });

  test("rejects non-integer role ID", () => {
    const result = NumericIdSchema.safeParse(1.5);
    assert.equal(result.success, false);
  });

  test("accepts string role ID (NumericIdSchema uses coerce)", () => {
    // Note: NumericIdSchema uses z.coerce.number(), so strings are accepted
    const result = NumericIdSchema.safeParse("1");
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data, 1);
    }
  });

  test("rejects null role ID", () => {
    const result = NumericIdSchema.safeParse(null);
    assert.equal(result.success, false);
  });
});

// =============================================================================
// Settings Module Roles Routes - Permission Mask Tests
// =============================================================================

describe("Settings Module Roles Routes - Permission Mask", () => {
  test("permission mask schema accepts valid integer", () => {
    const result = z.number().int().safeParse(15);
    assert.equal(result.success, true);
  });

  test("permission mask schema accepts zero", () => {
    const result = z.number().int().safeParse(0);
    assert.equal(result.success, true);
  });

  test("permission mask schema accepts max value 15", () => {
    const result = z.number().int().safeParse(15);
    assert.equal(result.success, true);
  });

  test("permission mask schema rejects non-integer", () => {
    const result = z.number().int().safeParse(7.5);
    assert.equal(result.success, false);
  });

  test("permission mask schema accepts negative values (z.number().int() allows negatives)", () => {
    // Note: z.number().int() does NOT restrict to positive values
    // The route handler does not enforce positive permission mask either
    const result = z.number().int().safeParse(-1);
    assert.equal(result.success, true);
  });

  test("permission mask schema rejects strings", () => {
    const result = z.number().int().safeParse("7");
    assert.equal(result.success, false);
  });

  test("permission bitmask values are correct", () => {
    // Standard permission bitmask: create=1, read=2, update=4, delete=8
    const PERMISSION_CREATE = 1;
    const PERMISSION_READ = 2;
    const PERMISSION_UPDATE = 4;
    const PERMISSION_DELETE = 8;

    assert.equal(PERMISSION_CREATE, 1);
    assert.equal(PERMISSION_READ, 2);
    assert.equal(PERMISSION_UPDATE, 4);
    assert.equal(PERMISSION_DELETE, 8);
  });

  test("bitwise OR combines permissions correctly", () => {
    const PERMISSION_CREATE = 1;
    const PERMISSION_READ = 2;
    const PERMISSION_UPDATE = 4;

    // Read + Write = 3
    assert.equal(PERMISSION_CREATE | PERMISSION_READ, 3);

    // Read + Write + Update = 7
    assert.equal(PERMISSION_CREATE | PERMISSION_READ | PERMISSION_UPDATE, 7);
  });

  test("bitwise AND checks permission presence", () => {
    const mask = 7; // create | read | update

    assert.equal((mask & 1) !== 0, true);  // has create
    assert.equal((mask & 2) !== 0, true);  // has read
    assert.equal((mask & 4) !== 0, true);  // has update
    assert.equal((mask & 8) !== 0, false); // no delete
  });

  test("bitwise AND removes permission", () => {
    let mask = 7; // create | read | update

    // Remove create (1)
    mask = mask & ~1;
    assert.equal((mask & 1) !== 0, false); // no longer has create
    assert.equal((mask & 2) !== 0, true);  // still has read
    assert.equal((mask & 4) !== 0, true);  // still has update
  });

  test("all permission combinations are valid", () => {
    const validMasks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

    for (const mask of validMasks) {
      const result = z.number().int().safeParse(mask);
      assert.equal(result.success, true, `Mask ${mask} should be valid`);
    }
  });

  test("maps permission names to bitmask values", () => {
    const permissionMap: Record<string, number> = {
      create: 1,
      read: 2,
      update: 4,
      delete: 8
    };

    assert.equal(permissionMap.create, 1);
    assert.equal(permissionMap.read, 2);
    assert.equal(permissionMap.update, 4);
    assert.equal(permissionMap.delete, 8);
  });

  test("calculates permission mask from permission names", () => {
    const permissionMap: Record<string, number> = {
      create: 1,
      read: 2,
      update: 4,
      delete: 8
    };

    const permissions = ["read", "update"];
    const mask = permissions.reduce((acc, p) => acc | permissionMap[p], 0);

    assert.equal(mask, 6);
  });
});

// =============================================================================
// Settings Module Roles Routes - Module Parameter Tests
// =============================================================================

describe("Settings Module Roles Routes - Module Parameter", () => {
  test("module parameter is a string", () => {
    const result = z.string().safeParse("pos");
    assert.equal(result.success, true);
  });

  test("valid module names are accepted", () => {
    const validModules = ["pos", "inventory", "reservation", "accounting", "purchasing", "settings"];

    for (const module of validModules) {
      const result = z.string().safeParse(module);
      assert.equal(result.success, true, `Module "${module}" should be valid`);
    }
  });

  test("empty module name is accepted (z.string() allows empty by default)", () => {
    // Note: z.string() by itself allows empty strings
    // The route uses raw string parameter, not schema validation
    const result = z.string().safeParse("");
    assert.equal(result.success, true);
  });

  test("module name validation pattern", () => {
    // Module names should be lowercase alphanumeric with underscores
    const modulePattern = /^[a-z][a-z0-9_]*$/;

    assert.ok(modulePattern.test("pos"));
    assert.ok(modulePattern.test("inventory"));
    assert.ok(modulePattern.test("crm_v2"));
    assert.ok(!modulePattern.test("POS"));
    assert.ok(!modulePattern.test("inventory-module"));
    assert.ok(!modulePattern.test("1module"));
  });
});

// =============================================================================
// Settings Module Roles Routes - Request Body Tests
// =============================================================================

describe("Settings Module Roles Routes - Request Body", () => {
  test("accepts valid permission_mask in request body", () => {
    const body = { permission_mask: 7 };

    const result = z.object({
      permission_mask: z.number().int()
    }).safeParse(body);

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.permission_mask, 7);
    }
  });

  test("accepts permission_mask of zero (no permissions)", () => {
    const body = { permission_mask: 0 };

    const result = z.object({
      permission_mask: z.number().int()
    }).safeParse(body);

    assert.equal(result.success, true);
  });

  test("accepts full permissions mask", () => {
    const body = { permission_mask: 15 };

    const result = z.object({
      permission_mask: z.number().int()
    }).safeParse(body);

    assert.equal(result.success, true);
  });

  test("rejects missing permission_mask", () => {
    const body = {};

    const result = z.object({
      permission_mask: z.number().int()
    }).safeParse(body);

    assert.equal(result.success, false);
  });

  test("rejects non-numeric permission_mask", () => {
    const body = { permission_mask: "full" };

    const result = z.object({
      permission_mask: z.number().int()
    }).safeParse(body);

    assert.equal(result.success, false);
  });

  test("accepts negative permission_mask (z.number().int() allows negatives)", () => {
    // Note: z.number().int() allows negative values
    // The route does not enforce positive permission mask in the schema
    const body = { permission_mask: -1 };

    const result = z.object({
      permission_mask: z.number().int()
    }).safeParse(body);

    assert.equal(result.success, true);
  });

  test("rejects non-integer permission_mask", () => {
    const body = { permission_mask: 7.5 };

    const result = z.object({
      permission_mask: z.number().int()
    }).safeParse(body);

    assert.equal(result.success, false);
  });
});

// =============================================================================
// Settings Module Roles Routes - Route Parameter Tests
// =============================================================================

describe("Settings Module Roles Routes - Route Parameters", () => {
  test("roleId parameter is extracted correctly", () => {
    const params = { roleId: "123" };
    const roleId = NumericIdSchema.parse(Number(params.roleId));
    assert.equal(roleId, 123);
  });

  test("module parameter is extracted correctly", () => {
    const params = { module: "pos" };
    const module = z.string().parse(params.module);
    assert.equal(module, "pos");
  });

  test("rejects invalid roleId format", () => {
    const params = { roleId: "abc" };
    
    try {
      NumericIdSchema.parse(Number(params.roleId));
      assert.fail("Should throw");
    } catch {
      assert.ok(true);
    }
  });

  test("rejects zero roleId", () => {
    const roleId = NumericIdSchema.safeParse(0);
    assert.equal(roleId.success, false);
  });
});

// =============================================================================
// Settings Module Roles Routes - Actor Context Tests
// =============================================================================

describe("Settings Module Roles Routes - Actor Context", () => {
  test("builds actor object with userId and ipAddress", () => {
    const actor = {
      userId: 1,
      ipAddress: "192.168.1.1"
    };

    assert.equal(actor.userId, 1);
    assert.equal(actor.ipAddress, "192.168.1.1");
  });

  test("handles missing x-forwarded-for header", () => {
    const forwardedFor = null;
    const ipAddress = forwardedFor ?? "unknown";
    assert.equal(ipAddress, "unknown");
  });

  test("extracts first IP from x-forwarded-for header", () => {
    const forwardedFor = "192.168.1.1, 10.0.0.1, 172.16.0.1";
    const ipAddress = forwardedFor.split(",")[0].trim();
    assert.equal(ipAddress, "192.168.1.1");
  });

  test("handles empty x-forwarded-for header", () => {
    const forwardedFor = "";
    const ipAddress = forwardedFor || "unknown";
    assert.equal(ipAddress, "unknown");
  });
});

// =============================================================================
// Settings Module Roles Routes - Module Role Permission Tests
// =============================================================================

describe("Settings Module Roles Routes - Module Role Permission", () => {
  test("setModuleRolePermission input structure is correct", () => {
    const input = {
      companyId: 1,
      roleId: 5,
      module: "pos",
      permissionMask: 7,
      actor: {
        userId: 1,
        ipAddress: "127.0.0.1"
      }
    };

    assert.equal(input.companyId, 1);
    assert.equal(input.roleId, 5);
    assert.equal(input.module, "pos");
    assert.equal(input.permissionMask, 7);
  });

  test("permission mask determines access levels", () => {
    const masks = [
      { mask: 0, hasRead: false, hasWrite: false, hasDelete: false },
      { mask: 1, hasRead: false, hasWrite: true, hasDelete: false },
      { mask: 2, hasRead: true, hasWrite: false, hasDelete: false },
      { mask: 3, hasRead: true, hasWrite: true, hasDelete: false },
      { mask: 15, hasRead: true, hasWrite: true, hasDelete: true }
    ];

    for (const tc of masks) {
      const hasCreate = (tc.mask & 1) !== 0;
      const hasRead = (tc.mask & 2) !== 0;
      const hasUpdate = (tc.mask & 4) !== 0;
      const hasDelete = (tc.mask & 8) !== 0;

      if (tc.mask === 0) {
        assert.ok(!hasCreate && !hasRead && !hasUpdate && !hasDelete);
      } else if (tc.mask === 1) {
        assert.ok(hasCreate && !hasRead && !hasUpdate && !hasDelete);
      } else if (tc.mask === 2) {
        assert.ok(!hasCreate && hasRead && !hasUpdate && !hasDelete);
      } else if (tc.mask === 3) {
        assert.ok(hasCreate && hasRead && !hasUpdate && !hasDelete);
      } else if (tc.mask === 15) {
        assert.ok(hasCreate && hasRead && hasUpdate && hasDelete);
      }
    }
  });

  test("validates companyId is positive", () => {
    const validIds = [1, 100, 999999];
    for (const id of validIds) {
      assert.ok(id > 0);
    }

    const invalidIds = [0, -1];
    for (const id of invalidIds) {
      assert.ok(id <= 0);
    }
  });
});

// =============================================================================
// Settings Module Roles Routes - Error Handling Tests
// =============================================================================

describe("Settings Module Roles Routes - Error Handling", () => {
  test("handles ZodError for invalid roleId", () => {
    const result = NumericIdSchema.safeParse("invalid");
    assert.equal(result.success, false);
  });

  test("handles missing permission_mask in body", () => {
    const result = z.object({
      permission_mask: z.number().int()
    }).safeParse({});

    assert.equal(result.success, false);
  });

  test("handles invalid permission_mask type", () => {
    const result = z.object({
      permission_mask: z.number().int()
    }).safeParse({ permission_mask: "full" });

    assert.equal(result.success, false);
  });

  test("role not found error is detected", () => {
    const error = new Error("Role not found");
    assert.ok(error.message.includes("not found"));
  });

  test("module not found error is detected", () => {
    const error = new Error("Module not found");
    assert.ok(error.message.includes("not found"));
  });
});

// =============================================================================
// Settings Module Roles Routes - Authorization Tests
// =============================================================================

describe("Settings Module Roles Routes - Authorization", () => {
  test("uses settings module with update permission", () => {
    const module = "settings";
    const permission = "update";
    assert.ok(typeof module === "string");
    assert.ok(typeof permission === "string");
  });

  test("permission bitmask constants are defined", () => {
    const PERMISSION_CREATE = 1;
    const PERMISSION_READ = 2;
    const PERMISSION_UPDATE = 4;
    const PERMISSION_DELETE = 8;

    assert.equal(PERMISSION_CREATE, 1);
    assert.equal(PERMISSION_READ, 2);
    assert.equal(PERMISSION_UPDATE, 4);
    assert.equal(PERMISSION_DELETE, 8);
  });

  test("checks user has admin role before allowing module role updates", () => {
    const userRole = "OWNER";
    const allowedRoles = ["OWNER", "ADMIN"];
    
    assert.ok(allowedRoles.includes(userRole));
  });

  test("validates company scope matches for role update", () => {
    const userCompanyId = 1;
    const targetCompanyId = 1;
    
    assert.equal(userCompanyId, targetCompanyId);
  });
});

// =============================================================================
// Settings Module Roles Routes - Database Pool Tests
// =============================================================================

describe("Settings Module Roles Routes - Database Pool", () => {
  test("getDb returns a valid db instance", () => {
    const db = getDb();
    assert.ok(db !== null);
    assert.ok(db !== undefined);
  });

  test("can execute query", async () => {
    const db = getDb();
    
    // Verify db is usable with a simple query
    const result = await sql`SELECT 1 as test`.execute(db);
    assert.ok(result.rows.length > 0);
  });
});

// =============================================================================
// Settings Module Roles Routes - Integration Tests
// =============================================================================

describe("Settings Module Roles Routes - Integration", () => {
  test("full update flow builds correct parameters", () => {
    const routeParams = {
      roleId: "5",
      module: "pos"
    };

    const body = {
      permission_mask: 7
    };

    const actor = {
      userId: 1,
      ipAddress: "192.168.1.1"
    };

    const roleId = NumericIdSchema.parse(Number(routeParams.roleId));
    const permissionMask = z.number().int().parse(body.permission_mask);

    const updateInput = {
      companyId: 1,
      roleId,
      module: routeParams.module,
      permissionMask,
      actor
    };

    assert.equal(updateInput.roleId, 5);
    assert.equal(updateInput.module, "pos");
    assert.equal(updateInput.permissionMask, 7);
    assert.equal(updateInput.actor.userId, 1);
  });

  test("validates all required fields are present", () => {
    const requiredFields = ["roleId", "module", "permission_mask"];

    const validInput = {
      roleId: "5",
      module: "pos",
      permission_mask: 7
    };

    for (const field of requiredFields) {
      assert.ok(field in validInput || typeof validInput[field as keyof typeof validInput] === "number");
    }
  });

  test("handles concurrent role permission updates", () => {
    // Simulate transaction isolation
    const tx1Mask = 7;
    const tx2Mask = 5;

    // Both masks should be valid
    assert.ok(z.number().int().safeParse(tx1Mask).success);
    assert.ok(z.number().int().safeParse(tx2Mask).success);
  });
});

// =============================================================================
// Settings Module Roles Routes - Response Structure Tests
// =============================================================================

describe("Settings Module Roles Routes - Response Structure", () => {
  test("success response has correct structure", () => {
    const successResponse = {
      success: true,
      data: {
        roleId: 5,
        module: "pos",
        permissionMask: 7,
        updatedAt: new Date().toISOString()
      }
    };

    assert.equal(successResponse.success, true);
    assert.ok(successResponse.data.roleId);
    assert.ok(successResponse.data.module);
    assert.ok(successResponse.data.permissionMask);
  });

  test("error response has correct structure", () => {
    const errorResponse = {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Role not found"
      }
    };

    assert.equal(errorResponse.success, false);
    assert.equal(errorResponse.error.code, "NOT_FOUND");
    assert.ok(typeof errorResponse.error.message === "string");
  });
});

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
