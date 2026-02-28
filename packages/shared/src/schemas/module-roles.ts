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

export const PermissionSchema = z.object({
  can_create: z.boolean(),
  can_read: z.boolean(),
  can_update: z.boolean(),
  can_delete: z.boolean()
});

export const ModuleRoleResponseSchema = z.object({
  id: NumericIdSchema,
  role_id: NumericIdSchema,
  role_code: z.string(),
  module: ModuleSchema,
  can_create: z.boolean(),
  can_read: z.boolean(),
  can_update: z.boolean(),
  can_delete: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const ModuleRoleUpdateRequestSchema = PermissionSchema;

export type ModuleRoleResponse = z.infer<typeof ModuleRoleResponseSchema>;
export type ModuleRoleUpdateRequest = z.infer<typeof ModuleRoleUpdateRequestSchema>;
