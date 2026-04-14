// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { DocumentStatusSchema, MoneySchema, NumericIdSchema } from "./common.js";
import { DateOnlySchema } from "./datetime.js";

// Money helpers for cent-exact validation
const MONEY_SCALE = 100;

function toMinorUnits(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

function hasMoreThanTwoDecimals(value: number): boolean {
  const str = value.toFixed(10);
  const decimalPart = str.split(".")[1];
  if (!decimalPart) return false;
  // Check if any digit beyond 2nd decimal place is non-zero
  return decimalPart.slice(2).split("").some((d) => d !== "0");
}

const MoneyInputSchema = z.coerce.number().finite();
const MoneyInputNonNegativeSchema = MoneyInputSchema.pipe(
  MoneySchema.nonnegative()
);
const MoneyInputPositiveSchema = MoneyInputSchema.pipe(MoneySchema.positive());

const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const SalesInvoiceStatusSchema = z.enum([
  "DRAFT",
  "APPROVED",
  "POSTED",
  "VOID"
]);

export const SalesInvoicePaymentStatusSchema = z.enum([
  "UNPAID",
  "PARTIAL",
  "PAID"
]);

export const SalesInvoiceDueTermSchema = z.enum([
  "NET_0",
  "NET_7",
  "NET_14",
  "NET_15",
  "NET_20",
  "NET_30",
  "NET_45",
  "NET_60",
  "NET_90"
]);

export const SalesLineTypeSchema = z.enum(["SERVICE", "PRODUCT"]).default("SERVICE");

export const SalesPaymentMethodSchema = z.enum(["CASH", "QRIS", "CARD"]);

export const SalesInvoiceLineInputSchema = z.object({
  line_type: SalesLineTypeSchema,
  item_id: NumericIdSchema.optional(),
  description: z.string().trim().min(1).max(255),
  qty: z.coerce.number().finite().positive(),
  unit_price: MoneyInputNonNegativeSchema
}).refine((data) => {
  if (data.line_type === "PRODUCT") {
    return typeof data.item_id === "number" && data.item_id > 0;
  }
  return true;
}, {
  message: "Product lines require item_id",
  path: ["item_id"]
});

export const SalesInvoiceTaxInputSchema = z.object({
  tax_rate_id: NumericIdSchema,
  amount: MoneyInputNonNegativeSchema
});

export const SalesInvoiceCreateRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  client_ref: z.string().uuid().optional(),
  invoice_no: z.string().trim().min(1).max(64).optional(),
  invoice_date: DateOnlySchema,
  due_date: DateOnlySchema.optional(),
  due_term: SalesInvoiceDueTermSchema.optional(),
  tax_amount: MoneyInputNonNegativeSchema.default(0),
  lines: z.array(SalesInvoiceLineInputSchema).min(1),
  taxes: z.array(SalesInvoiceTaxInputSchema).optional(),
  draft: z.boolean().optional()
});

export const SalesInvoiceUpdateRequestSchema = z
  .object({
    outlet_id: NumericIdSchema.optional(),
    invoice_no: z.string().trim().min(1).max(64).optional(),
    invoice_date: DateOnlySchema.optional(),
    due_date: DateOnlySchema.optional(),
    due_term: SalesInvoiceDueTermSchema.optional(),
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
  line_type: z.enum(["SERVICE", "PRODUCT"]),
  item_id: NumericIdSchema.nullable(),
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
  client_ref: z.string().uuid().nullable().optional(),
  invoice_date: DateOnlySchema,
  due_date: DateOnlySchema.nullable().optional(),
  status: SalesInvoiceStatusSchema,
  payment_status: SalesInvoicePaymentStatusSchema,
  subtotal: MoneySchema.nonnegative(),
  tax_amount: MoneySchema.nonnegative(),
  grand_total: MoneySchema.nonnegative(),
  paid_total: MoneySchema.nonnegative(),
  approved_by_user_id: NumericIdSchema.nullable().optional(),
  approved_at: z.string().datetime().nullable().optional(),
  created_by_user_id: NumericIdSchema.nullable().optional(),
  updated_by_user_id: NumericIdSchema.nullable().optional(),
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
  status: SalesInvoiceStatusSchema.optional(),
  payment_status: SalesInvoicePaymentStatusSchema.optional(),
  date_from: DateOnlySchema.optional(),
  date_to: DateOnlySchema.optional(),
  timezone: z.string().trim().max(64).optional()
});

// Phase 8: Payment split input schema
export const SalesPaymentSplitInputSchema = z.object({
  account_id: NumericIdSchema,
  amount: MoneyInputPositiveSchema.refine(
    (val) => !hasMoreThanTwoDecimals(val),
    { message: "Split amount must have at most 2 decimal places" }
  )
});

export const SalesPaymentCreateRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  invoice_id: NumericIdSchema,
  client_ref: z.string().uuid().optional(),
  payment_no: z.string().trim().min(1).max(64).optional(),
  payment_at: z.string().datetime(),
  account_id: NumericIdSchema.optional(),
  method: SalesPaymentMethodSchema.optional(),
  amount: MoneyInputPositiveSchema.refine(
    (val) => !hasMoreThanTwoDecimals(val),
    { message: "Amount must have at most 2 decimal places" }
  ),
  actual_amount_idr: MoneyInputPositiveSchema.optional().refine(
    (val) => val === undefined || !hasMoreThanTwoDecimals(val),
    { message: "Actual amount must have at most 2 decimal places" }
  ),
  splits: z.array(SalesPaymentSplitInputSchema).min(1).max(10).optional()
}).refine((data) => {
  // Either account_id or splits must be provided, not both ambiguously
  if (data.splits && data.splits.length > 0) {
    // If splits provided, account_id is optional but must match first split if provided
    if (data.account_id !== undefined) {
      return data.account_id === data.splits[0].account_id;
    }
    return true;
  }
  // No splits: account_id is required
  return data.account_id !== undefined;
}, {
  message: "Either account_id or splits must be provided. If both, account_id must equal splits[0].account_id",
  path: ["account_id"]
}).refine((data) => {
  // Cent-exact validation: sum of splits must equal total amount
  if (data.splits && data.splits.length > 0) {
    const splitSumMinor = data.splits.reduce((sum, split) => sum + toMinorUnits(split.amount), 0);
    const amountMinor = toMinorUnits(data.amount);
    return splitSumMinor === amountMinor;
  }
  return true;
}, {
  message: "Sum of split amounts must equal payment amount",
  path: ["splits"]
}).refine((data) => {
  // Validate no duplicate account_ids in splits
  if (data.splits && data.splits.length > 0) {
    const accountIds = data.splits.map(s => s.account_id);
    return new Set(accountIds).size === accountIds.length;
  }
  return true;
}, {
  message: "Duplicate account_ids not allowed in splits",
  path: ["splits"]
}).refine((data) => {
  // When splits are provided, actual_amount_idr must equal amount (same minor units)
  if (data.splits && data.splits.length > 0 && data.actual_amount_idr !== undefined) {
    return toMinorUnits(data.actual_amount_idr) === toMinorUnits(data.amount);
  }
  return true;
}, {
  message: "When splits are provided, actual_amount_idr must equal amount",
  path: ["actual_amount_idr"]
});

export const SalesPaymentUpdateRequestSchema = z
  .object({
    outlet_id: NumericIdSchema.optional(),
    invoice_id: NumericIdSchema.optional(),
    payment_no: z.string().trim().min(1).max(64).optional(),
    payment_at: z.string().datetime().optional(),
    account_id: NumericIdSchema.optional(),
    method: SalesPaymentMethodSchema.optional(),
    amount: MoneyInputPositiveSchema.optional().refine(
      (val) => val === undefined || !hasMoreThanTwoDecimals(val),
      { message: "Amount must have at most 2 decimal places" }
    ),
    actual_amount_idr: MoneyInputPositiveSchema.optional().refine(
      (val) => val === undefined || !hasMoreThanTwoDecimals(val),
      { message: "Actual amount must have at most 2 decimal places" }
    ),
    splits: z.array(SalesPaymentSplitInputSchema).min(1).max(10).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  })
  .refine((data) => {
    // Cent-exact validation: sum of splits must equal amount
    if (data.splits && data.splits.length > 0 && data.amount !== undefined) {
      const splitSumMinor = data.splits.reduce((sum, split) => sum + toMinorUnits(split.amount), 0);
      const amountMinor = toMinorUnits(data.amount);
      return splitSumMinor === amountMinor;
    }
    return true;
  }, {
    message: "Sum of split amounts must equal payment amount",
    path: ["splits"]
  })
  .refine((data) => {
    // Validate no duplicate account_ids in splits
    if (data.splits && data.splits.length > 0) {
      const accountIds = data.splits.map(s => s.account_id);
      return new Set(accountIds).size === accountIds.length;
    }
    return true;
  }, {
    message: "Duplicate account_ids not allowed in splits",
    path: ["splits"]
  })
  .refine((data) => {
    // When splits are provided, actual_amount_idr must equal split total (same minor units)
    if (data.splits && data.splits.length > 0 && data.actual_amount_idr !== undefined) {
      const expectedMinor = data.amount !== undefined
        ? toMinorUnits(data.amount)
        : data.splits.reduce((sum, split) => sum + toMinorUnits(split.amount), 0);
      return toMinorUnits(data.actual_amount_idr) === expectedMinor;
    }
    return true;
  }, {
    message: "When splits are provided, actual_amount_idr must equal amount",
    path: ["actual_amount_idr"]
  });

// Phase 8: Payment split response schema
export const SalesPaymentSplitSchema = z.object({
  id: NumericIdSchema,
  payment_id: NumericIdSchema,
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  split_index: z.number().int().min(0).max(9),
  account_id: NumericIdSchema,
  account_name: z.string().optional(),
  amount: MoneySchema.positive()
});

export const SalesPaymentSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  invoice_id: NumericIdSchema,
  payment_no: z.string().min(1),
  client_ref: z.string().uuid().nullable().optional(),
  payment_at: z.string().datetime(),
  account_id: NumericIdSchema,
  account_name: z.string().optional(),
  method: SalesPaymentMethodSchema.optional(),
  status: DocumentStatusSchema,
  amount: MoneySchema.positive(),
  actual_amount_idr: MoneySchema.nonnegative().nullable().optional(),
  invoice_amount_idr: MoneySchema.nonnegative().nullable().optional(),
  payment_amount_idr: MoneySchema.nonnegative().nullable().optional(),
  payment_delta_idr: MoneySchema.optional(),
  shortfall_settled_as_loss: z.boolean().optional(),
  shortfall_reason: z.string().max(500).nullable().optional(),
  shortfall_settled_by_user_id: NumericIdSchema.nullable().optional(),
  shortfall_settled_at: z.string().datetime().nullable().optional(),
  splits: z.array(SalesPaymentSplitSchema).optional(),
  created_by_user_id: NumericIdSchema.nullable().optional(),
  updated_by_user_id: NumericIdSchema.nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const SalesPaymentResponseSchema = SalesPaymentSchema;

export const SalesPaymentListQuerySchema = PaginationQuerySchema.extend({
  outlet_id: NumericIdSchema.optional(),
  status: DocumentStatusSchema.optional(),
  date_from: DateOnlySchema.optional(),
  date_to: DateOnlySchema.optional(),
  timezone: z.string().trim().max(64).optional()
});

export const SalesPaymentPostRequestSchema = z.object({
  settle_shortfall_as_loss: z.boolean().optional(),
  shortfall_reason: z.string().trim().min(1).max(500).optional()
}).refine((data) => {
  if (data.settle_shortfall_as_loss === true) {
    return typeof data.shortfall_reason === "string" && data.shortfall_reason.trim().length > 0;
  }
  return true;
}, {
  message: "shortfall_reason is required when settle_shortfall_as_loss is true",
  path: ["shortfall_reason"]
});

export type SalesPaymentPostRequest = z.infer<typeof SalesPaymentPostRequestSchema>;

export const SalesOrderStatusSchema = z.enum([
  "DRAFT",
  "CONFIRMED",
  "COMPLETED",
  "VOID"
]);

export const SalesOrderLineInputSchema = z.object({
  line_type: SalesLineTypeSchema,
  item_id: NumericIdSchema.optional(),
  description: z.string().trim().min(1).max(255),
  qty: z.coerce.number().finite().positive(),
  unit_price: MoneyInputNonNegativeSchema
}).refine((data) => {
  if (data.line_type === "PRODUCT") {
    return typeof data.item_id === "number" && data.item_id > 0;
  }
  return true;
}, {
  message: "Product lines require item_id",
  path: ["item_id"]
});

export const SalesOrderCreateRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  client_ref: z.string().uuid().optional(),
  order_no: z.string().trim().min(1).max(64).optional(),
  order_date: DateOnlySchema,
  expected_date: DateOnlySchema.optional(),
  notes: z.string().max(1000).optional(),
  lines: z.array(SalesOrderLineInputSchema).min(1)
});

export const SalesOrderUpdateRequestSchema = z
  .object({
    outlet_id: NumericIdSchema.optional(),
    order_no: z.string().trim().min(1).max(64).optional(),
    order_date: DateOnlySchema.optional(),
    expected_date: DateOnlySchema.optional(),
    notes: z.string().max(1000).optional(),
    lines: z.array(SalesOrderLineInputSchema).min(1).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const SalesOrderLineSchema = z.object({
  id: NumericIdSchema,
  order_id: NumericIdSchema,
  line_no: z.coerce.number().int().positive(),
  line_type: z.enum(["SERVICE", "PRODUCT"]),
  item_id: NumericIdSchema.nullable(),
  description: z.string().min(1),
  qty: z.number().finite().positive(),
  unit_price: MoneySchema.nonnegative(),
  line_total: MoneySchema.nonnegative()
});

export const SalesOrderSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  order_no: z.string().min(1),
  client_ref: z.string().uuid().nullable().optional(),
  order_date: DateOnlySchema,
  expected_date: DateOnlySchema.nullable(),
  status: SalesOrderStatusSchema,
  notes: z.string().nullable(),
  subtotal: MoneySchema.nonnegative(),
  tax_amount: MoneySchema.nonnegative(),
  grand_total: MoneySchema.nonnegative(),
  confirmed_by_user_id: NumericIdSchema.nullable().optional(),
  confirmed_at: z.string().datetime().nullable().optional(),
  completed_by_user_id: NumericIdSchema.nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  created_by_user_id: NumericIdSchema.nullable().optional(),
  updated_by_user_id: NumericIdSchema.nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const SalesOrderDetailSchema = SalesOrderSchema.extend({
  lines: z.array(SalesOrderLineSchema)
});

export const SalesOrderResponseSchema = SalesOrderDetailSchema;

export const SalesOrderListQuerySchema = PaginationQuerySchema.extend({
  outlet_id: NumericIdSchema.optional(),
  status: SalesOrderStatusSchema.optional(),
  date_from: DateOnlySchema.optional(),
  date_to: DateOnlySchema.optional(),
  timezone: z.string().trim().max(64).optional()
});

export const SalesCreditNoteStatusSchema = z.enum(["DRAFT", "POSTED", "VOID"]);

export const SalesCreditNoteLineInputSchema = z.object({
  description: z.string().trim().min(1).max(255),
  qty: z.coerce.number().finite().positive(),
  unit_price: MoneyInputNonNegativeSchema
});

export const SalesCreditNoteCreateRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  invoice_id: NumericIdSchema,
  credit_note_date: DateOnlySchema,
  client_ref: z.string().uuid().optional(),
  reason: z.string().max(1000).optional(),
  notes: z.string().max(1000).optional(),
  amount: MoneyInputPositiveSchema,
  lines: z.array(SalesCreditNoteLineInputSchema).min(1)
});

export const SalesCreditNoteUpdateRequestSchema = z
  .object({
    credit_note_date: DateOnlySchema.optional(),
    reason: z.string().max(1000).optional(),
    notes: z.string().max(1000).optional(),
    amount: MoneyInputPositiveSchema.optional(),
    lines: z.array(SalesCreditNoteLineInputSchema).min(1).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const SalesCreditNoteLineSchema = z.object({
  id: NumericIdSchema,
  credit_note_id: NumericIdSchema,
  line_no: z.coerce.number().int().positive(),
  description: z.string().min(1),
  qty: z.number().finite().positive(),
  unit_price: MoneySchema.nonnegative(),
  line_total: MoneySchema.nonnegative()
});

export const SalesCreditNoteSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  invoice_id: NumericIdSchema,
  credit_note_no: z.string().min(1),
  credit_note_date: DateOnlySchema,
  client_ref: z.string().uuid().nullable(),
  status: SalesCreditNoteStatusSchema,
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  amount: MoneySchema.nonnegative(),
  created_by_user_id: NumericIdSchema.nullable(),
  updated_by_user_id: NumericIdSchema.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const SalesCreditNoteDetailSchema = SalesCreditNoteSchema.extend({
  lines: z.array(SalesCreditNoteLineSchema)
});

export const SalesCreditNoteResponseSchema = SalesCreditNoteDetailSchema;

export const SalesCreditNoteListQuerySchema = PaginationQuerySchema.extend({
  outlet_id: NumericIdSchema.optional(),
  invoice_id: NumericIdSchema.optional(),
  status: SalesCreditNoteStatusSchema.optional(),
  date_from: DateOnlySchema.optional(),
  date_to: DateOnlySchema.optional(),
  timezone: z.string().trim().max(64).optional()
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
export type SalesInvoiceStatus = z.infer<typeof SalesInvoiceStatusSchema>;
export type SalesPaymentCreateRequest = z.infer<
  typeof SalesPaymentCreateRequestSchema
>;
export type SalesPaymentUpdateRequest = z.infer<
  typeof SalesPaymentUpdateRequestSchema
>;
export type SalesPayment = z.infer<typeof SalesPaymentSchema>;
export type SalesPaymentResponse = z.infer<typeof SalesPaymentResponseSchema>;
export type SalesPaymentListQuery = z.infer<typeof SalesPaymentListQuerySchema>;
export type SalesOrderStatus = z.infer<typeof SalesOrderStatusSchema>;
export type SalesOrderCreateRequest = z.infer<typeof SalesOrderCreateRequestSchema>;
export type SalesOrderUpdateRequest = z.infer<typeof SalesOrderUpdateRequestSchema>;
export type SalesOrderLine = z.infer<typeof SalesOrderLineSchema>;
export type SalesOrder = z.infer<typeof SalesOrderSchema>;
export type SalesOrderDetail = z.infer<typeof SalesOrderDetailSchema>;
export type SalesOrderResponse = z.infer<typeof SalesOrderResponseSchema>;
export type SalesOrderListQuery = z.infer<typeof SalesOrderListQuerySchema>;
export type SalesCreditNoteStatus = z.infer<typeof SalesCreditNoteStatusSchema>;
export type SalesCreditNoteCreateRequest = z.infer<typeof SalesCreditNoteCreateRequestSchema>;
export type SalesCreditNoteUpdateRequest = z.infer<typeof SalesCreditNoteUpdateRequestSchema>;
export type SalesCreditNoteLine = z.infer<typeof SalesCreditNoteLineSchema>;
export type SalesCreditNote = z.infer<typeof SalesCreditNoteSchema>;
export type SalesCreditNoteDetail = z.infer<typeof SalesCreditNoteDetailSchema>;
export type SalesCreditNoteResponse = z.infer<typeof SalesCreditNoteResponseSchema>;
export type SalesCreditNoteListQuery = z.infer<typeof SalesCreditNoteListQuerySchema>;
export type SalesLineType = z.infer<typeof SalesLineTypeSchema>;
