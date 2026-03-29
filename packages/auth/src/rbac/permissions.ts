/**
 * RBAC permission bitmask utilities
 */
import { MODULE_PERMISSION_BITS, type ModulePermission } from '../types.js';

export { MODULE_PERMISSION_BITS };
export type { ModulePermission };

/**
 * Build a permission mask from boolean flags.
 * @param params - Object with boolean permission flags
 * @returns Numeric permission mask with bits set for each true permission
 */
export function buildPermissionMask(params: {
  canCreate?: boolean;
  canRead?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  canReport?: boolean;
}): number {
  let mask = 0;
  if (params.canCreate) mask |= MODULE_PERMISSION_BITS.create;
  if (params.canRead) mask |= MODULE_PERMISSION_BITS.read;
  if (params.canUpdate) mask |= MODULE_PERMISSION_BITS.update;
  if (params.canDelete) mask |= MODULE_PERMISSION_BITS.delete;
  if (params.canReport) mask |= MODULE_PERMISSION_BITS.report;
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
