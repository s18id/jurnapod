// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Credit Note Types
 *
 * Type definitions for credit note operations.
 */

import type { RowDataPacket } from "mysql2";
import type { QueryExecutor as SharedQueryExecutor } from "@/lib/shared/common-utils";

export type SalesCreditNoteStatus = "DRAFT" | "POSTED" | "VOID";

export type SalesCreditNoteRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  credit_note_no: string;
  credit_note_date: string;
  client_ref?: string | null;
  status: SalesCreditNoteStatus;
  reason?: string | null;
  notes?: string | null;
  amount: string | number;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type SalesCreditNoteLineRow = RowDataPacket & {
  id: number;
  credit_note_id: number;
  line_no: number;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
};

export interface SalesCreditNoteLine {
  id: number;
  credit_note_id: number;
  line_no: number;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface SalesCreditNoteDetail {
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
}

export type CreditNoteLineInput = {
  description: string;
  qty: number;
  unit_price: number;
};

export type CreditNoteListFilters = {
  outletIds?: number[];
  invoiceId?: number;
  status?: SalesCreditNoteStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  timezone?: string;
};

export type MutationActor = {
  userId: number;
};

// Re-export QueryExecutor from shared module for consistency
export type QueryExecutor = SharedQueryExecutor;
