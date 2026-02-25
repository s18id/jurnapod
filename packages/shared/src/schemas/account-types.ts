import { z } from "zod";
import { NumericIdSchema } from "./common";
import { NormalBalanceSchema, ReportGroupSchema, AccountTypeSchema } from "./accounts";

/**
 * Account Type Entity Response
 * Represents an account type/category with its properties
 */
export const AccountTypeResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  name: z.string().min(1).max(191),
  category: AccountTypeSchema.nullable(),
  normal_balance: NormalBalanceSchema.nullable(),
  report_group: ReportGroupSchema.nullable(),
  is_active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

/**
 * Account Type Create Request
 */
export const AccountTypeCreateRequestSchema = z.object({
  company_id: NumericIdSchema,
  name: z.string().trim().min(1).max(191),
  category: AccountTypeSchema.optional().nullable(),
  normal_balance: NormalBalanceSchema.optional().nullable(),
  report_group: ReportGroupSchema.optional().nullable(),
  is_active: z.boolean().default(true)
});

/**
 * Account Type Update Request
 */
export const AccountTypeUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional(),
    category: AccountTypeSchema.optional().nullable(),
    normal_balance: NormalBalanceSchema.optional().nullable(),
    report_group: ReportGroupSchema.optional().nullable(),
    is_active: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update"
  });

/**
 * Account Type List Query
 */
export const AccountTypeListQuerySchema = z.object({
  company_id: NumericIdSchema,
  category: AccountTypeSchema.optional(),
  is_active: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1")
    .or(z.boolean())
    .optional(),
  search: z.string().optional()
});

/**
 * Exported TypeScript Types
 */
export type AccountTypeResponse = z.infer<typeof AccountTypeResponseSchema>;
export type AccountTypeCreateRequest = z.infer<typeof AccountTypeCreateRequestSchema>;
export type AccountTypeUpdateRequest = z.infer<typeof AccountTypeUpdateRequestSchema>;
export type AccountTypeListQuery = z.infer<typeof AccountTypeListQuerySchema>;
