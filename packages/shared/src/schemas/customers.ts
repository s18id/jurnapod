// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common.js";
import { CUSTOMER_TYPE } from "../constants/customers.js";

/**
 * Customer type enum - PERSON or BUSINESS
 *
 * Accepts:
 *   - Integer: 1 (PERSON), 2 (BUSINESS) — DB storage format
 *   - String: "PERSON", "BUSINESS" — API convenience format
 * Always transforms to the domain string "PERSON" | "BUSINESS".
 */
const _customerTypeNumber = z.number().int().min(1).max(2);
const _customerTypeString = z.enum(["PERSON", "BUSINESS"]);

export const CustomerTypeSchema = z.union([_customerTypeNumber, _customerTypeString]).transform(
  (val): "PERSON" | "BUSINESS" => {
    if (val === "PERSON" || val === CUSTOMER_TYPE.PERSON) return "PERSON";
    if (val === "BUSINESS" || val === CUSTOMER_TYPE.BUSINESS) return "BUSINESS";
    throw new Error(`Invalid customer type: ${val}`);
  }
);

/**
 * Email schema - optional, validated
 */
const EmailSchema = z.string().trim().email().max(191).nullable().optional();

/**
 * Phone schema - optional
 */
const PhoneSchema = z.string().trim().max(32).nullable().optional();

/**
 * Customer create request schema
 */
export const CustomerCreateRequestSchema = z.object({
  company_id: NumericIdSchema,
  code: z.string().trim().min(1).max(32),
  type: CustomerTypeSchema,
  display_name: z.string().trim().min(1).max(191),
  company_name: z.string().trim().max(191).nullable().optional(),
  tax_id: z.string().trim().max(64).nullable().optional(),
  email: EmailSchema,
  phone: PhoneSchema,
  address_line1: z.string().trim().max(191).nullable().optional(),
  address_line2: z.string().trim().max(191).nullable().optional(),
  city: z.string().trim().max(96).nullable().optional(),
  postal_code: z.string().trim().max(20).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional()
});

/**
 * Customer update request schema
 */
export const CustomerUpdateRequestSchema = z
  .object({
    type: CustomerTypeSchema.optional(),
    display_name: z.string().trim().min(1).max(191).optional(),
    company_name: z.string().trim().max(191).nullable().optional(),
    tax_id: z.string().trim().max(64).nullable().optional(),
    email: EmailSchema,
    phone: PhoneSchema,
    address_line1: z.string().trim().max(191).nullable().optional(),
    address_line2: z.string().trim().max(191).nullable().optional(),
    city: z.string().trim().max(96).nullable().optional(),
    postal_code: z.string().trim().max(20).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

/**
 * Customer response schema
 */
export const CustomerResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  code: z.string().trim().min(1).max(32),
  type: CustomerTypeSchema,
  display_name: z.string().trim().min(1).max(191),
  company_name: z.string().trim().max(191).nullable(),
  tax_id: z.string().trim().max(64).nullable(),
  email: z.string().trim().email().max(191).nullable(),
  phone: z.string().trim().max(32).nullable(),
  address_line1: z.string().trim().max(191).nullable(),
  address_line2: z.string().trim().max(191).nullable(),
  city: z.string().trim().max(96).nullable(),
  postal_code: z.string().trim().max(20).nullable(),
  notes: z.string().trim().max(1000).nullable(),
  is_active: z.boolean(),
  created_by_user_id: NumericIdSchema.nullable(),
  updated_by_user_id: NumericIdSchema.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

/**
 * Customer list query schema
 */
export const CustomerListQuerySchema = z.object({
  company_id: NumericIdSchema,
  is_active: z.boolean().optional(),
  search: z.string().trim().max(191).optional(),
  type: CustomerTypeSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0)
});

// Type exports
export type CustomerType = z.infer<typeof CustomerTypeSchema>;
export type CustomerCreateRequest = z.infer<typeof CustomerCreateRequestSchema>;
export type CustomerUpdateRequest = z.infer<typeof CustomerUpdateRequestSchema>;
export type CustomerResponse = z.infer<typeof CustomerResponseSchema>;
export type CustomerListQuery = z.infer<typeof CustomerListQuerySchema>;