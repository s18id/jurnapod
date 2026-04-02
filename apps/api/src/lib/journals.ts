// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Thin API adapter for journals - composition/IO boundary only.
 * All business logic delegates to accounting module services.
 */

import type {
  ManualJournalEntryCreateRequest,
  JournalBatchResponse,
  JournalListQuery
} from "@jurnapod/shared";
import { getJournalsService } from "./accounting-services";

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

export async function getJournalBatch(
  batchId: number,
  companyId: number
): Promise<JournalBatchResponse> {
  const service = getJournalsService();
  return service.getJournalBatch(batchId, companyId);
}

export async function listJournalBatches(
  filters: JournalListQuery
): Promise<JournalBatchResponse[]> {
  const service = getJournalsService();
  return service.listJournalBatches(filters);
}

/**
 * Export error classes from accounting module
 */
export {
  JournalNotBalancedError,
  JournalNotFoundError,
  InvalidJournalLineError
} from "@jurnapod/modules-accounting";
