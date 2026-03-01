// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema, PosStatusSchema, UUID } from "./common";

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
  trx_at: z.string().datetime(),
  items: z.array(PosItemSchema).min(1),
  payments: z.array(PosPaymentSchema).min(1),
  taxes: z.array(PosTaxLineSchema).optional()
});

export const SyncPushRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  transactions: z.array(PosTransactionSchema).min(1)
});

export const SyncPushResultItemSchema = z.object({
  client_tx_id: UUID,
  result: z.enum(["OK", "DUPLICATE", "ERROR"]),
  message: z.string().optional()
});

export const SyncPushResponseSchema = z.object({
  results: z.array(SyncPushResultItemSchema)
});

export type PosTransaction = z.infer<typeof PosTransactionSchema>;
export type PosTaxLine = z.infer<typeof PosTaxLineSchema>;
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;
export type SyncPushResultItem = z.infer<typeof SyncPushResultItemSchema>;
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;
