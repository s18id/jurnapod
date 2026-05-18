// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Canonical permission helpers for backoffice admin UX.
// All values MUST match the Epic 39 ACL model and @jurnapod/shared constants.
// Backend deny-by-default remains authoritative — these are client-side UX aids.

import {
  PERMISSION_BITS as SHARED_PERMISSION_BITS,
  PERMISSION_MASK as SHARED_PERMISSION_MASK,
  ROLE_PERMISSION_MATRIX,
} from "@jurnapod/shared";

// ---------------------------------------------------------------------------
// Canonical permission bits (Epic 39)
// ---------------------------------------------------------------------------

export const PERMISSION_BITS = {
  READ: SHARED_PERMISSION_BITS.READ,
  CREATE: SHARED_PERMISSION_BITS.CREATE,
  UPDATE: SHARED_PERMISSION_BITS.UPDATE,
  DELETE: SHARED_PERMISSION_BITS.DELETE,
  ANALYZE: SHARED_PERMISSION_BITS.ANALYZE,
  MANAGE: SHARED_PERMISSION_BITS.MANAGE,
} as const;

export type PermissionBit = keyof typeof PERMISSION_BITS;

/** Reverse lookup: bit value → permission name */
export const BIT_TO_NAME: Readonly<Record<number, PermissionBit>> = {
  1: "READ",
  2: "CREATE",
  4: "UPDATE",
  8: "DELETE",
  16: "ANALYZE",
  32: "MANAGE",
};

// ---------------------------------------------------------------------------
// Canonical permission masks (Epic 39)
// ---------------------------------------------------------------------------

export const PERMISSION_MASKS = {
  READ: SHARED_PERMISSION_MASK.READ,
  WRITE: SHARED_PERMISSION_MASK.WRITE,
  CRUD: SHARED_PERMISSION_MASK.CRUD,
  CRUDA: SHARED_PERMISSION_MASK.CRUDA,
  CRUDAM: SHARED_PERMISSION_MASK.CRUDAM,
} as const;

export type PermissionMaskLabel = keyof typeof PERMISSION_MASKS;

/** Reverse lookup: mask value → label (only exact canonical masks) */
export const MASK_TO_LABEL: Readonly<Record<number, PermissionMaskLabel>> = {
  1: "READ",
  6: "WRITE",
  15: "CRUD",
  31: "CRUDA",
  63: "CRUDAM",
};

// ---------------------------------------------------------------------------
// Canonical modules and resources (Epic 39)
// ---------------------------------------------------------------------------

export const CANONICAL_MODULES = [
  "platform",
  "pos",
  "sales",
  "inventory",
  "accounting",
  "treasury",
  "purchasing",
  "reservations",
] as const;

export type CanonicalModule = (typeof CANONICAL_MODULES)[number];

/**
 * Canonical module.resource combinations.
 * Modules with no resources listed are omitted; use `"*"` for module-level access.
 */
export const CANONICAL_MODULE_RESOURCES: Readonly<Record<CanonicalModule, readonly string[]>> = {
  platform: ["users", "roles", "companies", "outlets", "settings", "operations"],
  pos: ["transactions", "config"],
  sales: ["invoices", "orders", "payments"],
  inventory: ["items", "stock", "costing"],
  accounting: ["journals", "accounts", "fiscal_years", "reports"],
  treasury: ["transactions"],
  purchasing: ["suppliers", "exchange_rates", "orders", "receipts", "invoices", "payments", "credits", "reports"],
  reservations: ["bookings", "tables"],
};

// ---------------------------------------------------------------------------
// System role codes
// ---------------------------------------------------------------------------

export const SYSTEM_ROLE_CODES = [
  "SUPER_ADMIN",
  "OWNER",
  "COMPANY_ADMIN",
  "ADMIN",
  "ACCOUNTANT",
  "CASHIER",
] as const;

export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number];

/** System roles that MUST render read-only in the permission matrix (backend immutable). */
export function isSystemRole(roleCode: string): boolean {
  return (SYSTEM_ROLE_CODES as readonly string[]).includes(roleCode);
}

// ---------------------------------------------------------------------------
// Bit ↔ Mask conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a permission name to its bit value.
 */
export function nameToBit(name: PermissionBit): number {
  return PERMISSION_BITS[name];
}

/**
 * Decompose a mask into its constituent bits.
 * @returns Sorted bit values (ascending).
 */
export function maskToBits(mask: number): number[] {
  const bits: number[] = [];
  for (const [, bit] of Object.entries(PERMISSION_BITS)) {
    if ((mask & bit) === bit) {
      bits.push(bit);
    }
  }
  return bits.sort((a, b) => a - b);
}

/**
 * Decompose a mask into its canonical permission bit names.
 * @returns Sorted bit names.
 */
export function maskToPermissionNames(mask: number): PermissionBit[] {
  const names: PermissionBit[] = [];
  for (const [name, bit] of Object.entries(PERMISSION_BITS)) {
    if ((mask & bit) === bit) {
      names.push(name as PermissionBit);
    }
  }
  // Return in canonical bit-value order
  return names.sort((a, b) => PERMISSION_BITS[a] - PERMISSION_BITS[b]);
}

/**
 * Convert an array of permission names to a composite mask.
 */
export function bitNamesToMask(names: readonly PermissionBit[]): number {
  let mask = 0;
  for (const name of names) {
    mask |= PERMISSION_BITS[name];
  }
  return mask;
}

/**
 * Format a mask as a human-readable label.
 * Returns the canonical label (READ/WRITE/CRUD/CRUDA/CRUDAM) if an exact match,
 * otherwise returns a comma-separated list of bit names.
 */
export function formatMaskLabel(mask: number): string {
  const label = MASK_TO_LABEL[mask];
  if (label) return label;

  const names = maskToPermissionNames(mask);
  if (names.length === 0) return "None";
  return names.join("+");
}

/**
 * Format a bit name as a human-readable label.
 */
export function formatBitLabel(bit: number): string {
  const name = BIT_TO_NAME[bit];
  if (name) return name;
  return `0x${bit.toString(16)}`;
}

// ---------------------------------------------------------------------------
// User permission helpers
// ---------------------------------------------------------------------------

export interface UserPermissionEntry {
  module: string;
  resource: string;
  mask: number;
}

/**
 * Check if a user's permission mask satisfies a minimum required mask.
 * (mask & requiredMask) === requiredMask
 */
export function hasMinimumPermission(userMask: number, requiredMask: number): boolean {
  return (userMask & requiredMask) === requiredMask;
}

/**
 * Check if a user has a specific permission on a module.resource combination.
 *
 * @param userPermissions - User's effective permission entries.
 * @param module - Canonical module code.
 * @param resource - Resource within the module.
 * @param requiredMask - Minimum permission mask required.
 */
export function userHasPermission(
  userPermissions: readonly UserPermissionEntry[],
  module: string,
  resource: string,
  requiredMask: number,
): boolean {
  for (const entry of userPermissions) {
    if (entry.module !== module) continue;
    if (entry.resource !== resource && entry.resource !== "*") continue;
    if (hasMinimumPermission(entry.mask, requiredMask)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Permission diff helpers
// ---------------------------------------------------------------------------

export interface PermissionDiff {
  module: string;
  resource: string;
  fromMask: number;
  toMask: number;
}

export interface GroupedPermissionDiff {
  module: string;
  diffs: PermissionDiff[];
}

/**
 * Format a permission diff for human-readable display.
 *
 * @example
 * formatPermissionDiff({ module: "inventory", resource: "items", fromMask: 15, toMask: 1 })
 * // => "inventory.items: CRUD(15) → READ(1)"
 */
export function formatPermissionDiff(diff: PermissionDiff): string {
  const fromLabel = formatMaskLabel(diff.fromMask);
  const toLabel = formatMaskLabel(diff.toMask);
  return `${diff.module}.${diff.resource}: ${fromLabel}(${diff.fromMask}) → ${toLabel}(${diff.toMask})`;
}

/**
 * Calculate permission diffs between two sets of permission entries.
 * Returns entries that differ (added, removed, or changed) between `before` and `after`.
 */
export function calculatePermissionDiff(
  before: readonly UserPermissionEntry[],
  after: readonly UserPermissionEntry[],
): PermissionDiff[] {
  const diffs: PermissionDiff[] = [];
  const beforeMap = new Map<string, number>();
  const afterMap = new Map<string, number>();

  for (const entry of before) {
    const key = `${entry.module}.${entry.resource}`;
    beforeMap.set(key, (beforeMap.get(key) ?? 0) | entry.mask);
  }
  for (const entry of after) {
    const key = `${entry.module}.${entry.resource}`;
    afterMap.set(key, (afterMap.get(key) ?? 0) | entry.mask);
  }

  const allKeys = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  for (const key of allKeys) {
    const fromMask = beforeMap.get(key) ?? 0;
    const toMask = afterMap.get(key) ?? 0;
    if (fromMask !== toMask) {
      const [module, resource] = key.split(".");
      diffs.push({ module, resource, fromMask, toMask });
    }
  }

  return diffs.sort((a, b) => {
    const modCmp = a.module.localeCompare(b.module);
    if (modCmp !== 0) return modCmp;
    return a.resource.localeCompare(b.resource);
  });
}

/**
 * Group sorted permission diffs by module for change-review rendering.
 */
export function groupPermissionDiffs(diffs: readonly PermissionDiff[]): GroupedPermissionDiff[] {
  const groups = new Map<string, PermissionDiff[]>();

  for (const diff of diffs) {
    const group = groups.get(diff.module) ?? [];
    group.push(diff);
    groups.set(diff.module, group);
  }

  return [...groups.entries()]
    .map(([module, moduleDiffs]) => ({
      module,
      diffs: [...moduleDiffs].sort((a, b) => a.resource.localeCompare(b.resource)),
    }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

// ---------------------------------------------------------------------------
// Action gating helpers
// ---------------------------------------------------------------------------

export type ActionPermission = "READ" | "CREATE" | "UPDATE" | "DELETE" | "ANALYZE" | "MANAGE";

/**
 * Determine whether a set of actions are visible/disabled for a given module.resource
 * and user permissions.
 *
 * @returns A record mapping each action to whether it's allowed.
 */
export function actionGates(
  userPermissions: readonly UserPermissionEntry[],
  module: string,
  resource: string,
  actions: readonly ActionPermission[],
): Record<ActionPermission, boolean> {
  // Effective permissions can come from multiple role/outlet grants. Combine
  // matching exact and wildcard entries so non-monotonic masks do not lose bits.
  let effectiveMask = 0;
  for (const entry of userPermissions) {
    if (entry.module !== module) continue;
    if (entry.resource !== resource && entry.resource !== "*") continue;
    effectiveMask |= entry.mask;
  }

  const result = {} as Record<ActionPermission, boolean>;
  for (const action of actions) {
    const bit = PERMISSION_BITS[action];
    result[action] = (effectiveMask & bit) === bit;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Permission requirement metadata for route guards
// ---------------------------------------------------------------------------

export interface NavPermissionRequirement {
  /** Canonical module code */
  module: string;
  /** Resource within the module, or "*" for module-level */
  resource: string;
  /** Minimum permission bit mask required */
  permissionMask: number;
}

/**
 * Create a permission requirement for a READ action on a module.resource.
 * This is the most common permission for route visibility.
 */
export function requireReadPermission(module: string, resource: string): NavPermissionRequirement {
  return {
    module,
    resource,
    permissionMask: PERMISSION_BITS.READ,
  };
}

// ---------------------------------------------------------------------------
// Role-code → effective-permission derivation (Epic 66 — Story 66-4)
// ---------------------------------------------------------------------------

/**
 * Derive effective `UserPermissionEntry[]` from a set of role codes using the
 * canonical `ROLE_PERMISSION_MATRIX` from `@jurnapod/shared`.
 *
 * This is a **safe client-side fallback** for when the backend does not yet
 * provide an effective-permissions endpoint. It uses the same shared matrix
 * that the backend seed/authorization layer uses, so the client-side UX
 * filtering stays aligned with the canonical defaults.
 *
 * Rules:
 * - Parses `module.resource` keys from `ROLE_PERMISSION_MATRIX`.
 * - Combines duplicate grants from multiple roles with bitwise OR (a role that
 *   grants MANAGE on platform.users and another that grants READ will
 *   produce the combined mask).
 * - Sorts results deterministically (module ASC, then resource ASC).
 * - Silently ignores malformed keys (missing dot, empty module/resource).
 *
 * Backend deny-by-default remains authoritative — this is a UX convenience.
 */
export function permissionsFromRoleCodes(
  roleCodes: readonly string[],
): UserPermissionEntry[] {
  // Map to combine duplicate grants with bitwise OR: key = "module:resource"
  const grantMap = new Map<string, number>();

  for (const entry of ROLE_PERMISSION_MATRIX) {
    if (!roleCodes.includes(entry.roleCode)) continue;

    const dotIndex = entry.moduleResource.indexOf(".");
    if (dotIndex === -1) continue; // malformed key without dot

    const module = entry.moduleResource.slice(0, dotIndex);
    const resource = entry.moduleResource.slice(dotIndex + 1);

    if (!module || !resource) continue; // malformed: empty module or resource

    const key = `${module}:${resource}`;
    // Only record non-zero grants; a mask of 0 is "no permissions"
    if (entry.permissionMask !== 0) {
      grantMap.set(key, (grantMap.get(key) ?? 0) | entry.permissionMask);
    }
  }

  // Convert to sorted array
  const result: UserPermissionEntry[] = [];
  for (const [key, mask] of grantMap) {
    const colonIndex = key.indexOf(":");
    const module = key.slice(0, colonIndex);
    const resource = key.slice(colonIndex + 1);
    result.push({ module, resource, mask });
  }

  return result.sort((a, b) => {
    const modCmp = a.module.localeCompare(b.module);
    if (modCmp !== 0) return modCmp;
    return a.resource.localeCompare(b.resource);
  });
}

export interface EffectivePermissionSource {
  roles: readonly string[];
  global_roles: readonly string[];
  permissions?: readonly UserPermissionEntry[];
}

/**
 * Resolve the client-side effective permissions for a session-like user object.
 *
 * If the backend supplies `permissions`, that list is authoritative for UI
 * filtering even when it is empty. The role matrix fallback is used only when
 * the backend has not supplied the field yet.
 */
export function resolveEffectivePermissions(
  user: EffectivePermissionSource | null | undefined,
): readonly UserPermissionEntry[] | undefined {
  if (!user) return undefined;
  if (user.permissions !== undefined) return user.permissions;

  const allRoleCodes = [...user.roles, ...user.global_roles];
  return permissionsFromRoleCodes(allRoleCodes);
}

/**
 * Check whether effective permissions satisfy a route's permission requirement.
 * Pure function — testable without React.
 *
 * @param routePermission - The route's `permission` field (NavPermissionRequirement or undefined)
 * @param effectivePermissions - User's effective permission entries (or undefined if not loaded)
 * @returns `true` if the route has no permission requirement, or if the user's
 *          effective permissions satisfy the requirement. Returns `false` when
 *          the route requires permission but effective permissions are unloaded
 *          or insufficient.
 */
export function userSatisfiesRoutePermission(
  routePermission: NavPermissionRequirement | undefined,
  effectivePermissions: readonly UserPermissionEntry[] | undefined,
): boolean {
  if (!routePermission) return true;
  if (!effectivePermissions || effectivePermissions.length === 0) return false;

  for (const entry of effectivePermissions) {
    if (entry.module !== routePermission.module) continue;
    if (entry.resource !== routePermission.resource && entry.resource !== "*") continue;
    if ((entry.mask & routePermission.permissionMask) === routePermission.permissionMask) return true;
  }
  return false;
}
