// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Table Sync Module - Types
 *
 * Interface-based types for table sync operations.
 * These types are used to decouple the domain from transport concerns.
 */

import type {
  TableSyncPushRequest,
  TableSyncConflictPayload,
} from "@jurnapod/shared";

// ============================================================================
// PUSH TYPES
// ============================================================================

/**
 * Parameters for pushing table events from POS to API
 * Used by POS devices to sync offline table operations
 */
export interface PushTableEventsParams {
  companyId: number;
  outletId: number;
  events: TableSyncPushRequest['events'];
  actorId: number;
}

/**
 * Individual push result per event
 */
export interface PushTableEventResult {
  clientTxId: string;
  status: 'OK' | 'DUPLICATE' | 'ERROR' | 'CONFLICT';
  tableVersion?: number;
  conflictPayload?: TableSyncConflictPayload;
  errorMessage?: string;
}

/**
 * Result of pushing table events
 */
export interface PushTableEventsResult {
  results: PushTableEventResult[];
  syncTimestamp: string;
}

// ============================================================================
// PULL TYPES
// ============================================================================

/**
 * Parameters for pulling table state from API to POS
 * Used by POS devices to sync down current table state
 */
export interface PullTableStateParams {
  companyId: number;
  outletId: number;
  cursor?: string;
  limit?: number;
}

/**
 * Table snapshot returned in pull response
 */
export interface PullTableStateSnapshot {
  tableId: number;
  tableNumber: string;
  status: number; // TABLE_STATUSES constant
  currentSessionId: number | null;
  version: number;
  stalenessMs: number;
}

/**
 * Incremental event returned in pull response
 */
export interface PullTableStateEvent {
  id: number;
  tableId: number;
  eventType: string;
  payload: unknown;
  recordedAt: string;
}

/**
 * Result of pulling table state
 */
export interface PullTableStateResult {
  tables: PullTableStateSnapshot[];
  events: PullTableStateEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  syncTimestamp: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error types for table sync operations
 */
export class TableSyncValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TableSyncValidationError';
  }
}

export class TableSyncConflictError extends Error {
  constructor(
    message: string,
    public readonly conflictPayload: TableSyncConflictPayload
  ) {
    super(message);
    this.name = 'TableSyncConflictError';
  }
}

export class TableSyncNotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'TableSyncNotFoundError';
  }
}
