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
import { nowUTC } from "@jurnapod/shared";

// Re-export dashboard service
export {
  ReconciliationDashboardService,
  type AccountTypeFilter,
  type ReconciliationStatus,
  type ReconciliationDashboardQuery,
  type GlBalance,
  type SubledgerBalance,
  type ReconciliationVariance,
  type PeriodTrend,
  type DrilldownLine,
  type VarianceDrilldownResult,
  type GlImbalanceMetric,
  type ReconciliationDashboard,
} from "./dashboard-service.js";

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

/**
 * Extended reconciliation context with configurable document family and period filtering.
 *
 * This replaces the hardcoded POS_SALE doc_type with a configurable approach.
 *
 * @example
 * // POS reconciliation (backward compatible)
 * const posContext: ReconciliationContext = {
 *   companyId: 1,
 *   outletId: 1,
 *   documentFamily: "POS_SALE",
 *   sourceTable: "pos_transactions",
 *   statusPredicate: s => s === "COMPLETED"
 * };
 *
 * @example
 * // Inventory reconciliation
 * const invContext: ReconciliationContext = {
 *   companyId: 1,
 *   documentFamily: "INVENTORY",
 *   sourceTable: "inventory_transactions",
 *   statusPredicate: s => s === "POSTED",
 *   fiscalYearId: 2024
 * };
 */
export interface ReconciliationContext {
  companyId: number;
  outletId?: number;
  /** Document family code (e.g., "POS_SALE", "INVENTORY", "ALL"). Defaults to "POS_SALE" for backward compatibility. */
  documentFamily?: string;
  /** Source table for the reconciliation (e.g., "pos_transactions", "inventory_transactions"). */
  sourceTable?: string;
  /** Status predicate function - varies by document type.
   * POS uses 'COMPLETED', Journal entries use 'POSTED', etc.
   * Defaults to checking for COMPLETED status. */
  statusPredicate?: (status: string) => boolean;
  /** Filter by fiscal year. If provided along with periodId, periodId takes precedence. */
  fiscalYearId?: number;
  /** Filter by period. Takes precedence over fiscalYearId if both provided.
   * Note: Requires periods table to be implemented (not yet available - Epic 32). */
  periodId?: number;
  /** Optional date range filter (as epoch ms).
   * If periodId is provided, this is ignored.
   * Used when querying without formal period management. */
  dateRangeStartEpochMs?: number;
  dateRangeEndEpochMs?: number;
}

/** Default document family for POS reconciliation (backward compatible) */
export const DEFAULT_POS_DOC_TYPE = "POS_SALE";

/** Status predicate for POS transactions */
export function posTransactionStatusPredicate(status: string): boolean {
  return status === "COMPLETED";
}

/** Status predicate for journal batches */
export function journalBatchStatusPredicate(_status: string): boolean {
  // Journal batches don't have a status column in the current schema
  // All posted batches are considered valid
  return true;
}


interface ReconciliationRow {
  id: number;
  company_id: number;
  outlet_id: number | null;
  total_debit?: number;
  total_credit?: number;
}

/**
 * Detect transactions that are complete but lack corresponding journal batches.
 * Used for MISSING_JOURNAL finding type.
 *
 * Note: The statusPredicate is applied in JavaScript after fetching rows for flexibility.
 * For high-volume scenarios, consider implementing status filtering in SQL.
 */
async function detectMissingJournals(
  db: ReconciliationDbClient,
  ctx: ReconciliationContext
): Promise<ReconciliationFinding[]> {
  const { companyId, outletId, documentFamily = DEFAULT_POS_DOC_TYPE, sourceTable = "pos_transactions", statusPredicate = posTransactionStatusPredicate } = ctx;

  // Determine which table and join to use based on sourceTable
  if (sourceTable === "pos_transactions") {
    let query = sql`SELECT p.id, p.company_id, p.outlet_id, p.status
       FROM pos_transactions p
       LEFT JOIN journal_batches jb
         ON jb.company_id = p.company_id
         AND jb.doc_type = ${documentFamily}
         AND jb.doc_id = p.id
       WHERE jb.id IS NULL
         AND p.company_id = ${companyId}`;

    if (outletId != null) {
      query = sql`${query} AND p.outlet_id = ${outletId}`;
    }

    query = sql`${query} ORDER BY p.id ASC`;

    const result = await query.execute(db);
    const rows = result.rows as (ReconciliationRow & { status: string })[];

    // Apply status predicate filter in JavaScript
    return rows
      .filter(row => statusPredicate(row.status))
      .map((row) => ({
        type: "MISSING_JOURNAL" as const,
        sourceId: row.id,
        companyId: row.company_id,
        outletId: row.outlet_id ?? undefined,
        details: `POS transaction ${row.id} is COMPLETED but has no journal batch`
      }));
  }

  // TODO: Add support for other source tables (e.g., inventory_transactions)
  // When sourceTable is not pos_transactions, we would need different logic
  return [];
}

async function detectUnbalancedBatches(
  db: ReconciliationDbClient,
  ctx: ReconciliationContext
): Promise<ReconciliationFinding[]> {
  const { companyId, outletId, documentFamily = DEFAULT_POS_DOC_TYPE } = ctx;

  let query = sql`SELECT jb.id, jb.company_id, jb.outlet_id,
          COALESCE(SUM(jl.debit), 0) AS total_debit,
          COALESCE(SUM(jl.credit), 0) AS total_credit
     FROM journal_batches jb
     LEFT JOIN journal_lines jl ON jl.journal_batch_id = jb.id
     WHERE jb.doc_type = ${documentFamily}
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
  ctx: ReconciliationContext
): Promise<ReconciliationFinding[]> {
  const { companyId, outletId, documentFamily = DEFAULT_POS_DOC_TYPE, sourceTable = "pos_transactions" } = ctx;

  // Orphan batches are journal batches without corresponding source transactions
  // This is only meaningful for certain source tables
  if (sourceTable !== "pos_transactions") {
    return []; // Not applicable for other source types
  }

  let query = sql`SELECT jb.id, jb.company_id, jb.outlet_id
     FROM journal_batches jb
     LEFT JOIN pos_transactions p
       ON p.company_id = jb.company_id
       AND p.id = jb.doc_id
     WHERE jb.doc_type = ${documentFamily}
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
  ctx: ReconciliationContext
): Promise<number> {
  const { companyId, outletId, documentFamily = DEFAULT_POS_DOC_TYPE, sourceTable = "pos_transactions", statusPredicate = posTransactionStatusPredicate } = ctx;

  if (sourceTable !== "pos_transactions") {
    return 0;
  }

  let query = sql`SELECT COUNT(*) AS total
     FROM pos_transactions p
     LEFT JOIN journal_batches jb
       ON jb.company_id = p.company_id
       AND jb.doc_type = ${documentFamily}
       AND jb.doc_id = p.id
     WHERE jb.id IS NULL
       AND p.company_id = ${companyId}`;

  if (outletId != null) {
    query = sql`${query} AND p.outlet_id = ${outletId}`;
  }

  const result = await query.execute(db);
  const rows = result.rows as (ReconciliationRow & { status: string })[];

  // Apply status predicate filter
  return rows.filter(row => statusPredicate(row.status)).length;
}

async function countUnbalancedBatches(
  db: ReconciliationDbClient,
  ctx: ReconciliationContext
): Promise<number> {
  const { companyId, outletId, documentFamily = DEFAULT_POS_DOC_TYPE } = ctx;

  let query = sql`SELECT COUNT(*) AS total
     FROM (
       SELECT jb.id
       FROM journal_batches jb
       LEFT JOIN journal_lines jl ON jl.journal_batch_id = jb.id
       WHERE jb.doc_type = ${documentFamily}
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
  ctx: ReconciliationContext
): Promise<number> {
  const { companyId, outletId, documentFamily = DEFAULT_POS_DOC_TYPE, sourceTable = "pos_transactions" } = ctx;

  if (sourceTable !== "pos_transactions") {
    return 0;
  }

  let query = sql`SELECT COUNT(*) AS total
     FROM journal_batches jb
     LEFT JOIN pos_transactions p
       ON p.company_id = jb.company_id
       AND p.id = jb.doc_id
     WHERE jb.doc_type = ${documentFamily}
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
 *
 * Supports both legacy ReconciliationOptions (backward compatible) and
 * extended ReconciliationContext with configurable document family and period filtering.
 */
export class ReconciliationService {
  constructor(private readonly db: ReconciliationDbClient) {}

  /**
   * Build a ReconciliationContext from ReconciliationOptions (backward compatible).
   */
  private buildContext(options: ReconciliationOptions): ReconciliationContext {
    return {
      companyId: options.companyId,
      outletId: options.outletId,
      documentFamily: DEFAULT_POS_DOC_TYPE,
      sourceTable: "pos_transactions",
      statusPredicate: posTransactionStatusPredicate,
    };
  }

  /**
   * Run reconciliation check for POS transactions vs journal batches.
   * This is deterministic and rerunnable without side effects.
   *
   * @param options - Legacy options (backward compatible)
   * @param context - Extended context with configurable document family and period filtering
   */
  async reconcile(options: ReconciliationOptions, context?: Partial<ReconciliationContext>): Promise<ReconciliationResult> {
    const baseContext = this.buildContext(options);
    const ctx: ReconciliationContext = { ...baseContext, ...context };
    const { companyId, outletId } = ctx;
    const ranAt = nowUTC();

    // Run all detection queries in parallel for efficiency
    const [missingJournals, unbalanced, orphans] = await Promise.all([
      detectMissingJournals(this.db, ctx),
      detectUnbalancedBatches(this.db, ctx),
      detectOrphanBatches(this.db, ctx)
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
  async getCounts(options: ReconciliationOptions, context?: Partial<ReconciliationContext>): Promise<ReconciliationCounts> {
    const baseContext = this.buildContext(options);
    const ctx: ReconciliationContext = { ...baseContext, ...context };

    const [missingCount, unbalancedCount, orphanCount] = await Promise.all([
      countMissingJournals(this.db, ctx),
      countUnbalancedBatches(this.db, ctx),
      countOrphanBatches(this.db, ctx)
    ]);

    return {
      missingJournal: missingCount,
      unbalanced: unbalancedCount,
      orphan: orphanCount
    };
  }
}
