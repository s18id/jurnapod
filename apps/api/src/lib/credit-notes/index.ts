// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Credit Notes Module
 *
 * Public exports for credit note types and functions.
 * This module was extracted from sales.ts for better organization.
 */

// Re-export types
export type {
  SalesCreditNoteDetail,
  SalesCreditNoteLine,
  SalesCreditNoteRow,
  SalesCreditNoteLineRow,
  SalesCreditNoteStatus,
  CreditNoteLineInput,
  CreditNoteListFilters,
  MutationActor
} from "./types";

// Re-export functions from credit-note-service
export {
  createCreditNote,
  getCreditNote,
  listCreditNotes,
  updateCreditNote,
  postCreditNote,
  voidCreditNote
} from "./credit-note-service";

// Re-export error classes for convenience
export {
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError
} from "../master-data-errors";
