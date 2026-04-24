// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * SalesDb Adapter for API
 * 
 * Implements the SalesDb interface from modules-sales
 * using the API's database infrastructure.
 * 
 * This module provides:
 * - ApiSalesDbExecutor: implements SalesDbExecutor interface
 * - ApiSalesDb: implements SalesDb interface with transaction support
 */

import { sql } from "kysely";
import { getDb, type KyselySchema } from "@/lib/db";
import { withTransactionRetry } from "@jurnapod/db";
import { toDateTimeRangeWithTimezone } from "@/lib/date-helpers";
import { DOCUMENT_TYPES } from "@/lib/numbering";
import type { SalesDb, SalesDbExecutor } from "@jurnapod/modules-sales";
import { type Transaction } from "@jurnapod/db";
import type {
  SalesOrderDetail,
  SalesOrderStatus,
  OrderListFilters,
  ItemLookup,
  InvoiceListFilters,
  SalesInvoice,
  SalesCreditNoteStatus
} from "@jurnapod/modules-sales";

// Row types
interface SalesOrderRow {
  id: number;
  company_id: number;
  outlet_id: number;
  order_no: string;
  client_ref?: string | null;
  order_date: string;
  expected_date: string | null;
  status: SalesOrderStatus;
  notes: string | null;
  subtotal: string | number;
  tax_amount: string | number;
  grand_total: string | number;
  confirmed_by_user_id: number | null;
  confirmed_at: string | null;
  completed_by_user_id: number | null;
  completed_at: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

interface SalesOrderLineRow {
  id: number;
  order_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
}

interface SalesInvoiceRow {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  client_ref?: string | null;
  invoice_date: string;
  due_date?: string | null;
  status: "DRAFT" | "APPROVED" | "POSTED" | "VOID";
  payment_status: "UNPAID" | "PARTIAL" | "PAID";
  subtotal: string | number;
  discount_percent?: string | number | null;
  discount_fixed?: string | number | null;
  tax_amount: string | number;
  grand_total: string | number;
  paid_total: string | number;
  approved_by_user_id?: number | null;
  approved_at?: string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
}

interface SalesInvoiceLineRow {
  id: number;
  invoice_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
}

interface SalesInvoiceTaxRow {
  id: number;
  invoice_id: number;
  tax_rate_id: number;
  amount: string | number;
}

function formatDateOnly(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().slice(0, 10);
}

function normalizeInvoice(row: SalesInvoiceRow): SalesInvoice {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    invoice_no: row.invoice_no,
    client_ref: row.client_ref ?? undefined,
    invoice_date: formatDateOnly(row.invoice_date),
    due_date: row.due_date ? formatDateOnly(row.due_date) : undefined,
    status: row.status,
    payment_status: row.payment_status,
    subtotal: Number(row.subtotal),
    discount_percent: row.discount_percent != null ? Number(row.discount_percent) : undefined,
    discount_fixed: row.discount_fixed != null ? Number(row.discount_fixed) : undefined,
    tax_amount: Number(row.tax_amount),
    grand_total: Number(row.grand_total),
    paid_total: Number(row.paid_total),
    approved_by_user_id: row.approved_by_user_id ? Number(row.approved_by_user_id) : undefined,
    approved_at: row.approved_at ?? undefined,
    created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : undefined,
    updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * ApiSalesDbExecutor
 * 
 * Implements SalesDbExecutor interface using API database access.
 * Supports transaction context via _getDb() method.
 */
export class ApiSalesDbExecutor implements SalesDbExecutor {
  private _transaction: Transaction | null = null;

  constructor(private readonly _db: KyselySchema) {}

  /**
   * Get the current database connection (or transaction if active).
   */
  protected _getDb(): KyselySchema {
    return this._transaction ?? this._db;
  }

  /**
   * Set the active transaction context.
   * Called by ApiSalesDb.withTransaction before executing transactional operations.
   */
  setTransaction(trx: Transaction | null): void {
    this._transaction = trx;
  }

  /**
   * Get the current transaction handle if inside a transaction, null otherwise.
   */
  getTransaction(): Transaction | null {
    return this._transaction;
  }

  // Order operations
  async findOrderById(companyId: number, orderId: number, forUpdate?: boolean): Promise<SalesOrderRow | null> {
    const forUpdateClause = forUpdate ? sql` FOR UPDATE` : sql``;
    const rows = await sql`
      SELECT * FROM sales_orders WHERE company_id = ${companyId} AND id = ${orderId}
      ${forUpdateClause}
    `.execute(this._getDb());
    return (rows.rows[0] as SalesOrderRow) || null;
  }

  async findOrderByClientRef(companyId: number, clientRef: string): Promise<SalesOrderRow | null> {
    const rows = await sql`
      SELECT * FROM sales_orders WHERE company_id = ${companyId} AND client_ref = ${clientRef}
    `.execute(this._getDb());
    return (rows.rows[0] as SalesOrderRow) || null;
  }

  async findOrderLines(orderId: number): Promise<SalesOrderLineRow[]> {
    const rows = await sql`
      SELECT id, order_id, line_no, line_type, item_id, description, qty, unit_price, line_total
       FROM sales_order_lines WHERE order_id = ${orderId} ORDER BY line_no
    `.execute(this._getDb());
    return rows.rows as SalesOrderLineRow[];
  }

  async insertOrder(input: {
    companyId: number;
    outletId: number;
    orderNo: string;
    orderDate: string;
    expectedDate?: string;
    clientRef?: string;
    status: string;
    notes?: string;
    subtotal: number;
    taxAmount: number;
    grandTotal: number;
    createdByUserId?: number;
  }): Promise<number> {
    const result = await sql`
      INSERT INTO sales_orders (
        company_id,
        outlet_id,
        order_no,
        order_date,
        expected_date,
        client_ref,
        status,
        notes,
        subtotal,
        tax_amount,
        grand_total,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (
        ${input.companyId},
        ${input.outletId},
        ${input.orderNo},
        ${input.orderDate},
        ${input.expectedDate ?? null},
        ${input.clientRef ?? null},
        ${input.status},
        ${input.notes ?? null},
        ${input.subtotal},
        ${input.taxAmount},
        ${input.grandTotal},
        ${input.createdByUserId ?? null},
        ${input.createdByUserId ?? null}
      )
    `.execute(this._getDb());
    return Number(result.insertId);
  }

  async insertOrderLine(input: {
    orderId: number;
    companyId: number;
    outletId: number;
    lineNo: number;
    lineType: "SERVICE" | "PRODUCT";
    itemId: number | null;
    description: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }): Promise<void> {
    await sql`
      INSERT INTO sales_order_lines (
        order_id,
        company_id,
        outlet_id,
        line_no,
        line_type,
        item_id,
        description,
        qty,
        unit_price,
        line_total
      ) VALUES (
        ${input.orderId},
        ${input.companyId},
        ${input.outletId},
        ${input.lineNo},
        ${input.lineType},
        ${input.itemId},
        ${input.description},
        ${input.qty},
        ${input.unitPrice},
        ${input.lineTotal}
      )
    `.execute(this._getDb());
  }

  async updateOrder(input: {
    companyId: number;
    orderId: number;
    outletId: number;
    orderNo: string;
    orderDate: string;
    expectedDate: string | null;
    notes: string | null;
    subtotal: number;
    taxAmount: number;
    grandTotal: number;
    updatedByUserId?: number;
  }): Promise<void> {
    await sql`UPDATE sales_orders
       SET outlet_id = ${input.outletId},
           order_no = ${input.orderNo},
           order_date = ${input.orderDate},
           expected_date = ${input.expectedDate},
           notes = ${input.notes},
           subtotal = ${input.subtotal},
           tax_amount = ${input.taxAmount},
           grand_total = ${input.grandTotal},
           updated_by_user_id = ${input.updatedByUserId ?? null},
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ${input.companyId}
         AND id = ${input.orderId}`.execute(this._getDb());
  }

  async deleteOrderLines(companyId: number, orderId: number): Promise<void> {
    await sql`DELETE FROM sales_order_lines WHERE company_id = ${companyId} AND order_id = ${orderId}`.execute(this._getDb());
  }

  async updateOrderStatus(companyId: number, orderId: number, status: string, updatedByUserId?: number): Promise<void> {
    if (status === "CONFIRMED") {
      await sql`UPDATE sales_orders 
         SET status = 'CONFIRMED', 
             confirmed_by_user_id = ${updatedByUserId ?? null}, 
             confirmed_at = CURRENT_TIMESTAMP,
             updated_by_user_id = ${updatedByUserId ?? null},
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ${companyId} AND id = ${orderId}`.execute(this._getDb());
    } else if (status === "COMPLETED") {
      await sql`UPDATE sales_orders 
         SET status = 'COMPLETED', 
             completed_by_user_id = ${updatedByUserId ?? null}, 
             completed_at = CURRENT_TIMESTAMP,
             updated_by_user_id = ${updatedByUserId ?? null},
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ${companyId} AND id = ${orderId}`.execute(this._getDb());
    } else if (status === "VOID") {
      await sql`UPDATE sales_orders 
         SET status = 'VOID',
             updated_by_user_id = ${updatedByUserId ?? null},
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ${companyId} AND id = ${orderId}`.execute(this._getDb());
    }
  }

  // Invoice operations
  async findInvoiceById(companyId: number, invoiceId: number, forUpdate?: boolean): Promise<SalesInvoiceRow | null> {
    const forUpdateClause = forUpdate ? sql` FOR UPDATE` : sql``;
    const rows = await sql`
      SELECT id, company_id, outlet_id, invoice_no, client_ref, invoice_date, due_date, status, payment_status,
              subtotal, discount_percent, discount_fixed, tax_amount, grand_total, paid_total, customer_id,
              approved_by_user_id, approved_at,
              created_by_user_id, updated_by_user_id, created_at, updated_at
       FROM sales_invoices
       WHERE company_id = ${companyId}
         AND id = ${invoiceId}
       LIMIT 1
       ${forUpdateClause}
    `.execute(this._getDb());
    return (rows.rows[0] as SalesInvoiceRow) || null;
  }

  async findInvoiceByClientRef(companyId: number, clientRef: string): Promise<unknown | null> {
    const rows = await sql`
      SELECT id, outlet_id
       FROM sales_invoices
       WHERE company_id = ${companyId}
         AND client_ref = ${clientRef}
       LIMIT 1
    `.execute(this._getDb());
    if (rows.rows.length === 0) {
      return null;
    }
    const row = rows.rows[0] as { id: number; outlet_id: number };
    return { id: Number(row.id), outlet_id: row.outlet_id };
  }

  async findInvoiceLines(companyId: number, invoiceId: number): Promise<SalesInvoiceLineRow[]> {
    const rows = await sql`
      SELECT id, invoice_id, line_no, line_type, item_id, description, qty, unit_price, line_total
       FROM sales_invoice_lines
       WHERE company_id = ${companyId}
         AND invoice_id = ${invoiceId}
       ORDER BY line_no ASC
    `.execute(this._getDb());
    return rows.rows as SalesInvoiceLineRow[];
  }

  async findInvoiceTaxes(companyId: number, invoiceId: number): Promise<SalesInvoiceTaxRow[]> {
    const rows = await sql`
      SELECT id, sales_invoice_id AS invoice_id, tax_rate_id, amount
       FROM sales_invoice_taxes
       WHERE company_id = ${companyId}
         AND sales_invoice_id = ${invoiceId}
    `.execute(this._getDb());
    return rows.rows as SalesInvoiceTaxRow[];
  }

  async insertInvoice(input: {
    companyId: number;
    outletId: number;
    invoiceNo: string;
    invoiceDate: string;
    dueDate: string;
    clientRef?: string;
    status: string;
    paymentStatus: string;
    subtotal: number;
    discountPercent?: number | null;
    discountFixed?: number | null;
    taxAmount: number;
    grandTotal: number;
    paidTotal: number;
    customerId?: number | null;
    createdByUserId?: number;
  }): Promise<number> {
    const result = await sql`INSERT INTO sales_invoices (
        company_id,
        outlet_id,
        invoice_no,
        invoice_date,
        due_date,
        client_ref,
        status,
        payment_status,
        subtotal,
        discount_percent,
        discount_fixed,
        tax_amount,
        grand_total,
        paid_total,
        customer_id,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (
        ${input.companyId},
        ${input.outletId},
        ${input.invoiceNo},
        ${input.invoiceDate},
        ${input.dueDate},
        ${input.clientRef ?? null},
        ${input.status},
        ${input.paymentStatus},
        ${input.subtotal},
        ${input.discountPercent ?? null},
        ${input.discountFixed ?? null},
        ${input.taxAmount},
        ${input.grandTotal},
        ${input.paidTotal},
        ${input.customerId ?? null},
        ${input.createdByUserId ?? null},
        ${input.createdByUserId ?? null}
      )`.execute(this._getDb());
    return Number(result.insertId);
  }

  async insertInvoiceLine(input: {
    invoiceId: number;
    companyId: number;
    outletId: number;
    lineNo: number;
    lineType: "SERVICE" | "PRODUCT";
    itemId: number | null;
    description: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }): Promise<void> {
    await sql`INSERT INTO sales_invoice_lines (
        invoice_id,
        company_id,
        outlet_id,
        line_no,
        line_type,
        item_id,
        description,
        qty,
        unit_price,
        line_total
      ) VALUES (
        ${input.invoiceId},
        ${input.companyId},
        ${input.outletId},
        ${input.lineNo},
        ${input.lineType},
        ${input.itemId},
        ${input.description},
        ${input.qty},
        ${input.unitPrice},
        ${input.lineTotal}
      )`.execute(this._getDb());
  }

  async insertInvoiceTax(input: {
    invoiceId: number;
    companyId: number;
    outletId: number;
    taxRateId: number;
    amount: number;
  }): Promise<void> {
    await sql`INSERT INTO sales_invoice_taxes (
        sales_invoice_id,
        company_id,
        outlet_id,
        tax_rate_id,
        amount
      ) VALUES (
        ${input.invoiceId},
        ${input.companyId},
        ${input.outletId},
        ${input.taxRateId},
        ${input.amount}
      )`.execute(this._getDb());
  }

  async updateInvoice(input: {
    companyId: number;
    invoiceId: number;
    outletId: number;
    invoiceNo: string;
    invoiceDate: string;
    dueDate?: string;
    subtotal: number;
    discountPercent?: number | null;
    discountFixed?: number | null;
    taxAmount: number;
    grandTotal: number;
    customerId?: number | null;
    updatedByUserId?: number;
  }): Promise<void> {
    await sql`UPDATE sales_invoices
       SET outlet_id = ${input.outletId},
           invoice_no = ${input.invoiceNo},
           invoice_date = ${input.invoiceDate},
           due_date = ${input.dueDate},
           subtotal = ${input.subtotal},
           discount_percent = ${input.discountPercent ?? null},
           discount_fixed = ${input.discountFixed ?? null},
           tax_amount = ${input.taxAmount},
           grand_total = ${input.grandTotal},
           customer_id = ${input.customerId ?? null},
           updated_by_user_id = ${input.updatedByUserId ?? null},
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ${input.companyId}
         AND id = ${input.invoiceId}`.execute(this._getDb());
  }

  async updateInvoiceStatus(companyId: number, invoiceId: number, status: string, updatedByUserId?: number): Promise<void> {
    if (status === "APPROVED") {
      await sql`UPDATE sales_invoices
         SET status = 'APPROVED',
             approved_by_user_id = ${updatedByUserId ?? null},
             approved_at = CURRENT_TIMESTAMP,
             updated_by_user_id = ${updatedByUserId ?? null},
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ${companyId}
           AND id = ${invoiceId}`.execute(this._getDb());
    } else if (status === "POSTED") {
      await sql`UPDATE sales_invoices
         SET status = 'POSTED',
             updated_by_user_id = ${updatedByUserId ?? null},
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ${companyId}
           AND id = ${invoiceId}`.execute(this._getDb());
    } else if (status === "VOID") {
      await sql`UPDATE sales_invoices
         SET status = 'VOID',
             updated_by_user_id = ${updatedByUserId ?? null},
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ${companyId}
           AND id = ${invoiceId}`.execute(this._getDb());
    }
  }

  async deleteInvoiceLines(companyId: number, invoiceId: number): Promise<void> {
    await sql`DELETE FROM sales_invoice_lines
       WHERE company_id = ${companyId}
         AND invoice_id = ${invoiceId}`.execute(this._getDb());
  }

  async deleteInvoiceTaxes(companyId: number, invoiceId: number): Promise<void> {
    await sql`DELETE FROM sales_invoice_taxes
       WHERE company_id = ${companyId}
         AND sales_invoice_id = ${invoiceId}`.execute(this._getDb());
  }

  // Item operations
  async findItemById(companyId: number, itemId: number): Promise<ItemLookup | null> {
    const rows = await sql`
      SELECT i.id, i.name, i.sku, i.item_type as type,
              (SELECT price FROM item_prices
               WHERE item_id = i.id AND company_id = i.company_id
               ORDER BY outlet_id IS NULL DESC, is_active DESC, id ASC
               LIMIT 1) as default_price
       FROM items i
       WHERE i.id = ${itemId} AND i.company_id = ${companyId} AND i.is_active = 1
       LIMIT 1
    `.execute(this._getDb());
    if (rows.rows.length === 0) {
      return null;
    }
    const row = rows.rows[0] as { id: number; name: string; sku: string; type: string; default_price: number | null };
    return {
      id: Number(row.id),
      name: row.name,
      sku: row.sku,
      type: row.type,
      default_price: row.default_price !== null ? Number(row.default_price) : null
    };
  }

  // Numbering
  async getNextDocumentNumber(companyId: number, outletId: number, docType: string, preferredNo?: string): Promise<string> {
    const { getNumberWithConflictMapping } = await import("@/lib/shared/common-utils");
    return getNumberWithConflictMapping(companyId, outletId, docType as typeof DOCUMENT_TYPES[keyof typeof DOCUMENT_TYPES], preferredNo);
  }

  // Validation
  async outletExists(companyId: number, outletId: number): Promise<boolean> {
    const { ensureCompanyOutletExists } = await import("@/lib/shared/common-utils");
    try {
      await ensureCompanyOutletExists(this._getDb(), companyId, outletId);
      return true;
    } catch {
      return false;
    }
  }

  async validateTaxRates(companyId: number, taxRateIds: number[]): Promise<boolean> {
    if (taxRateIds.length === 0) return true;
    const rows = await sql`SELECT id
       FROM tax_rates
       WHERE company_id = ${companyId}
         AND is_active = 1
         AND id IN (${sql.join(taxRateIds.map(id => sql`${id}`), sql`, `)})`.execute(this._getDb());
    const matched = new Set((rows.rows as Array<{ id: number }>).map(row => Number(row.id)));
    return matched.size === taxRateIds.length;
  }

  async getDefaultTaxRates(companyId: number): Promise<Array<{ tax_rate_id: number; rate_percent: number }>> {
    const rows = await sql`
      SELECT tr.id as tax_rate_id, tr.rate_percent
       FROM tax_rates tr
       INNER JOIN company_tax_defaults ctd ON ctd.tax_rate_id = tr.id
       WHERE ctd.company_id = ${companyId}
         AND tr.is_active = 1
    `.execute(this._getDb());
    return (rows.rows as Array<{ tax_rate_id: number; rate_percent: string | number }>).map(row => ({
      tax_rate_id: Number(row.tax_rate_id),
      rate_percent: Number(row.rate_percent)
    }));
  }

  /**
   * Validates that an account is a valid target for sales payment receive/disbursement.
   * Checks: company_id matches, id matches, is_active=1, type_name is BANK or CASH.
   */
  async accountIsTargetAccount(companyId: number, accountId: number): Promise<boolean> {
    const rows = await sql`
      SELECT id FROM accounts
       WHERE company_id = ${companyId}
         AND id = ${accountId}
         AND is_active = 1
         AND UPPER(type_name) IN ('BANK', 'CASH')
       LIMIT 1
    `.execute(this._getDb());
    return rows.rows.length > 0;
  }

  // Payment operations
  async findPaymentById(companyId: number, paymentId: number, forUpdate?: boolean): Promise<{
    id: number;
    company_id: number;
    outlet_id: number;
    invoice_id: number;
    payment_no: string;
    client_ref?: string | null;
    payment_at: string;
    account_id: number;
    account_name?: string | null;
    method?: "CASH" | "QRIS" | "CARD" | null;
    status: "DRAFT" | "POSTED" | "VOID";
    amount: number;
    actual_amount_idr?: number | null;
    invoice_amount_idr?: number | null;
    payment_amount_idr?: number | null;
    payment_delta_idr?: number | null;
    shortfall_settled_as_loss?: boolean | null;
    shortfall_reason?: string | null;
    shortfall_settled_by_user_id?: number | null;
    shortfall_settled_at?: string | null;
    fx_acknowledged_at?: string | null;
    fx_acknowledged_by?: number | null;
    created_by_user_id?: number | null;
    updated_by_user_id?: number | null;
    created_at: string;
    updated_at: string;
  } | null> {
    const forUpdateClause = forUpdate ? sql` FOR UPDATE` : sql``;
    const result = await sql`SELECT sp.id, sp.company_id, sp.outlet_id, sp.invoice_id, sp.payment_no, sp.client_ref, sp.payment_at,
            sp.account_id, a.name as account_name, sp.method, sp.status,
            sp.amount, sp.invoice_amount_idr, sp.payment_amount_idr, sp.payment_delta_idr,
            sp.shortfall_settled_as_loss, sp.shortfall_reason, sp.shortfall_settled_by_user_id, sp.shortfall_settled_at,
            sp.fx_acknowledged_at, sp.fx_acknowledged_by,
            sp.created_by_user_id, sp.updated_by_user_id, sp.created_at, sp.updated_at
     FROM sales_payments sp
     LEFT JOIN accounts a ON a.id = sp.account_id AND a.company_id = sp.company_id
     WHERE sp.company_id = ${companyId}
       AND sp.id = ${paymentId}
     LIMIT 1${forUpdateClause}`.execute(this._getDb());

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as {
      id: number;
      company_id: number;
      outlet_id: number;
      invoice_id: number;
      payment_no: string;
      client_ref?: string | null;
      payment_at: string;
      account_id: number;
      account_name?: string | null;
      method?: string | null;
      status: string;
      amount: string | number;
      actual_amount_idr?: string | number | null;
      invoice_amount_idr?: string | number | null;
      payment_amount_idr?: string | number | null;
      payment_delta_idr?: string | number | null;
      shortfall_settled_as_loss?: number | null;
      shortfall_reason?: string | null;
      shortfall_settled_by_user_id?: number | null;
      shortfall_settled_at?: string | null;
      fx_acknowledged_at?: string | null;
      fx_acknowledged_by?: number | null;
      created_by_user_id?: number | null;
      updated_by_user_id?: number | null;
      created_at: string;
      updated_at: string;
    };

    return {
      id: Number(row.id),
      company_id: Number(row.company_id),
      outlet_id: Number(row.outlet_id),
      invoice_id: Number(row.invoice_id),
      payment_no: row.payment_no,
      client_ref: row.client_ref ?? undefined,
      payment_at: row.payment_at,
      account_id: Number(row.account_id),
      account_name: row.account_name ?? undefined,
      method: (row.method ?? undefined) as "CASH" | "QRIS" | "CARD" | null ?? undefined,
      status: row.status as "DRAFT" | "POSTED" | "VOID",
      amount: Number(row.amount),
      actual_amount_idr: row.actual_amount_idr !== undefined && row.actual_amount_idr !== null ? Number(row.actual_amount_idr) : undefined,
      invoice_amount_idr: row.invoice_amount_idr !== undefined && row.invoice_amount_idr !== null ? Number(row.invoice_amount_idr) : undefined,
      payment_amount_idr: row.payment_amount_idr !== undefined && row.payment_amount_idr !== null ? Number(row.payment_amount_idr) : undefined,
      payment_delta_idr: row.payment_delta_idr !== undefined && row.payment_delta_idr !== null ? Number(row.payment_delta_idr) : undefined,
      shortfall_settled_as_loss: row.shortfall_settled_as_loss === 1 ? true : row.shortfall_settled_as_loss === 0 ? false : undefined,
      shortfall_reason: row.shortfall_reason ?? undefined,
      shortfall_settled_by_user_id: row.shortfall_settled_by_user_id ? Number(row.shortfall_settled_by_user_id) : undefined,
      shortfall_settled_at: row.shortfall_settled_at ?? undefined,
      fx_acknowledged_at: row.fx_acknowledged_at ?? undefined,
      fx_acknowledged_by: row.fx_acknowledged_by ? Number(row.fx_acknowledged_by) : undefined,
      created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : undefined,
      updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  async findPaymentByClientRef(companyId: number, clientRef: string) {
    const result = await sql`SELECT id
       FROM sales_payments
       WHERE company_id = ${companyId}
         AND client_ref = ${clientRef}
       LIMIT 1`.execute(this._getDb());

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as { id: number };
    return this.findPaymentById(companyId, Number(row.id));
  }

  async findPaymentSplits(companyId: number, paymentId: number): Promise<Array<{
    id: number;
    payment_id: number;
    company_id: number;
    outlet_id: number;
    split_index: number;
    account_id: number;
    account_name?: string | null;
    amount: number;
  }>> {
    const result = await sql`SELECT sps.id, sps.payment_id, sps.company_id, sps.outlet_id, sps.split_index,
            sps.account_id, a.name as account_name, sps.amount
     FROM sales_payment_splits sps
     LEFT JOIN accounts a ON a.id = sps.account_id AND a.company_id = sps.company_id
     WHERE sps.company_id = ${companyId}
       AND sps.payment_id = ${paymentId}
     ORDER BY sps.split_index`.execute(this._getDb());

    return (result.rows as Array<{
      id: number;
      payment_id: number;
      company_id: number;
      outlet_id: number;
      split_index: number;
      account_id: number;
      account_name?: string | null;
      amount: string | number;
    }>).map(row => ({
      id: Number(row.id),
      payment_id: Number(row.payment_id),
      company_id: Number(row.company_id),
      outlet_id: Number(row.outlet_id),
      split_index: Number(row.split_index),
      account_id: Number(row.account_id),
      account_name: row.account_name ?? undefined,
      amount: Number(row.amount)
    }));
  }

  async findPaymentSplitsForMultiple(companyId: number, paymentIds: number[]): Promise<Map<number, Array<{
    id: number;
    payment_id: number;
    company_id: number;
    outlet_id: number;
    split_index: number;
    account_id: number;
    account_name?: string | null;
    amount: number;
  }>>> {
    if (paymentIds.length === 0) {
      return new Map();
    }

    const result = await sql`SELECT sps.id, sps.payment_id, sps.company_id, sps.outlet_id, sps.split_index,
            sps.account_id, a.name as account_name, sps.amount
     FROM sales_payment_splits sps
     LEFT JOIN accounts a ON a.id = sps.account_id AND a.company_id = sps.company_id
     WHERE sps.company_id = ${companyId}
       AND sps.payment_id IN (${sql.join(paymentIds.map(id => sql`${id}`), sql`, `)})
     ORDER BY sps.payment_id, sps.split_index`.execute(this._getDb());

    const splitsByPaymentId = new Map<number, Array<{
      id: number;
      payment_id: number;
      company_id: number;
      outlet_id: number;
      split_index: number;
      account_id: number;
      account_name?: string | null;
      amount: number;
    }>>();

    for (const row of result.rows as Array<{
      id: number;
      payment_id: number;
      company_id: number;
      outlet_id: number;
      split_index: number;
      account_id: number;
      account_name?: string | null;
      amount: string | number;
    }>) {
      const paymentId = Number(row.payment_id);
      if (!splitsByPaymentId.has(paymentId)) {
        splitsByPaymentId.set(paymentId, []);
      }
      splitsByPaymentId.get(paymentId)!.push({
        id: Number(row.id),
        payment_id: Number(row.payment_id),
        company_id: Number(row.company_id),
        outlet_id: Number(row.outlet_id),
        split_index: Number(row.split_index),
        account_id: Number(row.account_id),
        account_name: row.account_name ?? undefined,
        amount: Number(row.amount)
      });
    }

    return splitsByPaymentId;
  }

  async insertPayment(input: {
    companyId: number;
    outletId: number;
    invoiceId: number;
    paymentNo: string;
    clientRef?: string;
    paymentAt: string;
    accountId: number;
    method?: string;
    status: string;
    amount: number;
    paymentAmountIdr: number;
    createdByUserId?: number;
  }): Promise<number> {
    const result = await sql`INSERT INTO sales_payments (
         company_id,
         outlet_id,
         invoice_id,
         payment_no,
         client_ref,
         payment_at,
         account_id,
         method,
         status,
         amount,
         payment_amount_idr,
         created_by_user_id,
         updated_by_user_id
       ) VALUES (${input.companyId}, ${input.outletId}, ${input.invoiceId}, ${input.paymentNo}, ${input.clientRef ?? null}, ${input.paymentAt}, ${input.accountId}, ${input.method ?? null}, ${input.status}, ${input.amount}, ${input.paymentAmountIdr}, ${input.createdByUserId ?? null}, ${input.createdByUserId ?? null})`.execute(this._getDb());

    return Number(result.insertId);
  }

  async insertPaymentSplit(input: {
    paymentId: number;
    companyId: number;
    outletId: number;
    splitIndex: number;
    accountId: number;
    amount: number;
  }): Promise<void> {
    await sql`INSERT INTO sales_payment_splits (
         payment_id, company_id, outlet_id, split_index, account_id, amount
       ) VALUES (${input.paymentId}, ${input.companyId}, ${input.outletId}, ${input.splitIndex}, ${input.accountId}, ${input.amount})`.execute(this._getDb());
  }

  async updatePayment(input: {
    companyId: number;
    paymentId: number;
    outletId: number;
    invoiceId: number;
    paymentNo: string;
    paymentAt: string;
    accountId: number;
    method?: string | null;
    amount: number;
    paymentAmountIdr: number;
    updatedByUserId?: number;
  }): Promise<void> {
    await sql`UPDATE sales_payments
       SET outlet_id = ${input.outletId},
           invoice_id = ${input.invoiceId},
           payment_no = ${input.paymentNo},
           payment_at = ${input.paymentAt},
           account_id = ${input.accountId},
           method = ${input.method ?? null},
           amount = ${input.amount},
           payment_amount_idr = ${input.paymentAmountIdr},
           updated_by_user_id = ${input.updatedByUserId ?? null},
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ${input.companyId}
         AND id = ${input.paymentId}`.execute(this._getDb());
  }

  async deletePaymentSplits(companyId: number, paymentId: number): Promise<void> {
    await sql`DELETE FROM sales_payment_splits
       WHERE company_id = ${companyId} AND payment_id = ${paymentId}`.execute(this._getDb());
  }

  async updatePaymentStatus(input: {
    companyId: number;
    paymentId: number;
    status: string;
    invoiceAmountIdr?: number;
    paymentDeltaIdr?: number;
    shortfallSettledAsLoss?: boolean;
    shortfallReason?: string;
    shortfallSettledByUserId?: number;
    shortfallSettledAt?: Date | null;
    fxAcknowledgedAt?: Date | null;
    fxAcknowledgedBy?: number;
    updatedByUserId?: number;
  }): Promise<void> {
    await sql`UPDATE sales_payments
       SET status = ${input.status},
           invoice_amount_idr = ${input.invoiceAmountIdr ?? null},
           payment_delta_idr = ${input.paymentDeltaIdr ?? null},
           shortfall_settled_as_loss = ${input.shortfallSettledAsLoss ? 1 : 0},
           shortfall_reason = ${input.shortfallReason ?? null},
           shortfall_settled_by_user_id = ${input.shortfallSettledByUserId ?? null},
           shortfall_settled_at = ${input.shortfallSettledAt ?? null},
           fx_acknowledged_at = ${input.fxAcknowledgedAt ?? null},
           fx_acknowledged_by = ${input.fxAcknowledgedBy ?? null},
           updated_by_user_id = ${input.updatedByUserId ?? null},
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ${input.companyId}
         AND id = ${input.paymentId}`.execute(this._getDb());
  }

  async acknowledgeFxDelta(input: {
    companyId: number;
    paymentId: number;
    acknowledgedAt: Date;
    acknowledgedByUserId: number;
  }): Promise<void> {
    await sql`UPDATE sales_payments
       SET fx_acknowledged_at = ${input.acknowledgedAt},
           fx_acknowledged_by = ${input.acknowledgedByUserId},
           updated_by_user_id = ${input.acknowledgedByUserId},
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ${input.companyId}
         AND id = ${input.paymentId}`.execute(this._getDb());
  }

  async updateInvoicePaidTotal(input: {
    companyId: number;
    invoiceId: number;
    paidTotal: number;
    paymentStatus: string;
    updatedByUserId?: number;
  }): Promise<void> {
    await sql`UPDATE sales_invoices
       SET paid_total = ${input.paidTotal},
           payment_status = ${input.paymentStatus},
           updated_by_user_id = ${input.updatedByUserId ?? null},
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ${input.companyId}
         AND id = ${input.invoiceId}`.execute(this._getDb());
  }

  async listPayments(companyId: number, filters: {
    outletIds?: readonly number[];
    status?: "DRAFT" | "POSTED" | "VOID";
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
    timezone?: string;
  }): Promise<{ total: number; payments: Array<{
    id: number;
    company_id: number;
    outlet_id: number;
    invoice_id: number;
    payment_no: string;
    client_ref?: string | null;
    payment_at: string;
    account_id: number;
    account_name?: string | null;
    method?: "CASH" | "QRIS" | "CARD" | null;
    status: "DRAFT" | "POSTED" | "VOID";
    amount: number;
    actual_amount_idr?: number | null;
    invoice_amount_idr?: number | null;
    payment_amount_idr?: number | null;
    payment_delta_idr?: number | null;
    shortfall_settled_as_loss?: boolean | null;
    shortfall_reason?: string | null;
    shortfall_settled_by_user_id?: number | null;
    shortfall_settled_at?: string | null;
    fx_acknowledged_at?: string | null;
    fx_acknowledged_by?: number | null;
    created_by_user_id?: number | null;
    updated_by_user_id?: number | null;
    created_at: string;
    updated_at: string;
  }> }> {
    const db = this._getDb();
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    // Build WHERE conditions dynamically
    const conditions: Array<ReturnType<typeof sql>> = [sql`sp.company_id = ${companyId}`];

    if (filters.outletIds && filters.outletIds.length > 0) {
      conditions.push(sql`sp.outlet_id IN (${sql.join(filters.outletIds.map(id => sql`${id}`), sql`, `)})`);
    }

    if (filters.status) {
      conditions.push(sql`sp.status = ${filters.status}`);
    }

    if (filters.dateFrom) {
      conditions.push(sql`sp.payment_at >= ${filters.dateFrom}`);
    }

    if (filters.dateTo) {
      conditions.push(sql`sp.payment_at <= ${filters.dateTo}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const countResult = await sql`SELECT COUNT(*) as total
       FROM sales_payments sp
       WHERE ${whereClause}`.execute(db);
    const total = Number((countResult.rows[0] as { total?: number }).total ?? 0);

    const rowsResult = await sql`SELECT sp.id, sp.company_id, sp.outlet_id, sp.invoice_id, sp.payment_no, sp.client_ref, sp.payment_at,
            sp.account_id, a.name as account_name, sp.method, sp.status,
            sp.amount, sp.invoice_amount_idr, sp.payment_amount_idr, sp.payment_delta_idr,
            sp.shortfall_settled_as_loss, sp.shortfall_reason, sp.shortfall_settled_by_user_id, sp.shortfall_settled_at,
            sp.fx_acknowledged_at, sp.fx_acknowledged_by,
            sp.created_by_user_id, sp.updated_by_user_id, sp.created_at, sp.updated_at
     FROM sales_payments sp
     LEFT JOIN accounts a ON a.id = sp.account_id AND a.company_id = sp.company_id
     WHERE ${whereClause}
     ORDER BY sp.payment_at DESC, sp.id DESC
     LIMIT ${limit} OFFSET ${offset}`.execute(db);

    // Batch fetch splits for all payments
    const paymentIds = (rowsResult.rows as Array<{ id: number }>).map(r => Number(r.id));
    const splitsByPaymentId = await this.findPaymentSplitsForMultiple(companyId, paymentIds);

    const payments = (rowsResult.rows as Array<{
      id: number;
      company_id: number;
      outlet_id: number;
      invoice_id: number;
      payment_no: string;
      client_ref?: string | null;
      payment_at: string;
      account_id: number;
      account_name?: string | null;
      method?: string | null;
      status: string;
      amount: string | number;
      actual_amount_idr?: string | number | null;
      invoice_amount_idr?: string | number | null;
      payment_amount_idr?: string | number | null;
      payment_delta_idr?: string | number | null;
      shortfall_settled_as_loss?: number | null;
      shortfall_reason?: string | null;
      shortfall_settled_by_user_id?: number | null;
      shortfall_settled_at?: string | null;
      fx_acknowledged_at?: string | null;
      fx_acknowledged_by?: number | null;
      created_by_user_id?: number | null;
      updated_by_user_id?: number | null;
      created_at: string;
      updated_at: string;
    }>).map(row => {
      const payment = {
        id: Number(row.id),
        company_id: Number(row.company_id),
        outlet_id: Number(row.outlet_id),
        invoice_id: Number(row.invoice_id),
        payment_no: row.payment_no,
        client_ref: row.client_ref ?? undefined,
        payment_at: row.payment_at,
        account_id: Number(row.account_id),
        account_name: row.account_name ?? undefined,
        method: (row.method ?? undefined) as "CASH" | "QRIS" | "CARD" | null,
        status: row.status as "DRAFT" | "POSTED" | "VOID",
        amount: Number(row.amount),
        actual_amount_idr: row.actual_amount_idr !== undefined && row.actual_amount_idr !== null ? Number(row.actual_amount_idr) : undefined,
        invoice_amount_idr: row.invoice_amount_idr !== undefined && row.invoice_amount_idr !== null ? Number(row.invoice_amount_idr) : undefined,
        payment_amount_idr: row.payment_amount_idr !== undefined && row.payment_amount_idr !== null ? Number(row.payment_amount_idr) : undefined,
        payment_delta_idr: row.payment_delta_idr !== undefined && row.payment_delta_idr !== null ? Number(row.payment_delta_idr) : undefined,
        shortfall_settled_as_loss: row.shortfall_settled_as_loss === 1 ? true : row.shortfall_settled_as_loss === 0 ? false : undefined,
        shortfall_reason: row.shortfall_reason ?? undefined,
        shortfall_settled_by_user_id: row.shortfall_settled_by_user_id ? Number(row.shortfall_settled_by_user_id) : undefined,
        shortfall_settled_at: row.shortfall_settled_at ?? undefined,
        fx_acknowledged_at: row.fx_acknowledged_at ?? undefined,
        fx_acknowledged_by: row.fx_acknowledged_by ? Number(row.fx_acknowledged_by) : undefined,
        created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : undefined,
        updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : undefined,
        created_at: row.created_at,
        updated_at: row.updated_at
      };

      const splits = splitsByPaymentId.get(payment.id);
      if (splits && splits.length > 0) {
        return { ...payment, splits };
      }
      return payment;
    });

    return { total, payments };
  }

  // Credit Note operations
  async findCreditNoteById(companyId: number, creditNoteId: number, forUpdate?: boolean): Promise<{
    id: number;
    company_id: number;
    outlet_id: number;
    invoice_id: number;
    credit_note_no: string;
    credit_note_date: string;
    client_ref: string | null;
    status: SalesCreditNoteStatus;
    reason: string | null;
    notes: string | null;
    amount: number;
    customer_id?: number | null;
    created_by_user_id: number | null;
    updated_by_user_id: number | null;
    created_at: string;
    updated_at: string;
    lines: Array<{
      id: number;
      credit_note_id: number;
      line_no: number;
      description: string;
      qty: number;
      unit_price: number;
      line_total: number;
    }>;
  } | null> {
    const forUpdateClause = forUpdate ? sql` FOR UPDATE` : sql``;
    const rows = await sql`SELECT id, company_id, outlet_id, invoice_id, credit_note_no, credit_note_date,
            client_ref, status, reason, notes, amount, customer_id, created_by_user_id, updated_by_user_id,
            created_at, updated_at
     FROM sales_credit_notes
     WHERE company_id = ${companyId} AND id = ${creditNoteId}
     LIMIT 1${forUpdateClause}`.execute(this._getDb());

    if (rows.rows.length === 0) {
      return null;
    }

    const creditNote = rows.rows[0] as {
      id: number;
      company_id: number;
      outlet_id: number;
      invoice_id: number;
      credit_note_no: string;
      credit_note_date: string;
      client_ref: string | null;
      status: string;
      reason: string | null;
      notes: string | null;
      amount: string | number;
      customer_id?: number | null;
      created_by_user_id: number | null;
      updated_by_user_id: number | null;
      created_at: string;
      updated_at: string;
    };

    const lineRows = await sql`SELECT id, credit_note_id, line_no, description, qty, unit_price, line_total
     FROM sales_credit_note_lines
     WHERE credit_note_id = ${creditNoteId}
     ORDER BY line_no`.execute(this._getDb());

    return {
      id: creditNote.id,
      company_id: creditNote.company_id,
      outlet_id: creditNote.outlet_id,
      invoice_id: creditNote.invoice_id,
      credit_note_no: creditNote.credit_note_no,
      credit_note_date: formatDateOnly(creditNote.credit_note_date),
      client_ref: creditNote.client_ref ?? null,
      status: creditNote.status as SalesCreditNoteStatus,
      reason: creditNote.reason ?? null,
      notes: creditNote.notes ?? null,
      amount: Number(creditNote.amount),
      customer_id: creditNote.customer_id != null ? Number(creditNote.customer_id) : undefined,
      created_by_user_id: creditNote.created_by_user_id ?? null,
      updated_by_user_id: creditNote.updated_by_user_id ?? null,
      created_at: creditNote.created_at,
      updated_at: creditNote.updated_at,
      lines: (lineRows.rows as Array<{
        id: number;
        credit_note_id: number;
        line_no: number;
        description: string;
        qty: string | number;
        unit_price: string | number;
        line_total: string | number;
      }>).map(line => ({
        id: line.id,
        credit_note_id: line.credit_note_id,
        line_no: line.line_no,
        description: line.description,
        qty: Number(line.qty),
        unit_price: Number(line.unit_price),
        line_total: Number(line.line_total)
      }))
    };
  }

  async findCreditNoteByClientRef(companyId: number, clientRef: string): Promise<{
    id: number;
    company_id: number;
    outlet_id: number;
    invoice_id: number;
    credit_note_no: string;
    credit_note_date: string;
    client_ref: string | null;
    status: string;
    reason: string | null;
    notes: string | null;
    amount: number;
    created_by_user_id: number | null;
    updated_by_user_id: number | null;
    created_at: string;
    updated_at: string;
  } | null> {
    const rows = await sql`SELECT id, company_id, outlet_id, invoice_id, credit_note_no, credit_note_date,
            client_ref, status, reason, notes, amount, created_by_user_id, updated_by_user_id,
            created_at, updated_at
     FROM sales_credit_notes
     WHERE company_id = ${companyId} AND client_ref = ${clientRef}
     LIMIT 1`.execute(this._getDb());

    if (rows.rows.length === 0) {
      return null;
    }

    const creditNote = rows.rows[0] as {
      id: number;
      company_id: number;
      outlet_id: number;
      invoice_id: number;
      credit_note_no: string;
      credit_note_date: string;
      client_ref: string | null;
      status: string;
      reason: string | null;
      notes: string | null;
      amount: string | number;
      created_by_user_id: number | null;
      updated_by_user_id: number | null;
      created_at: string;
      updated_at: string;
    };

    return {
      id: creditNote.id,
      company_id: creditNote.company_id,
      outlet_id: creditNote.outlet_id,
      invoice_id: creditNote.invoice_id,
      credit_note_no: creditNote.credit_note_no,
      credit_note_date: formatDateOnly(creditNote.credit_note_date),
      client_ref: creditNote.client_ref ?? null,
      status: creditNote.status,
      reason: creditNote.reason ?? null,
      notes: creditNote.notes ?? null,
      amount: Number(creditNote.amount),
      created_by_user_id: creditNote.created_by_user_id ?? null,
      updated_by_user_id: creditNote.updated_by_user_id ?? null,
      created_at: creditNote.created_at,
      updated_at: creditNote.updated_at
    };
  }

  async findCreditNoteLines(creditNoteId: number): Promise<Array<{
    id: number;
    credit_note_id: number;
    line_no: number;
    description: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }>> {
    const rows = await sql`SELECT id, credit_note_id, line_no, description, qty, unit_price, line_total
     FROM sales_credit_note_lines
     WHERE credit_note_id = ${creditNoteId}
     ORDER BY line_no`.execute(this._getDb());

    return (rows.rows as Array<{
      id: number;
      credit_note_id: number;
      line_no: number;
      description: string;
      qty: string | number;
      unit_price: string | number;
      line_total: string | number;
    }>).map(line => ({
      id: line.id,
      credit_note_id: line.credit_note_id,
      line_no: line.line_no,
      description: line.description,
      qty: Number(line.qty),
      unit_price: Number(line.unit_price),
      line_total: Number(line.line_total)
    }));
  }

  async getCreditNoteCapacity(companyId: number, invoiceId: number, excludeCreditNoteId?: number): Promise<{
    grand_total: number;
    already_credited: number;
    remaining: number;
  }> {
    // Lock the invoice row first
    await sql`SELECT grand_total FROM sales_invoices
     WHERE company_id = ${companyId} AND id = ${invoiceId} AND status = 'POSTED'
     FOR UPDATE`.execute(this._getDb());

    const invoiceRows = await sql`SELECT grand_total FROM sales_invoices
     WHERE company_id = ${companyId} AND id = ${invoiceId} AND status = 'POSTED'
     FOR UPDATE`.execute(this._getDb());

    if (invoiceRows.rows.length === 0) {
      throw new Error("Invoice not found or not posted");
    }

    const grandTotal = Number((invoiceRows.rows[0] as { grand_total: string | number }).grand_total);

    // Lock individual credit note rows
    const excludeClause = excludeCreditNoteId ? sql` AND id != ${excludeCreditNoteId}` : sql``;
    await sql`SELECT id FROM sales_credit_notes
     WHERE company_id = ${companyId} AND invoice_id = ${invoiceId} AND status = 'POSTED'
     ${excludeClause}
     FOR UPDATE`.execute(this._getDb());

    // Calculate the sum
    const creditRows = await sql`SELECT COALESCE(SUM(amount), 0) as total
     FROM sales_credit_notes
     WHERE company_id = ${companyId} AND invoice_id = ${invoiceId} AND status = 'POSTED'
     ${excludeClause}`.execute(this._getDb());

    const alreadyCredited = Number((creditRows.rows[0] as { total: string | number }).total ?? 0);
    const remaining = Math.max(0, grandTotal - alreadyCredited);

    return { grand_total: grandTotal, already_credited: alreadyCredited, remaining };
  }

  async insertCreditNote(input: {
    companyId: number;
    outletId: number;
    invoiceId: number;
    creditNoteNo: string;
    creditNoteDate: string;
    status: string;
    clientRef?: string;
    reason?: string;
    notes?: string;
    amount: number;
    customerId?: number | null;
    createdByUserId?: number;
  }): Promise<number> {
    const result = await sql`INSERT INTO sales_credit_notes (
        company_id, outlet_id, invoice_id, credit_note_no, credit_note_date,
        status, client_ref, reason, notes, amount, customer_id, created_by_user_id, updated_by_user_id
      ) VALUES (${input.companyId}, ${input.outletId}, ${input.invoiceId}, ${input.creditNoteNo}, ${input.creditNoteDate},
        ${input.status}, ${input.clientRef ?? null}, ${input.reason ?? null}, ${input.notes ?? null},
        ${input.amount}, ${input.customerId ?? null}, ${input.createdByUserId ?? null}, ${input.createdByUserId ?? null})`.execute(this._getDb());

    return Number(result.insertId);
  }

  async insertCreditNoteLine(input: {
    creditNoteId: number;
    companyId: number;
    outletId: number;
    lineNo: number;
    description: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }): Promise<void> {
    await sql`INSERT INTO sales_credit_note_lines (
        credit_note_id, company_id, outlet_id, line_no, description, qty, unit_price, line_total
      ) VALUES (${input.creditNoteId}, ${input.companyId}, ${input.outletId}, ${input.lineNo},
        ${input.description}, ${input.qty}, ${input.unitPrice}, ${input.lineTotal})`.execute(this._getDb());
  }

  async updateCreditNote(input: {
    companyId: number;
    creditNoteId: number;
    creditNoteDate?: string;
    reason?: string;
    notes?: string;
    amount?: number;
    customerId?: number | null;
    updatedByUserId?: number;
  }): Promise<void> {
    const updates: Array<ReturnType<typeof sql>> = [sql`updated_by_user_id = ${input.updatedByUserId ?? null}`, sql`updated_at = CURRENT_TIMESTAMP`];

    if (input.creditNoteDate) {
      updates.push(sql`credit_note_date = ${input.creditNoteDate}`);
    }

    if (input.reason !== undefined) {
      updates.push(sql`reason = ${input.reason ?? null}`);
    }

    if (input.notes !== undefined) {
      updates.push(sql`notes = ${input.notes ?? null}`);
    }

    if (input.amount !== undefined) {
      updates.push(sql`amount = ${input.amount}`);
    }

    if (input.customerId !== undefined) {
      updates.push(sql`customer_id = ${input.customerId}`);
    }

    await sql`UPDATE sales_credit_notes SET ${sql.join(updates, sql`, `)} WHERE company_id = ${input.companyId} AND id = ${input.creditNoteId}`.execute(this._getDb());
  }

  async updateCreditNoteStatus(companyId: number, creditNoteId: number, status: string, updatedByUserId?: number): Promise<void> {
    await sql`UPDATE sales_credit_notes
     SET status = ${status},
         updated_by_user_id = ${updatedByUserId ?? null},
         updated_at = CURRENT_TIMESTAMP
     WHERE company_id = ${companyId} AND id = ${creditNoteId}`.execute(this._getDb());
  }

  async deleteCreditNoteLines(creditNoteId: number): Promise<void> {
    await sql`DELETE FROM sales_credit_note_lines WHERE credit_note_id = ${creditNoteId}`.execute(this._getDb());
  }

  async listCreditNotes(companyId: number, filters: {
    outletIds?: readonly number[];
    invoiceId?: number;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
    timezone?: string;
  }): Promise<{ total: number; creditNotes: Array<{
    id: number;
    company_id: number;
    outlet_id: number;
    invoice_id: number;
    credit_note_no: string;
    credit_note_date: string;
    client_ref: string | null;
    status: SalesCreditNoteStatus;
    reason: string | null;
    notes: string | null;
    amount: number;
    customer_id?: number | null;
    created_by_user_id: number | null;
    updated_by_user_id: number | null;
    created_at: string;
    updated_at: string;
    lines: Array<{
      id: number;
      credit_note_id: number;
      line_no: number;
      description: string;
      qty: number;
      unit_price: number;
      line_total: number;
    }>;
  }> }> {
    const db = this._getDb();
    const conditions: Array<ReturnType<typeof sql>> = [sql`company_id = ${companyId}`];

    if (filters.outletIds && filters.outletIds.length > 0) {
      conditions.push(sql`outlet_id IN (${sql.join(filters.outletIds.map(id => sql`${id}`), sql`, `)})`);
    }

    if (filters.invoiceId) {
      conditions.push(sql`invoice_id = ${filters.invoiceId}`);
    }

    if (filters.status) {
      conditions.push(sql`status = ${filters.status}`);
    }

    if (filters.dateFrom) {
      conditions.push(sql`credit_note_date >= ${filters.dateFrom}`);
    }

    if (filters.dateTo) {
      conditions.push(sql`credit_note_date <= ${filters.dateTo}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const countResult = await sql`SELECT COUNT(*) as total FROM sales_credit_notes WHERE ${whereClause}`.execute(db);

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const rows = await sql`SELECT id, company_id, outlet_id, invoice_id, credit_note_no, credit_note_date,
            client_ref, status, reason, notes, amount, customer_id, created_by_user_id, updated_by_user_id,
            created_at, updated_at
     FROM sales_credit_notes
     WHERE ${whereClause}
     ORDER BY id DESC
     LIMIT ${limit} OFFSET ${offset}`.execute(db);

    const creditNotes: Array<{
      id: number;
      company_id: number;
      outlet_id: number;
      invoice_id: number;
      credit_note_no: string;
      credit_note_date: string;
      client_ref: string | null;
      status: SalesCreditNoteStatus;
      reason: string | null;
      notes: string | null;
      amount: number;
      customer_id?: number | null;
      created_by_user_id: number | null;
      updated_by_user_id: number | null;
      created_at: string;
      updated_at: string;
      lines: Array<{
        id: number;
        credit_note_id: number;
        line_no: number;
        description: string;
        qty: number;
        unit_price: number;
        line_total: number;
      }>;
    }> = [];

    for (const row of rows.rows as Array<{
      id: number;
      company_id: number;
      outlet_id: number;
      invoice_id: number;
      credit_note_no: string;
      credit_note_date: string;
      client_ref: string | null;
      status: string;
      reason: string | null;
      notes: string | null;
      amount: string | number;
      customer_id?: number | null;
      created_by_user_id: number | null;
      updated_by_user_id: number | null;
      created_at: string;
      updated_at: string;
    }>) {
      const lines = await this.findCreditNoteLines(row.id);
      creditNotes.push({
        id: row.id,
        company_id: row.company_id,
        outlet_id: row.outlet_id,
        invoice_id: row.invoice_id,
        credit_note_no: row.credit_note_no,
        credit_note_date: formatDateOnly(row.credit_note_date),
        client_ref: row.client_ref ?? null,
        status: row.status as SalesCreditNoteStatus,
        reason: row.reason ?? null,
        notes: row.notes ?? null,
        amount: Number(row.amount),
        customer_id: row.customer_id != null ? Number(row.customer_id) : undefined,
        created_by_user_id: row.created_by_user_id ?? null,
        updated_by_user_id: row.updated_by_user_id ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        lines
      });
    }

    return { total: Number((countResult.rows[0] as { total: string | number }).total), creditNotes };
  }

  // List operations
  async listOrders(companyId: number, filters: OrderListFilters): Promise<{ total: number; orders: SalesOrderDetail[] }> {
    const db = this._getDb();
    
    // Handle timezone conversion for date range
    let dateFrom = filters.dateFrom;
    let dateTo = filters.dateTo;

    if (dateFrom && dateTo && filters.timezone && filters.timezone !== 'UTC') {
      const range = toDateTimeRangeWithTimezone(dateFrom, dateTo, filters.timezone);
      dateFrom = range.fromStartUTC.slice(0, 10);
      dateTo = range.toEndUTC.slice(0, 10);
    }

    // Build query
    let countQuery = db
      .selectFrom("sales_orders")
      .where("company_id", "=", companyId);

    let baseQuery = db
      .selectFrom("sales_orders")
      .where("company_id", "=", companyId);

    if (filters.outletIds && filters.outletIds.length > 0) {
      countQuery = countQuery.where("outlet_id", "in", filters.outletIds);
      baseQuery = baseQuery.where("outlet_id", "in", filters.outletIds);
    }

    if (filters.status) {
      countQuery = countQuery.where("status", "=", filters.status);
      baseQuery = baseQuery.where("status", "=", filters.status);
    }

    if (dateFrom) {
      const fromDate = new Date(`${dateFrom}T00:00:00.000Z`);
      countQuery = countQuery.where("order_date", ">=", fromDate);
      baseQuery = baseQuery.where("order_date", ">=", fromDate);
    }

    if (dateTo) {
      const toDate = new Date(`${dateTo}T00:00:00.000Z`);
      countQuery = countQuery.where("order_date", "<=", toDate);
      baseQuery = baseQuery.where("order_date", "<=", toDate);
    }

    const countResult = await countQuery
      .select((eb) => eb.fn.countAll().as("total"))
      .executeTakeFirst();

    const total = countResult ? Number((countResult as { total?: number | string }).total ?? 0) : 0;

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const orderResult = await baseQuery
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .selectAll()
      .execute();

    const orders: SalesOrderDetail[] = [];
    for (const row of orderResult as unknown as SalesOrderRow[]) {
      const lines = await this.findOrderLines(row.id);
      const normalizedLines = lines.map(line => ({
        id: line.id,
        order_id: line.order_id,
        line_no: line.line_no,
        line_type: line.line_type,
        item_id: line.item_id !== null ? Number(line.item_id) : null,
        description: line.description,
        qty: Number(line.qty),
        unit_price: Number(line.unit_price),
        line_total: Number(line.line_total)
      }));

      orders.push({
        id: row.id,
        company_id: row.company_id,
        outlet_id: row.outlet_id,
        order_no: row.order_no,
        client_ref: row.client_ref ?? undefined,
        order_date: formatDateOnly(row.order_date),
        expected_date: row.expected_date ? formatDateOnly(row.expected_date) : null,
        status: row.status,
        notes: row.notes ?? null,
        subtotal: Number(row.subtotal),
        tax_amount: Number(row.tax_amount),
        grand_total: Number(row.grand_total),
        confirmed_by_user_id: row.confirmed_by_user_id,
        confirmed_at: row.confirmed_at ?? undefined,
        completed_by_user_id: row.completed_by_user_id,
        completed_at: row.completed_at ?? undefined,
        created_by_user_id: row.created_by_user_id,
        updated_by_user_id: row.updated_by_user_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        lines: normalizedLines
      });
    }

    return { total, orders };
  }

  async listInvoices(companyId: number, filters: unknown): Promise<{ total: number; invoices: SalesInvoice[] }> {
    const db = this._getDb();
    const f = filters as InvoiceListFilters;
    
    const limit = f.limit ?? 50;
    const offset = f.offset ?? 0;

    // Handle timezone conversion for date range
    let dateFrom = f.dateFrom;
    let dateTo = f.dateTo;

    if (dateFrom && dateTo && f.timezone && f.timezone !== 'UTC') {
      const range = toDateTimeRangeWithTimezone(dateFrom, dateTo, f.timezone);
      dateFrom = range.fromStartUTC.slice(0, 10);
      dateTo = range.toEndUTC.slice(0, 10);
    }

    // Build WHERE clause dynamically
    const conditions: Array<ReturnType<typeof sql>> = [sql`company_id = ${companyId}`];

    if (f.outletIds) {
      if (f.outletIds.length === 0) {
        return { total: 0, invoices: [] };
      }
      conditions.push(sql`outlet_id IN (${sql.join(f.outletIds.map(id => sql`${id}`), sql`, `)})`);
    }

    if (f.status) {
      conditions.push(sql`status = ${f.status}`);
    }

    if (f.paymentStatus) {
      conditions.push(sql`payment_status = ${f.paymentStatus}`);
    }

    if (dateFrom) {
      conditions.push(sql`invoice_date >= ${dateFrom}`);
    }

    if (dateTo) {
      conditions.push(sql`invoice_date <= ${dateTo}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const countResult = await sql`SELECT COUNT(*) as total FROM sales_invoices WHERE ${whereClause}`.execute(db);
    const total = Number((countResult.rows[0] as { total?: number }).total ?? 0);

    const rows = await sql`SELECT id, company_id, outlet_id, invoice_no, client_ref, invoice_date, due_date, status, payment_status,
            subtotal, tax_amount, grand_total, paid_total,
            approved_by_user_id, approved_at,
            created_by_user_id, updated_by_user_id, created_at, updated_at
     FROM sales_invoices
     WHERE ${whereClause}
     ORDER BY invoice_date DESC, id DESC
     LIMIT ${limit} OFFSET ${offset}`.execute(db);

    return { 
      total, 
      invoices: (rows.rows as SalesInvoiceRow[]).map(normalizeInvoice)
    };
  }
}

/**
 * ApiSalesDb
 * 
 * Implements SalesDb interface with full transaction support.
 * This is the main entry point for the modules-sales package.
 */
export class ApiSalesDb implements SalesDb {
  readonly executor: ApiSalesDbExecutor;

  constructor(executor: ApiSalesDbExecutor) {
    this.executor = executor;
  }

  async withTransaction<T>(operation: (executor: SalesDbExecutor) => Promise<T>): Promise<T> {
    const db = getDb();
    return withTransactionRetry(db, async (trx) => {
      // Set the transaction on the executor so all operations use it
      this.executor.setTransaction(trx);
      try {
        return await operation(this.executor);
      } finally {
        // Clear the transaction after the operation completes
        this.executor.setTransaction(null);
      }
    });
  }
}

/**
 * Create an ApiSalesDb instance.
 * This is the main factory function for creating a SalesDb implementation.
 */
export function createApiSalesDb(): SalesDb {
  const db = getDb();
  const executor = new ApiSalesDbExecutor(db);
  return new ApiSalesDb(executor);
}
