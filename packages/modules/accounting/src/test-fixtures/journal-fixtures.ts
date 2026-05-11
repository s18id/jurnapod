// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Journal batch test fixtures for accounting module.
 *
 * Provides createTestJournalBatch — a balanced journal entry fixture
 * that goes through the production JournalsService. All journal
 * entries are validated for balance and fiscal-year compliance.
 *
 * This replaces raw SQL INSERT INTO journal_batches/journal_lines
 * in reconciliation and reporting tests.
 */

import type { KyselySchema } from "@jurnapod/db";
import { JournalsService } from "../journals-service.js";

/**
 * A single journal entry line (debit or credit, not both).
 */
export interface JournalEntryLine {
  accountId: number;
  debit: number;
  credit: number;
  description?: string;
}

/**
 * Result of createTestJournalBatch.
 */
export interface TestJournalBatchResult {
  batchId: number;
  lineIds: number[];
}

/**
 * Create a balanced journal batch through the production JournalsService.
 *
 * This fixture replaces raw SQL INSERT patterns in tests:
 *   before: sql`INSERT INTO journal_batches...` + sql`INSERT INTO journal_lines...`
 *   after:  await createTestJournalBatch(db, { companyId, entries: [...] })
 *
 * The journal batch uses doc_type='JOURNAL' with a timestamp-based doc_id.
 * All entries go through production balance validation, fiscal year checks,
 * and the canonical insertion path.
 *
 * @param db - KyselySchema database instance
 * @param opts - Configuration options
 * @param opts.companyId - Company ID (required)
 * @param opts.entries - Array of journal entry lines (required, min 2)
 * @param opts.entryDate - Journal entry date (default: "2099-01-01")
 * @param opts.docType - Document type (default: "JOURNAL")
 * @param opts.docId - Document ID (default: auto-generated timestamp)
 * @returns TestJournalBatchResult with batchId and lineIds
 */
export async function createTestJournalBatch(
  db: KyselySchema,
  opts: {
    companyId: number;
    entries: JournalEntryLine[];
    entryDate?: string;
    docType?: string;
    docId?: number;
  }
): Promise<TestJournalBatchResult> {
  const journalService = new JournalsService(db);

  const result = await journalService.createManualEntry(
    {
      company_id: opts.companyId,
      entry_date: opts.entryDate ?? "2099-01-01",
      description: "Test journal batch (seeded fixture)",
      lines: opts.entries.map((entry) => ({
        account_id: entry.accountId,
        debit: entry.debit,
        credit: entry.credit,
        description: entry.description ?? "Test journal line",
      })),
    },
    undefined, // userId
    undefined, // trx
    {
      docType: opts.docType ?? "JOURNAL",
      docId: opts.docId,
    }
  );

  return {
    batchId: result.id,
    lineIds: result.lines.map((l) => l.id),
  };
}
