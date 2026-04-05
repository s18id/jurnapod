// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Role response type for API output.
 */
export type RoleResponse = {
  id: number;
  code: string;
  name: string;
  company_id: number | null;
  is_global: boolean;
  role_level: number;
};

/**
 * Internal role row type from database.
 */
export type RoleRow = {
  id: number;
  code: string;
  name: string;
  company_id?: number | null;
  is_global?: number | null;
  role_level?: number | null;
};

/**
 * Role snapshot for internal use.
 */
export type RoleSnapshot = {
  id: number;
  role_level: number;
  is_global: number;
};

// Forward declaration - ModuleRoleResponse is in permission.ts
export type RoleWithPermissionsResponse = RoleResponse & {
  permissions: Array<{
    id: number;
    role_id: number;
    role_code: string;
    module: string;
    permission_mask: number;
    created_at: string;
    updated_at: string;
  }>;
};
