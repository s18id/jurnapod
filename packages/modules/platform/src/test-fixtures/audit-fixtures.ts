// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

/**
 * Fixture for audit_logs table (platform domain).
 *
 * Creates an audit log entry with deterministic defaults.
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
}

export async function createTestAuditLog(
  db: KyselySchema,
  opts: CreateTestAuditLogOpts,
): Promise<AuditLogFixture> {
  const {
    companyId,
    userId,
    action,
    success,
    result = success ? "SUCCESS" : "FAIL",
    payloadJson = success ? '{"test":"success"}' : '{"test":"fail"}',
  } = opts;

  const successVal = success ? 1 : 0;

  const insertResult = await sql`
    INSERT INTO audit_logs (company_id, user_id, action, result, success, payload_json)
    VALUES (${companyId}, ${userId}, ${action}, ${result}, ${successVal}, ${payloadJson})
  `.execute(db);

  const idResult = await sql<{ id: number }>`
    SELECT LAST_INSERT_ID() as id
  `.execute(db);

  return {
    id: Number(idResult.rows[0].id),
  };
}
