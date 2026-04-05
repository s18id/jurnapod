// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { RoleRow, RoleSnapshot, RoleWithPermissionsResponse } from "../types/role.js";
import type { ModuleRoleResponse } from "../types/permission.js";

/**
 * Input for creating a role.
 */
export interface CreateRoleInput {
  companyId: number;
  code: string;
  name: string;
  roleLevel?: number;
}

/**
 * Repository interface for role data access.
 */
export interface RoleRepository {
  /**
   * Find role by ID.
   */
  findById(roleId: number): Promise<RoleRow | null>;

  /**
   * Find roles by code.
   */
  findByCodes(codes: string[]): Promise<Map<string, RoleSnapshot>>;

  /**
   * List roles for a company (including global roles with null company_id).
   */
  list(companyId: number, isSuperAdmin: boolean, filterCompanyId?: number): Promise<RoleRow[]>;

  /**
   * Create a new role.
   */
  create(data: CreateRoleInput): Promise<number>;

  /**
   * Update role name.
   */
  updateName(roleId: number, name: string): Promise<void>;

  /**
   * Delete a role (only if not assigned to any users).
   */
  delete(roleId: number): Promise<void>;

  /**
   * Count users assigned to a role.
   */
  countUsers(roleId: number): Promise<number>;

  /**
   * List module roles for a company/role.
   */
  listModuleRoles(params: {
    companyId: number;
    roleId?: number;
    module?: string;
  }): Promise<ModuleRoleResponse[]>;

  /**
   * Set module role permission.
   */
  setModuleRolePermission(params: {
    companyId: number;
    roleId: number;
    module: string;
    permissionMask: number;
  }): Promise<ModuleRoleResponse>;
}