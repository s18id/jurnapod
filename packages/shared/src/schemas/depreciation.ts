// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { MoneySchema, NumericIdSchema } from "./common";

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const MoneyInputSchema = z.coerce.number().finite();
const MoneyInputNonNegativeSchema = MoneyInputSchema.pipe(MoneySchema.nonnegative());

export const DepreciationMethodSchema = z.enum([
  "STRAIGHT_LINE",
  "DECLINING_BALANCE",
  "SUM_OF_YEARS"
]);

export const DepreciationPlanStatusSchema = z.enum(["DRAFT", "ACTIVE", "VOID"]);

export const DepreciationRunStatusSchema = z.enum(["POSTED", "VOID"]);

export const DepreciationPlanCreateRequestSchema = z.object({
  asset_id: NumericIdSchema,
  outlet_id: NumericIdSchema.optional(),
  method: DepreciationMethodSchema.default("STRAIGHT_LINE"),
  start_date: DateOnlySchema.optional(),
  useful_life_months: z.coerce.number().int().positive(),
  salvage_value: MoneyInputNonNegativeSchema.default(0),
  purchase_cost_snapshot: MoneyInputNonNegativeSchema.optional(),
  expense_account_id: NumericIdSchema,
  accum_depr_account_id: NumericIdSchema,
  status: DepreciationPlanStatusSchema.optional()
});

export const DepreciationPlanUpdateRequestSchema = z
  .object({
    outlet_id: NumericIdSchema.optional(),
    method: DepreciationMethodSchema.optional(),
    start_date: DateOnlySchema.optional(),
    useful_life_months: z.coerce.number().int().positive().optional(),
    salvage_value: MoneyInputNonNegativeSchema.optional(),
    expense_account_id: NumericIdSchema.optional(),
    accum_depr_account_id: NumericIdSchema.optional(),
    status: DepreciationPlanStatusSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const DepreciationPlanSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  asset_id: NumericIdSchema,
  outlet_id: NumericIdSchema.nullable(),
  method: DepreciationMethodSchema,
  start_date: DateOnlySchema,
  useful_life_months: z.number().int().positive(),
  salvage_value: MoneySchema.nonnegative(),
  purchase_cost_snapshot: MoneySchema.nonnegative(),
  expense_account_id: NumericIdSchema,
  accum_depr_account_id: NumericIdSchema,
  status: DepreciationPlanStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const DepreciationRunCreateRequestSchema = z.object({
  plan_id: NumericIdSchema,
  period_year: z.coerce.number().int().min(1900),
  period_month: z.coerce.number().int().min(1).max(12),
  run_date: DateOnlySchema.optional()
});

export const DepreciationRunSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  plan_id: NumericIdSchema,
  period_year: z.number().int(),
  period_month: z.number().int(),
  run_date: DateOnlySchema,
  amount: MoneySchema.nonnegative(),
  journal_batch_id: NumericIdSchema.nullable(),
  status: DepreciationRunStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type DepreciationMethod = z.infer<typeof DepreciationMethodSchema>;
export type DepreciationPlanStatus = z.infer<typeof DepreciationPlanStatusSchema>;
export type DepreciationRunStatus = z.infer<typeof DepreciationRunStatusSchema>;
export type DepreciationPlanCreateRequest = z.infer<
  typeof DepreciationPlanCreateRequestSchema
>;
export type DepreciationPlanUpdateRequest = z.infer<
  typeof DepreciationPlanUpdateRequestSchema
>;
export type DepreciationPlan = z.infer<typeof DepreciationPlanSchema>;
export type DepreciationRunCreateRequest = z.infer<
  typeof DepreciationRunCreateRequestSchema
>;
export type DepreciationRun = z.infer<typeof DepreciationRunSchema>;
