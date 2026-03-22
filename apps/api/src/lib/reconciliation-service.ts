// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { PoolConnection, RowDataPacket } from "mysql2/promise";

const POS_SALE_DOC_TYPE = "POS_SALE";

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

interface QueryExecutor {
  execute: PoolConnection["execute"];
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

function buildWhereClause(
  companyId: number,
  outletId?: number
): { sql: string; values: (number | string)[] } {
  const clauses = ["p.company_id = ?"];
  const values: (number | string)[] = [companyId];

  if (outletId != null) {
    clauses.push("p.outlet_id = ?");
    values.push(outletId);
  }

  return {
    sql: ` AND ${clauses.join(" AND ")}`,
    values
  };
}

function buildJournalWhereClause(
  companyId: number,
  outletId?: number
): { sql: string; values: (number | string)[] } {
  const clauses = ["jb.company_id = ?"];
  const values: (number | string)[] = [companyId];

  if (outletId != null) {
    clauses.push("jb.outlet_id = ?");
    values.push(outletId);
  }

  return {
    sql: ` AND ${clauses.join(" AND ")}`,
    values
  };
}

async function detectMissingJournals(
  executor: QueryExecutor,
  companyId: number,
  outletId?: number
): Promise<ReconciliationFinding[]> {
  const where = buildWhereClause(companyId, outletId);

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT p.id, p.company_id, p.outlet_id
     FROM pos_transactions p
     LEFT JOIN journal_batches jb
       ON jb.company_id = p.company_id
      AND jb.doc_type = ?
      AND jb.doc_id = p.id
     WHERE p.status = 'COMPLETED'
       AND jb.id IS NULL${where.sql}
     ORDER BY p.id ASC`,
    [POS_SALE_DOC_TYPE, ...where.values]
  );

  return (rows as Array<{ id: number; company_id: number; outlet_id: number }>).map((row) => ({
    type: "MISSING_JOURNAL" as const,
    sourceId: row.id,
    companyId: row.company_id,
    outletId: row.outlet_id,
    details: `POS transaction ${row.id} is COMPLETED but has no journal batch`
  }));
}

async function detectUnbalancedBatches(
  executor: QueryExecutor,
  companyId: number,
  outletId?: number
): Promise<ReconciliationFinding[]> {
  const where = buildJournalWhereClause(companyId, outletId);

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT jb.id, jb.company_id, jb.outlet_id,
            COALESCE(SUM(jl.debit), 0) AS total_debit,
            COALESCE(SUM(jl.credit), 0) AS total_credit
     FROM journal_batches jb
     LEFT JOIN journal_lines jl ON jl.journal_batch_id = jb.id
     WHERE jb.doc_type = ?${where.sql}
     GROUP BY jb.id
     HAVING total_debit <> total_credit
     ORDER BY jb.id ASC`,
    [POS_SALE_DOC_TYPE, ...where.values]
  );

  return (rows as Array<{
    id: number;
    company_id: number;
    outlet_id: number;
    total_debit: number;
    total_credit: number;
  }>).map((row) => ({
    type: "UNBALANCED" as const,
    journalBatchId: row.id,
    companyId: row.company_id,
    outletId: row.outlet_id,
    details: `Journal batch ${row.id} has unbalanced lines: debit=${row.total_debit}, credit=${row.total_credit}`
  }));
}

async function detectOrphanBatches(
  executor: QueryExecutor,
  companyId: number,
  outletId?: number
): Promise<ReconciliationFinding[]> {
  const where = buildJournalWhereClause(companyId, outletId);

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT jb.id, jb.company_id, jb.outlet_id
     FROM journal_batches jb
     LEFT JOIN pos_transactions p
       ON p.company_id = jb.company_id
      AND p.id = jb.doc_id
     WHERE jb.doc_type = ?
       AND p.id IS NULL${where.sql}
     ORDER BY jb.id ASC`,
    [POS_SALE_DOC_TYPE, ...where.values]
  );

  return (rows as Array<{ id: number; company_id: number; outlet_id: number }>).map((row) => ({
    type: "ORPHAN" as const,
    journalBatchId: row.id,
    companyId: row.company_id,
    outletId: row.outlet_id,
    details: `Journal batch ${row.id} has no corresponding POS transaction`
  }));
}

async function countMissingJournals(
  executor: QueryExecutor,
  companyId: number,
  outletId?: number
): Promise<number> {
  const where = buildWhereClause(companyId, outletId);

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM pos_transactions p
     LEFT JOIN journal_batches jb
       ON jb.company_id = p.company_id
      AND jb.doc_type = ?
      AND jb.doc_id = p.id
     WHERE p.status = 'COMPLETED'
       AND jb.id IS NULL${where.sql}`,
    [POS_SALE_DOC_TYPE, ...where.values]
  );

  return Number((rows[0] as { total: number }).total);
}

async function countUnbalancedBatches(
  executor: QueryExecutor,
  companyId: number,
  outletId?: number
): Promise<number> {
  const where = buildJournalWhereClause(companyId, outletId);

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM (
       SELECT jb.id
       FROM journal_batches jb
       LEFT JOIN journal_lines jl ON jl.journal_batch_id = jb.id
       WHERE jb.doc_type = ?${where.sql}
       GROUP BY jb.id
       HAVING COALESCE(SUM(jl.debit), 0) <> COALESCE(SUM(jl.credit), 0)
     ) t`,
    [POS_SALE_DOC_TYPE, ...where.values]
  );

  return Number((rows[0] as { total: number }).total);
}

async function countOrphanBatches(
  executor: QueryExecutor,
  companyId: number,
  outletId?: number
): Promise<number> {
  const where = buildJournalWhereClause(companyId, outletId);

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM journal_batches jb
     LEFT JOIN pos_transactions p
       ON p.company_id = jb.company_id
      AND p.id = jb.doc_id
     WHERE jb.doc_type = ?
       AND p.id IS NULL${where.sql}`,
    [POS_SALE_DOC_TYPE, ...where.values]
  );

  return Number((rows[0] as { total: number }).total);
}

export interface ReconciliationOptions {
  companyId: number;
  outletId?: number;
}

export class ReconciliationService {
  constructor(private readonly executor: QueryExecutor) {}

  /**
   * Run reconciliation check for POS transactions vs journal batches.
   * This is deterministic and rerunnable without side effects.
   */
  async reconcile(options: ReconciliationOptions): Promise<ReconciliationResult> {
    const { companyId, outletId } = options;
    const ranAt = toIsoString(new Date());

    // Run all detection queries in parallel for efficiency
    const [missingJournals, unbalanced, orphans] = await Promise.all([
      detectMissingJournals(this.executor, companyId, outletId),
      detectUnbalancedBatches(this.executor, companyId, outletId),
      detectOrphanBatches(this.executor, companyId, outletId)
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
      countMissingJournals(this.executor, companyId, outletId),
      countUnbalancedBatches(this.executor, companyId, outletId),
      countOrphanBatches(this.executor, companyId, outletId)
    ]);

    return {
      missingJournal: missingCount,
      unbalanced: unbalancedCount,
      orphan: orphanCount
    };
  }
}
