// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { PostingService, type PostingMapper, type PostingRepository } from "@jurnapod/core";
import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection, Pool } from "mysql2/promise";
import { getDbPool } from "./db";
import { ensureDateWithinOpenFiscalYearWithExecutor } from "./fiscal-years";
import { userHasOutletAccess } from "./auth";

export type CashBankType = "MUTATION" | "TOP_UP" | "WITHDRAWAL" | "FOREX";
export type CashBankStatus = "DRAFT" | "POSTED" | "VOID";

type QueryExecutor = {
  execute: PoolConnection["execute"] | Pool["execute"];
};

type MutationActor = {
  userId: number;
};

type AccountRow = RowDataPacket & {
  id: number;
  company_id: number;
  name: string;
  type_name: string | null;
};

type CashBankRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number | null;
  transaction_type: CashBankType;
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
  status: CashBankStatus;
  posted_at: string | Date | null;
  created_by_user_id: number | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export type CashBankTransaction = {
  id: number;
  company_id: number;
  outlet_id: number | null;
  transaction_type: CashBankType;
  transaction_date: string;
  reference: string | null;
  description: string;
  source_account_id: number;
  source_account_name?: string;
  destination_account_id: number;
  destination_account_name?: string;
  amount: number;
  currency_code: string;
  exchange_rate: number | null;
  base_amount: number | null;
  fx_gain_loss: number | null;
  fx_account_id: number | null;
  fx_account_name?: string | null;
  status: CashBankStatus;
  posted_at: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export class CashBankValidationError extends Error {}
export class CashBankStatusError extends Error {}
export class CashBankNotFoundError extends Error {}
export class CashBankForbiddenError extends Error {}

const DOC_TYPE_BY_TRANSACTION_TYPE: Record<CashBankType, string> = {
  MUTATION: "CASH_BANK_MUTATION",
  TOP_UP: "CASH_BANK_TOP_UP",
  WITHDRAWAL: "CASH_BANK_WITHDRAWAL",
  FOREX: "CASH_BANK_FOREX"
};

const MONEY_SCALE = 100;

function toMinorUnits(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

function normalizeMoney(value: number): number {
  return toMinorUnits(value) / MONEY_SCALE;
}

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

function toMysqlDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CashBankValidationError("Invalid datetime");
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
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

function isCashBankTypeName(typeName: string | null): boolean {
  const value = (typeName ?? "").toLowerCase();
  return value.includes("kas") || value.includes("cash") || value.includes("bank");
}

type AccountClass = "CASH" | "BANK";

function classifyCashBankAccount(typeName: string | null): AccountClass | null {
  const value = (typeName ?? "").toLowerCase();
  const hasCash = value.includes("kas") || value.includes("cash");
  const hasBank = value.includes("bank");

  if (hasCash && !hasBank) {
    return "CASH";
  }
  if (hasBank && !hasCash) {
    return "BANK";
  }

  return null;
}

function validateDirectionByTransactionType(
  transactionType: CashBankType,
  sourceTypeName: string | null,
  destinationTypeName: string | null
): void {
  if (transactionType === "TOP_UP") {
    const sourceClass = classifyCashBankAccount(sourceTypeName);
    const destClass = classifyCashBankAccount(destinationTypeName);
    if (sourceClass !== "CASH" || destClass !== "BANK") {
      throw new CashBankValidationError("TOP_UP requires source cash and destination bank accounts");
    }
  } else if (transactionType === "WITHDRAWAL") {
    const sourceClass = classifyCashBankAccount(sourceTypeName);
    const destClass = classifyCashBankAccount(destinationTypeName);
    if (sourceClass !== "BANK" || destClass !== "CASH") {
      throw new CashBankValidationError("WITHDRAWAL requires source bank and destination cash accounts");
    }
  }
}

async function withTransaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function ensureOutletBelongsToCompany(
  executor: QueryExecutor,
  companyId: number,
  outletId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM outlets
     WHERE company_id = ?
       AND id = ?
     LIMIT 1`,
    [companyId, outletId]
  );

  if (rows.length === 0) {
    throw new CashBankValidationError("Outlet not found for company");
  }
}

async function ensureAccount(
  executor: QueryExecutor,
  companyId: number,
  accountId: number,
  roleLabel: "source" | "destination" | "fx"
): Promise<AccountRow> {
  const [rows] = await executor.execute<AccountRow[]>(
    `SELECT id, company_id, name, type_name
     FROM accounts
     WHERE company_id = ?
       AND id = ?
     LIMIT 1`,
    [companyId, accountId]
  );

  if (rows.length === 0) {
    throw new CashBankValidationError(`${roleLabel} account not found`);
  }

  const account = rows[0];
  if (!isCashBankTypeName(account.type_name)) {
    throw new CashBankValidationError(`${roleLabel} account must be cash/bank classified`);
  }

  return account;
}

export function buildCashBankJournalLines(input: {
  transactionType: CashBankType;
  sourceAccountId: number;
  destinationAccountId: number;
  amount: number;
  baseAmount: number | null;
  fxAccountId: number | null;
  referenceLabel: string;
}): JournalLine[] {
  if (input.amount <= 0) {
    throw new CashBankValidationError("amount must be positive");
  }

  if (input.transactionType !== "FOREX") {
    return [
      {
        account_id: input.destinationAccountId,
        debit: normalizeMoney(input.amount),
        credit: 0,
        description: `${input.referenceLabel} debit destination`
      },
      {
        account_id: input.sourceAccountId,
        debit: 0,
        credit: normalizeMoney(input.amount),
        description: `${input.referenceLabel} credit source`
      }
    ];
  }

  const forexBaseAmount = input.baseAmount ?? normalizeMoney(input.amount);
  const diff = normalizeMoney(forexBaseAmount - input.amount);
  const lines: JournalLine[] = [
    {
      account_id: input.destinationAccountId,
      debit: normalizeMoney(forexBaseAmount),
      credit: 0,
      description: `${input.referenceLabel} debit destination`
    },
    {
      account_id: input.sourceAccountId,
      debit: 0,
      credit: normalizeMoney(input.amount),
      description: `${input.referenceLabel} credit source`
    }
  ];

  if (diff !== 0) {
    if (!input.fxAccountId) {
      throw new CashBankValidationError("fx_account_id is required when FOREX has gain/loss");
    }

    if (diff > 0) {
      lines.push({
        account_id: input.fxAccountId,
        debit: 0,
        credit: normalizeMoney(diff),
        description: `${input.referenceLabel} forex gain`
      });
    } else {
      lines.push({
        account_id: input.fxAccountId,
        debit: normalizeMoney(Math.abs(diff)),
        credit: 0,
        description: `${input.referenceLabel} forex loss`
      });
    }
  }

  const debitMinor = lines.reduce((sum, line) => sum + toMinorUnits(line.debit), 0);
  const creditMinor = lines.reduce((sum, line) => sum + toMinorUnits(line.credit), 0);
  if (debitMinor !== creditMinor) {
    throw new CashBankValidationError("Cash/bank journal lines are not balanced");
  }

  return lines;
}

class CashBankPostingMapper implements PostingMapper {
  constructor(private readonly tx: CashBankTransaction, private readonly voidMode: boolean) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const docLabel = `Cash/Bank ${this.tx.transaction_type} #${this.tx.id}`;
    const original = buildCashBankJournalLines({
      transactionType: this.tx.transaction_type,
      sourceAccountId: this.tx.source_account_id,
      destinationAccountId: this.tx.destination_account_id,
      amount: this.tx.amount,
      baseAmount: this.tx.base_amount,
      fxAccountId: this.tx.fx_account_id,
      referenceLabel: docLabel
    });

    if (!this.voidMode) {
      return original;
    }

    return original.map((line) => ({
      account_id: line.account_id,
      debit: line.credit,
      credit: line.debit,
      description: `Void ${line.description}`
    }));
  }
}

class CashBankPostingRepository implements PostingRepository {
  private readonly lineDate: string;

  constructor(private readonly executor: QueryExecutor, private readonly postedAt: string) {
    this.lineDate = postedAt.slice(0, 10);
  }

  async createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: number }> {
    const [result] = await this.executor.execute<ResultSetHeader>(
      `INSERT INTO journal_batches (
         company_id,
         outlet_id,
         doc_type,
         doc_id,
         posted_at
       ) VALUES (?, ?, ?, ?, ?)`,
      [request.company_id, request.outlet_id ?? null, request.doc_type, request.doc_id, this.postedAt]
    );

    return { journal_batch_id: Number(result.insertId) };
  }

  async insertJournalLines(journalBatchId: number, request: PostingRequest, lines: JournalLine[]): Promise<void> {
    const placeholders = lines.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const values = lines.flatMap((line) => [
      journalBatchId,
      request.company_id,
      request.outlet_id ?? null,
      line.account_id,
      this.lineDate,
      line.debit,
      line.credit,
      line.description
    ]);

    await this.executor.execute(
      `INSERT INTO journal_lines (
         journal_batch_id,
         company_id,
         outlet_id,
         account_id,
         line_date,
         debit,
         credit,
         description
       ) VALUES ${placeholders}`,
      values
    );
  }
}

async function postCashBankToJournal(
  executor: QueryExecutor,
  tx: CashBankTransaction,
  options: { voidMode?: boolean }
): Promise<PostingResult> {
  await ensureDateWithinOpenFiscalYearWithExecutor(executor, tx.company_id, tx.transaction_date);

  const baseDocType = DOC_TYPE_BY_TRANSACTION_TYPE[tx.transaction_type];
  const docType = options.voidMode ? `${baseDocType}_VOID` : baseDocType;
  const postedAt = options.voidMode
    ? toMysqlDateTime(new Date().toISOString())
    : tx.posted_at
      ? toMysqlDateTime(tx.posted_at)
      : toMysqlDateTime(new Date().toISOString());

  const service = new PostingService(new CashBankPostingRepository(executor, postedAt), {
    [docType]: new CashBankPostingMapper(tx, Boolean(options.voidMode))
  });

  const request: PostingRequest = {
    doc_type: docType,
    doc_id: tx.id,
    company_id: tx.company_id,
    outlet_id: tx.outlet_id ?? undefined
  };

  return service.post(request, { transactionOwner: "external" });
}

async function readCashBankById(
  executor: QueryExecutor,
  companyId: number,
  transactionId: number,
  options?: { forUpdate?: boolean }
): Promise<CashBankTransaction | null> {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<CashBankRow[]>(
    `SELECT cbt.id,
            cbt.company_id,
            cbt.outlet_id,
            cbt.transaction_type,
            cbt.transaction_date,
            cbt.reference,
            cbt.description,
            cbt.source_account_id,
            sa.name AS source_account_name,
            cbt.destination_account_id,
            da.name AS destination_account_name,
            cbt.amount,
            cbt.currency_code,
            cbt.exchange_rate,
            cbt.base_amount,
            cbt.fx_gain_loss,
            cbt.fx_account_id,
            fxa.name AS fx_account_name,
            cbt.status,
            cbt.posted_at,
            cbt.created_by_user_id,
            cbt.created_at,
            cbt.updated_at
     FROM cash_bank_transactions cbt
     LEFT JOIN accounts sa ON sa.company_id = cbt.company_id AND sa.id = cbt.source_account_id
     LEFT JOIN accounts da ON da.company_id = cbt.company_id AND da.id = cbt.destination_account_id
     LEFT JOIN accounts fxa ON fxa.company_id = cbt.company_id AND fxa.id = cbt.fx_account_id
     WHERE cbt.company_id = ?
       AND cbt.id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, transactionId]
  );

  if (rows.length === 0) {
    return null;
  }

  return toCashBankTransaction(rows[0]);
}

export async function listCashBankTransactions(
  companyId: number,
  filters: {
    outletId?: number;
    transactionType?: CashBankType;
    status?: CashBankStatus;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }
) {
  const pool = getDbPool();
  const conditions: string[] = ["cbt.company_id = ?"];
  const values: Array<string | number> = [companyId];

  if (typeof filters.outletId === "number") {
    conditions.push("cbt.outlet_id = ?");
    values.push(filters.outletId);
  }
  if (filters.transactionType) {
    conditions.push("cbt.transaction_type = ?");
    values.push(filters.transactionType);
  }
  if (filters.status) {
    conditions.push("cbt.status = ?");
    values.push(filters.status);
  }
  if (filters.dateFrom) {
    conditions.push("cbt.transaction_date >= ?");
    values.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push("cbt.transaction_date <= ?");
    values.push(filters.dateTo);
  }

  const where = conditions.join(" AND ");
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM cash_bank_transactions cbt
     WHERE ${where}`,
    values
  );

  const [rows] = await pool.execute<CashBankRow[]>(
    `SELECT cbt.id,
            cbt.company_id,
            cbt.outlet_id,
            cbt.transaction_type,
            cbt.transaction_date,
            cbt.reference,
            cbt.description,
            cbt.source_account_id,
            sa.name AS source_account_name,
            cbt.destination_account_id,
            da.name AS destination_account_name,
            cbt.amount,
            cbt.currency_code,
            cbt.exchange_rate,
            cbt.base_amount,
            cbt.fx_gain_loss,
            cbt.fx_account_id,
            fxa.name AS fx_account_name,
            cbt.status,
            cbt.posted_at,
            cbt.created_by_user_id,
            cbt.created_at,
            cbt.updated_at
     FROM cash_bank_transactions cbt
     LEFT JOIN accounts sa ON sa.company_id = cbt.company_id AND sa.id = cbt.source_account_id
     LEFT JOIN accounts da ON da.company_id = cbt.company_id AND da.id = cbt.destination_account_id
     LEFT JOIN accounts fxa ON fxa.company_id = cbt.company_id AND fxa.id = cbt.fx_account_id
     WHERE ${where}
     ORDER BY cbt.transaction_date DESC, cbt.id DESC
     LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  return {
    total: Number(countRows[0]?.total ?? 0),
    transactions: rows.map(toCashBankTransaction)
  };
}

export async function getCashBankTransaction(
  companyId: number,
  transactionId: number,
  options?: { forUpdate?: boolean }
): Promise<CashBankTransaction> {
  const pool = getDbPool();
  const tx = await readCashBankById(pool, companyId, transactionId, options);
  if (!tx) {
    throw new CashBankNotFoundError("Cash/bank transaction not found");
  }
  return tx;
}

export async function createCashBankTransaction(
  companyId: number,
  input: {
    outlet_id?: number | null;
    transaction_type: CashBankType;
    transaction_date: string;
    reference?: string;
    description: string;
    source_account_id: number;
    destination_account_id: number;
    amount: number;
    currency_code?: string;
    exchange_rate?: number;
    base_amount?: number;
    fx_account_id?: number | null;
  },
  actor?: MutationActor
): Promise<CashBankTransaction> {
  return withTransaction(async (connection) => {
    if (input.source_account_id === input.destination_account_id) {
      throw new CashBankValidationError("Source and destination accounts must differ");
    }
    if (input.amount <= 0) {
      throw new CashBankValidationError("Amount must be positive");
    }

    const outletId = input.outlet_id ?? null;
    if (outletId !== null) {
      await ensureOutletBelongsToCompany(connection, companyId, outletId);
      if (actor) {
        const hasAccess = await userHasOutletAccess(actor.userId, companyId, outletId);
        if (!hasAccess) {
          throw new CashBankForbiddenError("User cannot access outlet");
        }
      }
    }

    const sourceAccount = await ensureAccount(connection, companyId, input.source_account_id, "source");
    const destAccount = await ensureAccount(connection, companyId, input.destination_account_id, "destination");

    validateDirectionByTransactionType(input.transaction_type, sourceAccount.type_name, destAccount.type_name);

    const transactionType = input.transaction_type;
    const currencyCode = (input.currency_code ?? "IDR").toUpperCase();
    let exchangeRate = input.exchange_rate ?? null;
    let baseAmount = input.base_amount ?? null;
    let fxAccountId = input.fx_account_id ?? null;

    if (transactionType === "FOREX") {
      if (!exchangeRate || exchangeRate <= 0) {
        throw new CashBankValidationError("FOREX requires exchange_rate > 0");
      }
      if (currencyCode.length !== 3) {
        throw new CashBankValidationError("FOREX requires 3-char currency_code");
      }
      if (baseAmount === null) {
        baseAmount = normalizeMoney(input.amount * exchangeRate);
      }
      if (baseAmount <= 0) {
        throw new CashBankValidationError("FOREX base_amount must be positive");
      }
      if (fxAccountId !== null) {
        await ensureAccount(connection, companyId, fxAccountId, "fx");
      }
    } else {
      exchangeRate = null;
      baseAmount = null;
      fxAccountId = null;
    }

    const fxGainLoss = transactionType === "FOREX" && baseAmount !== null
      ? normalizeMoney(baseAmount - input.amount)
      : 0;

    if (transactionType === "FOREX" && fxGainLoss !== 0 && !fxAccountId) {
      throw new CashBankValidationError("fx_account_id is required when FOREX produces gain/loss");
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO cash_bank_transactions (
         company_id,
         outlet_id,
         transaction_type,
         transaction_date,
         reference,
         description,
         source_account_id,
         destination_account_id,
         amount,
         currency_code,
         exchange_rate,
         base_amount,
         fx_gain_loss,
         fx_account_id,
         status,
         created_by_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
      [
        companyId,
        outletId,
        transactionType,
        input.transaction_date,
        input.reference ?? null,
        input.description,
        input.source_account_id,
        input.destination_account_id,
        normalizeMoney(input.amount),
        currencyCode,
        exchangeRate,
        baseAmount,
        fxGainLoss,
        fxAccountId,
        actor?.userId ?? null
      ]
    );

    const created = await readCashBankById(connection, companyId, Number(result.insertId));
    if (!created) {
      throw new CashBankNotFoundError("Created transaction not found");
    }
    return created;
  });
}

export async function postCashBankTransaction(
  companyId: number,
  transactionId: number,
  actor?: MutationActor
): Promise<CashBankTransaction> {
  return withTransaction(async (connection) => {
    const current = await readCashBankById(connection, companyId, transactionId, { forUpdate: true });
    if (!current) {
      throw new CashBankNotFoundError("Cash/bank transaction not found");
    }

    if (current.outlet_id && actor) {
      const hasAccess = await userHasOutletAccess(actor.userId, companyId, current.outlet_id);
      if (!hasAccess) {
        throw new CashBankForbiddenError("User cannot access outlet");
      }
    }

    if (current.status === "POSTED") {
      return current;
    }
    if (current.status !== "DRAFT") {
      throw new CashBankStatusError("Only DRAFT transaction can be posted");
    }

    const sourceAccount = await ensureAccount(connection, companyId, current.source_account_id, "source");
    const destAccount = await ensureAccount(connection, companyId, current.destination_account_id, "destination");
    validateDirectionByTransactionType(current.transaction_type, sourceAccount.type_name, destAccount.type_name);

    await ensureDateWithinOpenFiscalYearWithExecutor(connection, companyId, current.transaction_date);

    await connection.execute<ResultSetHeader>(
      `UPDATE cash_bank_transactions
       SET status = 'POSTED',
           posted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ?
         AND id = ?`,
      [companyId, transactionId]
    );

    const posted = await readCashBankById(connection, companyId, transactionId, { forUpdate: true });
    if (!posted) {
      throw new CashBankNotFoundError("Posted transaction not found");
    }

    await postCashBankToJournal(connection, posted, { voidMode: false });
    return posted;
  });
}

export async function voidCashBankTransaction(
  companyId: number,
  transactionId: number,
  actor?: MutationActor
): Promise<CashBankTransaction> {
  return withTransaction(async (connection) => {
    const current = await readCashBankById(connection, companyId, transactionId, { forUpdate: true });
    if (!current) {
      throw new CashBankNotFoundError("Cash/bank transaction not found");
    }

    if (current.outlet_id && actor) {
      const hasAccess = await userHasOutletAccess(actor.userId, companyId, current.outlet_id);
      if (!hasAccess) {
        throw new CashBankForbiddenError("User cannot access outlet");
      }
    }

    if (current.status === "VOID") {
      return current;
    }
    if (current.status !== "POSTED") {
      throw new CashBankStatusError("Only POSTED transaction can be voided");
    }

    await ensureDateWithinOpenFiscalYearWithExecutor(connection, companyId, current.transaction_date);

    await connection.execute<ResultSetHeader>(
      `UPDATE cash_bank_transactions
       SET status = 'VOID',
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ?
         AND id = ?`,
      [companyId, transactionId]
    );

    const voided = await readCashBankById(connection, companyId, transactionId, { forUpdate: true });
    if (!voided) {
      throw new CashBankNotFoundError("Voided transaction not found");
    }

    await postCashBankToJournal(connection, voided, { voidMode: true });
    return voided;
  });
}

export const __cashBankTestables = {
  buildCashBankJournalLines,
  isCashBankTypeName,
  classifyCashBankAccount,
  validateDirectionByTransactionType
};
