// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { AuditService, type AuditDbClient } from "@jurnapod/modules-platform";
import { PeriodTransitionAuditService } from "@jurnapod/modules-platform/audit/period-transition";
import { getDb } from "./db";

/**
 * Create AuditService instance with Kysely db client
 */
function createAuditService(): AuditService {
  const dbClient = getDb();
  return new AuditService(dbClient as AuditDbClient);
}

// Singleton instance
let auditServiceInstance: AuditService | null = null;

/**
 * Get singleton AuditService instance
 */
export function getAuditService(): AuditService {
  if (!auditServiceInstance) {
    auditServiceInstance = createAuditService();
  }
  return auditServiceInstance;
}

let periodTransitionAuditServiceInstance: PeriodTransitionAuditService | null = null;

/**
 * Get singleton PeriodTransitionAuditService instance.
 */
export function getPeriodTransitionAuditService(): PeriodTransitionAuditService {
  if (!periodTransitionAuditServiceInstance) {
    const db = getDb();
    const auditService = getAuditService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    periodTransitionAuditServiceInstance = new PeriodTransitionAuditService(db, auditService as any);
  }
  return periodTransitionAuditServiceInstance;
}
