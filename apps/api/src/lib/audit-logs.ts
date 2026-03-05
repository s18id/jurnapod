// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { RowDataPacket } from "mysql2";
import { getDbPool } from "./db";
import type { AuditLogQuery, AuditLogResponse } from "@jurnapod/shared";

type AuditLogRow = RowDataPacket & {
  id: number;
  company_id: number | null;
  outlet_id: number | null;
  user_id: number | null;
  entity_type: string | null;
  entity_id: string | null;
  action: string;
  result: "SUCCESS" | "FAIL";
  ip_address: string | null;
  payload_json: string;
  changes_json: string | null;
  created_at: Date;
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
    ip_address: row.ip_address ?? null,
    payload_json: row.payload_json,
    changes_json: row.changes_json ?? null,
    created_at: new Date(row.created_at).toISOString()
  };
}

export async function queryAuditLogs(
  query: AuditLogQuery
): Promise<{ total: number; logs: AuditLogResponse[] }> {
  const pool = getDbPool();
  const conditions: string[] = ["company_id = ?"];
  const values: Array<string | number> = [query.company_id];

  if (query.entity_type) {
    conditions.push("entity_type = ?");
    values.push(query.entity_type);
  }

  if (query.entity_id) {
    conditions.push("entity_id = ?");
    values.push(query.entity_id);
  }

  if (query.user_id) {
    conditions.push("user_id = ?");
    values.push(query.user_id);
  }

  if (query.action) {
    conditions.push("action = ?");
    values.push(query.action);
  }

  if (query.from_date) {
    conditions.push("created_at >= ?");
    values.push(query.from_date);
  }

  if (query.to_date) {
    conditions.push("created_at <= ?");
    values.push(query.to_date);
  }

  const whereClause = conditions.join(" AND ");

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM audit_logs WHERE ${whereClause}`,
    values
  );
  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await pool.execute<AuditLogRow[]>(
    `SELECT id, company_id, outlet_id, user_id, entity_type, entity_id,
            action, result, ip_address, payload_json, changes_json, created_at
     FROM audit_logs
     WHERE ${whereClause}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...values, query.limit ?? 100, query.offset ?? 0]
  );

  return {
    total,
    logs: rows.map(normalizeAuditLog)
  };
}
