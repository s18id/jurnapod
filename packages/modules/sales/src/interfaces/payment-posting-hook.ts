// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * PaymentPostingHook Interface
 * 
 * Injection boundary for posting payment journal entries from within
 * the PaymentService's own DB transaction.
 * 
 * This interface allows the sales module to trigger journal posting
 * atomically with payment status updates, without depending on
 * the accounting module directly.
 * 
 * The API adapter provides a concrete implementation that delegates
 * to sales-posting.ts. If no hook is provided, posting is skipped
 * (graceful degradation for stateless/sync-disabled mode).
 */

import type { Transaction } from "@jurnapod/db";
import type { PostingResult } from "@jurnapod/shared";
import type { PostPaymentInput } from "../types/payments.js";

export interface PaymentPostingHook {
  /**
   * Post payment journal entry.
   * Called from within the payment's own DB transaction.
   * 
   * @param input - payment posting options
   * @param tx - live transaction handle for linking journal to payment
   * @returns posting result with journal batch ID and lines
   */
  postPaymentToJournal(input: PostPaymentInput, tx: Transaction): Promise<PostingResult>;
}
