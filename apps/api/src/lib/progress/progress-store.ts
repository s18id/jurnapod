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

// Use relative imports for DB
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

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

/**
 * Database row representation
 */
interface OperationProgressRow extends RowDataPacket {
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
}

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
 * Pool reference for fire-and-forget updates
 * Set during module initialization
 */
let progressPool: Pool | null = null;

/**
 * Clear all tracking state
 * Used for test isolation
 */
export function clearProgressTracking(): void {
  lastUpdateTimes.clear();
  lastMilestones.clear();
}

/**
 * Set the database pool for progress operations
 * Called during server initialization
 */
export function setProgressPool(pool: Pool): void {
  progressPool = pool;
}

/**
 * Get the database pool for progress operations
 */
function getPool(): Pool {
  if (!progressPool) {
    throw new Error("Progress pool not initialized. Call setProgressPool() first.");
  }
  return progressPool;
}

// ============================================================================
// Core CRUD Operations
// ============================================================================

/**
 * Start tracking a new operation
 */
export async function startProgress(input: StartProgressInput): Promise<void> {
  const pool = getPool();

  await pool.execute<ResultSetHeader>(
    `INSERT INTO operation_progress (
      operation_id, operation_type, company_id, total_units, completed_units,
      status, started_at, updated_at, details
    ) VALUES (?, ?, ?, ?, 0, 'running', NOW(), NOW(), ?)`,
    [
      input.operationId,
      input.operationType,
      input.companyId,
      input.totalUnits,
      input.details ? JSON.stringify(input.details) : null,
    ]
  );

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
  const pool = getPool();

  const [rows] = await pool.execute<OperationProgressRow[]>(
    `SELECT operation_id, operation_type, company_id, total_units, completed_units,
            status, started_at, updated_at, completed_at, details
     FROM operation_progress
     WHERE operation_id = ? AND company_id = ?`,
    [operationId, companyId]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapRowToProgress(rows[0]);
}

/**
 * Update progress for an operation
 * Returns true if update was persisted, false if skipped (not yet at milestone/interval)
 */
export async function updateProgress(input: UpdateProgressInput): Promise<boolean> {
  const pool = getPool();
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

  // Build update query
  const updateParts: string[] = [
    "completed_units = ?",
    "updated_at = NOW()",
  ];
  const params: (string | number)[] = [completedUnits];

  if (details) {
    updateParts.push("details = ?");
    params.push(JSON.stringify(details));
  }

  params.push(operationId, companyId);

  await pool.execute<ResultSetHeader>(
    `UPDATE operation_progress SET ${updateParts.join(", ")} WHERE operation_id = ? AND company_id = ?`,
    params
  );

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
  const pool = getPool();
  const { operationId, companyId, details } = input;

  // Get current progress to ensure it exists
  const current = await getProgress(operationId, companyId);
  if (!current) {
    return;
  }

  // Update to completed status with 100% progress
  const updateParts: string[] = [
    "completed_units = total_units",
    "status = 'completed'",
    "updated_at = NOW()",
    "completed_at = NOW()",
  ];
  const params: (string | number)[] = [];

  if (details) {
    updateParts.push("details = ?");
    params.push(JSON.stringify(details));
  }

  params.push(operationId, companyId);

  await pool.execute<ResultSetHeader>(
    `UPDATE operation_progress SET ${updateParts.join(", ")} WHERE operation_id = ? AND company_id = ?`,
    params
  );

  // Cleanup tracking state
  lastUpdateTimes.delete(operationId);
  lastMilestones.delete(operationId);
}

/**
 * Mark an operation as failed
 */
export async function failProgress(input: FailProgressInput): Promise<void> {
  const pool = getPool();
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

  await pool.execute<ResultSetHeader>(
    `UPDATE operation_progress
     SET status = 'failed', updated_at = NOW(), completed_at = NOW(), details = ?
     WHERE operation_id = ? AND company_id = ?`,
    [JSON.stringify(errorDetails), operationId, companyId]
  );

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
  const pool = getPool();

  await pool.execute<ResultSetHeader>(
    `UPDATE operation_progress
     SET status = 'cancelled', updated_at = NOW(), completed_at = NOW()
     WHERE operation_id = ? AND company_id = ?`,
    [operationId, companyId]
  );

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
  const pool = getPool();

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT operation_id
     FROM operation_progress
     WHERE status = 'running'
       AND updated_at < DATE_SUB(NOW(), INTERVAL ? SECOND)`,
    [Math.floor(STALE_THRESHOLD_MS / 1000)]
  );

  return rows.map((row) => String(row.operation_id));
}

/**
 * Mark all stale operations as failed
 * Should be called at server startup
 * Returns the count of operations marked as failed
 */
export async function cleanupStaleOperations(): Promise<number> {
  const pool = getPool();

  const staleIds = await findStaleOperations();

  if (staleIds.length === 0) {
    return 0;
  }

  const placeholders = staleIds.map(() => "?").join(",");
  // Use MySQL NOW() for datetime to avoid format issues
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE operation_progress
     SET status = 'failed',
         completed_at = NOW(),
         details = JSON_SET(COALESCE(details, '{}'), '$.error', 'Operation timed out after server restart')
     WHERE operation_id IN (${placeholders}) AND status = 'running'`,
    staleIds
  );

  const count = result.affectedRows;
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
  const pool = getPool();

  const conditions: string[] = ["company_id = ?"];
  const params: (number | string)[] = [companyId];

  if (options?.status) {
    conditions.push("status = ?");
    params.push(options.status);
  }

  if (options?.type) {
    conditions.push("operation_type = ?");
    params.push(options.type);
  }

  const whereClause = conditions.join(" AND ");

  // Get total count
  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM operation_progress WHERE ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total ?? 0);

  // Get paginated results
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const [rows] = await pool.execute<OperationProgressRow[]>(
    `SELECT operation_id, operation_type, company_id, total_units, completed_units,
            status, started_at, updated_at, completed_at, details
     FROM operation_progress
     WHERE ${whereClause}
     ORDER BY started_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    operations: rows.map(mapRowToProgress),
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
function mapRowToProgress(row: OperationProgressRow): OperationProgress {
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
