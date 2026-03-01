// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common";

export const OutletFullResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const OutletCreateRequestSchema = z.object({
  company_id: NumericIdSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191)
});

export const OutletUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export type OutletFullResponse = z.infer<typeof OutletFullResponseSchema>;
export type OutletCreateRequest = z.infer<typeof OutletCreateRequestSchema>;
export type OutletUpdateRequest = z.infer<typeof OutletUpdateRequestSchema>;
