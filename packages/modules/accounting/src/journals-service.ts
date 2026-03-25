// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  ManualJournalEntryCreateRequest,
  JournalBatchResponse,
  JournalListQuery,
  JournalLineResponse
} from "@jurnapod/shared";
import { toRfc3339Required } from "@jurnapod/shared";
import type { JurnapodDbClient } from "@jurnapod/db";

/**
 * Database client interface for dependency injection
 */
export interface JournalsDbClient extends JurnapodDbClient {}

/**
 * Custom error classes
 */
export class JournalNotBalancedError extends Error {
  constructor(totalDebit: number, totalCredit: number) {
    super(`Journal entry not balanced: debit=${totalDebit}, credit=${totalCredit}`);
    this.name = "JournalNotBalancedError";
  }
}

export class JournalNotFoundError extends Error {
  constructor(batchId: number) {
    super(`Journal batch ${batchId} not found`);
    this.name = "JournalNotFoundError";
  }
}

export class InvalidJournalLineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidJournalLineError";
  }
}

export class JournalOutsideFiscalYearError extends Error {
  constructor(entryDate: string) {
    super(`Journal entry date ${entryDate} is outside any open fiscal year`);
    this.name = "JournalOutsideFiscalYearError";
  }
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
   */
  async createManualEntry(
    data: ManualJournalEntryCreateRequest,
    userId?: number
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

    // Use transaction if supported
    const useTransaction = this.db.begin && this.db.commit && this.db.rollback;
    
    try {
      if (useTransaction) {
        await this.db.begin!();
      }

      // Create journal batch
      const batchSql = `
        INSERT INTO journal_batches (
          company_id, outlet_id, doc_type, doc_id, client_ref, posted_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;

      // For manual entries, we use a unique doc_id based on timestamp
      const docId = Date.now();
      
      const batchResult = await this.db.execute(batchSql, [
        data.company_id,
        data.outlet_id ?? null,
        "MANUAL",
        docId,
        data.client_ref ?? null,
        data.entry_date
      ]);

      const batchId = batchResult.insertId!;

      // Create journal lines
      const lineSql = `
        INSERT INTO journal_lines (
          journal_batch_id, company_id, outlet_id, account_id, 
          line_date, debit, credit, description, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;

      for (const line of data.lines) {
        await this.db.execute(lineSql, [
          batchId,
          data.company_id,
          data.outlet_id ?? null,
          line.account_id,
          data.entry_date,
          line.debit,
          line.credit,
          line.description
        ]);
      }

      // Audit log (inside transaction)
      if (this.auditService && userId) {
        await this.auditService.logCreate(
          { company_id: data.company_id, user_id: userId },
          "journal_entry",
          batchId,
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

      if (useTransaction) {
        await this.db.commit!();
      }

      // Return the created batch with lines
      return this.getJournalBatch(batchId, data.company_id);
    } catch (error) {
      if (useTransaction) {
        await this.db.rollback!();
      }
      if (data.client_ref && isMysqlDuplicateError(error)) {
        const existingId = await this.findManualEntryIdByClientRef(
          data.company_id,
          data.client_ref
        );
        if (existingId) {
          return this.getJournalBatch(existingId, data.company_id);
        }
      }
      throw error;
    }
  }

  private async findManualEntryIdByClientRef(
    companyId: number,
    clientRef: string
  ): Promise<number | null> {
    const rows = await this.db.query<{ id: number }>(
      `SELECT id
       FROM journal_batches
       WHERE company_id = ?
         AND doc_type = 'MANUAL'
         AND client_ref = ?
       LIMIT 1`,
      [companyId, clientRef]
    );

    return rows.length > 0 ? Number(rows[0].id) : null;
  }

  private async ensureEntryDateInOpenFiscalYear(companyId: number, entryDate: string): Promise<void> {
    const rows = await this.db.query<{ id: number }>(
      `SELECT id
       FROM fiscal_years
       WHERE company_id = ?
         AND status = 'OPEN'
         AND start_date <= ?
         AND end_date >= ?
       LIMIT 1`,
      [companyId, entryDate, entryDate]
    );

    if (rows.length === 0) {
      throw new JournalOutsideFiscalYearError(entryDate);
    }
  }

  /**
   * Get a journal batch by ID (Migrated to Kysely with JOIN)
   */
  async getJournalBatch(batchId: number, companyId: number): Promise<JournalBatchResponse> {
    // Use Kysely with JOIN to get batch and lines in one query (fixes N+1)
    const result = await this.db.kysely
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
      .filter(row => row.jl_id !== null && row.jl_id !== undefined)
      .map(row => ({
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
    let batchQuery = this.db.kysely
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
    const batchIds = batchesResult.map(b => b.id);
    
    const linesResult = await this.db.kysely
      .selectFrom('journal_lines')
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
    return batchesResult.map(batch => {
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
