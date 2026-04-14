// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common.js";

export const OutletTableStatusSchema = z.enum(["AVAILABLE", "RESERVED", "OCCUPIED", "UNAVAILABLE"]);

export const OutletTableOperationalStatusSchema = z.enum(["AVAILABLE", "UNAVAILABLE"]);

export const OutletTableStatusIdSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(5),
  z.literal(7)
]);

export const OutletTableOperationalStatusIdSchema = z.union([
  z.literal(1),
  z.literal(7)
]);

export const OutletTableCreateRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  zone: z.string().trim().max(64).nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  status: OutletTableOperationalStatusSchema.optional(),
  status_id: OutletTableOperationalStatusIdSchema.optional()
});

export const OutletTableBulkCreateRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  code_template: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .refine((value) => value.includes("{seq}"), {
      message: "code_template must include {seq}"
    }),
  name_template: z
    .string()
    .trim()
    .min(1)
    .max(191)
    .refine((value) => value.includes("{seq}"), {
      message: "name_template must include {seq}"
    }),
  start_seq: z.number().int().min(1).max(999999),
  count: z.number().int().min(1).max(200),
  zone: z.string().trim().max(64).nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  status: OutletTableOperationalStatusSchema.optional(),
  status_id: OutletTableOperationalStatusIdSchema.optional()
});

export const OutletTableUpdateRequestSchema = z.object({
  code: z.string().trim().min(1).max(32).optional(),
  name: z.string().trim().min(1).max(191).optional(),
  zone: z.string().trim().max(64).nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  status: OutletTableOperationalStatusSchema.optional(),
  status_id: OutletTableOperationalStatusIdSchema.optional()
});

export const OutletTableResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  code: z.string(),
  name: z.string(),
  zone: z.string().nullable(),
  capacity: z.number().int().positive().nullable(),
  status: OutletTableStatusSchema,
  status_id: OutletTableStatusIdSchema,
  created_at: z.string(),
  updated_at: z.string()
});

export type OutletTableStatus = z.infer<typeof OutletTableStatusSchema>;
export type OutletTableOperationalStatus = z.infer<typeof OutletTableOperationalStatusSchema>;
export type OutletTableCreateRequest = z.infer<typeof OutletTableCreateRequestSchema>;
export type OutletTableBulkCreateRequest = z.infer<typeof OutletTableBulkCreateRequestSchema>;
export type OutletTableUpdateRequest = z.infer<typeof OutletTableUpdateRequestSchema>;
export type OutletTableResponse = z.infer<typeof OutletTableResponseSchema>;
