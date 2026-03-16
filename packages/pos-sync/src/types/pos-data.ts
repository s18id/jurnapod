// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";

// POS-specific data types for tier-based sync

// REALTIME Tier - Critical operational data
export const PosRealtimeDataSchema = z.object({
  active_orders: z.array(z.object({
    order_id: z.string().uuid(),
    table_id: z.number().nullable(),
    order_status: z.enum(["OPEN", "READY_TO_PAY", "COMPLETED", "CANCELLED"]),
    paid_amount: z.number().nonnegative(),
    total_amount: z.number().nonnegative(),
    guest_count: z.number().positive().nullable(),
    updated_at: z.string().datetime()
  })),
  table_status_updates: z.array(z.object({
    table_id: z.number(),
    status: z.enum(["AVAILABLE", "RESERVED", "OCCUPIED", "UNAVAILABLE"]),
    current_order_id: z.string().uuid().nullable(),
    updated_at: z.string().datetime()
  }))
});

// OPERATIONAL Tier - High-frequency operational data
export const PosOperationalDataSchema = z.object({
  tables: z.array(z.object({
    table_id: NumericIdSchema,
    code: z.string(),
    name: z.string(),
    zone: z.string().nullable(),
    capacity: z.number().positive().nullable(),
    status: z.enum(["AVAILABLE", "RESERVED", "OCCUPIED", "UNAVAILABLE"]),
    updated_at: z.string().datetime()
  })),
  reservations: z.array(z.object({
    reservation_id: NumericIdSchema,
    table_id: NumericIdSchema.nullable(),
    customer_name: z.string(),
    customer_phone: z.string().nullable(),
    guest_count: z.number().positive(),
    reservation_at: z.string().datetime(),
    duration_minutes: z.number().positive().nullable(),
    status: z.enum(["BOOKED", "CONFIRMED", "ARRIVED", "SEATED"]),
    notes: z.string().nullable(),
    linked_order_id: z.string().uuid().nullable(),
    updated_at: z.string().datetime()
  })),
  item_availability: z.array(z.object({
    item_id: NumericIdSchema,
    is_available: z.boolean(),
    stock_level: z.number().nonnegative().nullable(),
    last_updated: z.string().datetime()
  })).optional()
});

// MASTER Tier - Core catalog and configuration data  
export const PosMasterDataSchema = z.object({
  data_version: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: NumericIdSchema,
    sku: z.string().nullable(),
    name: z.string(),
    type: z.enum(["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"]),
    item_group_id: NumericIdSchema.nullable(),
    is_active: z.boolean(),
    updated_at: z.string().datetime()
  })),
  item_groups: z.array(z.object({
    id: NumericIdSchema,
    parent_id: NumericIdSchema.nullable(),
    code: z.string().nullable(),
    name: z.string(),
    is_active: z.boolean(),
    updated_at: z.string().datetime()
  })),
  prices: z.array(z.object({
    id: NumericIdSchema,
    item_id: NumericIdSchema,
    outlet_id: NumericIdSchema,
    price: z.number().nonnegative(),
    is_active: z.boolean(),
    updated_at: z.string().datetime()
  })),
  tax_rates: z.array(z.object({
    id: NumericIdSchema,
    code: z.string(),
    name: z.string(),
    rate_percent: z.number().nonnegative(),
    is_inclusive: z.boolean(),
    is_active: z.boolean()
  })),
  default_tax_rate_ids: z.array(NumericIdSchema),
  payment_methods: z.array(z.object({
    code: z.string(),
    label: z.string(),
    is_active: z.boolean(),
    account_id: NumericIdSchema.nullable()
  }))
});

// ADMIN Tier - Configuration and permissions
export const PosAdminDataSchema = z.object({
  outlet_config: z.object({
    outlet_id: NumericIdSchema,
    company_id: NumericIdSchema,
    name: z.string(),
    timezone: z.string(),
    currency_code: z.string(),
    tax_config: z.object({
      default_rate: z.number().nonnegative(),
      is_inclusive: z.boolean()
    }),
    pos_settings: z.record(z.any()).optional()
  }),
  user_permissions: z.array(z.object({
    user_id: NumericIdSchema,
    outlet_id: NumericIdSchema,
    permissions: z.array(z.string()),
    role: z.enum(["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"])
  })).optional(),
  feature_flags: z.record(z.boolean()).optional()
});

// Combined POS sync response by tier
export const PosTierDataSchema = z.discriminatedUnion("tier", [
  z.object({ tier: z.literal("REALTIME"), data: PosRealtimeDataSchema }),
  z.object({ tier: z.literal("OPERATIONAL"), data: PosOperationalDataSchema }),
  z.object({ tier: z.literal("MASTER"), data: PosMasterDataSchema }),
  z.object({ tier: z.literal("ADMIN"), data: PosAdminDataSchema })
]);

// Type exports
export type PosRealtimeData = z.infer<typeof PosRealtimeDataSchema>;
export type PosOperationalData = z.infer<typeof PosOperationalDataSchema>;
export type PosMasterData = z.infer<typeof PosMasterDataSchema>;
export type PosAdminData = z.infer<typeof PosAdminDataSchema>;
export type PosTierData = z.infer<typeof PosTierDataSchema>;