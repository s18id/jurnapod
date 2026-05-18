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

// Canonical permission helpers
import {
  userHasPermission,
} from "@/lib/auth/permissions";
import type {
  NavPermissionRequirement,
  UserPermissionEntry,
} from "@/lib/auth/permissions";

// Re-export canonical permission helpers from the single source of truth.
// These are consumed by guards.tsx, shell-model tests, and other consumers.
export {
  PERMISSION_BITS,
  hasMinimumPermission,
} from "@/lib/auth/permissions";

export type {
  NavPermissionRequirement,
  UserPermissionEntry,
} from "@/lib/auth/permissions";

// ---------------------------------------------------------------------------
// Navigation item with optional permission requirement (backward-compatible)
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
  return userHasPermission(
    userPermissions,
    requirement.module,
    requirement.resource,
    requirement.permissionMask,
  );
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

  // Step 3: Permission-based filtering uses formal AppRoute.permission metadata.
  // Routes without permission metadata continue to rely on role + module visibility.
  const loadedPermissions = userPermissions ?? [];
  const permissionFiltered = moduleFiltered.filter((route) => {
    if (!route.permission) {
      return true;
    }

    return userSatisfiesPermission(loadedPermissions, route.permission);
  });

  return {
    visibleRoutes: permissionFiltered,
    hiddenCount: routes.length - permissionFiltered.length,
    ready: Object.keys(enabledModules).length > 0,
  };
}
