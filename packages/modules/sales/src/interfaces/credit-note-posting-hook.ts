// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * CreditNotePostingHook Interface
 * 
 * Injection boundary for posting credit note journal entries from within
 * the CreditNoteService's own DB transaction.
 * 
 * This interface allows the sales module to trigger journal posting
 * atomically with credit note status updates, without depending on
 * the accounting module directly.
 * 
 * The API adapter provides a concrete implementation that delegates
 * to sales-posting.ts (postCreditNoteToJournal). If no hook is provided,
 * posting is skipped (graceful degradation for stateless/sync-disabled mode).
 */

import type { Transaction } from "@jurnapod/db";
import type { PostingResult } from "@jurnapod/shared";
import type { PostCreditNoteInput } from "../types/credit-notes.js";

export interface CreditNotePostingHook {
  /**
   * Post credit note journal entry.
   * Called from within the credit note's own DB transaction.
   * 
   * @param input - credit note posting options
   * @param tx - live transaction handle for linking journal to credit note
   * @returns posting result with journal batch ID and lines
   */
  postCreditNoteToJournal(input: PostCreditNoteInput, tx: Transaction): Promise<PostingResult>;
}