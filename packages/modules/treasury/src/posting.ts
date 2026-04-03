// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Posting mapper and repository interface for cash-bank transactions.
 *
 * Extracted from apps/api/src/lib/cash-bank.ts (Story 25.3)
 * The TreasuryPostingRepository interface defines the contract for journal batch creation.
 */

import type { PostingMapper } from "@jurnapod/modules-accounting";
import type { JournalLine, PostingRequest } from "@jurnapod/shared";
import type { CashBankTransaction } from "./types.js";
import { buildCashBankJournalLines } from "./journal-builder.js";

/**
 * Repository port for posting cash-bank transactions to the journal.
 * The API implementation handles database operations via Kysely.
 * 
 * Note: postedAt is passed via the constructor, not to createJournalBatch.
 */
export interface TreasuryPostingRepository {
  createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: number }>;
  insertJournalLines(journalBatchId: number, request: PostingRequest, lines: JournalLine[], lineDate: string): Promise<void>;
}

/**
 * Maps a CashBankTransaction to journal lines for posting.
 *
 * Implements the PostingMapper interface from modules-accounting.
 * When voidMode is true, debits and credits are reversed.
 */
export class CashBankPostingMapper implements PostingMapper {
  constructor(
    private readonly tx: CashBankTransaction,
    private readonly voidMode: boolean
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const docLabel = `Cash/Bank ${this.tx.transaction_type} #${this.tx.id}`;
    const original = buildCashBankJournalLines({
      transactionType: this.tx.transaction_type,
      sourceAccountId: this.tx.source_account_id,
      destinationAccountId: this.tx.destination_account_id,
      amount: this.tx.amount,
      baseAmount: this.tx.base_amount,
      fxAccountId: this.tx.fx_account_id,
      referenceLabel: docLabel
    });

    if (!this.voidMode) {
      return original;
    }

    // Reverse debits/credits for void
    return original.map((line) => ({
      account_id: line.account_id,
      debit: line.credit,
      credit: line.debit,
      description: `Void ${line.description}`
    }));
  }
}
