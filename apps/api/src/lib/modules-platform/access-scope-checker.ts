// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AccessScopeChecker Adapter for Platform Module
 * 
 * Implements the AccessScopeChecker interface from modules-platform
 * using the API's auth infrastructure.
 */

import type { AccessScopeChecker } from "@jurnapod/modules-platform/src/users/interfaces/access-scope-checker.js";
import { authClient } from "@/lib/auth-client.js";

/**
 * Map platform permission strings to auth module parameters.
 * 
 * Platform module uses permissions like:
 * - platform.customers.READ
 * - platform.customers.CREATE
 * - platform.customers.UPDATE
 * - platform.customers.DELETE
 */
function mapPlatformPermissionToAuthParams(
  permission: string
): { module: string; resource: string; permission: string } | null {
  // Parse permission string like "platform.customers.READ"
  const parts = permission.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [, resource, action] = parts;
  const module = "platform";

  // Map READ -> read, CREATE -> create, etc.
  const permissionMap: Record<string, string> = {
    READ: "read",
    CREATE: "create",
    UPDATE: "update",
    DELETE: "delete",
    ANALYZE: "analyze",
    MANAGE: "manage",
  };

  const mappedPermission = permissionMap[action];
  if (!mappedPermission) {
    return null;
  }

  return { module, resource, permission: mappedPermission };
}

/**
 * PlatformAccessScopeChecker
 * 
 * Concrete implementation of AccessScopeChecker for the platform module.
 * Uses the auth client to check permissions.
 */
export class PlatformAccessScopeChecker implements AccessScopeChecker {
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

    // Map platform permission to auth module/permission
    const mapped = mapPlatformPermissionToAuthParams(permission);
    if (!mapped) {
      throw new Error(`Unsupported platform permission mapping: ${permission}`);
    }

    // Check using the auth client's RBAC
    const hasPermission = await authClient.rbac.canManageCompanyDefaults(
      actorUserId,
      companyId,
      mapped.module,
      mapped.permission,
      mapped.resource
    );

    if (!hasPermission) {
      throw new Error(
        `User ${actorUserId} does not have ${permission} access for company ${companyId}`
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

    // Map platform permission to auth module/permission
    const mapped = mapPlatformPermissionToAuthParams(permission);
    if (!mapped) {
      throw new Error(`Unsupported platform permission mapping: ${permission}`);
    }

    // First check outlet-level access
    const hasOutletAccess = await authClient.rbac.hasOutletAccess(
      actorUserId,
      companyId,
      outletId
    );

    if (!hasOutletAccess) {
      throw new Error(`User ${actorUserId} does not have access to outlet ${outletId}`);
    }

    // Then check module permission with resource
    const checkResult = await authClient.rbac.checkAccess({
      userId: actorUserId,
      companyId,
      outletId,
      module: mapped.module,
      permission: mapped.permission,
      resource: mapped.resource,
    });

    if (!checkResult || !checkResult.hasPermission) {
      throw new Error(
        `User ${actorUserId} does not have ${permission} access for outlet ${outletId}`
      );
    }
  }
}

/**
 * Create a singleton instance of PlatformAccessScopeChecker.
 */
let instance: PlatformAccessScopeChecker | null = null;

export function getPlatformAccessScopeChecker(): AccessScopeChecker {
  if (!instance) {
    instance = new PlatformAccessScopeChecker();
  }
  return instance;
}
