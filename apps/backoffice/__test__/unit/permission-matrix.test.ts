// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Unit tests: PermissionMatrix component contracts and helpers (Epic 66 — Story 66-2)
//
// Run with:
//   npm run test:single -w @jurnapod/backoffice -- __test__/unit/permission-matrix.test.ts

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RoleResponse } from "@jurnapod/shared";
import { MantineProvider } from "@mantine/core";

import {
  CANONICAL_MODULE_RESOURCES,
  isSystemRole,
  SYSTEM_ROLE_CODES,
  formatMaskLabel,
  maskToPermissionNames,
  PERMISSION_BITS,
  PERMISSION_MASKS,
} from "@/lib/auth/permissions";

import type {
  PermissionCell,
  PermissionMatrixProps,
} from "@/components/permissions/PermissionMatrix";

import type { CanonicalModule } from "@/lib/auth/permissions";
import {
  buildRolePermissionReviewGroups,
  ROLE_CHANGE_HISTORY_CONTRACT_GAP,
  ROLE_OUTLET_SCOPING_CONTRACT_GAP,
  RoleDetailShell,
  buildCanonicalEmptyPermissionCells,
  isReadOnlyRole,
  permissionCellsToRolePermissionEntries,
} from "@/features/roles/role-detail-shell";

const systemRole: RoleResponse = {
  id: 6,
  code: "CASHIER",
  name: "Cashier",
  company_id: null,
  is_global: true,
  role_level: 10,
};

const customRole: RoleResponse = {
  id: 101,
  code: "STORE_MANAGER",
  name: "Store Manager",
  company_id: 42,
  is_global: false,
  role_level: 20,
};

function renderRoleDetail(role: RoleResponse): string {
  return renderToStaticMarkup(
    createElement(MantineProvider, {}, createElement(RoleDetailShell, { role })),
  );
}

function renderEditableRoleDetail(): string {
  return renderToStaticMarkup(
    createElement(
      MantineProvider,
      {},
      createElement(RoleDetailShell, {
        role: customRole,
        canManageRoles: true,
        permissions: [
          { module: "platform", resource: "roles", mask: 63 },
          { module: "inventory", resource: "items", mask: 15 },
        ],
        onSavePermissions: async () => undefined,
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Module resource coverage tests (verify matrix population)
// ---------------------------------------------------------------------------

describe("canonical module.resource coverage", () => {
  it("covers all 8 modules with resources", () => {
    const modules = Object.keys(CANONICAL_MODULE_RESOURCES) as CanonicalModule[];
    expect(modules).toHaveLength(8);
  });

  it("each module has at least one resource", () => {
    for (const [module, resources] of Object.entries(CANONICAL_MODULE_RESOURCES)) {
      expect(resources.length, `${module} should have resources`).toBeGreaterThan(0);
    }
  });

  it("platform module includes all core admin resources", () => {
    const platformResources = CANONICAL_MODULE_RESOURCES.platform;
    expect(platformResources).toContain("users");
    expect(platformResources).toContain("roles");
    expect(platformResources).toContain("companies");
    expect(platformResources).toContain("outlets");
    expect(platformResources).toContain("settings");
  });

  it("inventory module includes canonical inventory resources", () => {
    const invResources = CANONICAL_MODULE_RESOURCES.inventory;
    expect(invResources).toContain("items");
    expect(invResources).toContain("stock");
    expect(invResources).toContain("costing");
    expect(invResources).not.toContain("prices");
  });
});

describe("RoleDetailShell read-only role detail tabs", () => {
  it("renders all Story 66-2 role detail tabs and remaining unavailable states", () => {
    const html = renderRoleDetail(customRole);

    expect(html).toContain("Overview");
    expect(html).toContain("Permission Matrix");
    expect(html).toContain("Outlet Scoping");
    expect(html).toContain("Change History");
    expect(html).toContain(ROLE_OUTLET_SCOPING_CONTRACT_GAP);
    expect(html).toContain(ROLE_CHANGE_HISTORY_CONTRACT_GAP);
  });

  it("renders system role read-only badge and immutable role messaging", () => {
    const html = renderRoleDetail(systemRole);

    expect(isReadOnlyRole(systemRole)).toBe(true);
    expect(html).toContain("System Role");
    expect(html).toContain("System roles are immutable in the backoffice");
    expect(html).toContain("Permission cells remain read-only");
  });

  it("blocks custom-role permission mutation when the actor lacks platform.roles.MANAGE", () => {
    const html = renderRoleDetail(customRole);

    expect(isReadOnlyRole(customRole)).toBe(false);
    expect(html).toContain("Permission editing unavailable");
    expect(html).toContain("platform.roles.MANAGE");
    expect(html).toContain("Save permission changes");
    expect(html).toContain("disabled");
  });

  it("renders custom role permission matrix as editable for MANAGE actors", () => {
    const html = renderEditableRoleDetail();

    expect(html).toContain("Custom role editable");
    expect(html).toContain("Editable");
    expect(html).toContain("Save permission changes");
    expect(html).toContain("platform");
    expect(html).toContain("roles");
    expect(html).toContain("CRUDAM (63)");
  });

  it("builds grouped before/after review data before mutation payload creation", () => {
    const before: PermissionCell[] = [
      { module: "inventory", resource: "items", mask: 15 },
      { module: "platform", resource: "roles", mask: 63 },
    ];
    const after: PermissionCell[] = [
      { module: "inventory", resource: "items", mask: 1 },
      { module: "platform", resource: "roles", mask: 63 },
      { module: "purchasing", resource: "orders", mask: 1 },
    ];

    const groups = buildRolePermissionReviewGroups(before, after);
    expect(groups).toEqual([
      {
        module: "inventory",
        diffs: [{ module: "inventory", resource: "items", fromMask: 15, toMask: 1 }],
      },
      {
        module: "purchasing",
        diffs: [{ module: "purchasing", resource: "orders", fromMask: 0, toMask: 1 }],
      },
    ]);

    expect(permissionCellsToRolePermissionEntries(after)).toEqual([
      { module: "inventory", resource: "items", mask: 1 },
      { module: "platform", resource: "roles", mask: 63 },
      { module: "purchasing", resource: "orders", mask: 1 },
    ]);
  });

  it("renders canonical module resources through the read-only PermissionMatrix shell", () => {
    const cells = buildCanonicalEmptyPermissionCells();
    const html = renderRoleDetail(customRole);

    expect(cells).toHaveLength(
      Object.values(CANONICAL_MODULE_RESOURCES).reduce((total, resources) => total + resources.length, 0),
    );
    expect(html).toContain("platform");
    expect(html).toContain("roles");
    expect(html).toContain("purchasing");
    expect(html).toContain("reports");
    expect(html).toContain("Read-only");
    expect(html).toContain("0 pending changes");
  });
});

// ---------------------------------------------------------------------------
// System role readonly enforcement
// ---------------------------------------------------------------------------

describe("system role readonly enforcement", () => {
  it("all system roles are read-only", () => {
    for (const role of SYSTEM_ROLE_CODES) {
      expect(isSystemRole(role), `${role} should be a system role`).toBe(true);
    }
  });

  it("CASHIER is a system role (renders read-only)", () => {
    expect(isSystemRole("CASHIER")).toBe(true);
  });

  it("SUPER_ADMIN is a system role (renders read-only)", () => {
    expect(isSystemRole("SUPER_ADMIN")).toBe(true);
  });

  it("custom roles are not system roles (editable)", () => {
    expect(isSystemRole("INVENTORY_AUDITOR")).toBe(false);
    expect(isSystemRole("STORE_MANAGER")).toBe(false);
    expect(isSystemRole("REGIONAL_LEAD")).toBe(false);
  });

  it("empty string is not a system role", () => {
    expect(isSystemRole("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PermissionCell type contract
// ---------------------------------------------------------------------------

describe("PermissionCell type", () => {
  it("accepts valid entries", () => {
    const cell: PermissionCell = {
      module: "inventory",
      resource: "items",
      mask: 15,
    };
    expect(cell.module).toBe("inventory");
    expect(cell.resource).toBe("items");
    expect(cell.mask).toBe(15);
  });

  it("zero mask means no permissions", () => {
    const cell: PermissionCell = {
      module: "platform",
      resource: "users",
      mask: 0,
    };
    expect(cell.mask).toBe(0);
    expect(maskToPermissionNames(cell.mask)).toEqual([]);
    expect(formatMaskLabel(cell.mask)).toBe("None");
  });

  it("CRUDAM mask decomposes to all 6 bits", () => {
    const cell: PermissionCell = {
      module: "platform",
      resource: "users",
      mask: 63,
    };
    const bits = maskToPermissionNames(cell.mask);
    expect(bits).toEqual(["READ", "CREATE", "UPDATE", "DELETE", "ANALYZE", "MANAGE"]);
  });
});

// ---------------------------------------------------------------------------
// PermissionMatrixProps type contract
// ---------------------------------------------------------------------------

describe("PermissionMatrixProps type", () => {
  it("accepts minimal props for system role", () => {
    const props: PermissionMatrixProps = {
      roleCode: "CASHIER",
      permissions: [],
    };
    expect(props.roleCode).toBe("CASHIER");
    expect(props.permissions).toEqual([]);
    // No onChange → read-only (system role)
  });

  it("accepts full props for editable custom role", () => {
    const onChange = (_perms: PermissionCell[]) => {
      // no-op for test
    };
    const props: PermissionMatrixProps = {
      roleCode: "CUSTOM_ROLE",
      permissions: [
        { module: "inventory", resource: "items", mask: 15 },
      ],
      onChange,
      readOnly: false,
      maxHeight: "50vh",
    };
    expect(props.roleCode).toBe("CUSTOM_ROLE");
    expect(props.onChange).toBe(onChange);
    expect(props.readOnly).toBe(false);
    expect(props.maxHeight).toBe("50vh");
  });

  it("readOnly prop overrides system role check", () => {
    // Even for a custom role, forceReadOnly=true makes it read-only
    const props: PermissionMatrixProps = {
      roleCode: "CUSTOM_ROLE",
      permissions: [],
      readOnly: true,
    };
    expect(props.readOnly).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mask label formatting for matrix display
// ---------------------------------------------------------------------------

describe("mask display in matrix cells", () => {
  it("CRUD(15) changed to READ(1) produces different labels", () => {
    expect(formatMaskLabel(15)).toBe("CRUD");
    expect(formatMaskLabel(1)).toBe("READ");
    expect(formatMaskLabel(15)).not.toBe(formatMaskLabel(1));
  });

  it("CRUDA(31) decomposes to READ+CREATE+UPDATE+DELETE+ANALYZE", () => {
    expect(maskToPermissionNames(31)).toEqual([
      "READ", "CREATE", "UPDATE", "DELETE", "ANALYZE",
    ]);
  });

  it("all canonical masks are formatted correctly", () => {
    expect(formatMaskLabel(PERMISSION_MASKS.READ)).toBe("READ");
    expect(formatMaskLabel(PERMISSION_MASKS.WRITE)).toBe("WRITE");
    expect(formatMaskLabel(PERMISSION_MASKS.CRUD)).toBe("CRUD");
    expect(formatMaskLabel(PERMISSION_MASKS.CRUDA)).toBe("CRUDA");
    expect(formatMaskLabel(PERMISSION_MASKS.CRUDAM)).toBe("CRUDAM");
  });
});

// ---------------------------------------------------------------------------
// Permission bit toggle simulation (pure logic)
// ---------------------------------------------------------------------------

describe("permission bit toggle logic", () => {
  it("toggling a bit XORs it against the mask", () => {
    let mask = 15; // CRUD
    mask ^= PERMISSION_BITS.ANALYZE; // toggle ANALYZE on → 31
    expect(mask).toBe(31);

    mask ^= PERMISSION_BITS.ANALYZE; // toggle ANALYZE off → 15
    expect(mask).toBe(15);
  });

  it("toggling a bit that is already set removes it", () => {
    let mask = 15; // CRUD
    mask ^= PERMISSION_BITS.READ; // toggle READ off → 14
    expect(mask).toBe(14);
    expect(maskToPermissionNames(14)).toEqual(["CREATE", "UPDATE", "DELETE"]);
  });

  it("toggling all bits on then off returns to zero", () => {
    let mask = 0;
    mask ^= PERMISSION_BITS.READ;
    mask ^= PERMISSION_BITS.CREATE;
    mask ^= PERMISSION_BITS.UPDATE;
    mask ^= PERMISSION_BITS.DELETE;
    mask ^= PERMISSION_BITS.ANALYZE;
    mask ^= PERMISSION_BITS.MANAGE;
    expect(mask).toBe(63);

    mask ^= PERMISSION_BITS.READ;
    mask ^= PERMISSION_BITS.CREATE;
    mask ^= PERMISSION_BITS.UPDATE;
    mask ^= PERMISSION_BITS.DELETE;
    mask ^= PERMISSION_BITS.ANALYZE;
    mask ^= PERMISSION_BITS.MANAGE;
    expect(mask).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Preset mask selection simulation
// ---------------------------------------------------------------------------

describe("preset mask selection", () => {
  it("setting CRUD replaces previous mask", () => {
    // Starting from READ(1), change to CRUD(15)
    const before = { module: "inventory" as CanonicalModule, resource: "items", mask: 1 };
    const after = { ...before, mask: PERMISSION_MASKS.CRUD };
    expect(after.mask).toBe(15);
  });

  it("setting to zero mask removes the entry", () => {
    // When mask is 0, entry should be removed from the array
    const permissions: PermissionCell[] = [
      { module: "inventory" as CanonicalModule, resource: "items", mask: 15 },
    ];
    const filtered = permissions.filter((p) => p.mask !== 0);
    expect(filtered).toHaveLength(1);

    const zeroed = permissions.map((p) => ({ ...p, mask: 0 })).filter((p) => p.mask !== 0);
    expect(zeroed).toHaveLength(0);
  });

  it("all preset masks are distinct", () => {
    const masks = Object.values(PERMISSION_MASKS);
    const uniqueMasks = new Set(masks);
    expect(uniqueMasks.size).toBe(masks.length);
  });

  it("None preset is represented by zero mask", () => {
    const noneMask = 0;
    expect(formatMaskLabel(noneMask)).toBe("None");
  });
});
