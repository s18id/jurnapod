// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Progress Persistence Store
 *
 * MySQL-backed persistent storage for long-running operation progress.
 * Survives server restarts and enables real-time progress tracking.
 *
 * Story 8.3: Progress Persistence for Long-Running Operations
 *
 * Features:
 * - Persistent progress tracking in database
 * - Async fire-and-forget updates to avoid blocking operations
 * - Milestone-based updates (10%, 25%, 50%, 75%, 90%, 100%)
 * - Company-scoped isolation
 * - Stale operation cleanup on restart
 */

import { getDb, type KyselySchema } from "@/lib/db";
import { sql } from "kysely";

// ============================================================================
// Types
// ============================================================================

/**
 * Operation types supported by the progress tracker
 */
export type OperationType = "import" | "export" | "batch_update";

/**
 * Operation status values
 */
export type OperationStatus = "running" | "completed" | "failed" | "cancelled";

/**
 * Progress data stored in database
 */
export interface OperationProgress {
  operationId: string;
  operationType: OperationType;
  companyId: number;
  totalUnits: number;
  completedUnits: number;
  status: OperationStatus;
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
  details?: Record<string, unknown> | null;
}

/**
 * Input for starting a new operation
 */
export interface StartProgressInput {
  operationId: string;
  operationType: OperationType;
  companyId: number;
  totalUnits: number;
  details?: Record<string, unknown>;
}

/**
 * Input for updating progress
 */
export interface UpdateProgressInput {
  operationId: string;
  companyId: number;
  completedUnits: number;
  details?: Record<string, unknown>;
}

/**
 * Input for completing an operation
 */
export interface CompleteProgressInput {
  operationId: string;
  companyId: number;
  details?: Record<string, unknown>;
};

/**
 * Input for failing an operation
 */
export interface FailProgressInput {
  operationId: string;
  companyId: number;
  error?: string;
  details?: Record<string, unknown>;
};

// ============================================================================
// Constants
// ============================================================================

/**
 * Stale operation threshold: 2 hours in milliseconds
 */
export const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

/**
 * Milestone thresholds for progress updates
 * Updates are persisted at these percentage points
 */
const MILESTONE_PERCENTAGES = [10, 25, 50, 75, 90, 100] as const;

/**
 * Minimum interval between progress updates (5 seconds)
 */
export const MIN_UPDATE_INTERVAL_MS = 5000;

// ============================================================================
// Internal State for Fire-and-Forget
// ============================================================================

/**
 * Tracks last update times for each operation (in-memory)
 * Used to implement minimum update interval
 */
const lastUpdateTimes = new Map<string, number>();

/**
 * Tracks last milestone percentage reached for each operation
 * Used to detect when a new milestone is reached
 */
const lastMilestones = new Map<string, number>();

/**
 * Clear all tracking state
 * Used for test isolation
 */
export function clearProgressTracking(): void {
  lastUpdateTimes.clear();
  lastMilestones.clear();
}

// ============================================================================
// Core CRUD Operations
// ============================================================================

/**
 * Start tracking a new operation
 */
export async function startProgress(input: StartProgressInput): Promise<void> {
  const db = getDb();

  await sql`
    INSERT INTO operation_progress (
      operation_id, operation_type, company_id, total_units, completed_units,
      status, started_at, updated_at, details
    ) VALUES (
      ${input.operationId}, ${input.operationType}, ${input.companyId}, ${input.totalUnits}, 0,
      'running', NOW(), NOW(), ${input.details ? JSON.stringify(input.details) : null}
    )
  `.execute(db);

  // Initialize tracking state
  lastUpdateTimes.set(input.operationId, Date.now());
  lastMilestones.set(input.operationId, 0);
}

/**
 * Get progress for an operation
 * Returns null if not found or not accessible
 */
export async function getProgress(
  operationId: string,
  companyId: number
): Promise<OperationProgress | null> {
  const db = getDb();

  const rows = await sql<{
    operation_id: string;
    operation_type: string;
    company_id: number;
    total_units: number;
    completed_units: number;
    status: string;
    started_at: Date;
    updated_at: Date;
    completed_at: Date | null;
    details: string | null;
  }>`
    SELECT operation_id, operation_type, company_id, total_units, completed_units,
           status, started_at, updated_at, completed_at, details
     FROM operation_progress
     WHERE operation_id = ${operationId} AND company_id = ${companyId}
  `.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }

  return mapRowToProgress(rows.rows[0]);
}

/**
 * Update progress for an operation
 * Returns true if update was persisted, false if skipped (not yet at milestone/interval)
 */
export async function updateProgress(input: UpdateProgressInput): Promise<boolean> {
  const db = getDb();
  const { operationId, companyId, completedUnits, details } = input;

  // Get current progress
  const current = await getProgress(operationId, companyId);
  if (!current) {
    return false;
  }

  // Calculate percentage
  const percentage = current.totalUnits > 0
    ? Math.round((completedUnits / current.totalUnits) * 100)
    : 0;

  // Check if we should persist this update
  const shouldPersist = shouldPersistUpdate(
    operationId,
    percentage,
    current.totalUnits
  );

  if (!shouldPersist) {
    return false;
  }

  // Build update query using sql template
  if (details) {
    await sql`
      UPDATE operation_progress 
      SET completed_units = ${completedUnits},
          updated_at = NOW(),
          details = ${JSON.stringify(details)}
      WHERE operation_id = ${operationId} AND company_id = ${companyId}
    `.execute(db);
  } else {
    await sql`
      UPDATE operation_progress 
      SET completed_units = ${completedUnits},
          updated_at = NOW()
      WHERE operation_id = ${operationId} AND company_id = ${companyId}
    `.execute(db);
  }

  // Update tracking state
  lastUpdateTimes.set(operationId, Date.now());
  lastMilestones.set(operationId, percentage);

  return true;
}

/**
 * Fire-and-forget progress update
 * Updates are throttled based on milestones and time interval
 * Does not block the calling operation
 */
export function updateProgressAsync(input: UpdateProgressInput): void {
  // Fire-and-forget: don't await, just start the promise
  updateProgress(input).catch((error) => {
    console.error(`[progress] Async update failed for operation ${input.operationId}:`, error);
  });
}

/**
 * Mark an operation as completed
 */
export async function completeProgress(input: CompleteProgressInput): Promise<void> {
  const db = getDb();
  const { operationId, companyId, details } = input;

  // Get current progress to ensure it exists
  const current = await getProgress(operationId, companyId);
  if (!current) {
    return;
  }

  // Build update query using sql template
  if (details) {
    await sql`
      UPDATE operation_progress 
      SET completed_units = total_units,
          status = 'completed',
          updated_at = NOW(),
          completed_at = NOW(),
          details = ${JSON.stringify(details)}
      WHERE operation_id = ${operationId} AND company_id = ${companyId}
    `.execute(db);
  } else {
    await sql`
      UPDATE operation_progress 
      SET completed_units = total_units,
          status = 'completed',
          updated_at = NOW(),
          completed_at = NOW()
      WHERE operation_id = ${operationId} AND company_id = ${companyId}
    `.execute(db);
  }

  // Cleanup tracking state
  lastUpdateTimes.delete(operationId);
  lastMilestones.delete(operationId);
}

/**
 * Mark an operation as failed
 */
export async function failProgress(input: FailProgressInput): Promise<void> {
  const db = getDb();
  const { operationId, companyId, error, details } = input;

  // Get current details to merge with
  const current = await getProgress(operationId, companyId);
  
  // Build error details by merging existing details with new ones
  const errorDetails: Record<string, unknown> = {
    ...(current?.details || {}),
    ...(details || {}),
  };

  if (error) {
    errorDetails.error = error;
    errorDetails.failedAt = new Date().toISOString();
  }

  await sql`
    UPDATE operation_progress
    SET status = 'failed', updated_at = NOW(), completed_at = NOW(), details = ${JSON.stringify(errorDetails)}
    WHERE operation_id = ${operationId} AND company_id = ${companyId}
  `.execute(db);

  // Cleanup tracking state
  lastUpdateTimes.delete(operationId);
  lastMilestones.delete(operationId);
}

/**
 * Cancel an operation (mark as cancelled)
 */
export async function cancelProgress(
  operationId: string,
  companyId: number
): Promise<void> {
  const db = getDb();

  await sql`
    UPDATE operation_progress
    SET status = 'cancelled', updated_at = NOW(), completed_at = NOW()
    WHERE operation_id = ${operationId} AND company_id = ${companyId}
  `.execute(db);

  // Cleanup tracking state
  lastUpdateTimes.delete(operationId);
  lastMilestones.delete(operationId);
}

// ============================================================================
// Stale Operation Cleanup
// ============================================================================

/**
 * Find stale operations that should be marked as failed
 * Returns the count of stale operations found
 */
export async function findStaleOperations(): Promise<string[]> {
  const db = getDb();

  const rows = await sql<{ operation_id: string }>`
    SELECT operation_id
     FROM operation_progress
     WHERE status = 'running'
       AND updated_at < DATE_SUB(NOW(), INTERVAL ${Math.floor(STALE_THRESHOLD_MS / 1000)} SECOND)
  `.execute(db);

  return rows.rows.map((row) => String(row.operation_id));
}

/**
 * Mark all stale operations as failed
 * Should be called at server startup
 * Returns the count of operations marked as failed
 */
export async function cleanupStaleOperations(): Promise<number> {
  const db = getDb();

  const staleIds = await findStaleOperations();

  if (staleIds.length === 0) {
    return 0;
  }

  // Use MySQL NOW() for datetime to avoid format issues
  const result = await sql`
    UPDATE operation_progress
    SET status = 'failed',
        completed_at = NOW(),
        details = JSON_SET(COALESCE(details, '{}'), '$.error', 'Operation timed out after server restart')
    WHERE operation_id IN (${sql.join(staleIds.map(id => sql`${id}`), sql`, `)}) AND status = 'running'
  `.execute(db);

  const count = Number(result.numAffectedRows ?? 0);
  if (count > 0) {
    console.info(`[progress] Marked ${count} stale operation(s) as failed on startup`);
  }

  // Cleanup tracking state for stale operations
  for (const id of staleIds) {
    lastUpdateTimes.delete(id);
    lastMilestones.delete(id);
  }

  return count;
}

/**
 * Get all operations for a company
 * Used for listing active/completed operations
 */
export async function listProgress(
  companyId: number,
  options?: {
    status?: OperationStatus;
    type?: OperationType;
    limit?: number;
    offset?: number;
  }
): Promise<{ operations: OperationProgress[]; total: number }> {
  const db = getDb();

  const conditions: Array<ReturnType<typeof sql>> = [sql`company_id = ${companyId}`];

  if (options?.status) {
    conditions.push(sql`status = ${options.status}`);
  }

  if (options?.type) {
    conditions.push(sql`operation_type = ${options.type}`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  // Get total count
  const countResult = await sql<{ total: number }>`
    SELECT COUNT(*) as total FROM operation_progress WHERE ${whereClause}
  `.execute(db);
  const total = Number(countResult.rows[0]?.total ?? 0);

  // Get paginated results
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const rows = await sql<{
    operation_id: string;
    operation_type: string;
    company_id: number;
    total_units: number;
    completed_units: number;
    status: string;
    started_at: Date;
    updated_at: Date;
    completed_at: Date | null;
    details: string | null;
  }>`
    SELECT operation_id, operation_type, company_id, total_units, completed_units,
           status, started_at, updated_at, completed_at, details
     FROM operation_progress
     WHERE ${whereClause}
     ORDER BY started_at DESC
     LIMIT ${limit} OFFSET ${offset}
  `.execute(db);

  return {
    operations: rows.rows.map(mapRowToProgress),
    total,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine if an update should be persisted based on
 * minimum interval and milestone thresholds
 */
function shouldPersistUpdate(
  operationId: string,
  newPercentage: number,
  totalUnits: number
): boolean {
  const now = Date.now();
  const lastUpdate = lastUpdateTimes.get(operationId) ?? 0;
  const lastMilestone = lastMilestones.get(operationId) ?? 0;

  // Always persist if time interval has passed
  if (now - lastUpdate >= MIN_UPDATE_INTERVAL_MS) {
    return true;
  }

  // Check if a new milestone threshold was crossed
  for (const milestone of MILESTONE_PERCENTAGES) {
    if (newPercentage >= milestone && lastMilestone < milestone) {
      return true;
    }
  }

  // Always persist completion (100%)
  if (newPercentage >= 100) {
    return true;
  }

  // Don't persist if neither time nor milestone threshold is met
  return false;
}

/**
 * Map database row to OperationProgress object
 */
function mapRowToProgress(row: {
  operation_id: string;
  operation_type: string;
  company_id: number;
  total_units: number;
  completed_units: number;
  status: string;
  started_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  details: string | null;
}): OperationProgress {
  return {
    operationId: String(row.operation_id),
    operationType: row.operation_type as OperationType,
    companyId: Number(row.company_id),
    totalUnits: Number(row.total_units),
    completedUnits: Number(row.completed_units),
    status: row.status as OperationStatus,
    startedAt: new Date(row.started_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    details: row.details ? JSON.parse(String(row.details)) : null,
  };
}

/**
 * Calculate ETA in seconds based on progress rate
 * Returns null if insufficient data to calculate
 */
export function calculateEta(
  progress: OperationProgress
): number | null {
  const elapsed = progress.updatedAt.getTime() - progress.startedAt.getTime();

  if (elapsed <= 0 || progress.completedUnits <= 0) {
    return null;
  }

  const rate = progress.completedUnits / elapsed; // units per ms
  const remaining = progress.totalUnits - progress.completedUnits;

  if (remaining <= 0) {
    return 0;
  }

  // ETA in seconds
  return Math.ceil(remaining / rate / 1000);
}

/**
 * Calculate progress percentage
 */
export function calculatePercentage(progress: OperationProgress): number {
  if (progress.totalUnits <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((progress.completedUnits / progress.totalUnits) * 100));
}
