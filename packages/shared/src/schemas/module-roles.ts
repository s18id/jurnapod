import { z } from "zod";
import { NumericIdSchema } from "./common";

export const ModuleSchema = z.enum([
  "companies",
  "outlets",
  "users",
  "roles",
  "accounts",
  "journals",
  "sales",
  "inventory",
  "purchasing",
  "reports",
  "settings"
]);

export type Module = z.infer<typeof ModuleSchema>;

export const PermissionMaskSchema = z.number().int().min(0).max(15);

export const ModuleRoleResponseSchema = z.object({
  id: NumericIdSchema,
  role_id: NumericIdSchema,
  role_code: z.string(),
  module: ModuleSchema,
  permission_mask: PermissionMaskSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const ModuleRoleUpdateRequestSchema = z.object({
  permission_mask: PermissionMaskSchema
});

export type ModuleRoleResponse = z.infer<typeof ModuleRoleResponseSchema>;
export type ModuleRoleUpdateRequest = z.infer<typeof ModuleRoleUpdateRequestSchema>;
