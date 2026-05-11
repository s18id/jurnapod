// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import { AuditService } from "../audit-service.js";
import type { AuditContext } from "../audit-service.js";
import type { AuditAction, AuditEntityType } from "@jurnapod/shared";

/**
 * Fixture for audit_logs table (platform domain).
 *
 * Creates an audit log entry through the production AuditService.
 * Uses `logAction()` to support arbitrary action strings needed
 * by test callers (e.g., story-specific sentinel actions).
 */
export interface AuditLogFixture {
  id: number;
}

export interface CreateTestAuditLogOpts {
  companyId: number;
  userId: number;
  action: string;
  success: boolean;
  result?: string;
  payloadJson?: string;
  /** Entity type for the audit entry. Defaults to "setting". */
  entityType?: AuditEntityType;
  /** Affected entity ID. Defaults to 0. */
  entityId?: string | number;
  /** Outlet ID. Defaults to null. */
  outletId?: number | null;
}

export async function createTestAuditLog(
  db: KyselySchema,
  opts: CreateTestAuditLogOpts,
): Promise<AuditLogFixture> {
  const auditService = new AuditService(db);

  const {
    companyId,
    userId,
    action,
    success,
    result = success ? "SUCCESS" : "FAIL",
    payloadJson = success ? '{"test":"success"}' : '{"test":"fail"}',
    entityType = "setting",
    entityId = 0,
    outletId = null,
  } = opts;

  const context: AuditContext = {
    company_id: companyId,
    user_id: userId,
    outlet_id: outletId,
    ip_address: null,
  };

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    payload = { raw: payloadJson };
  }

  // logAction supports arbitrary action strings (e.g. story sentinel values)
  // that logCreate() cannot express. Both are production AuditService methods.
  const status = success ? 1 : 0;
  await auditService.logAction(
    context,
    entityType,
    entityId,
    action as AuditAction,
    payload,
    result as "SUCCESS" | "FAIL",
    status as 0 | 1,
  );

  const idResult = await sql<{ id: number }>`
    SELECT LAST_INSERT_ID() as id
  `.execute(db);

  return {
    id: Number(idResult.rows[0].id),
  };
}
