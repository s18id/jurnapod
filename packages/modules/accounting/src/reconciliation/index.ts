// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reconciliation Service
 * 
 * Financial reconciliation logic for POS transactions vs GL journal batches.
 * This is deterministic and rerunnable without side effects.
 * Maintains GL source-of-truth semantics.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

/**
 * Database client interface for dependency injection
 */
export interface ReconciliationDbClient extends KyselySchema {}

export type ReconciliationFindingType = "MISSING_JOURNAL" | "UNBALANCED" | "ORPHAN";

export interface ReconciliationFinding {
  type: ReconciliationFindingType;
  sourceId?: number; // pos_transactions.id for MISSING_JOURNAL
  journalBatchId?: number; // journal_batches.id for UNBALANCED/ORPHAN
  companyId: number;
  outletId?: number;
  details?: string;
}

export interface ReconciliationCounts {
  missingJournal: number;
  unbalanced: number;
  orphan: number;
}

export interface ReconciliationResult {
  companyId: number;
  outletId?: number;
  ranAt: string; // ISO timestamp
  findings: ReconciliationFinding[];
  counts: ReconciliationCounts;
  status: "PASS" | "FAIL";
}

export interface ReconciliationOptions {
  companyId: number;
  outletId?: number;
}

const POS_SALE_DOC_TYPE = "POS_SALE";

function toIsoString(date: Date): string {
  return date.toISOString();
}

interface ReconciliationRow {
  id: number;
  company_id: number;
  outlet_id: number | null;
  total_debit?: number;
  total_credit?: number;
}

async function detectMissingJournals(
  db: ReconciliationDbClient,
  companyId: number,
  outletId?: number
): Promise<ReconciliationFinding[]> {
  let query = sql`SELECT p.id, p.company_id, p.outlet_id
     FROM pos_transactions p
     LEFT JOIN journal_batches jb
       ON jb.company_id = p.company_id
      AND jb.doc_type = ${POS_SALE_DOC_TYPE}
      AND jb.doc_id = p.id
     WHERE p.status = 'COMPLETED'
       AND jb.id IS NULL
       AND p.company_id = ${companyId}`;

  if (outletId != null) {
    query = sql`${query} AND p.outlet_id = ${outletId}`;
  }

  query = sql`${query} ORDER BY p.id ASC`;

  const result = await query.execute(db);
  const rows = result.rows as ReconciliationRow[];

  return rows.map((row) => ({
    type: "MISSING_JOURNAL" as const,
    sourceId: row.id,
    companyId: row.company_id,
    outletId: row.outlet_id ?? undefined,
    details: `POS transaction ${row.id} is COMPLETED but has no journal batch`
  }));
}

async function detectUnbalancedBatches(
  db: ReconciliationDbClient,
  companyId: number,
  outletId?: number
): Promise<ReconciliationFinding[]> {
  let query = sql`SELECT jb.id, jb.company_id, jb.outlet_id,
          COALESCE(SUM(jl.debit), 0) AS total_debit,
          COALESCE(SUM(jl.credit), 0) AS total_credit
     FROM journal_batches jb
     LEFT JOIN journal_lines jl ON jl.journal_batch_id = jb.id
     WHERE jb.doc_type = ${POS_SALE_DOC_TYPE}
       AND jb.company_id = ${companyId}`;

  if (outletId != null) {
    query = sql`${query} AND jb.outlet_id = ${outletId}`;
  }

  query = sql`${query} GROUP BY jb.id
     HAVING total_debit <> total_credit
     ORDER BY jb.id ASC`;

  const result = await query.execute(db);
  const rows = result.rows as ReconciliationRow[];

  return rows.map((row) => ({
    type: "UNBALANCED" as const,
    journalBatchId: row.id,
    companyId: row.company_id,
    outletId: row.outlet_id ?? undefined,
    details: `Journal batch ${row.id} has unbalanced lines: debit=${row.total_debit}, credit=${row.total_credit}`
  }));
}

async function detectOrphanBatches(
  db: ReconciliationDbClient,
  companyId: number,
  outletId?: number
): Promise<ReconciliationFinding[]> {
  let query = sql`SELECT jb.id, jb.company_id, jb.outlet_id
     FROM journal_batches jb
     LEFT JOIN pos_transactions p
       ON p.company_id = jb.company_id
      AND p.id = jb.doc_id
     WHERE jb.doc_type = ${POS_SALE_DOC_TYPE}
       AND p.id IS NULL
       AND jb.company_id = ${companyId}`;

  if (outletId != null) {
    query = sql`${query} AND jb.outlet_id = ${outletId}`;
  }

  query = sql`${query} ORDER BY jb.id ASC`;

  const result = await query.execute(db);
  const rows = result.rows as ReconciliationRow[];

  return rows.map((row) => ({
    type: "ORPHAN" as const,
    journalBatchId: row.id,
    companyId: row.company_id,
    outletId: row.outlet_id ?? undefined,
    details: `Journal batch ${row.id} has no corresponding POS transaction`
  }));
}

async function countMissingJournals(
  db: ReconciliationDbClient,
  companyId: number,
  outletId?: number
): Promise<number> {
  let query = sql`SELECT COUNT(*) AS total
     FROM pos_transactions p
     LEFT JOIN journal_batches jb
       ON jb.company_id = p.company_id
      AND jb.doc_type = ${POS_SALE_DOC_TYPE}
      AND jb.doc_id = p.id
     WHERE p.status = 'COMPLETED'
       AND jb.id IS NULL
       AND p.company_id = ${companyId}`;

  if (outletId != null) {
    query = sql`${query} AND p.outlet_id = ${outletId}`;
  }

  const result = await query.execute(db);
  return Number((result.rows[0] as { total: number }).total);
}

async function countUnbalancedBatches(
  db: ReconciliationDbClient,
  companyId: number,
  outletId?: number
): Promise<number> {
  let query = sql`SELECT COUNT(*) AS total
     FROM (
       SELECT jb.id
       FROM journal_batches jb
       LEFT JOIN journal_lines jl ON jl.journal_batch_id = jb.id
       WHERE jb.doc_type = ${POS_SALE_DOC_TYPE}
         AND jb.company_id = ${companyId}`;

  if (outletId != null) {
    query = sql`${query} AND jb.outlet_id = ${outletId}`;
  }

  query = sql`${query}
       GROUP BY jb.id
       HAVING COALESCE(SUM(jl.debit), 0) <> COALESCE(SUM(jl.credit), 0)
     ) t`;

  const result = await query.execute(db);
  return Number((result.rows[0] as { total: number }).total);
}

async function countOrphanBatches(
  db: ReconciliationDbClient,
  companyId: number,
  outletId?: number
): Promise<number> {
  let query = sql`SELECT COUNT(*) AS total
     FROM journal_batches jb
     LEFT JOIN pos_transactions p
       ON p.company_id = jb.company_id
      AND p.id = jb.doc_id
     WHERE jb.doc_type = ${POS_SALE_DOC_TYPE}
       AND p.id IS NULL
       AND jb.company_id = ${companyId}`;

  if (outletId != null) {
    query = sql`${query} AND jb.outlet_id = ${outletId}`;
  }

  const result = await query.execute(db);
  return Number((result.rows[0] as { total: number }).total);
}

/**
 * ReconciliationService
 * 
 * Framework-agnostic business logic for financial reconciliation.
 * Validates that POS transactions are properly posted to the GL journal.
 */
export class ReconciliationService {
  constructor(private readonly db: ReconciliationDbClient) {}

  /**
   * Run reconciliation check for POS transactions vs journal batches.
   * This is deterministic and rerunnable without side effects.
   */
  async reconcile(options: ReconciliationOptions): Promise<ReconciliationResult> {
    const { companyId, outletId } = options;
    const ranAt = toIsoString(new Date());

    // Run all detection queries in parallel for efficiency
    const [missingJournals, unbalanced, orphans] = await Promise.all([
      detectMissingJournals(this.db, companyId, outletId),
      detectUnbalancedBatches(this.db, companyId, outletId),
      detectOrphanBatches(this.db, companyId, outletId)
    ]);

    const findings = [...missingJournals, ...unbalanced, ...orphans];
    const counts: ReconciliationCounts = {
      missingJournal: missingJournals.length,
      unbalanced: unbalanced.length,
      orphan: orphans.length
    };

    const hasFailures = counts.missingJournal > 0 || counts.unbalanced > 0 || counts.orphan > 0;

    return {
      companyId,
      outletId,
      ranAt,
      findings,
      counts,
      status: hasFailures ? "FAIL" : "PASS"
    };
  }

  /**
   * Get reconciliation counts only (lighter weight than full reconcile with findings).
   */
  async getCounts(options: ReconciliationOptions): Promise<ReconciliationCounts> {
    const { companyId, outletId } = options;

    const [missingCount, unbalancedCount, orphanCount] = await Promise.all([
      countMissingJournals(this.db, companyId, outletId),
      countUnbalancedBatches(this.db, companyId, outletId),
      countOrphanBatches(this.db, companyId, outletId)
    ]);

    return {
      missingJournal: missingCount,
      unbalanced: unbalancedCount,
      orphan: orphanCount
    };
  }
}
