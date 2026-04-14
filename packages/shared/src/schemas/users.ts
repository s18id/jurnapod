// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema, RoleSchema } from "./common.js";

const EmailSchema = z.string().trim().email().max(191);

export const UserOutletSchema = z.object({
  id: NumericIdSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191)
});

export const UserOutletRoleAssignmentSchema = z.object({
  outlet_id: NumericIdSchema,
  outlet_code: z.string().trim().min(1).max(32),
  outlet_name: z.string().trim().min(1).max(191),
  role_codes: z.array(RoleSchema)
});

export const RoleResponseSchema = z.object({
  id: NumericIdSchema,
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(191),
  company_id: NumericIdSchema.nullable(),
  is_global: z.boolean(),
  role_level: z.number().int().min(0)
});

export const OutletResponseSchema = z.object({
  id: NumericIdSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191)
});

export const UserResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  email: EmailSchema,
  is_active: z.boolean(),
  global_roles: z.array(RoleSchema),
  outlet_role_assignments: z.array(UserOutletRoleAssignmentSchema),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const UserCreateRequestSchema = z.object({
  company_id: NumericIdSchema.optional(),
  email: EmailSchema,
  password: z.string().min(8).max(255),
  role_codes: z.array(RoleSchema).optional(),
  outlet_ids: z.array(NumericIdSchema).optional(),
  outlet_role_assignments: z
    .array(
      z.object({
        outlet_id: NumericIdSchema,
        role_codes: z.array(RoleSchema)
      })
    )
    .optional(),
  is_active: z.boolean().optional()
});

export const UserUpdateRequestSchema = z
  .object({
    email: EmailSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const UserRolesUpdateRequestSchema = z.object({
  role_codes: z.array(RoleSchema),
  outlet_id: NumericIdSchema.optional()
});

export const UserOutletsUpdateRequestSchema = z.object({
  outlet_ids: z.array(NumericIdSchema)
});

export const UserPasswordUpdateRequestSchema = z.object({
  password: z.string().min(8).max(255)
});

export const UserListQuerySchema = z.object({
  company_id: NumericIdSchema,
  is_active: z.boolean().optional(),
  search: z.string().trim().max(191).optional()
});

export type UserOutlet = z.infer<typeof UserOutletSchema>;
export type UserOutletRoleAssignment = z.infer<typeof UserOutletRoleAssignmentSchema>;
export type RoleResponse = z.infer<typeof RoleResponseSchema>;
export type OutletResponse = z.infer<typeof OutletResponseSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
export type UserCreateRequest = z.infer<typeof UserCreateRequestSchema>;
export type UserUpdateRequest = z.infer<typeof UserUpdateRequestSchema>;
export type UserRolesUpdateRequest = z.infer<typeof UserRolesUpdateRequestSchema>;
export type UserOutletsUpdateRequest = z.infer<typeof UserOutletsUpdateRequestSchema>;
export type UserPasswordUpdateRequest = z.infer<typeof UserPasswordUpdateRequestSchema>;
export type UserListQuery = z.infer<typeof UserListQuerySchema>;
