// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useMemo } from "react";
import type { SessionUser } from "../lib/session";
import {
  PERMISSION_BITS,
  PERMISSION_MAP,
  type PermissionBit,
} from "@jurnapod/shared";

/**
 * Hook: usePermission
 * Check user permissions on module.resources
 * 
 * NOTE: This uses role-derived permissions as an approximation from
 * roles.defaults.json. The authoritative permissions come from the
 * module_roles table with per-resource bitmasks.
 */
export function usePermission(user: SessionUser | null) {
  /**
   * Get the effective permission mask for a role on a module
   * Combines global_roles and outlet-level roles, taking highest
   */
  const getPermissionMask = useCallback(
    (module: string): number => {
      if (!user) return 0;

      const globalRoles = user.global_roles ?? [];
      const outletRoles = user.outlet_role_assignments?.flatMap((a) => a.role_codes) ?? [];

      // Take the highest permission from any role (global or outlet)
      let maxMask = 0;

      for (const role of globalRoles) {
        const key = `${role}:${module}`;
        const mask = PERMISSION_MAP.get(key) ?? 0;
        maxMask = Math.max(maxMask, mask);
      }

      for (const role of outletRoles) {
        const key = `${role}:${module}`;
        const mask = PERMISSION_MAP.get(key) ?? 0;
        maxMask = Math.max(maxMask, mask);
      }

      return maxMask;
    },
    [user]
  );

  /**
   * Check if a permission bit is set in a permission mask
   */
  const hasPermissionBit = useCallback((mask: number, bit: number): boolean => {
    return (mask & bit) === bit;
  }, []);

  /**
   * Check if user has a specific permission on a module
   */
  const hasPermission = useCallback(
    (module: string, permission: PermissionBit): boolean => {
      if (!user) return false;
      const mask = getPermissionMask(module);
      const bit = PERMISSION_BITS[permission];
      return hasPermissionBit(mask, bit);
    },
    [user, getPermissionMask, hasPermissionBit]
  );

  const hasAnyPermission = useCallback(
    (module: string, permissions: PermissionBit[]): boolean => {
      return permissions.some((p) => hasPermission(module, p));
    },
    [hasPermission]
  );

  const hasAllPermissions = useCallback(
    (module: string, permissions: PermissionBit[]): boolean => {
      return permissions.every((p) => hasPermission(module, p));
    },
    [hasPermission]
  );

  const canRead = useCallback(
    (module: string) => hasPermission(module, "READ"),
    [hasPermission]
  );

  const canCreate = useCallback(
    (module: string) => hasPermission(module, "CREATE"),
    [hasPermission]
  );

  const canUpdate = useCallback(
    (module: string) => hasPermission(module, "UPDATE"),
    [hasPermission]
  );

  const canDelete = useCallback(
    (module: string) => hasPermission(module, "DELETE"),
    [hasPermission]
  );

  const canAnalyze = useCallback(
    (module: string) => hasPermission(module, "ANALYZE"),
    [hasPermission]
  );

  const canManage = useCallback(
    (module: string) => hasPermission(module, "MANAGE"),
    [hasPermission]
  );

  return {
    /** Get the full permission mask for a module */
    getPermissionMask,
    /** Check a single permission */
    hasPermission,
    /** Check if user has ANY of the specified permissions */
    hasAnyPermission,
    /** Check if user has ALL of the specified permissions */
    hasAllPermissions,
    /** Shorthand for READ */
    canRead,
    /** Shorthand for CREATE */
    canCreate,
    /** Shorthand for UPDATE */
    canUpdate,
    /** Shorthand for DELETE */
    canDelete,
    /** Shorthand for ANALYZE */
    canAnalyze,
    /** Shorthand for MANAGE */
    canManage,
  };
}

/**
 * Helper to create a permission check function for a specific module
 * Useful when checking multiple permissions on the same module
 */
export function useModulePermissionChecker(
  user: SessionUser | null,
  module: string
) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, getPermissionMask } = usePermission(user);

  return useMemo(
    () => ({
      /** Check a single permission on this module */
      can: (permission: PermissionBit) => hasPermission(module, permission),
      /** Check multiple permissions (ANY) on this module */
      canAny: (permissions: PermissionBit[]) => hasAnyPermission(module, permissions),
      /** Check multiple permissions (ALL) on this module */
      canAll: (permissions: PermissionBit[]) => hasAllPermissions(module, permissions),
      /** Get the full permission mask for this module */
      mask: getPermissionMask(module),
      /** Shorthand checks */
      canRead: hasPermission(module, "READ"),
      canCreate: hasPermission(module, "CREATE"),
      canUpdate: hasPermission(module, "UPDATE"),
      canDelete: hasPermission(module, "DELETE"),
      canAnalyze: hasPermission(module, "ANALYZE"),
      canManage: hasPermission(module, "MANAGE"),
    }),
    [module, hasPermission, hasAnyPermission, hasAllPermissions, getPermissionMask]
  );
}
