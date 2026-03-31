// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import { getDb } from "./db";
import { toRfc3339Required } from "@jurnapod/shared";
import type { AuditLogQuery, AuditLogResponse, AuditStatusCode } from "@jurnapod/shared";

type AuditLogRow = {
  id: number;
  company_id: number | null;
  outlet_id: number | null;
  user_id: number | null;
  entity_type: string | null;
  entity_id: string | null;
  action: string;
  result: "SUCCESS" | "FAIL";
  success: number;
  status: number;
  ip_address: string | null;
  payload_json: string;
  changes_json: string | null;
  created_at: string;
};

function normalizeAuditLog(row: AuditLogRow): AuditLogResponse {
  return {
    id: Number(row.id),
    company_id: row.company_id ?? null,
    outlet_id: row.outlet_id ?? null,
    user_id: row.user_id ?? null,
    entity_type: row.entity_type ?? null,
    entity_id: row.entity_id ?? null,
    action: row.action,
    result: row.result,
    success: row.success === 1,
    status: (row.status ?? (row.success === 1 ? 1 : 0)) as AuditStatusCode, // Default to success/fail if status not available
    ip_address: row.ip_address ?? null,
    payload_json: row.payload_json,
    changes_json: row.changes_json ?? null,
    created_at: toRfc3339Required(row.created_at)
  };
}

export async function queryAuditLogs(
  query: AuditLogQuery
): Promise<{ total: number; logs: AuditLogResponse[] }> {
  const db = getDb();

  // Build conditions using Kysely sql template tag
  const conditions: ReturnType<typeof sql>[] = [];
  conditions.push(sql`company_id = ${query.company_id}`);

  if (query.entity_type) {
    conditions.push(sql`entity_type = ${query.entity_type}`);
  }

  if (query.entity_id) {
    conditions.push(sql`entity_id = ${query.entity_id}`);
  }

  if (query.user_id) {
    conditions.push(sql`user_id = ${query.user_id}`);
  }

  if (query.action) {
    conditions.push(sql`action = ${query.action}`);
  }

  if (query.from_date) {
    conditions.push(sql`created_at >= ${query.from_date}`);
  }

  if (query.to_date) {
    conditions.push(sql`created_at <= ${query.to_date}`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  // Get total count
  const countResult = await sql<{ total: string }>`
    SELECT COUNT(*) as total FROM audit_logs WHERE ${whereClause}
  `.execute(db);
  const total = Number(countResult.rows[0]?.total ?? 0);

  // Get paginated results
  const limit = query.limit ?? 100;
  const offset = query.offset ?? 0;

  const rows = await sql<AuditLogRow>`
    SELECT id, company_id, outlet_id, user_id, entity_type, entity_id,
           action, result, success, status, ip_address, payload_json, changes_json, created_at
    FROM audit_logs
    WHERE ${whereClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit} OFFSET ${offset}
  `.execute(db);

  return {
    total,
    logs: rows.rows.map(normalizeAuditLog)
  };
}
