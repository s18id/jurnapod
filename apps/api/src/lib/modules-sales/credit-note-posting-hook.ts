// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Credit Note Posting Hook Adapter
 * 
 * Implements CreditNotePostingHook from modules-sales using sales-posting.ts.
 * This enables atomic journal posting within the credit note transaction.
 */

import { sql } from "kysely";
import type { Transaction } from "@jurnapod/db";
import type { CreditNotePostingHook } from "@jurnapod/modules-sales";
import type { PostCreditNoteInput, SalesCreditNoteDetail } from "@jurnapod/modules-sales";
import type { PostingResult } from "@jurnapod/shared";
import { postCreditNoteToJournal } from "@/lib/sales-posting";
import type { KyselySchema } from "@/lib/db";
import type { QueryExecutor } from "@/lib/shared/common-utils";

interface SalesCreditNoteRow {
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
  customer_id: number | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

interface SalesCreditNoteLineRow {
  id: number;
  credit_note_id: number;
  line_no: number;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
}

/**
 * Find credit note by ID using the transaction.
 */
async function findCreditNoteByIdWithTx(
  tx: Transaction,
  companyId: number,
  creditNoteId: number
): Promise<SalesCreditNoteRow | null> {
  const result = await sql`SELECT * FROM sales_credit_notes
   WHERE company_id = ${companyId} AND id = ${creditNoteId}
   LIMIT 1`.execute(tx as unknown as KyselySchema);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as SalesCreditNoteRow;
}

/**
 * Find credit note lines using the transaction.
 */
async function findCreditNoteLinesWithTx(
  tx: Transaction,
  companyId: number,
  creditNoteId: number
): Promise<SalesCreditNoteLineRow[]> {
  const result = await sql`SELECT * FROM sales_credit_note_lines
   WHERE credit_note_id = ${creditNoteId}
   ORDER BY line_no`.execute(tx as unknown as KyselySchema);

  return result.rows as SalesCreditNoteLineRow[];
}

/**
 * ApiCreditNotePostingHook
 * 
 * Implements CreditNotePostingHook for the API adapter.
 * Uses sales-posting.ts (postCreditNoteToJournal) to post credit note journal
 * entries atomically within the credit note transaction.
 */
export class ApiCreditNotePostingHook implements CreditNotePostingHook {
  async postCreditNoteToJournal(
    input: PostCreditNoteInput,
    tx: Transaction
  ): Promise<PostingResult> {
    const creditNoteId = input._creditNoteId;
    const companyId = input._companyId;

    if (!creditNoteId || !companyId) {
      throw new Error("CreditNotePostingHook requires _creditNoteId and _companyId in input");
    }

    // Query for the credit note using the live transaction
    const creditNote = await findCreditNoteByIdWithTx(tx, companyId, creditNoteId);
    if (!creditNote) {
      throw new Error(`Credit note not found for journal posting: companyId=${companyId}, creditNoteId=${creditNoteId}`);
    }

    // Query for lines
    const lines = await findCreditNoteLinesWithTx(tx, companyId, creditNoteId);

    // Build SalesCreditNoteDetail from query results
    const creditNoteDetail: SalesCreditNoteDetail = {
      id: Number(creditNote.id),
      company_id: Number(creditNote.company_id),
      outlet_id: Number(creditNote.outlet_id),
      invoice_id: Number(creditNote.invoice_id),
      credit_note_no: creditNote.credit_note_no,
      credit_note_date: creditNote.credit_note_date,
      client_ref: creditNote.client_ref ?? null,
      status: creditNote.status as "DRAFT" | "POSTED" | "VOID",
      reason: creditNote.reason ?? null,
      notes: creditNote.notes ?? null,
      amount: Number(creditNote.amount),
      customer_id: creditNote.customer_id != null ? Number(creditNote.customer_id) : undefined,
      created_by_user_id: creditNote.created_by_user_id,
      updated_by_user_id: creditNote.updated_by_user_id,
      created_at: creditNote.created_at,
      updated_at: creditNote.updated_at,
      lines: lines.map(l => ({
        id: Number(l.id),
        credit_note_id: Number(l.credit_note_id),
        line_no: Number(l.line_no),
        description: l.description,
        qty: Number(l.qty),
        unit_price: Number(l.unit_price),
        line_total: Number(l.line_total)
      }))
    };

    // Call sales-posting.ts with the transaction handle
    const postingResult = await postCreditNoteToJournal(
      tx as unknown as QueryExecutor,
      creditNoteDetail
    );

    return postingResult;
  }
}
