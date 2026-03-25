// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Pull Types
 * 
 * Shared types for sync pull business logic.
 * These types have zero HTTP knowledge - they are plain data structures.
 */

import type { SyncPullPayload } from "@jurnapod/shared";

// ============================================================================
// Constants
// ============================================================================

export const SYNC_PULL_AUDIT_ACTION = "SYNC_PULL";

// ============================================================================
// Request/Response Types
// ============================================================================

export type SyncPullRequest = {
  outlet_id: number;
  since_version: number;
  orders_cursor?: number;
};

export type SyncPullResult = {
  payload: SyncPullPayload;
  auditEventId?: bigint;
  durationMs: number;
};

// ============================================================================
// Orchestrator Types
// ============================================================================

export type OrchestrateSyncPullParams = {
  companyId: number;
  outletId: number;
  sinceVersion: number;
  ordersCursor: number;
  tier?: string;
};

export type OrchestrateSyncPullResult = {
  payload: SyncPullPayload;
  itemsCount: number;
};
