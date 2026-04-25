// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

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
 * This helper prevents ad-hoc SQL setup from being duplicated across test suites.
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
  const retainedInsert = await sql`
    INSERT INTO accounts (
      company_id,
      code,
      name,
      type_name,
      is_active,
      is_payable,
      report_group,
      normal_balance,
      created_at,
      updated_at
    )
    VALUES (
      ${companyId},
      ${retainedCode},
      ${retainedEarningsName},
      'EQUITY',
      1,
      0,
      'EQ',
      'K',
      NOW(),
      NOW()
    )
  `.execute(db);

  const retainedEarningsAccountId = Number((retainedInsert as { insertId?: number }).insertId ?? 0);
  if (!retainedEarningsAccountId) {
    throw new Error("Failed to create retained earnings account for fiscal close fixture");
  }

  const plCode = `TEST-PL-${runId}`.slice(0, 20).toUpperCase();
  const plAccountName = options?.plAccountName ?? `Test Revenue ${runId}`;
  const plNormalBalance = options?.plNormalBalance ?? "K";
  const plBalance = options?.plBalance ?? "100.0000";
  const asOfDate = options?.asOfDate ?? "2099-12-31";
  // Deterministic fixture doc_id - counter-based, not Date.now()-based
  const fixtureDocId = nextDocId() + (_runIdCounter % 1000) * 1_000_000;

  // Offset account for balanced fixture journal entry.
  const offsetCode = `TEST-OFF-${runId}`.slice(0, 20).toUpperCase();
  const offsetInsert = await sql`
    INSERT INTO accounts (
      company_id,
      code,
      name,
      type_name,
      is_active,
      is_payable,
      report_group,
      normal_balance,
      created_at,
      updated_at
    )
    VALUES (
      ${companyId},
      ${offsetCode},
      ${`Test Offset ${runId}`},
      'ASSET',
      1,
      0,
      'BS',
      'D',
      NOW(),
      NOW()
    )
  `.execute(db);

  const offsetAccountId = Number((offsetInsert as { insertId?: number }).insertId ?? 0);
  if (!offsetAccountId) {
    throw new Error("Failed to create offset account for fiscal close fixture");
  }

  const plAccountInsert = await sql`
    INSERT INTO accounts (
      company_id,
      code,
      name,
      type_name,
      is_active,
      is_payable,
      report_group,
      normal_balance,
      created_at,
      updated_at
    )
    VALUES (
      ${companyId},
      ${plCode},
      ${plAccountName},
      'REVENUE',
      1,
      0,
      'PL',
      ${plNormalBalance},
      NOW(),
      NOW()
    )
  `.execute(db);

  const plAccountId = Number((plAccountInsert as { insertId?: number }).insertId ?? 0);
  if (!plAccountId) {
    throw new Error("Failed to create test P&L account for fiscal close fixture");
  }

  // Seed a balanced manual journal entry in the fiscal-year window.
  // This ensures close preview derives non-zero PL balances from journal_lines.
  const journalBatchInsert = await sql`
    INSERT INTO journal_batches (
      company_id,
      outlet_id,
      doc_type,
      doc_id,
      posted_at,
      client_ref,
      created_at,
      updated_at
    )
    VALUES (
      ${companyId},
      NULL,
      'MANUAL',
      ${fixtureDocId},
      ${asOfDate},
      ${`FIXTURE-FY-CLOSE-${runId}`},
      NOW(),
      NOW()
    )
  `.execute(db);

  const journalBatchId = Number((journalBatchInsert as { insertId?: number }).insertId ?? 0);
  if (!journalBatchId) {
    throw new Error("Failed to create fixture journal batch for fiscal close fixture");
  }

  const debitAccountId = plNormalBalance === "D" ? plAccountId : offsetAccountId;
  const creditAccountId = plNormalBalance === "D" ? offsetAccountId : plAccountId;

  await sql`
    INSERT INTO journal_lines (
      company_id,
      outlet_id,
      journal_batch_id,
      account_id,
      line_date,
      debit,
      credit,
      description,
      created_at,
      updated_at
    )
    VALUES (
      ${companyId},
      NULL,
      ${journalBatchId},
      ${debitAccountId},
      ${asOfDate},
      ${plBalance},
      '0.0000',
      'Fiscal close fixture debit line',
      NOW(),
      NOW()
    ),
    (
      ${companyId},
      NULL,
      ${journalBatchId},
      ${creditAccountId},
      ${asOfDate},
      '0.0000',
      ${plBalance},
      'Fiscal close fixture credit line',
      NOW(),
      NOW()
    )
  `.execute(db);

  return {
    retained_earnings_account_id: retainedEarningsAccountId,
    pl_account_id: plAccountId,
  };
}
