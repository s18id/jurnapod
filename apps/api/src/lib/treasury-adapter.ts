// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Treasury API Adapter
 *
 * Implements treasury ports using API infrastructure:
 * - KyselyCashBankRepository: Database access via Kysely
 * - ApiAccessScopeChecker: Access control via existing auth helpers
 * - ApiFiscalYearGuard: Fiscal year validation via existing fiscal-year helpers
 * - KyselyPostingRepository: Journal posting via Kysely
 *
 * This adapter bridges the domain logic in @jurnapod/modules-treasury
 * with the API infrastructure.
 */

import type { KyselySchema } from "./db.js";
import type {
  CashBankRepository,
  AccessScopeChecker,
  FiscalYearGuard,
  AccountInfo
} from "@jurnapod/modules-treasury";
import type {
  CashBankTransaction,
  CashBankStatus,
  CreateCashBankInput,
  CashBankListFilters
} from "@jurnapod/modules-treasury";
import type { TreasuryPostingRepository } from "@jurnapod/modules-treasury";
import type { PostingRepository, PostingMapper } from "@jurnapod/modules-accounting";
import type { JournalLine, PostingRequest } from "@jurnapod/shared";
import { getDb } from "./db.js";
import { userHasOutletAccess } from "./auth.js";
import { ensureDateWithinOpenFiscalYearWithExecutor } from "./fiscal-years.js";
import { normalizeMoney } from "@jurnapod/modules-treasury";
import { CashBankService } from "@jurnapod/modules-treasury";
import { PostingService } from "@jurnapod/modules-accounting";
import { sql } from "kysely";

// Internal row type for DB mapping
type CashBankRow = {
  id: number;
  company_id: number;
  outlet_id: number | null;
  transaction_type: "MUTATION" | "TOP_UP" | "WITHDRAWAL" | "FOREX";
  transaction_date: string | Date;
  reference: string | null;
  description: string;
  source_account_id: number;
  source_account_name?: string;
  destination_account_id: number;
  destination_account_name?: string;
  amount: string | number;
  currency_code: string;
  exchange_rate: string | number | null;
  base_amount: string | number | null;
  fx_gain_loss: string | number | null;
  fx_account_id: number | null;
  fx_account_name?: string | null;
  status: "DRAFT" | "POSTED" | "VOID";
  posted_at: string | Date | null;
  created_by_user_id: number | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function toIsoDateOnly(value: string | Date): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function toIsoDateTime(value: string | Date): string {
  if (typeof value === "string") {
    return new Date(value).toISOString();
  }
  return value.toISOString();
}

function toCashBankTransaction(row: CashBankRow): CashBankTransaction {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: row.outlet_id === null ? null : Number(row.outlet_id),
    transaction_type: row.transaction_type,
    transaction_date: toIsoDateOnly(row.transaction_date),
    reference: row.reference,
    description: row.description,
    source_account_id: Number(row.source_account_id),
    source_account_name: row.source_account_name,
    destination_account_id: Number(row.destination_account_id),
    destination_account_name: row.destination_account_name,
    amount: Number(row.amount),
    currency_code: row.currency_code,
    exchange_rate: row.exchange_rate === null ? null : Number(row.exchange_rate),
    base_amount: row.base_amount === null ? null : Number(row.base_amount),
    fx_gain_loss: row.fx_gain_loss === null ? null : Number(row.fx_gain_loss),
    fx_account_id: row.fx_account_id === null ? null : Number(row.fx_account_id),
    fx_account_name: row.fx_account_name ?? null,
    status: row.status,
    posted_at: row.posted_at ? toIsoDateTime(row.posted_at) : null,
    created_by_user_id: row.created_by_user_id === null ? null : Number(row.created_by_user_id),
    created_at: toIsoDateTime(row.created_at),
    updated_at: toIsoDateTime(row.updated_at)
  };
}

/**
 * Kysely-based implementation of CashBankRepository and PostingRepository.
 */
export class KyselyCashBankRepository implements CashBankRepository, PostingRepository {
  private _executor: KyselySchema | null = null;

  constructor(private readonly db: KyselySchema) {}

  private get _activeExecutor(): KyselySchema {
    return this._executor ?? this.db;
  }

  async findById(id: number, companyId: number): Promise<CashBankTransaction | null> {
    const row = await sql<CashBankRow>`
      SELECT cbt.*,
             sa.name AS source_account_name,
             da.name AS destination_account_name,
             fxa.name AS fx_account_name
      FROM cash_bank_transactions cbt
      LEFT JOIN accounts sa ON sa.company_id = cbt.company_id AND sa.id = cbt.source_account_id
      LEFT JOIN accounts da ON da.company_id = cbt.company_id AND da.id = cbt.destination_account_id
      LEFT JOIN accounts fxa ON fxa.company_id = cbt.company_id AND fxa.id = cbt.fx_account_id
      WHERE cbt.id = ${id} AND cbt.company_id = ${companyId}
      LIMIT 1
    `.execute(this._activeExecutor);

    if (row.rows.length === 0) {
      return null;
    }
    return toCashBankTransaction(row.rows[0]);
  }

  async findByIdForUpdate(id: number, companyId: number): Promise<CashBankTransaction | null> {
    const row = await sql<CashBankRow>`
      SELECT cbt.*,
             sa.name AS source_account_name,
             da.name AS destination_account_name,
             fxa.name AS fx_account_name
      FROM cash_bank_transactions cbt
      LEFT JOIN accounts sa ON sa.company_id = cbt.company_id AND sa.id = cbt.source_account_id
      LEFT JOIN accounts da ON da.company_id = cbt.company_id AND da.id = cbt.destination_account_id
      LEFT JOIN accounts fxa ON fxa.company_id = cbt.company_id AND fxa.id = cbt.fx_account_id
      WHERE cbt.id = ${id} AND cbt.company_id = ${companyId}
      LIMIT 1
      FOR UPDATE
    `.execute(this._activeExecutor);

    if (row.rows.length === 0) {
      return null;
    }
    return toCashBankTransaction(row.rows[0]);
  }

  async list(companyId: number, filters: CashBankListFilters): Promise<{ total: number; transactions: CashBankTransaction[] }> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const countResult = await sql<{ total: number }>`
      SELECT COUNT(*) AS total
      FROM cash_bank_transactions cbt
      WHERE cbt.company_id = ${companyId}
        ${filters.outletId !== undefined ? sql`AND cbt.outlet_id = ${filters.outletId}` : sql``}
        ${filters.transactionType ? sql`AND cbt.transaction_type = ${filters.transactionType}` : sql``}
        ${filters.status ? sql`AND cbt.status = ${filters.status}` : sql``}
        ${filters.dateFrom ? sql`AND cbt.transaction_date >= ${filters.dateFrom}` : sql``}
        ${filters.dateTo ? sql`AND cbt.transaction_date <= ${filters.dateTo}` : sql``}
    `.execute(this._activeExecutor);

    const total = Number(countResult.rows[0]?.total ?? 0);

    const rows = await sql<CashBankRow>`
      SELECT cbt.*,
             sa.name AS source_account_name,
             da.name AS destination_account_name,
             fxa.name AS fx_account_name
      FROM cash_bank_transactions cbt
      LEFT JOIN accounts sa ON sa.company_id = cbt.company_id AND sa.id = cbt.source_account_id
      LEFT JOIN accounts da ON da.company_id = cbt.company_id AND da.id = cbt.destination_account_id
      LEFT JOIN accounts fxa ON fxa.company_id = cbt.company_id AND fxa.id = cbt.fx_account_id
      WHERE cbt.company_id = ${companyId}
        ${filters.outletId !== undefined ? sql`AND cbt.outlet_id = ${filters.outletId}` : sql``}
        ${filters.transactionType ? sql`AND cbt.transaction_type = ${filters.transactionType}` : sql``}
        ${filters.status ? sql`AND cbt.status = ${filters.status}` : sql``}
        ${filters.dateFrom ? sql`AND cbt.transaction_date >= ${filters.dateFrom}` : sql``}
        ${filters.dateTo ? sql`AND cbt.transaction_date <= ${filters.dateTo}` : sql``}
      ORDER BY cbt.transaction_date DESC, cbt.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `.execute(this._activeExecutor);

    return {
      total,
      transactions: rows.rows.map(toCashBankTransaction)
    };
  }

  async create(input: CreateCashBankInput, companyId: number, createdByUserId: number | null): Promise<CashBankTransaction> {
    const currencyCode = (input.currency_code ?? "IDR").toUpperCase();

    // Cast to allow fx_gain_loss which is added by CashBankService.processForexFields
    const inputWithFx = input as CreateCashBankInput & { fx_gain_loss?: number };

    const result = await this._activeExecutor
      .insertInto("cash_bank_transactions")
      .values({
        company_id: companyId,
        outlet_id: input.outlet_id ?? null,
        transaction_type: input.transaction_type,
        transaction_date: new Date(input.transaction_date),
        reference: input.reference ?? null,
        description: input.description,
        source_account_id: input.source_account_id,
        destination_account_id: input.destination_account_id,
        amount: normalizeMoney(input.amount),
        currency_code: currencyCode,
        exchange_rate: input.exchange_rate ?? null,
        base_amount: input.base_amount ?? null,
        fx_gain_loss: inputWithFx.fx_gain_loss ?? 0,
        fx_account_id: input.fx_account_id ?? null,
        status: "DRAFT",
        created_by_user_id: createdByUserId
      })
      .executeTakeFirst();

    const created = await this.findById(Number(result.insertId), companyId);
    if (!created) {
      throw new Error("Created transaction not found");
    }
    return created;
  }

  async updateStatus(id: number, companyId: number, status: CashBankStatus, postedAt?: Date): Promise<void> {
    const update: Record<string, unknown> = {
      status,
      updated_at: new Date()
    };
    if (postedAt) {
      update.posted_at = postedAt;
    }

    await this._activeExecutor
      .updateTable("cash_bank_transactions")
      .set(update)
      .where("id", "=", id)
      .where("company_id", "=", companyId)
      .execute();
  }

  async findAccount(accountId: number, companyId: number): Promise<AccountInfo | null> {
    const account = await this._activeExecutor
      .selectFrom("accounts")
      .where("company_id", "=", companyId)
      .where("id", "=", accountId)
      .limit(1)
      .select(["id", "company_id", "name", "type_name"])
      .executeTakeFirst();

    return account ?? null;
  }

  async outletBelongsToCompany(outletId: number, companyId: number): Promise<boolean> {
    const row = await this._activeExecutor
      .selectFrom("outlets")
      .where("company_id", "=", companyId)
      .where("id", "=", outletId)
      .limit(1)
      .select("id")
      .executeTakeFirst();

    return !!row;
  }

  async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    const previousExecutor = this._executor;
    try {
      return await this.db.transaction().execute(async (trx) => {
        this._executor = trx as KyselySchema;
        try {
          return await operation();
        } finally {
          this._executor = previousExecutor;
        }
      });
    } catch (error) {
      this._executor = previousExecutor;
      throw error;
    }
  }

  // PostingRepository implementation
  async createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: number }> {
    const result = await this._activeExecutor
      .insertInto("journal_batches")
      .values({
        company_id: request.company_id,
        outlet_id: request.outlet_id ?? null,
        doc_type: request.doc_type,
        doc_id: request.doc_id,
        posted_at: new Date()
      })
      .executeTakeFirst();

    return { journal_batch_id: Number(result.insertId) };
  }

  async insertJournalLines(journalBatchId: number, request: PostingRequest, lines: JournalLine[]): Promise<void> {
    if (lines.length === 0) {
      return;
    }

    const lineDate = toIsoDateOnly(new Date());

    await this._activeExecutor
      .insertInto("journal_lines")
      .values(
        lines.map((line) => ({
          journal_batch_id: journalBatchId,
          company_id: request.company_id,
          outlet_id: request.outlet_id ?? null,
          account_id: line.account_id,
          line_date: new Date(lineDate),
          debit: line.debit,
          credit: line.credit,
          description: line.description
        }))
      )
      .execute();
  }
}

/**
 * API implementation of AccessScopeChecker.
 */
export class ApiAccessScopeChecker implements AccessScopeChecker {
  async userHasOutletAccess(userId: number, companyId: number, outletId: number): Promise<boolean> {
    return userHasOutletAccess(userId, companyId, outletId);
  }
}

/**
 * API implementation of FiscalYearGuard.
 */
export class ApiFiscalYearGuard implements FiscalYearGuard {
  constructor(private readonly db: KyselySchema) {}

  async ensureDateWithinOpenFiscalYear(companyId: number, date: string): Promise<void> {
    await ensureDateWithinOpenFiscalYearWithExecutor(this.db, companyId, date);
  }
}

/**
 * Kysely-based implementation of TreasuryPostingRepository and PostingRepository.
 * Handles journal batch creation and line insertion for treasury transactions.
 */
export class KyselyPostingRepository implements TreasuryPostingRepository, PostingRepository {
  constructor(private readonly db: KyselySchema, private readonly postedAt: string) {}

  async createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: number }> {
    const result = await this.db
      .insertInto("journal_batches")
      .values({
        company_id: request.company_id,
        outlet_id: request.outlet_id ?? null,
        doc_type: request.doc_type,
        doc_id: request.doc_id,
        posted_at: new Date(this.postedAt)
      })
      .executeTakeFirst();

    return { journal_batch_id: Number(result.insertId) };
  }

  async insertJournalLines(journalBatchId: number, request: PostingRequest, lines: JournalLine[], lineDate?: string): Promise<void> {
    if (lines.length === 0) {
      return;
    }

    const effectiveLineDate = lineDate ?? this.postedAt.slice(0, 10);

    await this.db
      .insertInto("journal_lines")
      .values(
        lines.map((line) => ({
          journal_batch_id: journalBatchId,
          company_id: request.company_id,
          outlet_id: request.outlet_id ?? null,
          account_id: line.account_id,
          line_date: new Date(effectiveLineDate),
          debit: line.debit,
          credit: line.credit,
          description: line.description
        }))
      )
      .execute();
  }
}

/**
 * Composer function for CashBankService with all required ports.
 * Creates a fully configured service instance for route handlers.
 */
export function createCashBankService(db: KyselySchema = getDb()): CashBankService {
  const repository = new KyselyCashBankRepository(db);
  const accessChecker = new ApiAccessScopeChecker();
  const fiscalYearGuard = new ApiFiscalYearGuard(db);

  // Use the repository passed from CashBankService — it already has _activeExecutor wired to the transaction
  const postingServiceFactory = (repository: PostingRepository, mappers: Record<string, PostingMapper>): PostingService => {
    return new PostingService(repository, mappers);
  };

  return new CashBankService(
    { repository, accessChecker, fiscalYearGuard },
    { postingServiceFactory }
  );
}
