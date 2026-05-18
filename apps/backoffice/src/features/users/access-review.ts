// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Pure helpers for the access-change review step (Story 66-1 AC3/AC4).
// Computes before/after summaries and permission diffs for role/outlet changes.
// All functions are pure; no DB, API, or side effects.

import type { UserResponse, RoleResponse, OutletResponse } from "@jurnapod/shared";

import {
  type UserPermissionEntry,
  permissionsFromRoleCodes,
  calculatePermissionDiff,
  formatPermissionDiff,
} from "@/lib/auth/permissions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccessChangeReviewData {
  /** Human-readable summary of what changed */
  summary: string[];
  /** Before/after global role codes */
  globalRolesBefore: string[];
  globalRolesAfter: string[];
  /** Outlet role changes per outlet */
  outletChanges: OutletRoleChange[];
  /** Outlets being removed entirely */
  removedOutlets: OutletRoleChange[];
  /** Permission diffs derived from role codes */
  permissionDiffs: string[];
  /** Whether anything changed */
  hasChanges: boolean;
}

export interface OutletRoleChange {
  outletId: number;
  outletName: string;
  rolesBefore: string[];
  rolesAfter: string[];
}

export interface AccessFormState {
  global_role_codes: string[];
  outlet_role_assignments: Array<{ outlet_id: number; role_codes: string[] }>;
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * Compute the access change review data for a before/after comparison.
 *
 * Uses `permissionsFromRoleCodes()` to derive effective permissions from
 * role codes when actual `UserPermissionEntry[]` is not available from
 * the backend. This provides the permission diff preview using canonical
 * module.resource masks.
 *
 * @param targetUser - The user being edited (current state)
 * @param afterAccess - The proposed new access form state
 * @param availableRoles - All available roles (for name resolution)
 * @param outlets - All available outlets (for name resolution)
 */
export function computeAccessChangeReview(
  targetUser: UserResponse,
  afterAccess: AccessFormState,
  availableRoles: RoleResponse[],
  outlets: OutletResponse[],
): AccessChangeReviewData {
  const summary: string[] = [];
  const roleNameMap = buildRoleNameMap(availableRoles);
  const outletNameMap = buildOutletNameMap(outlets);

  // --- Global role changes ---
  const beforeGlobal: string[] = [...targetUser.global_roles].sort();
  const afterGlobal: string[] = [...afterAccess.global_role_codes].sort();

  const globalAdded = afterGlobal.filter((r) => !beforeGlobal.includes(r));
  const globalRemoved = beforeGlobal.filter((r) => !afterGlobal.includes(r));

  for (const r of globalAdded) {
    summary.push(`Add global role: ${roleNameMap.get(r) ?? r}`);
  }
  for (const r of globalRemoved) {
    summary.push(`Remove global role: ${roleNameMap.get(r) ?? r}`);
  }

  // --- Outlet role changes ---
  const beforeOutletMap = new Map<number, Set<string>>();
  for (const a of targetUser.outlet_role_assignments) {
    beforeOutletMap.set(a.outlet_id, new Set(a.role_codes));
  }
  const afterOutletMap = new Map<number, Set<string>>();
  for (const a of afterAccess.outlet_role_assignments) {
    afterOutletMap.set(a.outlet_id, new Set(a.role_codes));
  }

  const allOutletIds = new Set([...beforeOutletMap.keys(), ...afterOutletMap.keys()]);
  const outletChanges: OutletRoleChange[] = [];
  const removedOutlets: OutletRoleChange[] = [];

  for (const outletId of allOutletIds) {
    const before = [...(beforeOutletMap.get(outletId) ?? new Set())].sort();
    const after = [...(afterOutletMap.get(outletId) ?? new Set())].sort();
    const outletName = outletNameMap.get(outletId) ?? `Outlet #${outletId}`;

    const added = after.filter((r) => !before.includes(r));
    const removed = before.filter((r) => !after.includes(r));

    if (added.length === 0 && removed.length === 0) continue;

    for (const r of added) {
      summary.push(`${outletName}: add ${roleNameMap.get(r) ?? r}`);
    }
    for (const r of removed) {
      summary.push(`${outletName}: remove ${roleNameMap.get(r) ?? r}`);
    }

    const change: OutletRoleChange = {
      outletId,
      outletName,
      rolesBefore: before,
      rolesAfter: after,
    };

    if (after.length === 0) {
      removedOutlets.push(change);
    } else {
      outletChanges.push(change);
    }
  }

  // --- Permission diffs ---
  // Collect all role codes for before and after states
  const beforeRoleCodes = collectAllRoleCodes(
    targetUser.global_roles,
    targetUser.outlet_role_assignments,
  );
  const afterRoleCodes = collectAllRoleCodes(
    afterAccess.global_role_codes,
    afterAccess.outlet_role_assignments,
  );

  const beforePerms = permissionsFromRoleCodes(beforeRoleCodes);
  const afterPerms = permissionsFromRoleCodes(afterRoleCodes);

  const diffs = calculatePermissionDiff(beforePerms, afterPerms);
  const permissionDiffs = diffs.map((d) => formatPermissionDiff(d));

  return {
    summary,
    globalRolesBefore: beforeGlobal,
    globalRolesAfter: afterGlobal,
    outletChanges,
    removedOutlets,
    permissionDiffs,
    hasChanges:
      globalAdded.length > 0 ||
      globalRemoved.length > 0 ||
      outletChanges.length > 0 ||
      removedOutlets.length > 0,
  };
}

/**
 * Compute effective permissions preview for a set of role selections.
 * Used for the inline permission preview in the access dialog.
 */
export function previewAccessPermissions(
  globalRoleCodes: string[],
  outletRoleAssignments: Array<{ outlet_id: number; role_codes: string[] }>,
): UserPermissionEntry[] {
  const allRoleCodes = collectAllRoleCodes(globalRoleCodes, outletRoleAssignments);
  return permissionsFromRoleCodes(allRoleCodes);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildRoleNameMap(roles: RoleResponse[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of roles) {
    if (!map.has(r.code)) {
      map.set(r.code, r.name);
    }
  }
  return map;
}

function buildOutletNameMap(outlets: OutletResponse[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const o of outlets) {
    map.set(o.id, o.name);
  }
  return map;
}

function collectAllRoleCodes(
  globalRoles: string[],
  outletAssignments: Array<{ role_codes: string[] }>,
): string[] {
  const codes = new Set(globalRoles);
  for (const a of outletAssignments) {
    for (const c of a.role_codes) {
      codes.add(c);
    }
  }
  return [...codes];
}
