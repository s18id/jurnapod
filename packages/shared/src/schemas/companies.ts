import { z } from "zod";
import { NumericIdSchema } from "./common";

export const CompanyResponseSchema = z.object({
  id: NumericIdSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const CompanyCreateRequestSchema = z.object({
  code: z.string().trim().min(1).max(32),
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
