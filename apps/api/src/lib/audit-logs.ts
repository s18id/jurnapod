// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Thin adapter - core implementation moved to @jurnapod/modules-platform
import { queryAuditLogs as platformQueryAuditLogs } from "@jurnapod/modules-platform/audit";
import { getDb } from "./db";
import type { AuditLogQuery, AuditLogResponse } from "@jurnapod/shared";

/**
 * Query audit logs with filters
 * 
 * This is a thin adapter that delegates to @jurnapod/modules-platform
 */
export async function queryAuditLogs(
  query: AuditLogQuery
): Promise<{ total: number; logs: AuditLogResponse[] }> {
  const db = getDb();
  return platformQueryAuditLogs(db, query);
}
