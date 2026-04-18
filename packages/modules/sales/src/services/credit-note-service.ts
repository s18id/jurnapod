// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Credit Note Service
 * 
 * Credit note orchestration service for the sales module.
 * Handles credit note CRUD operations and lifecycle management.
 * 
 * IMPORTANT: This service does NOT import @/lib/auth or @/lib/db directly.
 * ACL checks are performed via the injected AccessScopeChecker interface.
 * Database access is performed via the injected SalesDb interface.
 */

import type { AccessScopeChecker } from "../interfaces/access-scope-checker.js";
import {
  SalesPermissions
} from "../interfaces/access-scope-checker.js";
import type {
  SalesCreditNoteDetail,
  CreateCreditNoteInput,
  UpdateCreditNoteInput,
  CreditNoteListFilters,
  MutationActor
} from "../types/credit-notes.js";
import type { SalesDb, SalesDbExecutor } from "./sales-db.js";

// =============================================================================
// Error Classes
// =============================================================================

export class DatabaseConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConflictError";
  }
}

export class DatabaseForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseForbiddenError";
  }
}

export class DatabaseReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseReferenceError";
  }
}

// =============================================================================
// Money Helpers (internal to module)
// =============================================================================

const MONEY_SCALE = 100;

function normalizeMoney(value: number): number {
  return Math.round(value * MONEY_SCALE) / MONEY_SCALE;
}

function moneyToCents(value: number): number {
  return Math.round(value * 100);
}

function moneyEquals(a: number, b: number): boolean {
  return moneyToCents(a) === moneyToCents(b);
}

// =============================================================================
// Credit Note Service Interface
// =============================================================================

export interface CreditNoteService {
  createCreditNote(
    companyId: number,
    input: CreateCreditNoteInput,
    actor?: MutationActor
  ): Promise<SalesCreditNoteDetail>;

  getCreditNote(
    companyId: number,
    creditNoteId: number,
    actor?: MutationActor
  ): Promise<SalesCreditNoteDetail | null>;

  updateCreditNote(
    companyId: number,
    creditNoteId: number,
    input: UpdateCreditNoteInput,
    actor?: MutationActor
  ): Promise<SalesCreditNoteDetail | null>;

  listCreditNotes(
    companyId: number,
    filters: CreditNoteListFilters
  ): Promise<{ total: number; creditNotes: SalesCreditNoteDetail[] }>;

  postCreditNote(
    companyId: number,
    creditNoteId: number,
    actor?: MutationActor
  ): Promise<SalesCreditNoteDetail | null>;

  voidCreditNote(
    companyId: number,
    creditNoteId: number,
    actor?: MutationActor
  ): Promise<SalesCreditNoteDetail | null>;
}

export interface CreditNoteServiceDeps {
  db: SalesDb;
  accessScopeChecker: AccessScopeChecker;
}

// =============================================================================
// Credit Note Service Factory
// =============================================================================

export function createCreditNoteService(deps: CreditNoteServiceDeps): CreditNoteService {
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

  // =============================================================================
  // Public API
  // =============================================================================

  async function createCreditNote(
    companyId: number,
    input: CreateCreditNoteInput,
    actor?: MutationActor
  ): Promise<SalesCreditNoteDetail> {
    return withTransaction(async (executor) => {
      if (actor) {
        await accessScopeChecker.assertOutletAccess({
          actorUserId: actor.userId,
          companyId,
          outletId: input.outlet_id,
          permission: SalesPermissions.CREATE_CREDIT_NOTE
        });
      }

      await ensureOutletExists(executor, companyId, input.outlet_id);

      // Idempotency: return existing credit note if client_ref matches
      if (input.client_ref) {
        const existingCreditNote = await executor.findCreditNoteByClientRef(companyId, input.client_ref);
        if (existingCreditNote) {
          if (actor) {
            await accessScopeChecker.assertOutletAccess({
              actorUserId: actor.userId,
              companyId,
              outletId: existingCreditNote.outlet_id,
              permission: SalesPermissions.READ_CREDIT_NOTE
            });
          }
          return executor.findCreditNoteById(companyId, existingCreditNote.id) as Promise<SalesCreditNoteDetail>;
        }
      }

      // Validate invoice exists and is posted
      const invoice = await executor.findInvoiceById(companyId, input.invoice_id);
      if (!invoice) {
        throw new DatabaseReferenceError("Invoice not found or not posted");
      }
      const invoiceData = invoice as { status?: string; outlet_id?: number; customer_id?: number | null };
      if (invoiceData.status !== "POSTED") {
        throw new DatabaseReferenceError("Invoice not found or not posted");
      }
      if (invoiceData.outlet_id !== input.outlet_id) {
        throw new DatabaseReferenceError("Invoice outlet mismatch");
      }

      // Strict inheritance: when source invoice has a customer, ALWAYS inherit from invoice.
      // The request body customer_id is only used when the invoice has no customer.
      const inheritedCustomerId = invoiceData.customer_id != null
        ? invoiceData.customer_id
        : input.customer_id ?? null;

      // Compute remaining credit capacity
      const capacity = await executor.getCreditNoteCapacity(companyId, input.invoice_id);

      const normalizedAmount = normalizeMoney(input.amount);
      if (normalizedAmount > capacity.remaining) {
        throw new DatabaseConflictError(
          `Credit note amount (${normalizedAmount}) exceeds remaining credit capacity (${capacity.remaining}) for invoice total ${capacity.grand_total}`
        );
      }

      // Validate line totals sum equals credit note amount (cent-exact)
      const lineTotalsSum = input.lines.reduce((sum, line) => sum + (line.qty * line.unit_price), 0);
      const normalizedLineSum = normalizeMoney(lineTotalsSum);

      if (!moneyEquals(normalizedLineSum, normalizedAmount)) {
        throw new DatabaseConflictError(
          `Line totals sum (${normalizedLineSum}) does not exactly match credit note amount (${normalizedAmount})`
        );
      }

      const creditNoteNo = await executor.getNextDocumentNumber(
        companyId,
        input.outlet_id,
        "CREDIT_NOTE"
      );

      const creditNoteId = await executor.insertCreditNote({
        companyId,
        outletId: input.outlet_id,
        invoiceId: input.invoice_id,
        creditNoteNo,
        creditNoteDate: input.credit_note_date,
        status: "DRAFT",
        clientRef: input.client_ref,
        reason: input.reason,
        notes: input.notes,
        amount: normalizedAmount,
        customerId: inheritedCustomerId,
        createdByUserId: actor?.userId
      });

      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        const lineTotal = normalizeMoney(line.qty * line.unit_price);
        await executor.insertCreditNoteLine({
          creditNoteId,
          companyId,
          outletId: input.outlet_id,
          lineNo: i + 1,
          description: line.description,
          qty: line.qty,
          unitPrice: normalizeMoney(line.unit_price),
          lineTotal
        });
      }

      const creditNote = await executor.findCreditNoteById(companyId, creditNoteId);
      if (!creditNote) {
        throw new Error("Created credit note not found");
      }
      return creditNote;
    });
  }

  async function getCreditNote(
    companyId: number,
    creditNoteId: number,
    actor?: MutationActor
  ): Promise<SalesCreditNoteDetail | null> {
    return withTransaction(async (executor) => {
      const creditNote = await executor.findCreditNoteById(companyId, creditNoteId);
      if (!creditNote) {
        return null;
      }

      if (actor) {
        await accessScopeChecker.assertOutletAccess({
          actorUserId: actor.userId,
          companyId,
          outletId: creditNote.outlet_id,
          permission: SalesPermissions.READ_CREDIT_NOTE
        });
      }

      return creditNote;
    });
  }

  async function updateCreditNote(
    companyId: number,
    creditNoteId: number,
    input: UpdateCreditNoteInput,
    actor?: MutationActor
  ): Promise<SalesCreditNoteDetail | null> {
    return withTransaction(async (executor) => {
      const creditNote = await executor.findCreditNoteById(companyId, creditNoteId, true);
      if (!creditNote) {
        return null;
      }

      if (actor) {
        await accessScopeChecker.assertOutletAccess({
          actorUserId: actor.userId,
          companyId,
          outletId: creditNote.outlet_id,
          permission: SalesPermissions.UPDATE_CREDIT_NOTE
        });
      }

      if (creditNote.status !== "DRAFT") {
        throw new DatabaseForbiddenError("Only DRAFT credit notes can be updated");
      }

      if (input.amount !== undefined) {
        // Validate that new amount doesn't exceed cumulative credit capacity, excluding this note
        const capacity = await executor.getCreditNoteCapacity(
          companyId,
          creditNote.invoice_id,
          creditNoteId
        );

        const normalizedAmount = normalizeMoney(input.amount);
        if (normalizedAmount > capacity.remaining) {
          throw new DatabaseConflictError(
            `Updated credit note amount (${normalizedAmount}) exceeds remaining credit capacity (${capacity.remaining}) for invoice total ${capacity.grand_total}`
          );
        }
      }

      // Validate line totals sum equals credit note amount if lines provided
      if (input.lines) {
        const newAmount = input.amount ?? creditNote.amount;
        const lineTotalsSum = input.lines.reduce((sum, line) => sum + (line.qty * line.unit_price), 0);
        const normalizedLineSum = normalizeMoney(lineTotalsSum);
        const normalizedAmount = normalizeMoney(newAmount);

        if (!moneyEquals(normalizedLineSum, normalizedAmount)) {
          throw new DatabaseConflictError(
            `Line totals sum (${normalizedLineSum}) does not exactly match credit note amount (${normalizedAmount})`
          );
        }
      }

      await executor.updateCreditNote({
        companyId,
        creditNoteId,
        creditNoteDate: input.credit_note_date,
        reason: input.reason,
        notes: input.notes,
        amount: input.amount !== undefined ? normalizeMoney(input.amount) : undefined,
        customerId: input.customer_id,
        updatedByUserId: actor?.userId
      });

      if (input.lines) {
        await executor.deleteCreditNoteLines(creditNoteId);

        for (let i = 0; i < input.lines.length; i++) {
          const line = input.lines[i];
          const lineTotal = normalizeMoney(line.qty * line.unit_price);
          await executor.insertCreditNoteLine({
            creditNoteId,
            companyId,
            outletId: creditNote.outlet_id,
            lineNo: i + 1,
            description: line.description,
            qty: line.qty,
            unitPrice: normalizeMoney(line.unit_price),
            lineTotal
          });
        }
      }

      const updatedCreditNote = await executor.findCreditNoteById(companyId, creditNoteId);
      if (!updatedCreditNote) {
        return null;
      }
      return updatedCreditNote;
    });
  }

  async function listCreditNotes(
    companyId: number,
    filters: CreditNoteListFilters
  ): Promise<{ total: number; creditNotes: SalesCreditNoteDetail[] }> {
    const executor = db.executor;
    return executor.listCreditNotes(companyId, filters);
  }

  async function postCreditNote(
    companyId: number,
    creditNoteId: number,
    actor?: MutationActor
  ): Promise<SalesCreditNoteDetail | null> {
    return withTransaction(async (executor) => {
      const creditNote = await executor.findCreditNoteById(companyId, creditNoteId, true);
      if (!creditNote) {
        return null;
      }

      if (actor) {
        await accessScopeChecker.assertOutletAccess({
          actorUserId: actor.userId,
          companyId,
          outletId: creditNote.outlet_id,
          permission: SalesPermissions.POST_CREDIT_NOTE
        });
      }

      if (creditNote.status !== "DRAFT") {
        throw new DatabaseForbiddenError("Only DRAFT credit notes can be posted");
      }

      const capacity = await executor.getCreditNoteCapacity(companyId, creditNote.invoice_id);
      const creditNoteAmount = normalizeMoney(creditNote.amount);
      if (creditNoteAmount > capacity.remaining) {
        throw new DatabaseConflictError(
          `Credit note amount (${creditNoteAmount}) exceeds remaining credit capacity (${capacity.remaining}) for invoice total ${capacity.grand_total}`
        );
      }

      // Note: Posting to journal is handled by the API adapter which has access to posting functions
      // The module only manages the status update here

      await executor.updateCreditNoteStatus(companyId, creditNoteId, "POSTED", actor?.userId);

      // Update invoice paid total
      const invoice = await executor.findInvoiceById(companyId, creditNote.invoice_id);
      if (invoice) {
        const invoiceData = invoice as { paid_total?: number; payment_status?: string; grand_total?: number };
        const currentPaidTotal = Number(invoiceData.paid_total ?? 0);
        const grandTotal = Number(invoiceData.grand_total ?? 0);
        const newPaidTotal = Math.max(0, currentPaidTotal - creditNoteAmount);

        let newPaymentStatus: string;
        if (newPaidTotal <= 0) {
          newPaymentStatus = "UNPAID";
        } else if (newPaidTotal >= grandTotal) {
          newPaymentStatus = "PAID";
        } else {
          newPaymentStatus = "PARTIAL";
        }

        await executor.updateInvoicePaidTotal({
          companyId,
          invoiceId: creditNote.invoice_id,
          paidTotal: normalizeMoney(newPaidTotal),
          paymentStatus: newPaymentStatus,
          updatedByUserId: actor?.userId
        });
      }

      const updatedCreditNote = await executor.findCreditNoteById(companyId, creditNoteId);
      if (!updatedCreditNote) {
        return null;
      }
      return updatedCreditNote;
    });
  }

  async function voidCreditNote(
    companyId: number,
    creditNoteId: number,
    actor?: MutationActor
  ): Promise<SalesCreditNoteDetail | null> {
    return withTransaction(async (executor) => {
      const creditNote = await executor.findCreditNoteById(companyId, creditNoteId, true);
      if (!creditNote) {
        return null;
      }

      if (actor) {
        await accessScopeChecker.assertOutletAccess({
          actorUserId: actor.userId,
          companyId,
          outletId: creditNote.outlet_id,
          permission: SalesPermissions.VOID_CREDIT_NOTE
        });
      }

      if (creditNote.status === "VOID") {
        return executor.findCreditNoteById(companyId, creditNoteId);
      }

      await executor.updateCreditNoteStatus(companyId, creditNoteId, "VOID", actor?.userId);

      // If the credit note was posted, restore the invoice paid total
      if (creditNote.status === "POSTED") {
        const creditNoteAmount = normalizeMoney(creditNote.amount);

        const invoice = await executor.findInvoiceById(companyId, creditNote.invoice_id);
        if (invoice) {
          const invoiceData = invoice as { paid_total?: number; payment_status?: string; grand_total?: number };
          const currentPaidTotal = Number(invoiceData.paid_total ?? 0);
          const grandTotal = Number(invoiceData.grand_total ?? 0);
          const newPaidTotal = Math.min(grandTotal, currentPaidTotal + creditNoteAmount);

          let newPaymentStatus: string;
          if (newPaidTotal <= 0) {
            newPaymentStatus = "UNPAID";
          } else if (newPaidTotal >= grandTotal) {
            newPaymentStatus = "PAID";
          } else {
            newPaymentStatus = "PARTIAL";
          }

          await executor.updateInvoicePaidTotal({
            companyId,
            invoiceId: creditNote.invoice_id,
            paidTotal: normalizeMoney(newPaidTotal),
            paymentStatus: newPaymentStatus,
            updatedByUserId: actor?.userId
          });
        }
      }

      const updatedCreditNote = await executor.findCreditNoteById(companyId, creditNoteId);
      if (!updatedCreditNote) {
        return null;
      }
      return updatedCreditNote;
    });
  }

  return {
    createCreditNote,
    getCreditNote,
    updateCreditNote,
    listCreditNotes,
    postCreditNote,
    voidCreditNote
  };
}
