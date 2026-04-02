// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Repository Interfaces for Sales Module
 * 
 * These interfaces define the data access contract for the sales module.
 * The API provides concrete implementations at composition time.
 * 
 * This approach ensures modules-sales has NO direct dependency on @/lib/db
 * from the API.
 */

import type { ItemLookup } from "../types/sales.js";
import type { InvoiceDueTerm } from "../types/invoices.js";

/**
 * Due date resolution input
 */
export interface DueDateInput {
  invoiceDate: string;
  dueDate?: string;
  dueTerm?: InvoiceDueTerm;
}

/**
 * Tax rate information for invoice posting
 */
export interface TaxRateInfo {
  id: number;
  code: string;
  account_id: number | null;
}

/**
 * Invoice types for sales module
 */
export type {
  SalesInvoice,
  SalesInvoiceLine,
  SalesInvoiceTax,
  SalesInvoiceDetail,
  InvoiceListFilters,
  InvoiceLineInput,
  InvoiceTaxInput,
  MutationActor,
  ItemLookup
} from "../types/invoices.js";

export { InvoiceStatusError } from "../types/invoices.js";

export type { InvoiceDueTerm } from "../types/invoices.js";
export { INVOICE_DUE_TERM_DAYS } from "../types/invoices.js";

/**
 * Invoice posting data for journal integration
 */
export interface SalesInvoicePostingData {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  invoice_date: string;
  subtotal: number;
  grand_total: number;
  taxes?: Array<{ tax_rate_id: number; amount: number }>;
  updated_at: string;
}

/**
 * Stock item for COGS integration
 */
export interface StockItem {
  product_id: number;
  quantity: number;
}

/**
 * COGS posting result
 */
export interface CogsPostingResult {
  success: boolean;
  journalBatchId?: number;
  totalCogs: number;
  errors?: string[];
}

/**
 * Stock deduction result
 */
export interface StockDeductResult {
  itemId: number;
  quantity: number;
  transactionId: number;
  unitCost: number;
  totalCost: number;
}

/**
 * Stock deduction result with COGS posting
 */
export interface DeductStockForSaleResult {
  stockResults: StockDeductResult[];
  cogsResult: {
    success: boolean;
    journalBatchId?: number;
    totalCogs: number;
    errors?: string[];
  } | null;
}
