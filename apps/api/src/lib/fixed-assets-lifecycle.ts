// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import { getDb, type KyselySchema } from "./db";
import { postDepreciationRunToJournal } from "./depreciation-posting";
import { ensureUserHasOutletAccess as commonUtilsEnsureUserHasOutletAccess } from "./shared/common-utils.js";

const FA_ACQUISITION = "ACQUISITION";
const FA_DEPRECIATION = "DEPRECIATION";
const FA_TRANSFER = "TRANSFER";
const FA_IMPAIRMENT = "IMPAIRMENT";
const FA_DISPOSAL = "DISPOSAL";
const FA_VOID = "VOID";

function isAcquisitionType(t: string): boolean { return t === "ACQUISITION" || t === "FA_ACQUISITION"; }
function isDepreciationType(t: string): boolean { return t === "DEPRECIATION" || t === "FA_DEPRECIATION"; }
function isImpairmentType(t: string): boolean { return t === "IMPAIRMENT" || t === "FA_IMPAIRMENT"; }
function isDisposalType(t: string): boolean { return t === "DISPOSAL" || t === "FA_DISPOSAL"; }

type FixedAssetRow = {
  id: number;
  company_id: number;
  outlet_id: number | null;
  name: string;
  purchase_cost: string | number | null;
  disposed_at: Date | string | null;
};

type FixedAssetBookRow = {
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

type FixedAssetEventRow = {
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
  created_at: Date | string;
  created_by: number;
  voided_by: number | null;
  voided_at: Date | string | null;
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

async function withTransaction<T>(operation: (trx: KyselySchema) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction().execute(operation);
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
  db: KyselySchema,
  companyId: number,
  outletId: number
): Promise<void> {
  const row = await db
    .selectFrom("outlets")
    .where("id", "=", outletId)
    .where("company_id", "=", companyId)
    .limit(1)
    .select("id")
    .executeTakeFirst();
  if (!row) {
    throw new FixedAssetLifecycleError("Outlet not found for company", "INVALID_REFERENCE");
  }
}

async function ensureCompanyAccountExists(
  db: KyselySchema,
  companyId: number,
  accountId: number
): Promise<void> {
  const row = await db
    .selectFrom("accounts")
    .where("id", "=", accountId)
    .where("company_id", "=", companyId)
    .limit(1)
    .select("id")
    .executeTakeFirst();
  if (!row) {
    throw new FixedAssetLifecycleError("Account not found for company", "INVALID_REFERENCE");
  }
}

async function ensureUserHasOutletAccess(
  db: KyselySchema,
  userId: number,
  companyId: number,
  outletId: number
): Promise<void> {
  const row = await db
    .selectFrom("users as u")
    .where("u.id", "=", userId)
    .where("u.company_id", "=", companyId)
    .where("u.is_active", "=", 1)
    .where((eb) => eb.or([
      eb.exists(
        eb.selectFrom("user_role_assignments as ura")
          .innerJoin("roles as r", "r.id", "ura.role_id")
          .where("ura.user_id", "=", userId)
          .where("r.is_global", "=", 1)
          .where("ura.outlet_id", "is", null)
      ),
      eb.exists(
        eb.selectFrom("user_role_assignments as ura")
          .where("ura.user_id", "=", userId)
          .where("ura.outlet_id", "=", outletId)
      )
    ]))
    .limit(1)
    .select("u.id")
    .executeTakeFirst();
  if (!row) {
    throw new FixedAssetLifecycleError("User cannot access outlet", "FORBIDDEN");
  }
}

async function findFixedAssetWithExecutor(
  db: KyselySchema,
  companyId: number,
  assetId: number
): Promise<FixedAssetRow | null> {
  const row = await db
    .selectFrom("fixed_assets")
    .where("company_id", "=", companyId)
    .where("id", "=", assetId)
    .limit(1)
    .select(["id", "company_id", "outlet_id", "name", "purchase_cost", "disposed_at"])
    .executeTakeFirst();
  return row ?? null;
}

async function findAssetBookWithExecutor(
  db: KyselySchema,
  assetId: number
): Promise<FixedAssetBookRow | null> {
  const row = await db
    .selectFrom("fixed_asset_books")
    .where("asset_id", "=", assetId)
    .limit(1)
    .select(["id", "company_id", "asset_id", "cost_basis", "accum_depreciation", "accum_impairment", "carrying_amount", "as_of_date", "last_event_id"])
    .executeTakeFirst();
  return row ?? null;
}

async function findEventByIdWithExecutor(
  db: KyselySchema,
  companyId: number,
  eventId: number
): Promise<FixedAssetEventRow | null> {
  const row = await db
    .selectFrom("fixed_asset_events")
    .where("company_id", "=", companyId)
    .where("id", "=", eventId)
    .limit(1)
    .select(["id", "company_id", "asset_id", "event_type", "event_date", "outlet_id", "journal_batch_id", "status", "idempotency_key", "event_data", "created_at", "created_by", "voided_by", "voided_at"])
    .executeTakeFirst();
  if (!row) return null;
  return {
    ...row,
    event_data: typeof row.event_data === "string" ? JSON.parse(row.event_data) : row.event_data
  };
}

async function findExistingEventByIdempotencyKey(
  db: KyselySchema,
  companyId: number,
  idempotencyKey: string
): Promise<FixedAssetEventRow | null> {
  const row = await db
    .selectFrom("fixed_asset_events")
    .where("company_id", "=", companyId)
    .where("idempotency_key", "=", idempotencyKey)
    .limit(1)
    .select(["id", "company_id", "asset_id", "event_type", "event_date", "outlet_id", "journal_batch_id", "status", "idempotency_key", "event_data", "created_at", "created_by", "voided_by", "voided_at"])
    .executeTakeFirst();
  if (!row) return null;
  return {
    ...row,
    event_data: typeof row.event_data === "string" ? JSON.parse(row.event_data) : row.event_data
  };
}

async function insertEvent(
  db: KyselySchema,
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
  const result = await db
    .insertInto("fixed_asset_events")
    .values({
      company_id: companyId,
      asset_id: assetId,
      event_type: eventType,
      event_date: eventDate as any,
      outlet_id: outletId,
      journal_batch_id: journalBatchId,
      status: status,
      idempotency_key: idempotencyKey,
      event_data: JSON.stringify(eventData),
      created_by: createdBy
    })
    .executeTakeFirst();
  return Number(result.insertId);
}

async function updateAssetBook(
  db: KyselySchema,
  companyId: number,
  assetId: number,
  costBasis: number,
  accumDepreciation: number,
  accumImpairment: number,
  carryingAmount: number,
  asOfDate: string,
  lastEventId: number
): Promise<void> {
  const existing = await findAssetBookWithExecutor(db, assetId);
  if (existing) {
    await db
      .updateTable("fixed_asset_books")
      .set({
        cost_basis: costBasis,
        accum_depreciation: accumDepreciation,
        accum_impairment: accumImpairment,
        carrying_amount: carryingAmount,
        as_of_date: asOfDate as any,
        last_event_id: lastEventId
      })
      .where("asset_id", "=", assetId)
      .execute();
  } else {
    await db
      .insertInto("fixed_asset_books")
      .values({
        company_id: companyId,
        asset_id: assetId,
        cost_basis: costBasis,
        accum_depreciation: accumDepreciation,
        accum_impairment: accumImpairment,
        carrying_amount: carryingAmount,
        as_of_date: asOfDate as any,
        last_event_id: lastEventId
      })
      .execute();
  }
}

async function markAssetDisposed(
  db: KyselySchema,
  assetId: number,
  disposedAt: Date
): Promise<void> {
  await db
    .updateTable("fixed_assets")
    .set({ disposed_at: disposedAt as any })
    .where("id", "=", assetId)
    .execute();
}

interface DisposalSnapshot {
  proceeds: number;
  cost_removed: number;
  gain_loss: number;
}

async function findDisposalSnapshotByEventId(
  db: KyselySchema,
  companyId: number,
  eventId: number
): Promise<DisposalSnapshot | null> {
  const row = await db
    .selectFrom("fixed_asset_disposals")
    .where("company_id", "=", companyId)
    .where("event_id", "=", eventId)
    .select(["proceeds", "cost_removed", "gain_loss"])
    .executeTakeFirst();
  if (!row) return null;
  return {
    proceeds: Number(row.proceeds),
    cost_removed: Number(row.cost_removed),
    gain_loss: Number(row.gain_loss)
  };
}

function ensureDateWithinOpenFiscalYear(
  db: KyselySchema,
  companyId: number,
  eventDate: string
): Promise<void> {
  return ensureDateWithinOpenFiscalYearWithExecutor(db, companyId, eventDate);
}

async function ensureDateWithinOpenFiscalYearWithExecutor(
  db: KyselySchema,
  companyId: number,
  eventDate: string
): Promise<void> {
  const row = await db
    .selectFrom("fiscal_years")
    .where("company_id", "=", companyId)
    .where("start_date", "<=", eventDate as any)
    .where("end_date", ">=", eventDate as any)
    .where("status", "=", "OPEN")
    .limit(1)
    .select("id")
    .executeTakeFirst();
  if (!row) {
    throw new FixedAssetLifecycleError("Event date is outside any open fiscal year", "FISCAL_YEAR_CLOSED");
  }
}

function assertJournalBalanced(lines: Array<{ debit: number; credit: number }>): void {
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new FixedAssetLifecycleError(
      `Journal not balanced: debit=${totalDebit}, credit=${totalCredit}`,
      "JOURNAL_UNBALANCED"
    );
  }
}

async function ensureUserCanAccessAssetOutlet(
  db: KyselySchema,
  userId: number,
  companyId: number,
  assetId: number
): Promise<void> {
  const asset = await findFixedAssetWithExecutor(db, companyId, assetId);
  if (!asset) {
    throw new FixedAssetNotFoundError();
  }

  if (asset.outlet_id) {
    try {
      await ensureUserHasOutletAccess(db, userId, companyId, asset.outlet_id);
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === "FORBIDDEN") throw new FixedAssetNotFoundError();
      throw error;
    }
  }
}

async function insertEventWithIdempotency(
  db: KyselySchema,
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
): Promise<{ eventId: number; isDuplicate: boolean }> {
  try {
    const eventId = await insertEvent(
      db,
      companyId,
      assetId,
      eventType,
      eventDate,
      outletId,
      journalBatchId,
      status,
      idempotencyKey,
      eventData,
      createdBy
    );
    return { eventId, isDuplicate: false };
  } catch (error) {
    if (isMysqlError(error) && error.errno === 1062) {
      const existing = await findExistingEventByIdempotencyKey(db, companyId, idempotencyKey);
      if (existing) {
        return { eventId: existing.id, isDuplicate: true };
      }
    }
    throw error;
  }
}

async function attachJournalBatchToEvent(
  db: KyselySchema,
  eventId: number,
  journalBatchId: number | null
): Promise<void> {
  if (journalBatchId) {
    await db
      .updateTable("fixed_asset_events")
      .set({ journal_batch_id: journalBatchId })
      .where("id", "=", eventId)
      .execute();
  }
}

async function recomputeAssetBookFromEvents(
  db: KyselySchema,
  companyId: number,
  assetId: number
): Promise<{
  cost_basis: number;
  accum_depreciation: number;
  accum_impairment: number;
  carrying_amount: number;
  disposed_at: string | null;
}> {
  const events = await db
    .selectFrom("fixed_asset_events")
    .where("company_id", "=", companyId)
    .where("asset_id", "=", assetId)
    .where("status", "=", "POSTED")
    .orderBy("event_date", "asc")
    .orderBy("id", "asc")
    .select(["id", "company_id", "asset_id", "event_type", "event_date", "outlet_id", "journal_batch_id", "status", "idempotency_key", "event_data", "created_at", "created_by", "voided_by", "voided_at"])
    .execute();

  let costBasis = 0;
  let acquisitionSalvage = 0;
  let accumDepr = 0;
  let accumImpairment = 0;
  let disposedAt: Date | null = null;

  for (const event of events) {
    const data = typeof event.event_data === "string" ? JSON.parse(event.event_data) : event.event_data;
    const eventType = event.event_type;
    
    if (isAcquisitionType(eventType)) {
      costBasis = Number((data as Record<string, unknown>).cost ?? 0);
      acquisitionSalvage = normalizeMoney(Number((data as Record<string, unknown>).salvage_value ?? 0));
      accumDepr = 0;
      accumImpairment = 0;
      disposedAt = null;
    } else if (isDepreciationType(eventType)) {
      accumDepr = normalizeMoney(accumDepr + Number((data as Record<string, unknown>).amount ?? 0));
    } else if (isImpairmentType(eventType)) {
      accumImpairment = normalizeMoney(accumImpairment + Number((data as Record<string, unknown>).impairment_amount ?? 0));
    } else if (isDisposalType(eventType)) {
      disposedAt = event.event_date ? new Date(event.event_date) : null;
    }
  }

  if (disposedAt) {
    return {
      cost_basis: 0,
      accum_depreciation: 0,
      accum_impairment: 0,
      carrying_amount: 0,
      disposed_at: disposedAt.toISOString()
    };
  }

  const carryingAmount = normalizeMoney(Math.max(0, costBasis - acquisitionSalvage - accumDepr - accumImpairment));
  return {
    cost_basis: normalizeMoney(costBasis),
    accum_depreciation: normalizeMoney(accumDepr),
    accum_impairment: normalizeMoney(accumImpairment),
    carrying_amount: carryingAmount,
    disposed_at: null
  };
}

export interface AcquisitionInput {
  outlet_id?: number;
  event_date: string;
  cost: number;
  useful_life_months: number;
  salvage_value?: number;
  asset_account_id: number;
  offset_account_id: number;
  expense_account_id?: number;
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
  return withTransaction(async (trx) => {
    const asset = await findFixedAssetWithExecutor(trx, companyId, assetId);
    if (!asset) {
      throw new FixedAssetNotFoundError();
    }
    if (asset.disposed_at) {
      throw new FixedAssetDisposedError();
    }

    await ensureUserCanAccessAssetOutlet(trx, actor.userId, companyId, assetId);

    const idempotencyKey = input.idempotency_key ?? generateIdempotencyKey();
    const existingEvent = await findExistingEventByIdempotencyKey(trx, companyId, idempotencyKey);
    if (existingEvent) {
      if (Number(existingEvent.asset_id) !== assetId) {
        throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
      }
      if (!isAcquisitionType(existingEvent.event_type)) {
        throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
      }
      const book = await findAssetBookWithExecutor(trx, assetId);
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

    await ensureDateWithinOpenFiscalYearWithExecutor(trx, companyId, input.event_date);
    await ensureCompanyAccountExists(trx, companyId, input.asset_account_id);
    await ensureCompanyAccountExists(trx, companyId, input.offset_account_id);

    let outletId = input.outlet_id ?? asset.outlet_id ?? null;
    if (typeof outletId === "number") {
      await ensureCompanyOutletExists(trx, companyId, outletId);
      try {
        await ensureUserHasOutletAccess(trx, actor.userId, companyId, outletId);
      } catch (error) {
        const err = error as { code?: string };
        if (err.code === "FORBIDDEN") throw new FixedAssetNotFoundError();
        throw error;
      }
    }

    const salvageValue = input.salvage_value ?? 0;
    if (salvageValue > input.cost) {
      throw new FixedAssetLifecycleError("Salvage value cannot exceed cost", "INVALID_REFERENCE");
    }
    const carryingAmount = normalizeMoney(input.cost - salvageValue);

    // Reserve event first for idempotency
    const eventIdResult = await insertEventWithIdempotency(
      trx,
      companyId,
      assetId,
      FA_ACQUISITION,
      input.event_date,
      outletId,
      null,
      "POSTED",
      idempotencyKey,
      {
        cost: input.cost,
        useful_life_months: input.useful_life_months,
        salvage_value: salvageValue,
        asset_account_id: input.asset_account_id,
        offset_account_id: input.offset_account_id,
        notes: input.notes
      },
      actor.userId
    );

    if (eventIdResult.isDuplicate) {
      const dupEvent = await findExistingEventByIdempotencyKey(trx, companyId, idempotencyKey);
      if (dupEvent) {
        if (Number(dupEvent.asset_id) !== assetId) {
          throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
        }
        if (!isAcquisitionType(dupEvent.event_type)) {
          throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
        }
        const book = await findAssetBookWithExecutor(trx, assetId);
        return {
          event_id: dupEvent.id,
          journal_batch_id: dupEvent.journal_batch_id ?? 0,
          book: {
            cost_basis: book ? Number(book.cost_basis) : 0,
            carrying_amount: book ? Number(book.carrying_amount) : 0
          },
          duplicate: true
        };
      }
      throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
    }

    // Post journal after event reservation
    const journalBatchId = await postAcquisitionToJournal(
      trx,
      companyId,
      assetId,
      outletId,
      input.event_date,
      input.cost,
      input.asset_account_id,
      input.offset_account_id
    );

    await attachJournalBatchToEvent(trx, eventIdResult.eventId, journalBatchId);

    await updateAssetBook(
      trx,
      companyId,
      assetId,
      input.cost,
      0,
      0,
      carryingAmount,
      input.event_date,
      eventIdResult.eventId
    );

    return {
      event_id: eventIdResult.eventId,
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
  db: KyselySchema,
  companyId: number,
  assetId: number,
  outletId: number | null,
  eventDate: string,
  cost: number,
  assetAccountId: number,
  offsetAccountId: number
): Promise<number> {
  await ensureDateWithinOpenFiscalYearWithExecutor(db, companyId, eventDate);

  const batchResult = await db
    .insertInto("journal_batches")
    .values({
      company_id: companyId,
      outlet_id: outletId,
      doc_type: FA_ACQUISITION,
      doc_id: assetId,
      posted_at: eventDate as any
    })
    .executeTakeFirst();
  const journalBatchId = Number(batchResult.insertId);

  assertJournalBalanced([
    { debit: cost, credit: 0 },
    { debit: 0, credit: cost }
  ]);

  await db
    .insertInto("journal_lines")
    .values([
      {
        journal_batch_id: journalBatchId,
        company_id: companyId,
        outlet_id: outletId,
        account_id: assetAccountId,
        line_date: eventDate as any,
        debit: cost,
        credit: 0,
        description: "Fixed Asset Acquisition - Cost"
      },
      {
        journal_batch_id: journalBatchId,
        company_id: companyId,
        outlet_id: outletId,
        account_id: offsetAccountId,
        line_date: eventDate as any,
        debit: 0,
        credit: cost,
        description: "Fixed Asset Acquisition - Offset"
      }
    ])
    .execute();

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
  return withTransaction(async (trx) => {
    const asset = await findFixedAssetWithExecutor(trx, companyId, assetId);
    if (!asset) {
      throw new FixedAssetNotFoundError();
    }
    if (asset.disposed_at) {
      throw new FixedAssetDisposedError();
    }

    const fromOutletId = asset.outlet_id;
    if (fromOutletId) {
      try {
        await ensureUserHasOutletAccess(trx, actor.userId, companyId, fromOutletId);
      } catch (error) {
        const err = error as { code?: string };
        if (err.code === "FORBIDDEN") throw new FixedAssetNotFoundError();
        throw error;
      }
    }

    const idempotencyKey = input.idempotency_key ?? generateIdempotencyKey();
    const existingEvent = await findExistingEventByIdempotencyKey(trx, companyId, idempotencyKey);
    if (existingEvent) {
      if (Number(existingEvent.asset_id) !== assetId) {
        throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
      }
      if (existingEvent.event_type !== FA_TRANSFER) {
        throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
      }
      const eventData = typeof existingEvent.event_data === "string" 
        ? JSON.parse(existingEvent.event_data) 
        : existingEvent.event_data;
      const toOutletId = (eventData as Record<string, unknown>).to_outlet_id;
      if (typeof toOutletId !== "number") {
        throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
      }
      return {
        event_id: existingEvent.id,
        journal_batch_id: existingEvent.journal_batch_id,
        to_outlet_id: toOutletId,
        duplicate: true
      };
    }

    await ensureDateWithinOpenFiscalYearWithExecutor(trx, companyId, input.transfer_date);
    await ensureCompanyOutletExists(trx, companyId, input.to_outlet_id);
    try {
      await ensureUserHasOutletAccess(trx, actor.userId, companyId, input.to_outlet_id);
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === "FORBIDDEN") throw new FixedAssetNotFoundError();
      throw error;
    }

    const toOutletId = input.to_outlet_id;

    // Reserve event first for idempotency
    const eventIdResult = await insertEventWithIdempotency(
      trx,
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

    if (eventIdResult.isDuplicate) {
      const dupEvent = await findExistingEventByIdempotencyKey(trx, companyId, idempotencyKey);
      if (dupEvent) {
        if (Number(dupEvent.asset_id) !== assetId) {
          throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
        }
        if (dupEvent.event_type !== FA_TRANSFER) {
          throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
        }
        const eventData = typeof dupEvent.event_data === "string" 
          ? JSON.parse(dupEvent.event_data) 
          : dupEvent.event_data;
        const toOutletId = (eventData as Record<string, unknown>).to_outlet_id;
        if (typeof toOutletId !== "number") {
          throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
        }
        return {
          event_id: eventIdResult.eventId,
          journal_batch_id: dupEvent.journal_batch_id,
          to_outlet_id: toOutletId,
          duplicate: true
        };
      }
      throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
    }

    // Update asset outlet after successful event reservation
    await trx
      .updateTable("fixed_assets")
      .set({ outlet_id: toOutletId })
      .where("id", "=", assetId)
      .execute();

    return {
      event_id: eventIdResult.eventId,
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
  accum_impairment_account_id: number;
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
  return withTransaction(async (trx) => {
    const asset = await findFixedAssetWithExecutor(trx, companyId, assetId);
    if (!asset) {
      throw new FixedAssetNotFoundError();
    }
    if (asset.disposed_at) {
      throw new FixedAssetDisposedError();
    }

    await ensureUserCanAccessAssetOutlet(trx, actor.userId, companyId, assetId);

    const book = await findAssetBookWithExecutor(trx, assetId);
    if (!book) {
      throw new FixedAssetLifecycleError("Asset has no book value - must acquire first", "INVALID_STATE");
    }

    const idempotencyKey = input.idempotency_key ?? generateIdempotencyKey();
    const existingEvent = await findExistingEventByIdempotencyKey(trx, companyId, idempotencyKey);
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

    await ensureDateWithinOpenFiscalYearWithExecutor(trx, companyId, input.impairment_date);
    await ensureCompanyAccountExists(trx, companyId, input.expense_account_id);
    await ensureCompanyAccountExists(trx, companyId, input.accum_impairment_account_id);

    const currentCarryingAmount = Number(book.carrying_amount);
    const newImpairment = Math.min(input.impairment_amount, currentCarryingAmount);
    const newCarryingAmount = normalizeMoney(currentCarryingAmount - newImpairment);
    const newAccumImpairment = Number(book.accum_impairment) + newImpairment;

    // Reserve event first for idempotency
    const eventIdResult = await insertEventWithIdempotency(
      trx,
      companyId,
      assetId,
      FA_IMPAIRMENT,
      input.impairment_date,
      asset.outlet_id,
      null,
      "POSTED",
      idempotencyKey,
      {
        impairment_amount: newImpairment,
        reason: input.reason,
        expense_account_id: input.expense_account_id,
        accum_impairment_account_id: input.accum_impairment_account_id
      },
      actor.userId
    );

    if (eventIdResult.isDuplicate) {
      const dupEvent = await findExistingEventByIdempotencyKey(trx, companyId, idempotencyKey);
      if (dupEvent) {
        const book = await findAssetBookWithExecutor(trx, assetId);
        return {
          event_id: dupEvent.id,
          journal_batch_id: dupEvent.journal_batch_id ?? 0,
          book: {
            carrying_amount: book ? Number(book.carrying_amount) : 0,
            accum_impairment: book ? Number(book.accum_impairment) : 0
          },
          duplicate: true
        };
      }
      throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
    }

    // Post journal after event reservation
    const journalBatchId = await postImpairmentToJournal(
      trx,
      companyId,
      assetId,
      asset.outlet_id,
      input.impairment_date,
      newImpairment,
      input.expense_account_id,
      input.accum_impairment_account_id
    );

    await attachJournalBatchToEvent(trx, eventIdResult.eventId, journalBatchId);

    await updateAssetBook(
      trx,
      companyId,
      assetId,
      Number(book.cost_basis),
      Number(book.accum_depreciation),
      newAccumImpairment,
      newCarryingAmount,
      input.impairment_date,
      eventIdResult.eventId
    );

    return {
      event_id: eventIdResult.eventId,
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
  db: KyselySchema,
  companyId: number,
  assetId: number,
  outletId: number | null,
  eventDate: string,
  impairmentAmount: number,
  expenseAccountId: number,
  accumImpairmentAccountId: number
): Promise<number> {
  await ensureDateWithinOpenFiscalYearWithExecutor(db, companyId, eventDate);

  const batchResult = await db
    .insertInto("journal_batches")
    .values({
      company_id: companyId,
      outlet_id: outletId,
      doc_type: FA_IMPAIRMENT,
      doc_id: assetId,
      posted_at: eventDate as any
    })
    .executeTakeFirst();
  const journalBatchId = Number(batchResult.insertId);

  assertJournalBalanced([
    { debit: impairmentAmount, credit: 0 },
    { debit: 0, credit: impairmentAmount }
  ]);

  await db
    .insertInto("journal_lines")
    .values([
      {
        journal_batch_id: journalBatchId,
        company_id: companyId,
        outlet_id: outletId,
        account_id: expenseAccountId,
        line_date: eventDate as any,
        debit: impairmentAmount,
        credit: 0,
        description: "Fixed Asset Impairment - Expense"
      },
      {
        journal_batch_id: journalBatchId,
        company_id: companyId,
        outlet_id: outletId,
        account_id: accumImpairmentAccountId,
        line_date: eventDate as any,
        debit: 0,
        credit: impairmentAmount,
        description: "Fixed Asset Impairment - Accum"
      }
    ])
    .execute();

  return journalBatchId;
}

export interface DisposalInput {
  disposal_date: string;
  disposal_type: "SALE" | "SCRAP";
  proceeds?: number;
  disposal_cost?: number;
  cash_account_id: number;
  asset_account_id: number;
  accum_depr_account_id: number;
  accum_impairment_account_id?: number;
  gain_account_id?: number;
  loss_account_id?: number;
  disposal_expense_account_id?: number;
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
  return withTransaction(async (trx) => {
    const asset = await findFixedAssetWithExecutor(trx, companyId, assetId);
    if (!asset) {
      throw new FixedAssetNotFoundError();
    }

    await ensureUserCanAccessAssetOutlet(trx, actor.userId, companyId, assetId);

    const idempotencyKey = input.idempotency_key ?? generateIdempotencyKey();
    const existingEvent = await findExistingEventByIdempotencyKey(trx, companyId, idempotencyKey);
    if (existingEvent) {
      if (Number(existingEvent.asset_id) !== assetId) {
        throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
      }
      const book = await findAssetBookWithExecutor(trx, assetId);
      const snapshot = await findDisposalSnapshotByEventId(trx, companyId, existingEvent.id);
      if (snapshot) {
        return {
          event_id: existingEvent.id,
          journal_batch_id: existingEvent.journal_batch_id ?? 0,
          disposal: {
            proceeds: snapshot.proceeds,
            cost_removed: snapshot.cost_removed,
            gain_loss: snapshot.gain_loss
          },
          book: { carrying_amount: book ? Number(book.carrying_amount) : 0 },
          duplicate: true
        };
      }
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
        book: { carrying_amount: book ? Number(book.carrying_amount) : 0 },
        duplicate: true
      };
    }

    if (asset.disposed_at) {
      throw new FixedAssetDisposedError();
    }

    const book = await findAssetBookWithExecutor(trx, assetId);
    if (!book) {
      throw new FixedAssetLifecycleError("Asset has no book value - must acquire first", "INVALID_STATE");
    }

    await ensureDateWithinOpenFiscalYearWithExecutor(trx, companyId, input.disposal_date);
    await ensureCompanyAccountExists(trx, companyId, input.cash_account_id);
    await ensureCompanyAccountExists(trx, companyId, input.asset_account_id);
    await ensureCompanyAccountExists(trx, companyId, input.accum_depr_account_id);
    if (input.accum_impairment_account_id) {
      await ensureCompanyAccountExists(trx, companyId, input.accum_impairment_account_id);
    }
    if (input.gain_account_id) {
      await ensureCompanyAccountExists(trx, companyId, input.gain_account_id);
    }
    if (input.loss_account_id) {
      await ensureCompanyAccountExists(trx, companyId, input.loss_account_id);
    }
    if (input.disposal_expense_account_id) {
      await ensureCompanyAccountExists(trx, companyId, input.disposal_expense_account_id);
    }

    const proceeds = input.proceeds ?? 0;
    const disposalCost = input.disposal_cost ?? 0;
    const costBasis = Number(book.cost_basis);
    const accumDepreciation = Number(book.accum_depreciation);
    const accumImpairment = Number(book.accum_impairment);

    // NBV from components (GL-derived)
    const nbv = costBasis - accumDepreciation - accumImpairment;

    let gainLoss: number;
    if (input.disposal_type === "SALE") {
      gainLoss = normalizeMoney(proceeds - nbv);
    } else {
      gainLoss = normalizeMoney(-nbv);
    }

    if (accumImpairment > 0 && !input.accum_impairment_account_id) {
      throw new FixedAssetLifecycleError("Accumulated impairment account required when asset has impairment", "INVALID_REFERENCE");
    }
    if (gainLoss > 0 && !input.gain_account_id) {
      throw new FixedAssetLifecycleError("Gain account required when disposal results in gain", "INVALID_REFERENCE");
    }
    if (gainLoss < 0 && !input.loss_account_id) {
      throw new FixedAssetLifecycleError("Loss account required when disposal results in loss", "INVALID_REFERENCE");
    }
    if (disposalCost > 0 && !input.disposal_expense_account_id) {
      throw new FixedAssetLifecycleError("Disposal expense account required when there are disposal costs", "INVALID_REFERENCE");
    }

    // Reserve event first for idempotency
    const eventIdResult = await insertEventWithIdempotency(
      trx,
      companyId,
      assetId,
      FA_DISPOSAL,
      input.disposal_date,
      asset.outlet_id,
      null,
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
        asset_account_id: input.asset_account_id,
        accum_depr_account_id: input.accum_depr_account_id,
        accum_impairment_account_id: input.accum_impairment_account_id,
        gain_account_id: input.gain_account_id,
        loss_account_id: input.loss_account_id,
        disposal_expense_account_id: input.disposal_expense_account_id,
        notes: input.notes
      },
      actor.userId
    );

    if (eventIdResult.isDuplicate) {
      const dupEvent = await findExistingEventByIdempotencyKey(trx, companyId, idempotencyKey);
      if (dupEvent) {
        if (Number(dupEvent.asset_id) !== assetId) {
          throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
        }
        const book = await findAssetBookWithExecutor(trx, assetId);
        const snapshot = await findDisposalSnapshotByEventId(trx, companyId, dupEvent.id);
        if (snapshot) {
          return {
            event_id: dupEvent.id,
            journal_batch_id: dupEvent.journal_batch_id ?? 0,
            disposal: {
              proceeds: snapshot.proceeds,
              cost_removed: snapshot.cost_removed,
              gain_loss: snapshot.gain_loss
            },
            book: { carrying_amount: book ? Number(book.carrying_amount) : 0 },
            duplicate: true
          };
        }
        const eventData = typeof dupEvent.event_data === "string" 
          ? JSON.parse(dupEvent.event_data) 
          : dupEvent.event_data;
        return {
          event_id: dupEvent.id,
          journal_batch_id: dupEvent.journal_batch_id ?? 0,
          disposal: {
            proceeds: (eventData as Record<string, unknown>).proceeds as number ?? 0,
            cost_removed: (eventData as Record<string, unknown>).cost_removed as number ?? 0,
            gain_loss: (eventData as Record<string, unknown>).gain_loss as number ?? 0
          },
          book: { carrying_amount: book ? Number(book.carrying_amount) : 0 },
          duplicate: true
        };
      }
      throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
    }

    // Post journal after event reservation
    const journalResult = await postDisposalToJournal(
      trx,
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
      input.cash_account_id,
      input.asset_account_id,
      input.accum_depr_account_id,
      input.accum_impairment_account_id,
      input.gain_account_id,
      input.loss_account_id,
      input.disposal_expense_account_id
    );

    await attachJournalBatchToEvent(trx, eventIdResult.eventId, journalResult.journalBatchId);

    // Use the actual posted gain/loss from the journal
    const postedGainLoss = journalResult.gainLoss;

    await trx
      .insertInto("fixed_asset_disposals")
      .values({
        company_id: companyId,
        event_id: eventIdResult.eventId,
        asset_id: assetId,
        proceeds: proceeds,
        cost_removed: costBasis,
        depr_removed: accumDepreciation,
        impairment_removed: accumImpairment,
        disposal_cost: disposalCost,
        gain_loss: postedGainLoss,
        disposal_type: input.disposal_type,
        notes: input.notes ?? null
      })
      .execute();

    await trx
      .updateTable("fixed_asset_events")
      .set({ event_data: JSON.stringify({ gain_loss: postedGainLoss }) })
      .where("id", "=", eventIdResult.eventId)
      .execute();

    await updateAssetBook(
      trx,
      companyId,
      assetId,
      0,
      0,
      0,
      0,
      input.disposal_date,
      eventIdResult.eventId
    );

    await markAssetDisposed(trx, assetId, new Date(input.disposal_date));

    return {
      event_id: eventIdResult.eventId,
      journal_batch_id: journalResult.journalBatchId,
      disposal: {
        proceeds,
        cost_removed: costBasis,
        gain_loss: postedGainLoss
      },
      book: { carrying_amount: 0 },
      duplicate: false
    };
  });
}

async function postDisposalToJournal(
  db: KyselySchema,
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
  cashAccountId: number,
  assetAccountId: number,
  accumDeprAccountId: number,
  accumImpairmentAccountId: number | undefined,
  gainAccountId: number | undefined,
  lossAccountId: number | undefined,
  disposalExpenseAccountId: number | undefined
): Promise<{ journalBatchId: number; gainLoss: number }> {
  await ensureDateWithinOpenFiscalYearWithExecutor(db, companyId, eventDate);

  const batchResult = await db
    .insertInto("journal_batches")
    .values({
      company_id: companyId,
      outlet_id: outletId,
      doc_type: FA_DISPOSAL,
      doc_id: assetId,
      posted_at: eventDate as any
    })
    .executeTakeFirst();
  const journalBatchId = Number(batchResult.insertId);

  interface JournalLine {
    journal_batch_id: number;
    company_id: number;
    outlet_id: number | null;
    account_id: number;
    line_date: any;
    debit: number;
    credit: number;
    description: string;
  }

  const lines: JournalLine[] = [];

  // Build base disposal lines
  if (disposalType === "SALE" && proceeds > 0) {
    lines.push({ journal_batch_id: journalBatchId, company_id: companyId, outlet_id: outletId, account_id: cashAccountId, line_date: eventDate as any, debit: proceeds, credit: 0, description: "Disposal Proceeds" });
  }

  if (accumDepreciation > 0) {
    lines.push({ journal_batch_id: journalBatchId, company_id: companyId, outlet_id: outletId, account_id: accumDeprAccountId, line_date: eventDate, debit: accumDepreciation, credit: 0, description: "Accumulated Depreciation Removed" });
  }

  if (accumImpairment > 0 && accumImpairmentAccountId) {
    lines.push({ journal_batch_id: journalBatchId, company_id: companyId, outlet_id: outletId, account_id: accumImpairmentAccountId, line_date: eventDate, debit: accumImpairment, credit: 0, description: "Accumulated Impairment Removed" });
  }

  if (costBasis > 0) {
    lines.push({ journal_batch_id: journalBatchId, company_id: companyId, outlet_id: outletId, account_id: assetAccountId, line_date: eventDate, debit: 0, credit: costBasis, description: "Fixed Asset Cost Removed" });
  }

  // Disposal cost is a separate expense + cash outflow
  if (disposalCost > 0 && disposalExpenseAccountId) {
    lines.push({ journal_batch_id: journalBatchId, company_id: companyId, outlet_id: outletId, account_id: disposalExpenseAccountId, line_date: eventDate, debit: disposalCost, credit: 0, description: "Disposal Costs" });
    lines.push({ journal_batch_id: journalBatchId, company_id: companyId, outlet_id: outletId, account_id: cashAccountId, line_date: eventDate, debit: 0, credit: disposalCost, description: "Disposal Costs Payment" });
  }

  // Calculate gain/loss from delta after base lines
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    totalDebit += line.debit;
    totalCredit += line.credit;
  }
  
  // Compute actual gain/loss from the delta
  const delta = totalDebit - totalCredit;
  let actualGainLoss = 0;
  
  if (delta !== 0) {
    if (delta > 0) {
      // Debit > Credit (debit-heavy) = gain to balance the journal (add credit)
      actualGainLoss = delta;
      if (gainAccountId) {
        lines.push({ journal_batch_id: journalBatchId, company_id: companyId, outlet_id: outletId, account_id: gainAccountId, line_date: eventDate, debit: 0, credit: actualGainLoss, description: "Gain on Disposal" });
      } else {
        throw new FixedAssetLifecycleError("Gain account required when disposal results in gain", "INVALID_REFERENCE");
      }
    } else {
      // Credit > Debit (credit-heavy) = loss to balance the journal (add debit)
      actualGainLoss = delta; // Already negative
      if (lossAccountId) {
        lines.push({ journal_batch_id: journalBatchId, company_id: companyId, outlet_id: outletId, account_id: lossAccountId, line_date: eventDate, debit: Math.abs(actualGainLoss), credit: 0, description: "Loss on Disposal" });
      } else {
        throw new FixedAssetLifecycleError("Loss account required when disposal results in loss", "INVALID_REFERENCE");
      }
    }
  }

  // Final balance check
  if (lines.length > 0) {
    const journalLines = lines.map(l => ({ debit: l.debit, credit: l.credit }));
    assertJournalBalanced(journalLines);

    await db.insertInto("journal_lines").values(lines).execute();
  }

  return { journalBatchId, gainLoss: actualGainLoss };
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

function isVoidableEventType(eventType: string): boolean {
  return isAcquisitionType(eventType) || isDisposalType(eventType);
}

export async function voidEvent(
  companyId: number,
  eventId: number,
  input: VoidEventInput,
  actor: MutationActor
): Promise<VoidResult> {
  return withTransaction(async (trx) => {
    const event = await findEventByIdWithExecutor(trx, companyId, eventId);
    if (!event) {
      throw new FixedAssetEventNotFoundError();
    }
    if (event.status === "VOIDED") {
      throw new FixedAssetEventVoidedError();
    }
    if (!isVoidableEventType(event.event_type)) {
      throw new FixedAssetEventNotVoidableError();
    }

    // Check outlet access for the event
    if (event.outlet_id) {
      try {
        await ensureUserHasOutletAccess(trx, actor.userId, companyId, event.outlet_id);
      } catch (error) {
        const err = error as { code?: string };
        if (err.code === "FORBIDDEN") throw new FixedAssetEventNotFoundError();
        throw error;
      }
    }

    const idempotencyKey = input.idempotency_key ?? `void-${generateIdempotencyKey()}`;
    const existingEvent = await findExistingEventByIdempotencyKey(trx, companyId, idempotencyKey);
    if (existingEvent) {
      return {
        void_event_id: existingEvent.id,
        original_event_id: eventId,
        journal_batch_id: existingEvent.journal_batch_id,
        duplicate: true
      };
    }

    await ensureDateWithinOpenFiscalYearWithExecutor(trx, companyId, formatDateOnly(new Date()));

    // Reserve void event first for idempotency
    const voidEventResult = await insertEventWithIdempotency(
      trx,
      companyId,
      event.asset_id,
      FA_VOID,
      formatDateOnly(new Date()),
      event.outlet_id,
      null,
      "POSTED",
      idempotencyKey,
      {
        original_event_id: eventId,
        void_reason: input.void_reason
      },
      actor.userId
    );

    if (voidEventResult.isDuplicate) {
      const dupVoidEvent = await findExistingEventByIdempotencyKey(trx, companyId, idempotencyKey);
      if (dupVoidEvent) {
        return {
          void_event_id: dupVoidEvent.id,
          original_event_id: eventId,
          journal_batch_id: dupVoidEvent.journal_batch_id,
          duplicate: true
        };
      }
      throw new FixedAssetLifecycleError("Idempotency conflict", "DUPLICATE_EVENT");
    }

    // Post reversal journal if original had journal batch
    let journalBatchId: number | null = null;
    if (event.journal_batch_id) {
      journalBatchId = await postVoidToJournal(trx, companyId, eventId, event.asset_id, event.outlet_id, formatDateOnly(new Date()));
    }

    await attachJournalBatchToEvent(trx, voidEventResult.eventId, journalBatchId);

    // Mark original event as voided
    await trx
      .updateTable("fixed_asset_events")
      .set({ 
        status: "VOIDED", 
        voided_by: actor.userId, 
        voided_at: new Date() 
      })
      .where("id", "=", eventId)
      .execute();

    // Recompute book from remaining posted events
    const recomputed = await recomputeAssetBookFromEvents(trx, companyId, event.asset_id);

    await updateAssetBook(
      trx,
      companyId,
      event.asset_id,
      recomputed.cost_basis,
      recomputed.accum_depreciation,
      recomputed.accum_impairment,
      recomputed.carrying_amount,
      formatDateOnly(new Date()),
      voidEventResult.eventId
    );

    await trx
      .updateTable("fixed_assets")
      .set({ disposed_at: recomputed.disposed_at ? formatDateOnly(recomputed.disposed_at) as any : null })
      .where("id", "=", event.asset_id)
      .execute();

    return {
      void_event_id: voidEventResult.eventId,
      original_event_id: eventId,
      journal_batch_id: journalBatchId,
      duplicate: false
    };
  });
}

async function postVoidToJournal(
  db: KyselySchema,
  companyId: number,
  originalEventId: number,
  assetId: number,
  outletId: number | null,
  eventDate: string
): Promise<number> {
  await ensureDateWithinOpenFiscalYearWithExecutor(db, companyId, eventDate);

  const batchResult = await db
    .insertInto("journal_batches")
    .values({
      company_id: companyId,
      outlet_id: outletId,
      doc_type: FA_VOID,
      doc_id: originalEventId,
      posted_at: eventDate as any
    })
    .executeTakeFirst();
  const journalBatchId = Number(batchResult.insertId);

  const originalLines = await db
    .selectFrom("journal_lines")
    .where("journal_batch_id", "=", 
      db.selectFrom("fixed_asset_events")
        .where("id", "=", originalEventId)
        .select("journal_batch_id")
    )
    .select(["account_id", "debit", "credit"])
    .execute();

  for (const line of originalLines) {
    const debit = Number(line.credit);
    const credit = Number(line.debit);
    if (debit > 0 || credit > 0) {
      await db
        .insertInto("journal_lines")
        .values({
          journal_batch_id: journalBatchId,
          company_id: companyId,
          outlet_id: outletId,
          account_id: line.account_id,
          line_date: eventDate as any,
          debit: debit,
          credit: credit,
          description: `Void of event ${originalEventId}`
        })
        .execute();
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

export async function getAssetLedger(companyId: number, assetId: number, actor: MutationActor): Promise<LedgerResult> {
  const db = getDb();

  const asset = await db
    .selectFrom("fixed_assets")
    .select(["outlet_id"])
    .where("company_id", "=", companyId)
    .where("id", "=", assetId)
    .executeTakeFirst();

  if (!asset) {
    throw new FixedAssetNotFoundError();
  }

  const rawOutletId = asset.outlet_id ?? null;
  const outletId = rawOutletId == null ? null : Number(rawOutletId);
  if (outletId !== null) {
    if (!Number.isInteger(outletId) || outletId <= 0) {
      throw new FixedAssetNotFoundError();
    }
    try {
      await commonUtilsEnsureUserHasOutletAccess(actor.userId, companyId, outletId);
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === "FORBIDDEN") {
        throw new FixedAssetNotFoundError();
      }
      throw error;
    }
  }

  const rows = await db
    .selectFrom("fixed_asset_events")
    .select([
      "id",
      "company_id",
      "asset_id",
      "event_type",
      "event_date",
      "outlet_id",
      "journal_batch_id",
      "status",
      "idempotency_key",
      "event_data",
      "created_at",
      "created_by",
      "voided_by",
      "voided_at"
    ])
    .where("asset_id", "=", assetId)
    .orderBy("event_date", "asc")
    .orderBy("id", "asc")
    .execute();

  const events: LedgerEntry[] = rows.map((row: {
    id: number;
    event_type: string;
    event_date: Date | string;
    journal_batch_id: number | null;
    status: string;
    event_data: string;
  }) => ({
    id: row.id,
    event_type: row.event_type,
    event_date: formatDateOnly(row.event_date),
    journal_batch_id: row.journal_batch_id,
    status: row.status as string,
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

export async function getAssetBook(companyId: number, assetId: number, actor: MutationActor): Promise<BookResult> {
  const db = getDb();

  const asset = await db
    .selectFrom("fixed_assets")
    .select(["outlet_id"])
    .where("company_id", "=", companyId)
    .where("id", "=", assetId)
    .executeTakeFirst();

  if (!asset) {
    throw new FixedAssetNotFoundError();
  }

  const rawOutletId = asset.outlet_id ?? null;
  const outletId = rawOutletId == null ? null : Number(rawOutletId);
  if (outletId !== null) {
    if (!Number.isInteger(outletId) || outletId <= 0) {
      throw new FixedAssetNotFoundError();
    }
    try {
      await commonUtilsEnsureUserHasOutletAccess(actor.userId, companyId, outletId);
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === "FORBIDDEN") {
        throw new FixedAssetNotFoundError();
      }
      throw error;
    }
  }

  const book = await db
    .selectFrom("fixed_asset_books")
    .select([
      "asset_id",
      "cost_basis",
      "accum_depreciation",
      "accum_impairment",
      "carrying_amount",
      "as_of_date",
      "last_event_id"
    ])
    .where("asset_id", "=", assetId)
    .executeTakeFirst();

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
    asset_id: Number(book.asset_id),
    cost_basis: Number(book.cost_basis),
    accum_depreciation: Number(book.accum_depreciation),
    accum_impairment: Number(book.accum_impairment),
    carrying_amount: Number(book.carrying_amount),
    as_of_date: formatDateOnly(book.as_of_date),
    last_event_id: Number(book.last_event_id)
  };
}
