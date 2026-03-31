// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { AuditService, type AuditDbClient } from "@jurnapod/modules-platform";
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
