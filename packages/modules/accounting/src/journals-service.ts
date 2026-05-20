// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  ManualJournalEntryCreateRequest,
  ManualJournalEntryUpdateRequest,
  JournalBatchResponse,
  JournalDraftResponse,
  JournalEntryLineResponse,
  JournalEntryResponse,
  JournalListQuery,
  JournalLineResponse
} from "@jurnapod/shared";
import { normalizeJournalDocType, toUtcIso, fromUtcIso } from "@jurnapod/shared";
import { sql } from "kysely";
import { withTransactionRetry, type KyselySchema } from "@jurnapod/db";

// =============================================================================
// Reusable production functions (used by both production services and fixtures)
// =============================================================================

/**
 * Options for inserting a journal batch row.
 * Used by both JournalsService.executeManualEntryInsert() and test fixtures.
 */
export interface InsertJournalBatchOpts {
  companyId: number;
  outletId?: number | null;
  docType: string;
  docId: number;
  postedAt: string;    // YYYY-MM-DD entry date
  clientRef?: string | null;
}

/**
 * Insert a journal batch row into the journal_batches table.
 *
 * Used by: JournalsService, createTestFiscalCloseBalanceFixture
 *
 * @returns The newly inserted batch ID
 */
export async function insertJournalBatch(
  db: KyselySchema,
  opts: InsertJournalBatchOpts,
): Promise<number> {
  const result = await sql`
    INSERT INTO journal_batches (
      company_id, outlet_id, doc_type, doc_id, posted_at, client_ref, created_at, updated_at
    )
    VALUES (
      ${opts.companyId},
      ${opts.outletId ?? null},
      ${opts.docType},
      ${opts.docId},
      ${opts.postedAt},
      ${opts.clientRef ?? null},
      NOW(),
      NOW()
    )
  `.execute(db);

  return Number(result.insertId);
}

/**
 * A single journal line to be inserted.
 */
export interface JournalLineInput {
  companyId: number;
  outletId?: number | null;
  accountId: number;
  lineDate: string;    // YYYY-MM-DD
  debit: string;        // DECIMAL
  credit: string;       // DECIMAL
  description: string;
}

/**
 * Insert journal line rows into the journal_lines table.
 *
 * Used by: JournalsService, createTestFiscalCloseBalanceFixture
 *
 * @param batchId - The parent journal_batch ID
 * @param lines - Array of journal line inputs
 */
export async function insertJournalLines(
  db: KyselySchema,
  batchId: number,
  lines: JournalLineInput[],
): Promise<void> {
  for (const line of lines) {
    await sql`
      INSERT INTO journal_lines (
        journal_batch_id, company_id, outlet_id, account_id,
        line_date, debit, credit, description, created_at, updated_at
      )
      VALUES (
        ${batchId},
        ${line.companyId},
        ${line.outletId ?? null},
        ${line.accountId},
        ${line.lineDate},
        ${line.debit},
        ${line.credit},
        ${line.description},
        NOW(),
        NOW()
      )
    `.execute(db);
  }
}

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

export class JournalDraftNotFoundError extends Error {
  code = "JOURNAL_DRAFT_NOT_FOUND";
  constructor(journalId: number) {
    super(`Journal draft ${journalId} not found`);
    this.name = "JournalDraftNotFoundError";
  }
}

export class JournalAlreadyPostedError extends Error {
  code = "JOURNAL_ALREADY_POSTED";
  constructor(journalId: number) {
    super(`Journal ${journalId} is already posted and cannot be edited`);
    this.name = "JournalAlreadyPostedError";
  }
}

export class JournalDuplicateClientRefError extends Error {
  code = "JOURNAL_DUPLICATE_CLIENT_REF";
  constructor(clientRef: string) {
    super(`Journal draft client_ref ${clientRef} is already in use`);
    this.name = "JournalDuplicateClientRefError";
  }
}

export class InvalidJournalOutletError extends Error {
  code = "INVALID_JOURNAL_OUTLET";
  constructor(outletId: number) {
    super(`Outlet ${outletId} does not belong to the journal company`);
    this.name = "InvalidJournalOutletError";
  }
}

export class InvalidJournalAccountError extends Error {
  code = "INVALID_JOURNAL_ACCOUNT";
  constructor(accountId: number) {
    super(`Account ${accountId} does not belong to the journal company`);
    this.name = "InvalidJournalAccountError";
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

  async createJournalDraft(
    data: ManualJournalEntryCreateRequest,
    userId?: number,
  ): Promise<JournalDraftResponse> {
    await this.validateDraftReferences(data);
    this.validateBalancedLines(data.lines);

    if (data.client_ref) {
      const existingDraft = await this.findDraftByClientRef(data.company_id, data.client_ref);
      if (existingDraft?.status === "DRAFT") {
        return this.getJournalDraft(Number(existingDraft.id), data.company_id);
      }
      if (existingDraft?.status === "POSTED") {
        throw new JournalAlreadyPostedError(Number(existingDraft.id));
      }
    }

    const draftId = await withTransactionRetry(this.db, async (innerTrx) => {
      const trx = innerTrx as unknown as KyselySchema;
      let insertResult;
      try {
        insertResult = await sql`
          INSERT INTO journal_drafts (
            company_id, outlet_id, entry_date, reference, description, client_ref,
            status, created_by_user_id, created_at, updated_at
          )
          VALUES (
            ${data.company_id},
            ${data.outlet_id ?? null},
            ${data.entry_date},
            ${data.reference ?? null},
            ${data.description},
            ${data.client_ref ?? null},
            'DRAFT',
            ${userId ?? null},
            NOW(),
            NOW()
          )
        `.execute(trx);
      } catch (error) {
        if (data.client_ref && isMysqlDuplicateError(error)) {
          const existingDraft = await this.findDraftByClientRef(data.company_id, data.client_ref, trx);
          if (existingDraft?.status === "DRAFT") return Number(existingDraft.id);
          if (existingDraft?.status === "POSTED") throw new JournalAlreadyPostedError(Number(existingDraft.id));
          throw new JournalDuplicateClientRefError(data.client_ref);
        }
        throw error;
      }

      const newDraftId = Number(insertResult.insertId);
      await this.insertDraftLines(trx, newDraftId, data);
      return newDraftId;
    });

    return this.getJournalDraft(draftId, data.company_id);
  }

  async validateJournalDraftReferences(data: ManualJournalEntryCreateRequest): Promise<void> {
    await this.validateDraftReferences(data);
  }

  async updateJournalDraft(
    draftId: number,
    companyId: number,
    data: ManualJournalEntryUpdateRequest,
  ): Promise<JournalDraftResponse> {
    if (data.company_id !== undefined && data.company_id !== companyId) {
      throw new InvalidJournalLineError("Company ID mismatch");
    }

    const normalized: ManualJournalEntryCreateRequest = {
      company_id: companyId,
      outlet_id: data.outlet_id ?? null,
      client_ref: data.client_ref,
      entry_date: data.entry_date,
      reference: data.reference,
      description: data.description,
      lines: data.lines,
    };

    await this.validateDraftReferences(normalized);
    this.validateBalancedLines(normalized.lines);

    if (normalized.client_ref) {
      const existingDraft = await this.findDraftByClientRef(companyId, normalized.client_ref);
      if (existingDraft && Number(existingDraft.id) !== draftId) {
        throw new JournalDuplicateClientRefError(normalized.client_ref);
      }
    }

    await withTransactionRetry(this.db, async (innerTrx) => {
      const trx = innerTrx as unknown as KyselySchema;
      const draft = await this.findDraftForUpdate(trx, draftId, companyId);
      if (!draft) {
        const postedExists = await this.postedBatchExists(draftId, companyId);
        if (postedExists) {
          throw new JournalAlreadyPostedError(draftId);
        }
        throw new JournalDraftNotFoundError(draftId);
      }
      if (draft.status === "POSTED") {
        throw new JournalAlreadyPostedError(draftId);
      }

      try {
        await sql`
          UPDATE journal_drafts
          SET outlet_id = ${normalized.outlet_id ?? null},
              entry_date = ${normalized.entry_date},
              reference = ${normalized.reference ?? null},
              description = ${normalized.description},
              client_ref = ${normalized.client_ref ?? null},
              updated_at = NOW()
          WHERE id = ${draftId}
            AND company_id = ${companyId}
            AND status = 'DRAFT'
        `.execute(trx);
      } catch (error) {
        if (normalized.client_ref && isMysqlDuplicateError(error)) {
          throw new JournalDuplicateClientRefError(normalized.client_ref);
        }
        throw error;
      }

      await sql`
        DELETE FROM journal_draft_lines
        WHERE journal_draft_id = ${draftId}
          AND company_id = ${companyId}
      `.execute(trx);

      await this.insertDraftLines(trx, draftId, normalized);
    });

    return this.getJournalDraft(draftId, companyId);
  }

  async postJournalDraft(
    draftId: number,
    companyId: number,
    userId?: number,
  ): Promise<JournalEntryResponse> {
    const postedBatchId = await withTransactionRetry(this.db, async (innerTrx) => {
      const trx = innerTrx as unknown as KyselySchema;
      const draft = await this.findDraftForUpdate(trx, draftId, companyId);
      if (!draft) {
        throw new JournalDraftNotFoundError(draftId);
      }
      if (draft.status === "POSTED" && draft.posted_batch_id) {
        return Number(draft.posted_batch_id);
      }
      if (draft.status === "POSTED") {
        throw new JournalAlreadyPostedError(draftId);
      }

      const draftResponse = await this.getJournalDraft(draftId, companyId, trx);
      const createRequest: ManualJournalEntryCreateRequest = {
        company_id: draftResponse.company_id,
        outlet_id: draftResponse.outlet_id,
        entry_date: draftResponse.entry_date,
        reference: draftResponse.reference ?? undefined,
        description: draftResponse.description,
        client_ref: draftResponse.client_ref ?? undefined,
        lines: draftResponse.lines.map((line) => ({
          account_id: line.account_id,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
        })),
      };

      const posted = await this.createManualEntry(createRequest, userId, trx, {
        docType: "MANUAL",
        docId: draftId,
      });

      await sql`
        UPDATE journal_drafts
        SET status = 'POSTED',
            posted_batch_id = ${posted.id},
            posted_by_user_id = ${userId ?? null},
            posted_at = NOW(),
            updated_at = NOW()
        WHERE id = ${draftId}
          AND company_id = ${companyId}
          AND status = 'DRAFT'
      `.execute(trx);

      return posted.id;
    });

    return this.getPostedJournalEntry(postedBatchId, companyId);
  }

  /**
   * Create a manual journal entry
   * 
   * @param data The journal entry data
   * @param userId Optional user ID for audit logging
   * @param trx Optional external transaction (if provided, uses this transaction instead of creating a new one)
   * @param opts Optional overrides for doc_type and doc_id (default: 'MANUAL' / next company doc sequence)
   */
  async createManualEntry(
    data: ManualJournalEntryCreateRequest,
    userId?: number,
    trx?: KyselySchema,
    opts?: { docType?: string; docId?: number }
  ): Promise<JournalBatchResponse> {
    await this.validateDraftReferences(data, trx ?? this.db);

    if (data.client_ref) {
      const existingId = await this.findManualEntryIdByClientRef(
        data.company_id,
        data.client_ref,
        trx ?? this.db,
      );
      if (existingId) {
        return this.getJournalBatch(existingId, data.company_id, trx ?? this.db);
      }
    }

    await this.ensureEntryDateInOpenFiscalYear(data.company_id, data.entry_date, trx ?? this.db);

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

    const docType = opts?.docType ?? 'MANUAL';
    const docId = opts?.docId ?? await this.allocateNextManualDocId(data.company_id, docType, trx ?? this.db);

    let batchId: number;
    try {
      batchId = await (trx
        ? this.executeManualEntryInsert(trx, data, docId, docType, totalDebit, totalCredit, userId)
        : withTransactionRetry(this.db, async (innerTrx) =>
            this.executeManualEntryInsert(innerTrx as unknown as KyselySchema, data, docId, docType, totalDebit, totalCredit, userId)
          )
      );
    } catch (error) {
      if (data.client_ref && isMysqlDuplicateError(error)) {
        const existingId = await this.findManualEntryIdByClientRef(
          data.company_id,
          data.client_ref,
          trx ?? this.db,
        );
        if (existingId) {
          return this.getJournalBatch(existingId, data.company_id, trx ?? this.db);
        }
      }
      throw error;
    }

    // Return the created batch with lines. When an outer transaction is supplied,
    // read through that same transaction so the uncommitted insert is visible.
    return this.getJournalBatch(batchId, data.company_id, trx ?? this.db);
  }

  /**
   * Execute the manual entry insert operation
   * @internal
   */
  private async executeManualEntryInsert(
    trx: KyselySchema,
    data: ManualJournalEntryCreateRequest,
    docId: number,
    docType: string,
    totalDebit: number,
    totalCredit: number,
    userId?: number
  ): Promise<number> {
    // Use canonical insertJournalBatch() — shared with test fixtures
    const newBatchId = await insertJournalBatch(trx, {
      companyId: data.company_id,
      outletId: data.outlet_id ?? null,
      docType,
      docId,
      postedAt: data.entry_date,
      clientRef: data.client_ref ?? null,
    });

    // Use canonical insertJournalLines() — shared with test fixtures
    await insertJournalLines(trx, newBatchId, data.lines.map((line) => ({
      companyId: data.company_id,
      outletId: data.outlet_id ?? null,
      accountId: line.account_id,
      lineDate: data.entry_date,
      debit: String(line.debit),
      credit: String(line.credit),
      description: line.description,
    })));

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
    clientRef: string,
    db: KyselySchema = this.db,
  ): Promise<number | null> {
    const result = await sql<{ id: number }>`
      SELECT id
      FROM journal_batches
      WHERE company_id = ${companyId}
        AND doc_type = 'MANUAL'
        AND client_ref = ${clientRef}
      LIMIT 1
    `.execute(db);

    return result.rows.length > 0 ? Number(result.rows[0].id) : null;
  }

  private async allocateNextManualDocId(companyId: number, docType: string, db: KyselySchema = this.db): Promise<number> {
    const result = await sql<{ next_doc_id: string | number }>`
      SELECT COALESCE(MAX(doc_id), 0) + 1 AS next_doc_id
      FROM journal_batches
      WHERE company_id = ${companyId}
        AND doc_type = ${docType}
    `.execute(db);

    return Number(result.rows[0]?.next_doc_id ?? 1);
  }

  private async ensureEntryDateInOpenFiscalYear(
    companyId: number,
    entryDate: string,
    db: KyselySchema = this.db,
  ): Promise<void> {
    // First check if there's an OPEN fiscal year containing this date
    const openResult = await sql<{ id: number }>`
      SELECT id
      FROM fiscal_years
      WHERE company_id = ${companyId}
        AND status = 'OPEN'
        AND start_date <= ${entryDate}
        AND end_date >= ${entryDate}
      LIMIT 1
    `.execute(db);

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
    `.execute(db);

    if (closedResult.rows.length > 0) {
      throw new FiscalYearClosedError(Number(closedResult.rows[0].id));
    }

    // No fiscal year found for this date at all
    throw new JournalOutsideFiscalYearError(entryDate);
  }

  /**
   * Get a journal batch by ID (Migrated to Kysely with JOIN)
   */
  async getJournalBatch(
    batchId: number,
    companyId: number,
    db: KyselySchema = this.db,
  ): Promise<JournalBatchResponse> {
    // Use Kysely with JOIN to get batch and lines in one query (fixes N+1)
    const result = await db
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
    const reference = await this.resolvePostedJournalReference(
      Number(batch.company_id),
      Number(batch.id),
      String(batch.doc_type),
      batch.client_ref ?? null,
      db,
    );

    // Transform lines from flat result
    const lines = result
      .filter((row: typeof firstRow) => row.jl_id !== null && row.jl_id !== undefined)
      .map((row: typeof firstRow) => ({
        id: row.jl_id as number,
        journal_batch_id: row.journal_batch_id as number,
        company_id: row.jl_company_id as number,
        outlet_id: row.jl_outlet_id as number | null,
        account_id: row.account_id as number,
        line_date: fromUtcIso.dateOnly(toUtcIso.dateLike(row.line_date) as string),
        debit: Number(row.debit),
        credit: Number(row.credit),
        description: row.jl_description as string,
        created_at: toUtcIso.dateLike(row.jl_created_at as Date) as string,
        updated_at: toUtcIso.dateLike(row.jl_updated_at as Date) as string
      }));

    return this.withPostedSummary({
      id: batch.id,
      company_id: batch.company_id,
      outlet_id: batch.outlet_id,
      status: "POSTED",
      reference,
      doc_type: batch.doc_type,
      doc_id: batch.doc_id,
      client_ref: batch.client_ref ?? null,
      posted_at: toUtcIso.dateLike(batch.posted_at) as string,
      created_at: toUtcIso.dateLike(batch.created_at) as string,
      updated_at: toUtcIso.dateLike(batch.updated_at) as string,
      lines
    });
  }

  async getJournalEntry(journalId: number, companyId: number): Promise<JournalEntryResponse> {
    const draft = await this.findDraft(journalId, companyId);
    if (draft?.status === "DRAFT") {
      return this.getJournalDraft(journalId, companyId);
    }
    if (draft?.status === "POSTED" && draft.posted_batch_id) {
      return this.getPostedJournalEntry(Number(draft.posted_batch_id), companyId, draft.reference ?? null);
    }
    return this.getPostedJournalEntry(journalId, companyId);
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

    const normalizedDocType = normalizeJournalDocType(filters.doc_type);
    if (normalizedDocType) {
      batchQuery = batchQuery.where('jb.doc_type', '=', normalizedDocType);
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

    const draftReferenceById = await this.getDraftReferencesForPostedManualBatches(
      filters.company_id,
      batchesResult.map((batch: typeof batchesResult[0]) => ({
        batchId: Number(batch.id),
        docType: String(batch.doc_type),
      })),
    );

    // Step 4: Transform to response format
    return batchesResult.map((batch: typeof batchesResult[0]) => {
      const batchLines = linesByBatchId.get(batch.id) || [];
      const batchId = Number(batch.id);
      const reference = String(batch.doc_type) === "MANUAL" && draftReferenceById.has(batchId)
        ? draftReferenceById.get(batchId) ?? null
        : batch.client_ref ?? null;
      
      return this.withPostedSummary({
        id: batch.id,
        company_id: batch.company_id,
        outlet_id: batch.outlet_id,
        status: "POSTED",
        reference,
        doc_type: batch.doc_type,
        doc_id: batch.doc_id,
        client_ref: batch.client_ref ?? null,
        posted_at: toUtcIso.dateLike(batch.posted_at) as string,
        created_at: toUtcIso.dateLike(batch.created_at) as string,
        updated_at: toUtcIso.dateLike(batch.updated_at) as string,
        lines: batchLines.map(line => ({
          id: line.id,
          journal_batch_id: line.journal_batch_id,
          company_id: line.company_id,
          outlet_id: line.outlet_id,
          account_id: line.account_id,
          line_date: fromUtcIso.dateOnly(toUtcIso.dateLike(line.line_date) as string),
          debit: Number(line.debit),
          credit: Number(line.credit),
          description: line.description,
          created_at: toUtcIso.dateLike(line.created_at) as string,
          updated_at: toUtcIso.dateLike(line.updated_at) as string
        }))
      });
    });
  }

  async listJournalEntries(filters: JournalListQuery): Promise<JournalEntryResponse[]> {
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;
    const sourceLimit = limit + offset;
    const sourceFilters = { ...filters, limit: sourceLimit, offset: 0 };
    const [posted, drafts] = await Promise.all([
      this.listJournalBatches(sourceFilters),
      this.listJournalDrafts(sourceFilters),
    ]);
    const postedEntries = posted.map((batch) => this.toPostedJournalEntry(batch));

    return [...drafts, ...postedEntries]
      .sort((left, right) => {
        const leftDate = getJournalSortDate(left);
        const rightDate = getJournalSortDate(right);
        const dateOrder = String(rightDate).localeCompare(String(leftDate));
        if (dateOrder !== 0) return dateOrder;
        return right.id - left.id;
      })
      .slice(offset, offset + limit);
  }

  private async getPostedJournalEntry(
    batchId: number,
    companyId: number,
    referenceOverride?: string | null,
  ): Promise<JournalEntryResponse> {
    const batch = await this.getJournalBatch(batchId, companyId);
    return this.toPostedJournalEntry(batch, referenceOverride);
  }

  private toPostedJournalEntry(
    batch: JournalBatchResponse,
    referenceOverride?: string | null,
  ): JournalEntryResponse {
    return {
      ...batch,
      status: "POSTED",
      reference: referenceOverride !== undefined ? referenceOverride : batch.reference ?? null,
      total_debits: batch.total_debits ?? 0,
      total_credits: batch.total_credits ?? 0,
      lines: batch.lines.map((line) => ({
        ...line,
        journal_id: batch.id,
        journal_batch_id: line.journal_batch_id,
        journal_draft_id: null,
      })),
    };
  }

  private async getJournalDraft(
    draftId: number,
    companyId: number,
    db: KyselySchema = this.db,
  ): Promise<JournalDraftResponse> {
    const result = await sql<JournalDraftFlatRow>`
      SELECT
        jd.id,
        jd.company_id,
        jd.outlet_id,
        jd.entry_date,
        jd.reference,
        jd.description,
        jd.client_ref,
        jd.status,
        jd.posted_at,
        jd.created_at,
        jd.updated_at,
        jdl.id AS line_id,
        jdl.account_id,
        jdl.line_date,
        jdl.debit,
        jdl.credit,
        jdl.description AS line_description,
        jdl.created_at AS line_created_at,
        jdl.updated_at AS line_updated_at
      FROM journal_drafts jd
      LEFT JOIN journal_draft_lines jdl ON jdl.journal_draft_id = jd.id
      WHERE jd.id = ${draftId}
        AND jd.company_id = ${companyId}
      ORDER BY jdl.line_no ASC, jdl.id ASC
    `.execute(db);

    if (result.rows.length === 0) {
      throw new JournalDraftNotFoundError(draftId);
    }

    const first = result.rows[0];
    if (first.status !== "DRAFT") {
      throw new JournalAlreadyPostedError(draftId);
    }

    const lines: JournalEntryLineResponse[] = result.rows
      .filter((row) => row.line_id !== null && row.line_id !== undefined)
      .map((row) => ({
        id: Number(row.line_id),
        journal_id: Number(first.id),
        journal_batch_id: null,
        journal_draft_id: Number(first.id),
        company_id: Number(first.company_id),
        outlet_id: row.outlet_id === null ? null : Number(row.outlet_id),
        account_id: Number(row.account_id),
        line_date: fromUtcIso.dateOnly(toUtcIso.dateLike(row.line_date) as string),
        debit: Number(row.debit),
        credit: Number(row.credit),
        description: String(row.line_description),
        created_at: toUtcIso.dateLike(row.line_created_at) as string,
        updated_at: toUtcIso.dateLike(row.line_updated_at) as string,
      }));
    const totals = calculateLineTotals(lines);

    return {
      id: Number(first.id),
      company_id: Number(first.company_id),
      outlet_id: first.outlet_id === null ? null : Number(first.outlet_id),
      status: "DRAFT",
      reference: first.reference ?? null,
      description: first.description,
      entry_date: fromUtcIso.dateOnly(toUtcIso.dateLike(first.entry_date) as string),
      doc_type: "MANUAL",
      doc_id: Number(first.id),
      client_ref: first.client_ref ?? null,
      posted_at: first.posted_at ? toUtcIso.dateLike(first.posted_at) as string : null,
      created_at: toUtcIso.dateLike(first.created_at) as string,
      updated_at: toUtcIso.dateLike(first.updated_at) as string,
      total_debits: totals.totalDebits,
      total_credits: totals.totalCredits,
      lines,
    };
  }

  private async resolvePostedJournalReference(
    companyId: number,
    batchId: number,
    docType: string,
    fallbackReference: string | null,
    db: KyselySchema = this.db,
  ): Promise<string | null> {
    if (docType !== "MANUAL") {
      return fallbackReference;
    }

    const draft = await db
      .selectFrom("journal_drafts")
      .select("reference")
      .where("company_id", "=", companyId)
      .where("posted_batch_id", "=", batchId)
      .executeTakeFirst();

    return draft !== undefined ? draft.reference ?? null : fallbackReference;
  }

  private async getDraftReferencesForPostedManualBatches(
    companyId: number,
    batches: Array<{ batchId: number; docType: string }>,
  ): Promise<Map<number, string | null>> {
    const batchIds = [
      ...new Set(
        batches
          .filter((batch) => batch.docType === "MANUAL")
          .map((batch) => batch.batchId),
      ),
    ];
    if (batchIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .selectFrom("journal_drafts")
      .select(["posted_batch_id", "reference"])
      .where("company_id", "=", companyId)
      .where("posted_batch_id", "in", batchIds)
      .execute();

    return new Map(rows.map((row) => [Number(row.posted_batch_id), row.reference ?? null]));
  }

  private async listJournalDrafts(filters: JournalListQuery): Promise<JournalDraftResponse[]> {
    const normalizedDocType = normalizeJournalDocType(filters.doc_type);
    if (normalizedDocType !== undefined && normalizedDocType !== "MANUAL") {
      return [];
    }

    const result = await sql<{ id: number }>`
      SELECT DISTINCT jd.id
      FROM journal_drafts jd
      LEFT JOIN journal_draft_lines jdl ON jdl.journal_draft_id = jd.id
      WHERE jd.company_id = ${filters.company_id}
        AND jd.status = 'DRAFT'
        AND (${filters.outlet_id === undefined} OR jd.outlet_id = ${filters.outlet_id ?? 0})
        AND (${filters.start_date === undefined} OR jd.entry_date >= ${filters.start_date ?? "1000-01-01"})
        AND (${filters.end_date === undefined} OR jd.entry_date <= ${filters.end_date ?? "9999-12-31"})
        AND (${filters.account_id === undefined} OR jdl.account_id = ${filters.account_id ?? 0})
      ORDER BY jd.entry_date DESC, jd.id DESC
      LIMIT ${filters.limit ?? 100}
      OFFSET ${filters.offset ?? 0}
    `.execute(this.db);

    return Promise.all(result.rows.map((row) => this.getJournalDraft(Number(row.id), filters.company_id)));
  }

  private async insertDraftLines(
    db: KyselySchema,
    draftId: number,
    data: ManualJournalEntryCreateRequest,
  ): Promise<void> {
    let lineNo = 1;
    for (const line of data.lines) {
      await sql`
        INSERT INTO journal_draft_lines (
          journal_draft_id, company_id, outlet_id, account_id, line_date,
          debit, credit, description, line_no, created_at, updated_at
        )
        VALUES (
          ${draftId},
          ${data.company_id},
          ${data.outlet_id ?? null},
          ${line.account_id},
          ${data.entry_date},
          ${String(line.debit)},
          ${String(line.credit)},
          ${line.description},
          ${lineNo},
          NOW(),
          NOW()
        )
      `.execute(db);
      lineNo += 1;
    }
  }

  private async validateDraftReferences(
    data: ManualJournalEntryCreateRequest,
    db: KyselySchema = this.db,
  ): Promise<void> {
    if (data.outlet_id !== undefined && data.outlet_id !== null) {
      const outlet = await db
        .selectFrom("outlets")
        .select("id")
        .where("id", "=", data.outlet_id)
        .where("company_id", "=", data.company_id)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (!outlet) {
        throw new InvalidJournalOutletError(data.outlet_id);
      }
    }

    const uniqueAccountIds = [...new Set(data.lines.map((line) => line.account_id))];
    if (uniqueAccountIds.length === 0) {
      throw new InvalidJournalLineError("Journal entry must include at least one account line");
    }
    const accounts = await db
      .selectFrom("accounts")
      .select("id")
      .where("company_id", "=", data.company_id)
      .where("id", "in", uniqueAccountIds)
      .execute();
    const foundAccountIds = new Set(accounts.map((account) => Number(account.id)));
    const missingAccountId = uniqueAccountIds.find((accountId) => !foundAccountIds.has(accountId));
    if (missingAccountId !== undefined) {
      throw new InvalidJournalAccountError(missingAccountId);
    }
  }

  private validateBalancedLines(lines: ManualJournalEntryCreateRequest["lines"]): void {
    const totals = calculateLineTotals(lines);
    if (Math.abs(totals.totalDebits - totals.totalCredits) >= 0.01) {
      throw new JournalNotBalancedError(totals.totalDebits, totals.totalCredits);
    }
    for (const line of lines) {
      if (line.debit > 0 && line.credit > 0) {
        throw new InvalidJournalLineError("Line cannot have both debit and credit");
      }
      if (line.debit === 0 && line.credit === 0) {
        throw new InvalidJournalLineError("Line must have either debit or credit");
      }
    }
  }

  private async findDraft(draftId: number, companyId: number): Promise<JournalDraftHeaderRow | null> {
    const result = await sql<JournalDraftHeaderRow>`
      SELECT id, company_id, outlet_id, entry_date, reference, description, client_ref,
             status, posted_batch_id, posted_at, created_at, updated_at
      FROM journal_drafts
      WHERE id = ${draftId}
        AND company_id = ${companyId}
      LIMIT 1
    `.execute(this.db);
    return result.rows[0] ?? null;
  }

  private async findDraftByClientRef(
    companyId: number,
    clientRef: string,
    db: KyselySchema = this.db,
  ): Promise<JournalDraftHeaderRow | null> {
    const result = await sql<JournalDraftHeaderRow>`
      SELECT id, company_id, outlet_id, entry_date, reference, description, client_ref,
             status, posted_batch_id, posted_at, created_at, updated_at
      FROM journal_drafts
      WHERE company_id = ${companyId}
        AND client_ref = ${clientRef}
      LIMIT 1
    `.execute(db);
    return result.rows[0] ?? null;
  }

  private async findDraftForUpdate(
    db: KyselySchema,
    draftId: number,
    companyId: number,
  ): Promise<JournalDraftHeaderRow | null> {
    const result = await sql<JournalDraftHeaderRow>`
      SELECT id, company_id, outlet_id, entry_date, reference, description, client_ref,
             status, posted_batch_id, posted_at, created_at, updated_at
      FROM journal_drafts
      WHERE id = ${draftId}
        AND company_id = ${companyId}
      LIMIT 1
      FOR UPDATE
    `.execute(db);
    return result.rows[0] ?? null;
  }

  private async postedBatchExists(batchId: number, companyId: number): Promise<boolean> {
    const row = await this.db
      .selectFrom("journal_batches")
      .select("id")
      .where("id", "=", batchId)
      .where("company_id", "=", companyId)
      .executeTakeFirst();
    return row !== undefined;
  }

  private withPostedSummary(batch: JournalBatchResponse): JournalBatchResponse {
    const totals = calculateLineTotals(batch.lines);
    return {
      ...batch,
      status: "POSTED",
      reference: batch.reference ?? null,
      total_debits: totals.totalDebits,
      total_credits: totals.totalCredits,
    };
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

type MoneyLine = Pick<ManualJournalEntryCreateRequest["lines"][number], "debit" | "credit">;

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function calculateLineTotals(lines: readonly MoneyLine[]): { totalDebits: number; totalCredits: number } {
  return {
    totalDebits: roundMoney(lines.reduce((sum, line) => sum + Number(line.debit), 0)),
    totalCredits: roundMoney(lines.reduce((sum, line) => sum + Number(line.credit), 0)),
  };
}

function getJournalSortDate(entry: JournalEntryResponse): string {
  return entry.status === "DRAFT" ? entry.entry_date : entry.posted_at;
}

type JournalDraftHeaderRow = {
  id: number;
  company_id: number;
  outlet_id: number | null;
  entry_date: Date | string;
  reference: string | null;
  description: string;
  client_ref: string | null;
  status: "DRAFT" | "POSTED";
  posted_batch_id: number | null;
  posted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type JournalDraftFlatRow = JournalDraftHeaderRow & {
  line_id: number | null;
  account_id: number | null;
  line_date: Date | string | null;
  debit: string | number | null;
  credit: string | number | null;
  line_description: string | null;
  line_created_at: Date | string | null;
  line_updated_at: Date | string | null;
};

const mysqlDuplicateErrorCode = 1062;

function isMysqlDuplicateError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "errno" in error &&
    (error as { errno?: number }).errno === mysqlDuplicateErrorCode
  );
}
