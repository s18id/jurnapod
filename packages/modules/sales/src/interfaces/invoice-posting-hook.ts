// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * InvoicePostingHook Interface
 * 
 * Injection boundary for posting invoice journal entries from within
 * the InvoiceService's own DB transaction.
 * 
 * This interface allows the sales module to trigger journal posting
 * atomically with invoice status updates, without depending on
 * the accounting module directly.
 * 
 * The API adapter provides a concrete implementation that delegates
 * to sales-posting.ts. If no hook is provided, posting is skipped
 * (graceful degradation for stateless/sync-disabled mode).
 */

import type { Transaction } from "@jurnapod/db";
import type { PostingResult } from "@jurnapod/shared";
import type { PostInvoiceInput } from "../types/invoices.js";

export interface InvoicePostingHook {
  /**
   * Post invoice journal entry.
   * Called from within the invoice's own DB transaction.
   * 
   * @param input - invoice posting options
   * @param tx - live transaction handle for linking journal to invoice
   * @returns posting result with journal batch ID and lines
   */
  postInvoiceToJournal(input: PostInvoiceInput, tx: Transaction): Promise<PostingResult>;
}