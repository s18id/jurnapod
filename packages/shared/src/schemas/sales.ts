import { z } from "zod";
import { DocumentStatusSchema, MoneySchema, NumericIdSchema } from "./common";

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const MoneyInputSchema = z.coerce.number().finite();
const MoneyInputNonNegativeSchema = MoneyInputSchema.pipe(
  MoneySchema.nonnegative()
);
const MoneyInputPositiveSchema = MoneyInputSchema.pipe(MoneySchema.positive());

const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const SalesInvoicePaymentStatusSchema = z.enum([
  "UNPAID",
  "PARTIAL",
  "PAID"
]);

export const SalesPaymentMethodSchema = z.enum(["CASH", "QRIS", "CARD"]);

export const SalesInvoiceLineInputSchema = z.object({
  description: z.string().trim().min(1).max(255),
  qty: z.coerce.number().finite().positive(),
  unit_price: MoneyInputNonNegativeSchema
});

export const SalesInvoiceTaxInputSchema = z.object({
  tax_rate_id: NumericIdSchema,
  amount: MoneyInputNonNegativeSchema
});

export const SalesInvoiceCreateRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  invoice_no: z.string().trim().min(1).max(64),
  invoice_date: DateOnlySchema,
  tax_amount: MoneyInputNonNegativeSchema.default(0),
  lines: z.array(SalesInvoiceLineInputSchema).min(1),
  taxes: z.array(SalesInvoiceTaxInputSchema).optional()
});

export const SalesInvoiceUpdateRequestSchema = z
  .object({
    outlet_id: NumericIdSchema.optional(),
    invoice_no: z.string().trim().min(1).max(64).optional(),
    invoice_date: DateOnlySchema.optional(),
    tax_amount: MoneyInputNonNegativeSchema.optional(),
    lines: z.array(SalesInvoiceLineInputSchema).min(1).optional(),
    taxes: z.array(SalesInvoiceTaxInputSchema).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const SalesInvoiceLineSchema = z.object({
  id: NumericIdSchema,
  invoice_id: NumericIdSchema,
  line_no: z.coerce.number().int().positive(),
  description: z.string().min(1),
  qty: z.number().finite().positive(),
  unit_price: MoneySchema.nonnegative(),
  line_total: MoneySchema.nonnegative()
});

export const SalesInvoiceTaxLineSchema = z.object({
  id: NumericIdSchema,
  invoice_id: NumericIdSchema,
  tax_rate_id: NumericIdSchema,
  amount: MoneySchema.nonnegative()
});

export const SalesInvoiceSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  invoice_no: z.string().min(1),
  invoice_date: DateOnlySchema,
  status: DocumentStatusSchema,
  payment_status: SalesInvoicePaymentStatusSchema,
  subtotal: MoneySchema.nonnegative(),
  tax_amount: MoneySchema.nonnegative(),
  grand_total: MoneySchema.nonnegative(),
  paid_total: MoneySchema.nonnegative(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const SalesInvoiceDetailSchema = SalesInvoiceSchema.extend({
  lines: z.array(SalesInvoiceLineSchema),
  taxes: z.array(SalesInvoiceTaxLineSchema).default([])
});

export const SalesInvoiceResponseSchema = SalesInvoiceDetailSchema;

export const SalesInvoiceListQuerySchema = PaginationQuerySchema.extend({
  outlet_id: NumericIdSchema.optional(),
  status: DocumentStatusSchema.optional(),
  payment_status: SalesInvoicePaymentStatusSchema.optional(),
  date_from: DateOnlySchema.optional(),
  date_to: DateOnlySchema.optional()
});

export const SalesPaymentCreateRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  invoice_id: NumericIdSchema,
  payment_no: z.string().trim().min(1).max(64),
  payment_at: z.string().datetime(),
  account_id: NumericIdSchema,
  method: SalesPaymentMethodSchema.optional(), // deprecated, kept for backward compat
  amount: MoneyInputPositiveSchema
});

export const SalesPaymentUpdateRequestSchema = z
  .object({
    outlet_id: NumericIdSchema.optional(),
    invoice_id: NumericIdSchema.optional(),
    payment_no: z.string().trim().min(1).max(64).optional(),
    payment_at: z.string().datetime().optional(),
    account_id: NumericIdSchema.optional(),
    method: SalesPaymentMethodSchema.optional(), // deprecated
    amount: MoneyInputPositiveSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const SalesPaymentSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  invoice_id: NumericIdSchema,
  payment_no: z.string().min(1),
  payment_at: z.string().datetime(),
  account_id: NumericIdSchema,
  account_name: z.string().optional(), // joined from accounts table
  method: SalesPaymentMethodSchema.optional(), // deprecated
  status: DocumentStatusSchema,
  amount: MoneySchema.positive(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const SalesPaymentResponseSchema = SalesPaymentSchema;

export const SalesPaymentListQuerySchema = PaginationQuerySchema.extend({
  outlet_id: NumericIdSchema.optional(),
  status: DocumentStatusSchema.optional(),
  date_from: DateOnlySchema.optional(),
  date_to: DateOnlySchema.optional()
});

export type SalesInvoicePaymentStatus = z.infer<
  typeof SalesInvoicePaymentStatusSchema
>;
export type SalesPaymentMethod = z.infer<typeof SalesPaymentMethodSchema>;
export type SalesInvoiceCreateRequest = z.infer<
  typeof SalesInvoiceCreateRequestSchema
>;
export type SalesInvoiceUpdateRequest = z.infer<
  typeof SalesInvoiceUpdateRequestSchema
>;
export type SalesInvoiceLine = z.infer<typeof SalesInvoiceLineSchema>;
export type SalesInvoice = z.infer<typeof SalesInvoiceSchema>;
export type SalesInvoiceDetail = z.infer<typeof SalesInvoiceDetailSchema>;
export type SalesInvoiceResponse = z.infer<typeof SalesInvoiceResponseSchema>;
export type SalesInvoiceListQuery = z.infer<typeof SalesInvoiceListQuerySchema>;
export type SalesPaymentCreateRequest = z.infer<
  typeof SalesPaymentCreateRequestSchema
>;
export type SalesPaymentUpdateRequest = z.infer<
  typeof SalesPaymentUpdateRequestSchema
>;
export type SalesPayment = z.infer<typeof SalesPaymentSchema>;
export type SalesPaymentResponse = z.infer<typeof SalesPaymentResponseSchema>;
export type SalesPaymentListQuery = z.infer<typeof SalesPaymentListQuerySchema>;
