import { z } from "zod";
import { NumericIdSchema } from "./common";

export const MODULE_CODES = [
  "platform",
  "pos",
  "sales",
  "inventory",
  "purchasing",
  "reports",
  "settings",
  "accounts",
  "journals"
] as const;

export const ModuleCodeSchema = z.enum(MODULE_CODES);

export type ModuleCode = z.infer<typeof ModuleCodeSchema>;

export const ModuleCatalogEntrySchema = z.object({
  id: NumericIdSchema,
  code: ModuleCodeSchema,
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional()
});

export const PosModuleConfigSchema = z
  .object({
    tax: z
      .object({
        rate: z.number().finite().min(0).optional(),
        inclusive: z.boolean().optional()
      })
      .optional(),
    payment_methods: z.array(z.string().trim().min(1)).optional()
  })
  .passthrough();

export const InventoryModuleConfigSchema = z
  .object({
    level: z.coerce.number().int().min(0).optional()
  })
  .passthrough();

export const GenericModuleConfigSchema = z.record(z.unknown()).default({});

export const ModuleConfigSchemaMap = {
  platform: GenericModuleConfigSchema,
  pos: PosModuleConfigSchema,
  sales: GenericModuleConfigSchema,
  inventory: InventoryModuleConfigSchema,
  purchasing: GenericModuleConfigSchema,
  reports: GenericModuleConfigSchema,
  settings: GenericModuleConfigSchema,
  accounts: GenericModuleConfigSchema,
  journals: GenericModuleConfigSchema
} as const satisfies Record<ModuleCode, z.ZodTypeAny>;

export const CompanyModuleEntrySchema = z.object({
  code: ModuleCodeSchema,
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  enabled: z.boolean(),
  config_json: z.string()
});

export const CompanyModulesResponseSchema = z.object({
  ok: z.literal(true),
  modules: z.array(CompanyModuleEntrySchema)
});

export const CompanyModuleUpdateEntrySchema = z.object({
  code: ModuleCodeSchema,
  enabled: z.boolean(),
  config_json: z.string()
});

export const CompanyModulesUpdateSchema = z.object({
  modules: z.array(CompanyModuleUpdateEntrySchema).min(1)
});

export type ModuleCatalogEntry = z.infer<typeof ModuleCatalogEntrySchema>;
export type CompanyModuleEntry = z.infer<typeof CompanyModuleEntrySchema>;
export type CompanyModulesResponse = z.infer<typeof CompanyModulesResponseSchema>;
export type CompanyModuleUpdateEntry = z.infer<typeof CompanyModuleUpdateEntrySchema>;
export type CompanyModulesUpdate = z.infer<typeof CompanyModulesUpdateSchema>;
