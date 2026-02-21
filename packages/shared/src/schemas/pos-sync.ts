import { z } from "zod";
import { PosStatusSchema, UUID } from "./common";

export const PosItemSchema = z.object({
  item_id: UUID,
  qty: z.number().positive(),
  price_snapshot: z.number().nonnegative(),
  name_snapshot: z.string().min(1)
});

export const PosPaymentSchema = z.object({
  method: z.string().min(1),
  amount: z.number().nonnegative()
});

export const PosTransactionSchema = z.object({
  client_tx_id: UUID,
  company_id: UUID,
  outlet_id: UUID,
  cashier_user_id: UUID,
  status: PosStatusSchema.default("COMPLETED"),
  trx_at: z.string().datetime(),
  items: z.array(PosItemSchema).min(1),
  payments: z.array(PosPaymentSchema).min(1)
});

export const SyncPushRequestSchema = z.object({
  outlet_id: UUID,
  transactions: z.array(PosTransactionSchema).min(1)
});

export const SyncPushResultItemSchema = z.object({
  client_tx_id: UUID,
  result: z.enum(["OK", "DUPLICATE", "ERROR"]),
  message: z.string().optional()
});

export type PosTransaction = z.infer<typeof PosTransactionSchema>;
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;
