// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { MODULE_CODES, type ModuleCode, ModuleCodeSchema } from "../constants/modules.js";

// Re-export from constants for backward compatibility
export { MODULE_CODES, type ModuleCode };

import { z } from "zod";
import { NumericIdSchema } from "./common";

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
  accounting: GenericModuleConfigSchema,
  treasury: GenericModuleConfigSchema,
  reservations: GenericModuleConfigSchema
} as const satisfies Record<ModuleCode, z.ZodTypeAny>;

// POS explicit settings schema
export const PosModuleSettingsSchema = z.object({
  pos_enabled: z.boolean(),
  pos_offline_mode: z.boolean(),
  pos_receipt_template: z.string(),
  pos_auto_sync: z.boolean(),
  pos_sync_interval_seconds: z.number().int().min(1),
  pos_require_auth: z.boolean(),
  pos_allow_discount_after_tax: z.boolean(),
  pos_default_payment_method_id: NumericIdSchema.nullable(),
  pos_tip_adjustment_enabled: z.boolean()
});

// Inventory explicit settings schema
export const InventoryModuleSettingsSchema = z.object({
  inventory_enabled: z.boolean(),
  inventory_multi_warehouse: z.boolean(),
  inventory_warehouses: z.unknown().nullable(),
  inventory_auto_reorder: z.boolean(),
  inventory_low_stock_threshold: z.number().int().min(0),
  inventory_default_asset_account_id: NumericIdSchema.nullable(),
  inventory_default_cogs_account_id: NumericIdSchema.nullable()
});

// Sales explicit settings schema
export const SalesModuleSettingsSchema = z.object({
  sales_enabled: z.boolean(),
  sales_tax_mode: z.enum(["inclusive", "exclusive", "mixed"]),
  sales_default_tax_rate_id: NumericIdSchema.nullable(),
  sales_allow_partial_pay: z.boolean(),
  sales_credit_limit_enabled: z.boolean(),
  sales_default_price_list_id: NumericIdSchema.nullable(),
  sales_default_income_account_id: NumericIdSchema.nullable()
});

// Purchasing explicit settings schema
export const PurchasingModuleSettingsSchema = z.object({
  purchasing_enabled: z.boolean(),
  purchasing_approval_workflow: z.boolean(),
  purchasing_default_tax_rate_id: NumericIdSchema.nullable(),
  purchasing_default_expense_account_id: NumericIdSchema.nullable(),
  purchasing_credit_limit_enabled: z.boolean()
});

export const CompanyModuleEntrySchema = z.object({
  code: ModuleCodeSchema,
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  enabled: z.boolean(),
  config_json: z.string()
});

export const CompanyModulesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(CompanyModuleEntrySchema)
});

export const CompanyModuleUpdateEntrySchema = z.object({
  code: ModuleCodeSchema,
  enabled: z.boolean(),
  config_json: z.string()
});

export const CompanyModulesUpdateSchema = z.object({
  modules: z.array(CompanyModuleUpdateEntrySchema).min(1)
});

// Extended module settings with explicit columns
export const ExtendedCompanyModuleEntrySchema = CompanyModuleEntrySchema.extend({
  pos_settings: PosModuleSettingsSchema.nullable(),
  inventory_settings: InventoryModuleSettingsSchema.nullable(),
  sales_settings: SalesModuleSettingsSchema.nullable(),
  purchasing_settings: PurchasingModuleSettingsSchema.nullable()
});

export const ExtendedCompanyModulesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(ExtendedCompanyModuleEntrySchema)
});

// Update schemas with explicit settings
export const PosModuleUpdateSchema = z.object({
  pos_enabled: z.boolean().optional(),
  pos_offline_mode: z.boolean().optional(),
  pos_receipt_template: z.string().optional(),
  pos_auto_sync: z.boolean().optional(),
  pos_sync_interval_seconds: z.number().int().min(1).optional(),
  pos_require_auth: z.boolean().optional(),
  pos_allow_discount_after_tax: z.boolean().optional(),
  pos_default_payment_method_id: NumericIdSchema.nullable().optional(),
  pos_tip_adjustment_enabled: z.boolean().optional()
});

export const InventoryModuleUpdateSchema = z.object({
  inventory_enabled: z.boolean().optional(),
  inventory_multi_warehouse: z.boolean().optional(),
  inventory_warehouses: z.unknown().nullable().optional(),
  inventory_auto_reorder: z.boolean().optional(),
  inventory_low_stock_threshold: z.number().int().min(0).optional(),
  inventory_default_asset_account_id: NumericIdSchema.nullable().optional(),
  inventory_default_cogs_account_id: NumericIdSchema.nullable().optional()
});

export const SalesModuleUpdateSchema = z.object({
  sales_enabled: z.boolean().optional(),
  sales_tax_mode: z.enum(["inclusive", "exclusive", "mixed"]).optional(),
  sales_default_tax_rate_id: NumericIdSchema.nullable().optional(),
  sales_allow_partial_pay: z.boolean().optional(),
  sales_credit_limit_enabled: z.boolean().optional(),
  sales_default_price_list_id: NumericIdSchema.nullable().optional(),
  sales_default_income_account_id: NumericIdSchema.nullable().optional()
});

export const PurchasingModuleUpdateSchema = z.object({
  purchasing_enabled: z.boolean().optional(),
  purchasing_approval_workflow: z.boolean().optional(),
  purchasing_default_tax_rate_id: NumericIdSchema.nullable().optional(),
  purchasing_default_expense_account_id: NumericIdSchema.nullable().optional(),
  purchasing_credit_limit_enabled: z.boolean().optional()
});

export const ExtendedModuleUpdateEntrySchema = z.object({
  code: ModuleCodeSchema,
  enabled: z.boolean(),
  pos_settings: PosModuleUpdateSchema.optional(),
  inventory_settings: InventoryModuleUpdateSchema.optional(),
  sales_settings: SalesModuleUpdateSchema.optional(),
  purchasing_settings: PurchasingModuleUpdateSchema.optional()
});

export const ExtendedCompanyModulesUpdateSchema = z.object({
  modules: z.array(ExtendedModuleUpdateEntrySchema).min(1)
});

export type ModuleCatalogEntry = z.infer<typeof ModuleCatalogEntrySchema>;
export type CompanyModuleEntry = z.infer<typeof CompanyModuleEntrySchema>;
export type CompanyModulesResponse = z.infer<typeof CompanyModulesResponseSchema>;
export type CompanyModuleUpdateEntry = z.infer<typeof CompanyModuleUpdateEntrySchema>;
export type CompanyModulesUpdate = z.infer<typeof CompanyModulesUpdateSchema>;
export type ExtendedCompanyModuleEntry = z.infer<typeof ExtendedCompanyModuleEntrySchema>;
export type ExtendedCompanyModulesResponse = z.infer<typeof ExtendedCompanyModulesResponseSchema>;
export type PosModuleSettings = z.infer<typeof PosModuleSettingsSchema>;
export type InventoryModuleSettings = z.infer<typeof InventoryModuleSettingsSchema>;
export type SalesModuleSettings = z.infer<typeof SalesModuleSettingsSchema>;
export type PurchasingModuleSettings = z.infer<typeof PurchasingModuleSettingsSchema>;
