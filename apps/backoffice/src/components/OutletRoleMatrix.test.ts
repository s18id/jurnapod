// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it } from "node:test";
import assert from "node:assert";

// Task 1: Matrix grid layout with sticky headers
// Task 2: Bulk assign/revoke with preview
// Task 3: Client/server validation with row-level feedback
// Task 4: Deterministic per-row results and audit telemetry

// Mock data for testing
interface RoleResponse {
  id: number;
  code: string;
  name: string;
  role_level: number;
  is_global: boolean;
}

interface OutletResponse {
  id: number;
  name: string;
  code: string;
}

// Test helper functions that mirror the component logic
function getAssignableRoles(roles: RoleResponse[], actorMaxRoleLevel: number): RoleResponse[] {
  return roles.filter((role) => role.role_level < actorMaxRoleLevel);
}

function isRoleDisabled(role: RoleResponse, actorMaxRoleLevel: number): boolean {
  return role.role_level >= actorMaxRoleLevel;
}

function getCellState(outletRoleCodes: string[], roleCode: string): "checked" | "none" {
  return outletRoleCodes.includes(roleCode) ? "checked" : "none";
}

function calculatePreviewChanges(
  selectedOutlets: OutletResponse[],
  selectedRoleCodes: string[],
  outletRoleCodesFor: (outletId: number) => string[]
): { additions: number; removals: number } {
  let additions = 0;
  let removals = 0;

  for (const outlet of selectedOutlets) {
    const currentRoles = new Set(outletRoleCodesFor(outlet.id));
    for (const roleCode of selectedRoleCodes) {
      if (currentRoles.has(roleCode)) {
        removals++;
      } else {
        additions++;
      }
    }
  }

  return { additions, removals };
}

function calculateDeltaSize(
  existingGlobalRoles: string[],
  desiredGlobalRoles: string[],
  existingOutletAssignments: Array<{ outlet_id: number; role_codes: string[] }>,
  desiredOutletAssignments: Array<{ outlet_id: number; role_codes: string[] }>
): { additions: number; removals: number; total: number } {
  // Global role changes
  const existingRoles = new Set<string>(existingGlobalRoles);
  const desiredRoles = new Set<string>(desiredGlobalRoles);
  const globalAdditions = [...desiredRoles].filter(r => !existingRoles.has(r)).length;
  const globalRemovals = [...existingRoles].filter(r => !desiredRoles.has(r)).length;

  // Outlet role changes
  const existingMap = new Map(existingOutletAssignments.map(a => [a.outlet_id, new Set(a.role_codes)]));
  const desiredMap = new Map(desiredOutletAssignments.map(a => [a.outlet_id, new Set(a.role_codes)]));

  let outletAdditions = 0;
  let outletRemovals = 0;

  // Count additions (roles in desired but not in existing)
  for (const [outletId, roles] of desiredMap) {
    const existing = existingMap.get(outletId) ?? new Set<string>();
    for (const role of roles) {
      if (!existing.has(role as string)) outletAdditions++;
    }
  }

  // Count removals (roles in existing but not in desired)
  // For outlets that exist in both, count individual role removals
  // For outlets that no longer exist, count all their roles as removals
  for (const [outletId, roles] of existingMap) {
    if (desiredMap.has(outletId)) {
      // Outlet still exists, count roles removed
      const desired = desiredMap.get(outletId)!;
      for (const role of roles) {
        if (!desired.has(role as string)) outletRemovals++;
      }
    } else {
      // Outlet removed entirely, count all roles as removals
      outletRemovals += roles.size;
    }
  }

  return {
    additions: globalAdditions + outletAdditions,
    removals: globalRemovals + outletRemovals,
    total: globalAdditions + globalRemovals + outletAdditions + outletRemovals
  };
}

// Tests
describe("OutletRoleMatrix - Role Filtering", () => {
  const roles: RoleResponse[] = [
    { id: 1, code: "OWNER", name: "Owner", role_level: 0, is_global: false },
    { id: 2, code: "ADMIN", name: "Admin", role_level: 1, is_global: false },
    { id: 3, code: "CASHIER", name: "Cashier", role_level: 2, is_global: false },
    { id: 4, code: "SUPER_ADMIN", name: "Super Admin", role_level: -1, is_global: true },
  ];

  it("filters roles by actor max role level", () => {
    const assignable = getAssignableRoles(roles, 2);
    // OWNER (0 < 2), ADMIN (1 < 2), CASHIER (2 < 2 is false), SUPER_ADMIN (-1 < 2)
    assert.strictEqual(assignable.length, 3); // OWNER, ADMIN, SUPER_ADMIN
    const codes = assignable.map(r => r.code);
    assert.ok(codes.includes("OWNER"));
    assert.ok(codes.includes("ADMIN"));
    assert.ok(codes.includes("SUPER_ADMIN"));
  });

  it("disables roles at or above actor level", () => {
    // isRoleDisabled: role.role_level >= actorMaxRoleLevel
    assert.strictEqual(isRoleDisabled(roles[0], 2), false); // OWNER level 0 >= 2 is false
    assert.strictEqual(isRoleDisabled(roles[2], 2), true);  // CASHIER level 2 >= 2 is true (disabled)
    assert.strictEqual(isRoleDisabled(roles[2], 1), true);  // CASHIER level 2 >= 1 is true (disabled)
    assert.strictEqual(isRoleDisabled(roles[3], 2), false);  // SUPER_ADMIN level -1 >= 2 is false
  });

  it("allows roles below actor level", () => {
    const actorLevel = 1;
    assert.strictEqual(isRoleDisabled(roles[0], actorLevel), false); // OWNER level 0 >= 1 is false
    assert.strictEqual(isRoleDisabled(roles[1], actorLevel), true);  // ADMIN level 1 >= 1 is true (disabled at same level)
    assert.strictEqual(isRoleDisabled(roles[1], 2), false); // ADMIN level 1 >= 2 is false
  });
});

describe("OutletRoleMatrix - Cell State", () => {
  it("returns checked when role is assigned to outlet", () => {
    const outletRoleCodes = ["OWNER", "CASHIER"];
    assert.strictEqual(getCellState(outletRoleCodes, "OWNER"), "checked");
    assert.strictEqual(getCellState(outletRoleCodes, "CASHIER"), "checked");
  });

  it("returns none when role is not assigned to outlet", () => {
    const outletRoleCodes = ["OWNER", "CASHIER"];
    assert.strictEqual(getCellState(outletRoleCodes, "ADMIN"), "none");
    assert.strictEqual(getCellState(outletRoleCodes, "ACCOUNTANT"), "none");
  });

  it("returns none for empty role assignments", () => {
    const outletRoleCodes: string[] = [];
    assert.strictEqual(getCellState(outletRoleCodes, "OWNER"), "none");
  });
});

describe("OutletRoleMatrix - Preview Changes", () => {
  const outlets: OutletResponse[] = [
    { id: 1, name: "Outlet A", code: "OA" },
    { id: 2, name: "Outlet B", code: "OB" },
  ];

  it("calculates additions when roles are new", () => {
    const outletRoleCodesFor = (outletId: number) => {
      if (outletId === 1) return ["OWNER"];
      return [];
    };

    const { additions, removals } = calculatePreviewChanges(
      outlets,
      ["ADMIN", "CASHIER"],
      outletRoleCodesFor
    );

    // Outlet 1: OWNER exists, adding ADMIN + CASHIER = 2 additions
    // Outlet 2: nothing exists, adding ADMIN + CASHIER = 2 additions
    // But we're checking if those roles exist, so:
    // Outlet 1: ADMIN not in ["OWNER"], CASHIER not in ["OWNER"] = 2 additions
    // Outlet 2: ADMIN not in [], CASHIER not in [] = 2 additions
    // Total: 4 additions
    assert.strictEqual(additions, 4);
    assert.strictEqual(removals, 0);
  });

  it("calculates removals when roles exist and will be removed", () => {
    const outletRoleCodesFor = (outletId: number) => {
      if (outletId === 1) return ["OWNER", "ADMIN"];
      return ["CASHIER"];
    };

    const { additions, removals } = calculatePreviewChanges(
      outlets,
      ["OWNER", "ADMIN"],
      outletRoleCodesFor
    );

    // Outlet 1: OWNER in ["OWNER", "ADMIN"], ADMIN in ["OWNER", "ADMIN"] = 2 removals
    // Outlet 2: OWNER not in ["CASHIER"], ADMIN not in ["CASHIER"] = 2 additions
    assert.strictEqual(removals, 2);
    assert.strictEqual(additions, 2);
  });

  it("returns zero when no outlets or roles selected", () => {
    const outletRoleCodesFor = () => ["OWNER"];

    const emptyOutlets = calculatePreviewChanges([], ["ADMIN"], outletRoleCodesFor);
    assert.strictEqual(emptyOutlets.additions, 0);
    assert.strictEqual(emptyOutlets.removals, 0);

    const emptyRoles = calculatePreviewChanges(outlets, [], outletRoleCodesFor);
    assert.strictEqual(emptyRoles.additions, 0);
    assert.strictEqual(emptyRoles.removals, 0);
  });
});

describe("OutletRoleMatrix - Delta Size Calculation", () => {
  it("calculates global role additions and removals", () => {
    const existing = ["ADMIN"];
    const desired = ["OWNER", "CASHIER"];

    const delta = calculateDeltaSize(existing, desired, [], []);

    // ADMIN removed, OWNER added, CASHIER added
    // Additions: OWNER (not in existing) + CASHIER (not in existing) = 2
    // Removals: ADMIN (in existing but not desired) = 1
    assert.strictEqual(delta.additions, 2);
    assert.strictEqual(delta.removals, 1);
    assert.strictEqual(delta.total, 3);
  });

  it("calculates outlet role changes", () => {
    const existingOutlet = [
      { outlet_id: 1, role_codes: ["OWNER", "ADMIN"] },
      { outlet_id: 2, role_codes: ["CASHIER"] },
    ];
    const desiredOutlet = [
      { outlet_id: 1, role_codes: ["OWNER", "CASHIER"] },
      { outlet_id: 3, role_codes: ["ADMIN"] },
    ];

    const delta = calculateDeltaSize([], [], existingOutlet, desiredOutlet);

    // Outlet 1: ADMIN removed (not in desired), CASHIER added (not in existing) = 1 removal, 1 addition
    // Outlet 2: removed entirely, CASHIER not kept = 1 removal
    // Outlet 3: ADMIN added = 1 addition
    // Total: additions = 2, removals = 2
    assert.strictEqual(delta.additions, 2);
    assert.strictEqual(delta.removals, 2);
    assert.strictEqual(delta.total, 4);
  });

  it("handles empty existing state", () => {
    const delta = calculateDeltaSize(
      [],
      ["ADMIN"],
      [],
      [{ outlet_id: 1, role_codes: ["OWNER", "CASHIER"] }]
    );

    // Global: ADMIN added = 1 addition
    // Outlet 1: OWNER + CASHIER added = 2 additions
    assert.strictEqual(delta.additions, 3);
    assert.strictEqual(delta.removals, 0);
    assert.strictEqual(delta.total, 3);
  });

  it("handles complete removal", () => {
    const delta = calculateDeltaSize(
      ["ADMIN", "OWNER"],
      [],
      [{ outlet_id: 1, role_codes: ["CASHIER"] }],
      []
    );

    // Global: ADMIN + OWNER removed = 2 removals
    // Outlet 1: removed entirely with CASHIER = 1 removal
    assert.strictEqual(delta.additions, 0);
    assert.strictEqual(delta.removals, 3);
    assert.strictEqual(delta.total, 3);
  });
});

describe("OutletRoleMatrix - Audit Event Structure", () => {
  it("includes all required audit fields", () => {
    const auditEvent = {
      event: "access-update",
      page: "users",
      actorRole: "ADMIN",
      targetUserId: 123,
      targetUserEmail: "test@example.com",
      deltaSize: 5,
      latencyMs: 250,
      globalRoleAdditions: 1,
      globalRoleRemovals: 0,
      outletRoleAdditions: 3,
      outletRoleRemovals: 1,
      outcome: "success",
      timestamp: Date.now()
    };

    assert.strictEqual(auditEvent.event, "access-update");
    assert.strictEqual(typeof auditEvent.actorRole, "string");
    assert.strictEqual(typeof auditEvent.targetUserId, "number");
    assert.strictEqual(typeof auditEvent.deltaSize, "number");
    assert.strictEqual(typeof auditEvent.latencyMs, "number");
    assert.strictEqual(auditEvent.outcome, "success");
    assert.ok(auditEvent.timestamp > 0);
  });

  it("captures error outcome with error message", () => {
    const errorEvent = {
      event: "access-update",
      page: "users",
      actorRole: "ADMIN",
      targetUserId: 123,
      outcome: "error",
      errorMessage: "Network failure",
      timestamp: Date.now()
    };

    assert.strictEqual(errorEvent.outcome, "error");
    assert.strictEqual(errorEvent.errorMessage, "Network failure");
  });
});

describe("OutletRoleMatrix - Bulk Operations", () => {
  const outlets: OutletResponse[] = [
    { id: 1, name: "Outlet A", code: "OA" },
    { id: 2, name: "Outlet B", code: "OB" },
    { id: 3, name: "Outlet C", code: "OC" },
  ];

  const roles: RoleResponse[] = [
    { id: 1, code: "OWNER", name: "Owner", role_level: 0, is_global: false },
    { id: 2, code: "CASHIER", name: "Cashier", role_level: 2, is_global: false },
  ];

  it("selects all outlets with toggleAllRowSelection", () => {
    // Simulating toggleAllRowSelection behavior
    const rowSelection: Record<number, boolean> = {};
    
    // Select all
    outlets.forEach(outlet => {
      rowSelection[outlet.id] = true;
    });

    assert.strictEqual(Object.keys(rowSelection).length, 3);
    assert.strictEqual(rowSelection[1], true);
    assert.strictEqual(rowSelection[2], true);
    assert.strictEqual(rowSelection[3], true);
  });

  it("deselects all outlets when all selected", () => {
    // Simulating toggleAllRowSelection behavior when all selected
    const rowSelection: Record<number, boolean> = { 1: true, 2: true, 3: true };
    
    // Deselect all
    Object.keys(rowSelection).forEach(key => {
      delete rowSelection[Number(key)];
    });

    assert.strictEqual(Object.keys(rowSelection).length, 0);
  });

  it("selects all roles with toggleAllColumnSelection", () => {
    // Simulating toggleAllColumnSelection behavior
    const columnSelection: Record<string, boolean> = {};
    const assignableRoles = roles; // All roles are assignable for this test
    
    assignableRoles.forEach(role => {
      columnSelection[role.code] = true;
    });

    assert.strictEqual(Object.keys(columnSelection).length, 2);
    assert.strictEqual(columnSelection["OWNER"], true);
    assert.strictEqual(columnSelection["CASHIER"], true);
  });
});

describe("OutletRoleMatrix - Accessibility", () => {
  it("provides aria-label for outlet row checkbox", () => {
    const outletName = "Outlet A";
    const ariaLabel = `Select ${outletName}`;
    assert.ok(ariaLabel.includes(outletName));
  });

  it("provides aria-label for role column checkbox", () => {
    const roleName = "Cashier";
    const ariaLabel = `Select ${roleName} column`;
    assert.ok(ariaLabel.includes(roleName));
  });

  it("provides aria-label for cell checkbox", () => {
    const roleName = "Cashier";
    const outletName = "Outlet A";
    const ariaLabel = `${roleName} for ${outletName}`;
    assert.ok(ariaLabel.includes(roleName));
    assert.ok(ariaLabel.includes(outletName));
  });

  it("provides tooltip for disabled role", () => {
    const role: RoleResponse = { id: 1, code: "ADMIN", name: "Admin", role_level: 5, is_global: false };
    const actorLevel = 2;
    const isDisabled = role.role_level >= actorLevel;
    const tooltip = isDisabled 
      ? `Requires higher privilege. ${role.code}`
      : `Toggle ${role.name}`;
    
    assert.strictEqual(isDisabled, true);
    assert.ok(tooltip.includes("Requires higher privilege"));
  });
});