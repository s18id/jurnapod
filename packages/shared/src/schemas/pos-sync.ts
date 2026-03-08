// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema, PosStatusSchema, UUID } from "./common";

export const PosOrderServiceTypeSchema = z.enum(["TAKEAWAY", "DINE_IN"]);

export const PosSourceFlowSchema = z.enum(["WALK_IN", "RESERVATION", "PHONE", "ONLINE", "MANUAL"]);

export const PosSettlementFlowSchema = z.enum(["IMMEDIATE", "DEFERRED", "SPLIT"]);

export const PosOrderStatusSchema = z.enum(["OPEN", "READY_TO_PAY", "COMPLETED", "CANCELLED"]);

export const OrderUpdateEventTypeSchema = z.enum([
  "SNAPSHOT_FINALIZED",
  "ITEM_ADDED",
  "ITEM_REMOVED",
  "QTY_CHANGED",
  "ITEM_CANCELLED",
  "NOTES_CHANGED",
  "ORDER_RESUMED",
  "ORDER_CLOSED"
]);

export const PosItemSchema = z.object({
  item_id: NumericIdSchema,
  qty: z.number().positive(),
  price_snapshot: z.number().nonnegative(),
  name_snapshot: z.string().min(1)
});

export const PosPaymentSchema = z.object({
  method: z.string().min(1),
  amount: z.number().nonnegative()
});

export const PosTaxLineSchema = z.object({
  tax_rate_id: NumericIdSchema,
  amount: z.number().nonnegative()
});

export const PosTransactionSchema = z.object({
  client_tx_id: UUID,
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  cashier_user_id: NumericIdSchema,
  status: PosStatusSchema.default("COMPLETED"),
  service_type: PosOrderServiceTypeSchema.default("TAKEAWAY"),
  source_flow: PosSourceFlowSchema.optional(),
  settlement_flow: PosSettlementFlowSchema.optional(),
  table_id: NumericIdSchema.nullable().optional(),
  reservation_id: NumericIdSchema.nullable().optional(),
  guest_count: z.coerce.number().int().positive().nullable().optional(),
  order_status: PosOrderStatusSchema.default("COMPLETED"),
  opened_at: z.string().datetime().optional(),
  closed_at: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  trx_at: z.string().datetime(),
  items: z.array(PosItemSchema).min(1),
  payments: z.array(PosPaymentSchema).min(1),
  taxes: z.array(PosTaxLineSchema).optional()
});

export const SyncPushRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  transactions: z.array(PosTransactionSchema).default([]),
  active_orders: z
    .array(
      z.object({
        order_id: UUID,
        company_id: NumericIdSchema,
        outlet_id: NumericIdSchema,
        service_type: PosOrderServiceTypeSchema,
        source_flow: PosSourceFlowSchema.optional(),
        settlement_flow: PosSettlementFlowSchema.optional(),
        table_id: NumericIdSchema.nullable(),
        reservation_id: NumericIdSchema.nullable(),
        guest_count: z.coerce.number().int().positive().nullable(),
        is_finalized: z.boolean(),
        order_status: PosOrderStatusSchema,
        order_state: z.enum(["OPEN", "CLOSED"]),
        paid_amount: z.number().finite().nonnegative(),
        opened_at: z.string().datetime(),
        closed_at: z.string().datetime().nullable(),
        notes: z.string().trim().max(500).nullable(),
        updated_at: z.string().datetime(),
        lines: z.array(
          z.object({
            item_id: NumericIdSchema,
            sku_snapshot: z.string().nullable(),
            name_snapshot: z.string().min(1),
            item_type_snapshot: z.enum(["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"]),
            unit_price_snapshot: z.number().finite().nonnegative(),
            qty: z.number().positive(),
            discount_amount: z.number().finite().min(0),
            updated_at: z.string().datetime()
          })
        )
      })
    )
    .optional(),
  order_updates: z
    .array(
      z.object({
        update_id: UUID,
        order_id: UUID,
        company_id: NumericIdSchema,
        outlet_id: NumericIdSchema,
        base_order_updated_at: z.string().datetime().nullable(),
        event_type: OrderUpdateEventTypeSchema,
        delta_json: z.string().min(2),
        actor_user_id: NumericIdSchema.nullable(),
        device_id: z.string().min(1),
        event_at: z.string().datetime(),
        created_at: z.string().datetime()
      })
    )
    .optional(),
  item_cancellations: z
    .array(
      z.object({
        cancellation_id: UUID,
        update_id: UUID.optional(),
        order_id: UUID,
        item_id: NumericIdSchema,
        company_id: NumericIdSchema,
        outlet_id: NumericIdSchema,
        cancelled_quantity: z.number().positive(),
        reason: z.string().trim().min(1).max(500),
        cancelled_by_user_id: NumericIdSchema.nullable(),
        cancelled_at: z.string().datetime()
      })
    )
    .optional()
});

export const SyncPushResultItemSchema = z.object({
  client_tx_id: UUID,
  result: z.enum(["OK", "DUPLICATE", "ERROR"]),
  message: z.string().optional()
});

export const SyncPushPayloadSchema = z.object({
  results: z.array(SyncPushResultItemSchema),
  order_update_results: z
    .array(
      z.object({
        update_id: UUID,
        result: z.enum(["OK", "DUPLICATE", "ERROR"]),
        message: z.string().optional()
      })
    )
    .optional(),
  item_cancellation_results: z
    .array(
      z.object({
        cancellation_id: UUID,
        result: z.enum(["OK", "DUPLICATE", "ERROR"]),
        message: z.string().optional()
      })
    )
    .optional()
});

export const SyncPushResponseSchema = z.object({
  success: z.literal(true),
  data: SyncPushPayloadSchema
});

export type PosTransaction = z.infer<typeof PosTransactionSchema>;
export type PosTaxLine = z.infer<typeof PosTaxLineSchema>;
export type PosOrderServiceType = z.infer<typeof PosOrderServiceTypeSchema>;
export type PosSourceFlow = z.infer<typeof PosSourceFlowSchema>;
export type PosSettlementFlow = z.infer<typeof PosSettlementFlowSchema>;
export type PosOrderStatus = z.infer<typeof PosOrderStatusSchema>;
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;
export type SyncPushResultItem = z.infer<typeof SyncPushResultItemSchema>;
export type SyncPushPayload = z.infer<typeof SyncPushPayloadSchema>;
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;
