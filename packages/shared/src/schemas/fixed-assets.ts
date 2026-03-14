// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { MoneySchema, NumericIdSchema } from "./common";

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IdempotencyKeySchema = z.string().min(1).max(64);

export const FixedAssetEventTypeSchema = z.enum([
  "ACQUISITION",
  "DEPRECIATION",
  "TRANSFER",
  "IMPAIRMENT",
  "DISPOSAL",
  "VOID"
]);

export const FixedAssetEventStatusSchema = z.enum(["POSTED", "VOIDED"]);

export const DisposalTypeSchema = z.enum(["SALE", "SCRAP"]);

export const AcquisitionRequestSchema = z.object({
  outlet_id: NumericIdSchema.optional(),
  event_date: DateOnlySchema,
  cost: MoneySchema.positive(),
  useful_life_months: z.coerce.number().int().positive(),
  salvage_value: MoneySchema.nonnegative().default(0),
  asset_account_id: NumericIdSchema,
  offset_account_id: NumericIdSchema,
  expense_account_id: NumericIdSchema.optional(),
  accum_depr_account_id: NumericIdSchema.optional(),
  notes: z.string().max(500).optional(),
  idempotency_key: IdempotencyKeySchema.optional()
}).refine(
  (data) => data.salvage_value <= data.cost,
  { message: "salvage_value cannot exceed cost", path: ["salvage_value"] }
);

export const TransferRequestSchema = z.object({
  to_outlet_id: NumericIdSchema,
  transfer_date: DateOnlySchema,
  notes: z.string().max(500).optional(),
  idempotency_key: IdempotencyKeySchema.optional()
});

export const ImpairmentRequestSchema = z.object({
  impairment_date: DateOnlySchema,
  impairment_amount: MoneySchema.positive(),
  reason: z.string().min(1).max(500),
  expense_account_id: NumericIdSchema,
  accum_impairment_account_id: NumericIdSchema,
  idempotency_key: IdempotencyKeySchema.optional()
});

export const DisposalRequestSchema = z.object({
  disposal_date: DateOnlySchema,
  disposal_type: DisposalTypeSchema,
  proceeds: MoneySchema.nonnegative().optional(),
  disposal_cost: MoneySchema.nonnegative().default(0),
  cash_account_id: NumericIdSchema,
  asset_account_id: NumericIdSchema,
  accum_depr_account_id: NumericIdSchema,
  accum_impairment_account_id: NumericIdSchema.optional(),
  gain_account_id: NumericIdSchema.optional(),
  loss_account_id: NumericIdSchema.optional(),
  disposal_expense_account_id: NumericIdSchema.optional(),
  notes: z.string().max(500).optional(),
  idempotency_key: IdempotencyKeySchema.optional()
}).refine(
  (data) => data.disposal_type === "SCRAP" || (data.proceeds !== undefined && data.proceeds >= 0),
  { message: "Proceeds required for SALE disposal type", path: ["proceeds"] }
);

export const VoidEventRequestSchema = z.object({
  void_reason: z.string().min(1).max(500),
  idempotency_key: IdempotencyKeySchema.optional()
});

export const FixedAssetEventSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  asset_id: NumericIdSchema,
  event_type: FixedAssetEventTypeSchema,
  event_date: DateOnlySchema,
  outlet_id: NumericIdSchema.nullable(),
  journal_batch_id: NumericIdSchema.nullable(),
  status: FixedAssetEventStatusSchema,
  idempotency_key: z.string(),
  event_data: z.record(z.unknown()),
  created_at: z.string().datetime(),
  created_by: NumericIdSchema,
  voided_by: NumericIdSchema.nullable(),
  voided_at: z.string().datetime().nullable()
});

export const FixedAssetBookSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  asset_id: NumericIdSchema,
  cost_basis: MoneySchema.nonnegative(),
  accum_depreciation: MoneySchema.nonnegative(),
  accum_impairment: MoneySchema.nonnegative(),
  carrying_amount: MoneySchema.nonnegative(),
  as_of_date: DateOnlySchema,
  last_event_id: NumericIdSchema
});

export const FixedAssetDisposalSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  event_id: NumericIdSchema,
  asset_id: NumericIdSchema,
  proceeds: MoneySchema.nonnegative(),
  cost_removed: MoneySchema.nonnegative(),
  depr_removed: MoneySchema.nonnegative(),
  impairment_removed: MoneySchema.nonnegative(),
  disposal_cost: MoneySchema.nonnegative(),
  gain_loss: MoneySchema,
  disposal_type: DisposalTypeSchema,
  notes: z.string().nullable()
});

export const AcquisitionResponseSchema = z.object({
  event_id: NumericIdSchema,
  journal_batch_id: NumericIdSchema,
  book: z.object({
    cost_basis: MoneySchema.nonnegative(),
    carrying_amount: MoneySchema.nonnegative()
  }),
  duplicate: z.boolean()
});

export const DepreciationRunResponseSchema = z.object({
  event_id: NumericIdSchema,
  journal_batch_id: NumericIdSchema,
  amount: MoneySchema.nonnegative(),
  duplicate: z.boolean()
});

export const TransferResponseSchema = z.object({
  event_id: NumericIdSchema,
  journal_batch_id: NumericIdSchema.nullable(),
  to_outlet_id: NumericIdSchema,
  to_outlet_name: z.string().optional(),
  duplicate: z.boolean()
});

export const ImpairmentResponseSchema = z.object({
  event_id: NumericIdSchema,
  journal_batch_id: NumericIdSchema,
  book: z.object({
    carrying_amount: MoneySchema.nonnegative(),
    accum_impairment: MoneySchema.nonnegative()
  }),
  duplicate: z.boolean()
});

export const DisposalResponseSchema = z.object({
  event_id: NumericIdSchema,
  journal_batch_id: NumericIdSchema,
  disposal: z.object({
    proceeds: MoneySchema.nonnegative(),
    cost_removed: MoneySchema.nonnegative(),
    gain_loss: MoneySchema
  }),
  book: z.object({
    carrying_amount: MoneySchema.nonnegative()
  }),
  duplicate: z.boolean()
});

export const VoidResponseSchema = z.object({
  void_event_id: NumericIdSchema,
  original_event_id: NumericIdSchema,
  journal_batch_id: NumericIdSchema.nullable(),
  duplicate: z.boolean()
});

export const LedgerResponseSchema = z.object({
  asset_id: NumericIdSchema,
  events: z.array(z.object({
    id: NumericIdSchema,
    event_type: FixedAssetEventTypeSchema,
    event_date: DateOnlySchema,
    journal_batch_id: NumericIdSchema.nullable(),
    status: FixedAssetEventStatusSchema,
    event_data: z.record(z.unknown())
  }))
});

export type FixedAssetEventType = z.infer<typeof FixedAssetEventTypeSchema>;
export type FixedAssetEventStatus = z.infer<typeof FixedAssetEventStatusSchema>;
export type DisposalType = z.infer<typeof DisposalTypeSchema>;
export type AcquisitionRequest = z.infer<typeof AcquisitionRequestSchema>;
export type TransferRequest = z.infer<typeof TransferRequestSchema>;
export type ImpairmentRequest = z.infer<typeof ImpairmentRequestSchema>;
export type DisposalRequest = z.infer<typeof DisposalRequestSchema>;
export type VoidEventRequest = z.infer<typeof VoidEventRequestSchema>;
export type VoidResponse = z.infer<typeof VoidResponseSchema>;
export type LedgerResponse = z.infer<typeof LedgerResponseSchema>;
export type FixedAssetBook = z.infer<typeof FixedAssetBookSchema>;
