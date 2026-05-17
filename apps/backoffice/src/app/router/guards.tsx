// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Route guard helpers for React Router v6 (Batch C foundation).
//
// These guards are designed as reusable components/hooks that check:
//   - Authentication: User must be logged in
//   - Permissions: User must have the required resource-level permission
//
// Backend deny-by-default is preserved — these are client-side UX aids
// and do NOT replace server-side enforcement.
//
// NOTE (Batch C): Guards are defined here for the future v6 router cutover.
// The existing AppRouter uses inline checks. These guards will be applied
// when the full React Router switch activates.

import type { RoleCode } from "@/lib/session";
import { userCanAccessRoute, type AppRoute } from "@/app/routes";
import { hasMinimumPermission, type UserPermissionEntry, type NavPermissionRequirement } from "@/app/shell/use-nav-filtering";

// ---------------------------------------------------------------------------
// Auth guard types
// ---------------------------------------------------------------------------

export interface AuthGuardCheck {
  /** Whether the user is authenticated */
  authenticated: boolean;
  /** If not authenticated, the reason to redirect to login */
  redirectTo: string;
}

/**
 * Check authentication status.
 * Returns a result that can be consumed by route guards or component logic.
 */
export function checkAuth(accessToken: string | null): AuthGuardCheck {
  const authenticated = accessToken !== null && accessToken.length > 0;
  const currentPath = globalThis.location?.hash?.replace(/^#/, "") ?? "/";

  return {
    authenticated,
    redirectTo: `/login?return=${encodeURIComponent(currentPath)}`,
  };
}

// ---------------------------------------------------------------------------
// Permission guard types
// ---------------------------------------------------------------------------

export interface RoutePermissionCheck {
  /** Whether the user can access the route */
  allowed: boolean;
  /** If denied, the reason to show a 403 or redirect */
  reason: string | null;
}

/**
 * Check route access using the existing role + module model.
 * This mirrors the userCanAccessRoute logic in routes.ts.
 */
export function checkRouteAccess(
  route: AppRoute | null,
  userRoles: readonly RoleCode[],
  userGlobalRoles: readonly RoleCode[],
  enabledModules: Record<string, boolean>,
): RoutePermissionCheck {
  if (!route) {
    return { allowed: false, reason: "Route not found" };
  }

  const canAccess = userCanAccessRoute(userRoles, route, userGlobalRoles);
  if (!canAccess) {
    return { allowed: false, reason: `Role not authorized for ${route.path}` };
  }

  if (route.requiredModule && enabledModules[route.requiredModule] !== true) {
    return {
      allowed: false,
      reason: `Module "${route.requiredModule}" is not enabled`,
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Check resource-level permission using canonical module.resource format.
 * This is the v6 guard pattern using Epic 39 permission bits.
 *
 * @param userPermissions - User's permission entries
 * @param requirement - The module.resource + minimum permission mask required
 */
export function checkResourcePermission(
  userPermissions: readonly UserPermissionEntry[],
  requirement: NavPermissionRequirement,
): RoutePermissionCheck {
  for (const entry of userPermissions) {
    if (entry.module !== requirement.module) continue;
    // Wildcard resource matches everything
    if (entry.resource !== requirement.resource && entry.resource !== "*") continue;
    if (hasMinimumPermission(entry.mask, requirement.permissionMask)) {
      return { allowed: true, reason: null };
    }
  }

  return {
    allowed: false,
    reason: `Missing permission: ${requirement.module}.${requirement.resource} (need mask ${requirement.permissionMask})`,
  };
}

// ---------------------------------------------------------------------------
// Guard helper types for route configuration
// ---------------------------------------------------------------------------

/**
 * Pre-route guard check: runs before a route is entered.
 * Routes define a guard function; the router calls it to decide
 * whether to render the route or redirect.
 */
export type RouteGuardFn = () =>
  | { allowed: true }
  | { allowed: false; redirectTo: string };

/**
 * Create a permission-based guard function for a route.
 * Combines auth + permission check into a single guard.
 */
export function createPermissionGuard(
  accessToken: string | null,
  route: AppRoute | null,
  userRoles: readonly RoleCode[],
  userGlobalRoles: readonly RoleCode[],
  enabledModules: Record<string, boolean>,
): RouteGuardFn {
  return () => {
    const auth = checkAuth(accessToken);
    if (!auth.authenticated) {
      return { allowed: false, redirectTo: auth.redirectTo };
    }

    const perm = checkRouteAccess(route, userRoles, userGlobalRoles, enabledModules);
    if (!perm.allowed) {
      return { allowed: false, redirectTo: "/items" }; // fallback to safe page
    }

    return { allowed: true };
  };
}
