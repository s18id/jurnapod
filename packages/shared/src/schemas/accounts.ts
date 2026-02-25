import { z } from "zod";
import { NumericIdSchema } from "./common";

/**
 * Account Type Names
 * Standard accounting account types for financial reporting
 * Note: The database allows any string value (VARCHAR(191))
 */
export const AccountTypeSchema = z.enum([
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE"
]);

/**
 * Account Type Name (flexible string for backward compatibility)
 * Allows any string value since existing data uses Indonesian names
 */
const AccountTypeNameSchema = z.string().max(191).nullable();

/**
 * Normal Balance
 * D = Debit, K = Kredit (Credit in Indonesian)
 */
export const NormalBalanceSchema = z.enum(["D", "K"]);

/**
 * Report Group
 * NRC = Neraca (Balance Sheet in Indonesian)
 * LR = Laba Rugi (Income Statement/P&L in Indonesian)
 */
export const ReportGroupSchema = z.enum(["NRC", "LR"]);

/**
 * Account Code Schema
 * Alphanumeric with dash/underscore, 1-32 characters
 */
const AccountCodeSchema = z
  .string()
  .trim()
  .min(1, "Account code is required")
  .max(32, "Account code must not exceed 32 characters")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Account code must contain only alphanumeric characters, dash, or underscore"
  );

/**
 * Account Name Schema
 * 1-191 characters
 */
const AccountNameSchema = z
  .string()
  .trim()
  .min(1, "Account name is required")
  .max(191, "Account name must not exceed 191 characters");

/**
 * Full Account Entity Response
 * Contains all fields from the database
 * Note: Includes both old (type_name, normal_balance, report_group) and new (account_type_id) fields
 */
export const AccountResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  code: AccountCodeSchema,
  name: AccountNameSchema,
  account_type_id: NumericIdSchema.nullable(),
  type_name: AccountTypeNameSchema, // Legacy field, kept for backward compatibility
  normal_balance: NormalBalanceSchema.nullable(), // Legacy field
  report_group: ReportGroupSchema.nullable(), // Legacy field
  parent_account_id: NumericIdSchema.nullable(),
  is_group: z.boolean(),
  is_payable: z.boolean(),
  is_active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

/**
 * Account Create Request
 * For creating new accounts
 * Supports both new (account_type_id) and legacy (type_name/normal_balance/report_group) fields
 */
export const AccountCreateRequestSchema = z.object({
  company_id: NumericIdSchema,
  code: AccountCodeSchema,
  name: AccountNameSchema,
  account_type_id: NumericIdSchema.optional().nullable(),
  type_name: AccountTypeNameSchema.optional(), // Legacy field
  normal_balance: NormalBalanceSchema.optional().nullable(), // Legacy field
  report_group: ReportGroupSchema.optional().nullable(), // Legacy field
  parent_account_id: NumericIdSchema.optional().nullable(),
  is_group: z.boolean().default(false),
  is_payable: z.boolean().optional().default(false),
  is_active: z.boolean().default(true)
});

/**
 * Account Update Request
 * For updating existing accounts (partial updates allowed)
 * Supports both new (account_type_id) and legacy fields
 */
export const AccountUpdateRequestSchema = z
  .object({
    code: AccountCodeSchema.optional(),
    name: AccountNameSchema.optional(),
    account_type_id: NumericIdSchema.optional().nullable(),
    type_name: AccountTypeNameSchema.optional(), // Legacy field
    normal_balance: NormalBalanceSchema.optional().nullable(), // Legacy field
    report_group: ReportGroupSchema.optional().nullable(), // Legacy field
    parent_account_id: NumericIdSchema.optional().nullable(),
    is_group: z.boolean().optional(),
    is_payable: z.boolean().optional(),
    is_active: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update"
  });

/**
 * Account List Query Parameters
 * For filtering and searching accounts
 */
export const AccountListQuerySchema = z.object({
  company_id: NumericIdSchema,
  is_active: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined || val === "") return undefined;
      return val === "true" || val === "1";
    }),
  is_payable: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined || val === "") return undefined;
      return val === "true" || val === "1";
    }),
  report_group: ReportGroupSchema.optional(),
  parent_account_id: NumericIdSchema.optional().nullable(),
  search: z.string().trim().optional(),
  include_children: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined || val === "") return false;
      return val === "true" || val === "1";
    })
    .default("false")
});

/**
 * Account Tree Node
 * For hierarchical account responses (e.g., parent-child structure)
 * Extends AccountResponse with a children array
 */
export const AccountTreeNodeSchema: z.ZodType<{
  id: number;
  company_id: number;
  code: string;
  name: string;
  account_type_id: number | null;
  type_name: string | null;
  normal_balance: "D" | "K" | null;
  report_group: "NRC" | "LR" | null;
  parent_account_id: number | null;
  is_group: boolean;
  is_payable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  children: Array<any>;
}> = z.lazy(() =>
  AccountResponseSchema.extend({
    children: z.array(AccountTreeNodeSchema)
  })
);

/**
 * Exported TypeScript Types
 */
export type AccountType = z.infer<typeof AccountTypeSchema>;
export type AccountTypeName = string | null; // Flexible type for backward compatibility
export type NormalBalance = z.infer<typeof NormalBalanceSchema>;
export type ReportGroup = z.infer<typeof ReportGroupSchema>;
export type AccountResponse = z.infer<typeof AccountResponseSchema>;
export type AccountCreateRequest = z.infer<typeof AccountCreateRequestSchema>;
export type AccountUpdateRequest = z.infer<typeof AccountUpdateRequestSchema>;
export type AccountListQuery = z.infer<typeof AccountListQuerySchema>;
export type AccountTreeNode = z.infer<typeof AccountTreeNodeSchema>;
