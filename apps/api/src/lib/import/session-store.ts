// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Session Store
 *
 * MySQL-backed persistent storage for import upload sessions.
 * Replaces the in-memory Map that was not safe for multi-instance deployments.
 *
 * Sessions expire after 30 minutes (enforced via `expires_at` column).
 * Cleanup of expired rows runs at startup and can be triggered on demand.
 */

import type { Pool, RowDataPacket } from "mysql2/promise";

// Session TTL: 30 minutes in milliseconds
const SESSION_TTL_MS = 30 * 60 * 1000;

export interface StoredSession {
  sessionId: string;
  companyId: number;
  entityType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Create a new import session in the database.
 * Returns the session ID.
 */
export async function createSession(
  pool: Pool,
  sessionId: string,
  companyId: number,
  entityType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await pool.execute(
    `INSERT INTO import_sessions (session_id, company_id, entity_type, payload, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, companyId, entityType, JSON.stringify(payload), now, expiresAt]
  );
}

/**
 * Retrieve a session by ID.
 * Returns null if not found or expired.
 * Enforces company-scoped isolation.
 */
export async function getSession(
  pool: Pool,
  sessionId: string,
  companyId: number
): Promise<StoredSession | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT session_id, company_id, entity_type, payload, created_at, expires_at
     FROM import_sessions
     WHERE session_id = ? AND company_id = ? AND expires_at > NOW()`,
    [sessionId, companyId]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    sessionId: String(row.session_id),
    companyId: Number(row.company_id),
    entityType: String(row.entity_type),
    payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
  };
}

/**
 * Update the payload of an existing session.
 * Does not extend TTL — sessions have a fixed expiry from creation.
 */
export async function updateSession(
  pool: Pool,
  sessionId: string,
  companyId: number,
  payload: Record<string, unknown>
): Promise<void> {
  await pool.execute(
    `UPDATE import_sessions SET payload = ? WHERE session_id = ? AND company_id = ? AND expires_at > NOW()`,
    [JSON.stringify(payload), sessionId, companyId]
  );
}

/**
 * Delete a session explicitly (e.g., after successful apply).
 */
export async function deleteSession(
  pool: Pool,
  sessionId: string,
  companyId: number
): Promise<void> {
  await pool.execute(
    `DELETE FROM import_sessions WHERE session_id = ? AND company_id = ?`,
    [sessionId, companyId]
  );
}

/**
 * Delete all expired sessions.
 * Should be called at API startup and periodically.
 * Returns the number of rows deleted.
 */
export async function cleanupExpiredSessions(pool: Pool): Promise<number> {
  const [result] = await pool.execute(
    `DELETE FROM import_sessions WHERE expires_at <= NOW()`
  ) as [{ affectedRows: number }, unknown];

  const count = result.affectedRows;
  if (count > 0) {
    console.info(`[import-sessions] Cleaned up ${count} expired session(s)`);
  }
  return count;
}
