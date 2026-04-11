// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common";

/**
 * Module schema for RBAC - 7 canonical modules
 */
export const ModuleSchema = z.enum([
  "platform",
  "pos",
  "sales",
  "inventory",
  "accounting",
  "treasury",
  "reservations"
]);

export type Module = z.infer<typeof ModuleSchema>;

/**
 * Resource schema for fine-grained RBAC within modules
 * Optional for backward compatibility - NULL means module-level access
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

export type ModuleRoleResponse = z.infer<typeof ModuleRoleResponseSchema>;
export type ModuleRoleUpdateRequest = z.infer<typeof ModuleRoleUpdateRequestSchema>;
