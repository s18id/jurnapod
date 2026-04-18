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
 * Sales module uses its own permission strings (e.g., "sales:create_invoice")
 * which are mapped to the auth module's permission bitmask with resource.
 * 
 * Canonical resources from roles.defaults.json:
 * - sales.invoices
 * - sales.orders
 * - sales.payments
 * 
 * Note: credit_notes have no dedicated canonical resource in the current ACL model.
 * Best-compatible mapping: credit_note operations map to sales.invoices because
 * credit notes are invoice reversals and should follow invoice access boundaries.
 */
function mapSalesPermissionToModulePermission(
  permission: string
): { module: string; resource: string; permission: ModulePermission } | null {
  const permissionMap: Record<string, { module: string; resource: string; permission: ModulePermission }> = {
    // Sales order permissions - map to sales.orders
    "sales:create": { module: "sales", resource: "orders", permission: "create" },
    "sales:update": { module: "sales", resource: "orders", permission: "update" },
    "sales:read": { module: "sales", resource: "orders", permission: "read" },
    "sales:cancel": { module: "sales", resource: "orders", permission: "delete" },
    // Invoice permissions - map to sales.invoices
    "sales:create_invoice": { module: "sales", resource: "invoices", permission: "create" },
    "sales:update_invoice": { module: "sales", resource: "invoices", permission: "update" },
    "sales:read_invoice": { module: "sales", resource: "invoices", permission: "read" },
    // Payment permissions - map to sales.payments (payments module doesn't exist in ACL)
    "payments:create": { module: "sales", resource: "payments", permission: "create" },
    "payments:read": { module: "sales", resource: "payments", permission: "read" },
    "payments:update": { module: "sales", resource: "payments", permission: "update" },
    "payments:post": { module: "sales", resource: "payments", permission: "update" },
    // Credit note permissions - map to sales.invoices (best-compatible; no credit_notes resource exists)
    "credit_notes:create": { module: "sales", resource: "invoices", permission: "create" },
    "credit_notes:read": { module: "sales", resource: "invoices", permission: "read" },
    "credit_notes:update": { module: "sales", resource: "invoices", permission: "update" },
    "credit_notes:post": { module: "sales", resource: "invoices", permission: "update" },
    "credit_notes:void": { module: "sales", resource: "invoices", permission: "delete" },
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
      throw new Error(`Unsupported sales permission mapping: ${permission}`);
    }

    // Check using the auth client's RBAC with resource for strict ACL
    const hasPermission = await authClient.rbac.canManageCompanyDefaults(
      actorUserId,
      companyId,
      mapped.module,
      mapped.permission,
      mapped.resource
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
      throw new Error(`Unsupported sales permission mapping: ${permission}`);
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

    // Then check module permission with resource for strict ACL
    const checkResult = await authClient.rbac.checkAccess({
      userId: actorUserId,
      companyId,
      outletId,
      module: mapped.module,
      permission: mapped.permission,
      resource: mapped.resource,
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
