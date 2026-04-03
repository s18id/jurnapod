// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Credit Note Service - Thin API Adapter
 *
 * This is a thin adapter that delegates to the credit note service
 * implemented in @jurnapod/modules-sales.
 *
 * All business logic is in the modules-sales package.
 * This adapter only wires up the database and access control dependencies.
 */

import type {
  SalesCreditNoteDetail,
  CreditNoteLineInput,
  CreditNoteListFilters,
  MutationActor,
  CreditNoteService
} from "@jurnapod/modules-sales";
import {
  createCreditNoteService
} from "@jurnapod/modules-sales";
import { createApiSalesDb, getAccessScopeChecker } from "@/lib/modules-sales";

// Re-export types for convenience
export type {
  SalesCreditNoteDetail,
  CreditNoteLineInput,
  CreditNoteListFilters,
  MutationActor,
  SalesCreditNoteStatus
} from "@jurnapod/modules-sales";

// Re-export error classes for backward compatibility
export {
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError
} from "@jurnapod/modules-sales";

// Singleton service instance
let creditNoteService: CreditNoteService | null = null;

function getCreditNoteService(): CreditNoteService {
  if (!creditNoteService) {
    const db = createApiSalesDb();
    const accessScopeChecker = getAccessScopeChecker();
    creditNoteService = createCreditNoteService({
      db,
      accessScopeChecker
    });
  }
  return creditNoteService;
}

// Thin adapter - delegates all calls to the module service

export async function createCreditNote(
  companyId: number,
  input: {
    outlet_id: number;
    invoice_id: number;
    credit_note_date: string;
    client_ref?: string;
    reason?: string;
    notes?: string;
    amount: number;
    lines: CreditNoteLineInput[];
  },
  actor?: MutationActor
): Promise<SalesCreditNoteDetail> {
  return getCreditNoteService().createCreditNote(companyId, input, actor);
}

export async function getCreditNote(
  companyId: number,
  creditNoteId: number,
  actor?: MutationActor
): Promise<SalesCreditNoteDetail | null> {
  return getCreditNoteService().getCreditNote(companyId, creditNoteId, actor);
}

export async function listCreditNotes(
  companyId: number,
  filters: CreditNoteListFilters
): Promise<{ total: number; credit_notes: SalesCreditNoteDetail[] }> {
  const result = await getCreditNoteService().listCreditNotes(companyId, filters);
  return { total: result.total, credit_notes: result.creditNotes };
}

export async function updateCreditNote(
  companyId: number,
  creditNoteId: number,
  input: {
    credit_note_date?: string;
    reason?: string;
    notes?: string;
    amount?: number;
    lines?: CreditNoteLineInput[];
  },
  actor?: MutationActor
): Promise<SalesCreditNoteDetail | null> {
  return getCreditNoteService().updateCreditNote(companyId, creditNoteId, input, actor);
}

export async function postCreditNote(
  companyId: number,
  creditNoteId: number,
  actor?: MutationActor
): Promise<SalesCreditNoteDetail | null> {
  return getCreditNoteService().postCreditNote(companyId, creditNoteId, actor);
}

export async function voidCreditNote(
  companyId: number,
  creditNoteId: number,
  actor?: MutationActor
): Promise<SalesCreditNoteDetail | null> {
  return getCreditNoteService().voidCreditNote(companyId, creditNoteId, actor);
}
