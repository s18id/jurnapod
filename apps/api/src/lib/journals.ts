// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  JournalsService,
  type JournalsDbClient
} from "@jurnapod/modules-accounting";
import type {
  ManualJournalEntryCreateRequest,
  JournalBatchResponse,
  JournalListQuery
} from "@jurnapod/shared";
import { getDb } from "./db";

/**
 * Create JournalsService instance with DbConn and audit service
 */
async function createJournalsService(): Promise<JournalsService> {
  const dbClient = getDb();
  
  // Import AuditService class using dynamic import
  const { AuditService } = await import("@jurnapod/modules-platform");
  
  // Create audit service with the SAME db client to share transactions
  const auditService = new AuditService(dbClient);
  
  // Adapter for audit service (journals only need logCreate)
  const auditServiceAdapter = {
    logCreate: async (context: any, entityType: string, entityId: string | number, payload: Record<string, any>) => {
      return auditService.logCreate(context, entityType as any, entityId, payload);
    },
    logUpdate: async () => { throw new Error("Not implemented for journals"); },
    logDeactivate: async () => { throw new Error("Not implemented for journals"); },
    logReactivate: async () => { throw new Error("Not implemented for journals"); }
  };
  
  return new JournalsService(dbClient as JournalsDbClient, auditServiceAdapter);
}

// Singleton instance
let journalsServiceInstance: JournalsService | null = null;

async function getJournalsService(): Promise<JournalsService> {
  if (!journalsServiceInstance) {
    journalsServiceInstance = await createJournalsService();
  }
  return journalsServiceInstance;
}

/**
 * Export service methods
 */
export async function createManualJournalEntry(
  data: ManualJournalEntryCreateRequest,
  userId?: number
): Promise<JournalBatchResponse> {
  const service = await getJournalsService();
  return service.createManualEntry(data, userId);
}

export async function getJournalBatch(
  batchId: number,
  companyId: number
): Promise<JournalBatchResponse> {
  const service = await getJournalsService();
  return service.getJournalBatch(batchId, companyId);
}

export async function listJournalBatches(
  filters: JournalListQuery
): Promise<JournalBatchResponse[]> {
  const service = await getJournalsService();
  return service.listJournalBatches(filters);
}

/**
 * Export error classes
 */
export {
  JournalNotBalancedError,
  JournalNotFoundError,
  InvalidJournalLineError
} from "@jurnapod/modules-accounting";
