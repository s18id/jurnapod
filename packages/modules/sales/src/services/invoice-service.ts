// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Invoice Service
 * 
 * Sales invoice orchestration service.
 * This service handles invoice CRUD operations, posting, and lifecycle management.
 * 
 * IMPORTANT: This service does NOT import @/lib/auth or @/lib/db directly.
 * ACL checks are performed via the injected AccessScopeChecker interface.
 * Database access is performed via the injected SalesDb interface.
 * Posting integration uses modules-accounting interfaces.
 */

import type { AccessScopeChecker } from "../interfaces/access-scope-checker.js";
import {
  SalesPermissions
} from "../interfaces/access-scope-checker.js";
import type {
  SalesInvoiceDetail,
  InvoiceListFilters,
  InvoiceLineInput,
  InvoiceTaxInput,
  InvoiceDueTerm,
  InvoiceCreateInput,
  MutationActor,
  ItemLookup,
  SalesInvoice,
  SalesInvoiceLine,
  SalesInvoiceTax,
  InvoiceStatusError
} from "../types/invoices.js";
import { DiscountExceedsSubtotalError } from "../types/invoices.js";
import type { SalesDb, SalesDbExecutor } from "./sales-db.js";
import { resolveDueDate } from "./order-service.js";

// Re-export error types
export type { SalesAuthorizationError } from "../interfaces/access-scope-checker.js";

// =============================================================================
// Error Classes
// =============================================================================

export class DatabaseConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConflictError";
  }
}

export class DatabaseReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseReferenceError";
  }
}

export class DatabaseForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseForbiddenError";
  }
}

// =============================================================================
// Money Helpers (internal to module)
// =============================================================================

const MONEY_SCALE = 100;

function normalizeMoney(value: number): number {
  return Math.round(value * MONEY_SCALE) / MONEY_SCALE;
}

function sumMoney(values: number[]): number {
  return normalizeMoney(values.reduce((acc, val) => acc + val, 0));
}

// =============================================================================
// Date Helpers (internal to module)
// =============================================================================

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

// =============================================================================
// Invoice Line Builder
// =============================================================================

interface PreparedInvoiceLine {
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

function buildInvoiceLines(
  lines: readonly InvoiceLineInput[],
  itemLookups: Map<number, ItemLookup>
): {
  lineRows: PreparedInvoiceLine[];
  subtotal: number;
} {
  const lineRows: PreparedInvoiceLine[] = [];

  for (const [index, line] of lines.entries()) {
    const lineType = line.line_type ?? "SERVICE";
    const itemId = line.item_id ?? null;

    let description = line.description;
    let unitPrice = line.unit_price;

    // Auto-populate from item if PRODUCT and fields are missing/empty
    if (lineType === "PRODUCT" && itemId !== null) {
      const item = itemLookups.get(itemId);
      if (item) {
        if (!description || description.trim() === "") {
          description = item.name;
        }
        if (unitPrice === 0 && item.default_price !== null) {
          unitPrice = item.default_price;
        }
      }
    }

    const lineTotal = normalizeMoney(line.qty * unitPrice);
    lineRows.push({
      line_no: index + 1,
      line_type: lineType,
      item_id: itemId,
      description: description.trim(),
      qty: line.qty,
      unit_price: unitPrice,
      line_total: lineTotal
    });
  }

  const subtotal = sumMoney(lineRows.map((line) => line.line_total));
  return { lineRows, subtotal };
}

// =============================================================================
// Normalization Helpers
// =============================================================================

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
  customer_id?: number | null;
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
    customer_id: row.customer_id != null ? Number(row.customer_id) : undefined,
    approved_by_user_id: row.approved_by_user_id ? Number(row.approved_by_user_id) : undefined,
    approved_at: row.approved_at ?? undefined,
    created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : undefined,
    updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeInvoiceLine(row: SalesInvoiceLineRow): SalesInvoiceLine {
  return {
    id: Number(row.id),
    invoice_id: Number(row.invoice_id),
    line_no: Number(row.line_no),
    line_type: row.line_type,
    item_id: row.item_id !== null ? Number(row.item_id) : null,
    description: row.description,
    qty: Number(row.qty),
    unit_price: Number(row.unit_price),
    line_total: Number(row.line_total)
  };
}

function normalizeInvoiceTax(row: SalesInvoiceTaxRow): SalesInvoiceTax {
  return {
    id: Number(row.id),
    invoice_id: Number(row.invoice_id),
    tax_rate_id: Number(row.tax_rate_id),
    amount: Number(row.amount)
  };
}

// =============================================================================
// Invoice Service Interface
// =============================================================================

export interface InvoiceService {
  listInvoices(
    companyId: number,
    filters: InvoiceListFilters
  ): Promise<{ total: number; invoices: SalesInvoice[] }>;

  getInvoice(
    companyId: number,
    invoiceId: number,
    actor?: MutationActor
  ): Promise<SalesInvoiceDetail | null>;

  createInvoice(
    companyId: number,
    input: InvoiceCreateInput,
    actor?: MutationActor
  ): Promise<SalesInvoiceDetail>;

  updateInvoice(
    companyId: number,
    invoiceId: number,
    input: {
      outlet_id?: number;
      customer_id?: number | null;
      invoice_no?: string;
      invoice_date?: string;
      due_date?: string;
      due_term?: InvoiceDueTerm;
      tax_amount?: number;
      lines?: InvoiceLineInput[];
      taxes?: InvoiceTaxInput[];
      discount_percent?: number | null;
      discount_fixed?: number | null;
    },
    actor?: MutationActor
  ): Promise<SalesInvoiceDetail | null>;

  postInvoice(
    companyId: number,
    invoiceId: number,
    actor?: MutationActor
  ): Promise<SalesInvoiceDetail | null>;

  approveInvoice(
    companyId: number,
    invoiceId: number,
    actor?: MutationActor
  ): Promise<SalesInvoiceDetail | null>;

  voidInvoice(
    companyId: number,
    invoiceId: number,
    actor?: MutationActor
  ): Promise<SalesInvoiceDetail | null>;
}

export interface InvoiceServiceDeps {
  db: SalesDb;
  accessScopeChecker: AccessScopeChecker;
}

// =============================================================================
// Invoice Service Factory
// =============================================================================

export function createInvoiceService(deps: InvoiceServiceDeps): InvoiceService {
  const { db, accessScopeChecker } = deps;

  async function withTransaction<T>(operation: (executor: SalesDbExecutor) => Promise<T>): Promise<T> {
    return db.withTransaction(operation);
  }

  async function ensureOutletExists(executor: SalesDbExecutor, companyId: number, outletId: number): Promise<void> {
    const exists = await executor.outletExists(companyId, outletId);
    if (!exists) {
      throw new DatabaseReferenceError("Outlet not found");
    }
  }

  async function findInvoiceById(
    executor: SalesDbExecutor,
    companyId: number,
    invoiceId: number,
    options?: { forUpdate?: boolean }
  ): Promise<SalesInvoiceRow | null> {
    return executor.findInvoiceById(companyId, invoiceId, options?.forUpdate) as Promise<SalesInvoiceRow | null>;
  }

  async function findInvoiceByClientRef(
    executor: SalesDbExecutor,
    companyId: number,
    clientRef: string
  ): Promise<SalesInvoiceDetail | null> {
    return executor.findInvoiceByClientRef(companyId, clientRef) as Promise<SalesInvoiceDetail | null>;
  }

  async function findInvoiceLines(
    executor: SalesDbExecutor,
    companyId: number,
    invoiceId: number
  ): Promise<SalesInvoiceLine[]> {
    return (await executor.findInvoiceLines(companyId, invoiceId)) as SalesInvoiceLine[];
  }

  async function findInvoiceTaxes(
    executor: SalesDbExecutor,
    companyId: number,
    invoiceId: number
  ): Promise<SalesInvoiceTax[]> {
    return (await executor.findInvoiceTaxes(companyId, invoiceId)) as SalesInvoiceTax[];
  }

  async function findItemById(
    executor: SalesDbExecutor,
    companyId: number,
    itemId: number
  ): Promise<ItemLookup | null> {
    return executor.findItemById(companyId, itemId);
  }

  async function getNextInvoiceNumber(
    executor: SalesDbExecutor,
    companyId: number,
    outletId: number,
    preferredNo?: string
  ): Promise<string> {
    return executor.getNextDocumentNumber(companyId, outletId, "SALES_INVOICE", preferredNo);
  }

  async function validateTaxRates(
    executor: SalesDbExecutor,
    companyId: number,
    taxRateIds: number[]
  ): Promise<void> {
    const valid = await executor.validateTaxRates(companyId, taxRateIds);
    if (!valid) {
      throw new DatabaseReferenceError("Invalid tax rate");
    }
  }

  async function getDefaultTaxRates(
    executor: SalesDbExecutor,
    companyId: number
  ): Promise<Array<{ tax_rate_id: number; rate_percent: number }>> {
    return executor.getDefaultTaxRates(companyId);
  }

  return {
    async listInvoices(
      companyId: number,
      filters: InvoiceListFilters
    ): Promise<{ total: number; invoices: SalesInvoice[] }> {
      const result = await db.executor.listInvoices(companyId, filters);
      return {
        total: result.total,
        invoices: result.invoices as SalesInvoice[]
      };
    },

    async getInvoice(
      companyId: number,
      invoiceId: number,
      actor?: MutationActor
    ): Promise<SalesInvoiceDetail | null> {
      const executor = db.executor;
      
      const invoice = await findInvoiceById(executor, companyId, invoiceId);
      if (!invoice) {
        return null;
      }

      if (actor) {
        await accessScopeChecker.assertOutletAccess({
          actorUserId: actor.userId,
          companyId,
          outletId: invoice.outlet_id,
          permission: SalesPermissions.READ_INVOICE
        });
      }

      const [lines, taxes] = await Promise.all([
        findInvoiceLines(executor, companyId, invoiceId),
        findInvoiceTaxes(executor, companyId, invoiceId)
      ]);

      return {
        ...normalizeInvoice(invoice),
        lines,
        taxes
      };
    },

    async createInvoice(
      companyId: number,
      input: InvoiceCreateInput,
      actor?: MutationActor
    ): Promise<SalesInvoiceDetail> {
      return withTransaction(async (executor) => {
        if (actor) {
          await accessScopeChecker.assertOutletAccess({
            actorUserId: actor.userId,
            companyId,
            outletId: input.outlet_id,
            permission: SalesPermissions.CREATE_INVOICE
          });
        }

        // Check for duplicate client_ref
        if (input.client_ref) {
          const existing = await findInvoiceByClientRef(executor, companyId, input.client_ref);
          if (existing) {
            if (actor) {
              await accessScopeChecker.assertOutletAccess({
                actorUserId: actor.userId,
                companyId,
                outletId: existing.outlet_id,
                permission: SalesPermissions.READ_INVOICE
              });
            }
            return existing;
          }
        }

        await ensureOutletExists(executor, companyId, input.outlet_id);
        if (actor) {
          await accessScopeChecker.assertOutletAccess({
            actorUserId: actor.userId,
            companyId,
            outletId: input.outlet_id,
            permission: SalesPermissions.CREATE_INVOICE
          });
        }

        // Validate and fetch items for PRODUCT lines
        const itemLookups = new Map<number, ItemLookup>();
        for (const line of input.lines) {
          const lineType = line.line_type ?? "SERVICE";
          if (lineType === "PRODUCT" && line.item_id) {
            const item = await findItemById(executor, companyId, line.item_id);
            if (item) {
              itemLookups.set(item.id, item);
            }
          }
        }

        const invoiceNo = await getNextInvoiceNumber(executor, companyId, input.outlet_id, input.invoice_no);
        const dueDate = resolveDueDate({
          invoiceDate: input.invoice_date,
          dueDate: input.due_date,
          dueTerm: input.due_term
        });

        const { lineRows, subtotal } = buildInvoiceLines(input.lines, itemLookups);
        let taxAmount = normalizeMoney(input.tax_amount);
        let taxLines: Array<{ tax_rate_id: number; amount: number }> = [];

        // Compute header discounts (applied AFTER line subtotals, BEFORE tax)
        const discountPercent = input.discount_percent ?? null;
        const discountFixed = input.discount_fixed ?? null;
        let totalHeaderDiscount = 0;
        if (discountPercent !== null || discountFixed !== null) {
          const percentAmount = discountPercent !== null ? normalizeMoney((subtotal * discountPercent) / 100) : 0;
          const fixedAmount = discountFixed !== null ? normalizeMoney(discountFixed) : 0;
          totalHeaderDiscount = normalizeMoney(percentAmount + fixedAmount);
        }

        // Taxable = subtotal - header_discounts
        const taxable = normalizeMoney(subtotal - totalHeaderDiscount);

        // Validate discount doesn't exceed subtotal
        if (totalHeaderDiscount > subtotal) {
          throw new DiscountExceedsSubtotalError();
        }

        if (input.taxes && input.taxes.length > 0) {
          const taxRateIds = input.taxes.map((tax) => tax.tax_rate_id);
          await validateTaxRates(executor, companyId, taxRateIds);

          taxLines = input.taxes.map((tax) => ({
            tax_rate_id: tax.tax_rate_id,
            amount: normalizeMoney(tax.amount)
          })).filter((tax) => tax.tax_rate_id > 0 && tax.amount > 0);
          taxAmount = normalizeMoney(taxLines.reduce((acc, tax) => acc + tax.amount, 0));
        } else {
          const defaultTaxRates = await getDefaultTaxRates(executor, companyId);
          if (defaultTaxRates.length > 0) {
            taxLines = defaultTaxRates
              .map((rate) => ({
                tax_rate_id: rate.tax_rate_id,
                amount: normalizeMoney((taxable * rate.rate_percent) / 100)
              }))
              .filter((tax) => tax.amount > 0);
            taxAmount = normalizeMoney(taxLines.reduce((acc, tax) => acc + tax.amount, 0));
          }
        }

        const grandTotal = normalizeMoney(taxable + taxAmount);

        const invoiceId = await executor.insertInvoice({
          companyId,
          outletId: input.outlet_id,
          invoiceNo,
          invoiceDate: input.invoice_date,
          dueDate,
          clientRef: input.client_ref,
          status: "DRAFT",
          paymentStatus: "UNPAID",
          subtotal,
          discountPercent,
          discountFixed,
          taxAmount,
          grandTotal,
          paidTotal: 0,
          customerId: input.customer_id ?? null,
          createdByUserId: actor?.userId
        });

        for (const line of lineRows) {
          await executor.insertInvoiceLine({
            invoiceId,
            companyId,
            outletId: input.outlet_id,
            lineNo: line.line_no,
            lineType: line.line_type,
            itemId: line.item_id,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unit_price,
            lineTotal: line.line_total
          });
        }

        for (const tax of taxLines) {
          await executor.insertInvoiceTax({
            invoiceId,
            companyId,
            outletId: input.outlet_id,
            taxRateId: tax.tax_rate_id,
            amount: tax.amount
          });
        }

        const invoice = await findInvoiceById(executor, companyId, invoiceId);
        if (!invoice) {
          throw new Error("Created invoice not found");
        }

        const lines = await findInvoiceLines(executor, companyId, invoiceId);
        const taxes = await findInvoiceTaxes(executor, companyId, invoiceId);

        return {
          ...normalizeInvoice(invoice),
          lines,
          taxes
        };
      });
    },

    async updateInvoice(
      companyId: number,
      invoiceId: number,
      input: {
        outlet_id?: number;
        customer_id?: number | null;
        invoice_no?: string;
        invoice_date?: string;
        due_date?: string;
        due_term?: InvoiceDueTerm;
        tax_amount?: number;
        lines?: InvoiceLineInput[];
        taxes?: InvoiceTaxInput[];
        discount_percent?: number | null;
        discount_fixed?: number | null;
      },
      actor?: MutationActor
    ): Promise<SalesInvoiceDetail | null> {
      return withTransaction(async (executor) => {
        const current = await findInvoiceById(executor, companyId, invoiceId, { forUpdate: true });
        if (!current) {
          return null;
        }

        if (current.status !== "DRAFT") {
          throw new DatabaseConflictError("Invoice is not editable");
        }

        if (actor) {
          await accessScopeChecker.assertOutletAccess({
            actorUserId: actor.userId,
            companyId,
            outletId: current.outlet_id,
            permission: SalesPermissions.UPDATE_INVOICE
          });
        }

        if (typeof input.outlet_id === "number") {
          await ensureOutletExists(executor, companyId, input.outlet_id);
          if (actor) {
            await accessScopeChecker.assertOutletAccess({
              actorUserId: actor.userId,
              companyId,
              outletId: input.outlet_id,
              permission: SalesPermissions.UPDATE_INVOICE
            });
          }
        }

        const nextOutletId = input.outlet_id ?? current.outlet_id;
        const nextInvoiceNo = input.invoice_no ?? current.invoice_no;
        const nextInvoiceDate = input.invoice_date ?? formatDateOnly(current.invoice_date);
        const nextDueDate =
          typeof input.due_date === "string"
            ? input.due_date
            : input.due_term
              ? resolveDueDate({
                  invoiceDate: nextInvoiceDate,
                  dueTerm: input.due_term
                })
              : current.due_date ?? undefined;

        // Validate and fetch items for PRODUCT lines
        const itemLookups = new Map<number, ItemLookup>();
        if (input.lines) {
          for (const line of input.lines) {
            const lineType = line.line_type ?? "SERVICE";
            if (lineType === "PRODUCT" && line.item_id) {
              const item = await findItemById(executor, companyId, line.item_id);
              if (item) {
                itemLookups.set(item.id, item);
              }
            }
          }
        }

        let lineRows: PreparedInvoiceLine[] | null = null;
        let subtotal = Number(current.subtotal);

        if (input.lines) {
          const computed = buildInvoiceLines(input.lines, itemLookups);
          lineRows = computed.lineRows;
          subtotal = computed.subtotal;
        } else if (nextOutletId !== current.outlet_id) {
          const existingLines = await findInvoiceLines(executor, companyId, invoiceId);
          const inputs = existingLines.map((line) => ({
            line_type: line.line_type,
            item_id: line.item_id ?? undefined,
            description: line.description,
            qty: line.qty,
            unit_price: line.unit_price
          }));
          const computed = buildInvoiceLines(inputs, itemLookups);
          lineRows = computed.lineRows;
          subtotal = computed.subtotal;
        }

        let taxAmount =
          typeof input.tax_amount === "number"
            ? normalizeMoney(input.tax_amount)
            : Number(current.tax_amount);
        let taxLines: Array<{ tax_rate_id: number; amount: number }> | null = null;

        // Compute header discounts for update
        const discountPercent = input.discount_percent !== undefined
          ? input.discount_percent
          : current.discount_percent != null ? Number(current.discount_percent) : null;
        const discountFixed = input.discount_fixed !== undefined
          ? input.discount_fixed
          : current.discount_fixed != null ? Number(current.discount_fixed) : null;

        let totalHeaderDiscount = 0;
        if (discountPercent !== null || discountFixed !== null) {
          const percentAmount = discountPercent !== null ? normalizeMoney((subtotal * discountPercent) / 100) : 0;
          const fixedAmount = discountFixed !== null ? normalizeMoney(discountFixed) : 0;
          totalHeaderDiscount = normalizeMoney(percentAmount + fixedAmount);
        }

        // Taxable = subtotal - header_discounts
        const taxable = normalizeMoney(subtotal - totalHeaderDiscount);

        // Validate discount doesn't exceed subtotal
        if (totalHeaderDiscount > subtotal) {
          throw new DiscountExceedsSubtotalError();
        }

        if (input.taxes !== undefined) {
          if (input.taxes.length > 0) {
            const taxRateIds = input.taxes.map((tax) => tax.tax_rate_id);
            await validateTaxRates(executor, companyId, taxRateIds);

            taxLines = input.taxes.map((tax) => ({
              tax_rate_id: tax.tax_rate_id,
              amount: normalizeMoney(tax.amount)
            })).filter((tax) => tax.amount > 0);
            taxAmount = normalizeMoney(taxLines.reduce((acc, tax) => acc + tax.amount, 0));
          } else {
            taxLines = [];
            taxAmount = 0;
          }
        } else {
          // Recalculate tax on taxable amount when discounts change
          const defaultTaxRates = await getDefaultTaxRates(executor, companyId);
          if (defaultTaxRates.length > 0 && (discountPercent !== null || discountFixed !== null)) {
            const computedTaxLines = defaultTaxRates
              .map((rate) => ({
                tax_rate_id: rate.tax_rate_id,
                amount: normalizeMoney((taxable * rate.rate_percent) / 100)
              }))
              .filter((tax) => tax.amount > 0);
            taxAmount = normalizeMoney(computedTaxLines.reduce((acc, tax) => acc + tax.amount, 0));
          }
        }
        const grandTotal = normalizeMoney(taxable + taxAmount);

        if (lineRows) {
          await executor.deleteInvoiceLines(companyId, invoiceId);
        }

        if (taxLines !== null) {
          await executor.deleteInvoiceTaxes(companyId, invoiceId);
        }

        await executor.updateInvoice({
          companyId,
          invoiceId,
          outletId: nextOutletId,
          invoiceNo: nextInvoiceNo,
          invoiceDate: nextInvoiceDate,
          dueDate: nextDueDate,
          subtotal,
          discountPercent,
          discountFixed,
          taxAmount,
          grandTotal,
          customerId: input.customer_id,
          updatedByUserId: actor?.userId
        });

        if (lineRows) {
          for (const line of lineRows) {
            await executor.insertInvoiceLine({
              invoiceId,
              companyId,
              outletId: nextOutletId,
              lineNo: line.line_no,
              lineType: line.line_type,
              itemId: line.item_id,
              description: line.description,
              qty: line.qty,
              unitPrice: line.unit_price,
              lineTotal: line.line_total
            });
          }
        }

        if (taxLines !== null && taxLines.length > 0) {
          for (const tax of taxLines) {
            await executor.insertInvoiceTax({
              invoiceId,
              companyId,
              outletId: nextOutletId,
              taxRateId: tax.tax_rate_id,
              amount: tax.amount
            });
          }
        }

        const invoice = await findInvoiceById(executor, companyId, invoiceId);
        if (!invoice) {
          return null;
        }

        const lines = await findInvoiceLines(executor, companyId, invoiceId);
        const taxes = await findInvoiceTaxes(executor, companyId, invoiceId);

        return {
          ...normalizeInvoice(invoice),
          lines,
          taxes
        };
      });
    },

    async postInvoice(
      companyId: number,
      invoiceId: number,
      actor?: MutationActor
    ): Promise<SalesInvoiceDetail | null> {
      return withTransaction(async (executor) => {
        const invoice = await findInvoiceById(executor, companyId, invoiceId, { forUpdate: true });
        if (!invoice) {
          return null;
        }

        if (actor) {
          await accessScopeChecker.assertOutletAccess({
            actorUserId: actor.userId,
            companyId,
            outletId: invoice.outlet_id,
            permission: SalesPermissions.CREATE_INVOICE
          });
        }

        if (invoice.status === "POSTED") {
          const lines = await findInvoiceLines(executor, companyId, invoiceId);
          const taxes = await findInvoiceTaxes(executor, companyId, invoiceId);
          return {
            ...normalizeInvoice(invoice),
            lines,
            taxes
          };
        }

        if (invoice.status !== "DRAFT" && invoice.status !== "APPROVED") {
          throw new DatabaseConflictError("Invoice cannot be posted");
        }

        await executor.updateInvoiceStatus(companyId, invoiceId, "POSTED", actor?.userId);

        const postedInvoice = await findInvoiceById(executor, companyId, invoiceId);
        if (!postedInvoice) {
          throw new Error("Posted invoice not found");
        }

        const lines = await findInvoiceLines(executor, companyId, invoiceId);
        const taxes = await findInvoiceTaxes(executor, companyId, invoiceId);

        return {
          ...normalizeInvoice(postedInvoice),
          lines,
          taxes
        };
      });
    },

    async approveInvoice(
      companyId: number,
      invoiceId: number,
      actor?: MutationActor
    ): Promise<SalesInvoiceDetail | null> {
      return withTransaction(async (executor) => {
        const invoice = await findInvoiceById(executor, companyId, invoiceId, { forUpdate: true });
        if (!invoice) {
          return null;
        }

        if (actor) {
          await accessScopeChecker.assertOutletAccess({
            actorUserId: actor.userId,
            companyId,
            outletId: invoice.outlet_id,
            permission: SalesPermissions.CREATE_INVOICE
          });
        }

        if (invoice.status === "POSTED") {
          throw new DatabaseConflictError("Posted invoices cannot be approved");
        }

        if (invoice.status === "APPROVED") {
          const lines = await findInvoiceLines(executor, companyId, invoiceId);
          const taxes = await findInvoiceTaxes(executor, companyId, invoiceId);
          return {
            ...normalizeInvoice(invoice),
            lines,
            taxes
          };
        }

        if (invoice.status !== "DRAFT") {
          throw new DatabaseConflictError("Only draft invoices can be approved");
        }

        await executor.updateInvoiceStatus(companyId, invoiceId, "APPROVED", actor?.userId);

        const approvedInvoice = await findInvoiceById(executor, companyId, invoiceId);
        if (!approvedInvoice) {
          throw new Error("Approved invoice not found");
        }

        const lines = await findInvoiceLines(executor, companyId, invoiceId);
        const taxes = await findInvoiceTaxes(executor, companyId, invoiceId);

        return {
          ...normalizeInvoice(approvedInvoice),
          lines,
          taxes
        };
      });
    },

    async voidInvoice(
      companyId: number,
      invoiceId: number,
      actor?: MutationActor
    ): Promise<SalesInvoiceDetail | null> {
      return withTransaction(async (executor) => {
        const invoice = await findInvoiceById(executor, companyId, invoiceId, { forUpdate: true });
        if (!invoice) {
          return null;
        }

        if (actor) {
          await accessScopeChecker.assertOutletAccess({
            actorUserId: actor.userId,
            companyId,
            outletId: invoice.outlet_id,
            permission: SalesPermissions.CREATE_INVOICE
          });
        }

        if (invoice.status === "VOID") {
          const lines = await findInvoiceLines(executor, companyId, invoiceId);
          const taxes = await findInvoiceTaxes(executor, companyId, invoiceId);
          return {
            ...normalizeInvoice(invoice),
            lines,
            taxes
          };
        }

        if (invoice.payment_status === "PARTIAL" || invoice.payment_status === "PAID") {
          throw new DatabaseConflictError("Cannot void invoice with payments. Process refunds first.");
        }

        await executor.updateInvoiceStatus(companyId, invoiceId, "VOID", actor?.userId);

        const voidedInvoice = await findInvoiceById(executor, companyId, invoiceId);
        if (!voidedInvoice) {
          throw new Error("Voided invoice not found");
        }

        const lines = await findInvoiceLines(executor, companyId, invoiceId);
        const taxes = await findInvoiceTaxes(executor, companyId, invoiceId);

        return {
          ...normalizeInvoice(voidedInvoice),
          lines,
          taxes
        };
      });
    }
  };
}
