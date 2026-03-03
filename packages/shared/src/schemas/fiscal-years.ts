// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common";

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const FiscalYearStatusSchema = z.enum(["OPEN", "CLOSED"]);

const FiscalYearCodeSchema = z
  .string()
  .trim()
  .min(1, "Fiscal year code is required")
  .max(32, "Fiscal year code must not exceed 32 characters")
  .regex(/^[a-zA-Z0-9_-]+$/, "Fiscal year code must contain only letters, numbers, dash, or underscore");

const FiscalYearNameSchema = z
  .string()
  .trim()
  .min(1, "Fiscal year name is required")
  .max(191, "Fiscal year name must not exceed 191 characters");

export const FiscalYearCreateRequestSchema = z.object({
  company_id: NumericIdSchema,
  code: FiscalYearCodeSchema,
  name: FiscalYearNameSchema,
  start_date: DateOnlySchema,
  end_date: DateOnlySchema,
  status: FiscalYearStatusSchema.optional()
});

export const FiscalYearUpdateRequestSchema = z
  .object({
    code: FiscalYearCodeSchema.optional(),
    name: FiscalYearNameSchema.optional(),
    start_date: DateOnlySchema.optional(),
    end_date: DateOnlySchema.optional(),
    status: FiscalYearStatusSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const FiscalYearListQuerySchema = z.object({
  company_id: NumericIdSchema,
  status: FiscalYearStatusSchema.optional(),
  include_closed: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined || val === "") return false;
      return val === "true" || val === "1";
    })
    .default("false")
});

export const FiscalYearSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  code: FiscalYearCodeSchema,
  name: FiscalYearNameSchema,
  start_date: DateOnlySchema,
  end_date: DateOnlySchema,
  status: FiscalYearStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type FiscalYearStatus = z.infer<typeof FiscalYearStatusSchema>;
export type FiscalYearCreateRequest = z.infer<typeof FiscalYearCreateRequestSchema>;
export type FiscalYearUpdateRequest = z.infer<typeof FiscalYearUpdateRequestSchema>;
export type FiscalYearListQuery = z.infer<typeof FiscalYearListQuerySchema>;
export type FiscalYear = z.infer<typeof FiscalYearSchema>;
