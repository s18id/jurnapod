// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";

// =============================================================================
// User Contracts
// =============================================================================

export const UserProfileSchema = z.object({
  id: z.number(),
  company_id: z.number(),
  name: z.string().nullable(),
  email: z.string(),
  is_active: z.boolean(),
  global_roles: z.array(z.string()),
  outlet_role_assignments: z.array(z.object({
    outlet_id: z.number(),
    outlet_code: z.string(),
    outlet_name: z.string(),
    role_codes: z.array(z.string())
  })),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
});

export type UserProfileInput = z.infer<typeof UserProfileSchema>;

export const CreateUserInputSchema = z.object({
  companyId: z.number(),
  email: z.string().email().max(191),
  passwordHash: z.string(),
  name: z.string().max(255).optional(),
  isActive: z.boolean().optional().default(true)
});

export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

export const SetUserRolesInputSchema = z.object({
  companyId: z.number(),
  userId: z.number(),
  roleCodes: z.array(z.string()),
  outletId: z.number().optional(),
  actorUserId: z.number()
});

export const SetUserOutletsInputSchema = z.object({
  companyId: z.number(),
  userId: z.number(),
  outletIds: z.array(z.number()),
  actorUserId: z.number()
});

export const SetUserPasswordInputSchema = z.object({
  companyId: z.number(),
  userId: z.number(),
  passwordHash: z.string(),
  actorUserId: z.number()
});

export const SetUserActiveStateInputSchema = z.object({
  companyId: z.number(),
  userId: z.number(),
  isActive: z.boolean(),
  actorUserId: z.number()
});

export const UpdateUserEmailInputSchema = z.object({
  companyId: z.number(),
  userId: z.number(),
  email: z.string().email().max(191),
  actorUserId: z.number()
});

// =============================================================================
// Role Contracts
// =============================================================================

export const RoleResponseSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  company_id: z.number().nullable(),
  is_global: z.boolean(),
  role_level: z.number()
});

export type RoleResponse = z.infer<typeof RoleResponseSchema>;

export const CreateRoleInputSchema = z.object({
  companyId: z.number(),
  code: z.string().max(100),
  name: z.string().max(255),
  roleLevel: z.number().optional(),
  actorUserId: z.number()
});

export const UpdateRoleInputSchema = z.object({
  companyId: z.number(),
  roleId: z.number(),
  name: z.string().max(255).optional(),
  actorUserId: z.number()
});

export const DeleteRoleInputSchema = z.object({
  companyId: z.number(),
  roleId: z.number(),
  actorUserId: z.number()
});

// =============================================================================
// Module Permission Contracts
// =============================================================================

export const ModuleRoleResponseSchema = z.object({
  id: z.number(),
  role_id: z.number(),
  role_code: z.string(),
  module: z.string(),
  permission_mask: z.number(),
  created_at: z.string(),
  updated_at: z.string()
});

export type ModuleRoleResponse = z.infer<typeof ModuleRoleResponseSchema>;

export const SetModuleRolePermissionInputSchema = z.object({
  companyId: z.number(),
  roleId: z.number(),
  module: z.string(),
  permissionMask: z.number(),
  actorUserId: z.number()
});

// =============================================================================
// Outlet Contracts
// =============================================================================

export const OutletInfoSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string()
});

export type OutletInfo = z.infer<typeof OutletInfoSchema>;