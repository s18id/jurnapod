/**
 * RBAC roles and role-checking utilities
 */
import { ROLE_CODES, type RoleCode } from '../types.js';

export { ROLE_CODES };
export type { RoleCode };

/**
 * Check if any of the user's roles match the allowed roles.
 * @param roles - Array of role codes assigned to the user
 * @param allowedRoles - Array of role codes that are allowed
 * @returns true if at least one user role is in the allowed list
 */
export function checkRole(roles: RoleCode[], allowedRoles: readonly RoleCode[]): boolean {
  return roles.some((r) => allowedRoles.includes(r));
}
