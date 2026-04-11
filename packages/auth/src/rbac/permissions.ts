/**
 * RBAC permission bitmask utilities
 */
import { MODULE_PERMISSION_BITS, type ModulePermission } from '../types.js';

export { MODULE_PERMISSION_BITS };
export type { ModulePermission };

/**
 * Build a permission mask from boolean flags.
 * @param params - Object with boolean permission flags
 * @param params.canCreate - Whether CREATE bit is set
 * @param params.canRead - Whether READ bit is set
 * @param params.canUpdate - Whether UPDATE bit is set
 * @param params.canDelete - Whether DELETE bit is set
 * @param params.canAnalyze - Whether ANALYZE bit is set (was canReport)
 * @param params.canManage - Whether MANAGE bit is set
 * @returns Numeric permission mask with bits set for each true permission
 */
export function buildPermissionMask(params: {
  canCreate?: boolean;
  canRead?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  canAnalyze?: boolean;
  canManage?: boolean;
}): number {
  let mask = 0;
  if (params.canCreate) mask |= MODULE_PERMISSION_BITS.create;
  if (params.canRead) mask |= MODULE_PERMISSION_BITS.read;
  if (params.canUpdate) mask |= MODULE_PERMISSION_BITS.update;
  if (params.canDelete) mask |= MODULE_PERMISSION_BITS.delete;
  if (params.canAnalyze) mask |= MODULE_PERMISSION_BITS.analyze;
  if (params.canManage) mask |= MODULE_PERMISSION_BITS.manage;
  return mask;
}

/**
 * Check if a permission bit is set in a permission mask.
 * @param mask - The permission mask to check
 * @param permission - The permission to check for
 * @returns true if the permission bit is set
 */
export function hasPermissionBit(mask: number, permission: ModulePermission): boolean {
  const bit = MODULE_PERMISSION_BITS[permission];
  return (mask & bit) !== 0;
}
