// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Pure audit log explorer helpers — deterministic query key builder,
// filter serialization, half-open date range conversion, and
// pagination defaults.
//
// All functions are pure; no DB, API, or side effects.
// Backend deny-by-default remains authoritative.
//
// CONTRACT STATUS (Story 66-5 verification, 2026-05-18):
// - Runtime API exposes read-only /api/audit-logs and /api/audit-logs/:id.
// - Backend ACL uses the verified audit-adjacent platform.settings.READ guard.
// - These helpers remain pure and never create audit write paths.

import { dateOnlyToTimestampMs } from "@jurnapod/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default page size for audit log listings (AC5). */
export const AUDIT_DEFAULT_PAGE_SIZE = 25;

/** Maximum page size allowed. */
export const AUDIT_MAX_PAGE_SIZE = 200;

/** Current API endpoint for audit logs (existing contract). */
export const AUDIT_LOGS_ENDPOINT = "/audit-logs";

/** Verified generic audit detail endpoint. */
export const AUDIT_LOG_DETAIL_ENDPOINT_TEMPLATE = "/audit-logs/:id";

/** Runtime/generated contract verification result for Story 66-5. */
export const AUDIT_EXPLORER_CONTRACT = {
  listEndpoint: AUDIT_LOGS_ENDPOINT,
  listVerified: true,
  detailEndpoint: AUDIT_LOG_DETAIL_ENDPOINT_TEMPLATE,
  detailVerified: true,
  periodTransitionEndpoint: "/audit/period-transitions",
  periodTransitionOnly: true,
  actorSelectorEndpoint: "/users",
  actorSelectorVerified: true,
  verifiedPermission: {
    module: "platform",
    resource: "settings",
    permission: "READ",
  },
  permissionNote:
    "platform.settings.READ is the approved Story 66-5 generic audit explorer ACL; a dedicated platform.audit resource is not introduced in this story.",
} as const;

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

export interface AuditFilterInput {
  /** Filter by actor email or user ID */
  actor?: string;
  /** Filter by action type (CREATE, UPDATE, DELETE, VOID, etc.) */
  action?: string;
  /** Filter by entity/object type */
  entityType?: string;
  /** Filter by entity/object type using Story 66-5 terminology */
  objectType?: string;
  /** Filter by entity/object ID */
  entityId?: string;
  /** Filter by actor user ID when actor selector data is available */
  actorUserId?: number;
  /** Explicit company scope */
  companyId?: number;
  /** Explicit outlet scope */
  outletId?: number;
  /** Filter by success status (true = success, false = failure, undefined = all) */
  success?: boolean;
  /** Start of date range (epoch milliseconds, inclusive) */
  startDate?: number;
  /** End of date range (epoch milliseconds, exclusive half-open) */
  endDate?: number;
  /** Page offset */
  offset?: number;
  /** Page size (defaults to AUDIT_DEFAULT_PAGE_SIZE) */
  limit?: number;
}

/**
 * Serialized filter representation used as query params.
 * All values are strings for URL encoding compatibility.
 */
export interface AuditFilterSerialized {
  actor?: string;
  actor_user_id?: string;
  action?: string;
  entity_type?: string;
  object_type?: string;
  entity_id?: string;
  company_id?: string;
  outlet_id?: string;
  success?: string;
  from_ts?: string;
  to_ts?: string;
  offset: string;
  limit: string;
}

// ---------------------------------------------------------------------------
// Query key builder (deterministic)
// ---------------------------------------------------------------------------

/**
 * Build a deterministic React Query key from audit filters.
 * The key is used for cache management in TanStack Query.
 *
 * Format: ["audit-logs", companyId, serializedFilters]
 */
export function buildAuditQueryKey(
  companyId: number,
  filters: AuditFilterInput,
): readonly [string, number, AuditFilterSerialized] {
  return ["audit-logs", companyId, serializeAuditFilters(filters)] as const;
}

// ---------------------------------------------------------------------------
// Filter serialization
// ---------------------------------------------------------------------------

/**
 * Serialize audit filters into a stable, URL-safe representation.
 * Only non-empty values are included (except pagination fields).
 *
 * This function is deterministic — same input always produces the same output.
 */
export function serializeAuditFilters(
  filters: AuditFilterInput,
): AuditFilterSerialized {
  const serialized: Partial<AuditFilterSerialized> = {};

  if (filters.actor && filters.actor.trim().length > 0) {
    serialized.actor = filters.actor.trim();
  }
  if (filters.actorUserId !== undefined && filters.actorUserId > 0) {
    serialized.actor_user_id = String(filters.actorUserId);
  }
  if (filters.action && filters.action.trim().length > 0) {
    serialized.action = filters.action.trim();
  }
  const objectType = filters.objectType ?? filters.entityType;
  if (objectType && objectType.trim().length > 0) {
    serialized.entity_type = objectType.trim();
    serialized.object_type = objectType.trim();
  }
  if (filters.entityId && filters.entityId.trim().length > 0) {
    serialized.entity_id = filters.entityId.trim();
  }
  if (filters.companyId !== undefined && filters.companyId > 0) {
    serialized.company_id = String(filters.companyId);
  }
  if (filters.outletId !== undefined && filters.outletId > 0) {
    serialized.outlet_id = String(filters.outletId);
  }
  if (filters.success !== undefined) {
    serialized.success = filters.success ? "1" : "0";
  }
  if (filters.startDate !== undefined && filters.startDate > 0) {
    serialized.from_ts = String(filters.startDate);
  }
  if (filters.endDate !== undefined && filters.endDate > 0) {
    serialized.to_ts = String(filters.endDate);
  }

  // Pagination: always include with defaults
  serialized.offset = String(Math.max(0, filters.offset ?? 0));
  serialized.limit = String(
    Math.min(
      AUDIT_MAX_PAGE_SIZE,
      Math.max(1, filters.limit ?? AUDIT_DEFAULT_PAGE_SIZE),
    ),
  );

  return serialized as AuditFilterSerialized;
}

/**
 * Normalize audit filters to ensure consistent internal representation.
 * This fills in defaults and clamps values to valid ranges.
 */
export function normalizeAuditFilters(filters: Partial<AuditFilterInput>): AuditFilterInput {
  return {
    actor: filters.actor?.trim() || undefined,
    actorUserId: filters.actorUserId && filters.actorUserId > 0 ? filters.actorUserId : undefined,
    action: filters.action?.trim() || undefined,
    entityType: filters.entityType?.trim() || filters.objectType?.trim() || undefined,
    objectType: filters.objectType?.trim() || filters.entityType?.trim() || undefined,
    entityId: filters.entityId?.trim() || undefined,
    companyId: filters.companyId && filters.companyId > 0 ? filters.companyId : undefined,
    outletId: filters.outletId && filters.outletId > 0 ? filters.outletId : undefined,
    success: filters.success,
    startDate: filters.startDate && filters.startDate > 0 ? filters.startDate : undefined,
    endDate: filters.endDate && filters.endDate > 0 ? filters.endDate : undefined,
    offset: Math.max(0, filters.offset ?? 0),
    limit: Math.min(
      AUDIT_MAX_PAGE_SIZE,
      Math.max(1, filters.limit ?? AUDIT_DEFAULT_PAGE_SIZE),
    ),
  };
}

/**
 * Check if audit filters have any active filters (beyond pagination defaults).
 */
export function hasActiveAuditFilters(filters: AuditFilterInput): boolean {
  return !!(
    filters.actor ||
    filters.actorUserId ||
    filters.action ||
    filters.entityType ||
    filters.objectType ||
    filters.entityId ||
    filters.companyId ||
    filters.outletId ||
    filters.success !== undefined ||
    filters.startDate ||
    filters.endDate
  );
}

/**
 * Count how many non-pagination filters are active.
 */
export function countActiveAuditFilters(filters: AuditFilterInput): number {
  let count = 0;
  if (filters.actor) count++;
  if (filters.actorUserId) count++;
  if (filters.action) count++;
  if (filters.entityType || filters.objectType) count++;
  if (filters.entityId) count++;
  if (filters.companyId) count++;
  if (filters.outletId) count++;
  if (filters.success !== undefined) count++;
  if (filters.startDate) count++;
  if (filters.endDate) count++;
  return count;
}

// ---------------------------------------------------------------------------
// Date range conversion (half-open intervals)
// ---------------------------------------------------------------------------

/**
 * Convert a local date string (YYYY-MM-DD) to epoch milliseconds at UTC midnight
 * using safe, timezone-aware construction.
 *
 * Per canonical policy:
 * - Business logic operates on epoch milliseconds.
 * - Half-open intervals: col >= startUTC AND col < nextDayUTC.
 * - No manual ISO string slicing.
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Epoch milliseconds for UTC midnight of that date
 */
export function dateStringToEpochMs(dateString: string): number {
  // Validate format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return 0;
  }

  try {
    // Audit explorer filters use documented UTC day boundaries because audit
    // timestamps are absolute system events, not tenant business-date cutoffs.
    return dateOnlyToTimestampMs(dateString, "UTC");
  } catch {
    return 0;
  }
}

/**
 * Get the next UTC day as epoch milliseconds.
 * For half-open intervals: [startEpochMs, endEpochMs)
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Epoch milliseconds for UTC midnight of the next day
 */
export function nextDayEpochMs(dateString: string): number {
  const start = dateStringToEpochMs(dateString);
  if (start === 0) return 0;
  return start + 86_400_000; // +24 hours in milliseconds
}

/**
 * Build a half-open date range filter from two date strings.
 *
 * @param startDate - Start date (YYYY-MM-DD, inclusive)
 * @param endDate - End date (YYYY-MM-DD, exclusive half-open boundary)
 * @returns { startMs, endMs } epoch millisecond range
 */
export function buildHalfOpenDateRange(
  startDate: string,
  endDate: string,
): { startMs: number; endMs: number } {
  return {
    startMs: dateStringToEpochMs(startDate),
    endMs: nextDayEpochMs(endDate),
  };
}

/**
 * Validate a date range is logically consistent.
 * startDate must be <= endDate (same day is valid).
 */
export function isValidDateRange(startDate: string, endDate: string): boolean {
  const startMs = dateStringToEpochMs(startDate);
  const endMs = nextDayEpochMs(endDate);
  return startMs > 0 && endMs > 0 && startMs <= endMs;
}

// ---------------------------------------------------------------------------
// Canonical audit field helpers (success, NOT result)
// ---------------------------------------------------------------------------

/**
 * Build URL search params for an audit log request.
 * Uses `success` field, not `result` (per canonical policy).
 *
 * @param filters - Normalized audit filters
 */
export function buildAuditSearchParams(
  filters: AuditFilterInput,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("limit", String(filters.limit ?? AUDIT_DEFAULT_PAGE_SIZE));
  params.set("offset", String(filters.offset ?? 0));

  if (filters.actor) params.set("actor", filters.actor);
  if (filters.actorUserId && filters.actorUserId > 0) params.set("actor_user_id", String(filters.actorUserId));
  if (filters.action) params.set("action", filters.action);
  const objectType = filters.objectType ?? filters.entityType;
  if (objectType) params.set("entity_type", objectType);
  if (filters.entityId) params.set("entity_id", filters.entityId);
  if (filters.outletId && filters.outletId > 0) params.set("outlet_id", String(filters.outletId));
  if (filters.success !== undefined) {
    params.set("success", filters.success ? "1" : "0");
  }
  if (filters.startDate && filters.startDate > 0) {
    params.set("from_ts", String(filters.startDate));
  }
  if (filters.endDate && filters.endDate > 0) {
    params.set("to_ts", String(filters.endDate));
  }

  return params;
}

// ---------------------------------------------------------------------------
// Diff rendering helpers
// ---------------------------------------------------------------------------

export type AuditDiffValue = string | number | boolean | null | Record<string, unknown> | unknown[] | undefined;

export interface AuditDiffRow {
  field: string;
  before: AuditDiffValue;
  after: AuditDiffValue;
  changed: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

export function parseAuditJsonObject(value: string | null | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

export function buildAuditDiffRows(changesJson: string | null | undefined): AuditDiffRow[] {
  const parsed = parseAuditJsonObject(changesJson);
  const before = asRecord(parsed?.before) ?? {};
  const after = asRecord(parsed?.after) ?? {};
  const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();

  return fields.map((field) => {
    const beforeValue = before[field] as AuditDiffValue;
    const afterValue = after[field] as AuditDiffValue;
    return {
      field,
      before: beforeValue,
      after: afterValue,
      changed: JSON.stringify(beforeValue) !== JSON.stringify(afterValue),
    };
  });
}

export function formatAuditDiffValue(value: AuditDiffValue): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
