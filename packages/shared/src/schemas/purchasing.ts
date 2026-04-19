// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common.js";
import { PURCHASE_ORDER_STATUS_VALUES } from "../constants/purchasing.js";

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
