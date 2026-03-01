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
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable()
});

export const CompanyCreateRequestSchema = z.object({
  code: CompanyCodeSchema,
  name: z.string().trim().min(1).max(191)
});

export const CompanyUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export type CompanyResponse = z.infer<typeof CompanyResponseSchema>;
export type CompanyCreateRequest = z.infer<typeof CompanyCreateRequestSchema>;
export type CompanyUpdateRequest = z.infer<typeof CompanyUpdateRequestSchema>;
