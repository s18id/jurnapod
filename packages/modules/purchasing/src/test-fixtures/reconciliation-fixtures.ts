// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

/**
 * Fixture for ap_reconciliation_snapshots table (purchasing domain).
 *
 * Creates a snapshot row with deterministic defaults. Used by AR snapshot
 * trigger compatibility tests (Story 57.1) and reconciliation tests.
 */
export interface ReconciliationSnapshotFixture {
  id: number;
  companyId: number;
}

export interface CreateTestReconciliationSnapshotOpts {
  companyId: number;
  /** User ID for the created_by FK */
  userId: number;
  asOfDate?: string;
  snapshotVersion?: number;
  apSubledgerBalance?: number;
  glControlBalance?: number;
  inputsHash?: string;
  status?: string;
}

export async function createTestReconciliationSnapshot(
  db: KyselySchema,
  opts: CreateTestReconciliationSnapshotOpts,
): Promise<ReconciliationSnapshotFixture> {
  const {
    companyId,
    userId,
    asOfDate = "2026-03-31",
    snapshotVersion = 1,
    apSubledgerBalance = 1000000.0000,
    glControlBalance = 1000000.0000,
    inputsHash = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    status = "ACTIVE",
  } = opts;

  const variance = apSubledgerBalance - glControlBalance;

  const result = await sql`
    INSERT INTO ap_reconciliation_snapshots (
      company_id, as_of_date, timezone, snapshot_version,
      ap_subledger_balance, gl_control_balance, variance,
      configured_account_ids_json, account_source, inputs_hash,
      created_by, auto_generated, status
    ) VALUES (
      ${companyId},
      ${asOfDate},
      'Asia/Jakarta',
      ${snapshotVersion},
      ${apSubledgerBalance.toFixed(4)},
      ${glControlBalance.toFixed(4)},
      ${variance.toFixed(4)},
      ${'{"accounts":[]}'},
      'fallback_company_default',
      ${inputsHash},
      ${userId},
      0,
      ${status}
    )
  `.execute(db);

  return {
    id: Number(result.insertId),
    companyId,
  };
}
