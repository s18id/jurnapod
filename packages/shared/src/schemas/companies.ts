// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common";

export const CompanyCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Z0-9_-]+$/);

export const CompanyResponseSchema = z.object({
  id: NumericIdSchema,
  code: CompanyCodeSchema,
  name: z.string().trim().min(1).max(191),
  legal_name: z.string().trim().max(191).nullable(),
  tax_id: z.string().trim().max(64).nullable(),
  email: z.string().trim().email().max(191).nullable(),
  phone: z.string().trim().max(32).nullable(),
  timezone: z.string().trim().max(50).nullable(),
  currency_code: z.string().trim().max(3).nullable(),
  address_line1: z.string().trim().max(191).nullable(),
  address_line2: z.string().trim().max(191).nullable(),
  city: z.string().trim().max(96).nullable(),
  postal_code: z.string().trim().max(20).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable()
});

export const CompanyCreateRequestSchema = z.object({
  code: CompanyCodeSchema,
  name: z.string().trim().min(1).max(191),
  legal_name: z.string().trim().max(191).optional(),
  tax_id: z.string().trim().max(64).optional(),
  email: z.string().trim().email().max(191).optional().nullable(),
  phone: z.string().trim().max(32).optional(),
  timezone: z.string().trim().max(50).optional().nullable(),
  currency_code: z.string().trim().max(3).optional().nullable(),
  address_line1: z.string().trim().max(191).optional(),
  address_line2: z.string().trim().max(191).optional(),
  city: z.string().trim().max(96).optional(),
  postal_code: z.string().trim().max(20).optional()
});

export const CompanyUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional(),
    legal_name: z.string().trim().max(191).nullable().optional(),
    tax_id: z.string().trim().max(64).nullable().optional(),
    email: z.string().trim().email().max(191).nullable().optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    timezone: z.string().trim().max(50).nullable().optional(),
    currency_code: z.string().trim().max(3).nullable().optional(),
    address_line1: z.string().trim().max(191).nullable().optional(),
    address_line2: z.string().trim().max(191).nullable().optional(),
    city: z.string().trim().max(96).nullable().optional(),
    postal_code: z.string().trim().max(20).nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export type CompanyResponse = z.infer<typeof CompanyResponseSchema>;
export type CompanyCreateRequest = z.infer<typeof CompanyCreateRequestSchema>;
export type CompanyUpdateRequest = z.infer<typeof CompanyUpdateRequestSchema>;
