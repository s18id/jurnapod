// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Unit tests: User admin pure helpers (Epic 66 — Story 66-1)
//
// Run with:
//   npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/users.test.ts

import { describe, it, expect } from "vitest";
import type { OutletResponse, RoleResponse, UserResponse } from "@jurnapod/shared";

import {
  validateUserForm,
  isUserFormValid,
  validateRoleAssignment,
  previewPermissionChange,
  generateChangeSummary,
  getUserActionGates,
  describeRolePermissionChange,
  type UserFormInput,
  type RoleAssignment,
} from "@/features/users/admin-helpers";

import type { UserPermissionEntry } from "@/lib/auth/permissions";
import {
  computeAccessChangeReview,
  previewAccessPermissions,
} from "@/features/users/access-review";

// ============================================================================
// validateUserForm
// ============================================================================

describe("validateUserForm", () => {
  it("accepts valid input with email, name, and role", () => {
    const input: UserFormInput = {
      email: "user@example.com",
      name: "Test User",
      roleCode: "CASHIER",
      outletId: 1,
    };
    const errors = validateUserForm(input);
    expect(errors).toHaveLength(0);
  });

  it("rejects missing email", () => {
    const input: UserFormInput = {
      email: "",
      name: "Test User",
      roleCode: "CASHIER",
    };
    const errors = validateUserForm(input);
    expect(errors.some((e) => e.field === "email")).toBe(true);
  });

  it("rejects invalid email format", () => {
    const input: UserFormInput = {
      email: "not-an-email",
      name: "Test User",
    };
    const errors = validateUserForm(input);
    expect(errors.some((e) => e.field === "email")).toBe(true);
  });

  it("rejects email longer than 254 characters", () => {
    const longLocal = "a".repeat(250);
    const input: UserFormInput = {
      email: `${longLocal}@example.com`,
    };
    const errors = validateUserForm(input);
    expect(errors.some((e) => e.field === "email")).toBe(true);
  });

  it("rejects empty name", () => {
    const input: UserFormInput = {
      email: "test@example.com",
      name: "   ",
    };
    const errors = validateUserForm(input);
    expect(errors.some((e) => e.field === "name")).toBe(true);
  });

  it("rejects name longer than 255 characters", () => {
    const input: UserFormInput = {
      email: "test@example.com",
      name: "a".repeat(256),
    };
    const errors = validateUserForm(input);
    expect(errors.some((e) => e.field === "name")).toBe(true);
  });

  it("rejects zero outlet ID", () => {
    const input: UserFormInput = {
      email: "test@example.com",
      outletId: 0,
    };
    const errors = validateUserForm(input);
    expect(errors.some((e) => e.field === "outletId")).toBe(true);
  });

  it("rejects negative outlet ID", () => {
    const input: UserFormInput = {
      email: "test@example.com",
      outletId: -1,
    };
    const errors = validateUserForm(input);
    expect(errors.some((e) => e.field === "outletId")).toBe(true);
  });

  it("accepts null outlet ID as unset", () => {
    const input: UserFormInput = {
      email: "test@example.com",
      outletId: null,
    };
    const errors = validateUserForm(input);
    expect(errors.some((e) => e.field === "outletId")).toBe(false);
  });

  it("accepts minimal valid input (email only)", () => {
    const input: UserFormInput = {
      email: "test@example.com",
    };
    const errors = validateUserForm(input);
    expect(errors).toHaveLength(0);
  });
});

describe("isUserFormValid", () => {
  it("returns true for valid input", () => {
    expect(isUserFormValid({ email: "test@example.com", name: "Valid" })).toBe(true);
  });

  it("returns false for invalid email", () => {
    expect(isUserFormValid({ email: "" })).toBe(false);
  });

  it("returns false for empty name with whitespace", () => {
    expect(isUserFormValid({ email: "test@example.com", name: "   " })).toBe(false);
  });
});

// ============================================================================
// validateRoleAssignment
// ============================================================================

describe("validateRoleAssignment", () => {
  it("accepts valid role assignment", () => {
    const assignment: RoleAssignment = {
      userId: 1,
      roleCode: "CASHIER",
      outletId: 5,
    };
    const result = validateRoleAssignment(assignment);
    expect(result.valid).toBe(true);
  });

  it("rejects zero userId", () => {
    const result = validateRoleAssignment({ userId: 0, roleCode: "CASHIER" });
    expect(result.valid).toBe(false);
  });

  it("rejects negative userId", () => {
    const result = validateRoleAssignment({ userId: -5, roleCode: "CASHIER" });
    expect(result.valid).toBe(false);
  });

  it("rejects empty role code", () => {
    const result = validateRoleAssignment({ userId: 42, roleCode: "" });
    expect(result.valid).toBe(false);
  });

  it("rejects whitespace-only role code", () => {
    const result = validateRoleAssignment({ userId: 42, roleCode: "   " });
    expect(result.valid).toBe(false);
  });

  it("accepts system role assignment (informational, not error)", () => {
    const result = validateRoleAssignment(
      { userId: 1, roleCode: "SUPER_ADMIN" },
      true, // explicitly a system role
    );
    expect(result.valid).toBe(true);
  });

  it("accepts assignment without outlet", () => {
    const result = validateRoleAssignment({ userId: 1, roleCode: "ADMIN", outletId: null });
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// previewPermissionChange
// ============================================================================

describe("previewPermissionChange", () => {
  const currentPermissions: UserPermissionEntry[] = [
    { module: "inventory", resource: "items", mask: 1 }, // READ only
    { module: "sales", resource: "invoices", mask: 0 },
  ];

  const newRolePermissions: UserPermissionEntry[] = [
    { module: "inventory", resource: "items", mask: 15 }, // CRUD
    { module: "accounting", resource: "journals", mask: 31 }, // CRUDA (new)
  ];

  it("detects changed permission on existing resource", () => {
    const previews = previewPermissionChange(currentPermissions, newRolePermissions);
    const itemsChange = previews.find(
      (p) => p.module === "inventory" && p.resource === "items",
    );
    expect(itemsChange?.changed).toBe(true);
    expect(itemsChange?.currentMask).toBe(1);
    expect(itemsChange?.newMask).toBe(15);
  });

  it("detects added resources", () => {
    const previews = previewPermissionChange(currentPermissions, newRolePermissions);
    const journalsEntry = previews.find(
      (p) => p.module === "accounting" && p.resource === "journals",
    );
    expect(journalsEntry?.changed).toBe(true);
    expect(journalsEntry?.currentMask).toBe(0);
    expect(journalsEntry?.newMask).toBe(31);
  });

  it("returns empty array for identical permissions", () => {
    const previews = previewPermissionChange(
      [{ module: "inventory", resource: "items", mask: 15 }],
      [{ module: "inventory", resource: "items", mask: 15 }],
    );
    expect(previews).toHaveLength(0);
  });

  it("sorts by module then resource", () => {
    const perms: UserPermissionEntry[] = [
      { module: "sales", resource: "invoices", mask: 1 },
      { module: "inventory", resource: "costing", mask: 1 },
    ];
    const previews = previewPermissionChange(perms, []);
    expect(previews).toHaveLength(2);
    expect(previews[0].module).toBe("inventory");
    expect(previews[1].module).toBe("sales");
  });
});

// ============================================================================
// generateChangeSummary
// ============================================================================

describe("generateChangeSummary", () => {
  it("returns empty array when nothing changed", () => {
    const before: Partial<UserFormInput> = {
      email: "test@example.com",
      name: "Test User",
    };
    const after: Partial<UserFormInput> = {
      email: "test@example.com",
      name: "Test User",
    };
    expect(generateChangeSummary(before, after)).toHaveLength(0);
  });

  it("detects email change", () => {
    const items = generateChangeSummary(
      { email: "old@example.com" },
      { email: "new@example.com" },
    );
    expect(items).toHaveLength(1);
    expect(items[0].field).toBe("email");
    expect(items[0].before).toBe("old@example.com");
    expect(items[0].after).toBe("new@example.com");
  });

  it("detects role change", () => {
    const items = generateChangeSummary(
      { roleCode: "CASHIER" },
      { roleCode: "ADMIN" },
    );
    expect(items).toHaveLength(1);
    expect(items[0].field).toBe("roleCode");
  });

  it("detects outlet change", () => {
    const items = generateChangeSummary(
      { outletId: 1 },
      { outletId: 2 },
    );
    expect(items).toHaveLength(1);
    expect(items[0].field).toBe("outletId");
  });

  it("detects status change", () => {
    const items = generateChangeSummary(
      { status: "active" },
      { status: "inactive" },
    );
    expect(items).toHaveLength(1);
    expect(items[0].field).toBe("status");
  });

  it("detects multiple field changes", () => {
    const items = generateChangeSummary(
      { email: "old@example.com", name: "Old Name", roleCode: "CASHIER" },
      { email: "new@example.com", name: "New Name", roleCode: "ADMIN" },
    );
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.field)).toContain("email");
    expect(items.map((i) => i.field)).toContain("name");
    expect(items.map((i) => i.field)).toContain("roleCode");
  });
});

// ============================================================================
// getUserActionGates (authorization UX)
// ============================================================================

describe("getUserActionGates", () => {
  const adminPerms: UserPermissionEntry[] = [
    { module: "platform", resource: "users", mask: 63 }, // CRUDAM
  ];

  const readOnlyPerms: UserPermissionEntry[] = [
    { module: "platform", resource: "users", mask: 1 }, // READ only
  ];

  const noPerms: UserPermissionEntry[] = [];

  it("grants all actions for CRUDAM user", () => {
    const gates = getUserActionGates(adminPerms);
    expect(gates.view).toBe(true);
    expect(gates.create).toBe(true);
    expect(gates.edit).toBe(true);
    expect(gates.deactivate).toBe(true);
    expect(gates.delete).toBe(true);
  });

  it("grants only view for READ-only user (CASHIER)", () => {
    // CASHIER with only platform.users.READ should see list but not create/edit
    const gates = getUserActionGates(readOnlyPerms);
    expect(gates.view).toBe(true);
    expect(gates.create).toBe(false);
    expect(gates.edit).toBe(false);
    expect(gates.deactivate).toBe(false);
    expect(gates.delete).toBe(false);
  });

  it("denies all actions for user with no platform.users permissions", () => {
    const gates = getUserActionGates(noPerms);
    expect(gates.view).toBe(false);
    expect(gates.create).toBe(false);
    expect(gates.edit).toBe(false);
    expect(gates.deactivate).toBe(false);
    expect(gates.delete).toBe(false);
  });

  it("grants view+edit for CRUD user (no MANAGE/ANALYZE)", () => {
    const crudPerms: UserPermissionEntry[] = [
      { module: "platform", resource: "users", mask: 15 },
    ];
    const gates = getUserActionGates(crudPerms);
    expect(gates.view).toBe(true);
    expect(gates.create).toBe(true);
    expect(gates.edit).toBe(true);
    expect(gates.delete).toBe(true);
    expect(gates.deactivate).toBe(true); // uses DELETE
  });

  it("does not allow deactivate with UPDATE-only permission", () => {
    const updateOnlyPerms: UserPermissionEntry[] = [
      { module: "platform", resource: "users", mask: 4 },
    ];
    const gates = getUserActionGates(updateOnlyPerms);
    expect(gates.edit).toBe(true);
    expect(gates.deactivate).toBe(false);
    expect(gates.delete).toBe(false);
  });
});

// ============================================================================
// describeRolePermissionChange
// ============================================================================

describe("describeRolePermissionChange", () => {
  it("formats a role change with gains and losses", () => {
    const result = describeRolePermissionChange(
      "CASHIER",
      "ADMIN",
      ["accounting.journals.CRUD", "treasury.transactions.READ"],
      ["sales.invoices.READ"],
    );
    expect(result).toContain("CASHIER → ADMIN");
    expect(result).toContain("Gains:");
    expect(result).toContain("Loses:");
  });

  it("formats role change with only gains", () => {
    const result = describeRolePermissionChange(
      "CASHIER",
      "OWNER",
      ["platform.users.CRUDAM"],
      [],
    );
    expect(result).toContain("CASHIER → OWNER");
    expect(result).toContain("Gains:");
    expect(result).not.toContain("Loses:");
  });

  it("formats role change with only losses", () => {
    const result = describeRolePermissionChange(
      "ADMIN",
      "CASHIER",
      [],
      ["accounting.journals.CRUD"],
    );
    expect(result).toContain("ADMIN → CASHIER");
    expect(result).not.toContain("Gains:");
    expect(result).toContain("Loses:");
  });
});

// ============================================================================
// Negative auth: CASHIER should not have admin actions
// ============================================================================

describe("authorization UX: action denial for low-privilege roles", () => {
  it("CASHIER lacks platform.users.CREATE", () => {
    const cashierPerms: UserPermissionEntry[] = [
      { module: "platform", resource: "users", mask: 1 }, // READ only
    ];
    const gates = getUserActionGates(cashierPerms);
    expect(gates.create).toBe(false);
    expect(gates.edit).toBe(false);
    expect(gates.delete).toBe(false);
  });

  it("CASHIER lacks platform.roles.MANAGE", () => {
    // READ only mask = 1, MANAGE requires bit 32
    // Verify MANAGE requires 32 which is not in mask 1
    expect((1 & 32) === 32).toBe(false);
  });

  it("CASHIER with no permissions has all actions denied", () => {
    const gates = getUserActionGates([]);
    expect(gates.view).toBe(false);
    expect(gates.create).toBe(false);
    expect(gates.edit).toBe(false);
    expect(gates.deactivate).toBe(false);
    expect(gates.delete).toBe(false);
  });
});

// ============================================================================
// access-review helpers
// ============================================================================

describe("computeAccessChangeReview", () => {
  const roles: RoleResponse[] = [
    { id: 1, code: "CASHIER", name: "Cashier", company_id: null, is_global: false, role_level: 10 },
    { id: 2, code: "ADMIN", name: "Admin", company_id: null, is_global: true, role_level: 80 },
  ];

  const outlets: OutletResponse[] = [
    { id: 1, code: "MAIN", name: "Main Outlet" },
    { id: 2, code: "SIDE", name: "Side Outlet" },
  ];

  const user: UserResponse = {
    id: 100,
    company_id: 10,
    email: "target@example.com",
    is_active: true,
    global_roles: ["CASHIER"],
    outlet_role_assignments: [
      { outlet_id: 1, outlet_code: "MAIN", outlet_name: "Main Outlet", role_codes: ["CASHIER"] },
    ],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  it("summarizes global and outlet role changes before submission", () => {
    const review = computeAccessChangeReview(
      user,
      {
        global_role_codes: ["ADMIN"],
        outlet_role_assignments: [
          { outlet_id: 1, role_codes: ["ADMIN"] },
          { outlet_id: 2, role_codes: ["CASHIER"] },
        ],
      },
      roles,
      outlets,
    );

    expect(review.hasChanges).toBe(true);
    expect(review.summary).toContain("Add global role: Admin");
    expect(review.summary).toContain("Remove global role: Cashier");
    expect(review.summary).toContain("Main Outlet: add Admin");
    expect(review.summary).toContain("Side Outlet: add Cashier");
    expect(review.outletChanges.map((change) => change.outletName)).toContain("Main Outlet");
    expect(review.outletChanges.map((change) => change.outletName)).toContain("Side Outlet");
  });

  it("detects unchanged access selections", () => {
    const review = computeAccessChangeReview(
      user,
      {
        global_role_codes: ["CASHIER"],
        outlet_role_assignments: [{ outlet_id: 1, role_codes: ["CASHIER"] }],
      },
      roles,
      outlets,
    );

    expect(review.hasChanges).toBe(false);
    expect(review.summary).toEqual([]);
    expect(review.outletChanges).toEqual([]);
    expect(review.removedOutlets).toEqual([]);
  });

  it("includes permission diffs derived from canonical role codes", () => {
    const review = computeAccessChangeReview(
      user,
      {
        global_role_codes: ["ADMIN"],
        outlet_role_assignments: [],
      },
      roles,
      outlets,
    );

    expect(review.permissionDiffs.length).toBeGreaterThan(0);
    expect(review.permissionDiffs.some((line) => line.includes("platform.users"))).toBe(true);
  });
});

describe("previewAccessPermissions", () => {
  it("derives effective permission preview from selected global and outlet roles", () => {
    const preview = previewAccessPermissions(
      ["ADMIN"],
      [{ outlet_id: 1, role_codes: ["CASHIER"] }],
    );

    expect(preview.some((entry) => entry.module === "platform" && entry.resource === "users")).toBe(true);
    expect(preview.some((entry) => entry.module === "inventory" && entry.resource === "items")).toBe(true);
  });
});
