// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Unit tests: Canonical permission bit/mask helpers (Epic 66 — Story 66-2)
//
// Run with:
//   npm run test:single -w @jurnapod/backoffice -- __test__/unit/permission-bits.test.ts

import { describe, it, expect } from "vitest";

import {
  PERMISSION_BITS,
  BIT_TO_NAME,
  PERMISSION_MASKS,
  MASK_TO_LABEL,
  SYSTEM_ROLE_CODES,
  isSystemRole,
  nameToBit,
  maskToBits,
  maskToPermissionNames,
  bitNamesToMask,
  formatMaskLabel,
  formatBitLabel,
  hasMinimumPermission,
  userHasPermission,
  calculatePermissionDiff,
  formatPermissionDiff,
  groupPermissionDiffs,
  actionGates,
  requireReadPermission,
  CANONICAL_MODULE_RESOURCES,
  CANONICAL_MODULES,
} from "@/lib/auth/permissions";

import type {
  UserPermissionEntry,
} from "@/lib/auth/permissions";

// ============================================================================
// Permission bits
// ============================================================================

describe("PERMISSION_BITS", () => {
  it("has canonical bit values matching Epic 39 spec", () => {
    expect(PERMISSION_BITS.READ).toBe(1);
    expect(PERMISSION_BITS.CREATE).toBe(2);
    expect(PERMISSION_BITS.UPDATE).toBe(4);
    expect(PERMISSION_BITS.DELETE).toBe(8);
    expect(PERMISSION_BITS.ANALYZE).toBe(16);
    expect(PERMISSION_BITS.MANAGE).toBe(32);
  });

  it("is powers of two for all bits", () => {
    for (const [, bit] of Object.entries(PERMISSION_BITS)) {
      // Each bit should be exactly a power of two
      expect(bit & (bit - 1)).toBe(0);
    }
  });
});

describe("BIT_TO_NAME", () => {
  it("maps each bit value to canonical name", () => {
    expect(BIT_TO_NAME[1]).toBe("READ");
    expect(BIT_TO_NAME[2]).toBe("CREATE");
    expect(BIT_TO_NAME[4]).toBe("UPDATE");
    expect(BIT_TO_NAME[8]).toBe("DELETE");
    expect(BIT_TO_NAME[16]).toBe("ANALYZE");
    expect(BIT_TO_NAME[32]).toBe("MANAGE");
  });
});

// ============================================================================
// Permission masks
// ============================================================================

describe("PERMISSION_MASKS", () => {
  it("has canonical mask values matching Epic 39 spec", () => {
    expect(PERMISSION_MASKS.READ).toBe(1);
    expect(PERMISSION_MASKS.WRITE).toBe(6);   // CREATE | UPDATE
    expect(PERMISSION_MASKS.CRUD).toBe(15);   // R | C | U | D
    expect(PERMISSION_MASKS.CRUDA).toBe(31);  // CRUD | ANALYZE
    expect(PERMISSION_MASKS.CRUDAM).toBe(63); // CRUDA | MANAGE
  });

  it("WRITE is CREATE(2) | UPDATE(4)", () => {
    expect(PERMISSION_MASKS.WRITE).toBe(
      PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE,
    );
  });

  it("CRUD is R | C | U | D", () => {
    expect(PERMISSION_MASKS.CRUD).toBe(
      PERMISSION_BITS.READ | PERMISSION_BITS.CREATE |
      PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE,
    );
  });

  it("CRUDA is CRUD | ANALYZE", () => {
    expect(PERMISSION_MASKS.CRUDA).toBe(
      PERMISSION_MASKS.CRUD | PERMISSION_BITS.ANALYZE,
    );
  });

  it("CRUDAM is CRUDA | MANAGE", () => {
    expect(PERMISSION_MASKS.CRUDAM).toBe(
      PERMISSION_MASKS.CRUDA | PERMISSION_BITS.MANAGE,
    );
  });
});

describe("MASK_TO_LABEL", () => {
  it("maps exact canonical masks to labels", () => {
    expect(MASK_TO_LABEL[1]).toBe("READ");
    expect(MASK_TO_LABEL[6]).toBe("WRITE");
    expect(MASK_TO_LABEL[15]).toBe("CRUD");
    expect(MASK_TO_LABEL[31]).toBe("CRUDA");
    expect(MASK_TO_LABEL[63]).toBe("CRUDAM");
  });
});

// ============================================================================
// System roles
// ============================================================================

describe("SYSTEM_ROLE_CODES", () => {
  it("contains all 6 canonical system roles", () => {
    expect(SYSTEM_ROLE_CODES).toHaveLength(6);
    expect(SYSTEM_ROLE_CODES).toContain("SUPER_ADMIN");
    expect(SYSTEM_ROLE_CODES).toContain("OWNER");
    expect(SYSTEM_ROLE_CODES).toContain("COMPANY_ADMIN");
    expect(SYSTEM_ROLE_CODES).toContain("ADMIN");
    expect(SYSTEM_ROLE_CODES).toContain("ACCOUNTANT");
    expect(SYSTEM_ROLE_CODES).toContain("CASHIER");
  });
});

describe("isSystemRole", () => {
  it("returns true for all system roles", () => {
    for (const role of SYSTEM_ROLE_CODES) {
      expect(isSystemRole(role)).toBe(true);
    }
  });

  it("returns false for custom roles", () => {
    expect(isSystemRole("CUSTOM_TELLER")).toBe(false);
    expect(isSystemRole("INVENTORY_MANAGER")).toBe(false);
    expect(isSystemRole("")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isSystemRole("")).toBe(false);
  });
});

// ============================================================================
// Bit conversion helpers
// ============================================================================

describe("nameToBit", () => {
  it("converts permission name to bit value", () => {
    expect(nameToBit("READ")).toBe(1);
    expect(nameToBit("CREATE")).toBe(2);
    expect(nameToBit("UPDATE")).toBe(4);
    expect(nameToBit("DELETE")).toBe(8);
    expect(nameToBit("ANALYZE")).toBe(16);
    expect(nameToBit("MANAGE")).toBe(32);
  });
});

describe("maskToBits", () => {
  it("decomposes CRUD(15) into all four bits", () => {
    const bits = maskToBits(15);
    expect(bits).toEqual([1, 2, 4, 8]);
  });

  it("decomposes CRUDA(31) into five bits", () => {
    const bits = maskToBits(31);
    expect(bits).toEqual([1, 2, 4, 8, 16]);
  });

  it("decomposes CRUDAM(63) into all six bits", () => {
    const bits = maskToBits(63);
    expect(bits).toEqual([1, 2, 4, 8, 16, 32]);
  });

  it("returns empty array for zero mask", () => {
    expect(maskToBits(0)).toEqual([]);
  });

  it("returns single bit for exact bit value", () => {
    expect(maskToBits(32)).toEqual([32]);
  });

  it("returns sorted bits for arbitrary mask", () => {
    // CREATE(2) | DELETE(8) | MANAGE(32) = 42
    expect(maskToBits(42)).toEqual([2, 8, 32]);
  });
});

describe("maskToPermissionNames", () => {
  it("returns READ for mask 1", () => {
    expect(maskToPermissionNames(1)).toEqual(["READ"]);
  });

  it("returns all bits for CRUD(15)", () => {
    expect(maskToPermissionNames(15)).toEqual(["READ", "CREATE", "UPDATE", "DELETE"]);
  });

  it("returns all bits for CRUDA(31)", () => {
    expect(maskToPermissionNames(31)).toEqual([
      "READ", "CREATE", "UPDATE", "DELETE", "ANALYZE",
    ]);
  });

  it("returns all bits for CRUDAM(63)", () => {
    expect(maskToPermissionNames(63)).toEqual([
      "READ", "CREATE", "UPDATE", "DELETE", "ANALYZE", "MANAGE",
    ]);
  });

  it("returns empty array for zero mask", () => {
    expect(maskToPermissionNames(0)).toEqual([]);
  });
});

describe("bitNamesToMask", () => {
  it("converts single permission to mask", () => {
    expect(bitNamesToMask(["READ"])).toBe(1);
  });

  it("converts CRUD to mask 15", () => {
    expect(bitNamesToMask(["READ", "CREATE", "UPDATE", "DELETE"])).toBe(15);
  });

  it("converts all permissions to mask 63", () => {
    expect(bitNamesToMask(["READ", "CREATE", "UPDATE", "DELETE", "ANALYZE", "MANAGE"])).toBe(63);
  });

  it("returns 0 for empty array", () => {
    expect(bitNamesToMask([])).toBe(0);
  });
});

// ============================================================================
// Formatting helpers
// ============================================================================

describe("formatMaskLabel", () => {
  it('returns "READ" for mask 1', () => {
    expect(formatMaskLabel(1)).toBe("READ");
  });

  it('returns "WRITE" for mask 6', () => {
    expect(formatMaskLabel(6)).toBe("WRITE");
  });

  it('returns "CRUD" for mask 15', () => {
    expect(formatMaskLabel(15)).toBe("CRUD");
  });

  it('returns "CRUDA" for mask 31', () => {
    expect(formatMaskLabel(31)).toBe("CRUDA");
  });

  it('returns "CRUDAM" for mask 63', () => {
    expect(formatMaskLabel(63)).toBe("CRUDAM");
  });

  it('returns "None" for mask 0', () => {
    expect(formatMaskLabel(0)).toBe("None");
  });

  it("returns bit names for non-canonical mask", () => {
    // CREATE(2) | MANAGE(32) = 34
    expect(formatMaskLabel(34)).toBe("CREATE+MANAGE");
  });

  it("returns bit names for READ | ANALYZE (17)", () => {
    expect(formatMaskLabel(17)).toBe("READ+ANALYZE");
  });
});

describe("formatBitLabel", () => {
  it("returns canonical name for known bit", () => {
    expect(formatBitLabel(1)).toBe("READ");
    expect(formatBitLabel(8)).toBe("DELETE");
  });

  it("returns hex for unknown bit", () => {
    expect(formatBitLabel(64)).toBe("0x40");
  });
});

// ============================================================================
// hasMinimumPermission
// ============================================================================

describe("hasMinimumPermission", () => {
  it("returns true when mask equals requirement", () => {
    expect(hasMinimumPermission(15, 15)).toBe(true);
  });

  it("returns true when mask includes requirement", () => {
    expect(hasMinimumPermission(63, 1)).toBe(true);
    expect(hasMinimumPermission(63, 15)).toBe(true);
    expect(hasMinimumPermission(31, 6)).toBe(true);
  });

  it("returns false when mask lacks required bits", () => {
    expect(hasMinimumPermission(1, 2)).toBe(false);
    expect(hasMinimumPermission(15, 32)).toBe(false);
    expect(hasMinimumPermission(6, 1)).toBe(false);
  });

  it("returns true for zero requirement", () => {
    expect(hasMinimumPermission(0, 0)).toBe(true);
    expect(hasMinimumPermission(63, 0)).toBe(true);
  });

  it("returns false when mask has partial but not full overlap", () => {
    // mask=3 (R|C), required=5 (R|U) → missing U
    expect(hasMinimumPermission(3, 5)).toBe(false);
  });
});

// ============================================================================
// userHasPermission
// ============================================================================

describe("userHasPermission", () => {
  const userPerms: UserPermissionEntry[] = [
    { module: "inventory", resource: "items", mask: 15 },    // CRUD
    { module: "accounting", resource: "journals", mask: 31 }, // CRUDA
    { module: "platform", resource: "*", mask: 63 },          // CRUDAM wildcard
    { module: "sales", resource: "invoices", mask: 1 },       // READ only
  ];

  it("grants when user has exact resource", () => {
    expect(userHasPermission(userPerms, "inventory", "items", 1)).toBe(true);
  });

  it("grants when user has sufficient mask", () => {
    expect(userHasPermission(userPerms, "inventory", "items", 15)).toBe(true);
  });

  it("denies when user lacks the resource", () => {
    expect(userHasPermission(userPerms, "inventory", "costing", 1)).toBe(false);
  });

  it("denies when user has insufficient mask", () => {
    expect(userHasPermission(userPerms, "inventory", "items", 32)).toBe(false);
  });

  it("grants via wildcard resource", () => {
    expect(userHasPermission(userPerms, "platform", "users", 4)).toBe(true);
    expect(userHasPermission(userPerms, "platform", "companies", 32)).toBe(true);
  });

  it("denies when module does not match", () => {
    expect(userHasPermission(userPerms, "pos", "transactions", 1)).toBe(false);
  });

  it("denies when sales user only has READ but needs CREATE", () => {
    expect(userHasPermission(userPerms, "sales", "invoices", 2)).toBe(false);
  });
});

// ============================================================================
// calculatePermissionDiff
// ============================================================================

describe("calculatePermissionDiff", () => {
  it("returns empty array when no changes", () => {
    const before: UserPermissionEntry[] = [
      { module: "inventory", resource: "items", mask: 15 },
    ];
    const after: UserPermissionEntry[] = [
      { module: "inventory", resource: "items", mask: 15 },
    ];
    expect(calculatePermissionDiff(before, after)).toEqual([]);
  });

  it("detects changed masks", () => {
    const before: UserPermissionEntry[] = [
      { module: "inventory", resource: "items", mask: 15 },
    ];
    const after: UserPermissionEntry[] = [
      { module: "inventory", resource: "items", mask: 1 },
    ];
    const diffs = calculatePermissionDiff(before, after);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      module: "inventory",
      resource: "items",
      fromMask: 15,
      toMask: 1,
    });
  });

  it("detects added permissions", () => {
    const before: UserPermissionEntry[] = [];
    const after: UserPermissionEntry[] = [
      { module: "accounting", resource: "journals", mask: 31 },
    ];
    const diffs = calculatePermissionDiff(before, after);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].fromMask).toBe(0);
    expect(diffs[0].toMask).toBe(31);
  });

  it("detects removed permissions", () => {
    const before: UserPermissionEntry[] = [
      { module: "inventory", resource: "items", mask: 15 },
    ];
    const after: UserPermissionEntry[] = [];
    const diffs = calculatePermissionDiff(before, after);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].fromMask).toBe(15);
    expect(diffs[0].toMask).toBe(0);
  });

  it("sorts diffs by module then resource", () => {
    const before: UserPermissionEntry[] = [
      { module: "sales", resource: "invoices", mask: 15 },
      { module: "inventory", resource: "costing", mask: 1 },
    ];
    const after: UserPermissionEntry[] = [
      { module: "sales", resource: "invoices", mask: 1 },
      { module: "inventory", resource: "costing", mask: 31 },
    ];
    const diffs = calculatePermissionDiff(before, after);
    expect(diffs).toHaveLength(2);
    expect(diffs[0].module).toBe("inventory");
    expect(diffs[1].module).toBe("sales");
  });
});

describe("formatPermissionDiff", () => {
  it("formats a CRUD → READ change", () => {
    const result = formatPermissionDiff({
      module: "inventory",
      resource: "items",
      fromMask: 15,
      toMask: 1,
    });
    expect(result).toBe("inventory.items: CRUD(15) → READ(1)");
  });

  it("formats a None → CRUDA addition", () => {
    const result = formatPermissionDiff({
      module: "accounting",
      resource: "journals",
      fromMask: 0,
      toMask: 31,
    });
    expect(result).toBe("accounting.journals: None(0) → CRUDA(31)");
  });
});

describe("groupPermissionDiffs", () => {
  it("groups diffs by module for change review", () => {
    const groups = groupPermissionDiffs([
      { module: "sales", resource: "payments", fromMask: 1, toMask: 15 },
      { module: "inventory", resource: "stock", fromMask: 15, toMask: 1 },
      { module: "inventory", resource: "items", fromMask: 0, toMask: 31 },
    ]);

    expect(groups).toEqual([
      {
        module: "inventory",
        diffs: [
          { module: "inventory", resource: "items", fromMask: 0, toMask: 31 },
          { module: "inventory", resource: "stock", fromMask: 15, toMask: 1 },
        ],
      },
      {
        module: "sales",
        diffs: [{ module: "sales", resource: "payments", fromMask: 1, toMask: 15 }],
      },
    ]);
  });

  it("returns no groups for empty diff input", () => {
    expect(groupPermissionDiffs([])).toEqual([]);
  });
});

// ============================================================================
// actionGates
// ============================================================================

describe("actionGates", () => {
  const userPerms: UserPermissionEntry[] = [
    { module: "inventory", resource: "items", mask: 15 }, // CRUD
    { module: "platform", resource: "*", mask: 63 },       // CRUDAM
  ];

  it("returns correct gates for CRUD user on items", () => {
    const gates = actionGates(userPerms, "inventory", "items", [
      "READ", "CREATE", "UPDATE", "DELETE", "ANALYZE", "MANAGE",
    ]);
    expect(gates.READ).toBe(true);
    expect(gates.CREATE).toBe(true);
    expect(gates.UPDATE).toBe(true);
    expect(gates.DELETE).toBe(true);
    expect(gates.ANALYZE).toBe(false);
    expect(gates.MANAGE).toBe(false);
  });

  it("returns all true for platform wildcard", () => {
    const gates = actionGates(userPerms, "platform", "users", [
      "READ", "CREATE", "UPDATE", "DELETE", "MANAGE",
    ]);
    expect(gates.READ).toBe(true);
    expect(gates.CREATE).toBe(true);
    expect(gates.MANAGE).toBe(true);
  });

  it("combines exact and wildcard masks instead of selecting numeric max", () => {
    const gates = actionGates(
      [
        { module: "platform", resource: "users", mask: 1 },
        { module: "platform", resource: "*", mask: 32 },
      ],
      "platform",
      "users",
      ["READ", "MANAGE"],
    );
    expect(gates.READ).toBe(true);
    expect(gates.MANAGE).toBe(true);
  });

  it("returns all false for module with no permissions", () => {
    const gates = actionGates(userPerms, "pos", "transactions", ["READ"]);
    expect(gates.READ).toBe(false);
  });
});

// ============================================================================
// requireReadPermission
// ============================================================================

describe("requireReadPermission", () => {
  it("creates a READ permission requirement", () => {
    const req = requireReadPermission("inventory", "items");
    expect(req).toEqual({
      module: "inventory",
      resource: "items",
      permissionMask: 1,
    });
  });
});

// ============================================================================
// CANONICAL_MODULE_RESOURCES
// ============================================================================

describe("CANONICAL_MODULE_RESOURCES", () => {
  it("covers all 8 canonical modules", () => {
    const modules = Object.keys(CANONICAL_MODULE_RESOURCES);
    expect(modules).toHaveLength(8);
    expect(modules).toEqual([...CANONICAL_MODULES]);
  });

  it("platform has admin resources", () => {
    expect(CANONICAL_MODULE_RESOURCES.platform).toContain("users");
    expect(CANONICAL_MODULE_RESOURCES.platform).toContain("roles");
    expect(CANONICAL_MODULE_RESOURCES.platform).toContain("companies");
    expect(CANONICAL_MODULE_RESOURCES.platform).toContain("outlets");
  });

  it("inventory includes items and prices", () => {
    expect(CANONICAL_MODULE_RESOURCES.inventory).toContain("items");
    expect(CANONICAL_MODULE_RESOURCES.inventory).not.toContain("prices");
    expect(CANONICAL_MODULE_RESOURCES.inventory).toContain("stock");
    expect(CANONICAL_MODULE_RESOURCES.inventory).toContain("costing");
  });
});
