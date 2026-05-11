// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { KyselySchema } from "@jurnapod/db";
import { insertAccount } from "../accounts-service.js";
import { insertJournalBatch, insertJournalLines } from "../journals-service.js";
import type { JournalLineInput } from "../journals-service.js";

// Deterministic run ID for fixture code/name generation (matches API fixture behavior)
// Uses process identity + pool ID to reduce cross-worker collisions
const _runIdSeed = (Date.now() ^ (process.pid << 8) ^ (Number(process.env.VITEST_POOL_ID ?? 0) << 16)) & 0x7fffffff;
let _runIdCounter = _runIdSeed;

function makeRunId(): string {
  return (++_runIdCounter).toString(36);
}

// Deterministic doc-id counter for journal_batch doc_id derivation
// Ensures fixture doc_ids are unique and reproducible within a test run
let _docIdCounter = 1;

function nextDocId(): number {
  return _docIdCounter++;
}

export type FiscalCloseBalanceResult = {
  retained_earnings_account_id: number;
  pl_account_id: number;
};

/**
 * Create canonical fiscal-close fixture data for integration tests:
 * - Retained earnings-like account (name contains "Retained")
 * - P&L account with non-zero current balance (ensures closing entries are generated)
 *
 * Uses canonical production functions insertAccount(), insertJournalBatch(),
 * and insertJournalLines() from accounts-service.ts and journals-service.ts.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Company ID
 * @param options - Partial options
 * @param options.retainedEarningsName - Name for retained earnings account
 * @param options.plAccountName - Name for P&L account
 * @param options.plBalance - Balance for P&L account (default: '100.0000')
 * @param options.plNormalBalance - Normal balance 'D' or 'K' (default: 'K')
 * @param options.asOfDate - Date for journal entry in 'YYYY-MM-DD' format
 * @returns Object with retained_earnings_account_id and pl_account_id
 */
export async function createTestFiscalCloseBalanceFixture(
  db: KyselySchema,
  companyId: number,
  options?: Partial<{
    retainedEarningsName: string;
    plAccountName: string;
    plBalance: string;
    plNormalBalance: "D" | "K";
    asOfDate: string;
  }>
): Promise<FiscalCloseBalanceResult> {
  const runId = makeRunId();

  const retainedEarningsName = options?.retainedEarningsName ?? `Retained Earnings ${runId}`;
  const retainedCode = `TEST-RE-${runId}`.slice(0, 20).toUpperCase();

  // Create retained earnings account via canonical insertAccount()
  const retainedEarningsAccountId = await insertAccount(db, {
    companyId,
    code: retainedCode,
    name: retainedEarningsName,
    typeName: "EQUITY",
    normalBalance: "K",
    reportGroup: "EQ",
  });

  const plCode = `TEST-PL-${runId}`.slice(0, 20).toUpperCase();
  const plAccountName = options?.plAccountName ?? `Test Revenue ${runId}`;
  const plNormalBalance = options?.plNormalBalance ?? "K";
  const plBalance = options?.plBalance ?? "100.0000";
  const asOfDate = options?.asOfDate ?? "2099-12-31";
  // Deterministic fixture doc_id - counter-based, not Date.now()-based
  const fixtureDocId = nextDocId() + (_runIdCounter % 1000) * 1_000_000;

  // Offset account for balanced fixture journal entry.
  const offsetCode = `TEST-OFF-${runId}`.slice(0, 20).toUpperCase();
  const offsetAccountId = await insertAccount(db, {
    companyId,
    code: offsetCode,
    name: `Test Offset ${runId}`,
    typeName: "ASSET",
    normalBalance: "D",
    reportGroup: "BS",
  });

  // P&L account
  const plAccountId = await insertAccount(db, {
    companyId,
    code: plCode,
    name: plAccountName,
    typeName: "REVENUE",
    normalBalance: plNormalBalance,
    reportGroup: "PL",
  });

  // Seed a balanced manual journal entry in the fiscal-year window.
  // Uses canonical insertJournalBatch() and insertJournalLines() from journals-service.ts
  const journalBatchId = await insertJournalBatch(db, {
    companyId,
    outletId: null,
    docType: "MANUAL",
    docId: fixtureDocId,
    postedAt: asOfDate,
    clientRef: `FIXTURE-FY-CLOSE-${runId}`,
  });

  const debitAccountId = plNormalBalance === "D" ? plAccountId : offsetAccountId;
  const creditAccountId = plNormalBalance === "D" ? offsetAccountId : plAccountId;

  const lines: JournalLineInput[] = [
    {
      companyId,
      outletId: null,
      accountId: debitAccountId,
      lineDate: asOfDate,
      debit: plBalance,
      credit: "0.0000",
      description: "Fiscal close fixture debit line",
    },
    {
      companyId,
      outletId: null,
      accountId: creditAccountId,
      lineDate: asOfDate,
      debit: "0.0000",
      credit: plBalance,
      description: "Fiscal close fixture credit line",
    },
  ];

  await insertJournalLines(db, journalBatchId, lines);

  return {
    retained_earnings_account_id: retainedEarningsAccountId,
    pl_account_id: plAccountId,
  };
}
