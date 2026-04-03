// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Lifecycle Service for Fixed Assets
 *
 * Handles asset lifecycle events: acquisition, transfer, impairment, disposal, void.
 * Full parity to apps/api/src/lib/fixed-assets-lifecycle.ts.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type {
  LifecycleEvent,
  AssetBook,
  AcquisitionInput,
  AcquisitionResult,
  TransferInput,
  TransferResult,
  ImpairmentInput,
  ImpairmentResult,
  DisposalInput,
  DisposalResult,
  VoidEventInput,
  VoidResult,
  LedgerEntry,
  LedgerResult,
  BookResult,
} from "../interfaces/types.js";
import type { FixedAssetRepository } from "../repositories/index.js";
import type { FixedAssetPorts } from "../interfaces/fixed-asset-ports.js";
import { normalizeMoney } from "../../posting/common.js";
import {
  FixedAssetNotFoundError,
  LifecycleEventNotFoundError,
  LifecycleEventVoidedError,
  LifecycleEventNotVoidableError,
  LifecycleDuplicateEventError,
  LifecycleAssetDisposedError,
  LifecycleInvalidStateError,
  LifecycleFiscalYearClosedError,
  LifecycleJournalUnbalancedError,
  LifecycleInvalidReferenceError,
} from "../errors.js";

// =============================================================================
// Constants & Types
// =============================================================================

const MONEY_SCALE = 100;
const MYSQL_DUPLICATE_ERROR_CODE = 1062;

// Event type constants
const FA_ACQUISITION = "ACQUISITION";
const FA_DEPRECIATION = "DEPRECIATION";
const FA_TRANSFER = "TRANSFER";
const FA_IMPAIRMENT = "IMPAIRMENT";
const FA_DISPOSAL = "DISPOSAL";
const FA_VOID = "VOID";

function isAcquisitionType(t: string): boolean {
  return t === "ACQUISITION" || t === "FA_ACQUISITION";
}
function isDepreciationType(t: string): boolean {
  return t === "DEPRECIATION" || t === "FA_DEPRECIATION";
}
function isImpairmentType(t: string): boolean {
  return t === "IMPAIRMENT" || t === "FA_IMPAIRMENT";
}
function isDisposalType(t: string): boolean {
  return t === "DISPOSAL" || t === "FA_DISPOSAL";
}
function isVoidableEventType(eventType: string): boolean {
  return isAcquisitionType(eventType) || isDisposalType(eventType);
}

export type MutationAuditActor = {
  userId: number;
};

export interface LifecycleServiceOptions {
  repository: FixedAssetRepository;
  ports: FixedAssetPorts;
}

// =============================================================================
// Helper Functions
// =============================================================================

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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

function assertJournalBalanced(lines: Array<{ debit: number; credit: number }>): void {
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new LifecycleJournalUnbalancedError(
      `Journal not balanced: debit=${totalDebit}, credit=${totalCredit}`
    );
  }
}

// =============================================================================
// LifecycleService
// =============================================================================

/**
 * LifecycleService provides business logic for asset lifecycle events.
 */
export class LifecycleService {
  private readonly repo: FixedAssetRepository;
  private readonly ports: FixedAssetPorts;

  constructor(options: LifecycleServiceOptions) {
    this.repo = options.repository;
    this.ports = options.ports;
  }

  /**
   * Record an asset acquisition event.
   */
  async recordAcquisition(
    companyId: number,
    assetId: number,
    input: AcquisitionInput,
    actor: MutationAuditActor
  ): Promise<AcquisitionResult> {
    const db = this.repo["db"] as KyselySchema;

    return db.transaction().execute(async (trx) => {
      // Find the asset
      const asset = await trx
        .selectFrom("fixed_assets")
        .where("company_id", "=", companyId)
        .where("id", "=", assetId)
        .limit(1)
        .select(["id", "company_id", "outlet_id", "name", "purchase_cost", "disposed_at"])
        .executeTakeFirst();

      if (!asset) {
        throw new FixedAssetNotFoundError();
      }

      if (asset.disposed_at) {
        throw new LifecycleAssetDisposedError();
      }

      // Check outlet access for the asset
      await this.ensureUserCanAccessAssetOutlet(trx, actor.userId, companyId, assetId);

      const idempotencyKey = input.idempotency_key ?? generateIdempotencyKey();

      // Check for existing event with same idempotency key
      const existingEvent = await this.findEventByIdempotencyKey(trx, companyId, idempotencyKey);
      if (existingEvent) {
        if (Number(existingEvent.asset_id) !== assetId) {
          throw new LifecycleInvalidReferenceError("Idempotency conflict");
        }
        if (!isAcquisitionType(existingEvent.event_type)) {
          throw new LifecycleInvalidReferenceError("Idempotency conflict");
        }
        const book = await this.findBookByAssetId(trx, assetId);
        return {
          event_id: existingEvent.id,
          journal_batch_id: existingEvent.journal_batch_id ?? 0,
          book: {
            cost_basis: book ? Number(book.cost_basis) : 0,
            carrying_amount: book ? Number(book.carrying_amount) : 0,
          },
          duplicate: true,
        };
      }

      // Validate fiscal year
      await this.ports.fiscalYearGuard.ensureDateWithinOpenFiscalYear(companyId, input.event_date);

      // Validate accounts
      await this.ensureAccountExists(trx, companyId, input.asset_account_id);
      await this.ensureAccountExists(trx, companyId, input.offset_account_id);

      // Determine outlet
      let outletId = input.outlet_id ?? (asset.outlet_id as number | null);
      if (typeof outletId === "number") {
        await this.ensureOutletExists(trx, companyId, outletId);
        const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
          actor.userId,
          companyId,
          outletId
        );
        if (!hasAccess) {
          throw new FixedAssetNotFoundError();
        }
      }

      // Validate salvage value
      const salvageValue = input.salvage_value ?? 0;
      if (salvageValue > input.cost) {
        throw new LifecycleInvalidReferenceError("Salvage value cannot exceed cost");
      }
      const carryingAmount = normalizeMoney(input.cost - salvageValue);

      // Reserve event first for idempotency
      const eventId = await this.insertEventWithIdempotency(
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
          notes: input.notes,
        },
        actor.userId
      );

      // Post journal after event reservation
      const journalBatchId = await this.postAcquisitionToJournal(
        trx,
        companyId,
        assetId,
        outletId,
        input.event_date,
        input.cost,
        input.asset_account_id,
        input.offset_account_id
      );

      // Attach journal batch to event
      await trx
        .updateTable("fixed_asset_events")
        .set({ journal_batch_id: journalBatchId })
        .where("id", "=", eventId)
        .execute();

      // Update book
      await this.upsertAssetBook(
        trx,
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
          carrying_amount: carryingAmount,
        },
        duplicate: false,
      };
    });
  }

  /**
   * Record an asset transfer between outlets.
   */
  async recordTransfer(
    companyId: number,
    assetId: number,
    input: TransferInput,
    actor: MutationAuditActor
  ): Promise<TransferResult> {
    const db = this.repo["db"] as KyselySchema;

    return db.transaction().execute(async (trx) => {
      // Find the asset
      const asset = await trx
        .selectFrom("fixed_assets")
        .where("company_id", "=", companyId)
        .where("id", "=", assetId)
        .limit(1)
        .select(["id", "company_id", "outlet_id", "name", "purchase_cost", "disposed_at"])
        .executeTakeFirst();

      if (!asset) {
        throw new FixedAssetNotFoundError();
      }

      if (asset.disposed_at) {
        throw new LifecycleAssetDisposedError();
      }

      const fromOutletId = asset.outlet_id as number | null;

      // Check access to from outlet
      if (fromOutletId) {
        const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
          actor.userId,
          companyId,
          fromOutletId
        );
        if (!hasAccess) {
          throw new FixedAssetNotFoundError();
        }
      }

      const idempotencyKey = input.idempotency_key ?? generateIdempotencyKey();

      // Check for existing event with same idempotency key
      const existingEvent = await this.findEventByIdempotencyKey(trx, companyId, idempotencyKey);
      if (existingEvent) {
        if (Number(existingEvent.asset_id) !== assetId) {
          throw new LifecycleInvalidReferenceError("Idempotency conflict");
        }
        if (existingEvent.event_type !== FA_TRANSFER) {
          throw new LifecycleInvalidReferenceError("Idempotency conflict");
        }
        const eventData = this.parseEventData(existingEvent.event_data);
        const toOutletId = eventData.to_outlet_id as number;
        return {
          event_id: existingEvent.id,
          journal_batch_id: existingEvent.journal_batch_id,
          to_outlet_id: toOutletId,
          duplicate: true,
        };
      }

      // Validate fiscal year
      await this.ports.fiscalYearGuard.ensureDateWithinOpenFiscalYear(companyId, input.transfer_date);
      await this.ensureOutletExists(trx, companyId, input.to_outlet_id);

      const toOutletId = input.to_outlet_id;

      // Check access to to outlet
      const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
        actor.userId,
        companyId,
        toOutletId
      );
      if (!hasAccess) {
        throw new FixedAssetNotFoundError();
      }

      // Reserve event first for idempotency
      const eventId = await this.insertEventWithIdempotency(
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
          notes: input.notes,
        },
        actor.userId
      );

      // Update asset outlet
      await trx
        .updateTable("fixed_assets")
        .set({ outlet_id: toOutletId })
        .where("id", "=", assetId)
        .execute();

      return {
        event_id: eventId,
        journal_batch_id: null,
        to_outlet_id: toOutletId,
        duplicate: false,
      };
    });
  }

  /**
   * Record an impairment event.
   */
  async recordImpairment(
    companyId: number,
    assetId: number,
    input: ImpairmentInput,
    actor: MutationAuditActor
  ): Promise<ImpairmentResult> {
    const db = this.repo["db"] as KyselySchema;

    return db.transaction().execute(async (trx) => {
      // Find the asset
      const asset = await trx
        .selectFrom("fixed_assets")
        .where("company_id", "=", companyId)
        .where("id", "=", assetId)
        .limit(1)
        .select(["id", "company_id", "outlet_id", "name", "purchase_cost", "disposed_at"])
        .executeTakeFirst();

      if (!asset) {
        throw new FixedAssetNotFoundError();
      }

      if (asset.disposed_at) {
        throw new LifecycleAssetDisposedError();
      }

      // Check outlet access
      await this.ensureUserCanAccessAssetOutlet(trx, actor.userId, companyId, assetId);

      const book = await this.findBookByAssetId(trx, assetId);
      if (!book) {
        throw new LifecycleInvalidStateError("Asset has no book value - must acquire first");
      }

      const idempotencyKey = input.idempotency_key ?? generateIdempotencyKey();

      // Check for existing event
      const existingEvent = await this.findEventByIdempotencyKey(trx, companyId, idempotencyKey);
      if (existingEvent) {
        return {
          event_id: existingEvent.id,
          journal_batch_id: existingEvent.journal_batch_id ?? 0,
          book: {
            carrying_amount: Number(book.carrying_amount),
            accum_impairment: Number(book.accum_impairment),
          },
          duplicate: true,
        };
      }

      // Validate fiscal year
      await this.ports.fiscalYearGuard.ensureDateWithinOpenFiscalYear(companyId, input.impairment_date);
      await this.ensureAccountExists(trx, companyId, input.expense_account_id);
      await this.ensureAccountExists(trx, companyId, input.accum_impairment_account_id);

      const currentCarryingAmount = Number(book.carrying_amount);
      const newImpairment = Math.min(input.impairment_amount, currentCarryingAmount);
      const newCarryingAmount = normalizeMoney(currentCarryingAmount - newImpairment);
      const newAccumImpairment = normalizeMoney(Number(book.accum_impairment) + newImpairment);

      // Reserve event first for idempotency
      const eventId = await this.insertEventWithIdempotency(
        trx,
        companyId,
        assetId,
        FA_IMPAIRMENT,
        input.impairment_date,
        asset.outlet_id as number | null,
        null,
        "POSTED",
        idempotencyKey,
        {
          impairment_amount: newImpairment,
          reason: input.reason,
          expense_account_id: input.expense_account_id,
          accum_impairment_account_id: input.accum_impairment_account_id,
        },
        actor.userId
      );

      // Post journal
      const journalBatchId = await this.postImpairmentToJournal(
        trx,
        companyId,
        assetId,
        asset.outlet_id as number | null,
        input.impairment_date,
        newImpairment,
        input.expense_account_id,
        input.accum_impairment_account_id
      );

      // Attach journal batch to event
      await trx
        .updateTable("fixed_asset_events")
        .set({ journal_batch_id: journalBatchId })
        .where("id", "=", eventId)
        .execute();

      // Update book
      await this.upsertAssetBook(
        trx,
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
          accum_impairment: newAccumImpairment,
        },
        duplicate: false,
      };
    });
  }

  /**
   * Record an asset disposal.
   */
  async recordDisposal(
    companyId: number,
    assetId: number,
    input: DisposalInput,
    actor: MutationAuditActor
  ): Promise<DisposalResult> {
    const db = this.repo["db"] as KyselySchema;

    return db.transaction().execute(async (trx) => {
      // Find the asset
      const asset = await trx
        .selectFrom("fixed_assets")
        .where("company_id", "=", companyId)
        .where("id", "=", assetId)
        .limit(1)
        .select(["id", "company_id", "outlet_id", "name", "purchase_cost", "disposed_at"])
        .executeTakeFirst();

      if (!asset) {
        throw new FixedAssetNotFoundError();
      }

      // Check outlet access
      await this.ensureUserCanAccessAssetOutlet(trx, actor.userId, companyId, assetId);

      const idempotencyKey = input.idempotency_key ?? generateIdempotencyKey();

      // Check for existing event
      const existingEvent = await this.findEventByIdempotencyKey(trx, companyId, idempotencyKey);
      if (existingEvent) {
        if (Number(existingEvent.asset_id) !== assetId) {
          throw new LifecycleInvalidReferenceError("Idempotency conflict");
        }
        const book = await this.findBookByAssetId(trx, assetId);
        const snapshot = await this.findDisposalSnapshotByEventId(trx, companyId, existingEvent.id);
        if (snapshot) {
          return {
            event_id: existingEvent.id,
            journal_batch_id: existingEvent.journal_batch_id ?? 0,
            disposal: {
              proceeds: snapshot.proceeds,
              cost_removed: snapshot.cost_removed,
              gain_loss: snapshot.gain_loss,
            },
            book: { carrying_amount: book ? Number(book.carrying_amount) : 0 },
            duplicate: true,
          };
        }
        const eventData = this.parseEventData(existingEvent.event_data);
        return {
          event_id: existingEvent.id,
          journal_batch_id: existingEvent.journal_batch_id ?? 0,
          disposal: {
            proceeds: (eventData.proceeds as number) ?? 0,
            cost_removed: (eventData.cost_removed as number) ?? 0,
            gain_loss: (eventData.gain_loss as number) ?? 0,
          },
          book: { carrying_amount: book ? Number(book.carrying_amount) : 0 },
          duplicate: true,
        };
      }

      if (asset.disposed_at) {
        throw new LifecycleAssetDisposedError();
      }

      const book = await this.findBookByAssetId(trx, assetId);
      if (!book) {
        throw new LifecycleInvalidStateError("Asset has no book value - must acquire first");
      }

      // Validate fiscal year
      await this.ports.fiscalYearGuard.ensureDateWithinOpenFiscalYear(companyId, input.disposal_date);
      await this.ensureAccountExists(trx, companyId, input.cash_account_id);
      await this.ensureAccountExists(trx, companyId, input.asset_account_id);
      await this.ensureAccountExists(trx, companyId, input.accum_depr_account_id);
      if (input.accum_impairment_account_id) {
        await this.ensureAccountExists(trx, companyId, input.accum_impairment_account_id);
      }
      if (input.gain_account_id) {
        await this.ensureAccountExists(trx, companyId, input.gain_account_id);
      }
      if (input.loss_account_id) {
        await this.ensureAccountExists(trx, companyId, input.loss_account_id);
      }
      if (input.disposal_expense_account_id) {
        await this.ensureAccountExists(trx, companyId, input.disposal_expense_account_id);
      }

      const proceeds = input.proceeds ?? 0;
      const disposalCost = input.disposal_cost ?? 0;
      const costBasis = Number(book.cost_basis);
      const accumDepreciation = Number(book.accum_depreciation);
      const accumImpairment = Number(book.accum_impairment);

      // NBV from components
      const nbv = costBasis - accumDepreciation - accumImpairment;

      let gainLoss: number;
      if (input.disposal_type === "SALE") {
        gainLoss = normalizeMoney(proceeds - nbv);
      } else {
        gainLoss = normalizeMoney(-nbv);
      }

      // Validation for required accounts based on gain/loss
      if (accumImpairment > 0 && !input.accum_impairment_account_id) {
        throw new LifecycleInvalidReferenceError(
          "Accumulated impairment account required when asset has impairment"
        );
      }
      if (gainLoss > 0 && !input.gain_account_id) {
        throw new LifecycleInvalidReferenceError("Gain account required when disposal results in gain");
      }
      if (gainLoss < 0 && !input.loss_account_id) {
        throw new LifecycleInvalidReferenceError("Loss account required when disposal results in loss");
      }
      if (disposalCost > 0 && !input.disposal_expense_account_id) {
        throw new LifecycleInvalidReferenceError(
          "Disposal expense account required when there are disposal costs"
        );
      }

      // Reserve event first for idempotency
      const eventId = await this.insertEventWithIdempotency(
        trx,
        companyId,
        assetId,
        FA_DISPOSAL,
        input.disposal_date,
        asset.outlet_id as number | null,
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
          notes: input.notes,
        },
        actor.userId
      );

      // Post journal
      const journalResult = await this.postDisposalToJournal(
        trx,
        companyId,
        assetId,
        asset.outlet_id as number | null,
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

      // Attach journal batch to event
      await trx
        .updateTable("fixed_asset_events")
        .set({ journal_batch_id: journalResult.journalBatchId })
        .where("id", "=", eventId)
        .execute();

      // Use the actual posted gain/loss from the journal
      const postedGainLoss = journalResult.gainLoss;

      // Insert disposal snapshot
      await trx
        .insertInto("fixed_asset_disposals")
        .values({
          company_id: companyId,
          event_id: eventId,
          asset_id: assetId,
          proceeds: proceeds,
          cost_removed: costBasis,
          depr_removed: accumDepreciation,
          impairment_removed: accumImpairment,
          disposal_cost: disposalCost,
          gain_loss: postedGainLoss,
          disposal_type: input.disposal_type,
          notes: input.notes ?? null,
        })
        .execute();

      // Update event with actual gain/loss
      await trx
        .updateTable("fixed_asset_events")
        .set({ event_data: JSON.stringify({ gain_loss: postedGainLoss }) })
        .where("id", "=", eventId)
        .execute();

      // Update book to zero
      await this.upsertAssetBook(
        trx,
        companyId,
        assetId,
        0,
        0,
        0,
        0,
        input.disposal_date,
        eventId
      );

      // Mark asset as disposed
      await trx
        .updateTable("fixed_assets")
        .set({ disposed_at: new Date(input.disposal_date) })
        .where("id", "=", assetId)
        .execute();

      return {
        event_id: eventId,
        journal_batch_id: journalResult.journalBatchId,
        disposal: {
          proceeds,
          cost_removed: costBasis,
          gain_loss: postedGainLoss,
        },
        book: { carrying_amount: 0 },
        duplicate: false,
      };
    });
  }

  /**
   * Void a lifecycle event.
   */
  async voidEvent(
    companyId: number,
    eventId: number,
    input: VoidEventInput,
    actor: MutationAuditActor
  ): Promise<VoidResult> {
    const db = this.repo["db"] as KyselySchema;

    return db.transaction().execute(async (trx) => {
      // Find the event
      const event = await trx
        .selectFrom("fixed_asset_events")
        .where("company_id", "=", companyId)
        .where("id", "=", eventId)
        .limit(1)
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
          "voided_at",
        ])
        .executeTakeFirst();

      if (!event) {
        throw new LifecycleEventNotFoundError();
      }

      if (event.status === "VOIDED") {
        throw new LifecycleEventVoidedError();
      }

      if (!isVoidableEventType(event.event_type)) {
        throw new LifecycleEventNotVoidableError();
      }

      // Check outlet access
      if (event.outlet_id) {
        const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
          actor.userId,
          companyId,
          event.outlet_id as number
        );
        if (!hasAccess) {
          throw new LifecycleEventNotFoundError();
        }
      }

      const idempotencyKey = input.idempotency_key ?? `void-${generateIdempotencyKey()}`;

      // Check for existing void event
      const existingEvent = await this.findEventByIdempotencyKey(trx, companyId, idempotencyKey);
      if (existingEvent) {
        return {
          void_event_id: existingEvent.id,
          original_event_id: eventId,
          journal_batch_id: existingEvent.journal_batch_id,
          duplicate: true,
        };
      }

      // Validate fiscal year
      await this.ports.fiscalYearGuard.ensureDateWithinOpenFiscalYear(
        companyId,
        formatDateOnly(new Date())
      );

      // Reserve void event
      const voidEventId = await this.insertEventWithIdempotency(
        trx,
        companyId,
        event.asset_id,
        FA_VOID,
        formatDateOnly(new Date()),
        event.outlet_id as number | null,
        null,
        "POSTED",
        idempotencyKey,
        {
          original_event_id: eventId,
          void_reason: input.void_reason,
        },
        actor.userId
      );

      // Post reversal journal if original had journal batch
      let journalBatchId: number | null = null;
      if (event.journal_batch_id) {
        journalBatchId = await this.postVoidToJournal(
          trx,
          companyId,
          eventId,
          event.asset_id,
          event.outlet_id as number | null,
          formatDateOnly(new Date())
        );
      }

      // Attach journal batch to void event
      await trx
        .updateTable("fixed_asset_events")
        .set({ journal_batch_id: journalBatchId })
        .where("id", "=", voidEventId)
        .execute();

      // Mark original event as voided
      await trx
        .updateTable("fixed_asset_events")
        .set({
          status: "VOIDED",
          voided_by: actor.userId,
          voided_at: new Date(),
        })
        .where("id", "=", eventId)
        .execute();

      // Recompute book from remaining posted events
      const recomputed = await this.recomputeAssetBookFromEvents(
        trx,
        companyId,
        event.asset_id
      );

      // Update book
      await this.upsertAssetBook(
        trx,
        companyId,
        event.asset_id,
        recomputed.cost_basis,
        recomputed.accum_depreciation,
        recomputed.accum_impairment,
        recomputed.carrying_amount,
        formatDateOnly(new Date()),
        voidEventId
      );

      // Update asset disposed_at
      await trx
        .updateTable("fixed_assets")
        .set({
          disposed_at: recomputed.disposed_at ? new Date(recomputed.disposed_at) : null,
        })
        .where("id", "=", event.asset_id)
        .execute();

      return {
        void_event_id: voidEventId,
        original_event_id: eventId,
        journal_batch_id: journalBatchId,
        duplicate: false,
      };
    });
  }

  /**
   * Get the ledger (chronological event list) for an asset.
   */
  async getLedger(
    companyId: number,
    assetId: number,
    actor: MutationAuditActor
  ): Promise<LedgerResult> {
    const db = this.repo["db"] as KyselySchema;

    // Find the asset
    const asset = await db
      .selectFrom("fixed_assets")
      .select(["outlet_id"])
      .where("company_id", "=", companyId)
      .where("id", "=", assetId)
      .executeTakeFirst();

    if (!asset) {
      throw new FixedAssetNotFoundError();
    }

    // Check outlet access
    if (asset.outlet_id) {
      const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
        actor.userId,
        companyId,
        asset.outlet_id as number
      );
      if (!hasAccess) {
        throw new FixedAssetNotFoundError();
      }
    }

    // Get all events for the asset
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
        "voided_at",
      ])
      .where("asset_id", "=", assetId)
      .orderBy("event_date", "asc")
      .orderBy("id", "asc")
      .execute();

    const events: LedgerEntry[] = rows.map((row) => ({
      id: row.id,
      event_type: row.event_type,
      event_date: formatDateOnly(row.event_date),
      journal_batch_id: row.journal_batch_id,
      status: row.status,
      event_data: this.parseEventData(row.event_data),
    }));

    return { asset_id: assetId, events };
  }

  /**
   * Get the current book values for an asset.
   */
  async getBook(
    companyId: number,
    assetId: number,
    actor: MutationAuditActor
  ): Promise<BookResult> {
    const db = this.repo["db"] as KyselySchema;

    // Find the asset
    const asset = await db
      .selectFrom("fixed_assets")
      .select(["outlet_id"])
      .where("company_id", "=", companyId)
      .where("id", "=", assetId)
      .executeTakeFirst();

    if (!asset) {
      throw new FixedAssetNotFoundError();
    }

    // Check outlet access
    if (asset.outlet_id) {
      const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
        actor.userId,
        companyId,
        asset.outlet_id as number
      );
      if (!hasAccess) {
        throw new FixedAssetNotFoundError();
      }
    }

    // Get book
    const book = await db
      .selectFrom("fixed_asset_books")
      .select([
        "asset_id",
        "cost_basis",
        "accum_depreciation",
        "accum_impairment",
        "carrying_amount",
        "as_of_date",
        "last_event_id",
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
        last_event_id: 0,
      };
    }

    return {
      asset_id: Number(book.asset_id),
      cost_basis: Number(book.cost_basis),
      accum_depreciation: Number(book.accum_depreciation),
      accum_impairment: Number(book.accum_impairment),
      carrying_amount: Number(book.carrying_amount),
      as_of_date: formatDateOnly(book.as_of_date),
      last_event_id: Number(book.last_event_id),
    };
  }

  // =============================================================================
  // Internal Helper Methods
  // =============================================================================

  private parseEventData(eventData: unknown): Record<string, unknown> {
    if (typeof eventData === "string") {
      return JSON.parse(eventData);
    }
    return eventData as Record<string, unknown>;
  }

  private async findEventByIdempotencyKey(
    db: KyselySchema,
    companyId: number,
    idempotencyKey: string
  ): Promise<LifecycleEvent | null> {
    const row = await db
      .selectFrom("fixed_asset_events")
      .where("company_id", "=", companyId)
      .where("idempotency_key", "=", idempotencyKey)
      .limit(1)
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
        "voided_at",
      ])
      .executeTakeFirst();

    if (!row) return null;

    return {
      ...(row as unknown as LifecycleEvent),
      event_data: this.parseEventData(row.event_data),
    };
  }

  private async findBookByAssetId(
    db: KyselySchema,
    assetId: number
  ): Promise<AssetBook | null> {
    const row = await db
      .selectFrom("fixed_asset_books")
      .where("asset_id", "=", assetId)
      .limit(1)
      .select([
        "id",
        "company_id",
        "asset_id",
        "cost_basis",
        "accum_depreciation",
        "accum_impairment",
        "carrying_amount",
        "last_event_id",
        "as_of_date",
        "updated_at",
      ])
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: Number(row.id),
      asset_id: Number(row.asset_id),
      company_id: Number(row.company_id),
      cost_basis: String(row.cost_basis),
      accum_depreciation: String(row.accum_depreciation),
      accum_impairment: String(row.accum_impairment),
      carrying_amount: String(row.carrying_amount),
      last_event_id: Number(row.last_event_id),
      as_of_date: row.as_of_date as Date,
      updated_at: row.updated_at as Date,
    };
  }

  private async findDisposalSnapshotByEventId(
    db: KyselySchema,
    companyId: number,
    eventId: number
  ): Promise<{ proceeds: number; cost_removed: number; gain_loss: number } | null> {
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
      gain_loss: Number(row.gain_loss),
    };
  }

  private async insertEventWithIdempotency(
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
    try {
      const result = await db
        .insertInto("fixed_asset_events")
        .values({
          company_id: companyId,
          asset_id: assetId,
          event_type: eventType,
          event_date: eventDate as unknown as Date,
          outlet_id: outletId,
          journal_batch_id: journalBatchId,
          status: status,
          idempotency_key: idempotencyKey,
          event_data: JSON.stringify(eventData),
          created_by: createdBy,
        })
        .executeTakeFirst();

      return Number(result.insertId);
    } catch (error) {
      if (isMysqlError(error) && error.errno === MYSQL_DUPLICATE_ERROR_CODE) {
        const existing = await this.findEventByIdempotencyKey(db, companyId, idempotencyKey);
        if (existing) {
          throw new LifecycleDuplicateEventError(existing.id);
        }
      }
      throw error;
    }
  }

  private async upsertAssetBook(
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
    const existing = await this.findBookByAssetId(db, assetId);

    if (existing) {
      await db
        .updateTable("fixed_asset_books")
        .set({
          cost_basis: String(costBasis),
          accum_depreciation: String(accumDepreciation),
          accum_impairment: String(accumImpairment),
          carrying_amount: String(carryingAmount),
          as_of_date: asOfDate as unknown as Date,
          last_event_id: lastEventId,
        })
        .where("asset_id", "=", assetId)
        .execute();
    } else {
      await db
        .insertInto("fixed_asset_books")
        .values({
          company_id: companyId,
          asset_id: assetId,
          cost_basis: String(costBasis),
          accum_depreciation: String(accumDepreciation),
          accum_impairment: String(accumImpairment),
          carrying_amount: String(carryingAmount),
          as_of_date: asOfDate as unknown as Date,
          last_event_id: lastEventId,
        })
        .execute();
    }
  }

  private async recomputeAssetBookFromEvents(
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
        "voided_at",
      ])
      .execute();

    let costBasis = 0;
    let acquisitionSalvage = 0;
    let accumDepr = 0;
    let accumImpairment = 0;
    let disposedAt: Date | null = null;

    for (const event of events) {
      const data = this.parseEventData(event.event_data);
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
        accumImpairment = normalizeMoney(
          accumImpairment + Number((data as Record<string, unknown>).impairment_amount ?? 0)
        );
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
        disposed_at: disposedAt.toISOString(),
      };
    }

    const carryingAmount = normalizeMoney(
      Math.max(0, costBasis - acquisitionSalvage - accumDepr - accumImpairment)
    );

    return {
      cost_basis: normalizeMoney(costBasis),
      accum_depreciation: normalizeMoney(accumDepr),
      accum_impairment: normalizeMoney(accumImpairment),
      carrying_amount: carryingAmount,
      disposed_at: null,
    };
  }

  private async ensureUserCanAccessAssetOutlet(
    db: KyselySchema,
    userId: number,
    companyId: number,
    assetId: number
  ): Promise<void> {
    const asset = await db
      .selectFrom("fixed_assets")
      .where("company_id", "=", companyId)
      .where("id", "=", assetId)
      .limit(1)
      .select(["id", "company_id", "outlet_id", "name", "purchase_cost", "disposed_at"])
      .executeTakeFirst();

    if (!asset) {
      throw new FixedAssetNotFoundError();
    }

    if (asset.outlet_id) {
      const hasAccess = await this.ports.accessScopeChecker.userHasOutletAccess(
        userId,
        companyId,
        asset.outlet_id as number
      );
      if (!hasAccess) {
        throw new FixedAssetNotFoundError();
      }
    }
  }

  private async ensureAccountExists(
    db: KyselySchema,
    companyId: number,
    accountId: number
  ): Promise<void> {
    const result = await sql`
      SELECT 1 FROM accounts WHERE id = ${accountId} AND company_id = ${companyId} LIMIT 1
    `.execute(db);

    if (!result.rows.length) {
      throw new LifecycleInvalidReferenceError("Account not found for company");
    }
  }

  private async ensureOutletExists(
    db: KyselySchema,
    companyId: number,
    outletId: number
  ): Promise<void> {
    const result = await sql`
      SELECT 1 FROM outlets WHERE id = ${outletId} AND company_id = ${companyId} LIMIT 1
    `.execute(db);

    if (!result.rows.length) {
      throw new LifecycleInvalidReferenceError("Outlet not found for company");
    }
  }

  // =============================================================================
  // Journal Posting Methods
  // =============================================================================

  private async postAcquisitionToJournal(
    db: KyselySchema,
    companyId: number,
    assetId: number,
    outletId: number | null,
    eventDate: string,
    cost: number,
    assetAccountId: number,
    offsetAccountId: number
  ): Promise<number> {
    // Validate fiscal year
    await this.ports.fiscalYearGuard.ensureDateWithinOpenFiscalYear(companyId, eventDate);

    // Create journal batch
    const batchResult = await db
      .insertInto("journal_batches")
      .values({
        company_id: companyId,
        outlet_id: outletId,
        doc_type: FA_ACQUISITION,
        doc_id: assetId,
        posted_at: eventDate as unknown as Date,
      })
      .executeTakeFirst();

    const journalBatchId = Number(batchResult.insertId);

    assertJournalBalanced([
      { debit: cost, credit: 0 },
      { debit: 0, credit: cost },
    ]);

    // Insert journal lines
    await db
      .insertInto("journal_lines")
      .values([
        {
          journal_batch_id: journalBatchId,
          company_id: companyId,
          outlet_id: outletId,
          account_id: assetAccountId,
          line_date: eventDate as unknown as Date,
          debit: cost,
          credit: 0,
          description: "Fixed Asset Acquisition - Cost",
        },
        {
          journal_batch_id: journalBatchId,
          company_id: companyId,
          outlet_id: outletId,
          account_id: offsetAccountId,
          line_date: eventDate as unknown as Date,
          debit: 0,
          credit: cost,
          description: "Fixed Asset Acquisition - Offset",
        },
      ])
      .execute();

    return journalBatchId;
  }

  private async postImpairmentToJournal(
    db: KyselySchema,
    companyId: number,
    assetId: number,
    outletId: number | null,
    eventDate: string,
    impairmentAmount: number,
    expenseAccountId: number,
    accumImpairmentAccountId: number
  ): Promise<number> {
    // Validate fiscal year
    await this.ports.fiscalYearGuard.ensureDateWithinOpenFiscalYear(companyId, eventDate);

    // Create journal batch
    const batchResult = await db
      .insertInto("journal_batches")
      .values({
        company_id: companyId,
        outlet_id: outletId,
        doc_type: FA_IMPAIRMENT,
        doc_id: assetId,
        posted_at: eventDate as unknown as Date,
      })
      .executeTakeFirst();

    const journalBatchId = Number(batchResult.insertId);

    assertJournalBalanced([
      { debit: impairmentAmount, credit: 0 },
      { debit: 0, credit: impairmentAmount },
    ]);

    // Insert journal lines
    await db
      .insertInto("journal_lines")
      .values([
        {
          journal_batch_id: journalBatchId,
          company_id: companyId,
          outlet_id: outletId,
          account_id: expenseAccountId,
          line_date: eventDate as unknown as Date,
          debit: impairmentAmount,
          credit: 0,
          description: "Fixed Asset Impairment - Expense",
        },
        {
          journal_batch_id: journalBatchId,
          company_id: companyId,
          outlet_id: outletId,
          account_id: accumImpairmentAccountId,
          line_date: eventDate as unknown as Date,
          debit: 0,
          credit: impairmentAmount,
          description: "Fixed Asset Impairment - Accum",
        },
      ])
      .execute();

    return journalBatchId;
  }

  private async postDisposalToJournal(
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
    // Validate fiscal year
    await this.ports.fiscalYearGuard.ensureDateWithinOpenFiscalYear(companyId, eventDate);

    // Create journal batch
    const batchResult = await db
      .insertInto("journal_batches")
      .values({
        company_id: companyId,
        outlet_id: outletId,
        doc_type: FA_DISPOSAL,
        doc_id: assetId,
        posted_at: eventDate as unknown as Date,
      })
      .executeTakeFirst();

    const journalBatchId = Number(batchResult.insertId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type JournalLine = Record<string, any>;

    const lines: JournalLine[] = [];

    // Build base disposal lines
    if (disposalType === "SALE" && proceeds > 0) {
      lines.push({
        journal_batch_id: journalBatchId,
        company_id: companyId,
        outlet_id: outletId,
        account_id: cashAccountId,
        line_date: eventDate,
        debit: proceeds,
        credit: 0,
        description: "Disposal Proceeds",
      });
    }

    if (accumDepreciation > 0) {
      lines.push({
        journal_batch_id: journalBatchId,
        company_id: companyId,
        outlet_id: outletId,
        account_id: accumDeprAccountId,
        line_date: eventDate,
        debit: accumDepreciation,
        credit: 0,
        description: "Accumulated Depreciation Removed",
      });
    }

    if (accumImpairment > 0 && accumImpairmentAccountId) {
      lines.push({
        journal_batch_id: journalBatchId,
        company_id: companyId,
        outlet_id: outletId,
        account_id: accumImpairmentAccountId,
        line_date: eventDate,
        debit: accumImpairment,
        credit: 0,
        description: "Accumulated Impairment Removed",
      });
    }

    if (costBasis > 0) {
      lines.push({
        journal_batch_id: journalBatchId,
        company_id: companyId,
        outlet_id: outletId,
        account_id: assetAccountId,
        line_date: eventDate,
        debit: 0,
        credit: costBasis,
        description: "Fixed Asset Cost Removed",
      });
    }

    // Disposal cost is a separate expense + cash outflow
    if (disposalCost > 0 && disposalExpenseAccountId) {
      lines.push({
        journal_batch_id: journalBatchId,
        company_id: companyId,
        outlet_id: outletId,
        account_id: disposalExpenseAccountId,
        line_date: eventDate,
        debit: disposalCost,
        credit: 0,
        description: "Disposal Costs",
      });
      lines.push({
        journal_batch_id: journalBatchId,
        company_id: companyId,
        outlet_id: outletId,
        account_id: cashAccountId,
        line_date: eventDate,
        debit: 0,
        credit: disposalCost,
        description: "Disposal Costs Payment",
      });
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
          lines.push({
            journal_batch_id: journalBatchId,
            company_id: companyId,
            outlet_id: outletId,
            account_id: gainAccountId,
            line_date: eventDate,
            debit: 0,
            credit: actualGainLoss,
            description: "Gain on Disposal",
          });
        } else {
          throw new LifecycleInvalidReferenceError(
            "Gain account required when disposal results in gain"
          );
        }
      } else {
        // Credit > Debit (credit-heavy) = loss to balance the journal (add debit)
        actualGainLoss = delta; // Already negative
        if (lossAccountId) {
          lines.push({
            journal_batch_id: journalBatchId,
            company_id: companyId,
            outlet_id: outletId,
            account_id: lossAccountId,
            line_date: eventDate,
            debit: Math.abs(actualGainLoss),
            credit: 0,
            description: "Loss on Disposal",
          });
        } else {
          throw new LifecycleInvalidReferenceError(
            "Loss account required when disposal results in loss"
          );
        }
      }
    }

    // Final balance check and insert
    if (lines.length > 0) {
      const journalLines = lines.map((l) => ({ debit: l.debit, credit: l.credit }));
      assertJournalBalanced(journalLines);

      // Use sql template to avoid strict type checking on line_date
      const values = lines.map((line) => sql`
        (
          ${line.journal_batch_id},
          ${line.company_id},
          ${line.outlet_id ?? null},
          ${line.account_id},
          ${line.line_date},
          ${line.debit},
          ${line.credit},
          ${line.description}
        )
      `);

      await sql`
        INSERT INTO journal_lines (
          journal_batch_id,
          company_id,
          outlet_id,
          account_id,
          line_date,
          debit,
          credit,
          description
        ) VALUES ${sql.join(values, sql`, `)}
      `.execute(db);
    }

    return { journalBatchId, gainLoss: actualGainLoss };
  }

  private async postVoidToJournal(
    db: KyselySchema,
    companyId: number,
    originalEventId: number,
    assetId: number,
    outletId: number | null,
    eventDate: string
  ): Promise<number> {
    // Validate fiscal year
    await this.ports.fiscalYearGuard.ensureDateWithinOpenFiscalYear(companyId, eventDate);

    // Create journal batch
    const batchResult = await db
      .insertInto("journal_batches")
      .values({
        company_id: companyId,
        outlet_id: outletId,
        doc_type: FA_VOID,
        doc_id: originalEventId,
        posted_at: eventDate as unknown as Date,
      })
      .executeTakeFirst();

    const journalBatchId = Number(batchResult.insertId);

    // Get original lines
    const originalLines = await db
      .selectFrom("journal_lines")
      .where("journal_batch_id", "=", originalEventId)
      .select(["account_id", "debit", "credit"])
      .execute();

    // Insert reversed lines
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
            line_date: eventDate as unknown as Date,
            debit: debit,
            credit: credit,
            description: `Void of event ${originalEventId}`,
          })
          .execute();
      }
    }

    return journalBatchId;
  }
}
