/**
 * RBAC submodule - Role-Based Access Control utilities
 */
export { RBACManager } from './access-check.js';
export { checkRole, ROLE_CODES } from './roles.js';
export type { RoleCode } from './roles.js';
export { buildPermissionMask, hasPermissionBit, MODULE_PERMISSION_BITS } from './permissions.js';
export type { ModulePermission } from './permissions.js';
