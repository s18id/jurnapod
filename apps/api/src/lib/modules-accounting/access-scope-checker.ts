// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AccessScopeChecker Adapter for Fixed Assets API
 * 
 * Implements the AccessScopeChecker interface from modules-accounting
 * using the API's auth infrastructure.
 */

import type { AccessScopeChecker } from "@jurnapod/modules-accounting";
import { ensureUserHasOutletAccess } from "@/lib/shared/common-utils";

/**
 * ApiAccessScopeChecker
 * 
 * Concrete implementation of AccessScopeChecker for fixed assets.
 * Uses the common utils to check outlet access permissions.
 */
export class ApiAccessScopeChecker implements AccessScopeChecker {
  /**
   * Check if user has access to a specific outlet.
   */
  async userHasOutletAccess(
    userId: number,
    companyId: number,
    outletId: number
  ): Promise<boolean> {
    try {
      await ensureUserHasOutletAccess(userId, companyId, outletId);
      return true;
    } catch {
      return false;
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
