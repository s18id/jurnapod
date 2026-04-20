// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common.js";

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
// FIX(47.5-WP-A1): Add AP period-close guardrail enum schema
export const APPeriodCloseGuardrailSchema = z.enum(["strict", "override_allowed"]);

const InventoryCostingMethodInputSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    return value.trim().toUpperCase();
  }
  return value;
}, InventoryCostingMethodSchema);

// FIX(47.5-WP-A1): AP period-close guardrail input schema
const APPeriodCloseGuardrailInputSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  return value;
}, APPeriodCloseGuardrailSchema);

export const SettingValueTypeSchema = z.enum(["int", "boolean", "enum"]);

export const SETTINGS_KEYS = [
  "feature.pos.auto_sync_enabled",
  "feature.pos.sync_interval_seconds",
  "feature.reservation.default_duration_minutes",
  "feature.sales.tax_included_default",
  "feature.inventory.allow_backorder",
  "feature.purchasing.require_approval",
  "accounting.allow_multiple_open_fiscal_years",
  // FIX(47.5-WP-A1): AP period-close guardrail — strict blocks post/pay/apply in closed periods
  "accounting.ap_period_close_guardrail",
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
// FIX(47.5-WP-A1): AP period-close guardrail type
export type APPeriodCloseGuardrail = z.infer<typeof APPeriodCloseGuardrailSchema>;
export type SettingValue = number | boolean | InventoryCostingMethod | APPeriodCloseGuardrail;

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
  "feature.reservation.default_duration_minutes": {
    valueType: "int",
    defaultValue: 120,
    schema: z.coerce.number().int().min(15).max(480)
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
  "accounting.allow_multiple_open_fiscal_years": {
    valueType: "boolean",
    defaultValue: false,
    schema: BooleanInputSchema
  },
  // FIX(47.5-WP-A1): AP period-close guardrail — default strict blocks override unless explicitly allowed
  "accounting.ap_period_close_guardrail": {
    valueType: "enum",
    defaultValue: "strict",
    schema: APPeriodCloseGuardrailInputSchema
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
  success: z.literal(true),
  data: z.object({
    outlet_id: NumericIdSchema,
    settings: z.array(
      z.object({
        key: SettingKeySchema,
        value: z.unknown(),
        value_type: SettingValueTypeSchema
      })
    )
  })
});

export type SettingsConfigQuery = z.infer<typeof SettingsConfigQuerySchema>;
export type SettingsConfigUpdate = z.infer<typeof SettingsConfigUpdateSchema>;
export type SettingsConfigResponse = z.infer<typeof SettingsConfigResponseSchema>;

export const FlexibleSettingValueTypeSchema = z.enum(["string", "number", "boolean", "json"]);

export type FlexibleSettingValueType = z.infer<typeof FlexibleSettingValueTypeSchema>;

export const FlexibleSettingKeySchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]{0,62}[a-z0-9]$/);

export type FlexibleSettingKey = z.infer<typeof FlexibleSettingKeySchema>;

export const OutletSettingCreateSchema = z.object({
  key: FlexibleSettingKeySchema,
  value: z.unknown(),
  value_type: FlexibleSettingValueTypeSchema
});

export const OutletSettingUpdateSchema = z.object({
  key: FlexibleSettingKeySchema,
  value: z.unknown(),
  value_type: FlexibleSettingValueTypeSchema
});

export type OutletSettingCreate = z.infer<typeof OutletSettingCreateSchema>;
export type OutletSettingUpdate = z.infer<typeof OutletSettingUpdateSchema>;
