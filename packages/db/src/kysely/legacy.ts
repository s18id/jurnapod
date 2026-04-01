// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// This file contains deprecated table definitions that have been archived.
// These types are kept for reference only and should not be used in new code.

import type { ColumnType } from "kysely";

export type Decimal = ColumnType<string, number | string, number | string>;
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

/**
 * @deprecated Archived - was used for analytics insights data
 * Dropped in Epic 20 (Story 20.9) - table had no data
 */
export interface AnalyticsInsights {
  calculated_at: Generated<Date>;
  company_id: number;
  description: string;
  expires_at: Date;
  id: Generated<number>;
  insight_type: "ANOMALY" | "PEAK_HOURS" | "SEASONALITY" | "TOP_PRODUCTS" | "TREND" | "UNDERPERFORMING";
  metric_name: string;
  metric_value: Decimal;
  outlet_id: Generated<number | null>;
  recommendation: Generated<string | null>;
  reference_period: string;
  severity: Generated<"CRITICAL" | "INFO" | "WARNING">;
}

/**
 * @deprecated Archived - was used for user-outlet assignments
 * Note: User outlet access is now determined by role assignments (user_role_assignments table)
 * 
 * BLOCKED: This table has 214 rows of data and CANNOT be dropped per Story 20.9 rules.
 * The table remains in schema.ts and the database until data is migrated or cleaned up.
 */
export interface UserOutlets {
  created_at: Generated<Date>;
  outlet_id: number;
  user_id: number;
}

/**
 * @deprecated Archived - was used for tracking sync operations
 * 
 * BLOCKED: This table is actively referenced by data-retention.job.ts for cleanup operations.
 * The epic incorrectly classified this as "unused" - it is actively used.
 * Table cannot be dropped without updating the data retention job first.
 */
export interface SyncOperations {
  company_id: number;
  completed_at: Generated<Date | null>;
  data_version_after: Generated<number | null>;
  data_version_before: Generated<number | null>;
  duration_ms: Generated<number | null>;
  error_message: Generated<string | null>;
  id: Generated<number>;
  operation_type: "BATCH" | "PULL" | "PUSH" | "RECONCILE";
  outlet_id: Generated<number | null>;
  records_processed: Generated<number | null>;
  request_id: string;
  result_summary: Generated<string | null>;
  started_at: Generated<Date>;
  status: Generated<"CANCELLED" | "FAILED" | "RUNNING" | "SUCCESS">;
  sync_module: "BACKOFFICE" | "POS";
  tier: "ADMIN" | "ANALYTICS" | "MASTER" | "OPERATIONAL" | "REALTIME";
}
