// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { MODULE_ROLE_DEFAULTS_API } from "../constants/rbac.js";
import { NumericIdSchema } from "./common.js";

/**
 * Module schema for RBAC - 8 canonical modules
 */
export const ModuleSchema = z.enum([
  "platform",
  "pos",
  "sales",
  "inventory",
  "accounting",
  "treasury",
  "purchasing",
  "reservations"
]);

export type Module = z.infer<typeof ModuleSchema>;

/**
 * Resource schema for fine-grained RBAC within modules
 * Migration 0158 enforces module_roles.resource IS NOT NULL.
 * New entries MUST provide a non-empty resource; nullable response parsing remains
 * only for historical compatibility during schema reads.
 */
export const ResourceSchema = z.string().min(1).nullable();

export type Resource = z.infer<typeof ResourceSchema>;

export const PermissionMaskSchema = z.number().int().min(0).max(63);

export const ModuleRoleResponseSchema = z.object({
  id: NumericIdSchema,
  role_id: NumericIdSchema,
  role_code: z.string(),
  module: ModuleSchema,
  resource: ResourceSchema,
  permission_mask: PermissionMaskSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const ModuleRoleUpdateRequestSchema = z.object({
  permission_mask: PermissionMaskSchema
});

const CanonicalRolePermissionKeySet = new Set(
  MODULE_ROLE_DEFAULTS_API.map((entry) => `${entry.module}:${entry.resource}`)
);

export const RolePermissionEntrySchema = z.object({
  module: ModuleSchema,
  resource: z.string().trim().min(1),
  mask: PermissionMaskSchema
}).superRefine((entry, ctx) => {
  if (!CanonicalRolePermissionKeySet.has(`${entry.module}:${entry.resource}`)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resource"],
      message: "resource must be canonical for module"
    });
  }
});

export const RolePermissionsUpdateRequestSchema = z.object({
  permissions: z.array(RolePermissionEntrySchema)
});

export type ModuleRoleResponse = z.infer<typeof ModuleRoleResponseSchema>;
export type ModuleRoleUpdateRequest = z.infer<typeof ModuleRoleUpdateRequestSchema>;
export type RolePermissionEntry = z.infer<typeof RolePermissionEntrySchema>;
export type RolePermissionsUpdateRequest = z.infer<typeof RolePermissionsUpdateRequestSchema>;
