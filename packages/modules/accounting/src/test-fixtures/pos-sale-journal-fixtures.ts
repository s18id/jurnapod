// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * POS_SALE journal test fixtures.
 *
 * Provides deterministic fixtures for creating POS_SALE journal batches
 * with balanced debit/credit lines, used by the reversal function tests.
 *
 * Fixture Flow Mode: Partial — creates journal entries through the
 * production PosSyncPushPostingRepository (same class used by runActivePostingHook).
 * Both journal_batches and journal_lines are owned by the accounting package.
 */

import type { KyselySchema } from "@jurnapod/db";
import type { JournalLine, PostingRequest } from "@jurnapod/shared";
import { PosSyncPushPostingRepository } from "../posting/sync-push.js";

// =============================================================================
// Types
// =============================================================================

export interface PosSaleJournalFixture {
  batchId: number;
  companyId: number;
  outletId: number;
  docType: string;
  docId: number;
  lines: Array<{
    accountId: number;
    debit: number;
    credit: number;
  }>;
}

export interface PosSaleReversalFixtureInput {
  db: KyselySchema;
  companyId: number;
  outletId: number;
  /** The POS transaction ID used as doc_id for the POS_SALE batch */
  posTransactionId: number;
  /** Account IDs for the journal lines (must form a balanced set) */
  lineEntries: Array<{
    accountId: number;
    debit: number;
    credit: number;
    description: string;
  }>;
  /** Date strings for posted_at and line_date */
  postedAt: string;
  lineDate: string;
}

// =============================================================================
// Fixture Factory
// =============================================================================

/**
 * Create a POS_SALE journal batch with balanced lines.
 *
 * Uses the production PosSyncPushPostingRepository (partial fixture mode) —
 * the same class used by runActivePostingHook in the production posting path.
 * This ensures test setup uses identical column mapping, scoping, and
 * insert semantics as the production code.
 */
export async function createPosSaleJournalFixture(
  input: PosSaleReversalFixtureInput
): Promise<PosSaleJournalFixture> {
  const { db, companyId, outletId, posTransactionId, lineEntries, postedAt, lineDate } = input;

  // Validate balance before inserting
  const totalDebit = lineEntries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = lineEntries.reduce((sum, e) => sum + e.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(
      `POS_SALE fixture lines are unbalanced: debits=${totalDebit}, credits=${totalCredit}`
    );
  }

  // Use production repository — same class used by runActivePostingHook
  const repo = new PosSyncPushPostingRepository(db, postedAt);

  const postingRequest: PostingRequest = {
    doc_type: "POS_SALE",
    doc_id: posTransactionId,
    company_id: companyId,
    outlet_id: outletId,
  };

  const journalLines: JournalLine[] = lineEntries.map((entry, i) => ({
    line_no: i + 1,
    account_id: entry.accountId,
    debit: entry.debit,
    credit: entry.credit,
    description: entry.description,
  }));

  const batch = await repo.createJournalBatch(postingRequest);
  const batchId = batch.journal_batch_id;

  await repo.insertJournalLines(batchId, postingRequest, journalLines);

  return {
    batchId,
    companyId,
    outletId,
    docType: "POS_SALE",
    docId: posTransactionId,
    lines: lineEntries.map((e) => ({
      accountId: e.accountId,
      debit: e.debit,
      credit: e.credit,
    })),
  };
}
