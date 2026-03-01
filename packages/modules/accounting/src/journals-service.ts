// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  ManualJournalEntryCreateRequest,
  JournalBatchResponse,
  JournalListQuery,
  JournalLineResponse
} from "@jurnapod/shared";

/**
 * Database client interface for dependency injection
 */
export interface JournalsDbClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }>;
  begin?(): Promise<void>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
}

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
          company_id, outlet_id, doc_type, doc_id, posted_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())
      `;

      // For manual entries, we use a unique doc_id based on timestamp
      const docId = Date.now();
      
      const batchResult = await this.db.execute(batchSql, [
        data.company_id,
        data.outlet_id ?? null,
        "MANUAL",
        docId,
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
      throw error;
    }
  }

  /**
   * Get a journal batch by ID
   */
  async getJournalBatch(batchId: number, companyId: number): Promise<JournalBatchResponse> {
    const batchSql = `
      SELECT id, company_id, outlet_id, doc_type, doc_id, posted_at, created_at, updated_at
      FROM journal_batches
      WHERE id = ? AND company_id = ?
      LIMIT 1
    `;

    const batches = await this.db.query<any>(batchSql, [batchId, companyId]);
    
    if (batches.length === 0) {
      throw new JournalNotFoundError(batchId);
    }

    const batch = batches[0];

    // Get lines
    const linesSql = `
      SELECT 
        id, journal_batch_id, company_id, outlet_id, account_id,
        line_date, debit, credit, description, created_at, updated_at
      FROM journal_lines
      WHERE journal_batch_id = ?
      ORDER BY id ASC
    `;

    const lines = await this.db.query<any>(linesSql, [batchId]);

    return {
      id: batch.id,
      company_id: batch.company_id,
      outlet_id: batch.outlet_id,
      doc_type: batch.doc_type,
      doc_id: batch.doc_id,
      posted_at: batch.posted_at.toISOString(),
      created_at: batch.created_at.toISOString(),
      updated_at: batch.updated_at.toISOString(),
      lines: lines.map(line => ({
        id: line.id,
        journal_batch_id: line.journal_batch_id,
        company_id: line.company_id,
        outlet_id: line.outlet_id,
        account_id: line.account_id,
        line_date: line.line_date.toISOString().split('T')[0],
        debit: parseFloat(line.debit),
        credit: parseFloat(line.credit),
        description: line.description,
        created_at: line.created_at.toISOString(),
        updated_at: line.updated_at.toISOString()
      }))
    };
  }

  /**
   * List journal batches with optional filters
   */
  async listJournalBatches(filters: JournalListQuery): Promise<JournalBatchResponse[]> {
    let sql = `
      SELECT DISTINCT
        jb.id, jb.company_id, jb.outlet_id, jb.doc_type, jb.doc_id, 
        jb.posted_at, jb.created_at, jb.updated_at
      FROM journal_batches jb
    `;

    const params: any[] = [];
    const whereClauses: string[] = [];

    // Company filter (required)
    whereClauses.push("jb.company_id = ?");
    params.push(filters.company_id);

    // Optional filters
    if (filters.outlet_id !== undefined) {
      whereClauses.push("jb.outlet_id = ?");
      params.push(filters.outlet_id);
    }

    if (filters.doc_type) {
      whereClauses.push("jb.doc_type = ?");
      params.push(filters.doc_type);
    }

    if (filters.start_date) {
      whereClauses.push("jb.posted_at >= ?");
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      whereClauses.push("jb.posted_at <= ?");
      params.push(filters.end_date);
    }

    // Account filter (requires join with journal_lines)
    if (filters.account_id !== undefined) {
      sql += ` INNER JOIN journal_lines jl ON jl.journal_batch_id = jb.id`;
      whereClauses.push("jl.account_id = ?");
      params.push(filters.account_id);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    sql += ` ORDER BY jb.posted_at DESC, jb.id DESC`;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(filters.limit ?? 100);
    params.push(filters.offset ?? 0);

    const batches = await this.db.query<any>(sql, params);

    // Fetch lines for each batch
    const results: JournalBatchResponse[] = [];
    
    for (const batch of batches) {
      const batchWithLines = await this.getJournalBatch(batch.id, filters.company_id);
      results.push(batchWithLines);
    }

    return results;
  }
}
