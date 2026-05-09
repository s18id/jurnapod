# Story 60.4: Audit Log Filter Correctness

**Status:** review

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 60 --story 60-4 --status done --title audit-log-filter-correctness`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As an **observability engineer**,  
I want **all audit log queries to filter by the correct field (`success`, not `result`)**,  
So that **audit log reports are accurate and reflect actual operation outcomes**.

## Context

- Source: Epic 60
- Depends on: Story 60.1 (scoping audit)
- Scope: Audit all audit log queries across the codebase — verify they use `success` boolean field, not `result` string field
- Risk: P1 — incorrect field usage produces inaccurate audit reports

## Background

Per AGENTS.md and project invariants, audit logs are canonical:
- **Correct field:** `success` (BOOLEAN) — `true` for successful operations, `false` for failed operations
- **Incorrect field:** `result` (VARCHAR) — legacy field that must NOT be used for filtering

The canonical query pattern for audit logs MUST use:
```sql
WHERE success = true  -- successful operations
WHERE success = false -- failed operations
```

Queries using `WHERE result = 'SUCCESS'` or similar are incorrect and MUST be flagged for correction.

---

## Acceptance Criteria

**AC1: Audit log queries use `success` field**  
**Given** any query against `audit_logs` table,  
**When** the query filters for successful operations,  
**Then** the query MUST use `success = true` — NOT `result = 'SUCCESS'` or any variant.

**AC2: Audit log queries do not use `result` field for filtering**  
**Given** any query against `audit_logs` table,  
**When** the query filters for operation outcome,  
**Then** the query MUST NOT reference the `result` column.

**AC3: Audit log route handlers return correct shape**  
**Given** a GET request to audit log endpoints,  
**When** the response is returned,  
**Then** the `success` field is present and correctly typed as boolean in the response shape.

**AC4: Audit log negative tests verify field correctness**  
**Given** a test that verifies audit log filtering behavior,  
**When** the test runs,  
**Then** it MUST verify `success` field filtering works correctly and `result` field is not used.

---

## Tasks / Subtasks

- [x] Audit all `audit_logs` queries in `apps/api/src/lib/` for correct field usage
- [x] Audit all `audit_logs` queries in `apps/api/src/routes/` for correct field usage
- [x] Audit all `audit_logs` queries in `packages/modules-*/` for correct field usage
- [x] Fix any queries using `result` instead of `success`
- [x] Add integration tests verifying audit log field correctness
- [x] Document findings in story completion report

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/audit/audit-log-filter.test.ts` | **Created** | Audit log field correctness tests (9 tests) |
| `packages/auth/src/lib/client.ts` | **Fixed** (line 239) | Added missing `success` column to login audit INSERT |
| `apps/api/src/lib/**/*.ts` | Audited | 8 files, all INSERT/DELETE only — no filtering queries |
| `apps/api/src/routes/**/*.ts` | Audited | 0 files with direct `audit_logs` references |
| `packages/modules-*/src/**/*.ts` | Audited | 15 files across 7 packages — all correct or INSERT-only |

---

## Risk Level

P1 — incorrect audit log filtering produces inaccurate observability data.

---

_Last Updated: 2026-05-09_

---

## Dev Agent Record

### Audit Summary

**Total `audit_logs` queries found across codebase:** ~34 references in 23 files

| Area | Files | Queries Filtering | `success` | `result` | Notes |
|------|-------|-------------------|-----------|----------|-------|
| `apps/api/src/lib/` | 8 | 0 | N/A | N/A | All INSERT/DELETE only |
| `apps/api/src/routes/` | 0 | 0 | N/A | N/A | Routes delegate to services |
| `packages/modules-platform` | 4 | 1 (period-transition.ts) | ✅ `success = 1` | N/A | `query.ts` exports both fields but doesn't filter |
| `packages/modules-inventory` | 5 | 0 | N/A | N/A | INSERT only, hardcoded `success: 1` |
| `packages/modules-purchasing` | 1 | 0 | N/A | N/A | INSERT only |
| `packages/auth` | 1 | 0 | **❌ FIXED** | N/A | Missing `success` column in INSERT (now fixed) |
| `packages/pos-sync` | 1 | 0 | N/A | N/A | INSERT for duplicates, `success: 0` |
| `packages/backoffice-sync` | 2 | 1 (backoffice-data-service.ts) | ✅ `success = 0` | N/A | System alerts for failed ops |
| `packages/sync-core` | 1 | 0 | N/A | N/A | TODO comments only |

### Gap Table

| File | Line | Issue | Severity | Status |
|------|------|-------|----------|--------|
| `packages/auth/src/lib/client.ts` | 239 | `recordLogin()` INSERT missing `success` column | P1 | **FIXED** — Added `success: record.result === "SUCCESS" ? 1 : 0` |

### Key Findings

1. **✅ No queries filter by `result`** — All filtering exclusively uses the canonical `success` boolean field
2. **✅ `success` field correctly used in filtering**: `period-transition.ts` filters `success = 1`, `backoffice-data-service.ts` filters `success = 0`
3. **❌ One P1 gap found and fixed**: `packages/auth/src/lib/client.ts` was not setting the `success` column on login audit INSERTs, leaving it `NULL`/default
4. **✅ `normalizeAuditLog()` correctly normalizes** `success` from `1`/`0` to `true`/`false` boolean
5. **✅ INSERT operations consistently set both** `result` (varchar) and `success` (boolean) columns

### Test Results

```
 ✓ __test__/integration/audit/audit-log-filter.test.ts (9 tests) 337ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
```

### Files Modified/Created

| File | Action |
|------|--------|
| `apps/api/__test__/integration/audit/audit-log-filter.test.ts` | **Created** |
| `packages/auth/src/lib/client.ts` | **Fixed** (added `success` column) |

### Change Log

- 2026-05-09: Completed full audit of all `audit_logs` references (23 files, 34 refs)
- 2026-05-09: Fixed P1: `packages/auth/src/lib/client.ts` — added missing `success` column to login audit INSERT
- 2026-05-09: Created `audit-log-filter.test.ts` — 9 integration tests covering AC1-AC4
- 2026-05-09: All 9 tests passing; typecheck clean on modified files
