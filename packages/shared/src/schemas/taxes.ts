// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common";

const RatePercentSchema = z.coerce.number().finite().min(0).max(100);

export const TaxRateSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(191),
  rate_percent: RatePercentSchema,
  is_inclusive: z.boolean(),
  is_active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const TaxRateCreateRequestSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(191),
  rate_percent: RatePercentSchema,
  is_inclusive: z.boolean().default(false),
  is_active: z.boolean().optional()
});

export const TaxRateUpdateRequestSchema = z
  .object({
    code: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(191).optional(),
    rate_percent: RatePercentSchema.optional(),
    is_inclusive: z.boolean().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const TaxRateListResponseSchema = z.object({
  ok: z.literal(true),
  tax_rates: z.array(TaxRateSchema)
});

export const TaxRateResponseSchema = z.object({
  ok: z.literal(true),
  tax_rate: TaxRateSchema
});

export const TaxDefaultsResponseSchema = z.object({
  ok: z.literal(true),
  tax_rate_ids: z.array(NumericIdSchema)
});

export const TaxDefaultsUpdateSchema = z.object({
  tax_rate_ids: z.array(NumericIdSchema)
});

export type TaxRate = z.infer<typeof TaxRateSchema>;
export type TaxRateCreateRequest = z.infer<typeof TaxRateCreateRequestSchema>;
export type TaxRateUpdateRequest = z.infer<typeof TaxRateUpdateRequestSchema>;
export type TaxRateListResponse = z.infer<typeof TaxRateListResponseSchema>;
export type TaxRateResponse = z.infer<typeof TaxRateResponseSchema>;
export type TaxDefaultsResponse = z.infer<typeof TaxDefaultsResponseSchema>;
export type TaxDefaultsUpdate = z.infer<typeof TaxDefaultsUpdateSchema>;
