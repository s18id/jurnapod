// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common.js";

export const OutletFullResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  city: z.string().trim().max(96).nullable(),
  address_line1: z.string().trim().max(191).nullable(),
  address_line2: z.string().trim().max(191).nullable(),
  postal_code: z.string().trim().max(20).nullable(),
  phone: z.string().trim().max(32).nullable(),
  email: z.string().trim().email().max(191).nullable(),
  timezone: z.string().trim().max(64).nullable(),
  is_active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const OutletCreateRequestSchema = z.object({
  company_id: NumericIdSchema.optional(),
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  city: z.string().trim().max(96).optional(),
  address_line1: z.string().trim().max(191).optional(),
  address_line2: z.string().trim().max(191).optional(),
  postal_code: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().email().max(191).optional().nullable(),
  timezone: z.string().trim().max(64).optional()
});

export const OutletUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional(),
    city: z.string().trim().max(96).nullable().optional(),
    address_line1: z.string().trim().max(191).nullable().optional(),
    address_line2: z.string().trim().max(191).nullable().optional(),
    postal_code: z.string().trim().max(20).nullable().optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    email: z.string().trim().email().max(191).nullable().optional(),
    timezone: z.string().trim().max(64).nullable().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export type OutletFullResponse = z.infer<typeof OutletFullResponseSchema>;
export type OutletCreateRequest = z.infer<typeof OutletCreateRequestSchema>;
export type OutletUpdateRequest = z.infer<typeof OutletUpdateRequestSchema>;
