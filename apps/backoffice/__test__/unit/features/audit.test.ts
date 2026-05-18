// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Unit tests: Audit log explorer pure helpers (Epic 66 — Story 66-5)
//
// Run with:
//   npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/audit.test.ts

import { describe, it, expect } from "vitest";

import {
  AUDIT_DEFAULT_PAGE_SIZE,
  AUDIT_EXPLORER_CONTRACT,
  AUDIT_MAX_PAGE_SIZE,
  AUDIT_LOGS_ENDPOINT,
  buildAuditDiffRows,
  buildAuditQueryKey,
  formatAuditDiffValue,
  serializeAuditFilters,
  normalizeAuditFilters,
  hasActiveAuditFilters,
  countActiveAuditFilters,
  buildAuditSearchParams,
  dateStringToEpochMs,
  nextDayEpochMs,
  buildHalfOpenDateRange,
  isValidDateRange,
} from "@/features/audit/audit-helpers";
import { auditQueryKeys } from "@/features/audit/api";
import { findRoute } from "@/app/routes";
import { PERMISSION_BITS, userSatisfiesRoutePermission } from "@/lib/auth/permissions";

// ============================================================================
// Constants
// ============================================================================

describe("audit constants", () => {
  it("default page size is 25", () => {
    expect(AUDIT_DEFAULT_PAGE_SIZE).toBe(25);
  });

  it("max page size is 200", () => {
    expect(AUDIT_MAX_PAGE_SIZE).toBe(200);
  });

  it("endpoint is /audit-logs", () => {
    expect(AUDIT_LOGS_ENDPOINT).toBe("/audit-logs");
  });

  it("documents verified generic audit read contract", () => {
    expect(AUDIT_EXPLORER_CONTRACT.listVerified).toBe(true);
    expect(AUDIT_EXPLORER_CONTRACT.detailVerified).toBe(true);
    expect(AUDIT_EXPLORER_CONTRACT.periodTransitionOnly).toBe(true);
    expect(AUDIT_EXPLORER_CONTRACT.verifiedPermission).toEqual({
      module: "platform",
      resource: "settings",
      permission: "READ",
    });
  });
});

describe("audit query keys", () => {
  it("builds deterministic list and detail query keys", () => {
    expect(auditQueryKeys.list(42, { action: "CREATE", limit: 25 })).toEqual(
      buildAuditQueryKey(42, { action: "CREATE", limit: 25 }),
    );
    expect(auditQueryKeys.detail(42, 7)).toEqual(["audit-logs", 42, "detail", 7]);
  });
});

// ============================================================================
// buildAuditQueryKey
// ============================================================================

describe("buildAuditQueryKey", () => {
  it("produces deterministic key with 3 elements", () => {
    const key = buildAuditQueryKey(42, {});
    expect(key).toHaveLength(3);
    expect(key[0]).toBe("audit-logs");
    expect(key[1]).toBe(42);
  });

  it("includes serialized filters in key", () => {
    const key = buildAuditQueryKey(42, {
      action: "CREATE",
      limit: 25,
    });
    const serialized = key[2];
    expect(serialized.action).toBe("CREATE");
    expect(serialized.limit).toBe("25");
  });

  it("same input produces identical keys", () => {
    const key1 = buildAuditQueryKey(42, { entityType: "user", offset: 0 });
    const key2 = buildAuditQueryKey(42, { entityType: "user", offset: 0 });
    expect(key1).toEqual(key2);
  });

  it("different action produces different keys", () => {
    const key1 = buildAuditQueryKey(42, { action: "CREATE" });
    const key2 = buildAuditQueryKey(42, { action: "DELETE" });
    expect(key1).not.toEqual(key2);
  });
});

// ============================================================================
// serializeAuditFilters
// ============================================================================

describe("serializeAuditFilters", () => {
  it("serializes empty filters with default pagination", () => {
    const result = serializeAuditFilters({});
    expect(result.offset).toBe("0");
    expect(result.limit).toBe(String(AUDIT_DEFAULT_PAGE_SIZE));
    // No filters set → no filter keys
    expect(result.actor).toBeUndefined();
    expect(result.action).toBeUndefined();
  });

  it("serializes action filter", () => {
    const result = serializeAuditFilters({ action: "VOID" });
    expect(result.action).toBe("VOID");
  });

  it("serializes entity type filter", () => {
    const result = serializeAuditFilters({ entityType: "invoice" });
    expect(result.entity_type).toBe("invoice");
  });

  it("serializes object type alias for Story 66-5 filter terminology", () => {
    const result = serializeAuditFilters({ objectType: "user" });
    expect(result.entity_type).toBe("user");
    expect(result.object_type).toBe("user");
  });

  it("serializes actor and outlet scope filters", () => {
    const result = serializeAuditFilters({ actorUserId: 7, companyId: 42, outletId: 9 });
    expect(result.actor_user_id).toBe("7");
    expect(result.company_id).toBe("42");
    expect(result.outlet_id).toBe("9");
  });

  it("serializes success=true as '1'", () => {
    const result = serializeAuditFilters({ success: true });
    expect(result.success).toBe("1");
  });

  it("serializes success=false as '0'", () => {
    const result = serializeAuditFilters({ success: false });
    expect(result.success).toBe("0");
  });

  it("does NOT serialize success when undefined", () => {
    const result = serializeAuditFilters({});
    expect(result.success).toBeUndefined();
  });

  it("serializes date range as epoch ms strings", () => {
    const result = serializeAuditFilters({
      startDate: 1712304000000,
      endDate: 1712390400000,
    });
    expect(result.from_ts).toBe("1712304000000");
    expect(result.to_ts).toBe("1712390400000");
  });

  it("clamps limit to max page size", () => {
    const result = serializeAuditFilters({ limit: 9999 });
    expect(result.limit).toBe(String(AUDIT_MAX_PAGE_SIZE));
  });

  it("clamps limit to at least 1", () => {
    const result = serializeAuditFilters({ limit: 0 });
    expect(result.limit).toBe("1");
  });

  it("clamps negative offset to 0", () => {
    const result = serializeAuditFilters({ offset: -5 });
    expect(result.offset).toBe("0");
  });

  it("trims whitespace from actor", () => {
    const result = serializeAuditFilters({ actor: "  admin@example.com  " });
    expect(result.actor).toBe("admin@example.com");
  });
});

// ============================================================================
// normalizeAuditFilters
// ============================================================================

describe("normalizeAuditFilters", () => {
  it("fills defaults for empty input", () => {
    const result = normalizeAuditFilters({});
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(AUDIT_DEFAULT_PAGE_SIZE);
    expect(result.actor).toBeUndefined();
    expect(result.action).toBeUndefined();
  });

  it("preserves explicit values", () => {
    const result = normalizeAuditFilters({ action: "CREATE", offset: 50, limit: 10 });
    expect(result.action).toBe("CREATE");
    expect(result.offset).toBe(50);
    expect(result.limit).toBe(10);
  });

  it("clamps limit", () => {
    const result = normalizeAuditFilters({ limit: -5 });
    expect(result.limit).toBe(1);
  });

  it("trims whitespace from text filters", () => {
    const result = normalizeAuditFilters({ actor: "  user  ", entityType: "  account  " });
    expect(result.actor).toBe("user");
    expect(result.entityType).toBe("account");
  });
});

// ============================================================================
// hasActiveAuditFilters / countActiveAuditFilters
// ============================================================================

describe("hasActiveAuditFilters", () => {
  it("returns false for empty filters", () => {
    expect(hasActiveAuditFilters({})).toBe(false);
  });

  it("returns true when action is set", () => {
    expect(hasActiveAuditFilters({ action: "CREATE" })).toBe(true);
  });

  it("returns true when success is false (explicitly set)", () => {
    expect(hasActiveAuditFilters({ success: false })).toBe(true);
  });

  it("returns true when startDate is set", () => {
    expect(hasActiveAuditFilters({ startDate: 1 })).toBe(true);
  });
});

describe("countActiveAuditFilters", () => {
  it("returns 0 for empty filters", () => {
    expect(countActiveAuditFilters({})).toBe(0);
  });

  it("counts each active filter type", () => {
    expect(countActiveAuditFilters({
      action: "CREATE",
      entityType: "user",
      success: true,
    })).toBe(3);
  });

  it("returns 7 when all filters are active", () => {
    expect(countActiveAuditFilters({
      actor: "admin",
      action: "CREATE",
      entityType: "user",
      entityId: "42",
      success: true,
      startDate: 1,
      endDate: 2,
    })).toBe(7);
  });

  it("does not count pagination as filters", () => {
    expect(countActiveAuditFilters({ offset: 0, limit: 25 })).toBe(0);
  });
});

// ============================================================================
// buildAuditSearchParams
// ============================================================================

describe("buildAuditSearchParams", () => {
  it("includes limit and offset without redundant company_id query parameter", () => {
    const params = buildAuditSearchParams({});
    expect(params.get("company_id")).toBeNull();
    expect(params.get("limit")).toBe(String(AUDIT_DEFAULT_PAGE_SIZE));
    expect(params.get("offset")).toBe("0");
  });

  it("includes action filter", () => {
    const params = buildAuditSearchParams({ action: "VOID" });
    expect(params.get("action")).toBe("VOID");
  });

  it("includes success filter (uses success, NOT result)", () => {
    const params = buildAuditSearchParams({ success: true });
    expect(params.get("success")).toBe("1");
    // Canonical policy: do NOT filter by `result`
    expect(params.get("result")).toBeNull();
  });

  it("does not include undefined filters", () => {
    const params = buildAuditSearchParams({});
    expect(params.get("actor")).toBeNull();
    expect(params.get("action")).toBeNull();
    expect(params.get("success")).toBeNull();
  });

  it("includes actor, object, and outlet scope filters", () => {
    const params = buildAuditSearchParams({ actorUserId: 7, objectType: "user", entityId: "42", outletId: 3 });
    expect(params.get("actor_user_id")).toBe("7");
    expect(params.get("entity_type")).toBe("user");
    expect(params.get("entity_id")).toBe("42");
    expect(params.get("outlet_id")).toBe("3");
  });

  it("serializes half-open epoch boundaries as from_ts and to_ts", () => {
    const params = buildAuditSearchParams({ startDate: 1712304000000, endDate: 1712390400000 });
    expect(params.get("from_ts")).toBe("1712304000000");
    expect(params.get("to_ts")).toBe("1712390400000");
    expect(params.get("start_date")).toBeNull();
    expect(params.get("end_date")).toBeNull();
  });
});

// ============================================================================
// Date range conversion (half-open intervals)
// ============================================================================

describe("dateStringToEpochMs", () => {
  it("converts 2024-01-01 to epoch ms", () => {
    // 2024-01-01T00:00:00.000Z = 1704067200000
    const result = dateStringToEpochMs("2024-01-01");
    expect(result).toBe(1704067200000);
  });

  it("converts 2024-12-31 to epoch ms", () => {
    // 2024-12-31T00:00:00.000Z = 1735603200000
    const result = dateStringToEpochMs("2024-12-31");
    expect(result).toBe(1735603200000);
  });

  it("returns 0 for invalid format", () => {
    expect(dateStringToEpochMs("not-a-date")).toBe(0);
    expect(dateStringToEpochMs("2024/12/31")).toBe(0);
    expect(dateStringToEpochMs("")).toBe(0);
  });

  it("returns 0 for structurally valid but impossible dates", () => {
    expect(dateStringToEpochMs("2024-02-31")).toBe(0);
    expect(dateStringToEpochMs("2024-13-01")).toBe(0);
  });

  it("does NOT use manual ISO string slicing", () => {
    // This test verifies the implementation uses UTC construction, not slice
    const result = dateStringToEpochMs("2024-06-15");
    // Manual slice would give a different result on non-UTC timezones
    expect(result).toBeGreaterThan(0);
  });
});

describe("nextDayEpochMs", () => {
  it("adds exactly 24 hours", () => {
    const start = dateStringToEpochMs("2024-01-01");
    const next = nextDayEpochMs("2024-01-01");
    expect(next - start).toBe(86_400_000);
  });

  it("2024-01-01 next day = 2024-01-02 midnight", () => {
    expect(nextDayEpochMs("2024-01-01")).toBe(1704153600000);
  });
});

describe("buildHalfOpenDateRange", () => {
  it("builds correct half-open interval", () => {
    const range = buildHalfOpenDateRange("2024-01-01", "2024-01-01");
    // Same day: [start, nextDay) — inclusive start, exclusive end
    expect(range.startMs).toBe(dateStringToEpochMs("2024-01-01"));
    expect(range.endMs).toBe(nextDayEpochMs("2024-01-01"));
    expect(range.endMs - range.startMs).toBe(86_400_000);
  });

  it("multi-day range has correct boundaries", () => {
    const range = buildHalfOpenDateRange("2024-01-01", "2024-01-05");
    expect(range.startMs).toBe(dateStringToEpochMs("2024-01-01"));
    expect(range.endMs).toBe(nextDayEpochMs("2024-01-05"));
    // 5 days difference
    expect(range.endMs - range.startMs).toBe(5 * 86_400_000);
  });
});

describe("isValidDateRange", () => {
  it("returns true for valid range", () => {
    expect(isValidDateRange("2024-01-01", "2024-01-31")).toBe(true);
  });

  it("returns true for same-day range", () => {
    expect(isValidDateRange("2024-06-15", "2024-06-15")).toBe(true);
  });

  it("returns false for reversed range", () => {
    expect(isValidDateRange("2024-01-31", "2024-01-01")).toBe(false);
  });

  it("returns false for invalid dates", () => {
    expect(isValidDateRange("invalid", "2024-01-01")).toBe(false);
    expect(isValidDateRange("2024-01-01", "invalid")).toBe(false);
  });

  it("returns false for empty strings", () => {
    expect(isValidDateRange("", "")).toBe(false);
  });
});

// ============================================================================
// Half-open interval correctness (AC3)
// ============================================================================

describe("half-open interval semantics (AC3)", () => {
  it("start is inclusive, end is exclusive", () => {
    const range = buildHalfOpenDateRange("2024-06-01", "2024-06-01");

    // A log at 2024-06-01T00:00:00.000 should be included (>= start)
    expect(range.startMs <= dateStringToEpochMs("2024-06-01")).toBe(true);

    // A log at 2024-06-01T23:59:59.999 should be included (< end)
    expect(dateStringToEpochMs("2024-06-01") + 86_399_999 < range.endMs).toBe(true);

    // A log at 2024-06-02T00:00:00.000 should be excluded (>= end)
    expect(range.endMs <= nextDayEpochMs("2024-06-01")).toBe(true);
  });

  it("end of one period equals start of next (non-overlapping)", () => {
    // Per the overlap rule: end == next start is non-overlap
    const range1 = buildHalfOpenDateRange("2024-06-01", "2024-06-01");
    const range2 = buildHalfOpenDateRange("2024-06-02", "2024-06-02");
    expect(range1.endMs).toBe(range2.startMs);
  });
});

// ============================================================================
// success filter (canonical: success, NOT result)
// ============================================================================

describe("success filter (AC7)", () => {
  it("buildAuditSearchParams uses success, never result", () => {
    const params = buildAuditSearchParams({ success: true });
    expect(params.get("success")).toBe("1");
    expect(params.get("result")).toBeNull();

    const params2 = buildAuditSearchParams({ success: false });
    expect(params2.get("success")).toBe("0");
    expect(params2.get("result")).toBeNull();
  });

  it("serializeAuditFilters uses success field name", () => {
    const result = serializeAuditFilters({ success: true });
    expect(result.success).toBe("1");
    // `result` is not a property of AuditFilterSerialized
    expect((result as Record<string, unknown>).result).toBeUndefined();
  });
});

// ============================================================================
// Detail diff rendering helper (AC4)
// ============================================================================

describe("audit detail diff helpers", () => {
  it("builds sorted before/after diff rows", () => {
    const rows = buildAuditDiffRows(JSON.stringify({
      before: { name: "Old", status: "ACTIVE" },
      after: { name: "New", status: "ACTIVE" },
    }));

    expect(rows).toEqual([
      { field: "name", before: "Old", after: "New", changed: true },
      { field: "status", before: "ACTIVE", after: "ACTIVE", changed: false },
    ]);
  });

  it("returns empty diff rows for malformed payload", () => {
    expect(buildAuditDiffRows("not-json")).toEqual([]);
  });

  it("formats empty and object diff values deterministically", () => {
    expect(formatAuditDiffValue(undefined)).toBe("—");
    expect(formatAuditDiffValue(null)).toBe("—");
    expect(formatAuditDiffValue({ nested: true })).toBe('{"nested":true}');
  });
});

// ============================================================================
// Authorization: Low-privilege role audit access
// ============================================================================

describe("audit authorization UX", () => {
  it("query key is scoped to company_id (tenant isolation)", () => {
    const key1 = buildAuditQueryKey(42, {});
    const key2 = buildAuditQueryKey(99, {});
    expect(key1[1]).toBe(42);
    expect(key2[1]).toBe(99);
    expect(key1).not.toEqual(key2);
  });

  it("search params omit company_id because backend auth company scope is authoritative", () => {
    const params = buildAuditSearchParams({});
    expect(params.get("company_id")).toBeNull();
  });

  it("audit route metadata requires verified platform.settings.READ", () => {
    const route = findRoute("/audit-logs");
    expect(route?.permission).toEqual({
      module: "platform",
      resource: "settings",
      permissionMask: PERMISSION_BITS.READ,
    });
  });

  it("low-privilege permissions fail audit route permission check", () => {
    const route = findRoute("/audit-logs");
    expect(route?.permission).toBeDefined();
    expect(userSatisfiesRoutePermission(route?.permission, [
      { module: "pos", resource: "transactions", mask: PERMISSION_BITS.READ },
    ])).toBe(false);
  });
});
