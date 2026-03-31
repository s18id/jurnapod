// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Session Store
 *
 * Kysely-backed persistent storage for import upload sessions.
 * Replaces the in-memory Map that was not safe for multi-instance deployments.
 *
 * Sessions expire after 30 minutes (enforced via `expires_at` column).
 * Cleanup of expired rows runs at startup and can be triggered on demand.
 *
 * Story 8.1: Import Resume/Checkpoint
 * - checkpoint_data: JSON with last successful batch info
 * - file_hash: SHA-256 hash for file integrity on resume
 */

import { createHash } from "node:crypto";
import { sql } from "kysely";
import { getDb } from "../db.js";

// Session TTL: 30 minutes in milliseconds
export const SESSION_TTL_MS = 30 * 60 * 1000;

// Checkpoint data interface for import resume
export interface CheckpointData {
  lastSuccessfulBatchNumber: number;
  rowsCommitted: number;
  timestamp: string; // ISO 8601
  validationHash?: string;
}

/**
 * Extended session interface with checkpoint support
 */
export interface StoredSession {
  sessionId: string;
  companyId: number;
  entityType: string;
  payload: Record<string, unknown>;
  checkpointData?: CheckpointData | null;
  fileHash?: string | null;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Create a new import session in the database.
 * Returns the session ID.
 */
export async function createSession(
  sessionId: string,
  companyId: number,
  entityType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const db = getDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await sql`
    INSERT INTO import_sessions (session_id, company_id, entity_type, payload, created_at, expires_at)
    VALUES (${sessionId}, ${companyId}, ${entityType}, ${JSON.stringify(payload)}, ${now}, ${expiresAt})
  `.execute(db);
}

/**
 * Retrieve a session by ID.
 * Returns null if not found or expired.
 * Enforces company-scoped isolation.
 */
export async function getSession(
  sessionId: string,
  companyId: number
): Promise<StoredSession | null> {
  const db = getDb();

  const rows = await sql`
    SELECT session_id, company_id, entity_type, payload, checkpoint_data, file_hash, created_at, expires_at
    FROM import_sessions
    WHERE session_id = ${sessionId} AND company_id = ${companyId} AND expires_at > NOW()
  `.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }

  const row = rows.rows[0] as Record<string, unknown>;
  return {
    sessionId: String(row.session_id),
    companyId: Number(row.company_id),
    entityType: String(row.entity_type),
    payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
    checkpointData: row.checkpoint_data
      ? (typeof row.checkpoint_data === "string" ? JSON.parse(row.checkpoint_data) : row.checkpoint_data)
      : null,
    fileHash: row.file_hash ? String(row.file_hash) : null,
    createdAt: new Date(row.created_at as string | number | Date),
    expiresAt: new Date(row.expires_at as string | number | Date),
  };
}

/**
 * Update the payload of an existing session.
 * Does not extend TTL — sessions have a fixed expiry from creation.
 */
export async function updateSession(
  sessionId: string,
  companyId: number,
  payload: Record<string, unknown>
): Promise<void> {
  const db = getDb();

  await sql`
    UPDATE import_sessions SET payload = ${JSON.stringify(payload)} 
    WHERE session_id = ${sessionId} AND company_id = ${companyId} AND expires_at > NOW()
  `.execute(db);
}

/**
 * Update checkpoint data after a successful batch commit.
 * Records batch number, row count, and timestamp.
 *
 * @param sessionId - Session ID
 * @param companyId - Company ID for tenant isolation
 * @param checkpoint - Checkpoint data to persist
 */
export async function updateCheckpoint(
  sessionId: string,
  companyId: number,
  checkpoint: CheckpointData
): Promise<void> {
  const db = getDb();

  await sql`
    UPDATE import_sessions 
    SET checkpoint_data = ${JSON.stringify(checkpoint)}
    WHERE session_id = ${sessionId} AND company_id = ${companyId} AND expires_at > NOW()
  `.execute(db);
}

/**
 * Clear checkpoint data (after successful completion or explicit cancel).
 */
export async function clearCheckpoint(
  sessionId: string,
  companyId: number
): Promise<void> {
  const db = getDb();

  await sql`
    UPDATE import_sessions 
    SET checkpoint_data = NULL 
    WHERE session_id = ${sessionId} AND company_id = ${companyId}
  `.execute(db);
}

/**
 * Update file hash for integrity verification on resume.
 * Should be called during upload phase.
 */
export async function updateFileHash(
  sessionId: string,
  companyId: number,
  fileHash: string
): Promise<void> {
  const db = getDb();

  await sql`
    UPDATE import_sessions 
    SET file_hash = ${fileHash}
    WHERE session_id = ${sessionId} AND company_id = ${companyId}
  `.execute(db);
}

/**
 * Compute SHA-256 hash of file buffer for integrity verification.
 * Returns lowercase hex string (64 characters).
 */
export function computeFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Check if a session can be resumed (has checkpoint and not expired).
 * Returns the checkpoint data if resumable.
 */
export async function getCheckpoint(
  sessionId: string,
  companyId: number
): Promise<CheckpointData | null> {
  const db = getDb();

  const rows = await sql`
    SELECT checkpoint_data, expires_at 
    FROM import_sessions 
    WHERE session_id = ${sessionId} AND company_id = ${companyId} AND expires_at > NOW()
  `.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }

  const row = rows.rows[0] as Record<string, unknown>;
  if (!row.checkpoint_data) {
    return null;
  }

  return typeof row.checkpoint_data === "string"
    ? JSON.parse(row.checkpoint_data) as CheckpointData
    : (row.checkpoint_data as CheckpointData);
}

/**
 * Delete a session explicitly (e.g., after successful apply).
 */
export async function deleteSession(
  sessionId: string,
  companyId: number
): Promise<void> {
  const db = getDb();

  await sql`
    DELETE FROM import_sessions WHERE session_id = ${sessionId} AND company_id = ${companyId}
  `.execute(db);
}

/**
 * Delete all expired sessions.
 * Should be called at API startup and periodically.
 * Returns the number of rows deleted.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const db = getDb();

  const result = await sql`
    DELETE FROM import_sessions WHERE expires_at <= NOW()
  `.execute(db);

  const count = Number(result.numAffectedRows ?? 0);
  if (count > 0) {
    console.info(`[import-sessions] Cleaned up ${count} expired session(s)`);
  }
  return count;
}
