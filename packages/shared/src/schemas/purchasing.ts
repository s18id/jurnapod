// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common.js";
import {
  PURCHASE_ORDER_STATUS_VALUES,
  PURCHASE_INVOICE_STATUS_VALUES,
  AP_PAYMENT_STATUS_VALUES,
  PURCHASE_CREDIT_STATUS_VALUES
} from "../constants/purchasing.js";
import { PURCHASING_AP_TRANSACTION_TYPES } from "../constants/doc-types.js";

/**
 * Currency code schema (ISO 4217)
 */
export const CurrencyCodeSchema = z.string().trim().length(3).toUpperCase();

/**
 * Supplier contact create request schema
 */
export const SupplierContactCreateSchema = z.object({
  name: z.string().trim().min(1).max(191),
  email: z.string().trim().email().max(191).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  role: z.string().trim().max(96).nullable().optional(),
  is_primary: z.boolean().default(false),
  notes: z.string().trim().max(1000).nullable().optional()
});

/**
 * Supplier contact update request schema
 */
export const SupplierContactUpdateSchema = z.object({
  name: z.string().trim().min(1).max(191).optional(),
  email: z.string().trim().email().max(191).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  role: z.string().trim().max(96).nullable().optional(),
  is_primary: z.boolean().optional(),
  notes: z.string().trim().max(1000).nullable().optional()
});

/**
 * Supplier contact response schema
 */
export const SupplierContactResponseSchema = z.object({
  id: NumericIdSchema,
  supplier_id: NumericIdSchema,
  name: z.string().trim().min(1).max(191),
  email: z.string().trim().email().max(191).nullable(),
  phone: z.string().trim().max(32).nullable(),
  role: z.string().trim().max(96).nullable(),
  is_primary: z.boolean(),
  notes: z.string().trim().max(1000).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

/**
 * Supplier create request schema
 */
export const SupplierCreateSchema = z.object({
  company_id: NumericIdSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  email: z.string().trim().email().max(191).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  address_line1: z.string().trim().max(191).nullable().optional(),
  address_line2: z.string().trim().max(191).nullable().optional(),
  city: z.string().trim().max(96).nullable().optional(),
  postal_code: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().max(64).nullable().optional(),
  currency: CurrencyCodeSchema,
  credit_limit: z.string().trim().regex(/^\d+(\.\d{1,4})?$/).default("0"),
  payment_terms_days: z.number().int().min(0).max(365).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional()
});

/**
 * Supplier update request schema
 */
export const SupplierUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional(),
    email: z.string().trim().email().max(191).nullable().optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    address_line1: z.string().trim().max(191).nullable().optional(),
    address_line2: z.string().trim().max(191).nullable().optional(),
    city: z.string().trim().max(96).nullable().optional(),
    postal_code: z.string().trim().max(20).nullable().optional(),
    country: z.string().trim().max(64).nullable().optional(),
    currency: CurrencyCodeSchema.optional(),
    credit_limit: z.string().trim().regex(/^\d+(\.\d{1,4})?$/).optional(),
    payment_terms_days: z.number().int().min(0).max(365).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

/**
 * Supplier response schema
 */
export const SupplierResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  email: z.string().trim().email().max(191).nullable(),
  phone: z.string().trim().max(32).nullable(),
  address_line1: z.string().trim().max(191).nullable(),
  address_line2: z.string().trim().max(191).nullable(),
  city: z.string().trim().max(96).nullable(),
  postal_code: z.string().trim().max(20).nullable(),
  country: z.string().trim().max(64).nullable(),
  currency: z.string().trim().length(3),
  credit_limit: z.string().trim(),
  payment_terms_days: z.number().int().min(0).max(365).nullable(),
  notes: z.string().trim().max(1000).nullable(),
  is_active: z.boolean(),
  created_by_user_id: NumericIdSchema.nullable(),
  updated_by_user_id: NumericIdSchema.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  contacts: z.array(SupplierContactResponseSchema).optional()
});

/**
 * Supplier list query schema
 */
export const SupplierListQuerySchema = z.object({
  company_id: NumericIdSchema,
  is_active: z.boolean().optional(),
  search: z.string().trim().max(191).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0)
});

// Type exports
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;
export type SupplierContactCreate = z.infer<typeof SupplierContactCreateSchema>;
export type SupplierContactUpdate = z.infer<typeof SupplierContactUpdateSchema>;
export type SupplierContactResponse = z.infer<typeof SupplierContactResponseSchema>;
export type SupplierCreate = z.infer<typeof SupplierCreateSchema>;
export type SupplierUpdate = z.infer<typeof SupplierUpdateSchema>;
export type SupplierResponse = z.infer<typeof SupplierResponseSchema>;
export type SupplierListQuery = z.infer<typeof SupplierListQuerySchema>;

// =============================================================================
// Exchange Rate Schemas
// =============================================================================

/**
 * Exchange rate create request schema
 */
export const ExchangeRateCreateSchema = z.object({
  company_id: NumericIdSchema,
  currency_code: CurrencyCodeSchema,
  rate: z.string().trim().regex(/^\d+(\.\d{1,8})?$/, "Rate must be a positive decimal with up to 8 decimal places"),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format").transform((d) => new Date(d)),
  notes: z.string().trim().max(1000).nullable().optional()
});

/**
 * Exchange rate update request schema
 */
export const ExchangeRateUpdateSchema = z
  .object({
    rate: z.string().trim().regex(/^\d+(\.\d{1,8})?$/).optional(),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

/**
 * Exchange rate response schema
 */
export const ExchangeRateResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  currency_code: z.string().trim().length(3),
  rate: z.string().trim(),
  effective_date: z.string().datetime(),
  notes: z.string().trim().max(1000).nullable(),
  is_active: z.boolean(),
  created_by_user_id: NumericIdSchema.nullable(),
  updated_by_user_id: NumericIdSchema.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

/**
 * Exchange rate lookup query schema
 */
export const ExchangeRateLookupSchema = z.object({
  currency_code: CurrencyCodeSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)),
  company_id: NumericIdSchema
});

// Type exports for exchange rates
export type ExchangeRateCreate = z.infer<typeof ExchangeRateCreateSchema>;
export type ExchangeRateUpdate = z.infer<typeof ExchangeRateUpdateSchema>;
export type ExchangeRateResponse = z.infer<typeof ExchangeRateResponseSchema>;
export type ExchangeRateLookup = z.infer<typeof ExchangeRateLookupSchema>;

// =============================================================================
// Purchase Order Schemas
// =============================================================================

export const POStatusSchema = z.enum(PURCHASE_ORDER_STATUS_VALUES);
export type POStatus = z.infer<typeof POStatusSchema>;

/**
 * Purchase order line item schema
 */
export const PurchaseOrderLineSchema = z.object({
  item_id: NumericIdSchema.nullable().optional(),
  description: z.string().trim().max(255).nullable().optional(),
  qty: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Qty must be positive decimal"),
  unit_price: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Unit price must be positive decimal"),
  tax_rate: z.string().trim().regex(/^\d+(\.\d{1,4})?$/).default("0")
});

/**
 * Purchase order create request schema
 */
export const PurchaseOrderCreateSchema = z.object({
  supplier_id: NumericIdSchema,
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format").transform((d) => new Date(d)),
  currency_code: CurrencyCodeSchema.optional().default("IDR"),
  expected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  lines: z.array(PurchaseOrderLineSchema).min(1, "At least one line item is required")
});

/**
 * Purchase order update request schema (for lines)
 */
export const PurchaseOrderUpdateSchema = z
  .object({
    notes: z.string().trim().max(1000).nullable().optional(),
    expected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).nullable().optional(),
    lines: z.array(PurchaseOrderLineSchema).min(1, "Lines array cannot be empty").optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

/**
 * Purchase order status transition schema
 */
export const POStatusTransitionSchema = z.object({
  status: POStatusSchema
});

/**
 * Purchase order response schema
 */
export const PurchaseOrderResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  supplier_id: NumericIdSchema,
  order_no: z.string().trim(),
  order_date: z.string().datetime(),
  status: POStatusSchema,
  currency_code: z.string().trim().length(3),
  total_amount: z.string().trim(),
  expected_date: z.string().datetime().nullable(),
  notes: z.string().trim().max(1000).nullable(),
  created_by_user_id: NumericIdSchema.nullable(),
  updated_by_user_id: NumericIdSchema.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  lines: z.array(z.object({
    id: NumericIdSchema,
    line_no: z.number().int(),
    item_id: NumericIdSchema.nullable(),
    description: z.string().trim().max(255).nullable(),
    qty: z.string().trim(),
    unit_price: z.string().trim(),
    tax_rate: z.string().trim(),
    received_qty: z.string().trim(),
    line_total: z.string().trim()
  })).optional()
});

/**
 * Purchase order list query schema
 */
export const PurchaseOrderListQuerySchema = z.object({
  supplier_id: NumericIdSchema.optional(),
  status: POStatusSchema.optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0)
});

// Type exports for purchase orders
export type PurchaseOrderCreate = z.infer<typeof PurchaseOrderCreateSchema>;
export type PurchaseOrderUpdate = z.infer<typeof PurchaseOrderUpdateSchema>;
export type PurchaseOrderResponse = z.infer<typeof PurchaseOrderResponseSchema>;
export type PurchaseOrderListQuery = z.infer<typeof PurchaseOrderListQuerySchema>;
export type POStatusTransition = z.infer<typeof POStatusTransitionSchema>;
export type PurchaseOrderLine = z.infer<typeof PurchaseOrderLineSchema>;

// =============================================================================
// Goods Receipt Schemas
// =============================================================================

/**
 * Goods receipt line schema
 */
export const GoodsReceiptLineSchema = z.object({
  po_line_id: NumericIdSchema.nullable().optional(),
  item_id: NumericIdSchema.nullable().optional(),
  description: z.string().trim().max(255).nullable().optional(),
  qty: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Qty must be positive decimal"),
  unit: z.string().trim().max(32).nullable().optional()
}).refine((line) => line.po_line_id != null || line.item_id != null, {
  message: "Each line must include at least one of po_line_id or item_id"
});

/**
 * Goods receipt create request schema
 */
export const GoodsReceiptCreateSchema = z.object({
  supplier_id: NumericIdSchema,
  reference_number: z.string().trim().min(1).max(64),
  receipt_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format").transform((d) => new Date(d)),
  notes: z.string().trim().max(1000).nullable().optional(),
  lines: z.array(GoodsReceiptLineSchema).min(1, "At least one line is required")
});

/**
 * Goods receipt response schema
 */
export const GoodsReceiptResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  supplier_id: NumericIdSchema,
  reference_number: z.string().trim(),
  receipt_date: z.string().datetime(),
  status: z.string().trim(),
  notes: z.string().trim().max(1000).nullable(),
  created_by_user_id: NumericIdSchema.nullable(),
  updated_by_user_id: NumericIdSchema.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  lines: z.array(z.object({
    id: NumericIdSchema,
    line_no: z.number().int(),
    po_line_id: NumericIdSchema.nullable(),
    item_id: NumericIdSchema.nullable(),
    description: z.string().trim().max(255).nullable(),
    qty: z.string().trim(),
    unit: z.string().trim().max(32).nullable(),
    over_receipt_allowed: z.boolean()
  })).optional(),
  po_reference: z.string().trim().nullable().optional(),
  supplier_name: z.string().trim().nullable().optional()
});

/**
 * Goods receipt list query schema
 */
export const GoodsReceiptListQuerySchema = z.object({
  supplier_id: NumericIdSchema.optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0)
});

// Type exports for goods receipts
export type GoodsReceiptCreate = z.infer<typeof GoodsReceiptCreateSchema>;
export type GoodsReceiptResponse = z.infer<typeof GoodsReceiptResponseSchema>;
export type GoodsReceiptListQuery = z.infer<typeof GoodsReceiptListQuerySchema>;
export type GoodsReceiptLine = z.infer<typeof GoodsReceiptLineSchema>;

// =============================================================================
// Purchase Invoice Schemas
// =============================================================================

export const PurchaseInvoiceStatusSchema = z.enum(PURCHASE_INVOICE_STATUS_VALUES);
export type PurchaseInvoiceStatus = z.infer<typeof PurchaseInvoiceStatusSchema>;

/**
 * Purchase invoice line item schema
 */
export const PurchaseInvoiceLineSchema = z.object({
  item_id: NumericIdSchema.nullable().optional(),
  description: z.string().trim().min(1).max(255),
  qty: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Qty must be positive decimal"),
  unit_price: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Unit price must be positive decimal"),
  tax_rate_id: NumericIdSchema.nullable().optional(),
  line_type: z.enum(["ITEM", "SERVICE", "FREIGHT", "TAX", "DISCOUNT"]).default("ITEM")
});

/**
 * Purchase invoice create request schema
 */
export const PurchaseInvoiceCreateSchema = z.object({
  supplier_id: NumericIdSchema,
  invoice_no: z.string().trim().min(1).max(64),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format").transform((d) => new Date(d)),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).nullable().optional(),
  reference_number: z.string().trim().max(64).nullable().optional(),
  currency_code: CurrencyCodeSchema.optional().default("IDR"),
  exchange_rate: z.string().trim().regex(/^\d+(\.\d{1,8})?$/).default("1.00000000"),
  notes: z.string().trim().max(1000).nullable().optional(),
  lines: z.array(PurchaseInvoiceLineSchema).min(1, "At least one line item is required")
});

/**
 * Purchase invoice list query schema
 */
export const PurchaseInvoiceListQuerySchema = z.object({
  supplier_id: NumericIdSchema.optional(),
  status: PurchaseInvoiceStatusSchema.optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0)
});

/**
 * Purchase invoice line response schema
 */
export const PurchaseInvoiceLineResponseSchema = z.object({
  id: NumericIdSchema,
  line_no: z.number().int(),
  line_type: z.string().trim(),
  item_id: NumericIdSchema.nullable(),
  description: z.string().trim(),
  qty: z.string().trim(),
  unit_price: z.string().trim(),
  line_total: z.string().trim(),
  tax_rate_id: NumericIdSchema.nullable(),
  tax_amount: z.string().trim(),
  po_line_id: NumericIdSchema.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

/**
 * Purchase invoice response schema
 */
export const PurchaseInvoiceResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  supplier_id: NumericIdSchema,
  invoice_no: z.string().trim(),
  invoice_date: z.string().datetime(),
  due_date: z.string().datetime().nullable(),
  reference_number: z.string().trim().nullable(),
  status: PurchaseInvoiceStatusSchema,
  currency_code: z.string().trim().length(3),
  exchange_rate: z.string().trim(),
  subtotal: z.string().trim(),
  tax_amount: z.string().trim(),
  grand_total: z.string().trim(),
  notes: z.string().trim().max(1000).nullable(),
  journal_batch_id: NumericIdSchema.nullable(),
  posted_at: z.string().datetime().nullable(),
  posted_by_user_id: NumericIdSchema.nullable(),
  voided_at: z.string().datetime().nullable(),
  voided_by_user_id: NumericIdSchema.nullable(),
  created_by_user_id: NumericIdSchema.nullable(),
  updated_by_user_id: NumericIdSchema.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  lines: z.array(PurchaseInvoiceLineResponseSchema).optional(),
  supplier_name: z.string().trim().nullable().optional()
});

// Type exports for purchase invoices
export type PurchaseInvoiceCreate = z.infer<typeof PurchaseInvoiceCreateSchema>;
export type PurchaseInvoiceListQuery = z.infer<typeof PurchaseInvoiceListQuerySchema>;
export type PurchaseInvoiceResponse = z.infer<typeof PurchaseInvoiceResponseSchema>;
export type PurchaseInvoiceLine = z.infer<typeof PurchaseInvoiceLineSchema>;
export type PurchaseInvoiceLineResponse = z.infer<typeof PurchaseInvoiceLineResponseSchema>;

// =============================================================================
// AP Payment Schemas
// =============================================================================

export const ApPaymentStatusSchema = z.enum(AP_PAYMENT_STATUS_VALUES);
export type ApPaymentStatus = z.infer<typeof ApPaymentStatusSchema>;

/**
 * AP payment line item schema (create)
 */
export const ApPaymentLineCreateSchema = z.object({
  purchase_invoice_id: NumericIdSchema,
  allocation_amount: z.string().trim()
    .regex(/^\d+(\.\d{1,4})?$/, "Allocation amount must be positive decimal")
    .refine((value) => {
      const [integer, fraction = ""] = value.split(".");
      const scaled = BigInt(integer) * 10000n + BigInt((fraction + "0000").slice(0, 4));
      return scaled > 0n;
    }, "Allocation amount must be greater than zero"),
  description: z.string().trim().max(1000).nullable().optional()
});

/**
 * AP payment create request schema
 */
export const ApPaymentCreateSchema = z.object({
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format").transform((d) => new Date(d)),
  bank_account_id: NumericIdSchema,
  supplier_id: NumericIdSchema,
  description: z.string().trim().max(1000).nullable().optional(),
  lines: z.array(ApPaymentLineCreateSchema).min(1, "At least one line item is required")
});

/**
 * AP payment list query schema
 */
export const ApPaymentListQuerySchema = z.object({
  supplier_id: NumericIdSchema.optional(),
  status: ApPaymentStatusSchema.optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0)
});

/**
 * AP payment line response schema
 */
export const ApPaymentLineResponseSchema = z.object({
  id: NumericIdSchema,
  line_no: z.number().int(),
  purchase_invoice_id: NumericIdSchema,
  allocation_amount: z.string().trim(),
  description: z.string().trim().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

/**
 * AP payment response schema
 */
export const ApPaymentResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  payment_no: z.string().trim(),
  payment_date: z.string().datetime(),
  bank_account_id: NumericIdSchema,
  supplier_id: NumericIdSchema,
  description: z.string().trim().nullable(),
  status: ApPaymentStatusSchema,
  journal_batch_id: NumericIdSchema.nullable(),
  posted_at: z.string().datetime().nullable(),
  posted_by_user_id: NumericIdSchema.nullable(),
  voided_at: z.string().datetime().nullable(),
  voided_by_user_id: NumericIdSchema.nullable(),
  created_by_user_id: NumericIdSchema.nullable(),
  updated_by_user_id: NumericIdSchema.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  lines: z.array(ApPaymentLineResponseSchema).optional(),
  supplier_name: z.string().trim().nullable().optional()
});

// Type exports for AP payments
export type ApPaymentCreate = z.infer<typeof ApPaymentCreateSchema>;
export type ApPaymentListQuery = z.infer<typeof ApPaymentListQuerySchema>;
export type ApPaymentResponse = z.infer<typeof ApPaymentResponseSchema>;
export type ApPaymentLineCreate = z.infer<typeof ApPaymentLineCreateSchema>;
export type ApPaymentLineResponse = z.infer<typeof ApPaymentLineResponseSchema>;

// =============================================================================
// Purchase Credit Schemas
// =============================================================================

export const PurchaseCreditStatusSchema = z.enum(PURCHASE_CREDIT_STATUS_VALUES);
export type PurchaseCreditStatus = z.infer<typeof PurchaseCreditStatusSchema>;

export const PurchaseCreditLineCreateSchema = z.object({
  purchase_invoice_id: NumericIdSchema.nullable().optional(),
  purchase_invoice_line_id: NumericIdSchema.nullable().optional(),
  item_id: NumericIdSchema.nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  qty: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Qty must be positive decimal"),
  unit_price: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Unit price must be positive decimal"),
  reason: z.string().trim().max(255).nullable().optional()
});

export const PurchaseCreditCreateSchema = z.object({
  supplier_id: NumericIdSchema,
  credit_no: z.string().trim().min(1).max(64),
  credit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format").transform((d) => new Date(d)),
  description: z.string().trim().max(1000).nullable().optional(),
  lines: z.array(PurchaseCreditLineCreateSchema).min(1, "At least one line item is required")
});

export const PurchaseCreditListQuerySchema = z.object({
  supplier_id: NumericIdSchema.optional(),
  status: PurchaseCreditStatusSchema.optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(d)).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0)
});

export const PurchaseCreditLineResponseSchema = z.object({
  id: NumericIdSchema,
  line_no: z.number().int(),
  purchase_invoice_id: NumericIdSchema.nullable(),
  purchase_invoice_line_id: NumericIdSchema.nullable(),
  item_id: NumericIdSchema.nullable(),
  description: z.string().trim().nullable(),
  qty: z.string().trim(),
  unit_price: z.string().trim(),
  line_amount: z.string().trim(),
  reason: z.string().trim().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const PurchaseCreditApplicationResponseSchema = z.object({
  id: NumericIdSchema,
  purchase_credit_line_id: NumericIdSchema,
  purchase_invoice_id: NumericIdSchema,
  applied_amount: z.string().trim(),
  applied_at: z.string().datetime(),
  created_at: z.string().datetime()
});

export const PurchaseCreditResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  supplier_id: NumericIdSchema,
  credit_no: z.string().trim(),
  credit_date: z.string().datetime(),
  description: z.string().trim().nullable(),
  status: PurchaseCreditStatusSchema,
  total_credit_amount: z.string().trim(),
  applied_amount: z.string().trim(),
  remaining_amount: z.string().trim(),
  journal_batch_id: NumericIdSchema.nullable(),
  posted_at: z.string().datetime().nullable(),
  posted_by_user_id: NumericIdSchema.nullable(),
  voided_at: z.string().datetime().nullable(),
  voided_by_user_id: NumericIdSchema.nullable(),
  created_by_user_id: NumericIdSchema.nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  supplier_name: z.string().trim().nullable().optional(),
  lines: z.array(PurchaseCreditLineResponseSchema).optional(),
  applications: z.array(PurchaseCreditApplicationResponseSchema).optional()
});

export type PurchaseCreditCreate = z.infer<typeof PurchaseCreditCreateSchema>;
export type PurchaseCreditListQuery = z.infer<typeof PurchaseCreditListQuerySchema>;
export type PurchaseCreditResponse = z.infer<typeof PurchaseCreditResponseSchema>;
export type PurchaseCreditLineCreate = z.infer<typeof PurchaseCreditLineCreateSchema>;
export type PurchaseCreditLineResponse = z.infer<typeof PurchaseCreditLineResponseSchema>;
export type PurchaseCreditApplicationResponse = z.infer<typeof PurchaseCreditApplicationResponseSchema>;

// =============================================================================
// AP Reconciliation Schemas (Epic 47)
// =============================================================================

/**
 * AP Reconciliation Settings Update Schema
 * Body for PUT /purchasing/reports/ap-reconciliation/settings
 */
export const APReconciliationSettingsUpdateSchema = z.object({
  account_ids: z
    .array(z.number().int().positive())
    .min(1, "At least one account is required")
    .max(50, "Maximum 50 accounts allowed")
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "Account IDs must be unique",
    }),
});

/**
 * AP Reconciliation Settings Response Schema
 */
export const APReconciliationSettingsResponseSchema = z.object({
  account_ids: z.array(z.number().int().positive()),
  source: z.enum(["settings", "fallback_company_default", "none"]),
});

/**
 * AP Reconciliation Summary Query Schema
 */
export const APReconciliationSummaryQuerySchema = z.object({
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
});

/**
 * AP Reconciliation Summary Response Schema
 */
export const APReconciliationSummaryResponseSchema = z.object({
  as_of_date: z.string(),
  ap_subledger_balance: z.string(),
  gl_control_balance: z.string(),
  variance: z.string(),
  configured_account_ids: z.array(z.number().int().positive()),
  account_source: z.enum(["settings", "fallback_company_default", "none"]),
  currency: z.string(),
});

// =============================================================================
// AP Reconciliation Drilldown Schemas (Story 47.2 B2A)
// =============================================================================

/**
 * Drilldown query schema - shared by drilldown, gl-detail, ap-detail, and export
 */
export const APReconciliationDrilldownQuerySchema = z.object({
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

/**
 * Drilldown attribution categories (deterministic precedence order)
 * 1. currency_rounding_differences (<= tolerance)
 * 2. posting_errors
 * 3. timing_differences
 * 4. missing_transactions
 */
export const DrilldownCategorySchema = z.enum([
  "currency_rounding_differences",
  "posting_errors",
  "timing_differences",
  "missing_transactions",
]);
export type DrilldownCategory = z.infer<typeof DrilldownCategorySchema>;

/**
 * Drilldown line item - individual transaction contributing to variance
 */
export const DrilldownLineItemSchema = z.object({
  id: z.string(), // composite key for stability
  category: DrilldownCategorySchema,
  // AP side (optional - some items may be GL-only)
  ap_transaction_id: z.number().int().positive().nullable(),
  ap_transaction_type: z.enum(PURCHASING_AP_TRANSACTION_TYPES).nullable(),
  ap_transaction_ref: z.string().nullable(), // invoice_no, payment_no, credit_no
  ap_date: z.string().nullable(), // YYYY-MM-DD
  ap_amount_original: z.string().nullable(),
  ap_amount_base: z.string().nullable(),
  ap_currency: z.string().nullable(),
  // GL side (optional - some items may be AP-only)
  gl_journal_line_id: z.number().int().positive().nullable(),
  gl_journal_number: z.string().nullable(),
  gl_effective_date: z.string().nullable(),
  gl_description: z.string().nullable(),
  gl_amount: z.string().nullable(), // debit or credit in base currency
  gl_debit_credit: z.enum(["debit", "credit"]).nullable(),
  // Match status
  matched: z.boolean(),
  match_id: z.string().nullable(), // composite key of matched pair
  // Variance
  difference: z.string(), // absolute difference in base currency
  suggested_action: z.string().nullable(),
});

export type DrilldownLineItem = z.infer<typeof DrilldownLineItemSchema>;

/**
 * Drilldown variance category summary
 */
export const DrilldownCategorySummarySchema = z.object({
  category: DrilldownCategorySchema,
  total_difference: z.string(), // sum of differences in base currency
  item_count: z.number().int().nonnegative(),
  items: z.array(DrilldownLineItemSchema),
});

export type DrilldownCategorySummary = z.infer<typeof DrilldownCategorySummarySchema>;

/**
 * Drilldown response schema
 */
export const APReconciliationDrilldownResponseSchema = z.object({
  as_of_date: z.string(),
  configured_account_ids: z.array(z.number().int().positive()),
  currency: z.string().default("BASE"),
  // Totals from summary
  ap_subledger_balance: z.string(),
  gl_control_balance: z.string(),
  variance: z.string(),
  // Category summaries in deterministic precedence order
  categories: z.array(DrilldownCategorySummarySchema),
  // Pagination
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
});

/**
 * GL detail line item
 */
export const GLDetailLineItemSchema = z.object({
  journal_line_id: z.number().int().positive(),
  journal_batch_id: z.number().int().positive(),
  journal_number: z.string(),
  effective_date: z.string(), // YYYY-MM-DD
  description: z.string(),
  account_id: z.number().int().positive(),
  account_code: z.string(),
  account_name: z.string(),
  debit: z.string().nullable(), // null if credit
  credit: z.string().nullable(), // null if debit
  source_type: z.enum(PURCHASING_AP_TRANSACTION_TYPES).nullable(),
  source_id: z.number().int().positive().nullable(),
  posted_at: z.string(), // UTC datetime
});

export type GLDetailLineItem = z.infer<typeof GLDetailLineItemSchema>;

/**
 * GL detail response with pagination
 */
export const APReconciliationGLDetailResponseSchema = z.object({
  as_of_date: z.string(),
  configured_account_ids: z.array(z.number().int().positive()),
  lines: z.array(GLDetailLineItemSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  total_count: z.number().int().nonnegative(),
});

/**
 * AP detail line item
 */
export const APDetailLineItemSchema = z.object({
  id: z.number().int().positive(),
  type: z.enum(PURCHASING_AP_TRANSACTION_TYPES),
  reference: z.string(), // invoice_no, credit_no, payment_no
  date: z.string(), // YYYY-MM-DD
  due_date: z.string().nullable(),
  supplier_id: z.number().int().positive().nullable(),
  supplier_name: z.string().nullable(),
  currency_code: z.string(),
  original_amount: z.string(), // in original currency
  base_amount: z.string(), // converted to base currency
  open_amount: z.string(), // remaining unpaid in base currency
  status: z.string(),
  // If matched to GL
  matched: z.boolean(),
  gl_journal_line_id: z.number().int().positive().nullable(),
});

export type APDetailLineItem = z.infer<typeof APDetailLineItemSchema>;

/**
 * AP detail response
 */
export const APReconciliationAPDetailResponseSchema = z.object({
  as_of_date: z.string(),
  lines: z.array(APDetailLineItemSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  total_count: z.number().int().nonnegative(),
  total_open_base: z.string(),
});

/**
 * CSV Export query schema
 */
export const APReconciliationExportQuerySchema = z.object({
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
  format: z.enum(["csv"]).default("csv"),
});

// Type exports for AP Reconciliation
export type APReconciliationSettingsUpdate = z.infer<typeof APReconciliationSettingsUpdateSchema>;
export type APReconciliationSettingsResponse = z.infer<typeof APReconciliationSettingsResponseSchema>;
export type APReconciliationSummaryQuery = z.infer<typeof APReconciliationSummaryQuerySchema>;
export type APReconciliationSummaryResponse = z.infer<typeof APReconciliationSummaryResponseSchema>;
export type APReconciliationDrilldownQuery = z.infer<typeof APReconciliationDrilldownQuerySchema>;
export type APReconciliationDrilldownResponse = z.infer<typeof APReconciliationDrilldownResponseSchema>;
export type APReconciliationGLDetailResponse = z.infer<typeof APReconciliationGLDetailResponseSchema>;
export type APReconciliationAPDetailResponse = z.infer<typeof APReconciliationAPDetailResponseSchema>;
export type APReconciliationExportQuery = z.infer<typeof APReconciliationExportQuerySchema>;
