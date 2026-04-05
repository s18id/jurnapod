// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * User profile type for API output.
 */
export type UserProfile = {
  id: number;
  company_id: number;
  name: string | null;
  email: string;
  is_active: boolean;
  global_roles: string[];
  outlet_role_assignments: UserOutletRoleAssignment[];
  created_at?: string;
  updated_at?: string;
};

/**
 * Outlet role assignment for a user.
 */
export type UserOutletRoleAssignment = {
  outlet_id: number;
  outlet_code: string;
  outlet_name: string;
  role_codes: string[];
};

/**
 * Actor performing user operations.
 */
export type UserActor = {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
};

/**
 * Internal user row type from database.
 */
export type UserRow = {
  id: number;
  company_id: number;
  name: string | null;
  email: string;
  is_active: number;
  created_at: Date;
  updated_at: Date;
};
