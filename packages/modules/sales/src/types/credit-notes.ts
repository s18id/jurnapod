// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Credit Note Domain Types
 * 
 * Core types for credit note management in the sales module.
 */

// =============================================================================
// Credit Note Types
// =============================================================================

export type SalesCreditNoteStatus = "DRAFT" | "POSTED" | "VOID";

export type SalesCreditNoteLine = {
  id: number;
  credit_note_id: number;
  line_no: number;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type SalesCreditNoteDetail = {
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
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  lines: SalesCreditNoteLine[];
};

// =============================================================================
// Credit Note Input Types
// =============================================================================

export type CreditNoteLineInput = {
  description: string;
  qty: number;
  unit_price: number;
};

export type CreateCreditNoteInput = {
  outlet_id: number;
  invoice_id: number;
  credit_note_date: string;
  client_ref?: string;
  reason?: string;
  notes?: string;
  amount: number;
  lines: CreditNoteLineInput[];
};

export type UpdateCreditNoteInput = {
  credit_note_date?: string;
  reason?: string;
  notes?: string;
  amount?: number;
  lines?: CreditNoteLineInput[];
};

export type CreditNoteListFilters = {
  outletIds?: readonly number[];
  invoiceId?: number;
  status?: SalesCreditNoteStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  timezone?: string;
};

// =============================================================================
// Actor Type
// =============================================================================

export type MutationActor = {
  userId: number;
};

// =============================================================================
// Credit Capacity
// =============================================================================

export type CreditCapacity = {
  grand_total: number;
  already_credited: number;
  remaining: number;
};
