// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AccessScopeChecker Adapter for API
 * 
 * Implements the AccessScopeChecker interface from modules-sales
 * using the API's auth infrastructure.
 * 
 * This adapter is the "glue" between the domain package (modules-sales)
 * and the API's auth system (@/lib/auth).
 * 
 * The modules-sales package NEVER imports this file - it only imports
 * the AccessScopeChecker interface.
 */

import type { AccessScopeChecker } from "@jurnapod/modules-sales";
import { SalesAuthorizationError } from "@jurnapod/modules-sales";
import { userHasOutletAccess, type ModulePermission } from "@/lib/auth.js";
import { authClient } from "@/lib/auth-client.js";

/**
 * Map sales permissions to auth module permissions.
 * 
 * Sales module uses its own permission strings (e.g., "sales:create")
 * which are mapped to the auth module's permission bitmask.
 */
function mapSalesPermissionToModulePermission(
  permission: string
): { module: string; permission: ModulePermission } | null {
  const permissionMap: Record<string, { module: string; permission: ModulePermission }> = {
    // Sales order permissions
    "sales:create": { module: "sales", permission: "create" },
    "sales:update": { module: "sales", permission: "update" },
    "sales:read": { module: "sales", permission: "read" },
    "sales:cancel": { module: "sales", permission: "delete" },
    // Invoice permissions
    "sales:create_invoice": { module: "sales", permission: "create" },
    "sales:update_invoice": { module: "sales", permission: "update" },
    "sales:read_invoice": { module: "sales", permission: "read" },
    // Payment permissions
    "payments:create": { module: "payments", permission: "create" },
    "payments:read": { module: "payments", permission: "read" },
    "payments:update": { module: "payments", permission: "update" },
    "payments:post": { module: "payments", permission: "update" },
    // Credit note permissions
    "credit_notes:create": { module: "credit_notes", permission: "create" },
    "credit_notes:read": { module: "credit_notes", permission: "read" },
  };

  return permissionMap[permission] ?? null;
}

/**
 * ApiAccessScopeChecker
 * 
 * Concrete implementation of AccessScopeChecker for the API.
 * Uses the auth client to check permissions.
 */
export class ApiAccessScopeChecker implements AccessScopeChecker {
  /**
   * Assert company-level access.
   * Checks if user has the specified permission for the company.
   */
  async assertCompanyAccess(input: {
    actorUserId: number;
    companyId: number;
    permission: string;
  }): Promise<void> {
    const { actorUserId, companyId, permission } = input;

    // Map sales permission to auth module/permission
    const mapped = mapSalesPermissionToModulePermission(permission);
    if (!mapped) {
      throw new SalesAuthorizationError(
        `Unknown permission: ${permission}`,
        "FORBIDDEN"
      );
    }

    // Check using the auth client's RBAC
    const hasPermission = await authClient.rbac.canManageCompanyDefaults(
      actorUserId,
      companyId,
      mapped.module,
      mapped.permission
    );

    if (!hasPermission) {
      throw new SalesAuthorizationError(
        `User ${actorUserId} does not have ${permission} access for company ${companyId}`,
        "FORBIDDEN"
      );
    }
  }

  /**
   * Assert outlet-level access.
   * Checks if user has the specified permission for the outlet.
   */
  async assertOutletAccess(input: {
    actorUserId: number;
    companyId: number;
    outletId: number;
    permission: string;
  }): Promise<void> {
    const { actorUserId, companyId, outletId, permission } = input;

    // Map sales permission to auth module/permission
    const mapped = mapSalesPermissionToModulePermission(permission);
    if (!mapped) {
      throw new SalesAuthorizationError(
        `Unknown permission: ${permission}`,
        "FORBIDDEN"
      );
    }

    // First check outlet-level access
    const hasOutletAccess = await userHasOutletAccess(
      actorUserId,
      companyId,
      outletId
    );

    if (!hasOutletAccess) {
      throw new SalesAuthorizationError(
        `User ${actorUserId} does not have access to outlet ${outletId}`,
        "FORBIDDEN"
      );
    }

    // Then check module permission
    const checkResult = await authClient.rbac.checkAccess({
      userId: actorUserId,
      companyId,
      outletId,
      module: mapped.module,
      permission: mapped.permission,
    });

    if (!checkResult || !checkResult.hasPermission) {
      throw new SalesAuthorizationError(
        `User ${actorUserId} does not have ${permission} access for outlet ${outletId}`,
        "FORBIDDEN"
      );
    }
  }
}

/**
 * Create a singleton instance of ApiAccessScopeChecker.
 */
let instance: ApiAccessScopeChecker | null = null;

export function getAccessScopeChecker(): AccessScopeChecker {
  if (!instance) {
    instance = new ApiAccessScopeChecker();
  }
  return instance;
}
