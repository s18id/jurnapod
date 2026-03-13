// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "./db";
import { postDepreciationRunToJournal } from "./depreciation-posting";

const FA_ACQUISITION = "FA_ACQUISITION";
const FA_DEPRECIATION = "FA_DEPRECIATION";
const FA_TRANSFER = "FA_TRANSFER";
const FA_IMPAIRMENT = "FA_IMPAIRMENT";
const FA_DISPOSAL = "FA_DISPOSAL";
const FA_VOID = "FA_VOID";

type FixedAssetRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number | null;
  name: string;
  purchase_cost: string | number | null;
  disposed_at: Date | string | null;
};

type FixedAssetBookRow = RowDataPacket & {
  id: number;
  company_id: number;
  asset_id: number;
  cost_basis: string | number;
  accum_depreciation: string | number;
  accum_impairment: string | number;
  carrying_amount: string | number;
  as_of_date: Date | string;
  last_event_id: number;
};

type FixedAssetEventRow = RowDataPacket & {
  id: number;
  company_id: number;
  asset_id: number;
  event_type: string;
  event_date: Date | string;
  outlet_id: number | null;
  journal_batch_id: number | null;
  status: string;
  idempotency_key: string;
  event_data: string;
  created_at: Date;
  created_by: number;
  voided_by: number | null;
  voided_at: Date | null;
};

type AccessCheckRow = RowDataPacket & {
  id: number;
};

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

type MutationActor = {
  userId: number;
};

const MONEY_SCALE = 100;

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

function formatDateOnly(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function isMysqlError(error: unknown): error is { errno?: number } {
  return typeof error === "object" && error !== null && "errno" in error;
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

export class FixedAssetLifecycleError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "FixedAssetLifecycleError";
  }
}

export class FixedAssetNotFoundError extends FixedAssetLifecycleError {
  constructor() {
    super("Fixed asset not found", "NOT_FOUND");
  }
}

export class FixedAssetDisposedError extends FixedAssetLifecycleError {
  constructor() {
    super("Asset has already been disposed", "ASSET_ALREADY_DISPOSED");
  }
}

export class FixedAssetEventNotFoundError extends FixedAssetLifecycleError {
  constructor() {
    super("Fixed asset event not found", "EVENT_NOT_FOUND");
  }
}

export class FixedAssetEventVoidedError extends FixedAssetLifecycleError {
  constructor() {
    super("Event has already been voided", "EVENT_ALREADY_VOIDED");
  }
}

export class FixedAssetEventNotVoidableError extends FixedAssetLifecycleError {
  constructor() {
    super("Event type cannot be voided", "EVENT_NOT_VOIDABLE");
  }
}

export class FixedAssetDuplicateEventError extends FixedAssetLifecycleError {
  constructor(existingEventId: number) {
    super("Duplicate event with same idempotency key", "DUPLICATE_EVENT");
    this.existingEventId = existingEventId;
  }
  existingEventId: number;
}

async function ensureCompanyOutletExists(
  executor: QueryExecutor,
  companyId: number,
  outletId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id FROM outlets WHERE id = ? AND company_id = ? LIMIT 1`,
    [outletId, companyId]
  );
  if (rows.length === 0) {
    throw new FixedAssetLifecycleError("Outlet not found for company", "INVALID_REFERENCE");
  }
}

async function ensureCompanyAccountExists(
  executor: QueryExecutor,
  companyId: number,
  accountId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id FROM accounts WHERE id = ? AND company_id = ? LIMIT 1`,
    [accountId, companyId]
  );
  if (rows.length === 0) {
    throw new FixedAssetLifecycleError("Account not found for company", "INVALID_REFERENCE");
  }
}

async function ensureUserHasOutletAccess(
  executor: QueryExecutor,
  userId: number,
  companyId: number,
  outletId: number
): Promise<void> {
  const [rows] = await executor.execute<AccessCheckRow[]>(
    `SELECT 1
     FROM users u
     WHERE u.id = ?
       AND u.company_id = ?
       AND u.is_active = 1
       AND (
         EXISTS (
           SELECT 1 FROM user_role_assignments ura
           INNER JOIN roles r ON r.id = ura.role_id
           WHERE ura.user_id = u.id AND r.is_global = 1 AND ura.outlet_id IS NULL
         )
         OR EXISTS (
           SELECT 1 FROM user_role_assignments ura
           WHERE ura.user_id = u.id AND ura.outlet_id = ?
         )
       )
     LIMIT 1`,
    [userId, companyId, outletId]
  );
  if (rows.length === 0) {
    throw new FixedAssetLifecycleError("User cannot access outlet", "FORBIDDEN");
  }
}

async function findFixedAssetWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  assetId: number
): Promise<FixedAssetRow | null> {
  const [rows] = await executor.execute<FixedAssetRow[]>(
    `SELECT id, company_id, outlet_id, name, purchase_cost, disposed_at
     FROM fixed_assets WHERE company_id = ? AND id = ? LIMIT 1`,
    [companyId, assetId]
  );
  return rows[0] ?? null;
}

async function findAssetBookWithExecutor(
  executor: QueryExecutor,
  assetId: number
): Promise<FixedAssetBookRow | null> {
  const [rows] = await executor.execute<FixedAssetBookRow[]>(
    `SELECT id, company_id, asset_id, cost_basis, accum_depreciation, accum_impairment, carrying_amount, as_of_date, last_event_id
     FROM fixed_asset_books WHERE asset_id = ? LIMIT 1`,
    [assetId]
  );
  return rows[0] ?? null;
}

async function findEventByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  eventId: number
): Promise<FixedAssetEventRow | null> {
  const [rows] = await executor.execute<FixedAssetEventRow[]>(
    `SELECT id, company_id, asset_id, event_type, event_date, outlet_id, journal_batch_id, status, idempotency_key, event_data, created_at, created_by, voided_by, voided_at
     FROM fixed_asset_events WHERE company_id = ? AND id = ? LIMIT 1`,
    [companyId, eventId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ...row,
    event_data: typeof row.event_data === "string" ? JSON.parse(row.event_data) : row.event_data
  };
}

async function findExistingEventByIdempotencyKey(
  executor: QueryExecutor,
  companyId: number,
  idempotencyKey: string
): Promise<FixedAssetEventRow | null> {
  const [rows] = await executor.execute<FixedAssetEventRow[]>(
    `SELECT id, company_id, asset_id, event_type, event_date, outlet_id, journal_batch_id, status, idempotency_key, event_data, created_at, created_by, voided_by, voided_at
     FROM fixed_asset_events WHERE company_id = ? AND idempotency_key = ? LIMIT 1`,
    [companyId, idempotencyKey]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ...row,
    event_data: typeof row.event_data === "string" ? JSON.parse(row.event_data) : row.event_data
  };
}

async function insertEvent(
  executor: QueryExecutor,
  companyId: number,
  assetId: number,
  eventType: string,
  eventDate: string,
  outletId: number | null,
  journalBatchId: number | null,
  status: string,
  idempotencyKey: string,
  eventData: Record<string, unknown>,
  createdBy: number
): Promise<number> {
  const [result] = await executor.execute<ResultSetHeader>(
    `INSERT INTO fixed_asset_events (
      company_id, asset_id, event_type, event_date, outlet_id, journal_batch_id, status, idempotency_key, event_data, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [companyId, assetId, eventType, eventDate, outletId, journalBatchId, status, idempotencyKey, JSON.stringify(eventData), createdBy]
  );
  return Number(result.insertId);
}

async function updateAssetBook(
  executor: QueryExecutor,
  companyId: number,
  assetId: number,
  costBasis: number,
  accumDepreciation: number,
  accumImpairment: number,
  carryingAmount: number,
  asOfDate: string,
  lastEventId: number
): Promise<void> {
  const existing = await findAssetBookWithExecutor(executor, assetId);
  if (existing) {
    await executor.execute<ResultSetHeader>(
      `UPDATE fixed_asset_books SET cost_basis = ?, accum_depreciation = ?, accum_impairment = ?, carrying_amount = ?, as_of_date = ?, last_event_id = ? WHERE asset_id = ?`,
      [costBasis, accumDepreciation, accumImpairment, carryingAmount, asOfDate, lastEventId, assetId]
    );
  } else {
    await executor.execute<ResultSetHeader>(
      `INSERT INTO fixed_asset_books (company_id, asset_id, cost_basis, accum_depreciation, accum_impairment, carrying_amount, as_of_date, last_event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, assetId, costBasis, accumDepreciation, accumImpairment, carryingAmount, asOfDate, lastEventId]
    );
  }
}

async function markAssetDisposed(
  executor: QueryExecutor,
  assetId: number,
  disposedAt: Date
): Promise<void> {
  await executor.execute<ResultSetHeader>(
    `UPDATE fixed_assets SET disposed_at = ? WHERE id = ?`,
    [disposedAt.toISOString().slice(0, 19).replace("T", " "), assetId]
  );
}

function ensureDateWithinOpenFiscalYear(
  executor: QueryExecutor,
  companyId: number,
  eventDate: string
): Promise<void> {
  return ensureDateWithinOpenFiscalYearWithExecutor(executor, companyId, eventDate);
}

async function ensureDateWithinOpenFiscalYearWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  eventDate: string
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id FROM fiscal_years WHERE company_id = ? AND start_date <= ? AND end_date >= ? AND status = 'OPEN' LIMIT 1`,
    [companyId, eventDate, eventDate]
  );
  if (rows.length === 0) {
    throw new FixedAssetLifecycleError("Event date is outside any open fiscal year", "FISCAL_YEAR_CLOSED");
  }
}

export interface AcquisitionInput {
  outlet_id?: number;
  event_date: string;
  cost: number;
  useful_life_months: number;
  salvage_value?: number;
  expense_account_id: number;
  accum_depr_account_id?: number;
  notes?: string;
  idempotency_key?: string;
}

export interface AcquisitionResult {
  event_id: number;
  journal_batch_id: number;
  book: {
    cost_basis: number;
    carrying_amount: number;
  };
  duplicate: boolean;
}

export async function recordAcquisition(
  companyId: number,
  assetId: number,
  input: AcquisitionInput,
  actor: MutationActor
): Promise<AcquisitionResult> {
  return withTransaction(async (connection) => {
    const asset = await findFixedAssetWithExecutor(connection, companyId, assetId);
    if (!asset) {
      throw new FixedAssetNotFoundError();
    }
    if (asset.disposed_at) {
      throw new FixedAssetDisposedError();
    }

    const idempotencyKey = input.idempotency_key ?? generateIdempotencyKey();
    const existingEvent = await findExistingEventByIdempotencyKey(connection, companyId, idempotencyKey);
    if (existingEvent) {
      const book = await findAssetBookWithExecutor(connection, assetId);
      return {
        event_id: existingEvent.id,
        journal_batch_id: existingEvent.journal_batch_id ?? 0,
        book: {
          cost_basis: book ? Number(book.cost_basis) : 0,
          carrying_amount: book ? Number(book.carrying_amount) : 0
        },
        duplicate: true
      };
    }

    await ensureDateWithinOpenFiscalYearWithExecutor(connection, companyId, input.event_date);
    await ensureCompanyAccountExists(connection, companyId, input.expense_account_id);

    let outletId = input.outlet_id ?? asset.outlet_id ?? null;
    if (typeof outletId === "number") {
      await ensureCompanyOutletExists(connection, companyId, outletId);
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, outletId);
    }

    const salvageValue = input.salvage_value ?? 0;
    const carryingAmount = normalizeMoney(input.cost - salvageValue);

    const journalBatchId = await postAcquisitionToJournal(
      connection,
      companyId,
      assetId,
      outletId,
      input.event_date,
      input.cost,
      input.expense_account_id
    );

    const eventId = await insertEvent(
      connection,
      companyId,
      assetId,
      FA_ACQUISITION,
      input.event_date,
      outletId,
      journalBatchId,
      "POSTED",
      idempotencyKey,
      {
        cost: input.cost,
        useful_life_months: input.useful_life_months,
        salvage_value: salvageValue,
        expense_account_id: input.expense_account_id,
        notes: input.notes
      },
      actor.userId
    );

    await updateAssetBook(
      connection,
      companyId,
      assetId,
      input.cost,
      0,
      0,
      carryingAmount,
      input.event_date,
      eventId
    );

    return {
      event_id: eventId,
      journal_batch_id: journalBatchId,
      book: {
        cost_basis: input.cost,
        carrying_amount: carryingAmount
      },
      duplicate: false
    };
  });
}

async function postAcquisitionToJournal(
  executor: QueryExecutor,
  companyId: number,
  assetId: number,
  outletId: number | null,
  eventDate: string,
  cost: number,
  expenseAccountId: number
): Promise<number> {
  await ensureDateWithinOpenFiscalYearWithExecutor(executor, companyId, eventDate);

  const [batchResult] = await executor.execute<ResultSetHeader>(
    `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at) VALUES (?, ?, ?, ?, ?)`,
    [companyId, outletId, FA_ACQUISITION, assetId, eventDate]
  );
  const journalBatchId = Number(batchResult.insertId);

  const debitAccountId = expenseAccountId;
  const creditAccountId = expenseAccountId;

  await executor.execute(
    `INSERT INTO journal_lines (journal_batch_id, company_id, outlet_id, account_id, line_date, debit, credit, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      journalBatchId, companyId, outletId, debitAccountId, eventDate, cost, 0, `Fixed Asset Acquisition - Cost`,
      journalBatchId, companyId, outletId, creditAccountId, eventDate, 0, cost, `Fixed Asset Acquisition - Offset`
    ]
  );

  return journalBatchId;
}

export interface TransferInput {
  to_outlet_id: number;
  transfer_date: string;
  notes?: string;
  idempotency_key?: string;
}

export interface TransferResult {
  event_id: number;
  journal_batch_id: number | null;
  to_outlet_id: number;
  duplicate: boolean;
}

export async function recordTransfer(
  companyId: number,
  assetId: number,
  input: TransferInput,
  actor: MutationActor
): Promise<TransferResult> {
  return withTransaction(async (connection) => {
    const asset = await findFixedAssetWithExecutor(connection, companyId, assetId);
    if (!asset) {
      throw new FixedAssetNotFoundError();
    }
    if (asset.disposed_at) {
      throw new FixedAssetDisposedError();
    }

    const idempotencyKey = input.idempotency_key ?? generateIdempotencyKey();
    const existingEvent = await findExistingEventByIdempotencyKey(connection, companyId, idempotencyKey);
    if (existingEvent) {
      const eventData = typeof existingEvent.event_data === "string" 
        ? JSON.parse(existingEvent.event_data) 
        : existingEvent.event_data;
      return {
        event_id: existingEvent.id,
        journal_batch_id: existingEvent.journal_batch_id,
        to_outlet_id: (eventData as Record<string, unknown>).to_outlet_id as number,
        duplicate: true
      };
    }

    await ensureDateWithinOpenFiscalYearWithExecutor(connection, companyId, input.transfer_date);
    await ensureCompanyOutletExists(connection, companyId, input.to_outlet_id);
    await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.to_outlet_id);

    const fromOutletId = asset.outlet_id;
    const toOutletId = input.to_outlet_id;

    const eventId = await insertEvent(
      connection,
      companyId,
      assetId,
      FA_TRANSFER,
      input.transfer_date,
      toOutletId,
      null,
      "POSTED",
      idempotencyKey,
      {
        from_outlet_id: fromOutletId,
        to_outlet_id: toOutletId,
        notes: input.notes
      },
      actor.userId
    );

    await connection.execute<ResultSetHeader>(
      `UPDATE fixed_assets SET outlet_id = ? WHERE id = ?`,
      [toOutletId, assetId]
    );

    return {
      event_id: eventId,
      journal_batch_id: null,
      to_outlet_id: toOutletId,
      duplicate: false
    };
  });
}

export interface ImpairmentInput {
  impairment_date: string;
  impairment_amount: number;
  reason: string;
  expense_account_id: number;
  idempotency_key?: string;
}

export interface ImpairmentResult {
  event_id: number;
  journal_batch_id: number;
  book: {
    carrying_amount: number;
    accum_impairment: number;
  };
  duplicate: boolean;
}

export async function recordImpairment(
  companyId: number,
  assetId: number,
  input: ImpairmentInput,
  actor: MutationActor
): Promise<ImpairmentResult> {
  return withTransaction(async (connection) => {
    const asset = await findFixedAssetWithExecutor(connection, companyId, assetId);
    if (!asset) {
      throw new FixedAssetNotFoundError();
    }
    if (asset.disposed_at) {
      throw new FixedAssetDisposedError();
    }

    const book = await findAssetBookWithExecutor(connection, assetId);
    if (!book) {
      throw new FixedAssetLifecycleError("Asset has no book value - must acquire first", "INVALID_STATE");
    }

    const idempotencyKey = input.idempotency_key ?? generateIdempotencyKey();
    const existingEvent = await findExistingEventByIdempotencyKey(connection, companyId, idempotencyKey);
    if (existingEvent) {
      return {
        event_id: existingEvent.id,
        journal_batch_id: existingEvent.journal_batch_id ?? 0,
        book: {
          carrying_amount: book ? Number(book.carrying_amount) : 0,
          accum_impairment: book ? Number(book.accum_impairment) : 0
        },
        duplicate: true
      };
    }

    await ensureDateWithinOpenFiscalYearWithExecutor(connection, companyId, input.impairment_date);
    await ensureCompanyAccountExists(connection, companyId, input.expense_account_id);

    const currentCarryingAmount = Number(book.carrying_amount);
    const newImpairment = Math.min(input.impairment_amount, currentCarryingAmount);
    const newCarryingAmount = normalizeMoney(currentCarryingAmount - newImpairment);
    const newAccumImpairment = Number(book.accum_impairment) + newImpairment;

    const journalBatchId = await postImpairmentToJournal(
      connection,
      companyId,
      assetId,
      asset.outlet_id,
      input.impairment_date,
      newImpairment,
      input.expense_account_id
    );

    const eventId = await insertEvent(
      connection,
      companyId,
      assetId,
      FA_IMPAIRMENT,
      input.impairment_date,
      asset.outlet_id,
      journalBatchId,
      "POSTED",
      idempotencyKey,
      {
        impairment_amount: newImpairment,
        reason: input.reason,
        expense_account_id: input.expense_account_id
      },
      actor.userId
    );

    await updateAssetBook(
      connection,
      companyId,
      assetId,
      Number(book.cost_basis),
      Number(book.accum_depreciation),
      newAccumImpairment,
      newCarryingAmount,
      input.impairment_date,
      eventId
    );

    return {
      event_id: eventId,
      journal_batch_id: journalBatchId,
      book: {
        carrying_amount: newCarryingAmount,
        accum_impairment: newAccumImpairment
      },
      duplicate: false
    };
  });
}

async function postImpairmentToJournal(
  executor: QueryExecutor,
  companyId: number,
  assetId: number,
  outletId: number | null,
  eventDate: string,
  impairmentAmount: number,
  expenseAccountId: number
): Promise<number> {
  await ensureDateWithinOpenFiscalYearWithExecutor(executor, companyId, eventDate);

  const [batchResult] = await executor.execute<ResultSetHeader>(
    `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at) VALUES (?, ?, ?, ?, ?)`,
    [companyId, outletId, FA_IMPAIRMENT, assetId, eventDate]
  );
  const journalBatchId = Number(batchResult.insertId);

  await executor.execute(
    `INSERT INTO journal_lines (journal_batch_id, company_id, outlet_id, account_id, line_date, debit, credit, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      journalBatchId, companyId, outletId, expenseAccountId, eventDate, impairmentAmount, 0, `Fixed Asset Impairment`,
      journalBatchId, companyId, outletId, expenseAccountId, eventDate, 0, impairmentAmount, `Fixed Asset Impairment - Accum`
    ]
  );

  return journalBatchId;
}

export interface DisposalInput {
  disposal_date: string;
  disposal_type: "SALE" | "SCRAP";
  proceeds?: number;
  disposal_cost?: number;
  cash_account_id: number;
  notes?: string;
  idempotency_key?: string;
}

export interface DisposalResult {
  event_id: number;
  journal_batch_id: number;
  disposal: {
    proceeds: number;
    cost_removed: number;
    gain_loss: number;
  };
  book: {
    carrying_amount: number;
  };
  duplicate: boolean;
}

export async function recordDisposal(
  companyId: number,
  assetId: number,
  input: DisposalInput,
  actor: MutationActor
): Promise<DisposalResult> {
  return withTransaction(async (connection) => {
    const asset = await findFixedAssetWithExecutor(connection, companyId, assetId);
    if (!asset) {
      throw new FixedAssetNotFoundError();
    }
    if (asset.disposed_at) {
      throw new FixedAssetDisposedError();
    }

    const book = await findAssetBookWithExecutor(connection, assetId);
    if (!book) {
      throw new FixedAssetLifecycleError("Asset has no book value - must acquire first", "INVALID_STATE");
    }

    const idempotencyKey = input.idempotency_key ?? generateIdempotencyKey();
    const existingEvent = await findExistingEventByIdempotencyKey(connection, companyId, idempotencyKey);
    if (existingEvent) {
      const eventData = typeof existingEvent.event_data === "string"
        ? JSON.parse(existingEvent.event_data)
        : existingEvent.event_data;
      return {
        event_id: existingEvent.id,
        journal_batch_id: existingEvent.journal_batch_id ?? 0,
        disposal: {
          proceeds: (eventData as Record<string, unknown>).proceeds as number ?? 0,
          cost_removed: (eventData as Record<string, unknown>).cost_removed as number ?? 0,
          gain_loss: (eventData as Record<string, unknown>).gain_loss as number ?? 0
        },
        book: { carrying_amount: 0 },
        duplicate: true
      };
    }

    await ensureDateWithinOpenFiscalYearWithExecutor(connection, companyId, input.disposal_date);
    await ensureCompanyAccountExists(connection, companyId, input.cash_account_id);

    const proceeds = input.proceeds ?? 0;
    const disposalCost = input.disposal_cost ?? 0;
    const costBasis = Number(book.cost_basis);
    const accumDepreciation = Number(book.accum_depreciation);
    const accumImpairment = Number(book.accum_impairment);
    const carryingAmount = Number(book.carrying_amount);

    let gainLoss: number;
    if (input.disposal_type === "SALE") {
      gainLoss = normalizeMoney(proceeds + disposalCost - carryingAmount);
    } else {
      gainLoss = normalizeMoney(-carryingAmount - disposalCost);
    }

    const journalBatchId = await postDisposalToJournal(
      connection,
      companyId,
      assetId,
      asset.outlet_id,
      input.disposal_date,
      input.disposal_type,
      proceeds,
      disposalCost,
      costBasis,
      accumDepreciation,
      accumImpairment,
      gainLoss,
      input.cash_account_id
    );

    const eventId = await insertEvent(
      connection,
      companyId,
      assetId,
      FA_DISPOSAL,
      input.disposal_date,
      asset.outlet_id,
      journalBatchId,
      "POSTED",
      idempotencyKey,
      {
        disposal_type: input.disposal_type,
        proceeds,
        disposal_cost: disposalCost,
        cost_removed: costBasis,
        depr_removed: accumDepreciation,
        impairment_removed: accumImpairment,
        gain_loss: gainLoss,
        cash_account_id: input.cash_account_id,
        notes: input.notes
      },
      actor.userId
    );

    await connection.execute<ResultSetHeader>(
      `INSERT INTO fixed_asset_disposals (
        company_id, event_id, asset_id, proceeds, cost_removed, depr_removed, impairment_removed, disposal_cost, gain_loss, disposal_type, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, eventId, assetId, proceeds, costBasis, accumDepreciation, accumImpairment, disposalCost, gainLoss, input.disposal_type, input.notes ?? null]
    );

    await updateAssetBook(
      connection,
      companyId,
      assetId,
      0,
      0,
      0,
      0,
      input.disposal_date,
      eventId
    );

    await markAssetDisposed(connection, assetId, new Date(input.disposal_date));

    return {
      event_id: eventId,
      journal_batch_id: journalBatchId,
      disposal: {
        proceeds,
        cost_removed: costBasis,
        gain_loss: gainLoss
      },
      book: { carrying_amount: 0 },
      duplicate: false
    };
  });
}

async function postDisposalToJournal(
  executor: QueryExecutor,
  companyId: number,
  assetId: number,
  outletId: number | null,
  eventDate: string,
  disposalType: "SALE" | "SCRAP",
  proceeds: number,
  disposalCost: number,
  costBasis: number,
  accumDepreciation: number,
  accumImpairment: number,
  gainLoss: number,
  cashAccountId: number
): Promise<number> {
  await ensureDateWithinOpenFiscalYearWithExecutor(executor, companyId, eventDate);

  const [batchResult] = await executor.execute<ResultSetHeader>(
    `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at) VALUES (?, ?, ?, ?, ?)`,
    [companyId, outletId, FA_DISPOSAL, assetId, eventDate]
  );
  const journalBatchId = Number(batchResult.insertId);

  const lines: Array<[number, number, number | null, number, string, number, number, string]> = [];

  if (disposalType === "SALE" && proceeds > 0) {
    lines.push([journalBatchId, companyId, outletId, cashAccountId, eventDate, proceeds, 0, "Disposal Proceeds"]);
  }

  if (accumDepreciation > 0) {
    lines.push([journalBatchId, companyId, outletId, cashAccountId, eventDate, accumDepreciation, 0, "Accumulated Depreciation Removed"]);
  }

  if (accumImpairment > 0) {
    lines.push([journalBatchId, companyId, outletId, cashAccountId, eventDate, accumImpairment, 0, "Accumulated Impairment Removed"]);
  }

  if (costBasis > 0) {
    lines.push([journalBatchId, companyId, outletId, cashAccountId, eventDate, 0, costBasis, "Fixed Asset Cost Removed"]);
  }

  if (gainLoss !== 0) {
    if (gainLoss > 0) {
      lines.push([journalBatchId, companyId, outletId, cashAccountId, eventDate, 0, gainLoss, "Gain on Disposal"]);
    } else {
      lines.push([journalBatchId, companyId, outletId, cashAccountId, eventDate, Math.abs(gainLoss), 0, "Loss on Disposal"]);
    }
  }

  if (disposalCost > 0) {
    lines.push([journalBatchId, companyId, outletId, cashAccountId, eventDate, disposalCost, 0, "Disposal Costs"]);
  }

  if (lines.length > 0) {
    const placeholders = lines.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const values = lines.flat();
    await executor.execute(`INSERT INTO journal_lines (journal_batch_id, company_id, outlet_id, account_id, line_date, debit, credit, description) VALUES ${placeholders}`, values);
  }

  return journalBatchId;
}

export interface VoidEventInput {
  void_reason: string;
  idempotency_key?: string;
}

export interface VoidResult {
  void_event_id: number;
  original_event_id: number;
  journal_batch_id: number | null;
  duplicate: boolean;
}

const VOIDABLE_EVENTS = [FA_ACQUISITION, FA_DISPOSAL];

export async function voidEvent(
  companyId: number,
  eventId: number,
  input: VoidEventInput,
  actor: MutationActor
): Promise<VoidResult> {
  return withTransaction(async (connection) => {
    const event = await findEventByIdWithExecutor(connection, companyId, eventId);
    if (!event) {
      throw new FixedAssetEventNotFoundError();
    }
    if (event.status === "VOIDED") {
      throw new FixedAssetEventVoidedError();
    }
    if (!VOIDABLE_EVENTS.includes(event.event_type)) {
      throw new FixedAssetEventNotVoidableError();
    }

    const idempotencyKey = input.idempotency_key ?? `void-${generateIdempotencyKey()}`;
    const existingEvent = await findExistingEventByIdempotencyKey(connection, companyId, idempotencyKey);
    if (existingEvent) {
      return {
        void_event_id: existingEvent.id,
        original_event_id: eventId,
        journal_batch_id: existingEvent.journal_batch_id,
        duplicate: true
      };
    }

    await ensureDateWithinOpenFiscalYearWithExecutor(connection, companyId, formatDateOnly(new Date()));

    let journalBatchId: number | null = null;

    if (event.journal_batch_id) {
      journalBatchId = await postVoidToJournal(connection, companyId, eventId, event.asset_id, event.outlet_id, formatDateOnly(new Date()));
    }

    const voidEventId = await insertEvent(
      connection,
      companyId,
      event.asset_id,
      FA_VOID,
      formatDateOnly(new Date()),
      event.outlet_id,
      journalBatchId,
      "POSTED",
      idempotencyKey,
      {
        original_event_id: eventId,
        void_reason: input.void_reason
      },
      actor.userId
    );

    await connection.execute<ResultSetHeader>(
      `UPDATE fixed_asset_events SET status = 'VOIDED', voided_by = ?, voided_at = NOW() WHERE id = ?`,
      [actor.userId, eventId]
    );

    if (event.event_type === FA_DISPOSAL) {
      await connection.execute<ResultSetHeader>(
        `UPDATE fixed_assets SET disposed_at = NULL WHERE id = ?`,
        [event.asset_id]
      );

      const originalData = typeof event.event_data === "string"
        ? JSON.parse(event.event_data)
        : event.event_data;
      const book = await findAssetBookWithExecutor(connection, event.asset_id);
      if (book) {
        await updateAssetBook(
          connection,
          companyId,
          event.asset_id,
          Number(originalData.cost_removed) || 0,
          Number(originalData.depr_removed) || 0,
          Number(originalData.impairment_removed) || 0,
          Number(originalData.cost_removed) || 0,
          formatDateOnly(new Date()),
          voidEventId
        );
      }
    }

    return {
      void_event_id: voidEventId,
      original_event_id: eventId,
      journal_batch_id: journalBatchId,
      duplicate: false
    };
  });
}

async function postVoidToJournal(
  executor: QueryExecutor,
  companyId: number,
  originalEventId: number,
  assetId: number,
  outletId: number | null,
  eventDate: string
): Promise<number> {
  await ensureDateWithinOpenFiscalYearWithExecutor(executor, companyId, eventDate);

  const [batchResult] = await executor.execute<ResultSetHeader>(
    `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at) VALUES (?, ?, ?, ?, ?)`,
    [companyId, outletId, FA_VOID, originalEventId, eventDate]
  );
  const journalBatchId = Number(batchResult.insertId);

  const [originalLines] = await executor.execute<RowDataPacket[]>(
    `SELECT account_id, debit, credit FROM journal_lines WHERE journal_batch_id = (SELECT journal_batch_id FROM fixed_asset_events WHERE id = ?)`,
    [originalEventId]
  );

  for (const line of originalLines) {
    const debit = Number(line.credit);
    const credit = Number(line.debit);
    if (debit > 0 || credit > 0) {
      await executor.execute(
        `INSERT INTO journal_lines (journal_batch_id, company_id, outlet_id, account_id, line_date, debit, credit, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [journalBatchId, companyId, outletId, line.account_id, eventDate, debit, credit, `Void of event ${originalEventId}`]
      );
    }
  }

  return journalBatchId;
}

export interface LedgerEntry {
  id: number;
  event_type: string;
  event_date: string;
  journal_batch_id: number | null;
  status: string;
  event_data: Record<string, unknown>;
}

export interface LedgerResult {
  asset_id: number;
  events: LedgerEntry[];
}

export async function getAssetLedger(companyId: number, assetId: number): Promise<LedgerResult> {
  const pool = getDbPool();

  const asset = await findFixedAssetWithExecutor(pool, companyId, assetId);
  if (!asset) {
    throw new FixedAssetNotFoundError();
  }

  const [rows] = await pool.execute<FixedAssetEventRow[]>(
    `SELECT id, company_id, asset_id, event_type, event_date, outlet_id, journal_batch_id, status, idempotency_key, event_data, created_at, created_by, voided_by, voided_at
     FROM fixed_asset_events WHERE asset_id = ? ORDER BY event_date ASC, id ASC`,
    [assetId]
  );

  const events: LedgerEntry[] = rows.map((row) => ({
    id: row.id,
    event_type: row.event_type,
    event_date: formatDateOnly(row.event_date),
    journal_batch_id: row.journal_batch_id,
    status: row.status,
    event_data: typeof row.event_data === "string" ? JSON.parse(row.event_data) : row.event_data
  }));

  return { asset_id: assetId, events };
}

export interface BookResult {
  asset_id: number;
  cost_basis: number;
  accum_depreciation: number;
  accum_impairment: number;
  carrying_amount: number;
  as_of_date: string;
  last_event_id: number;
}

export async function getAssetBook(companyId: number, assetId: number): Promise<BookResult> {
  const pool = getDbPool();

  const asset = await findFixedAssetWithExecutor(pool, companyId, assetId);
  if (!asset) {
    throw new FixedAssetNotFoundError();
  }

  const book = await findAssetBookWithExecutor(pool, assetId);
  if (!book) {
    return {
      asset_id: assetId,
      cost_basis: 0,
      accum_depreciation: 0,
      accum_impairment: 0,
      carrying_amount: 0,
      as_of_date: "",
      last_event_id: 0
    };
  }

  return {
    asset_id: book.asset_id,
    cost_basis: Number(book.cost_basis),
    accum_depreciation: Number(book.accum_depreciation),
    accum_impairment: Number(book.accum_impairment),
    carrying_amount: Number(book.carrying_amount),
    as_of_date: formatDateOnly(book.as_of_date),
    last_event_id: book.last_event_id
  };
}
