// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Navigation filtering hook — filters routes by user permissions and module
// enablement using canonical module.resource-style requirements.
//
// This is used by the side navigation to determine which routes/nav items
// are visible based on the current user's permissions.
//
// Backend authoritative enforcement is preserved: the API always enforces
// deny-by-default. This client-side filtering is a UX convenience to hide
// navigation items the user cannot access.

import type { AppRoute } from "@/app/routes";
import type { RoleCode } from "@/lib/session";

import { userCanAccessRoute, filterRoutesByModules } from "@/app/routes";

// ---------------------------------------------------------------------------
// Permission requirement shape (mirrors Epic 39 canonical format)
// ---------------------------------------------------------------------------

export interface NavPermissionRequirement {
  /** Canonical module code */
  module: string;
  /** Resource within the module, or "*" for module-level */
  resource: string;
  /** Minimum permission bit mask required */
  permissionMask: number;
}

// ---------------------------------------------------------------------------
// Navigation item with optional permission requirement
// ---------------------------------------------------------------------------

export interface NavItem {
  /** Route path */
  path: string;
  /** Display label */
  label: string;
  /** Allowed roles (legacy check, kept for compatibility) */
  allowedRoles: readonly RoleCode[];
  /** Module required to be enabled */
  requiredModule?: string;
  /** Permission requirement (optional — if set, must be satisfied) */
  permission?: NavPermissionRequirement;
}

// ---------------------------------------------------------------------------
// Permission bit helpers (Epic 39 canonical values)
// ---------------------------------------------------------------------------

export const PERMISSION_BITS = {
  READ: 1,
  CREATE: 2,
  UPDATE: 4,
  DELETE: 8,
  ANALYZE: 16,
  MANAGE: 32,
} as const;

/**
 * Check if a user's permission mask satisfies a minimum requirement.
 * Permission bits are additive: a mask of 15 (CRUD) satisfies READ (1), CREATE (2), etc.
 */
export function hasMinimumPermission(
  userMask: number,
  requiredMask: number,
): boolean {
  return (userMask & requiredMask) === requiredMask;
}

// ---------------------------------------------------------------------------
// User permission map (simplified for client-side)
// ---------------------------------------------------------------------------

export interface UserPermissionEntry {
  module: string;
  resource: string;
  mask: number;
}

/**
 * Check if a user's permissions satisfy a navigation item's permission requirement.
 *
 * @param userPermissions - The user's permission entries (from API or context)
 * @param requirement - The permission requirement for the nav item
 *
 * Returns true if the user has at least the required permission mask for the
 * given module.resource combination.
 */
export function userSatisfiesPermission(
  userPermissions: readonly UserPermissionEntry[],
  requirement: NavPermissionRequirement,
): boolean {
  for (const entry of userPermissions) {
    if (entry.module !== requirement.module) continue;
    if (entry.resource !== requirement.resource && entry.resource !== "*") continue;
    if (hasMinimumPermission(entry.mask, requirement.permissionMask)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Navigation filtering
// ---------------------------------------------------------------------------

export interface NavFilterResult {
  /** Routes/nav items visible to the current user */
  visibleRoutes: AppRoute[];
  /** Count of routes hidden due to permissions/modules */
  hiddenCount: number;
  /** Whether filtering is complete (modules have loaded) */
  ready: boolean;
}

/**
 * Filter navigation routes by user roles, module enablement, and
 * optional permission requirements.
 *
 * Client-side convenience only — the backend MUST still enforce at the API.
 */
export function filterNavigation(
  routes: readonly AppRoute[],
  roles: readonly RoleCode[],
  globalRoles: readonly RoleCode[],
  enabledModules: Record<string, boolean>,
  userPermissions?: readonly UserPermissionEntry[],
): NavFilterResult {
  // Step 1: Role-based filtering (existing)
  const roleFiltered = routes.filter((route) =>
    userCanAccessRoute(roles, route, globalRoles),
  );

  // Step 2: Module-based filtering (existing)
  const moduleFiltered = filterRoutesByModules(roleFiltered, enabledModules);

  // Step 3: Permission-based filtering applies when route metadata provides
  // module.resource requirements. Existing legacy routes without permission
  // metadata continue to rely on role + module visibility until migrated.
  let permissionFiltered = moduleFiltered;
  if (userPermissions && userPermissions.length > 0) {
    permissionFiltered = moduleFiltered.filter((route) => {
      const permission = (route as AppRoute & { permission?: NavPermissionRequirement }).permission;
      if (!permission) {
        return true;
      }

      return userSatisfiesPermission(userPermissions, permission);
    });
  }

  return {
    visibleRoutes: permissionFiltered,
    hiddenCount: routes.length - permissionFiltered.length,
    ready: Object.keys(enabledModules).length > 0,
  };
}
