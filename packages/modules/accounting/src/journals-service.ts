// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  ManualJournalEntryCreateRequest,
  JournalBatchResponse,
  JournalListQuery,
  JournalLineResponse
} from "@jurnapod/shared";
import { toRfc3339Required } from "@jurnapod/shared";
import { sql } from "kysely";
import { withTransactionRetry, type KyselySchema } from "@jurnapod/db";

/**
 * Database client interface for dependency injection
 */
export interface JournalsDbClient extends KyselySchema {}

/**
 * Custom error classes
 */
export class JournalNotBalancedError extends Error {
  code = "JOURNAL_NOT_BALANCED";
  constructor(totalDebit: number, totalCredit: number) {
    super(`Journal entry not balanced: debit=${totalDebit}, credit=${totalCredit}`);
    this.name = "JournalNotBalancedError";
  }
}

export class JournalNotFoundError extends Error {
  code = "JOURNAL_NOT_FOUND";
  constructor(batchId: number) {
    super(`Journal batch ${batchId} not found`);
    this.name = "JournalNotFoundError";
  }
}

export class InvalidJournalLineError extends Error {
  code = "INVALID_JOURNAL_LINE";
  constructor(message: string) {
    super(message);
    this.name = "InvalidJournalLineError";
  }
}

export class JournalOutsideFiscalYearError extends Error {
  code = "JOURNAL_OUTSIDE_FISCAL_YEAR";
  constructor(entryDate: string) {
    super(`Journal entry date ${entryDate} is outside any open fiscal year`);
    this.name = "JournalOutsideFiscalYearError";
  }
}

export class FiscalYearClosedError extends Error {
  code = "FISCAL_YEAR_CLOSED";
  constructor(fiscalYearId: number) {
    super(`Fiscal year ${fiscalYearId} is closed and cannot accept new journal entries`);
    this.name = "FiscalYearClosedError";
  }
}

/**
 * Result of a GL imbalance check
 */
export interface GlImbalanceResult {
  journalBatchId: number;
  totalDebit: number;
  totalCredit: number;
  imbalance: number;
}

/**
 * Import audit service interface from accounts-service
 */
import type { AuditServiceInterface } from "./accounts-service";

/**
 * JournalsService
 * Framework-agnostic business logic for manual journal entries
 */
export class JournalsService {
  constructor(
    private readonly db: JournalsDbClient,
    private readonly auditService?: AuditServiceInterface
  ) {}

  /**
   * Create a manual journal entry
   * 
   * @param data The journal entry data
   * @param userId Optional user ID for audit logging
   * @param trx Optional external transaction (if provided, uses this transaction instead of creating a new one)
   */
  async createManualEntry(
    data: ManualJournalEntryCreateRequest,
    userId?: number,
    trx?: KyselySchema
  ): Promise<JournalBatchResponse> {
    if (data.client_ref) {
      const existingId = await this.findManualEntryIdByClientRef(
        data.company_id,
        data.client_ref
      );
      if (existingId) {
        return this.getJournalBatch(existingId, data.company_id);
      }
    }

    await this.ensureEntryDateInOpenFiscalYear(data.company_id, data.entry_date);

    // Validate balance
    const totalDebit = data.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = data.lines.reduce((sum, line) => sum + line.credit, 0);
    
    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      throw new JournalNotBalancedError(totalDebit, totalCredit);
    }

    // Validate each line has either debit or credit (not both)
    for (const line of data.lines) {
      if (line.debit > 0 && line.credit > 0) {
        throw new InvalidJournalLineError("Line cannot have both debit and credit");
      }
      if (line.debit === 0 && line.credit === 0) {
        throw new InvalidJournalLineError("Line must have either debit or credit");
      }
    }

    // For manual entries, we use a unique doc_id based on timestamp
    const docId = Date.now();

    const batchId = await (trx 
      ? this.executeManualEntryInsert(trx, data, docId, totalDebit, totalCredit, userId)
      : withTransactionRetry(this.db, async (innerTrx) => 
          this.executeManualEntryInsert(innerTrx as unknown as KyselySchema, data, docId, totalDebit, totalCredit, userId)
        )
    );

    // Return the created batch with lines
    return this.getJournalBatch(batchId, data.company_id);
  }

  /**
   * Execute the manual entry insert operation
   * @internal
   */
  private async executeManualEntryInsert(
    trx: KyselySchema,
    data: ManualJournalEntryCreateRequest,
    docId: number,
    totalDebit: number,
    totalCredit: number,
    userId?: number
  ): Promise<number> {
    const batchResult = await sql`
      INSERT INTO journal_batches (
        company_id, outlet_id, doc_type, doc_id, client_ref, posted_at, created_at, updated_at
      )
      VALUES (
        ${data.company_id},
        ${data.outlet_id ?? null},
        'MANUAL',
        ${docId},
        ${data.client_ref ?? null},
        ${data.entry_date},
        NOW(),
        NOW()
      )
    `.execute(trx);

    const newBatchId = Number(batchResult.insertId);

    // Create journal lines
    for (const line of data.lines) {
      await sql`
        INSERT INTO journal_lines (
          journal_batch_id, company_id, outlet_id, account_id, 
          line_date, debit, credit, description, created_at, updated_at
        )
        VALUES (
          ${newBatchId},
          ${data.company_id},
          ${data.outlet_id ?? null},
          ${line.account_id},
          ${data.entry_date},
          ${line.debit},
          ${line.credit},
          ${line.description},
          NOW(),
          NOW()
        )
      `.execute(trx);
    }

    // Audit log (inside transaction)
    if (this.auditService && userId) {
      await this.auditService.logCreate(
        { company_id: data.company_id, user_id: userId },
        "journal_entry",
        newBatchId,
        {
          doc_type: "MANUAL",
          entry_date: data.entry_date,
          description: data.description,
          total_debit: totalDebit,
          total_credit: totalCredit,
          line_count: data.lines.length
        }
      );
    }

    return newBatchId;
  }

  private async findManualEntryIdByClientRef(
    companyId: number,
    clientRef: string
  ): Promise<number | null> {
    const result = await sql<{ id: number }>`
      SELECT id
      FROM journal_batches
      WHERE company_id = ${companyId}
        AND doc_type = 'MANUAL'
        AND client_ref = ${clientRef}
      LIMIT 1
    `.execute(this.db);

    return result.rows.length > 0 ? Number(result.rows[0].id) : null;
  }

  private async ensureEntryDateInOpenFiscalYear(companyId: number, entryDate: string): Promise<void> {
    // First check if there's an OPEN fiscal year containing this date
    const openResult = await sql<{ id: number }>`
      SELECT id
      FROM fiscal_years
      WHERE company_id = ${companyId}
        AND status = 'OPEN'
        AND start_date <= ${entryDate}
        AND end_date >= ${entryDate}
      LIMIT 1
    `.execute(this.db);

    if (openResult.rows.length > 0) {
      return; // Found valid open fiscal year
    }

    // Check if there's a CLOSED fiscal year that contains this date
    const closedResult = await sql<{ id: number }>`
      SELECT id
      FROM fiscal_years
      WHERE company_id = ${companyId}
        AND status = 'CLOSED'
        AND start_date <= ${entryDate}
        AND end_date >= ${entryDate}
      LIMIT 1
    `.execute(this.db);

    if (closedResult.rows.length > 0) {
      throw new FiscalYearClosedError(Number(closedResult.rows[0].id));
    }

    // No fiscal year found for this date at all
    throw new JournalOutsideFiscalYearError(entryDate);
  }

  /**
   * Get a journal batch by ID (Migrated to Kysely with JOIN)
   */
  async getJournalBatch(batchId: number, companyId: number): Promise<JournalBatchResponse> {
    // Use Kysely with JOIN to get batch and lines in one query (fixes N+1)
    const result = await this.db
      .selectFrom('journal_batches as jb')
      .leftJoin('journal_lines as jl', 'jb.id', 'jl.journal_batch_id')
      .where('jb.id', '=', batchId)
      .where('jb.company_id', '=', companyId)
      .select([
        'jb.id',
        'jb.company_id',
        'jb.outlet_id',
        'jb.doc_type',
        'jb.doc_id',
        'jb.client_ref',
        'jb.posted_at',
        'jb.created_at',
        'jb.updated_at',
        'jl.id as jl_id',
        'jl.journal_batch_id',
        'jl.company_id as jl_company_id',
        'jl.outlet_id as jl_outlet_id',
        'jl.account_id',
        'jl.line_date',
        'jl.debit',
        'jl.credit',
        'jl.description as jl_description',
        'jl.created_at as jl_created_at',
        'jl.updated_at as jl_updated_at'
      ])
      .orderBy('jl.id', 'asc')
      .execute();

    if (result.length === 0) {
      throw new JournalNotFoundError(batchId);
    }

    const firstRow = result[0];

    // Extract batch fields
    const batch = {
      id: firstRow.id,
      company_id: firstRow.company_id,
      outlet_id: firstRow.outlet_id,
      doc_type: firstRow.doc_type,
      doc_id: firstRow.doc_id,
      client_ref: firstRow.client_ref,
      posted_at: firstRow.posted_at,
      created_at: firstRow.created_at,
      updated_at: firstRow.updated_at
    };

    // Transform lines from flat result
    const lines = result
      .filter((row: typeof firstRow) => row.jl_id !== null && row.jl_id !== undefined)
      .map((row: typeof firstRow) => ({
        id: row.jl_id as number,
        journal_batch_id: row.journal_batch_id as number,
        company_id: row.jl_company_id as number,
        outlet_id: row.jl_outlet_id as number | null,
        account_id: row.account_id as number,
        line_date: row.line_date instanceof Date 
          ? row.line_date.toISOString().split('T')[0]
          : String(row.line_date).split('T')[0],
        debit: Number(row.debit),
        credit: Number(row.credit),
        description: row.jl_description as string,
        created_at: toRfc3339Required(row.jl_created_at as Date),
        updated_at: toRfc3339Required(row.jl_updated_at as Date)
      }));

    return {
      id: batch.id,
      company_id: batch.company_id,
      outlet_id: batch.outlet_id,
      doc_type: batch.doc_type,
      doc_id: batch.doc_id,
      client_ref: batch.client_ref ?? null,
      posted_at: toRfc3339Required(batch.posted_at),
      created_at: toRfc3339Required(batch.created_at),
      updated_at: toRfc3339Required(batch.updated_at),
      lines
    };
  }

  /**
   * List journal batches with optional filters (Migrated to Kysely, fixes N+1)
   */
  async listJournalBatches(filters: JournalListQuery): Promise<JournalBatchResponse[]> {
    // Step 1: Get batch IDs with pagination using Kysely
    let batchQuery = this.db
      .selectFrom('journal_batches as jb')
      .where('jb.company_id', '=', filters.company_id);

    // Optional filters
    if (filters.outlet_id !== undefined) {
      batchQuery = batchQuery.where('jb.outlet_id', '=', filters.outlet_id);
    }

    if (filters.doc_type) {
      batchQuery = batchQuery.where('jb.doc_type', '=', filters.doc_type);
    }

    if (filters.start_date) {
      batchQuery = batchQuery.where('jb.posted_at', '>=', filters.start_date as any);
    }

    if (filters.end_date) {
      batchQuery = batchQuery.where('jb.posted_at', '<=', filters.end_date as any);
    }

    // Account filter (requires join with journal_lines)
    if (filters.account_id !== undefined) {
      batchQuery = batchQuery
        .innerJoin('journal_lines as jl', 'jb.id', 'jl.journal_batch_id')
        .where('jl.account_id', '=', filters.account_id);
    }

    const batchesResult = await batchQuery
      .select([
        'jb.id',
        'jb.company_id',
        'jb.outlet_id',
        'jb.doc_type',
        'jb.doc_id',
        'jb.client_ref',
        'jb.posted_at',
        'jb.created_at',
        'jb.updated_at'
      ])
      .orderBy('jb.posted_at', 'desc')
      .orderBy('jb.id', 'desc')
      .limit(filters.limit ?? 100)
      .offset(filters.offset ?? 0)
      .distinct()
      .execute();

    if (batchesResult.length === 0) {
      return [];
    }

    // Step 2: Get all lines for the batch IDs in ONE query (fixes N+1)
    const batchIds = batchesResult.map((b: typeof batchesResult[0]) => b.id);
    
    const linesResult = await this.db
      .selectFrom('journal_lines')
      .selectAll()
      .where('journal_batch_id', 'in', batchIds)
      .orderBy('id', 'asc')
      .execute();

    // Step 3: Group lines by batch_id in memory
    // Type the line properly - use explicit interface
    type JournalLineFlat = {
      id: number;
      journal_batch_id: number;
      company_id: number;
      outlet_id: number | null;
      account_id: number;
      line_date: Date;
      debit: string;
      credit: string;
      description: string;
      created_at: Date;
      updated_at: Date;
    };

    const linesByBatchId = new Map<number, JournalLineFlat[]>();
    for (const line of linesResult as JournalLineFlat[]) {
      const existing = linesByBatchId.get(line.journal_batch_id) || [];
      existing.push(line);
      linesByBatchId.set(line.journal_batch_id, existing);
    }

    // Step 4: Transform to response format
    return batchesResult.map((batch: typeof batchesResult[0]) => {
      const batchLines = linesByBatchId.get(batch.id) || [];
      
      return {
        id: batch.id,
        company_id: batch.company_id,
        outlet_id: batch.outlet_id,
        doc_type: batch.doc_type,
        doc_id: batch.doc_id,
        client_ref: batch.client_ref ?? null,
        posted_at: toRfc3339Required(batch.posted_at),
        created_at: toRfc3339Required(batch.created_at),
        updated_at: toRfc3339Required(batch.updated_at),
        lines: batchLines.map(line => ({
          id: line.id,
          journal_batch_id: line.journal_batch_id,
          company_id: line.company_id,
          outlet_id: line.outlet_id,
          account_id: line.account_id,
          line_date: line.line_date instanceof Date
            ? line.line_date.toISOString().split('T')[0]
            : String(line.line_date).split('T')[0],
          debit: Number(line.debit),
          credit: Number(line.credit),
          description: line.description,
          created_at: toRfc3339Required(line.created_at),
          updated_at: toRfc3339Required(line.updated_at)
        }))
      };
    });
  }

  /**
   * Check if a specific journal batch is balanced (debit = credit)
   * Returns the imbalance details if unbalanced, null if balanced
   */
  async checkGlImbalance(batchId: number): Promise<GlImbalanceResult | null> {
    const result = await sql<{
      journal_batch_id: number;
      total_debit: string;
      total_credit: string;
    }>`
      SELECT 
        journal_batch_id,
        SUM(debit) as total_debit,
        SUM(credit) as total_credit
      FROM journal_lines
      WHERE journal_batch_id = ${batchId}
      GROUP BY journal_batch_id
      HAVING SUM(debit) != SUM(credit)
    `.execute(this.db);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const totalDebit = Number(row.total_debit);
    const totalCredit = Number(row.total_credit);

    return {
      journalBatchId: Number(row.journal_batch_id),
      totalDebit,
      totalCredit,
      imbalance: totalDebit - totalCredit
    };
  }

  /**
   * Find all GL imbalances for a specific company.
   * 
   * @param companyId - Company ID to scope the query (REQUIRED for tenant isolation)
   * @returns Array of GL imbalance results for the given company
   * 
   * @warning Performance: On large datasets, this query scans all journal_lines for the company.
   * Consider adding date filters (e.g., last 30 days) for frequent monitoring calls.
   */
  async findAllGlImbalances(companyId: number): Promise<GlImbalanceResult[]> {
    const result = await sql<{
      journal_batch_id: number;
      total_debit: string;
      total_credit: string;
    }>`
      SELECT 
        journal_batch_id,
        SUM(debit) as total_debit,
        SUM(credit) as total_credit
      FROM journal_lines
      WHERE company_id = ${companyId}
      GROUP BY journal_batch_id, company_id
      HAVING SUM(debit) != SUM(credit)
    `.execute(this.db);

    return result.rows.map((row) => {
      const totalDebit = Number(row.total_debit);
      const totalCredit = Number(row.total_credit);
      return {
        journalBatchId: Number(row.journal_batch_id),
        totalDebit,
        totalCredit,
        imbalance: totalDebit - totalCredit
      };
    });
  }
}

/**
 * Standalone function to check GL imbalance for a specific journal batch.
 * This can be called without instantiating JournalsService.
 * 
 * @param db - Database client (KyselySchema or compatible)
 * @param batchId - Journal batch ID to check
 * @param companyId - Tenant scope guard
 * @returns GlImbalanceResult if unbalanced, null if balanced
 * 
 * @note Tenant safety: the query anchors on journal_batches.id and joins journal_lines
 * with company consistency (`jl.company_id = jb.company_id`) to avoid cross-tenant drift.
 */
export async function checkGlImbalanceByBatchId(
  db: KyselySchema,
  batchId: number,
  companyId: number
): Promise<GlImbalanceResult | null> {
  const result = await sql<{
    journal_batch_id: number;
    total_debit: string;
    total_credit: string;
  }>`
    SELECT 
      jb.id as journal_batch_id,
      SUM(jl.debit) as total_debit,
      SUM(jl.credit) as total_credit
    FROM journal_batches jb
    INNER JOIN journal_lines jl ON jl.journal_batch_id = jb.id
    WHERE jb.id = ${batchId}
      AND jb.company_id = ${companyId}
      AND jl.company_id = jb.company_id
    GROUP BY jb.id
    HAVING SUM(jl.debit) != SUM(jl.credit)
  `.execute(db);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const totalDebit = Number(row.total_debit);
  const totalCredit = Number(row.total_credit);

  return {
    journalBatchId: Number(row.journal_batch_id),
    totalDebit,
    totalCredit,
    imbalance: totalDebit - totalCredit
  };
}

const mysqlDuplicateErrorCode = 1062;

function isMysqlDuplicateError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "errno" in error &&
    (error as { errno?: number }).errno === mysqlDuplicateErrorCode
  );
}
