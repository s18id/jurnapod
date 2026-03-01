import { z } from "zod";
import { NumericIdSchema } from "./common";

const BooleanInputSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return value;
}, z.boolean());

export const InventoryCostingMethodSchema = z.enum(["AVG", "FIFO", "LIFO"]);

const InventoryCostingMethodInputSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    return value.trim().toUpperCase();
  }
  return value;
}, InventoryCostingMethodSchema);

export const SettingValueTypeSchema = z.enum(["int", "boolean", "enum"]);

export const SETTINGS_KEYS = [
  "feature.pos.auto_sync_enabled",
  "feature.pos.sync_interval_seconds",
  "feature.sales.tax_included_default",
  "feature.inventory.allow_backorder",
  "feature.purchasing.require_approval",
  "inventory.low_stock_threshold",
  "inventory.reorder_point",
  "inventory.allow_negative_stock",
  "inventory.costing_method",
  "inventory.warn_on_negative"
] as const;

export const SettingKeySchema = z.enum(SETTINGS_KEYS);

export type SettingKey = z.infer<typeof SettingKeySchema>;
export type SettingValueType = z.infer<typeof SettingValueTypeSchema>;
export type InventoryCostingMethod = z.infer<typeof InventoryCostingMethodSchema>;
export type SettingValue = number | boolean | InventoryCostingMethod;

export type SettingsRegistryEntry = {
  valueType: SettingValueType;
  defaultValue: SettingValue;
  schema: z.ZodTypeAny;
};

export const SETTINGS_REGISTRY: Record<SettingKey, SettingsRegistryEntry> = {
  "feature.pos.auto_sync_enabled": {
    valueType: "boolean",
    defaultValue: true,
    schema: BooleanInputSchema
  },
  "feature.pos.sync_interval_seconds": {
    valueType: "int",
    defaultValue: 60,
    schema: z.coerce.number().int().min(5)
  },
  "feature.sales.tax_included_default": {
    valueType: "boolean",
    defaultValue: false,
    schema: BooleanInputSchema
  },
  "feature.inventory.allow_backorder": {
    valueType: "boolean",
    defaultValue: false,
    schema: BooleanInputSchema
  },
  "feature.purchasing.require_approval": {
    valueType: "boolean",
    defaultValue: true,
    schema: BooleanInputSchema
  },
  "inventory.low_stock_threshold": {
    valueType: "int",
    defaultValue: 5,
    schema: z.coerce.number().int().min(0)
  },
  "inventory.reorder_point": {
    valueType: "int",
    defaultValue: 10,
    schema: z.coerce.number().int().min(0)
  },
  "inventory.allow_negative_stock": {
    valueType: "boolean",
    defaultValue: false,
    schema: BooleanInputSchema
  },
  "inventory.costing_method": {
    valueType: "enum",
    defaultValue: "AVG",
    schema: InventoryCostingMethodInputSchema
  },
  "inventory.warn_on_negative": {
    valueType: "boolean",
    defaultValue: true,
    schema: BooleanInputSchema
  }
};

export function getSettingDefinition(key: SettingKey): SettingsRegistryEntry {
  return SETTINGS_REGISTRY[key];
}

export function getSettingDefault(key: SettingKey): SettingValue {
  return SETTINGS_REGISTRY[key].defaultValue;
}

export function parseSettingValue(key: SettingKey, value: unknown): SettingValue {
  return SETTINGS_REGISTRY[key].schema.parse(value) as SettingValue;
}

export const SettingsConfigQuerySchema = z.object({
  outlet_id: NumericIdSchema,
  keys: z.array(SettingKeySchema).min(1)
});

export const SettingsConfigUpdateSchema = z.object({
  outlet_id: NumericIdSchema,
  settings: z.array(
    z.object({
      key: SettingKeySchema,
      value: z.unknown()
    })
  )
});

export const SettingsConfigResponseSchema = z.object({
  ok: z.literal(true),
  outlet_id: NumericIdSchema,
  settings: z.array(
    z.object({
      key: SettingKeySchema,
      value: z.unknown(),
      value_type: SettingValueTypeSchema
    })
  )
});

export type SettingsConfigQuery = z.infer<typeof SettingsConfigQuerySchema>;
export type SettingsConfigUpdate = z.infer<typeof SettingsConfigUpdateSchema>;
export type SettingsConfigResponse = z.infer<typeof SettingsConfigResponseSchema>;
