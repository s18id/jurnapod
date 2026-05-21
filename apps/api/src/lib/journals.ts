// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Thin API adapter for journals - composition/IO boundary only.
 * All business logic delegates to accounting module services.
 */

import type {
  ManualJournalEntryCreateRequest,
  ManualJournalEntryUpdateRequest,
  JournalBatchResponse,
  JournalDraftResponse,
  JournalEntryResponse,
  JournalListQuery
} from "@jurnapod/shared";
import type { ResolvedVoidTargetJournal } from "@jurnapod/modules-accounting";
import { getJournalsService } from "./accounting-services";

export class JournalsServiceVersionMismatchError extends Error {
  constructor() {
    super("Journals service is stale; rebuild @jurnapod/modules-accounting and restart the API process");
    this.name = "JournalsServiceVersionMismatchError";
  }
}

function assertVoidResolverAvailable(
  service: ReturnType<typeof getJournalsService>
): asserts service is ReturnType<typeof getJournalsService> & {
  resolveVoidTargetJournal: (journalId: number, companyId: number) => Promise<ResolvedVoidTargetJournal>;
} {
  if (typeof service.resolveVoidTargetJournal !== "function") {
    throw new JournalsServiceVersionMismatchError();
  }
}

/**
 * Export service methods - thin wrappers around accounting module
 */
export async function createManualJournalEntry(
  data: ManualJournalEntryCreateRequest,
  userId?: number
): Promise<JournalBatchResponse> {
  const service = getJournalsService();
  return service.createManualEntry(data, userId);
}

export async function createJournalDraft(
  data: ManualJournalEntryCreateRequest,
  userId?: number
): Promise<JournalDraftResponse> {
  const service = getJournalsService();
  return service.createJournalDraft(data, userId);
}

export async function validateJournalDraftReferences(
  data: ManualJournalEntryCreateRequest
): Promise<void> {
  const service = getJournalsService();
  return service.validateJournalDraftReferences(data);
}

export async function updateJournalDraft(
  draftId: number,
  companyId: number,
  data: ManualJournalEntryUpdateRequest
): Promise<JournalDraftResponse> {
  const service = getJournalsService();
  return service.updateJournalDraft(draftId, companyId, data);
}

export async function postJournalDraft(
  draftId: number,
  companyId: number,
  userId?: number
): Promise<JournalEntryResponse> {
  const service = getJournalsService();
  return service.postJournalDraft(draftId, companyId, userId);
}

export async function voidPostedManualJournal(
  journalId: number,
  companyId: number,
  reason: string,
  userId?: number
): Promise<JournalEntryResponse> {
  const service = getJournalsService();
  assertVoidResolverAvailable(service);
  return service.voidPostedManualJournal(journalId, companyId, reason, userId);
}

export async function resolveVoidTargetJournal(
  journalId: number,
  companyId: number
): Promise<ResolvedVoidTargetJournal> {
  const service = getJournalsService();
  assertVoidResolverAvailable(service);
  return service.resolveVoidTargetJournal(journalId, companyId);
}

export async function getJournalBatch(
  batchId: number,
  companyId: number
): Promise<JournalBatchResponse> {
  const service = getJournalsService();
  return service.getJournalBatch(batchId, companyId);
}

export async function getJournalEntry(
  journalId: number,
  companyId: number
): Promise<JournalEntryResponse> {
  const service = getJournalsService();
  return service.getJournalEntry(journalId, companyId);
}

export async function listJournalBatches(
  filters: JournalListQuery
): Promise<JournalBatchResponse[]> {
  const service = getJournalsService();
  return service.listJournalBatches(filters);
}

export async function listJournalEntries(
  filters: JournalListQuery
): Promise<JournalEntryResponse[]> {
  const service = getJournalsService();
  return service.listJournalEntries(filters);
}

/**
 * Export error classes from accounting module
 */
export {
  JournalNotBalancedError,
  JournalNotFoundError,
  InvalidJournalLineError,
  JournalDraftNotFoundError,
  JournalAlreadyPostedError,
  JournalAlreadyVoidedError,
  JournalCannotVoidDraftError,
  JournalVoidNotAllowedError,
  InvalidJournalVoidReasonError,
  JournalDuplicateClientRefError,
  InvalidJournalOutletError,
  InvalidJournalAccountError,
  FiscalYearClosedError,
  JournalOutsideFiscalYearError
} from "@jurnapod/modules-accounting";
