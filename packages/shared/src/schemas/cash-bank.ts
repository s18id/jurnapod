// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { MoneySchema, NumericIdSchema } from "./common";

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const MoneyInputSchema = z.coerce.number().finite();
const MoneyInputPositiveSchema = MoneyInputSchema.pipe(MoneySchema.positive());

export const CashBankTransactionTypeSchema = z.enum([
  "MUTATION",
  "TOP_UP",
  "WITHDRAWAL",
  "FOREX"
]);

export const CashBankTransactionStatusSchema = z.enum(["DRAFT", "POSTED", "VOID"]);

export const CashBankTransactionSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema.nullable(),
  transaction_type: CashBankTransactionTypeSchema,
  transaction_date: DateOnlySchema,
  reference: z.string().max(100).nullable(),
  description: z.string().min(1).max(500),
  source_account_id: NumericIdSchema,
  source_account_name: z.string().optional(),
  destination_account_id: NumericIdSchema,
  destination_account_name: z.string().optional(),
  amount: MoneySchema.positive(),
  currency_code: z.string().trim().length(3),
  exchange_rate: z.number().positive().nullable(),
  base_amount: MoneySchema.positive().nullable(),
  fx_gain_loss: MoneySchema.nullable().optional(),
  fx_account_id: NumericIdSchema.nullable(),
  fx_account_name: z.string().nullable().optional(),
  status: CashBankTransactionStatusSchema,
  posted_at: z.string().datetime().nullable(),
  created_by_user_id: NumericIdSchema.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const CashBankTransactionCreateRequestSchema = z
  .object({
    outlet_id: NumericIdSchema.optional().nullable(),
    transaction_type: CashBankTransactionTypeSchema,
    transaction_date: DateOnlySchema,
    reference: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().min(1).max(500),
    source_account_id: NumericIdSchema,
    destination_account_id: NumericIdSchema,
    amount: MoneyInputPositiveSchema,
    currency_code: z.string().trim().length(3).default("IDR"),
    exchange_rate: z.coerce.number().positive().optional(),
    base_amount: MoneyInputPositiveSchema.optional(),
    fx_account_id: NumericIdSchema.optional().nullable()
  })
  .refine((value) => value.source_account_id !== value.destination_account_id, {
    message: "source and destination account must differ",
    path: ["destination_account_id"]
  })
  .superRefine((value, ctx) => {
    if (value.transaction_type !== "FOREX") {
      return;
    }

    if (typeof value.exchange_rate !== "number" || value.exchange_rate <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exchange_rate is required for FOREX",
        path: ["exchange_rate"]
      });
    }

    if (!value.currency_code || value.currency_code.trim().length !== 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "currency_code is required for FOREX",
        path: ["currency_code"]
      });
    }
  });

export const CashBankTransactionListQuerySchema = z.object({
  outlet_id: NumericIdSchema.optional(),
  transaction_type: CashBankTransactionTypeSchema.optional(),
  status: CashBankTransactionStatusSchema.optional(),
  date_from: DateOnlySchema.optional(),
  date_to: DateOnlySchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export type CashBankTransactionType = z.infer<typeof CashBankTransactionTypeSchema>;
export type CashBankTransactionStatus = z.infer<typeof CashBankTransactionStatusSchema>;
export type CashBankTransaction = z.infer<typeof CashBankTransactionSchema>;
export type CashBankTransactionCreateRequest = z.infer<typeof CashBankTransactionCreateRequestSchema>;
export type CashBankTransactionListQuery = z.infer<typeof CashBankTransactionListQuerySchema>;
