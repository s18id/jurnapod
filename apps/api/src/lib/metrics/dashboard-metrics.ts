// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// =============================================================================
// DASHBOARD METRICS ADAPTER
// =============================================================================
// This is a thin adapter that re-exports from the package runtime.
// The package runtime is the single source of truth for dashboard snapshots.
// =============================================================================

import { register } from "prom-client";

import {
  getOutboxMetricsSnapshot as pkgGetOutboxMetricsSnapshot,
  getSyncHealthMetricsSnapshot as pkgGetSyncHealthMetricsSnapshot,
  getJournalHealthMetricsSnapshot as pkgGetJournalHealthMetricsSnapshot,
  type OutboxMetricsSnapshot as PackageOutboxMetricsSnapshot,
  type SyncHealthMetricsSnapshot as PackageSyncHealthMetricsSnapshot,
  type JournalHealthMetricsSnapshot as PackageJournalHealthMetricsSnapshot,
} from "@jurnapod/telemetry/runtime";

// Re-export types for backwards compatibility
export type OutboxMetricsSnapshot = PackageOutboxMetricsSnapshot;
export type SyncHealthMetricsSnapshot = PackageSyncHealthMetricsSnapshot;
export type JournalHealthMetricsSnapshot = PackageJournalHealthMetricsSnapshot;

/**
 * Get outbox metrics snapshot from prom-client registry
 * @param companyId - Optional company ID to filter metrics by tenant.
 *                   If provided, only metrics for this company are returned.
 *                   If not provided, all metrics are returned (legacy behavior).
 *                   Domain ID (company_id) is converted to string for label matching.
 */
export async function getOutboxMetricsSnapshot(companyId?: number): Promise<OutboxMetricsSnapshot> {
  return pkgGetOutboxMetricsSnapshot(register, companyId);
}

/**
 * Get sync health metrics snapshot from prom-client registry
 * @param companyId - Optional company ID to filter metrics by tenant.
 *                   If provided, only metrics for this company are returned.
 *                   If not provided, all metrics are returned (legacy behavior).
 *                   Domain ID (company_id) is converted to string for label matching.
 */
export async function getSyncHealthMetricsSnapshot(companyId?: number): Promise<SyncHealthMetricsSnapshot> {
  return pkgGetSyncHealthMetricsSnapshot(register, companyId);
}

/**
 * Get journal health metrics snapshot from prom-client registry
 * @param companyId - Optional company ID to filter metrics by tenant.
 *                    If provided, only metrics for this company are returned.
 *                    If not provided, all metrics are returned (legacy behavior).
 *                    Domain ID (company_id) is converted to string for label matching.
 */
export async function getJournalHealthMetricsSnapshot(companyId?: number): Promise<JournalHealthMetricsSnapshot> {
  return pkgGetJournalHealthMetricsSnapshot(register, companyId);
}
